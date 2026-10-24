const crypto = require("crypto");

const SCRYPT_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

async function hashPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("La contraseña no puede estar vacía.");
  }
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt);
  return `${SCRYPT_PREFIX}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function isHashed(stored) {
  return typeof stored === "string" && stored.startsWith(`${SCRYPT_PREFIX}$`);
}

/**
 * Compara una contraseña con el valor almacenado.
 * Soporta el formato scrypt nuevo y, temporalmente, contraseñas legadas en
 * texto plano para migrarlas en el primer inicio de sesión correcto.
 */
async function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") {
    return { ok: false, needsRehash: false };
  }

  if (!isHashed(stored)) {
    const a = Buffer.from(password);
    const b = Buffer.from(stored);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, needsRehash: ok };
  }

  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return { ok: false, needsRehash: false };

  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scrypt(password, Buffer.from(saltHex, "hex"));
    const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    return { ok, needsRehash: false };
  } catch (_err) {
    return { ok: false, needsRehash: false };
  }
}

module.exports = { hashPassword, verifyPassword, isHashed };

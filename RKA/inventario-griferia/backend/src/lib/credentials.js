const crypto = require("crypto");

/**
 * Cifra en reposo la contraseña visible para el panel administrativo.
 * La clave se deriva de CREDENTIALS_KEY o, si no existe, de DB_PASSWORD.
 * No se usa para autenticar: el login sigue validando el hash scrypt.
 */
const SECRET =
  process.env.CREDENTIALS_KEY ||
  process.env.DB_PASSWORD ||
  "rkal-credenciales-locales";

const KEY = crypto.createHash("sha256").update(String(SECRET)).digest();
const VERSION = "v1";

function cifrarCredencial(valor) {
  const texto = String(valor || "");
  if (!texto) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("hex"), tag.toString("hex"), cifrado.toString("hex")].join(":");
}

function descifrarCredencial(valor) {
  try {
    const partes = String(valor || "").split(":");
    if (partes.length !== 4 || partes[0] !== VERSION) return "";
    const [, ivHex, tagHex, datosHex] = partes;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      KEY,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const texto = Buffer.concat([
      decipher.update(Buffer.from(datosHex, "hex")),
      decipher.final(),
    ]);
    return texto.toString("utf8");
  } catch (_err) {
    return "";
  }
}

module.exports = { cifrarCredencial, descifrarCredencial };

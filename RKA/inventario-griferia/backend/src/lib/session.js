const crypto = require("crypto");
const pool = require("../config/db");

const COOKIE_NAME = "rkal_session";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseCookies(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_err) {
      cookies[key] = value;
    }
  }
  return cookies;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function cookieOptions(req, maxAgeMs) {
  const secure =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

async function createSession(req, res, idUsuario, recordar = false) {
  const token = crypto.randomBytes(32).toString("hex");
  const ttl = recordar ? 30 * DAY_MS : 24 * 60 * 60 * 1000;
  const expira = new Date(Date.now() + ttl);
  const ip = req.ip || null;
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 300);

  await pool.query("DELETE FROM sesiones WHERE expira_en < now()");
  await pool.query(
    `INSERT INTO sesiones (token_hash, id_usuario, expira_en, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), idUsuario, expira, ip, userAgent]
  );

  res.cookie(COOKIE_NAME, token, cookieOptions(req, ttl));
  return { token, expira };
}

async function getSession(req) {
  const token = parseCookies(req.headers.cookie || "")[COOKIE_NAME];
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT s.id_sesion, s.expira_en, s.id_usuario,
            u.nombres, u.apellidos, u.usuario_login, u.correo,
            u.estado AS usuario_estado, u.id_rol,
            r.nombre_rol, r.codigo AS rol_codigo, r.estado AS rol_estado
       FROM sesiones s
       JOIN usuarios u ON u.id_usuario = s.id_usuario
       LEFT JOIN roles r ON r.id_rol = u.id_rol
      WHERE s.token_hash = $1
      LIMIT 1`,
    [hashToken(token)]
  );

  const row = rows[0];
  if (!row) return null;

  if (new Date(row.expira_en).getTime() <= Date.now()) {
    await pool.query("DELETE FROM sesiones WHERE id_sesion = $1", [row.id_sesion]);
    return null;
  }

  if (!row.usuario_estado || row.usuario_estado !== "activo") return null;
  if (!row.rol_estado || row.rol_estado !== "activo") return null;

  return {
    idSesion: row.id_sesion,
    idUsuario: row.id_usuario,
    idRol: row.id_rol,
    nombres: row.nombres || "",
    apellidos: row.apellidos || "",
    usuario: row.usuario_login || "",
    correo: row.correo || "",
    rol: row.nombre_rol || "",
    rolCodigo: row.rol_codigo || "",
  };
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie || "")[COOKIE_NAME];
  if (token) {
    await pool.query("DELETE FROM sesiones WHERE token_hash = $1", [hashToken(token)]);
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

async function destroyUserSessions(idUsuario) {
  await pool.query("DELETE FROM sesiones WHERE id_usuario = $1", [idUsuario]);
}

module.exports = {
  COOKIE_NAME,
  createSession,
  getSession,
  destroySession,
  destroyUserSessions,
};

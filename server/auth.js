import crypto from "node:crypto";
import { q, uid, now, seedCategories } from "./db.js";

const SECRET =
  process.env.SOCHI_SECRET ||
  (() => {
    console.warn("[auth] SOCHI_SECRET chưa đặt — dùng khóa tạm, phiên đăng nhập sẽ mất khi restart");
    return crypto.randomBytes(32).toString("hex");
  })();

const TOKEN_DAYS = 60;

/* ---------- mật khẩu ---------- */

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, salt, expected) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- JWT HS256 ---------- */

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

export function issueToken(userId) {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    sub: userId,
    iat: Math.floor(now() / 1000),
    exp: Math.floor(now() / 1000) + TOKEN_DAYS * 86400,
  });
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = sign(body);
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp * 1000 < now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/* ---------- tài khoản ---------- */

export function createUser(username, password) {
  const clean = String(username || "").trim().toLowerCase();
  if (clean.length < 3) throw new Error("Tên đăng nhập tối thiểu 3 ký tự");
  if (String(password || "").length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
  if (q.get("SELECT id FROM users WHERE username = ?", clean)) {
    throw new Error("Tên đăng nhập đã tồn tại");
  }
  const { hash, salt } = hashPassword(password);
  const id = uid();
  q.run(
    "INSERT INTO users (id,username,pass_hash,salt,created_at) VALUES (?,?,?,?,?)",
    id, clean, hash, salt, now()
  );
  seedCategories(id);
  return id;
}

export function login(username, password) {
  const clean = String(username || "").trim().toLowerCase();
  const user = q.get("SELECT * FROM users WHERE username = ?", clean);
  if (!user) return null;
  if (!verifyPassword(password, user.salt, user.pass_hash)) return null;
  return { id: user.id, username: user.username, token: issueToken(user.id) };
}

export const userCount = () => q.get("SELECT COUNT(*) AS n FROM users").n;

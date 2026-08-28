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

/* ==================== Khóa màn hình ==================== */

/**
 * Mã PIN mở khóa màn hình.
 *
 * Đây là lớp che mắt người ngồi cạnh, KHÔNG phải lớp bảo mật thật. Ai cầm được
 * máy đã đăng nhập vẫn có thể lấy token trong trình duyệt và gọi thẳng API.
 * Mục đích duy nhất là để người khác cầm điện thoại lên không đọc được ngay số
 * dư — đúng thứ người dùng cần khi để máy trên bàn.
 *
 * Vẫn băm bằng scrypt như mật khẩu chính. PIN chỉ 4-6 chữ số nên rất dễ dò,
 * nhưng băm chậm khiến việc dò trên dữ liệu lấy trộm tốn kém hơn nhiều so với
 * lưu thẳng, mà chi phí thì không đáng kể vì mỗi lần mở khóa chỉ băm một lần.
 */
const PIN_RE = /^\d{4,6}$/;
const MAX_SAI = 5;

export function setPin(userId, pin, currentPassword) {
  const user = q.get("SELECT * FROM users WHERE id=?", userId);
  if (!user) throw new Error("Không tìm thấy tài khoản");

  // Đổi hoặc gỡ PIN đều phải nhập mật khẩu chính. Nếu không, người cầm được
  // máy đang mở khóa chỉ cần vào cài đặt gỡ PIN là xong — khóa thành vô nghĩa.
  if (!verifyPassword(currentPassword, user.salt, user.pass_hash)) {
    throw new Error("Mật khẩu đăng nhập không đúng");
  }

  if (pin === null || pin === "") {
    q.run("DELETE FROM settings WHERE user_id=? AND key IN ('lock_pin_hash','lock_pin_salt','lock_fails')", userId);
    return { co_pin: false };
  }
  if (!PIN_RE.test(String(pin))) throw new Error("Mã PIN phải là 4 đến 6 chữ số");

  const { hash, salt } = hashPassword(String(pin));
  const put = (k, v) => q.run(
    "INSERT INTO settings (user_id,key,value) VALUES (?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
    userId, k, v
  );
  put("lock_pin_hash", hash);
  put("lock_pin_salt", salt);
  put("lock_fails", "0");
  return { co_pin: true };
}

export function hasPin(userId) {
  return !!q.get("SELECT value FROM settings WHERE user_id=? AND key='lock_pin_hash'", userId);
}

/**
 * Kiểm tra PIN khi mở khóa.
 *
 * Sai quá số lần cho phép thì báo phải đăng nhập lại bằng mật khẩu. Không có
 * bước này thì PIN bốn số dò hết trong vài phút.
 */
export function checkPin(userId, pin) {
  const row = (k) => {
    const r = q.get("SELECT value FROM settings WHERE user_id=? AND key=?", userId, k);
    return r ? r.value : null;
  };
  const hash = row("lock_pin_hash");
  const salt = row("lock_pin_salt");
  if (!hash || !salt) return { ok: true, khong_dat_pin: true };

  const fails = Number(row("lock_fails") || 0);
  if (fails >= MAX_SAI) {
    return { ok: false, khoa_cung: true, con_lai: 0 };
  }

  const setFails = (n) => q.run(
    "INSERT INTO settings (user_id,key,value) VALUES (?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
    userId, "lock_fails", String(n)
  );

  if (verifyPassword(String(pin || ""), salt, hash)) {
    setFails(0);
    return { ok: true };
  }
  const moi = fails + 1;
  setFails(moi);
  return { ok: false, khoa_cung: moi >= MAX_SAI, con_lai: Math.max(MAX_SAI - moi, 0) };
}

/** Mở khóa bằng mật khẩu chính — lối thoát khi quên PIN hoặc đã nhập sai quá nhiều. */
export function unlockByPassword(userId, password) {
  const user = q.get("SELECT * FROM users WHERE id=?", userId);
  if (!user || !verifyPassword(password, user.salt, user.pass_hash)) return false;
  q.run(
    "INSERT INTO settings (user_id,key,value) VALUES (?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
    userId, "lock_fails", "0"
  );
  return true;
}

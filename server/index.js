import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { q, uid, now } from "./db.js";
import { createUser, login, verifyToken, userCount } from "./auth.js";
import { readReceipt } from "./ocr.js";
import { ask as assistantAsk, insights as computeInsights } from "./assistant.js";
import { fetchPrices, applyLivePrices } from "./prices.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const ALLOW_REGISTER = process.env.ALLOW_REGISTER === "1";
const PROXY_SECRET = process.env.PROXY_SECRET || "";
const PORTFOLIO_PUSH_TOKEN = process.env.PORTFOLIO_PUSH_TOKEN || "";
const PORTFOLIO_USER = process.env.PORTFOLIO_USER || "";

/* ============================ tiện ích ============================ */

const json = (res, code, body) => {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
  });
  res.end(buf);
};

const int = (v) => Math.round(Number(v) || 0);
const str = (v, max = 200) => String(v ?? "").slice(0, max);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const todayISO = () => new Date().toISOString().slice(0, 10);

function readBody(req, limit = 9_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Nội dung quá lớn"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("JSON không hợp lệ"));
      }
    });
    req.on("error", reject);
  });
}

/* ============================ logic nghiệp vụ ============================ */

const MONTH_ADD = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
};

const DAY_ADD = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function advanceDue(iso, recurrence) {
  switch (recurrence) {
    case "weekly": return DAY_ADD(iso, 7);
    case "quarterly": return MONTH_ADD(iso, 3);
    case "yearly": return MONTH_ADD(iso, 12);
    case "once": return iso;
    default: return MONTH_ADD(iso, 1);
  }
}

/** Dư nợ thẻ = tổng chi tiêu ghi vào thẻ + số dư đầu kỳ − tổng đã thanh toán */
function cardBalance(userId, cardId) {
  const spent = q.get(
    "SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND card_id=?",
    userId, cardId
  ).s;
  const paid = q.get(
    "SELECT COALESCE(SUM(amount),0) AS s FROM card_payments WHERE user_id=? AND card_id=?",
    userId, cardId
  ).s;
  const card = q.get("SELECT opening FROM cards WHERE id=? AND user_id=?", cardId, userId);
  return spent + (card?.opening || 0) - paid;
}

function cardsWithBalance(userId) {
  return q.all("SELECT * FROM cards WHERE user_id=? ORDER BY created_at", userId).map((c) => {
    const balance = cardBalance(userId, c.id);
    return {
      ...c,
      balance,
      available: Math.max(0, c.limit_amount - balance),
      utilization: c.limit_amount > 0 ? balance / c.limit_amount : 0,
    };
  });
}

function billsWithStatus(userId) {
  const today = todayISO();
  return q.all("SELECT * FROM bills WHERE user_id=? ORDER BY next_due", userId).map((b) => {
    const daysLeft = Math.round(
      (new Date(b.next_due + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 86400000
    );
    return {
      ...b,
      days_left: daysLeft,
      status: !b.active ? "paused" : daysLeft < 0 ? "overdue" : daysLeft <= b.reminder_days ? "due_soon" : "upcoming",
    };
  });
}

/* ============================ router ============================ */

const routes = [];
const route = (method, pattern, handler, opts = {}) =>
  routes.push({ method, pattern, handler, auth: opts.auth !== false });

/* ---- xác thực ---- */

route("GET", "/api/status", () => ({ ok: true, needs_setup: userCount() === 0 }), { auth: false });

route("POST", "/api/auth/register", async (ctx) => {
  const first = userCount() === 0;
  if (!first && !ALLOW_REGISTER) throw httpError(403, "Đăng ký đã bị khóa");
  const id = createUser(ctx.body.username, ctx.body.password);
  const session = login(ctx.body.username, ctx.body.password);
  return { id, ...session };
}, { auth: false });

route("POST", "/api/auth/login", async (ctx) => {
  const session = login(ctx.body.username, ctx.body.password);
  if (!session) throw httpError(401, "Sai tên đăng nhập hoặc mật khẩu");
  return session;
}, { auth: false });

/* ---- nạp toàn bộ dữ liệu ban đầu ---- */

route("GET", "/api/bootstrap", (ctx) => {
  const u = ctx.userId;
  return {
    user: q.get("SELECT id,username FROM users WHERE id=?", u),
    categories: q.all("SELECT * FROM categories WHERE user_id=? AND archived=0 ORDER BY sort", u)
      .map((c) => ({ ...c, subs: JSON.parse(c.subs || "[]") })),
    cards: cardsWithBalance(u),
    bills: billsWithStatus(u),
    settings: Object.fromEntries(
      q.all("SELECT key,value FROM settings WHERE user_id=?", u).map((s) => [s.key, s.value])
    ),
    ocr_enabled: Boolean(process.env.GEMINI_API_KEY),
    assistant_enabled: Boolean(process.env.GEMINI_API_KEY),
    has_portfolio: Boolean(q.get("SELECT 1 AS x FROM portfolio_snapshot WHERE user_id=?", u)),
  };
});

/* ---- giao dịch ---- */

route("GET", "/api/transactions", (ctx) => {
  const { month, from, to, limit } = ctx.query;
  let sql = "SELECT * FROM transactions WHERE user_id=?";
  const p = [ctx.userId];
  if (month) { sql += " AND date LIKE ?"; p.push(month + "%"); }
  if (from) { sql += " AND date >= ?"; p.push(from); }
  if (to) { sql += " AND date <= ?"; p.push(to); }
  sql += " ORDER BY date DESC, created_at DESC LIMIT ?";
  p.push(Math.min(Number(limit) || 500, 2000));
  return { transactions: q.all(sql, ...p) };
});

function upsertTx(userId, body, existingId) {
  const amount = int(body.amount);
  if (amount <= 0) throw httpError(400, "Số tiền phải lớn hơn 0");
  if (!isDate(body.date)) throw httpError(400, "Ngày không hợp lệ");
  const cat = q.get("SELECT id FROM categories WHERE id=? AND user_id=?", body.category_id, userId);
  if (!cat) throw httpError(400, "Danh mục không tồn tại");

  const method = ["cash", "card", "bank", "ewallet"].includes(body.method) ? body.method : "cash";
  let cardId = method === "card" ? str(body.card_id, 40) || null : null;
  if (cardId && !q.get("SELECT id FROM cards WHERE id=? AND user_id=?", cardId, userId)) cardId = null;

  const row = [
    amount, cat.id, str(body.sub, 60),
    ["personal", "company", "business"].includes(body.type) ? body.type : "personal",
    method, cardId, str(body.note, 400), body.date,
    str(body.source, 20) || "manual",
    body.receipt ? JSON.stringify(body.receipt).slice(0, 8000) : null,
  ];

  if (existingId) {
    const r = q.run(
      `UPDATE transactions SET amount=?,category_id=?,sub=?,type=?,method=?,card_id=?,note=?,date=?,
       source=?,receipt=?,updated_at=? WHERE id=? AND user_id=?`,
      ...row, now(), existingId, userId
    );
    if (!r.changes) throw httpError(404, "Không tìm thấy khoản chi");
    return q.get("SELECT * FROM transactions WHERE id=?", existingId);
  }

  const id = uid();
  q.run(
    `INSERT INTO transactions (id,user_id,amount,category_id,sub,type,method,card_id,note,date,source,receipt,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, userId, ...row, now(), now()
  );
  return q.get("SELECT * FROM transactions WHERE id=?", id);
}

route("POST", "/api/transactions", (ctx) => ({ transaction: upsertTx(ctx.userId, ctx.body) }));
route("PUT", "/api/transactions/:id", (ctx) => ({ transaction: upsertTx(ctx.userId, ctx.body, ctx.params.id) }));
route("DELETE", "/api/transactions/:id", (ctx) => {
  const r = q.run("DELETE FROM transactions WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  if (!r.changes) throw httpError(404, "Không tìm thấy khoản chi");
  return { ok: true };
});

/* ---- danh mục ---- */

route("POST", "/api/categories", (ctx) => {
  const name = str(ctx.body.name, 60).trim();
  if (!name) throw httpError(400, "Thiếu tên danh mục");
  const id = uid();
  const sort = (q.get("SELECT COALESCE(MAX(sort),0) AS m FROM categories WHERE user_id=?", ctx.userId).m) + 1;
  q.run(
    "INSERT INTO categories (id,user_id,name,icon,color,budget,subs,sort) VALUES (?,?,?,?,?,?,?,?)",
    id, ctx.userId, name, str(ctx.body.icon, 8) || "📌", str(ctx.body.color, 16) || "#6B7280",
    int(ctx.body.budget), JSON.stringify(Array.isArray(ctx.body.subs) ? ctx.body.subs.slice(0, 12) : []), sort
  );
  return { category: q.get("SELECT * FROM categories WHERE id=?", id) };
});

route("PUT", "/api/categories/:id", (ctx) => {
  const cur = q.get("SELECT * FROM categories WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  if (!cur) throw httpError(404, "Không tìm thấy danh mục");
  q.run(
    "UPDATE categories SET name=?,icon=?,color=?,budget=?,subs=? WHERE id=? AND user_id=?",
    str(ctx.body.name, 60) || cur.name, str(ctx.body.icon, 8) || cur.icon,
    str(ctx.body.color, 16) || cur.color, int(ctx.body.budget),
    JSON.stringify(Array.isArray(ctx.body.subs) ? ctx.body.subs.slice(0, 12) : JSON.parse(cur.subs)),
    ctx.params.id, ctx.userId
  );
  return { ok: true };
});

route("DELETE", "/api/categories/:id", (ctx) => {
  const used = q.get(
    "SELECT COUNT(*) AS n FROM transactions WHERE category_id=? AND user_id=?",
    ctx.params.id, ctx.userId
  ).n;
  if (used > 0) {
    q.run("UPDATE categories SET archived=1 WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
    return { ok: true, archived: true, message: `Danh mục đang có ${used} khoản chi nên được ẩn thay vì xóa` };
  }
  q.run("DELETE FROM categories WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  return { ok: true };
});

/* ---- thẻ tín dụng ---- */

route("POST", "/api/cards", (ctx) => {
  const id = uid();
  q.run(
    `INSERT INTO cards (id,user_id,bank,last4,limit_amount,statement_day,due_day,opening,active,created_at)
     VALUES (?,?,?,?,?,?,?,?,1,?)`,
    id, ctx.userId, str(ctx.body.bank, 60) || "Thẻ", str(ctx.body.last4, 4),
    int(ctx.body.limit_amount),
    Math.min(28, Math.max(1, int(ctx.body.statement_day) || 1)),
    Math.min(28, Math.max(1, int(ctx.body.due_day) || 15)),
    int(ctx.body.opening), now()
  );
  return { cards: cardsWithBalance(ctx.userId) };
});

route("PUT", "/api/cards/:id", (ctx) => {
  const cur = q.get("SELECT * FROM cards WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  if (!cur) throw httpError(404, "Không tìm thấy thẻ");
  q.run(
    "UPDATE cards SET bank=?,last4=?,limit_amount=?,statement_day=?,due_day=?,opening=?,active=? WHERE id=? AND user_id=?",
    str(ctx.body.bank, 60) || cur.bank, str(ctx.body.last4, 4), int(ctx.body.limit_amount),
    Math.min(28, Math.max(1, int(ctx.body.statement_day) || cur.statement_day)),
    Math.min(28, Math.max(1, int(ctx.body.due_day) || cur.due_day)),
    int(ctx.body.opening), ctx.body.active === false ? 0 : 1,
    ctx.params.id, ctx.userId
  );
  return { cards: cardsWithBalance(ctx.userId) };
});

route("DELETE", "/api/cards/:id", (ctx) => {
  q.run("UPDATE transactions SET card_id=NULL WHERE card_id=? AND user_id=?", ctx.params.id, ctx.userId);
  q.run("DELETE FROM cards WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  return { cards: cardsWithBalance(ctx.userId) };
});

route("POST", "/api/cards/:id/pay", (ctx) => {
  const card = q.get("SELECT * FROM cards WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  if (!card) throw httpError(404, "Không tìm thấy thẻ");
  const amount = int(ctx.body.amount);
  if (amount <= 0) throw httpError(400, "Số tiền thanh toán phải lớn hơn 0");
  q.run(
    "INSERT INTO card_payments (id,card_id,user_id,amount,paid_date,created_at) VALUES (?,?,?,?,?,?)",
    uid(), card.id, ctx.userId, amount, isDate(ctx.body.paid_date) ? ctx.body.paid_date : todayISO(), now()
  );
  return { cards: cardsWithBalance(ctx.userId) };
});

route("GET", "/api/cards/:id/payments", (ctx) => ({
  payments: q.all(
    "SELECT * FROM card_payments WHERE card_id=? AND user_id=? ORDER BY paid_date DESC LIMIT 100",
    ctx.params.id, ctx.userId
  ),
}));

/* ---- hóa đơn ---- */

route("GET", "/api/bills", (ctx) => ({ bills: billsWithStatus(ctx.userId) }));

route("POST", "/api/bills", (ctx) => {
  if (!isDate(ctx.body.next_due)) throw httpError(400, "Hạn thanh toán không hợp lệ");
  const id = uid();
  q.run(
    `INSERT INTO bills (id,user_id,name,amount,category_id,next_due,recurrence,reminder_days,method,card_id,autopay,active,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`,
    id, ctx.userId, str(ctx.body.name, 80) || "Hóa đơn", int(ctx.body.amount),
    str(ctx.body.category_id, 40), ctx.body.next_due,
    ["monthly", "weekly", "quarterly", "yearly", "once"].includes(ctx.body.recurrence) ? ctx.body.recurrence : "monthly",
    Math.min(30, Math.max(0, int(ctx.body.reminder_days) || 3)),
    str(ctx.body.method, 12) || "bank", str(ctx.body.card_id, 40) || null,
    ctx.body.autopay ? 1 : 0, now()
  );
  return { bills: billsWithStatus(ctx.userId) };
});

route("PUT", "/api/bills/:id", (ctx) => {
  const cur = q.get("SELECT * FROM bills WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  if (!cur) throw httpError(404, "Không tìm thấy hóa đơn");
  q.run(
    `UPDATE bills SET name=?,amount=?,category_id=?,next_due=?,recurrence=?,reminder_days=?,method=?,card_id=?,autopay=?,active=?
     WHERE id=? AND user_id=?`,
    str(ctx.body.name, 80) || cur.name, int(ctx.body.amount), str(ctx.body.category_id, 40) || cur.category_id,
    isDate(ctx.body.next_due) ? ctx.body.next_due : cur.next_due,
    ctx.body.recurrence || cur.recurrence,
    Math.min(30, Math.max(0, int(ctx.body.reminder_days))),
    str(ctx.body.method, 12) || cur.method, str(ctx.body.card_id, 40) || null,
    ctx.body.autopay ? 1 : 0, ctx.body.active === false ? 0 : 1,
    ctx.params.id, ctx.userId
  );
  return { bills: billsWithStatus(ctx.userId) };
});

route("DELETE", "/api/bills/:id", (ctx) => {
  q.run("DELETE FROM bills WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  return { bills: billsWithStatus(ctx.userId) };
});

route("POST", "/api/bills/:id/pay", (ctx) => {
  const bill = q.get("SELECT * FROM bills WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
  if (!bill) throw httpError(404, "Không tìm thấy hóa đơn");
  const amount = int(ctx.body.amount) || bill.amount;
  const paidDate = isDate(ctx.body.paid_date) ? ctx.body.paid_date : todayISO();

  let txId = null;
  if (ctx.body.create_transaction !== false && amount > 0) {
    const cat = q.get("SELECT id FROM categories WHERE id=? AND user_id=?", bill.category_id, ctx.userId)
      || q.get("SELECT id FROM categories WHERE user_id=? ORDER BY sort LIMIT 1", ctx.userId);
    const tx = upsertTx(ctx.userId, {
      amount, category_id: cat.id, type: "personal", method: bill.method,
      card_id: bill.card_id, note: bill.name, date: paidDate, source: "bill",
    });
    txId = tx.id;
  }

  q.run(
    "INSERT INTO bill_payments (id,bill_id,user_id,amount,paid_date,tx_id,created_at) VALUES (?,?,?,?,?,?,?)",
    uid(), bill.id, ctx.userId, amount, paidDate, txId, now()
  );

  if (bill.recurrence === "once") {
    q.run("UPDATE bills SET active=0, last_notified=NULL WHERE id=?", bill.id);
  } else {
    let next = advanceDue(bill.next_due, bill.recurrence);
    while (next < todayISO()) next = advanceDue(next, bill.recurrence);
    q.run("UPDATE bills SET next_due=?, last_notified=NULL WHERE id=?", next, bill.id);
  }

  return { bills: billsWithStatus(ctx.userId), cards: cardsWithBalance(ctx.userId), tx_id: txId };
});

route("GET", "/api/bills/:id/payments", (ctx) => ({
  payments: q.all(
    "SELECT * FROM bill_payments WHERE bill_id=? AND user_id=? ORDER BY paid_date DESC LIMIT 100",
    ctx.params.id, ctx.userId
  ),
}));

/* ---- báo cáo ---- */

route("GET", "/api/analytics", (ctx) => {
  const u = ctx.userId;
  const months = Math.min(24, Math.max(3, Number(ctx.query.months) || 12));

  const trend = q.all(
    `SELECT substr(date,1,7) AS month, SUM(amount) AS total, COUNT(*) AS n
     FROM transactions WHERE user_id=? GROUP BY month ORDER BY month DESC LIMIT ?`,
    u, months
  ).reverse();

  const month = ctx.query.month || todayISO().slice(0, 7);

  const byCategory = q.all(
    `SELECT t.category_id, c.name, c.icon, c.color, SUM(t.amount) AS total, COUNT(*) AS n
     FROM transactions t JOIN categories c ON c.id = t.category_id
     WHERE t.user_id=? AND t.date LIKE ? GROUP BY t.category_id ORDER BY total DESC`,
    u, month + "%"
  );

  const byType = q.all(
    `SELECT type, SUM(amount) AS total FROM transactions
     WHERE user_id=? AND date LIKE ? GROUP BY type`,
    u, month + "%"
  );

  const byMethod = q.all(
    `SELECT method, SUM(amount) AS total FROM transactions
     WHERE user_id=? AND date LIKE ? GROUP BY method ORDER BY total DESC`,
    u, month + "%"
  );

  const byWeekday = q.all(
    `SELECT CAST(strftime('%w', date) AS INTEGER) AS wd, SUM(amount) AS total, COUNT(*) AS n
     FROM transactions WHERE user_id=? AND date LIKE ? GROUP BY wd ORDER BY wd`,
    u, month + "%"
  );

  const top = q.all(
    `SELECT id, amount, note, date, category_id FROM transactions
     WHERE user_id=? AND date LIKE ? ORDER BY amount DESC LIMIT 5`,
    u, month + "%"
  );

  const totals = q.get(
    "SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS n FROM transactions WHERE user_id=? AND date LIKE ?",
    u, month + "%"
  );

  return { month, trend, byCategory, byType, byMethod, byWeekday, top, totals };
});

/* ---- đọc hóa đơn ---- */

route("POST", "/api/ocr", async (ctx) => {
  const image = String(ctx.body.image || "").replace(/^data:[^;]+;base64,/, "");
  if (image.length < 100) throw httpError(400, "Thiếu ảnh hóa đơn");
  if (image.length > 6_000_000) throw httpError(413, "Ảnh quá lớn, chụp lại nhỏ hơn");
  try {
    return { receipt: await readReceipt(image, ctx.body.mime || "image/jpeg") };
  } catch (e) {
    throw httpError(e.code === "NO_KEY" ? 503 : 502, e.message);
  }
});

/* ---- trợ lý tài chính ---- */

route("POST", "/api/assistant", async (ctx) => {
  try {
    return await assistantAsk(
      ctx.userId,
      ctx.body.question,
      Array.isArray(ctx.body.history) ? ctx.body.history : [],
      /^\d{4}-\d{2}$/.test(ctx.body.month || "") ? ctx.body.month : undefined
    );
  } catch (e) {
    throw httpError(e.code === "NO_KEY" ? 503 : 502, e.message);
  }
});

route("GET", "/api/insights", (ctx) => ({
  insights: computeInsights(ctx.userId, /^\d{4}-\d{2}$/.test(ctx.query.month || "") ? ctx.query.month : undefined),
}));

/* ---- danh mục chứng khoán (đẩy từ portfolio-bot trên hermes-gateway) ---- */

route("POST", "/api/portfolio/snapshot", (ctx) => {
  if (!PORTFOLIO_PUSH_TOKEN) throw httpError(503, "Máy chủ chưa bật luồng nhận danh mục");
  const given = String(ctx.req.headers["x-sochi-push"] || "").trim();
  const a = Buffer.from(given);
  const b = Buffer.from(PORTFOLIO_PUSH_TOKEN.trim());
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw httpError(401, "Token đẩy danh mục không đúng");
  }

  const owner = PORTFOLIO_USER
    ? q.get("SELECT id FROM users WHERE username = ?", PORTFOLIO_USER.toLowerCase())
    : q.get("SELECT id FROM users ORDER BY created_at LIMIT 1");
  if (!owner) throw httpError(404, "Chưa có tài khoản nào để gắn danh mục");

  const payload = JSON.stringify(ctx.body).slice(0, 400000);
  q.run(
    `INSERT INTO portfolio_snapshot (user_id,payload,generated_at,received_at) VALUES (?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,
       generated_at=excluded.generated_at, received_at=excluded.received_at`,
    owner.id, payload, str(ctx.body.generated_at, 40), now()
  );
  return { ok: true, positions: (ctx.body.positions || []).length };
}, { auth: false });

route("GET", "/api/portfolio", async (ctx) => {
  const row = q.get("SELECT * FROM portfolio_snapshot WHERE user_id=?", ctx.userId);
  if (!row) return { snapshot: null };
  let snap;
  try { snap = JSON.parse(row.payload); } catch { return { snapshot: null }; }

  // Vi the lay tu snapshot (chi doi khi mua ban). Gia lay live moi lan mo tab.
  let priceInfo = null;
  let priceError = null;
  if (ctx.query.live !== "0" && (snap.positions || []).length) {
    try {
      const live = await fetchPrices(snap.positions.map((p) => p.symbol));
      snap = applyLivePrices(snap, live.prices);
      priceInfo = { at: live.at, cached: live.cached, market_open: live.market_open };
    } catch (e) {
      priceError = e.message;
    }
  }

  return {
    snapshot: snap,
    received_at: row.received_at,
    age_minutes: Math.round((now() - row.received_at) / 60000),
    price_info: priceInfo,
    price_error: priceError,
  };
});

/* ---- cài đặt ---- */

route("PUT", "/api/settings", (ctx) => {
  Object.entries(ctx.body || {}).slice(0, 40).forEach(([k, v]) => {
    q.run(
      "INSERT INTO settings (user_id,key,value) VALUES (?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
      ctx.userId, str(k, 40), str(v, 400)
    );
  });
  return { ok: true };
});

/* ---- xuất dữ liệu ---- */

route("GET", "/api/export.csv", (ctx) => {
  const rows = q.all(
    `SELECT t.date, t.amount, c.name AS category, t.sub, t.type, t.method, t.note, t.source
     FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
     WHERE t.user_id=? ORDER BY t.date DESC`,
    ctx.userId
  );
  const TYPE = { personal: "Cá nhân", company: "Tiếp khách", business: "Công tác" };
  const METHOD = { cash: "Tiền mặt", card: "Thẻ tín dụng", bank: "Chuyển khoản", ewallet: "Ví điện tử" };
  const head = ["Ngày", "Số tiền", "Danh mục", "Chi tiết", "Loại", "Thanh toán", "Ghi chú", "Nguồn"];
  const csv = "\uFEFF" + [head, ...rows.map((r) => [
    r.date, r.amount, r.category || "", r.sub, TYPE[r.type] || r.type,
    METHOD[r.method] || r.method, r.note, r.source,
  ])].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  return { __raw: csv, __type: "text/csv; charset=utf-8", __filename: `so-chi-${todayISO()}.csv` };
});

route("GET", "/api/export.json", (ctx) => ({
  exported_at: new Date().toISOString(),
  transactions: q.all("SELECT * FROM transactions WHERE user_id=? ORDER BY date DESC", ctx.userId),
  categories: q.all("SELECT * FROM categories WHERE user_id=?", ctx.userId),
  cards: q.all("SELECT * FROM cards WHERE user_id=?", ctx.userId),
  bills: q.all("SELECT * FROM bills WHERE user_id=?", ctx.userId),
  bill_payments: q.all("SELECT * FROM bill_payments WHERE user_id=?", ctx.userId),
  card_payments: q.all("SELECT * FROM card_payments WHERE user_id=?", ctx.userId),
}));

/* ---- nhập dữ liệu từ bản GĐ1 (localStorage) ---- */

route("POST", "/api/import", (ctx) => {
  const list = Array.isArray(ctx.body.transactions) ? ctx.body.transactions.slice(0, 5000) : [];
  const cats = q.all("SELECT id,name FROM categories WHERE user_id=?", ctx.userId);
  const byName = Object.fromEntries(cats.map((c) => [c.name.toLowerCase(), c.id]));
  let ok = 0, skipped = 0;
  for (const t of list) {
    try {
      upsertTx(ctx.userId, {
        amount: t.amount,
        category_id: byName[String(t.category_name || "").toLowerCase()] || cats[cats.length - 1].id,
        sub: t.sub, type: t.type, method: t.method, note: t.note, date: t.date, source: "import",
      });
      ok++;
    } catch {
      skipped++;
    }
  }
  return { imported: ok, skipped };
});

/* ============================ khung xử lý ============================ */

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function match(routePattern, urlPath) {
  const a = routePattern.split("/");
  const b = urlPath.split("/");
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(req, res, urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: "Không hợp lệ" });
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC, "index.html"), (e2, html) => {
        if (e2) return json(res, 404, { error: "Không tìm thấy" });
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": rel === "index.html" ? "no-cache" : "public, max-age=300",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const urlPath = url.pathname;

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");

  // Chi chap nhan request di qua Cloudflare Worker (co header bi mat),
  // hoac request tu chinh may chu (health check, curl khi debug).
  const fromLocal = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  if (PROXY_SECRET && !fromLocal) {
    const given = req.headers["x-sochi-proxy"];
    const a = Buffer.from(String(given || "").trim());
    const b = Buffer.from(PROXY_SECRET.trim());
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Truy cap phai di qua proxy");
    }
  }

  if (!urlPath.startsWith("/api/")) return serveStatic(req, res, urlPath);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    });
    return res.end();
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const params = match(r.pattern, urlPath);
    if (!params) continue;

    try {
      let userId = null;
      if (r.auth) {
        const header = req.headers.authorization || "";
        userId = verifyToken(header.startsWith("Bearer ") ? header.slice(7) : "");
        if (!userId) return json(res, 401, { error: "Phiên đăng nhập đã hết hạn" });
      }

      const body = ["POST", "PUT"].includes(req.method) ? await readBody(req) : {};
      const ctx = { userId, params, body, query: Object.fromEntries(url.searchParams), req };
      const out = await r.handler(ctx);

      if (out && out.__raw !== undefined) {
        const buf = Buffer.from(out.__raw);
        res.writeHead(200, {
          "Content-Type": out.__type,
          "Content-Length": buf.length,
          "Content-Disposition": `attachment; filename="${out.__filename}"`,
        });
        return res.end(buf);
      }
      return json(res, 200, out ?? { ok: true });
    } catch (e) {
      const status = e.status || 400;
      if (status >= 500) console.error("[loi]", urlPath, e.message);
      return json(res, status, { error: e.message || "Lỗi không xác định" });
    }
  }

  return json(res, 404, { error: "Endpoint không tồn tại" });
});

server.listen(PORT, HOST, () => {
  console.log(`[so-chi] chay tai http://${HOST}:${PORT} — ${userCount()} tai khoan`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log("[so-chi] dang tat...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}

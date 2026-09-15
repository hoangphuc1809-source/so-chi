/**
 * Tai khoan, thu nhap va chuyen tien.
 *
 * Nguyen tac:
 * - Bang transactions van CHI chua khoan chi. Moi bao cao, ngan sach, tro ly
 *   dang cong tong bang nay nen khong duoc tron thu nhap vao day.
 * - So du tai khoan KHONG luu cung. Luon tinh lai tu: so du ban dau tai ngay
 *   bat dau theo doi + thu - chi + chuyen vao - chuyen ra - tra the.
 *   Chi tinh cac giao dich tu ngay bat dau theo doi tro di, nen khoan chi cu
 *   ghi truoc khi co tai khoan khong lam lech so du.
 * - Chuyen tien (rut tien mat, gui tiet kiem, nap vi) khong phai thu cung
 *   khong phai chi.
 */
import { db, q, uid, now } from "./db.js";
import { appendTx, undoLast } from "./stock.js";

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'bank',
  opening      INTEGER NOT NULL DEFAULT 0,
  opening_date TEXT NOT NULL,
  is_default   INTEGER NOT NULL DEFAULT 0,
  rate         REAL NOT NULL DEFAULT 0,
  maturity     TEXT,
  note         TEXT NOT NULL DEFAULT '',
  archived     INTEGER NOT NULL DEFAULT 0,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS incomes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  source     TEXT NOT NULL DEFAULT 'other',
  account_id TEXT,
  note       TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes(user_id, date);

CREATE TABLE IF NOT EXISTS transfers (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_account TEXT NOT NULL,
  to_account   TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  date         TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfers_user_date ON transfers(user_id, date);
`);

// Them cot vao bang cu. SQLite khong co ADD COLUMN IF NOT EXISTS nen phai hoi truoc.
const hasCol = (table, col) => q.all(`PRAGMA table_info(${table})`).some((c) => c.name === col);
if (!hasCol("transactions", "account_id")) db.exec("ALTER TABLE transactions ADD COLUMN account_id TEXT");
if (!hasCol("card_payments", "account_id")) db.exec("ALTER TABLE card_payments ADD COLUMN account_id TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)");
// Claim cong ty: chi ap dung cho khoan chi Tiep khach (company) va Cong tac (business).
// claim_status: NULL = khong theo doi, pending = cho claim, claimed = da hoan, rejected = khong duoc duyet.
if (!hasCol("transactions", "claim_status")) db.exec("ALTER TABLE transactions ADD COLUMN claim_status TEXT");
if (!hasCol("transactions", "claim_income_id")) db.exec("ALTER TABLE transactions ADD COLUMN claim_income_id TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_tx_claim ON transactions(user_id, claim_status)");

const CLAIMABLE = ["company", "business"];
const CLAIM_STATES = ["pending", "claimed", "rejected"];

export function claimSummary(userId) {
  const r = q.get("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND claim_status='pending'", userId);
  return { count: r.n, total: r.s };
}

/**
 * Dat trang thai claim sau khi ghi khoan chi.
 * Khoan moi loai Tiep khach/Cong tac mac dinh la cho claim. Sua ma khong gui
 * claim_status thi giu nguyen, de khoan cu ghi truoc tinh nang nay khong bi
 * tu dong day vao danh sach cho.
 */
export function applyClaim(userId, txId, type, given, isNew) {
  const cur = q.get("SELECT claim_status, claim_income_id FROM transactions WHERE id=? AND user_id=?", txId, userId);
  let status = cur.claim_status;
  if (!CLAIMABLE.includes(type)) status = null;
  else if (given === "none" || given === null || given === "") status = null;
  else if (CLAIM_STATES.includes(given)) status = given;
  else if (isNew) status = "pending";
  const incomeId = status === "claimed" ? cur.claim_income_id : null;
  q.run("UPDATE transactions SET claim_status=?, claim_income_id=? WHERE id=? AND user_id=?", status, incomeId, txId, userId);
  return q.get("SELECT * FROM transactions WHERE id=?", txId);
}

/* ---- GD5-6: thu nhap dinh ky, doi soat, muc tieu, moc tai san rong ---- */
db.exec(`
CREATE TABLE IF NOT EXISTS income_rules (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  source        TEXT NOT NULL DEFAULT 'salary',
  account_id    TEXT,
  day           INTEGER NOT NULL DEFAULT 1,
  next_date     TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  last_notified TEXT,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_adjustments (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  date       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  actual     INTEGER NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adj_account ON account_adjustments(user_id, account_id);
CREATE TABLE IF NOT EXISTS goals (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  target     INTEGER NOT NULL,
  deadline   TEXT,
  account_id TEXT,
  saved      INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS networth_snapshots (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,
  cash    INTEGER NOT NULL,
  stock   INTEGER,
  debt    INTEGER NOT NULL,
  net     INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
`);
// Chuyen tien voi tai khoan chung khoan: luu id giao dich ben so dau tu de huy dung cap.
if (!hasCol("transfers", "stock_tx_id")) db.exec("ALTER TABLE transfers ADD COLUMN stock_tx_id TEXT");

export const STOCK = "stock";
export const todayVN = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const dayOfMonth = (y, m0, day) => new Date(Date.UTC(y, m0, Math.min(28, Math.max(1, day)))).toISOString().slice(0, 10);
/** Lan nhan ke tiep sau mot ngay cho truoc, cung ngay trong thang sau. */
const nextMonthDate = (iso, day) => { const [y, m] = iso.split("-").map(Number); return dayOfMonth(y, m, day); };
const firstRuleDate = (day) => {
  const t = todayVN();
  const [y, m] = t.split("-").map(Number);
  const cand = dayOfMonth(y, m - 1, day);
  return cand >= t ? cand : dayOfMonth(y, m, day);
};

export function cardDebt(userId) {
  return q.all("SELECT id, opening FROM cards WHERE user_id=?", userId).reduce((s, c) => {
    const spent = q.get("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND card_id=?", userId, c.id).s;
    const paid = q.get("SELECT COALESCE(SUM(amount),0) AS s FROM card_payments WHERE user_id=? AND card_id=?", userId, c.id).s;
    return s + Math.max(0, spent + c.opening - paid);
  }, 0);
}

export function incomeRulesWithStatus(userId) {
  const today = todayVN();
  return q.all("SELECT * FROM income_rules WHERE user_id=? ORDER BY active DESC, next_date", userId).map((r) => ({
    ...r,
    days_left: Math.round((Date.parse(r.next_date) - Date.parse(today)) / 86400000),
  }));
}

export const dueIncomeRules = (userId) => incomeRulesWithStatus(userId).filter((r) => r.active && r.days_left <= 0);

export function goalsWithProgress(userId) {
  const accs = accountsWithBalance(userId);
  const [y1, m1] = todayVN().split("-").map(Number);
  return q.all("SELECT * FROM goals WHERE user_id=? AND archived=0 ORDER BY created_at", userId).map((g) => {
    const acc = g.account_id ? accs.find((a) => a.id === g.account_id) : null;
    const current = acc ? Math.max(0, acc.balance) : g.saved;
    let months_left = null;
    let monthly_needed = null;
    if (g.deadline) {
      const [y2, m2] = g.deadline.split("-").map(Number);
      months_left = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
      monthly_needed = Math.max(0, Math.ceil((g.target - current) / Math.max(1, months_left)));
    }
    return { ...g, account_name: acc ? acc.name : null, current, pct: g.target > 0 ? Math.min(1, current / g.target) : 0, months_left, monthly_needed };
  });
}

/** Moi ngay mot moc tai san ron. Gia tri chung khoan do app gui len (can gia thi truong); thieu thi lay moc gan nhat. */
export function saveNetworthSnapshot(userId, stock) {
  const cash = accountsWithBalance(userId).filter((a) => !a.archived).reduce((s, a) => s + a.balance, 0);
  const debt = cardDebt(userId);
  let st = Number.isFinite(stock) ? Math.round(stock) : null;
  if (st == null) {
    const last = q.get("SELECT stock FROM networth_snapshots WHERE user_id=? AND stock IS NOT NULL ORDER BY date DESC LIMIT 1", userId);
    st = last ? last.stock : null;
  }
  const date = todayVN();
  const net = cash + (st || 0) - debt;
  q.run(
    `INSERT INTO networth_snapshots (user_id,date,cash,stock,debt,net) VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id,date) DO UPDATE SET cash=excluded.cash, stock=excluded.stock, debt=excluded.debt, net=excluded.net`,
    userId, date, cash, st, debt, net
  );
  return { date, cash, stock: st, debt, net };
}

/** Gan cac khoan chi vao mot khoan thu claim. Khoan da gan truoc do ma khong con trong danh sach thi tro lai cho claim. */
function linkClaims(userId, incomeId, ids) {
  q.run("UPDATE transactions SET claim_status='pending', claim_income_id=NULL WHERE user_id=? AND claim_income_id=?", userId, incomeId);
  if (!Array.isArray(ids)) return;
  for (const id of ids.slice(0, 500)) {
    q.run(
      `UPDATE transactions SET claim_status='claimed', claim_income_id=?
       WHERE id=? AND user_id=? AND type IN ('company','business')`,
      incomeId, String(id), userId
    );
  }
}

export const ACCOUNT_KINDS = ["cash", "bank", "ewallet", "saving"];
export const INCOME_SOURCES = ["salary", "bonus", "reimburse", "business", "interest", "dividend", "gift", "other"];
const KIND_OF_METHOD = { cash: "cash", bank: "bank", ewallet: "ewallet" };

const sum = (sql, ...p) => q.get(sql, ...p).s;

export function accountsWithBalance(userId) {
  return q.all("SELECT * FROM accounts WHERE user_id=? ORDER BY archived, sort, created_at", userId).map((a) => {
    const d0 = a.opening_date;
    const income = sum("SELECT COALESCE(SUM(amount),0) AS s FROM incomes WHERE user_id=? AND account_id=? AND date>=?", userId, a.id, d0);
    const expense = sum("SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND account_id=? AND date>=?", userId, a.id, d0);
    const tin = sum("SELECT COALESCE(SUM(amount),0) AS s FROM transfers WHERE user_id=? AND to_account=? AND date>=?", userId, a.id, d0);
    const tout = sum("SELECT COALESCE(SUM(amount),0) AS s FROM transfers WHERE user_id=? AND from_account=? AND date>=?", userId, a.id, d0);
    const cardPaid = sum("SELECT COALESCE(SUM(amount),0) AS s FROM card_payments WHERE user_id=? AND account_id=? AND paid_date>=?", userId, a.id, d0);
    const adjust = sum("SELECT COALESCE(SUM(amount),0) AS s FROM account_adjustments WHERE user_id=? AND account_id=? AND date>=?", userId, a.id, d0);
    const balance = a.opening + income - expense + tin - tout - cardPaid + adjust;

    // Lai tiet kiem uoc tinh: lai don tu ngay bat dau theo doi den ngay dao han.
    // Chi la uoc tinh de nhin, ngan hang tinh theo ky han va quy dinh rieng.
    let est_interest = null;
    if (a.kind === "saving" && a.rate > 0 && a.maturity && balance > 0) {
      const days = Math.max(0, Math.round((Date.parse(a.maturity) - Date.parse(d0)) / 86400000));
      est_interest = Math.round((balance * a.rate / 100) * days / 365);
    }
    return { ...a, balance, est_interest, flow: { income, expense, transfer_in: tin, transfer_out: tout, card_paid: cardPaid, adjust } };
  });
}

const ownAccount = (userId, id) =>
  id ? q.get("SELECT * FROM accounts WHERE id=? AND user_id=?", String(id), userId) : null;

/**
 * Chon tai khoan cho mot khoan chi.
 * - Tra bang the tin dung: khong tru tai khoan nao (no the moi la noi ghi).
 * - Gui account_id cu the: dung tai khoan do. Gui null/"": co y khong tru.
 * - Khong gui gi (bot, hoa don tu dong, ban app cu): sua thi giu nguyen,
 *   them moi thi lay tai khoan mac dinh cua phuong thuc thanh toan.
 */
export function resolveTxAccount(userId, method, given, existingId) {
  if (method === "card") return null;
  if (given === null || given === "") return null;
  if (given !== undefined) return ownAccount(userId, given)?.id || null;
  if (existingId) {
    const cur = q.get("SELECT account_id FROM transactions WHERE id=? AND user_id=?", existingId, userId);
    return cur ? cur.account_id : null;
  }
  const kind = KIND_OF_METHOD[method];
  if (!kind) return null;
  const d = q.get(
    "SELECT id FROM accounts WHERE user_id=? AND kind=? AND archived=0 ORDER BY is_default DESC, sort, created_at LIMIT 1",
    userId, kind
  );
  return d ? d.id : null;
}

export function registerMoneyRoutes({ route, httpError, int, str, isDate, todayISO }) {
  const need = (cond, msg) => { if (!cond) throw httpError(400, msg); };
  const monthRe = /^\d{4}-\d{2}$/;

  /* ---- tai khoan ---- */
  const accountBody = (userId, b, cur = {}) => {
    const kind = ACCOUNT_KINDS.includes(b.kind) ? b.kind : cur.kind || "bank";
    const rate = Number(b.rate);
    return {
      name: str(b.name, 60).trim() || cur.name,
      kind,
      opening: b.opening === undefined ? cur.opening || 0 : int(b.opening),
      opening_date: isDate(b.opening_date) ? b.opening_date : cur.opening_date || todayISO(),
      rate: kind === "saving" && Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0,
      maturity: kind === "saving" && isDate(b.maturity) ? b.maturity : null,
      note: str(b.note, 200),
      is_default: kind !== "saving" && Boolean(b.is_default),
    };
  };
  const setDefault = (userId, id, kind) => {
    q.run("UPDATE accounts SET is_default=0 WHERE user_id=? AND kind=? AND id<>?", userId, kind, id);
    q.run("UPDATE accounts SET is_default=1 WHERE user_id=? AND id=?", userId, id);
  };

  route("GET", "/api/accounts", (ctx) => ({ accounts: accountsWithBalance(ctx.userId) }));

  route("POST", "/api/accounts", (ctx) => {
    const u = ctx.userId;
    const a = accountBody(u, ctx.body);
    need(a.name, "Cần có tên tài khoản");
    const id = uid();
    const sort = q.get("SELECT COALESCE(MAX(sort),0) AS m FROM accounts WHERE user_id=?", u).m + 1;
    q.run(
      `INSERT INTO accounts (id,user_id,name,kind,opening,opening_date,is_default,rate,maturity,note,archived,sort,created_at)
       VALUES (?,?,?,?,?,?,0,?,?,?,0,?,?)`,
      id, u, a.name, a.kind, a.opening, a.opening_date, a.rate, a.maturity, a.note, sort, now()
    );
    // Tai khoan dau tien cua mot loai tu thanh mac dinh, de khoan chi co cho tru ngay.
    const firstOfKind = !q.get("SELECT 1 AS x FROM accounts WHERE user_id=? AND kind=? AND is_default=1", u, a.kind);
    if (a.kind !== "saving" && (a.is_default || firstOfKind)) setDefault(u, id, a.kind);
    return { accounts: accountsWithBalance(u) };
  });

  route("PUT", "/api/accounts/:id", (ctx) => {
    const u = ctx.userId;
    const cur = ownAccount(u, ctx.params.id);
    if (!cur) throw httpError(404, "Không tìm thấy tài khoản");
    const a = accountBody(u, ctx.body, cur);
    q.run(
      "UPDATE accounts SET name=?,kind=?,opening=?,opening_date=?,rate=?,maturity=?,note=?,archived=? WHERE id=? AND user_id=?",
      a.name, a.kind, a.opening, a.opening_date, a.rate, a.maturity, a.note,
      ctx.body.archived === true ? 1 : ctx.body.archived === false ? 0 : cur.archived, cur.id, u
    );
    if (a.kind === "saving" || !a.is_default) q.run("UPDATE accounts SET is_default=0 WHERE id=?", cur.id);
    else setDefault(u, cur.id, a.kind);
    return { accounts: accountsWithBalance(u) };
  });

  route("DELETE", "/api/accounts/:id", (ctx) => {
    const u = ctx.userId;
    const cur = ownAccount(u, ctx.params.id);
    if (!cur) throw httpError(404, "Không tìm thấy tài khoản");
    const used =
      sum("SELECT COUNT(*) AS s FROM incomes WHERE user_id=? AND account_id=?", u, cur.id) +
      sum("SELECT COUNT(*) AS s FROM transactions WHERE user_id=? AND account_id=?", u, cur.id) +
      sum("SELECT COUNT(*) AS s FROM card_payments WHERE user_id=? AND account_id=?", u, cur.id) +
      sum("SELECT COUNT(*) AS s FROM transfers WHERE user_id=? AND (from_account=? OR to_account=?)", u, cur.id, cur.id) +
      sum("SELECT COUNT(*) AS s FROM account_adjustments WHERE user_id=? AND account_id=?", u, cur.id);
    if (used > 0) {
      // Da co giao dich thi an di: xoa se lam mat dau lich su chuyen tien.
      q.run("UPDATE accounts SET archived=1, is_default=0 WHERE id=?", cur.id);
      return { ok: true, archived: true, message: `Tài khoản đã có ${used} giao dịch nên được ẩn thay vì xóa`, accounts: accountsWithBalance(u) };
    }
    q.run("DELETE FROM accounts WHERE id=? AND user_id=?", cur.id, u);
    return { ok: true, accounts: accountsWithBalance(u) };
  });

  /* ---- thu nhap ---- */
  const incomeRow = (u, b) => {
    const amount = int(b.amount);
    need(amount > 0, "Số tiền phải lớn hơn 0");
    need(isDate(b.date), "Ngày không hợp lệ");
    return [
      amount, INCOME_SOURCES.includes(b.source) ? b.source : "other",
      ownAccount(u, b.account_id)?.id || null, str(b.note, 200), b.date,
    ];
  };

  route("GET", "/api/incomes", (ctx) => {
    const { month, limit } = ctx.query;
    if (monthRe.test(month || "")) {
      return { incomes: q.all("SELECT * FROM incomes WHERE user_id=? AND substr(date,1,7)=? ORDER BY date DESC, created_at DESC", ctx.userId, month) };
    }
    const n = Math.min(5000, Math.max(1, Number(limit) || 500));
    return { incomes: q.all("SELECT * FROM incomes WHERE user_id=? ORDER BY date DESC, created_at DESC LIMIT ?", ctx.userId, n) };
  });

  route("POST", "/api/incomes", (ctx) => {
    const id = uid();
    q.run(
      "INSERT INTO incomes (id,user_id,amount,source,account_id,note,date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      id, ctx.userId, ...incomeRow(ctx.userId, ctx.body), now(), now()
    );
    if (ctx.body.source === "reimburse" && Array.isArray(ctx.body.claim_tx_ids)) linkClaims(ctx.userId, id, ctx.body.claim_tx_ids);
    if (ctx.body.rule_id) {
      // Ghi tu khoan thu dinh ky: day ngay nhan sang ky ke tiep.
      const rule = q.get("SELECT * FROM income_rules WHERE id=? AND user_id=?", String(ctx.body.rule_id), ctx.userId);
      if (rule) {
        let next = nextMonthDate(rule.next_date, rule.day);
        while (next <= todayVN()) next = nextMonthDate(next, rule.day);
        q.run("UPDATE income_rules SET next_date=?, last_notified=NULL WHERE id=?", next, rule.id);
      }
    }
    return { income: q.get("SELECT * FROM incomes WHERE id=?", id), claims: claimSummary(ctx.userId) };
  });

  route("PUT", "/api/incomes/:id", (ctx) => {
    const r = q.run(
      "UPDATE incomes SET amount=?,source=?,account_id=?,note=?,date=?,updated_at=? WHERE id=? AND user_id=?",
      ...incomeRow(ctx.userId, ctx.body), now(), ctx.params.id, ctx.userId
    );
    if (!r.changes) throw httpError(404, "Không tìm thấy khoản thu");
    if (ctx.body.source !== "reimburse") linkClaims(ctx.userId, ctx.params.id, []);
    else if (Array.isArray(ctx.body.claim_tx_ids)) linkClaims(ctx.userId, ctx.params.id, ctx.body.claim_tx_ids);
    return { income: q.get("SELECT * FROM incomes WHERE id=?", ctx.params.id), claims: claimSummary(ctx.userId) };
  });

  route("DELETE", "/api/incomes/:id", (ctx) => {
    const r = q.run("DELETE FROM incomes WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
    if (!r.changes) throw httpError(404, "Không tìm thấy khoản thu");
    linkClaims(ctx.userId, ctx.params.id, []);
    return { ok: true };
  });

  /* ---- chuyen tien giua tai khoan ---- */
  route("GET", "/api/transfers", (ctx) => {
    const n = Math.min(500, Math.max(1, Number(ctx.query.limit) || 50));
    return { transfers: q.all("SELECT * FROM transfers WHERE user_id=? ORDER BY date DESC, created_at DESC LIMIT ?", ctx.userId, n) };
  });

  route("POST", "/api/transfers", (ctx) => {
    const u = ctx.userId;
    const b = ctx.body;
    const pick = (v) => (v === STOCK ? { id: STOCK } : ownAccount(u, v));
    const from = pick(b.from_account);
    const to = pick(b.to_account);
    const amount = int(b.amount);
    need(from && to, "Cần chọn tài khoản chuyển và tài khoản nhận");
    need(from.id !== to.id, "Tài khoản chuyển và nhận phải khác nhau");
    need(amount > 0, "Số tiền phải lớn hơn 0");
    const date = isDate(b.date) ? b.date : todayISO();

    // Nap/rut chung khoan ghi luon mot giao dich ben so dau tu, de NAV va so du khop nhau.
    let stockTxId = null;
    if (from.id === STOCK || to.id === STOCK) {
      try {
        const r = appendTx(u, {
          type: to.id === STOCK ? "DEPOSIT" : "WITHDRAW", date, cash: amount,
          note: str(b.note, 200) || (to.id === STOCK ? "Nạp từ Sổ Chi" : "Rút về Sổ Chi"),
        });
        stockTxId = r.tx.id;
      } catch (e) {
        throw httpError(400, "Sổ chứng khoán không nhận giao dịch này: " + e.message);
      }
    }
    const id = uid();
    q.run(
      "INSERT INTO transfers (id,user_id,from_account,to_account,amount,date,note,stock_tx_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      id, u, from.id, to.id, amount, date, str(b.note, 200), stockTxId, now()
    );
    return { transfer: q.get("SELECT * FROM transfers WHERE id=?", id), accounts: accountsWithBalance(u) };
  });

  route("DELETE", "/api/transfers/:id", (ctx) => {
    const t = q.get("SELECT * FROM transfers WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
    if (!t) throw httpError(404, "Không tìm thấy lần chuyển tiền");
    if (t.stock_tx_id) {
      const last = q.get("SELECT id FROM stock_tx WHERE user_id=? AND voided=0 ORDER BY seq DESC LIMIT 1", ctx.userId);
      need(last && last.id === t.stock_tx_id,
        "Sổ chứng khoán đã có giao dịch sau lần nạp/rút này. Hủy các giao dịch sau trong tab Đầu tư trước.");
      undoLast(ctx.userId, "xoa lan chuyen tien trong So Chi");
    }
    q.run("DELETE FROM transfers WHERE id=? AND user_id=?", t.id, ctx.userId);
    return { ok: true, accounts: accountsWithBalance(ctx.userId) };
  });

  /* ---- cho claim cong ty ---- */
  const claimRows = (where, tail, ...p) => q.all(
    `SELECT t.*, c.name AS category_name FROM transactions t
     LEFT JOIN categories c ON c.id=t.category_id
     WHERE ${where} ORDER BY t.date DESC, t.created_at DESC ${tail}`, ...p
  );

  route("GET", "/api/claims", (ctx) => {
    const u = ctx.userId;
    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const pending = claimRows("t.user_id=? AND t.claim_status='pending'", "", u);
    return {
      pending,
      pending_total: pending.reduce((s, t) => s + t.amount, 0),
      untracked: claimRows("t.user_id=? AND t.type IN ('company','business') AND t.claim_status IS NULL AND t.date>=?", "LIMIT 100", u, since),
      done: claimRows("t.user_id=? AND t.claim_status IN ('claimed','rejected')", "LIMIT 15", u),
      linked: ctx.query.income ? claimRows("t.user_id=? AND t.claim_income_id=?", "", u, String(ctx.query.income)) : [],
    };
  });

  route("POST", "/api/claims/mark", (ctx) => {
    const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.slice(0, 500).map(String) : [];
    const st = ctx.body.status;
    need(ids.length > 0, "Chưa chọn khoản chi nào");
    need(["pending", "claimed", "rejected", "none"].includes(st), "Trạng thái claim không hợp lệ");
    let changed = 0;
    for (const id of ids) {
      changed += q.run(
        "UPDATE transactions SET claim_status=?, claim_income_id=NULL WHERE id=? AND user_id=? AND type IN ('company','business')",
        st === "none" ? null : st, id, ctx.userId
      ).changes;
    }
    return { ok: true, changed, claims: claimSummary(ctx.userId) };
  });

  /* ---- thu nhap dinh ky ---- */
  const ruleBody = (u, b, cur = {}) => {
    const amount = int(b.amount);
    need(amount > 0, "Số tiền dự kiến phải lớn hơn 0");
    const day = Math.min(28, Math.max(1, int(b.day) || cur.day || 1));
    return {
      name: str(b.name, 60).trim() || cur.name || "Lương",
      amount,
      source: INCOME_SOURCES.includes(b.source) ? b.source : cur.source || "salary",
      account_id: ownAccount(u, b.account_id)?.id || null,
      day,
      next_date: isDate(b.next_date) ? b.next_date : cur.next_date && cur.day === day ? cur.next_date : firstRuleDate(day),
      active: b.active === false ? 0 : 1,
    };
  };

  route("GET", "/api/income-rules", (ctx) => ({ rules: incomeRulesWithStatus(ctx.userId) }));

  route("POST", "/api/income-rules", (ctx) => {
    const r = ruleBody(ctx.userId, ctx.body);
    q.run(
      "INSERT INTO income_rules (id,user_id,name,amount,source,account_id,day,next_date,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      uid(), ctx.userId, r.name, r.amount, r.source, r.account_id, r.day, r.next_date, r.active, now()
    );
    return { rules: incomeRulesWithStatus(ctx.userId) };
  });

  route("PUT", "/api/income-rules/:id", (ctx) => {
    const cur = q.get("SELECT * FROM income_rules WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
    if (!cur) throw httpError(404, "Không tìm thấy khoản thu định kỳ");
    const r = ruleBody(ctx.userId, ctx.body, cur);
    q.run(
      "UPDATE income_rules SET name=?,amount=?,source=?,account_id=?,day=?,next_date=?,active=? WHERE id=? AND user_id=?",
      r.name, r.amount, r.source, r.account_id, r.day, r.next_date, r.active, cur.id, ctx.userId
    );
    return { rules: incomeRulesWithStatus(ctx.userId) };
  });

  route("DELETE", "/api/income-rules/:id", (ctx) => {
    q.run("DELETE FROM income_rules WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
    return { rules: incomeRulesWithStatus(ctx.userId) };
  });

  /* ---- doi soat so du ---- */
  route("POST", "/api/accounts/:id/reconcile", (ctx) => {
    const u = ctx.userId;
    const acc = accountsWithBalance(u).find((a) => a.id === ctx.params.id);
    if (!acc) throw httpError(404, "Không tìm thấy tài khoản");
    const raw = ctx.body.actual;
    need(raw !== undefined && raw !== null && raw !== "" && Number.isFinite(Number(raw)), "Nhập số dư thực tế");
    const actual = int(raw);
    const date = isDate(ctx.body.date) ? ctx.body.date : todayVN();
    need(date >= acc.opening_date, "Ngày đối soát phải từ ngày bắt đầu theo dõi tài khoản");
    const diff = actual - acc.balance;
    if (diff !== 0) {
      q.run(
        "INSERT INTO account_adjustments (id,user_id,account_id,date,amount,actual,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
        uid(), u, acc.id, date, diff, actual, str(ctx.body.note, 200), now()
      );
    }
    return { diff, accounts: accountsWithBalance(u) };
  });

  route("GET", "/api/accounts/:id/adjustments", (ctx) => ({
    adjustments: q.all(
      "SELECT * FROM account_adjustments WHERE user_id=? AND account_id=? ORDER BY date DESC, created_at DESC LIMIT 20",
      ctx.userId, ctx.params.id
    ),
  }));

  /* ---- muc tieu tiet kiem ---- */
  const goalBody = (u, b, cur = {}) => {
    const target = int(b.target);
    need(target > 0, "Số tiền mục tiêu phải lớn hơn 0");
    const name = str(b.name, 60).trim() || cur.name;
    need(name, "Cần có tên mục tiêu");
    return { name, target, deadline: isDate(b.deadline) ? b.deadline : null,
      account_id: ownAccount(u, b.account_id)?.id || null, saved: Math.max(0, int(b.saved)) };
  };

  route("GET", "/api/goals", (ctx) => ({ goals: goalsWithProgress(ctx.userId) }));

  route("POST", "/api/goals", (ctx) => {
    const g = goalBody(ctx.userId, ctx.body);
    q.run(
      "INSERT INTO goals (id,user_id,name,target,deadline,account_id,saved,archived,created_at) VALUES (?,?,?,?,?,?,?,0,?)",
      uid(), ctx.userId, g.name, g.target, g.deadline, g.account_id, g.saved, now()
    );
    return { goals: goalsWithProgress(ctx.userId) };
  });

  route("PUT", "/api/goals/:id", (ctx) => {
    const cur = q.get("SELECT * FROM goals WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
    if (!cur) throw httpError(404, "Không tìm thấy mục tiêu");
    const g = goalBody(ctx.userId, ctx.body, cur);
    q.run("UPDATE goals SET name=?,target=?,deadline=?,account_id=?,saved=? WHERE id=? AND user_id=?",
      g.name, g.target, g.deadline, g.account_id, g.saved, cur.id, ctx.userId);
    return { goals: goalsWithProgress(ctx.userId) };
  });

  route("DELETE", "/api/goals/:id", (ctx) => {
    q.run("DELETE FROM goals WHERE id=? AND user_id=?", ctx.params.id, ctx.userId);
    return { goals: goalsWithProgress(ctx.userId) };
  });

  /* ---- tai san rong theo thang ---- */
  route("POST", "/api/networth/snapshot", (ctx) => {
    const s = ctx.body.stock;
    return { snapshot: saveNetworthSnapshot(ctx.userId, s === null || s === undefined || s === "" ? null : Number(s)) };
  });

  route("GET", "/api/networth", (ctx) => {
    const rows = q.all("SELECT * FROM networth_snapshots WHERE user_id=? ORDER BY date", ctx.userId);
    const byMonth = {};
    rows.forEach((r) => { byMonth[r.date.slice(0, 7)] = r; }); // moc cuoi cung cua moi thang
    return { months: Object.values(byMonth).slice(-12), days: rows.length };
  });

  /* ---- dong tien theo thang: thu, chi, con lai ---- */
  route("GET", "/api/cashflow", (ctx) => {
    const n = Math.min(24, Math.max(1, Number(ctx.query.months) || 12));
    const u = ctx.userId;
    const inc = Object.fromEntries(q.all(
      "SELECT substr(date,1,7) AS ym, SUM(amount) AS s FROM incomes WHERE user_id=? GROUP BY ym", u
    ).map((r) => [r.ym, r.s]));
    const exp = Object.fromEntries(q.all(
      "SELECT substr(date,1,7) AS ym, SUM(amount) AS s FROM transactions WHERE user_id=? GROUP BY ym", u
    ).map((r) => [r.ym, r.s]));
    const out = [];
    const [y, m] = todayISO().slice(0, 7).split("-").map(Number);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const ym = d.toISOString().slice(0, 7);
      const income = inc[ym] || 0;
      const expense = exp[ym] || 0;
      out.push({ ym, income, expense, net: income - expense });
    }
    const month = /^\d{4}-\d{2}$/.test(ctx.query.month || "") ? ctx.query.month : null;
    const by_source = month
      ? q.all("SELECT source, SUM(amount) AS total, COUNT(*) AS n FROM incomes WHERE user_id=? AND substr(date,1,7)=? GROUP BY source ORDER BY total DESC", u, month)
      : [];
    return { months: out, by_source };
  });
}

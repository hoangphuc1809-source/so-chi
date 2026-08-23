import { q, uid, now } from "./db.js";
import { rebuild } from "./ledger.js";

/** Lấy đúng mảng giao dịch (chưa hủy) để đưa vào rebuild — nguyên văn object gốc. */
export function loadTxs(userId) {
  return q
    .all("SELECT raw FROM stock_tx WHERE user_id=? AND voided=0 ORDER BY date, seq", userId)
    .map((r) => JSON.parse(r.raw));
}

export function loadVoided(userId) {
  return q
    .all("SELECT raw, voided_at, void_reason FROM stock_tx WHERE user_id=? AND voided=1 ORDER BY seq", userId)
    .map((r) => ({ ...JSON.parse(r.raw), voided_at: r.voided_at, reason: r.void_reason }));
}

export function state(userId) {
  return rebuild(loadTxs(userId));
}

function insertTx(userId, tx, voided = false, voidedAt = null, reason = null) {
  q.run(
    `INSERT INTO stock_tx (id,user_id,seq,type,date,symbol,qty,price_vnd,cash,note,raw,voided,voided_at,void_reason,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id,id) DO UPDATE SET
       seq=excluded.seq, type=excluded.type, date=excluded.date, symbol=excluded.symbol,
       qty=excluded.qty, price_vnd=excluded.price_vnd, cash=excluded.cash, note=excluded.note,
       raw=excluded.raw, voided=excluded.voided, voided_at=excluded.voided_at,
       void_reason=excluded.void_reason`,
    String(tx.id), userId, Number(tx.seq) || 0, String(tx.type), String(tx.date),
    tx.symbol || null,
    tx.qty != null ? Number(tx.qty) : null,
    tx.priceVND != null ? Number(tx.priceVND) : null,
    tx.cash != null ? Math.round(Number(tx.cash)) : null,
    tx.note || null,
    JSON.stringify(tx),
    voided ? 1 : 0, voidedAt, reason, now()
  );
}

/**
 * Nhập toàn bộ sổ từ portfolio-bot. Idempotent: chạy lại nhiều lần cho cùng kết quả.
 * KHÔNG xóa gì bên gateway — file gốc vẫn là bản gốc cho tới khi đối chiếu xong.
 */
export function importLedger(userId, payload) {
  const txs = Array.isArray(payload.transactions) ? payload.transactions : [];
  const voided = Array.isArray(payload.voided) ? payload.voided : [];
  if (!txs.length && !voided.length) throw new Error("Sổ giao dịch rỗng, không nhập");

  const seen = new Set();
  for (const tx of txs) {
    if (!tx || !tx.id || !tx.type || !tx.date) throw new Error("Giao dịch thiếu id/type/date");
    if (seen.has(tx.id)) throw new Error(`Trùng id giao dịch: ${tx.id}`);
    seen.add(tx.id);
  }

  // Thay the toan bo, tranh sot giao dich da bi xoa ben gateway.
  q.run("DELETE FROM stock_tx WHERE user_id=?", userId);
  txs.forEach((tx) => insertTx(userId, tx));
  voided.forEach((tx) => insertTx(userId, tx, true, tx.voided_at || null, tx.reason || null));

  return { imported: txs.length, voided: voided.length };
}

/**
 * Đối chiếu trạng thái dựng từ SQLite với trạng thái do portfolio-bot tính
 * trên file gốc. Chỉ khi mọi con số khớp tuyệt đối thì mới được phép cho app ghi.
 */
export function reconcile(userId, expected) {
  const got = state(userId);
  const diffs = [];

  const cmp = (label, a, b, tol = 0) => {
    const x = Math.round(Number(a) || 0);
    const y = Math.round(Number(b) || 0);
    if (Math.abs(x - y) > tol) diffs.push({ field: label, so_chi: x, portfolio_bot: y, lech: x - y });
  };

  cmp("tien_mat", got.cash, expected.cash);

  const gotSyms = Object.keys(got.positions).sort();
  const expSyms = Object.keys(expected.positions || {}).sort();
  if (gotSyms.join(",") !== expSyms.join(",")) {
    diffs.push({ field: "danh_sach_ma", so_chi: gotSyms.join(","), portfolio_bot: expSyms.join(",") });
  }

  for (const sym of gotSyms) {
    const a = got.positions[sym];
    const b = (expected.positions || {})[sym];
    if (!b) continue;
    cmp(`${sym}.so_luong`, a.qty, b.qty);
    cmp(`${sym}.gia_von_tong`, a.costTotal, b.costTotal, 1); // sai so lam tron 1d
  }

  const gotRealized = (got.realized || []).reduce((s, r) => s + r.pl, 0);
  const expRealized = (expected.realized || []).reduce((s, r) => s + (r.pl || 0), 0);
  cmp("lai_da_thuc_hien", gotRealized, expRealized, 1);
  cmp("so_lan_ban", (got.realized || []).length, (expected.realized || []).length);

  if (got.error || expected.error) {
    diffs.push({ field: "loi_engine", so_chi: got.error || null, portfolio_bot: expected.error || null });
  }

  return {
    khop: diffs.length === 0,
    so_giao_dich: loadTxs(userId).length,
    tien_mat: got.cash,
    so_ma: gotSyms.length,
    lai_da_thuc_hien: gotRealized,
    lech: diffs,
  };
}

/** Danh mục hiện tại theo định dạng mà tab Đầu tư đang dùng. */
export function positions(userId) {
  const st = state(userId);
  if (st.error) return { error: st.error };
  const list = Object.entries(st.positions).map(([symbol, p]) => ({
    symbol,
    qty: p.qty,
    avg_cost: Math.round(p.avgCostVND),
    cost_total: p.costTotal,
    market_price: null,
    market_value: null,
    pl: null,
    pl_pct: null,
    lots: p.lots.length,
    oldest_lot: p.lots.length ? p.lots[0].date : null,
  }));
  return {
    ok: true,
    source: "sochi",
    cash: st.cash,
    margin_debt: st.cash < 0 ? -st.cash : 0,
    cost_value: list.reduce((s, p) => s + p.cost_total, 0),
    realized_pl: (st.realized || []).reduce((s, r) => s + r.pl, 0),
    positions: list,
    tx_count: loadTxs(userId).length,
  };
}

/* ============================ Ghi sổ ============================ */

const TX_TYPES = {
  BUY: { needs: ["symbol", "qty", "priceVND"], label: "Mua" },
  SELL: { needs: ["symbol", "qty", "priceVND"], label: "Bán" },
  DEPOSIT: { needs: ["cash"], label: "Nạp tiền" },
  WITHDRAW: { needs: ["cash"], label: "Rút tiền" },
  INIT_CASH: { needs: ["cash"], label: "Khởi tạo" },
  DIVIDEND_CASH: { needs: ["cash"], label: "Cổ tức tiền" },
  INTEREST: { needs: ["cash"], label: "Lãi/phí margin" },
  ADJUSTMENT: { needs: ["cash"], label: "Điều chỉnh" },
  STOCK_BONUS: { needs: ["symbol", "qty"], label: "Cổ phiếu thưởng" },
};

export const txTypes = () =>
  Object.entries(TX_TYPES).map(([id, v]) => ({ id, label: v.label, needs: v.needs }));

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

function nextSeq(userId) {
  const r = q.get("SELECT COALESCE(MAX(seq),0) AS m FROM stock_tx WHERE user_id=?", userId);
  return r.m + 1;
}

/**
 * Thêm giao dịch. Trước khi ghi, dựng thử toàn bộ sổ kèm giao dịch mới:
 * nếu engine báo lỗi (ví dụ bán nhiều hơn số đang giữ) thì TỪ CHỐI, không ghi.
 * Nhờ vậy sổ trong database không bao giờ ở trạng thái hỏng.
 */
export function appendTx(userId, input) {
  const type = String(input.type || "").toUpperCase();
  const spec = TX_TYPES[type];
  if (!spec) throw new Error("Loại giao dịch không hợp lệ");
  if (!isDate(input.date)) throw new Error("Ngày không hợp lệ");

  const tx = { type, date: input.date };

  if (spec.needs.includes("symbol")) {
    const sym = String(input.symbol || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(sym)) throw new Error("Mã chứng khoán phải đúng 3 chữ cái");
    tx.symbol = sym;
  }
  if (spec.needs.includes("qty")) {
    const qty = Math.round(Number(input.qty) || 0);
    if (qty <= 0) throw new Error("Số lượng phải lớn hơn 0");
    tx.qty = qty;
  }
  if (spec.needs.includes("priceVND")) {
    const price = Number(input.priceVND) || 0;
    if (price <= 0) throw new Error("Giá phải lớn hơn 0");
    if (price < 100) throw new Error("Giá phải nhập theo đồng, ví dụ 25900 chứ không phải 25,9");
    tx.priceVND = price;
  }
  if (spec.needs.includes("cash")) {
    const cash = Math.round(Number(input.cash) || 0);
    if (cash === 0) throw new Error("Số tiền phải khác 0");
    if (["DEPOSIT", "WITHDRAW"].includes(type) && cash < 0) {
      throw new Error("Nhập số dương, loại giao dịch đã quyết định dấu");
    }
    tx.cash = cash;
  }
  if (input.note) tx.note = String(input.note).slice(0, 200);

  if (type === "INIT_CASH" && loadTxs(userId).some((t) => t.type === "INIT_CASH")) {
    throw new Error("Sổ đã có giao dịch khởi tạo, dùng Điều chỉnh nếu cần sửa số dư");
  }

  const seq = nextSeq(userId);
  const full = { id: `tx${String(seq).padStart(4, "0")}`, seq, ...tx };

  // Dung thu truoc khi ghi that.
  const trial = rebuild([...loadTxs(userId), full]);
  if (trial.error) throw new Error(trial.error);

  insertTx(userId, full);
  return { tx: full, state: summarize(trial) };
}

/** Hủy giao dịch cuối. Không xóa — chuyển sang trạng thái đã hủy, giống portfolio-bot. */
export function undoLast(userId, reason = "nguoi dung huy") {
  const last = q.get(
    "SELECT id, raw FROM stock_tx WHERE user_id=? AND voided=0 ORDER BY seq DESC LIMIT 1",
    userId
  );
  if (!last) throw new Error("Không còn giao dịch nào để hủy");
  q.run(
    "UPDATE stock_tx SET voided=1, voided_at=?, void_reason=? WHERE user_id=? AND id=?",
    new Date().toISOString(), String(reason).slice(0, 200), userId, last.id
  );
  return { undone: JSON.parse(last.raw), state: summarize(state(userId)) };
}

function summarize(st) {
  return {
    cash: st.cash,
    positions: Object.fromEntries(
      Object.entries(st.positions).map(([k, v]) => [k, { qty: v.qty, cost_total: v.costTotal }])
    ),
    realized_pl: (st.realized || []).reduce((s, r) => s + r.pl, 0),
    error: st.error || null,
  };
}

/** Lịch sử giao dịch, mới nhất trước. */
export function history(userId, limit = 200) {
  const rows = q.all(
    `SELECT id, seq, type, date, symbol, qty, price_vnd, cash, note, voided, voided_at
     FROM stock_tx WHERE user_id=?
     ORDER BY date DESC, seq DESC LIMIT ?`,
    userId, Math.min(Number(limit) || 200, 1000)
  );
  return rows.map((r) => ({
    ...r,
    label: (TX_TYPES[r.type] || {}).label || r.type,
    voided: Boolean(r.voided),
  }));
}

/** Các lần bán đã chốt lãi lỗ, kèm chi tiết khớp FIFO. */
export function realizedTrades(userId) {
  const st = state(userId);
  return (st.realized || []).slice().reverse();
}

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

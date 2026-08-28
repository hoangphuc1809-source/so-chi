import { q, db, uid, now } from "./db.js";
import { rebuild, settleDate, daysBetween } from "./ledger.js";

/**
 * Biểu phí của tài khoản này.
 *
 * Phí mua nằm trong giá vốn, nên đổi số ở đây là đổi giá vốn của TOÀN BỘ lệnh
 * mua đã ghi, kể cả lệnh từ nhiều tháng trước. Đó là hành vi đúng — sổ luôn
 * tính lại từ đầu nên không có chuyện hai lệnh cùng loại lại chịu hai mức phí
 * khác nhau — nhưng phải biết trước khi sửa.
 *
 * Mặc định để 0 đúng như bản gốc port từ portfolio-bot, để sổ của người chưa
 * cấu hình gì không tự nhiên đổi số.
 */
export function getFees(userId) {
  return {
    buyPct: getSetting(userId, "fee_buy_pct", 0),
    sellPct: getSetting(userId, "fee_sell_pct", 0),
    taxPct: getSetting(userId, "fee_tax_pct", 0.1),
  };
}

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
  return rebuild(loadTxs(userId), getFees(userId));
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
  const today = new Date().toISOString().slice(0, 10);

  const list = Object.entries(st.positions).map(([symbol, p]) => {
    // CP mua xong phai cho ve tai khoan (T+2) moi ban duoc.
    // Tinh theo tung lo vi cac lo mua khac ngay se ve khac ngay.
    let sellable = 0;
    const pending = [];
    for (const lot of p.lots) {
      const settle = settleDate(lot.date);
      // rebuild() doi ten khi tra ve: trong queue la `remaining`, ra ngoai la `qty`.
      if (settle <= today) sellable += lot.qty;
      else pending.push({ qty: lot.qty, buy_date: lot.date, settle_date: settle });
    }
    return {
      symbol,
      qty: p.qty,
      sellable,
      pending_qty: p.qty - sellable,
      pending,
      avg_cost: Math.round(p.avgCostVND),
      cost_total: p.costTotal,
      market_price: null,
      market_value: null,
      pl: null,
      pl_pct: null,
      lots: p.lots.length,
      oldest_lot: p.lots.length ? p.lots[0].date : null,
    };
  });
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
  const trial = rebuild([...loadTxs(userId), full], getFees(userId));
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
export function history(userId, limit = 200, includeVoided = false) {
  const rows = q.all(
    `SELECT id, seq, type, date, symbol, qty, price_vnd, cash, note, voided, voided_at
     FROM stock_tx WHERE user_id=? AND (voided=0 OR ?=1)
     ORDER BY date DESC, seq DESC LIMIT ?`,
    userId, includeVoided ? 1 : 0, Math.min(Number(limit) || 200, 1000)
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

/* ==================== GĐ2: Tiền T+2 ==================== */

/**
 * Tách tiền mặt thành phần đã về và phần còn chờ.
 *
 * Engine FIFO cộng tiền bán ngay tại ngày bán — đúng về sổ sách, nhưng không
 * phải số tiền rút ra hay mua tiếp được hôm nay. Tiền bán về T+2 giống cổ
 * phiếu mua. Tính ở đây, KHÔNG sửa ledger.js: engine đó đã chạy với tiền thật
 * và mọi thay đổi trong nó sẽ lan ra toàn bộ số liệu lịch sử.
 *
 * Chỉ là lớp hiển thị — không ảnh hưởng NAV, giá vốn hay lãi/lỗ.
 */
export function cashFlow(userId) {
  const st = state(userId);
  if (st.error) return { error: st.error };
  const today = new Date().toISOString().slice(0, 10);

  const pending = [];
  for (const r of st.realized || []) {
    const settle = settleDate(r.date);
    if (settle > today) {
      pending.push({
        symbol: r.symbol, qty: r.qty, sell_date: r.date,
        settle_date: settle, amount: r.proceedsNet,
      });
    }
  }
  const pendingTotal = pending.reduce((s, p) => s + p.amount, 0);

  return {
    cash: st.cash,                        // số sổ sách, gồm cả tiền chưa về
    pending_in: pendingTotal,             // tiền bán đang trên đường về
    available: st.cash - pendingTotal,    // thực sự dùng được hôm nay
    margin_debt: st.cash < 0 ? -st.cash : 0,
    pending: pending.sort((a, b) => (a.settle_date < b.settle_date ? -1 : 1)),
  };
}

/* ==================== GĐ2: Đối chiếu với công ty chứng khoán ==================== */

/**
 * Ngưỡng cho phép tự ghi bút toán điều chỉnh.
 *
 * Ngưỡng cũ trong thiết kế GĐ2 là "2% NAV hoặc 5 triệu". Tôi đổi, vì ở quy mô
 * sổ hiện tại hai vế đó gần trùng nhau (2% của 282tr ≈ 5,6tr) nên thực chất chỉ
 * còn một ngưỡng 5 triệu — quá rộng. Một lệnh mua 100 cổ giá 45 nghìn là 4,5
 * triệu, vẫn lọt dưới ngưỡng và sẽ bị ghi nhầm thành lãi vay, sai vĩnh viễn
 * trong sổ.
 *
 * Ngưỡng ở đây bám theo thứ thực sự sinh ra chênh lệch hợp lệ: lãi vay margin.
 * Lãi TCBS quanh 0,04%/ngày, nhân số ngày kể từ mốc đối chiếu trước, nhân 3 làm
 * biên an toàn cho phí lặt vặt. Sàn 300 nghìn để lần đối chiếu sát nhau không
 * ra ngưỡng gần bằng 0.
 */
const DAILY_MARGIN_RATE = 0.0004;
const SAFETY_FACTOR = 3;
const FLOOR = 300_000;

function autoThreshold(debt, days) {
  return Math.max(FLOOR, Math.round(debt * DAILY_MARGIN_RATE * Math.max(days, 1) * SAFETY_FACTOR));
}

export function lastReconcile(userId) {
  return q.get("SELECT * FROM stock_reconcile WHERE user_id=? ORDER BY date DESC, created_at DESC LIMIT 1", userId) || null;
}

/**
 * So sổ với số thật đọc từ app công ty chứng khoán. CHỈ phân tích, không ghi.
 *
 * Quy tắc quan trọng: nếu số lượng cổ phiếu lệch thì tuyệt đối không đề xuất
 * ghi điều chỉnh tiền. Lệch số lượng nghĩa là thiếu hẳn một lệnh mua hoặc bán,
 * và ghi một bút toán tiền lên trên đó chỉ che mất lỗi thật chứ không sửa được
 * gì — giá vốn vẫn sai, lãi lỗ vẫn sai.
 */
export function checkAgainstBroker(userId, input) {
  const st = state(userId);
  if (st.error) return { error: st.error };

  const date = String(input.date || "").slice(0, 10);
  if (!isDate(date)) throw new Error("Ngày không hợp lệ");
  if (input.cash === undefined || input.cash === null || input.cash === "") {
    throw new Error("Cần nhập số dư tiền thật từ công ty chứng khoán");
  }
  const cashBroker = Math.round(Number(input.cash));
  if (!Number.isFinite(cashBroker)) throw new Error("Số dư tiền không hợp lệ");

  const diff = cashBroker - st.cash;

  // Đối chiếu vị thế nếu người dùng có nhập
  const raw = input.positions && typeof input.positions === "object" ? input.positions : null;
  const posDiff = [];
  if (raw) {
    const book = Object.fromEntries(Object.entries(st.positions).map(([k, v]) => [k, v.qty]));
    const broker = {};
    for (const [k, v] of Object.entries(raw)) {
      const sym = String(k).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(sym)) throw new Error(`Mã không hợp lệ: ${k}`);
      broker[sym] = Math.round(Number(v) || 0);
    }
    for (const sym of new Set([...Object.keys(book), ...Object.keys(broker)])) {
      const b = book[sym] || 0, r = broker[sym] || 0;
      if (b !== r) posDiff.push({ symbol: sym, so_sach: b, thuc_te: r, lech: r - b });
    }
  }

  const prev = lastReconcile(userId);
  const days = prev ? Math.max(daysBetween(prev.date, date), 1) : 30;
  const debt = st.cash < 0 ? -st.cash : 0;
  const threshold = autoThreshold(debt, days);

  const positionsOk = !raw || posDiff.length === 0;
  let canAutoWrite = true;
  let reason = null;

  if (diff === 0) {
    canAutoWrite = false;
    reason = "Không lệch, không cần ghi gì.";
  } else if (!positionsOk) {
    canAutoWrite = false;
    reason = "Số lượng cổ phiếu lệch — gần như chắc chắn thiếu một lệnh mua hoặc bán. " +
             "Phải nhập bổ sung lệnh còn thiếu, không được ghi điều chỉnh tiền để lấp.";
  } else if (Math.abs(diff) > threshold) {
    canAutoWrite = false;
    reason = `Lệch ${fmtVnd(Math.abs(diff))} vượt ngưỡng ${fmtVnd(threshold)} cho ${days} ngày. ` +
             "Chênh lệch cỡ này hiếm khi là lãi vay — kiểm tra lại xem có giao dịch nào chưa nhập.";
  } else if (!raw) {
    reason = "Chưa đối chiếu số lượng cổ phiếu. Nên nhập để chắc chắn không thiếu lệnh nào.";
  }

  return {
    date,
    tien_so_sach: st.cash,
    tien_thuc_te: cashBroker,
    lech: diff,
    huong: diff === 0 ? "khop" : diff > 0 ? "thuc_te_nhieu_hon" : "thuc_te_it_hon",
    nguong: threshold,
    so_ngay: days,
    moc_truoc: prev ? prev.date : null,
    du_no_margin: debt,
    vi_the_khop: positionsOk,
    lech_vi_the: posDiff,
    tu_ghi_duoc: canAutoWrite,
    ghi_chu: reason,
    goi_y_loai: diff < 0 ? "INTEREST" : "ADJUSTMENT",
  };
}

const ADJ_KINDS = {
  INTEREST: "Lãi vay và phí",
  DIVIDEND_CASH: "Cổ tức tiền mặt",
  ADJUSTMENT: "Điều chỉnh khác",
};

/**
 * Ghi bút toán điều chỉnh sau khi đối chiếu, rồi đóng mốc khóa sổ.
 *
 * Kiểm tra ngưỡng lại ở đây chứ không tin phía giao diện — nút bấm có thể bị
 * gọi thẳng qua API.
 */
export function applyReconcile(userId, input) {
  const chk = checkAgainstBroker(userId, input);
  if (chk.error) throw new Error(chk.error);
  if (!chk.tu_ghi_duoc) throw new Error(chk.ghi_chu || "Không đủ điều kiện ghi tự động");

  const kind = String(input.kind || chk.goi_y_loai).toUpperCase();
  if (!ADJ_KINDS[kind]) throw new Error("Loại bút toán không hợp lệ");

  const note = (input.note ? String(input.note).slice(0, 150) : ADJ_KINDS[kind]) +
               ` (đối chiếu ${chk.date})`;
  const { tx } = appendTx(userId, { type: kind, date: chk.date, cash: chk.lech, note });

  const id = `rc${Date.now().toString(36)}`;
  q.run(
    `INSERT INTO stock_reconcile (id,user_id,date,cash_broker,cash_book,diff,positions_ok,adjustment_id,note,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, userId, chk.date, chk.tien_thuc_te, chk.tien_so_sach, chk.lech,
    chk.vi_the_khop ? 1 : 0, tx.id, note, Date.now()
  );

  return { ...chk, da_ghi: tx, moc_id: id };
}

/** Đóng mốc mà không ghi gì — dùng khi đối chiếu ra khớp tuyệt đối. */
export function markReconciled(userId, input) {
  const chk = checkAgainstBroker(userId, input);
  if (chk.error) throw new Error(chk.error);
  if (chk.lech !== 0) throw new Error("Còn lệch tiền, không thể đóng mốc suông");
  if (!chk.vi_the_khop) throw new Error("Số lượng cổ phiếu còn lệch");

  const id = `rc${Date.now().toString(36)}`;
  q.run(
    `INSERT INTO stock_reconcile (id,user_id,date,cash_broker,cash_book,diff,positions_ok,adjustment_id,note,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, userId, chk.date, chk.tien_thuc_te, chk.tien_so_sach, 0, 1, null, "Khớp tuyệt đối", Date.now()
  );
  return { ...chk, moc_id: id };
}

export function reconcileHistory(userId, limit = 24) {
  return q.all(
    "SELECT * FROM stock_reconcile WHERE user_id=? ORDER BY date DESC, created_at DESC LIMIT ?",
    userId, limit
  );
}

function fmtVnd(n) {
  return Math.round(n).toLocaleString("vi-VN") + "đ";
}

/* ==================== GĐ3: Báo cáo theo kỳ ==================== */

/** Nhãn kỳ theo quy ước đang dùng ở dashboard MSI: 2026W20 / 2026 M05 / 2026 Q2. */
function periodOf(dateISO, kind) {
  const d = new Date(dateISO + "T00:00:00Z");
  const y = d.getUTCFullYear();
  if (kind === "year") return String(y);
  if (kind === "quarter") return `${y} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  if (kind === "month") return `${y} M${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  // ISO week
  const t = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - start) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}W${String(wk).padStart(2, "0")}`;
}

/**
 * Báo cáo lãi lỗ đã chốt theo kỳ.
 *
 * Chỉ tính lãi/lỗ ĐÃ THỰC HIỆN — tức đã bán xong. Lãi lỗ tạm tính của phần
 * đang giữ cố tình không gộp vào đây, vì nó đổi theo giá từng phút và sẽ làm
 * báo cáo kỳ đã đóng thay đổi mỗi lần mở lại.
 */
export function periodReport(userId, kind = "month", limit = 12) {
  if (!["week", "month", "quarter", "year"].includes(kind)) {
    throw new Error("Kỳ báo cáo không hợp lệ");
  }
  const st = state(userId);
  if (st.error) return { error: st.error };

  const buckets = new Map();
  const touch = (p) => {
    if (!buckets.has(p)) {
      buckets.set(p, {
        ky: p, lai_da_chot: 0, so_lan_ban: 0, so_lan_lai: 0, so_lan_lo: 0,
        tien_ban: 0, gia_von_ban: 0, nap: 0, rut: 0, lai_vay: 0, co_tuc: 0, dieu_chinh: 0,
      });
    }
    return buckets.get(p);
  };

  for (const r of st.realized || []) {
    const b = touch(periodOf(r.date, kind));
    b.lai_da_chot += r.pl;
    b.so_lan_ban += 1;
    b.tien_ban += r.proceedsNet;
    b.gia_von_ban += r.costBasis;
    if (r.pl >= 0) b.so_lan_lai += 1; else b.so_lan_lo += 1;
  }

  for (const t of loadTxs(userId)) {
    const b = touch(periodOf(t.date, kind));
    if (t.type === "DEPOSIT") b.nap += t.cash;
    else if (t.type === "WITHDRAW") b.rut += t.cash;
    else if (t.type === "INTEREST") b.lai_vay += t.cash;
    else if (t.type === "DIVIDEND_CASH") b.co_tuc += t.cash;
    else if (t.type === "ADJUSTMENT") b.dieu_chinh += t.cash;
  }

  const rows = [...buckets.values()]
    .map((b) => ({
      ...b,
      ty_suat: b.gia_von_ban > 0 ? (b.lai_da_chot / b.gia_von_ban) * 100 : 0,
      ty_le_thang: b.so_lan_ban > 0 ? (b.so_lan_lai / b.so_lan_ban) * 100 : 0,
      rong: b.lai_da_chot + b.lai_vay + b.co_tuc + b.dieu_chinh,
    }))
    .sort((a, b) => (a.ky < b.ky ? 1 : -1))
    .slice(0, limit);

  return { ok: true, kind, rows };
}

/** Lãi lỗ đã chốt gom theo mã — xem mã nào thực sự sinh tiền. */
export function bySymbolReport(userId) {
  const st = state(userId);
  if (st.error) return { error: st.error };

  const m = new Map();
  const touch = (s) => {
    if (!m.has(s)) m.set(s, { symbol: s, lai_da_chot: 0, so_lan_ban: 0, so_lan_lai: 0, gia_von_ban: 0, ngay_giu_tb: 0, _hold: 0 });
    return m.get(s);
  };
  for (const r of st.realized || []) {
    const b = touch(r.symbol);
    b.lai_da_chot += r.pl;
    b.so_lan_ban += 1;
    b.gia_von_ban += r.costBasis;
    b._hold += r.holdDays;
    if (r.pl >= 0) b.so_lan_lai += 1;
  }
  const rows = [...m.values()].map((b) => {
    const { _hold, ...rest } = b;
    return {
      ...rest,
      ngay_giu_tb: b.so_lan_ban ? Math.round(_hold / b.so_lan_ban) : 0,
      ty_suat: b.gia_von_ban > 0 ? (b.lai_da_chot / b.gia_von_ban) * 100 : 0,
      dang_giu: st.positions[b.symbol] ? st.positions[b.symbol].qty : 0,
    };
  }).sort((a, b) => b.lai_da_chot - a.lai_da_chot);

  return { ok: true, rows };
}

/* ==================== GĐ3: Mốc giá theo dõi ==================== */

/**
 * Mốc cắt lỗ / chốt lời do CHÍNH NGƯỜI DÙNG đặt cho từng mã.
 *
 * Đây là lời nhắc về ngưỡng bạn đã tự quyết từ trước, không phải khuyến nghị
 * mua bán. App không sinh mốc, không gợi ý mức nào nên đặt, chỉ báo khi giá
 * chạm mốc bạn đã ghi.
 */
export function getAlerts(userId) {
  return q.all("SELECT * FROM stock_alert WHERE user_id=? ORDER BY symbol", userId);
}

export function setAlert(userId, input) {
  const sym = String(input.symbol || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(sym)) throw new Error("Mã chứng khoán phải đúng 3 chữ cái");

  const num = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) throw new Error("Mốc giá không hợp lệ");
    if (n < 100) throw new Error("Nhập giá theo đồng, ví dụ 25900 chứ không phải 25,9");
    return n;
  };
  const stop = num(input.stop);
  const target = num(input.target);
  if (stop === null && target === null) {
    q.run("DELETE FROM stock_alert WHERE user_id=? AND symbol=?", userId, sym);
    return { symbol: sym, deleted: true };
  }
  if (stop !== null && target !== null && stop >= target) {
    throw new Error("Mốc cắt lỗ phải thấp hơn mốc chốt lời");
  }

  const ex = q.get("SELECT id FROM stock_alert WHERE user_id=? AND symbol=?", userId, sym);
  if (ex) {
    q.run("UPDATE stock_alert SET stop=?, target=?, note=?, updated_at=? WHERE id=?",
      stop, target, input.note ? String(input.note).slice(0, 150) : null, Date.now(), ex.id);
    return { symbol: sym, stop, target, updated: true };
  }
  q.run("INSERT INTO stock_alert (id,user_id,symbol,stop,target,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    uid(), userId, sym, stop, target, input.note ? String(input.note).slice(0, 150) : null, Date.now(), Date.now());
  return { symbol: sym, stop, target, created: true };
}

/** Đối chiếu mốc đã đặt với giá hiện tại. Chỉ báo mã đang thực sự giữ. */
export function checkAlerts(userId, prices = {}) {
  const st = state(userId);
  if (st.error) return { error: st.error };
  const hits = [];
  for (const a of getAlerts(userId)) {
    const pos = st.positions[a.symbol];
    if (!pos) continue;
    const px = prices[a.symbol];
    if (!px) continue;
    if (a.stop && px <= a.stop) {
      hits.push({ symbol: a.symbol, loai: "cat_lo", moc: a.stop, gia: px, qty: pos.qty, note: a.note });
    } else if (a.target && px >= a.target) {
      hits.push({ symbol: a.symbol, loai: "chot_loi", moc: a.target, gia: px, qty: pos.qty, note: a.note });
    }
  }
  return { ok: true, hits };
}

/* ==================== GĐ2: Nhập hàng loạt ==================== */

/**
 * Đọc nhiều giao dịch từ text dán vào, mỗi dòng một lệnh.
 *
 * Định dạng do app quy định, KHÔNG phải định dạng tin nhắn của công ty chứng
 * khoán — tôi chưa có mẫu thật nên không đoán. Khi có mẫu, thêm một lớp dịch
 * phía trước hàm này là dùng lại được toàn bộ phần kiểm tra bên dưới.
 *
 *   MUA HCM 5000 25900 13/08
 *   BAN LPB 1000 49400 25/08
 *   NAP 50tr 01/08
 *
 * Trả về danh sách đã phân tích kèm lỗi từng dòng để xem trước. KHÔNG ghi gì.
 */
export function parseBatch(userId, text) {
  const VERBS = {
    MUA: "BUY", BUY: "BUY", B: "BUY",
    BAN: "SELL", SELL: "SELL", S: "SELL",
    NAP: "DEPOSIT", RUT: "WITHDRAW",
    COTUC: "DIVIDEND_CASH", LAIVAY: "INTEREST", DIEUCHINH: "ADJUSTMENT",
    THUONG: "STOCK_BONUS",
  };
  const today = new Date().toISOString().slice(0, 10);

  const parseMoney = (s) => {
    const t = String(s).toLowerCase().replace(/[.,\s]/g, (m) => (m === "," ? "." : ""));
    const m = t.match(/^(-?[\d.]+)(tr|ty|k)?$/);
    if (!m) return null;
    let v = parseFloat(m[1]);
    if (!Number.isFinite(v)) return null;
    if (m[2] === "tr") v *= 1e6;
    else if (m[2] === "ty") v *= 1e9;
    else if (m[2] === "k") v *= 1e3;
    return Math.round(v);
  };
  const parseDay = (s) => {
    if (!s) return today;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (!m) return null;
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
    const d = `${y}-${String(+m[2]).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
    return isDate(d) ? d : null;
  };

  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const rows = lines.map((line, i) => {
    const p = line.split(/\s+/);
    const verb = (p[0] || "").toUpperCase().replace(/[^A-Z]/g, "");
    const type = VERBS[verb];
    if (!type) return { dong: i + 1, raw: line, loi: `Không hiểu lệnh "${p[0]}"` };

    try {
      if (["BUY", "SELL"].includes(type)) {
        const symbol = (p[1] || "").toUpperCase();
        const qty = parseMoney(p[2]);
        const priceVND = parseMoney(p[3]);
        const date = parseDay(p[4]);
        if (!/^[A-Z]{3}$/.test(symbol)) throw new Error("Mã phải đúng 3 chữ cái");
        if (!qty || qty <= 0) throw new Error("Số lượng không hợp lệ");
        if (!priceVND || priceVND < 100) throw new Error("Giá phải theo đồng, ví dụ 25900");
        if (!date) throw new Error("Ngày không hợp lệ");
        return { dong: i + 1, raw: line, tx: { type, symbol, qty, priceVND, date } };
      }
      if (type === "STOCK_BONUS") {
        const symbol = (p[1] || "").toUpperCase();
        const qty = parseMoney(p[2]);
        const date = parseDay(p[3]);
        if (!/^[A-Z]{3}$/.test(symbol)) throw new Error("Mã phải đúng 3 chữ cái");
        if (!qty || qty <= 0) throw new Error("Số lượng không hợp lệ");
        if (!date) throw new Error("Ngày không hợp lệ");
        return { dong: i + 1, raw: line, tx: { type, symbol, qty, date } };
      }
      const cash = parseMoney(p[1]);
      const date = parseDay(p[2]);
      if (cash === null || cash === 0) throw new Error("Số tiền không hợp lệ");
      if (!date) throw new Error("Ngày không hợp lệ");
      return { dong: i + 1, raw: line, tx: { type, cash: Math.abs(cash), date } };
    } catch (e) {
      return { dong: i + 1, raw: line, loi: e.message };
    }
  });

  // Dựng thử toàn bộ để bắt lỗi thứ tự (bán trước khi mua, bán quá số giữ...)
  const good = rows.filter((r) => r.tx);
  let trialError = null;
  if (good.length) {
    let seq = nextSeq(userId);
    const trial = rebuild([
      ...loadTxs(userId),
      ...good.map((r) => ({ id: `tmp${seq}`, seq: seq++, ...r.tx })),
    ], getFees(userId));
    trialError = trial.error || null;
  }

  // Cảnh báo dòng trùng nhau trong chính lô này, và dòng đã có sẵn trong sổ.
  const seen = new Map();
  for (const r of good) {
    const key = `${r.tx.date}|${r.tx.type}|${r.tx.symbol || ""}|${r.tx.qty || ""}|${r.tx.priceVND || r.tx.cash || ""}`;
    if (seen.has(key)) r.canh_bao = `giống hệt dòng ${seen.get(key)} trong lô này`;
    else seen.set(key, r.dong);
  }
  const daCo = findDuplicates(userId, good.map((r) => r.tx));
  const daCoKey = new Set(daCo.map((t) => `${t.date}|${t.type}|${t.symbol || ""}|${t.qty || ""}|${t.priceVND || t.cash || ""}`));
  for (const r of good) {
    const key = `${r.tx.date}|${r.tx.type}|${r.tx.symbol || ""}|${r.tx.qty || ""}|${r.tx.priceVND || r.tx.cash || ""}`;
    if (daCoKey.has(key) && !r.canh_bao) r.canh_bao = "sổ đã có giao dịch y hệt";
  }

  return {
    ok: true,
    tong: rows.length,
    hop_le: good.length,
    loi: rows.filter((r) => r.loi).length,
    canh_bao: good.filter((r) => r.canh_bao).length,
    rows,
    loi_tong_the: trialError,
  };
}

/** Ghi cả lô sau khi người dùng xem trước và xác nhận. Tất cả hoặc không gì cả. */
export function commitBatch(userId, text) {
  const parsed = parseBatch(userId, text);
  if (parsed.loi > 0) throw new Error(`Còn ${parsed.loi} dòng lỗi, sửa hết rồi hãy ghi`);
  if (parsed.loi_tong_the) throw new Error(parsed.loi_tong_the);
  if (!parsed.hop_le) throw new Error("Không có dòng nào để ghi");

  // node:sqlite khong co helper transaction() nhu better-sqlite3 -> tu mo/dong.
  // Ghi ca lo phai la tat ca hoac khong gi ca: mot lo ghi nua chung se de lai
  // so o trang thai vo nghia (vi du mua roi ma thieu lenh ban truoc do).
  const written = [];
  db.exec("BEGIN");
  try {
    for (const r of parsed.rows) {
      if (!r.tx) continue;
      written.push(appendTx(userId, r.tx).tx);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true, da_ghi: written.length, txs: written };
}

/* ==================== Lãi vay margin ước tính ==================== */

/**
 * Ước tính lãi vay margin phải trả.
 *
 * Chạy lại sổ theo từng ngày, ngày nào tiền mặt âm thì cộng lãi cho dư nợ ngày
 * đó. Tính cả thứ bảy chủ nhật vì công ty chứng khoán tính lãi theo ngày lịch,
 * không theo ngày giao dịch.
 *
 * ĐÂY LÀ SỐ ƯỚC TÍNH, không phải số công ty chứng khoán thu. Lãi suất thay đổi
 * theo gói và theo thời điểm, lại còn phí ứng trước tiền bán và các khoản lặt
 * vặt khác không nằm trong sổ. Số thật chỉ có được khi đối chiếu. Mục đích của
 * hàm này là để biết trước khoảng bao nhiêu, và để thấy con số đối chiếu có hợp
 * lý hay không.
 */
export function marginInterest(userId, { annualRate, from, to } = {}) {
  const rate = Number(annualRate) || getSetting(userId, "margin_rate_year", 14.6);
  const txs = loadTxs(userId);
  if (!txs.length) return { ok: true, uoc_tinh: 0, so_ngay_vay: 0, lai_suat_nam: rate, ngay: [] };

  const end = to && isDate(to) ? to : new Date().toISOString().slice(0, 10);
  const prev = lastReconcile(userId);
  let start = from && isDate(from)
    ? from
    : prev ? prev.date : [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))[0].date;

  // KHÔNG tính lãi cho giai đoạn trước ngày khởi tạo sổ.
  //
  // Engine có quy tắc: giao dịch trước ngày khởi tạo chỉ tạo vị thế, không đụng
  // tiền mặt — vì số dư khai lúc khởi tạo đã phản ánh chúng. Nhưng khi chạy lại
  // sổ theo từng ngày, những ngày trước ngày khởi tạo chưa "thấy" giao dịch
  // INIT_CASH nào, nên engine tưởng là chưa khởi tạo và trừ tiền thật cho từng
  // lệnh mua. Kết quả là một khoản dư nợ ảo bằng tổng tiền mua, và lãi bị thổi
  // lên nhiều lần.
  //
  // Cách xử lý đúng không phải là vá công thức mà là thừa nhận giới hạn: sổ
  // không biết gì về dư nợ trước ngày khởi tạo, nên không có cơ sở nào để tính
  // lãi cho giai đoạn đó.
  const initDate = txs.find((t) => t.type === "INIT_CASH")?.date || null;
  let bo_qua_truoc_khoi_tao = false;
  if (initDate && start < initDate) {
    start = initDate;
    bo_qua_truoc_khoi_tao = true;
  }

  const daily = rate / 100 / 365;
  const fees = getFees(userId);
  const sorted = [...txs].sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));

  let total = 0, borrowDays = 0, peak = 0, peakDate = null;
  const detail = [];
  const cursor = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");

  while (cursor <= endD) {
    const day = cursor.toISOString().slice(0, 10);
    // Dựng lại sổ tính đến hết ngày này. Chậm hơn cách cộng dồn nhưng dùng
    // đúng một engine với mọi con số khác — không sợ hai chỗ tính lệch nhau.
    const st = rebuild(sorted.filter((t) => t.date <= day), fees);
    const debt = st.cash < 0 ? -st.cash : 0;
    if (debt > 0) {
      const i = debt * daily;
      total += i;
      borrowDays += 1;
      if (debt > peak) { peak = debt; peakDate = day; }
      detail.push({ date: day, du_no: debt, lai_ngay: Math.round(i) });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    ok: true,
    tu_ngay: start, den_ngay: end,
    moc_doi_chieu_truoc: prev ? prev.date : null,
    ngay_khoi_tao: initDate,
    bo_qua_truoc_khoi_tao,
    lai_suat_nam: rate,
    so_ngay_vay: borrowDays,
    du_no_cao_nhat: peak,
    ngay_du_no_cao_nhat: peakDate,
    uoc_tinh: Math.round(total),
    ngay: detail.slice(-40),
  };
}

/* ==================== Số ngày nắm giữ ==================== */

/**
 * Số ngày đã giữ từng mã, tính theo từng lô rồi bình quân theo số lượng.
 *
 * Bình quân gia quyền chứ không lấy lô cũ nhất: mua thêm 5000 cổ hôm qua đè lên
 * 100 cổ giữ từ năm ngoái thì nói "đã giữ 400 ngày" là sai lệch hẳn.
 */
export function holdingDays(userId) {
  const st = state(userId);
  if (st.error) return { error: st.error };
  const today = new Date().toISOString().slice(0, 10);

  const rows = Object.entries(st.positions).map(([symbol, p]) => {
    const lots = p.lots.map((l) => ({
      ngay_mua: l.date, qty: l.qty, so_ngay: daysBetween(l.date, today),
      ve_tai_khoan: settleDate(l.date),
    }));
    const totalQty = lots.reduce((s, l) => s + l.qty, 0);
    const weighted = totalQty > 0
      ? lots.reduce((s, l) => s + l.so_ngay * l.qty, 0) / totalQty : 0;
    return {
      symbol, qty: p.qty,
      so_ngay_binh_quan: Math.round(weighted),
      lo_cu_nhat: lots.length ? lots[0].ngay_mua : null,
      so_ngay_lo_cu_nhat: lots.length ? lots[0].so_ngay : 0,
      lo_moi_nhat: lots.length ? lots[lots.length - 1].ngay_mua : null,
      so_lo: lots.length,
      lots,
    };
  }).sort((a, b) => b.so_ngay_binh_quan - a.so_ngay_binh_quan);

  return { ok: true, rows };
}

/* ==================== Cài đặt riêng của sổ đầu tư ==================== */

function getSetting(userId, key, fallback) {
  const r = q.get("SELECT value FROM stock_setting WHERE user_id=? AND key=?", userId, key);
  if (!r) return fallback;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : fallback;
}

const SETTING_SPEC = {
  margin_rate_year: { max: 100, ten: "Lãi suất margin" },
  fee_buy_pct: { max: 5, ten: "Phí mua" },
  fee_sell_pct: { max: 5, ten: "Phí bán" },
  fee_tax_pct: { max: 5, ten: "Thuế bán" },
};

export function investSettings(userId) {
  const f = getFees(userId);
  return {
    margin_rate_year: getSetting(userId, "margin_rate_year", 14.6),
    fee_buy_pct: f.buyPct,
    fee_sell_pct: f.sellPct,
    fee_tax_pct: f.taxPct,
  };
}

export function saveInvestSettings(userId, input) {
  for (const [key, spec] of Object.entries(SETTING_SPEC)) {
    if (input[key] === undefined) continue;
    const v = Number(input[key]);
    if (!Number.isFinite(v) || v < 0 || v > spec.max) {
      throw new Error(`${spec.ten} phải trong khoảng 0 đến ${spec.max}`);
    }
    q.run(
      `INSERT INTO stock_setting (user_id,key,value,updated_at) VALUES (?,?,?,?)
       ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      userId, key, String(v), Date.now()
    );
  }
  return investSettings(userId);
}

/**
 * Xem trước ảnh hưởng của việc đổi biểu phí, trước khi lưu.
 *
 * Đổi phí là đổi giá vốn của mọi lệnh mua đã ghi. Người dùng cần thấy con số
 * mới trông thế nào rồi mới quyết định, chứ không phải lưu xong mới phát hiện
 * cả danh mục nhảy số.
 */
export function previewFees(userId, input) {
  const txs = loadTxs(userId);
  const cu = rebuild(txs, getFees(userId));
  const moi = rebuild(txs, {
    buyPct: Number(input.fee_buy_pct) || 0,
    sellPct: Number(input.fee_sell_pct) || 0,
    taxPct: Number(input.fee_tax_pct) || 0,
  });
  if (cu.error || moi.error) return { error: cu.error || moi.error };

  const rows = Object.keys({ ...cu.positions, ...moi.positions }).map((sym) => {
    const a = cu.positions[sym], b = moi.positions[sym];
    return {
      symbol: sym,
      qty: (b || a).qty,
      von_cu: a ? Math.round(a.avgCostVND) : null,
      von_moi: b ? Math.round(b.avgCostVND) : null,
      tong_cu: a ? a.costTotal : null,
      tong_moi: b ? b.costTotal : null,
    };
  });

  return {
    ok: true, rows,
    tien_mat_cu: cu.cash,
    tien_mat_moi: moi.cash,
    lech_tien_mat: moi.cash - cu.cash,
  };
}

/* ==================== Đọc tin nhắn TCBS ==================== */

/**
 * Dịch tin nhắn khớp lệnh TCBS sang lệnh của Sổ Chi.
 *
 * Mẫu đã có:
 *   13/08/2026 - TK 105C110678 - Tiểu khoản Ký quỹ: Đặt mua 5,000 HCM giá
 *   25,950. Đã khớp 5,000 giá 25,950
 *
 * Hai điểm quan trọng:
 *
 * Luôn lấy số ở vế "Đã khớp", không lấy số đặt. Lệnh khớp một phần có hai số
 * khác nhau và ghi theo số đặt là ghi khống cổ phiếu chưa hề mua được.
 *
 * Không có vế "Đã khớp" thì bỏ qua dòng đó, không đoán. Lệnh chờ hoặc lệnh hủy
 * chưa phải giao dịch, đưa vào sổ là sai.
 *
 * Số tài khoản trong tin nhắn KHÔNG được lưu. Sổ chỉ cần biết mua bán gì, còn
 * số tài khoản để lại trong database chỉ tạo thêm thứ phải bảo vệ mà không dùng
 * đến bao giờ.
 *
 * Đây mới là một mẫu mua. Mẫu bán, khớp một phần, khớp nhiều lần và tin cổ tức
 * cần kiểm chứng thêm — parser cố tình từ chối những gì không chắc thay vì đoán.
 */
export function parseTcbsMessages(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const num = (s) => Number(String(s).replace(/[.,\s]/g, ""));

  return lines.map((line, i) => {
    const out = { dong: i + 1, raw: line };

    const dm = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!dm) { out.loi = "Không thấy ngày trong dòng"; return out; }
    const date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;

    const side = /Đặt\s+mua|dat\s+mua/i.test(line) ? "BUY"
               : /Đặt\s+bán|dat\s+ban/i.test(line) ? "SELL" : null;
    if (!side) { out.loi = "Không nhận ra là lệnh mua hay bán"; return out; }

    // Mã đứng ngay sau số lượng trong vế đặt lệnh.
    const sm = line.match(/(?:mua|bán|ban)\s+[\d.,]+\s+([A-Z]{3})\b/i);
    if (!sm) { out.loi = "Không tìm thấy mã chứng khoán"; return out; }
    const symbol = sm[1].toUpperCase();

    const fill = line.match(/Đã\s+khớp\s+([\d.,]+)\s+giá\s+([\d.,]+)/i)
              || line.match(/da\s+khop\s+([\d.,]+)\s+gia\s+([\d.,]+)/i);
    if (!fill) {
      out.loi = "Chưa thấy phần đã khớp — lệnh chờ hoặc đã hủy thì không ghi vào sổ";
      return out;
    }

    const qty = num(fill[1]);
    const priceVND = num(fill[2]);
    if (!qty || qty <= 0) { out.loi = "Số lượng khớp không đọc được"; return out; }
    if (!priceVND || priceVND < 100) { out.loi = "Giá khớp không hợp lệ"; return out; }

    // So với số đặt để báo cho người dùng biết đây là lệnh khớp một phần.
    const ord = line.match(/(?:mua|bán|ban)\s+([\d.,]+)\s+[A-Z]{3}/i);
    const ordered = ord ? num(ord[1]) : null;

    out.tx = { type: side, symbol, qty, priceVND, date };
    if (ordered && ordered !== qty) out.ghi_chu = `khớp một phần: đặt ${ordered}, khớp ${qty}`;
    return out;
  });
}

/**
 * Chuyển tin nhắn TCBS thành các dòng lệnh để đưa vào luồng nhập hàng loạt.
 *
 * Có lọc trùng, vì dán tin nhắn là thao tác rất dễ lặp: cuộn lại lịch sử chat,
 * chọn nhầm vùng, hoặc chép đi chép lại cùng một tin. Hai dòng giống nhau hoàn
 * toàn về ngày, mã, số lượng và giá thì gần như chắc chắn là một lệnh bị chép
 * hai lần, chứ không phải hai lệnh khớp trùng khít nhau.
 *
 * Trùng thì BỎ và nói rõ, không im lặng gộp: nếu đúng là hai lệnh thật thì
 * người dùng phải biết mà nhập tay thêm, chứ mất một lệnh mua trong sổ tiền là
 * chuyện lớn hơn nhiều so với phải gõ lại một dòng.
 */
export function tcbsToBatch(text) {
  const rows = parseTcbsMessages(text);
  const verb = { BUY: "MUA", SELL: "BAN" };

  const seen = new Map();
  const lines = [];
  for (const r of rows) {
    if (!r.tx) continue;
    const key = `${r.tx.date}|${r.tx.type}|${r.tx.symbol}|${r.tx.qty}|${r.tx.priceVND}`;
    if (seen.has(key)) {
      r.trung = true;
      r.trung_voi_dong = seen.get(key);
      continue;
    }
    seen.set(key, r.dong);
    const d = r.tx.date.split("-");
    lines.push(`${verb[r.tx.type]} ${r.tx.symbol} ${r.tx.qty} ${r.tx.priceVND} ${d[2]}/${d[1]}/${d[0]}`);
  }

  return {
    ok: true, rows,
    doc_duoc: lines.length,
    bo_qua: rows.filter((r) => r.loi).length,
    trung_lap: rows.filter((r) => r.trung).length,
    text: lines.join("\n"),
  };
}

/**
 * Tìm giao dịch trong lô sắp ghi mà sổ đã có sẵn.
 *
 * Khác với lọc trùng bên trên (trùng trong cùng một lần dán), cái này bắt trường
 * hợp dán lại tin nhắn của tuần trước đã nhập rồi. Chỉ CẢNH BÁO chứ không tự
 * chặn — mua cùng một mã, cùng số lượng, cùng giá trong cùng một ngày là hiếm
 * nhưng có thật, nên quyết định cuối để người dùng.
 */
export function findDuplicates(userId, txs) {
  const existing = new Set(
    loadTxs(userId).map((t) => `${t.date}|${t.type}|${t.symbol || ""}|${t.qty || ""}|${t.priceVND || t.cash || ""}`)
  );
  return txs.filter((t) =>
    existing.has(`${t.date}|${t.type}|${t.symbol || ""}|${t.qty || ""}|${t.priceVND || t.cash || ""}`)
  );
}

/* ==================== Sự kiện quyền gắn vào từng mã ==================== */

/**
 * Gom sự kiện quyền theo mã để hiển thị ngay trên dòng cổ phiếu.
 *
 * Lấy cả sự kiện vừa qua trong 45 ngày, không chỉ sự kiện sắp tới: cổ tức
 * thường trả sau ngày chốt hàng tháng, và cái người ta cần nhớ là "đã qua ngày
 * chốt rồi, tiền chưa về" chứ không phải chỉ mỗi lịch phía trước.
 */
export function eventsBySymbol(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const past = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);

  const rows = q.all(
    "SELECT * FROM stock_event WHERE user_id=? AND ex_date >= ? ORDER BY ex_date",
    userId, past
  );

  const map = {};
  for (const r of rows) {
    const days = Math.round((new Date(r.ex_date) - new Date(today)) / 86400000);
    const item = {
      id: r.id, loai: r.loai, ex_date: r.ex_date, record_date: r.record_date,
      pay_date: r.pay_date, gia_tri: r.gia_tri, ty_le: r.ty_le, ghi_chu: r.ghi_chu,
      con_ngay: days, da_qua: days < 0,
      // Tiền chưa về nếu đã qua ngày chốt nhưng chưa tới ngày thanh toán.
      cho_tien: days < 0 && r.pay_date ? r.pay_date > today : false,
    };
    (map[r.symbol] = map[r.symbol] || []).push(item);
  }
  return map;
}

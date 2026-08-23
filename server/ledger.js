/**
 * Engine FIFO — PORT NGUYÊN VĂN từ portfolio-bot/ledger.js.
 *
 * KHÔNG sửa logic ở đây. Đây là bản đã chạy thật với sổ tiền của người dùng và
 * đã qua 11 nhóm kiểm tra. Chỉ đổi CommonJS sang ESM và tách FEES ra config.
 * Mọi thay đổi logic phải kèm test đối chiếu lại với bản gốc.
 */

export const FEES = {
  buyPct: 0,
  sellPct: 0,
  taxPct: 0.1,
};

/**
 * Tinh lai toan bo trang thai tu so giao dich (append-only).
 * Khong luu state -> khong bao gio lech.
 */
function rebuild(txs) {
  const sorted = [...txs].sort((a, b) =>
    a.date === b.date ? a.seq - b.seq : (a.date < b.date ? -1 : 1)
  );

  const lots = {};
  const realized = [];
  let cash = 0;
  let error = null;

  // Giao dich TRUOC ngay khoi tao chi tao vi the, KHONG dung toi tien mat -
  // vi so du khai luc khoi tao da phan anh chung roi.
  const initDate = sorted.find((t) => t.type === "INIT_CASH")?.date || null;
  const affectsCash = (tx) => initDate === null || tx.date >= initDate;

  for (const tx of sorted) {
    switch (tx.type) {
      case "INIT_CASH": cash = tx.cash; break;
      case "DEPOSIT": cash += tx.cash; break;
      case "WITHDRAW": cash -= tx.cash; break;
      case "ADJUSTMENT":
      case "INTEREST":
      case "DIVIDEND_CASH": cash += tx.cash; break;

      case "BUY": {
        const gross = tx.priceVND * tx.qty;
        const fee = Math.round(gross * FEES.buyPct / 100);
        if (affectsCash(tx)) cash -= gross + fee;
        (lots[tx.symbol] = lots[tx.symbol] || []).push({
          txId: tx.id,
          date: tx.date,
          remaining: tx.qty,
          costPerShare: (gross + fee) / tx.qty,
        });
        break;
      }

      case "SELL": {
        const queue = lots[tx.symbol] || [];
        const held = queue.reduce((s, l) => s + l.remaining, 0);
        if (held < tx.qty) {
          error = `Ban ${tx.qty} ${tx.symbol} ngay ${tx.date} nhung chi giu ${held}`;
          break;
        }
        const gross = tx.priceVND * tx.qty;
        const fee = Math.round(gross * FEES.sellPct / 100);
        const tax = Math.round(gross * FEES.taxPct / 100);
        const proceedsNet = gross - fee - tax;
        if (affectsCash(tx)) cash += proceedsNet;

        let need = tx.qty;
        let costBasis = 0;
        const matched = [];
        let oldestDate = tx.date;
        while (need > 0) {
          const lot = queue[0];
          const take = Math.min(lot.remaining, need);
          costBasis += take * lot.costPerShare;
          matched.push({ buyTxId: lot.txId, buyDate: lot.date, qty: take, costPerShare: lot.costPerShare });
          if (lot.date < oldestDate) oldestDate = lot.date;
          lot.remaining -= take;
          need -= take;
          if (lot.remaining === 0) queue.shift();
        }
        const pl = proceedsNet - costBasis;
        realized.push({
          date: tx.date, symbol: tx.symbol, qty: tx.qty, priceVND: tx.priceVND,
          proceedsNet, costBasis: Math.round(costBasis), pl: Math.round(pl),
          plPct: costBasis > 0 ? (pl / costBasis) * 100 : 0,
          holdDays: daysBetween(oldestDate, tx.date),
          matched,
        });
        break;
      }

      // Co phieu thuong / co tuc bang CP: tang SL, giu nguyen tong gia von
      case "STOCK_BONUS": {
        const queue = lots[tx.symbol] || [];
        const held = queue.reduce((s, l) => s + l.remaining, 0);
        if (held === 0) { error = `Khong giu ${tx.symbol} de nhan co phieu thuong`; break; }
        const ratio = held / (held + tx.qty);
        for (const lot of queue) lot.costPerShare *= ratio;
        let left = tx.qty;
        queue.forEach((lot, i) => {
          const add = i === queue.length - 1 ? left : Math.round(tx.qty * lot.remaining / held);
          lot.remaining += add;
          left -= add;
        });
        break;
      }

      default:
        error = `Loai giao dich khong hop le: ${tx.type}`;
    }
    if (error) break;
  }

  const positions = {};
  for (const [sym, queue] of Object.entries(lots)) {
    const qty = queue.reduce((s, l) => s + l.remaining, 0);
    if (qty === 0) continue;
    const costTotal = queue.reduce((s, l) => s + l.remaining * l.costPerShare, 0);
    positions[sym] = {
      qty,
      costTotal: Math.round(costTotal),
      avgCostVND: costTotal / qty,
      lots: queue.map((l) => ({ date: l.date, qty: l.remaining, costPerShare: l.costPerShare })),
    };
  }

  return { cash: Math.round(cash), positions, realized, error };
}

function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
}

/** Ngay CP ve tai khoan (T+2, bo qua T7/CN). Chua tinh ngay le. */
function settleDate(dateISO) {
  const d = new Date(dateISO + "T00:00:00Z");
  let added = 0;
  while (added < 2) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

export { rebuild, settleDate, daysBetween };

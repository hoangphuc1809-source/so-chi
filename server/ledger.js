/**
 * Engine FIFO — PORT NGUYÊN VĂN từ portfolio-bot/ledger.js.
 *
 * KHÔNG sửa logic ở đây. Đây là bản đã chạy thật với sổ tiền của người dùng và
 * đã qua 11 nhóm kiểm tra. Chỉ đổi CommonJS sang ESM và tách FEES ra config.
 * Mọi thay đổi logic phải kèm test đối chiếu lại với bản gốc.
 *
 * Thay đổi duy nhất ngoài việc chuyển module: rebuild() nhận thêm tham số phí
 * tùy chọn. Không truyền thì dùng đúng FEES mặc định như trước, nên mọi lời gọi
 * cũ cho kết quả y hệt. Cần tham số này vì biểu phí là của từng tài khoản chứ
 * không phải hằng số toàn hệ thống, mà phí mua thì nằm trong giá vốn.
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
function rebuild(txs, fees) {
  const F = fees ? { ...FEES, ...fees } : FEES;
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
        const fee = Math.round(gross * F.buyPct / 100);
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
        const fee = Math.round(gross * F.sellPct / 100);
        const tax = Math.round(gross * F.taxPct / 100);
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

/* ==================== Ngày và giờ theo múi giờ Việt Nam ==================== */

/**
 * Ngày hôm nay theo giờ Việt Nam.
 *
 * KHÔNG dùng new Date().toISOString() để lấy ngày. Chuỗi đó là giờ UTC, chậm
 * hơn Việt Nam 7 tiếng, nên từ 00:00 đến 07:00 giờ Việt Nam nó vẫn trả về ngày
 * hôm trước. Mở app lúc 6 giờ sáng là cả sổ lùi một ngày: cổ phiếu đáng lẽ đã
 * về thì báo còn chờ, lịch quyền lệch, báo cáo tháng rơi nhầm kỳ.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function nowVN() {
  const d = new Date(Date.now() + VN_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

export function todayVN() {
  return nowVN().date;
}

/**
 * Chứng khoán hoặc tiền đã thực sự về tài khoản chưa.
 *
 * Chu kỳ thanh toán là T+2, nhưng chứng khoán chỉ về tài khoản khoảng 13 giờ
 * ngày T+2 nên buổi sáng hôm đó vẫn chưa bán được — thị trường Việt Nam quen
 * gọi là T+2,5.
 *
 * Coi cả ngày T+2 là bán được sẽ khiến app báo bán được vào lúc 9 giờ sáng,
 * trong khi lệnh bán đặt lúc đó sẽ bị công ty chứng khoán từ chối.
 *
 * Lấy mốc 13:00 cho an toàn: giờ về thực tế dao động quanh 12:00–13:30 tùy công
 * ty chứng khoán, và báo về muộn hơn thực tế thì chỉ mất một phiên chiều, còn
 * báo sớm hơn thực tế thì dẫn tới một lệnh bán bị từ chối.
 */
const GIO_VE_TAI_KHOAN = 13;

export function daVeTaiKhoan(settle, now = nowVN()) {
  if (settle < now.date) return true;
  if (settle > now.date) return false;
  return now.hour >= GIO_VE_TAI_KHOAN;
}

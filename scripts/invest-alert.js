/**
 * Cảnh báo sổ đầu tư qua Telegram.
 *
 * Chạy một lần sau phiên bằng systemd timer. Cùng khuôn với remind.js: không mở
 * cổng, không giữ tiến trình.
 *
 * Bốn thứ được báo, và chỉ báo khi thực sự có:
 *   - Giá chạm mốc cắt lỗ hoặc chốt lời do chính người dùng đặt
 *   - Ngày giao dịch không hưởng quyền đang đến gần
 *   - Tiền bán về tài khoản hôm nay
 *   - Phiên có khối lượng khác thường
 *
 * Nguyên tắc: không có gì thì im lặng. Một cảnh báo ngày nào cũng đến sẽ bị bỏ
 * qua đúng vào hôm nó quan trọng.
 *
 * Đây là lời nhắc về ngưỡng người dùng đã tự đặt và về lịch đã tự ghi, không
 * phải khuyến nghị mua bán. Script không sinh ra mốc nào và không gợi ý nên
 * mua hay bán gì.
 */
import { q } from "../server/db.js";
import { state, getAlerts, cashFlow, eventsBySymbol } from "../server/stock.js";
import { fetchPrices, fetchDailyBars, findUnusualVolume } from "../server/prices.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const today = new Date().toISOString().slice(0, 10);
const nf = new Intl.NumberFormat("vi-VN");
const money = (n) => nf.format(Math.round(n || 0)) + " đ";
const gia = (n) => nf.format(Math.round(n || 0));

async function send(text) {
  if (!TOKEN || !CHAT) {
    console.log("[canh-bao-dau-tu] chua cau hinh Telegram, in ra man hinh:\n" + text);
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) {
    console.error("[canh-bao-dau-tu] Telegram loi", res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}

/** Mốc giá do người dùng đặt, đối chiếu với giá đóng cửa. */
function alertLines(userId, st, prices) {
  const lines = [];
  for (const a of getAlerts(userId)) {
    const pos = st.positions[a.symbol];
    if (!pos) continue;                    // đã bán hết thì mốc không còn nghĩa
    const px = prices[a.symbol];
    if (!px) continue;

    if (a.stop && px <= a.stop) {
      lines.push(`🔻 <b>${a.symbol}</b> ${gia(px)} — chạm mốc cắt lỗ ${gia(a.stop)}` +
                 `\n   đang giữ ${nf.format(pos.qty)} cp` + (a.note ? `\n   ${a.note}` : ""));
    } else if (a.target && px >= a.target) {
      lines.push(`🔼 <b>${a.symbol}</b> ${gia(px)} — chạm mốc chốt lời ${gia(a.target)}` +
                 `\n   đang giữ ${nf.format(pos.qty)} cp` + (a.note ? `\n   ${a.note}` : ""));
    }
  }
  return lines;
}

/**
 * Sự kiện quyền sắp tới.
 *
 * Chỉ báo trong vòng 5 ngày trước ngày không hưởng quyền — đó là khoảng thời
 * gian còn kịp làm gì đó. Báo trước một tháng thì đến lúc cần lại quên mất.
 */
function eventLines(userId, st) {
  const TEN = {
    co_tuc_tien: "cổ tức tiền", co_tuc_cp: "cổ tức cổ phiếu",
    phat_hanh_them: "phát hành thêm", dhcd: "đại hội cổ đông", khac: "sự kiện",
  };
  const lines = [];
  const evs = eventsBySymbol(userId);

  for (const [sym, list] of Object.entries(evs)) {
    const pos = st.positions[sym];
    if (!pos) continue;
    for (const e of list) {
      const ten = TEN[e.loai] || "sự kiện";
      if (!e.da_qua && e.con_ngay <= 5) {
        const khi = e.con_ngay === 0 ? "<b>hôm nay</b>" : `còn <b>${e.con_ngay} ngày</b>`;
        let s = `📅 <b>${sym}</b> ${ten} — không hưởng quyền ${e.ex_date}, ${khi}`;
        if (e.gia_tri) s += `\n   ước nhận ${money(e.gia_tri * pos.qty)}`;
        if (e.ty_le) s += `\n   tỷ lệ ${e.ty_le}`;
        lines.push(s);
      } else if (e.pay_date === today) {
        lines.push(`💰 <b>${sym}</b> ${ten} — hôm nay là ngày thanh toán` +
                   (e.gia_tri ? `\n   ước nhận ${money(e.gia_tri * pos.qty)}` : ""));
      }
    }
  }
  return lines;
}

/** Tiền bán về tài khoản hôm nay. */
function cashLines(userId) {
  const cf = cashFlow(userId);
  if (cf.error) return [];
  const ve = (cf.pending || []).filter((p) => p.settle_date === today);
  return ve.map((p) =>
    `💵 <b>${p.symbol}</b> tiền bán về hôm nay: ${money(p.amount)}` +
    `\n   bán ${p.sell_date}, ${nf.format(p.qty)} cp`);
}

/** Phiên khối lượng khác thường. */
async function volumeLines(st) {
  const syms = Object.keys(st.positions);
  if (!syms.length) return [];
  let bars;
  try { bars = await fetchDailyBars(syms, 90); }
  catch (e) { console.error("[canh-bao-dau-tu] khong lay duoc du lieu phien:", e.message); return []; }

  const lines = [];
  const HUONG = {
    ben_mua_manh: "đóng cửa gần đỉnh ngày",
    ben_ban_manh: "đóng cửa gần đáy ngày",
    khong_ro: "đóng cửa giữa biên độ",
  };
  for (const sym of syms) {
    const r = findUnusualVolume(bars[sym] || []);
    if (!r || !r.unusual) continue;
    // Chỉ báo phiên gần nhất, không đào lại lịch sử.
    if (r.date !== bars[sym][bars[sym].length - 1].date) continue;
    lines.push(`📊 <b>${sym}</b> khối lượng ${r.times.toFixed(1)}× mức thường ngày` +
               `\n   ${nf.format(r.volume)} cp · ${HUONG[r.huong]}` +
               `\n   ${r.thay_doi_pct >= 0 ? "+" : ""}${r.thay_doi_pct.toFixed(2)}% so với giá mở cửa`);
  }
  return lines;
}

async function main() {
  const users = q.all("SELECT id, username FROM users");
  if (!users.length) return console.log("[canh-bao-dau-tu] chua co tai khoan nao");

  for (const u of users) {
    const st = state(u.id);
    if (st.error) {
      console.error(`[canh-bao-dau-tu] ${u.username}: so dang loi — ${st.error}`);
      continue;
    }
    const syms = Object.keys(st.positions);
    if (!syms.length) {
      console.log(`[canh-bao-dau-tu] ${u.username}: khong giu ma nao`);
      continue;
    }

    let prices = {};
    try { prices = (await fetchPrices(syms)).prices || {}; }
    catch (e) { console.error("[canh-bao-dau-tu] khong lay duoc gia:", e.message); }

    const moc = alertLines(u.id, st, prices);
    const quyen = eventLines(u.id, st);
    const tien = cashLines(u.id);
    const vol = await volumeLines(st);

    if (!moc.length && !quyen.length && !tien.length && !vol.length) {
      console.log(`[canh-bao-dau-tu] ${u.username}: khong co gi de bao`);
      continue;
    }

    let msg = `📈 <b>Sổ đầu tư</b> — ${today}\n`;
    if (moc.length)   msg += "\n<b>Chạm mốc bạn đã đặt</b>\n" + moc.join("\n") + "\n";
    if (quyen.length) msg += "\n<b>Lịch quyền</b>\n" + quyen.join("\n") + "\n";
    if (tien.length)  msg += "\n<b>Tiền về</b>\n" + tien.join("\n") + "\n";
    if (vol.length)   msg += "\n<b>Khối lượng khác thường</b>\n" + vol.join("\n") + "\n";

    const sent = await send(msg.trim());
    console.log(`[canh-bao-dau-tu] ${u.username}: ${moc.length} mốc, ${quyen.length} quyền, ` +
                `${tien.length} tiền về, ${vol.length} khối lượng — gui ${sent ? "OK" : "that bai"}`);
  }
}

main().catch((e) => {
  console.error("[canh-bao-dau-tu] loi:", e.message);
  process.exit(1);
});

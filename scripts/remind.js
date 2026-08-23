/**
 * Nhắc hạn hóa đơn & thẻ tín dụng qua Telegram.
 * Chạy 1 lần/ngày bằng systemd timer. Không mở port, không giữ tiến trình.
 */
import { q } from "../server/db.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const today = new Date().toISOString().slice(0, 10);
const nf = new Intl.NumberFormat("vi-VN");
const money = (n) => nf.format(Math.round(n || 0)) + " đ";

const daysBetween = (a, b) =>
  Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);

async function send(text) {
  if (!TOKEN || !CHAT) {
    console.log("[nhac-han] chua cau hinh Telegram, in ra man hinh:\n" + text);
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) {
    console.error("[nhac-han] Telegram loi", res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}

function billLines(userId) {
  const bills = q.all("SELECT * FROM bills WHERE user_id=? AND active=1 ORDER BY next_due", userId);
  const lines = [];
  const notified = [];

  for (const b of bills) {
    const left = daysBetween(today, b.next_due);
    if (left > b.reminder_days) continue;
    if (b.last_notified === today) continue;

    const label =
      left < 0 ? `<b>QUÁ HẠN ${Math.abs(left)} ngày</b>`
      : left === 0 ? "<b>đến hạn HÔM NAY</b>"
      : `còn ${left} ngày`;

    lines.push(`• ${b.name} — ${money(b.amount)} — ${label} (${b.next_due})`);
    notified.push(b.id);
  }
  return { lines, notified };
}

function cardLines(userId) {
  const cards = q.all("SELECT * FROM cards WHERE user_id=? AND active=1", userId);
  const lines = [];
  const d = new Date();

  for (const c of cards) {
    const spent = q.get(
      "SELECT COALESCE(SUM(amount),0) AS s FROM transactions WHERE user_id=? AND card_id=?", userId, c.id).s;
    const paid = q.get(
      "SELECT COALESCE(SUM(amount),0) AS s FROM card_payments WHERE user_id=? AND card_id=?", userId, c.id).s;
    const balance = spent + c.opening - paid;
    if (balance <= 0) continue;

    const dueThisMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), c.due_day))
      .toISOString().slice(0, 10);
    const left = daysBetween(today, dueThisMonth);
    if (left < 0 || left > 3) continue;

    const util = c.limit_amount > 0 ? Math.round((balance / c.limit_amount) * 100) : 0;
    lines.push(
      `• ${c.bank}${c.last4 ? " ••" + c.last4 : ""} — dư nợ ${money(balance)} (${util}% hạn mức) — ` +
      (left === 0 ? "<b>đến hạn HÔM NAY</b>" : `còn ${left} ngày`)
    );
  }
  return lines;
}

async function main() {
  const users = q.all("SELECT id, username FROM users");
  if (!users.length) return console.log("[nhac-han] chua co tai khoan nao");

  for (const u of users) {
    const { lines: bills, notified } = billLines(u.id);
    const cards = cardLines(u.id);
    if (!bills.length && !cards.length) {
      console.log(`[nhac-han] ${u.username}: khong co gi den han`);
      continue;
    }

    let msg = "🔔 <b>Nhắc hạn thanh toán</b>\n";
    if (bills.length) msg += "\n<b>Hóa đơn</b>\n" + bills.join("\n") + "\n";
    if (cards.length) msg += "\n<b>Thẻ tín dụng</b>\n" + cards.join("\n") + "\n";

    const sent = await send(msg.trim());
    if (sent) {
      for (const id of notified) q.run("UPDATE bills SET last_notified=? WHERE id=?", today, id);
    }
    console.log(`[nhac-han] ${u.username}: ${bills.length} hoa don, ${cards.length} the — gui ${sent ? "OK" : "that bai"}`);
  }
}

main().catch((e) => {
  console.error("[nhac-han] loi:", e.message);
  process.exit(1);
});

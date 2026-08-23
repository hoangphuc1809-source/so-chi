import { q } from "./db.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

const nf = new Intl.NumberFormat("vi-VN");
const money = (n) => nf.format(Math.round(n || 0)) + "đ";
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthNow = () => todayISO().slice(0, 7);
const shiftMonth = (ym, d) => {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

const TYPE_VN = { personal: "Cá nhân", company: "Tiếp khách", business: "Công tác" };
const METHOD_VN = { cash: "Tiền mặt", card: "Thẻ tín dụng", bank: "Chuyển khoản", ewallet: "Ví điện tử" };

/**
 * Toàn bộ con số đưa cho Gemini đều tính bằng SQL ở đây.
 * Gemini không được tự cộng trừ — chỉ diễn giải bảng này.
 */
export function buildContext(userId, month = monthNow()) {
  const like = month + "%";
  const prev = shiftMonth(month, -1);

  const total = q.get(
    "SELECT COALESCE(SUM(amount),0) t, COUNT(*) n FROM transactions WHERE user_id=? AND date LIKE ?",
    userId, like
  );
  const prevTotal = q.get(
    "SELECT COALESCE(SUM(amount),0) t FROM transactions WHERE user_id=? AND date LIKE ?",
    userId, prev + "%"
  ).t;

  const trend = q.all(
    `SELECT substr(date,1,7) m, SUM(amount) t, COUNT(*) n
     FROM transactions WHERE user_id=? GROUP BY m ORDER BY m DESC LIMIT 6`,
    userId
  ).reverse();

  const byCat = q.all(
    `SELECT c.name, c.budget, SUM(t.amount) total, COUNT(*) n
     FROM transactions t JOIN categories c ON c.id=t.category_id
     WHERE t.user_id=? AND t.date LIKE ? GROUP BY c.id ORDER BY total DESC`,
    userId, like
  );

  // Trung binh 3 thang truoc do, de so sanh xem danh muc nao dang tang bat thuong
  const base3 = q.all(
    `SELECT c.name, SUM(t.amount)/3.0 avg3
     FROM transactions t JOIN categories c ON c.id=t.category_id
     WHERE t.user_id=? AND t.date >= ? AND t.date < ?
     GROUP BY c.id`,
    userId, shiftMonth(month, -3) + "-01", month + "-01"
  );
  const avgMap = Object.fromEntries(base3.map((r) => [r.name, r.avg3]));

  const byType = q.all(
    "SELECT type, SUM(amount) t FROM transactions WHERE user_id=? AND date LIKE ? GROUP BY type",
    userId, like
  );
  const byMethod = q.all(
    "SELECT method, SUM(amount) t FROM transactions WHERE user_id=? AND date LIKE ? GROUP BY method ORDER BY t DESC",
    userId, like
  );
  const top = q.all(
    `SELECT t.amount, t.note, t.date, c.name cat FROM transactions t
     LEFT JOIN categories c ON c.id=t.category_id
     WHERE t.user_id=? AND t.date LIKE ? ORDER BY t.amount DESC LIMIT 8`,
    userId, like
  );

  const bills = q.all(
    "SELECT name, amount, next_due, recurrence, active FROM bills WHERE user_id=? ORDER BY next_due",
    userId
  );
  const cards = q.all("SELECT * FROM cards WHERE user_id=?", userId).map((c) => {
    const spent = q.get(
      "SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id=? AND card_id=?", userId, c.id).s;
    const paid = q.get(
      "SELECT COALESCE(SUM(amount),0) s FROM card_payments WHERE user_id=? AND card_id=?", userId, c.id).s;
    return { bank: c.bank, last4: c.last4, limit: c.limit_amount, due_day: c.due_day,
             balance: spent + c.opening - paid };
  });

  /* ---- dựng bảng text gọn cho Gemini ---- */
  const L = [];
  L.push(`Hôm nay: ${todayISO()}. Tháng đang xem: ${month}.`);
  L.push(`TỔNG CHI THÁNG ${month}: ${money(total.t)} qua ${total.n} giao dịch.`);
  if (prevTotal > 0) {
    const d = ((total.t - prevTotal) / prevTotal) * 100;
    L.push(`Tháng trước (${prev}): ${money(prevTotal)}. Chênh lệch: ${d > 0 ? "+" : ""}${d.toFixed(1)}%.`);
  }

  L.push("\n6 THÁNG GẦN NHẤT:");
  trend.forEach((r) => L.push(`  ${r.m}: ${money(r.t)} (${r.n} giao dịch)`));

  L.push("\nTHEO DANH MỤC (tháng đang xem):");
  byCat.forEach((r) => {
    const parts = [`  ${r.name}: ${money(r.total)} (${r.n} lần`];
    if (total.t > 0) parts.push(`, ${Math.round((r.total / total.t) * 100)}% tổng chi`);
    parts.push(")");
    let line = parts.join("");
    if (r.budget > 0) {
      const pct = Math.round((r.total / r.budget) * 100);
      line += ` — ngân sách ${money(r.budget)}, đã dùng ${pct}%${r.total > r.budget ? " (VƯỢT)" : ""}`;
    }
    const avg = avgMap[r.name];
    if (avg > 0) {
      const chg = ((r.total - avg) / avg) * 100;
      line += ` — trung bình 3 tháng trước ${money(avg)}, ${chg > 0 ? "tăng" : "giảm"} ${Math.abs(chg).toFixed(0)}%`;
    }
    L.push(line);
  });

  if (byType.length) {
    L.push("\nTHEO LOẠI CHI:");
    byType.forEach((r) => L.push(`  ${TYPE_VN[r.type] || r.type}: ${money(r.t)}`));
  }
  if (byMethod.length) {
    L.push("\nTHEO PHƯƠNG THỨC:");
    byMethod.forEach((r) => L.push(`  ${METHOD_VN[r.method] || r.method}: ${money(r.t)}`));
  }
  if (top.length) {
    L.push("\n8 KHOẢN LỚN NHẤT THÁNG:");
    top.forEach((r) => L.push(`  ${r.date} — ${money(r.amount)} — ${r.cat || "?"}${r.note ? " — " + r.note : ""}`));
  }
  if (bills.length) {
    L.push("\nHÓA ĐƠN:");
    bills.forEach((b) => {
      const left = Math.round((new Date(b.next_due + "T00:00:00Z") - new Date(todayISO() + "T00:00:00Z")) / 86400000);
      L.push(`  ${b.name}: ${money(b.amount)}, hạn ${b.next_due} (${left < 0 ? `QUÁ HẠN ${-left} ngày` : `còn ${left} ngày`})${b.active ? "" : " [tạm dừng]"}`);
    });
  }
  if (cards.length) {
    L.push("\nTHẺ TÍN DỤNG:");
    cards.forEach((c) => {
      const u = c.limit > 0 ? Math.round((c.balance / c.limit) * 100) : 0;
      L.push(`  ${c.bank}${c.last4 ? " ••" + c.last4 : ""}: dư nợ ${money(c.balance)} / hạn mức ${money(c.limit)} (${u}%), hạn trả ngày ${c.due_day} hàng tháng`);
    });
  }
  if (total.n === 0) L.push("\nLƯU Ý: tháng này chưa có giao dịch nào được ghi.");

  // Danh muc chung khoan (neu portfolio-bot da day snapshot sang)
  const pf = q.get("SELECT payload, received_at FROM portfolio_snapshot WHERE user_id=?", userId);
  if (pf) {
    try {
      const s = JSON.parse(pf.payload);
      const age = Math.round((Date.now() - pf.received_at) / 60000);
      L.push(`\nDANH MỤC CHỨNG KHOÁN (cập nhật ${age} phút trước):`);
      if (s.degraded) {
        L.push("  Thiếu giá thị trường của một số mã nên NAV và lãi/lỗ chưa tính được.");
      } else {
        L.push(`  NAV: ${money(s.nav)}`);
        L.push(`  Giá trị cổ phiếu: ${money(s.stock_value)}, tiền mặt: ${money(s.cash)}${s.margin_debt > 0 ? `, dư nợ margin: ${money(s.margin_debt)}` : ""}`);
        L.push(`  Lãi/lỗ chưa thực hiện: ${money(s.unrealized_pl)}${s.unrealized_pct != null ? ` (${s.unrealized_pct.toFixed(2)}%)` : ""}`);
      }
      (s.positions || []).forEach((p) => {
        L.push(`  ${p.symbol}: ${p.qty} cp, giá vốn ${money(p.avg_cost)}` +
          (p.market_price != null ? `, giá ${money(p.market_price)}, lãi/lỗ ${money(p.pl)} (${p.pl_pct.toFixed(2)}%), tỷ trọng ${p.weight.toFixed(1)}%` : ", chưa có giá"));
      });
      L.push("  (Đây là số liệu ghi chép, KHÔNG được dùng để khuyến nghị mua bán.)");
    } catch { /* snapshot hong thi bo qua */ }
  }

  return L.join("\n");
}

const SYSTEM = `Bạn là trợ lý phân tích chi tiêu cá nhân trong app "Sổ Chi" của một người dùng Việt Nam.

QUY TẮC BẮT BUỘC:
1. Chỉ dùng những con số có trong phần DỮ LIỆU được cung cấp. TUYỆT ĐỐI không tự bịa số.
2. Không tự cộng trừ nhân chia để tạo ra con số mới. Nếu người dùng hỏi một con số không có sẵn trong dữ liệu, hãy nói thẳng là dữ liệu hiện có chưa trả lời được câu đó, và gợi ý họ xem tab Báo cáo hoặc đổi tháng.
3. Nếu dữ liệu trống hoặc quá ít, nói thật là chưa đủ dữ liệu để nhận xét, đừng suy diễn.
4. Không đưa khuyến nghị đầu tư, chứng khoán, mua bán tài sản. Nếu được hỏi, trả lời rằng phần này chỉ phân tích chi tiêu, và đề nghị họ hỏi nơi khác.
5. Không phán xét hay chê trách cách tiêu tiền của người dùng. Nêu con số và ý nghĩa, để họ tự quyết định.

CÁCH TRẢ LỜI:
- Tiếng Việt, giọng bình thường như một người đồng nghiệp, không khách sáo.
- Ngắn gọn. Mặc định 2-5 câu. Chỉ dài hơn khi người dùng hỏi một câu thực sự cần phân tích nhiều mặt.
- Luôn kèm con số cụ thể khi nhận xét, đừng nói chung chung kiểu "bạn tiêu khá nhiều".
- Định dạng tiền theo kiểu Việt Nam, ví dụ 1.250.000đ.
- Không dùng bảng markdown. Gạch đầu dòng thì tối đa 4 dòng.
- Không mở đầu bằng câu chào hay câu dẫn thừa, vào thẳng nội dung.`;

const lastCall = new Map();

export async function ask(userId, question, history = [], month) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const e = new Error("Chưa cấu hình GEMINI_API_KEY trên máy chủ");
    e.code = "NO_KEY";
    throw e;
  }

  const t = Date.now();
  if (t - (lastCall.get(userId) || 0) < 2500) {
    throw new Error("Hỏi hơi nhanh, chờ một chút rồi thử lại");
  }
  lastCall.set(userId, t);

  const clean = String(question || "").trim().slice(0, 600);
  if (clean.length < 2) throw new Error("Câu hỏi quá ngắn");

  const context = buildContext(userId, month);

  const contents = [];
  history.slice(-6).forEach((m) => {
    const role = m.role === "model" ? "model" : "user";
    const text = String(m.text || "").slice(0, 1200);
    if (text) contents.push({ role, parts: [{ text }] });
  });
  contents.push({ role: "user", parts: [{ text: `DỮ LIỆU:\n${context}\n\nCÂU HỎI: ${clean}` }] });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);

  let res;
  try {
    res = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === "AbortError" ? "Trợ lý trả lời quá lâu, thử lại" : "Không gọi được Gemini");
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Đã hết hạn mức Gemini free hôm nay, mai thử lại");
    throw new Error(`Gemini lỗi ${res.status}: ${body.slice(0, 160)}`);
  }

  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "").join("").trim();

  if (!text) throw new Error("Trợ lý không trả lời được câu này");
  return { answer: text };
}

/** Nhận xét tính hoàn toàn bằng SQL, không qua LLM — luôn chính xác. */
export function insights(userId, month = monthNow()) {
  const out = [];
  const like = month + "%";
  const today = todayISO();

  const overdue = q.all(
    "SELECT name, amount, next_due FROM bills WHERE user_id=? AND active=1 AND next_due < ?",
    userId, today
  );
  overdue.forEach((b) =>
    out.push({ level: "red", text: `${b.name} quá hạn từ ${b.next_due}, ${money(b.amount)}` })
  );

  const over = q.all(
    `SELECT c.name, c.budget, SUM(t.amount) total FROM transactions t
     JOIN categories c ON c.id=t.category_id
     WHERE t.user_id=? AND t.date LIKE ? AND c.budget > 0
     GROUP BY c.id HAVING total > c.budget`,
    userId, like
  );
  over.forEach((r) =>
    out.push({ level: "red", text: `${r.name} vượt ngân sách ${money(r.total - r.budget)}` })
  );

  q.all("SELECT * FROM cards WHERE user_id=? AND active=1 AND limit_amount > 0", userId).forEach((c) => {
    const spent = q.get("SELECT COALESCE(SUM(amount),0) s FROM transactions WHERE user_id=? AND card_id=?", userId, c.id).s;
    const paid = q.get("SELECT COALESCE(SUM(amount),0) s FROM card_payments WHERE user_id=? AND card_id=?", userId, c.id).s;
    const bal = spent + c.opening - paid;
    const u = bal / c.limit_amount;
    if (u >= 0.8) out.push({ level: "red", text: `${c.bank} đã dùng ${Math.round(u * 100)}% hạn mức` });
    else if (u >= 0.5) out.push({ level: "amber", text: `${c.bank} đã dùng ${Math.round(u * 100)}% hạn mức` });
  });

  const spikes = q.all(
    `SELECT c.name, SUM(t.amount) total FROM transactions t
     JOIN categories c ON c.id=t.category_id
     WHERE t.user_id=? AND t.date LIKE ? GROUP BY c.id`,
    userId, like
  );
  spikes.forEach((s) => {
    const avg = q.get(
      `SELECT SUM(t.amount)/3.0 a FROM transactions t JOIN categories c ON c.id=t.category_id
       WHERE t.user_id=? AND c.name=? AND t.date >= ? AND t.date < ?`,
      userId, s.name, shiftMonth(month, -3) + "-01", month + "-01"
    ).a;
    if (avg > 0 && s.total > avg * 1.5 && s.total - avg > 500000) {
      out.push({
        level: "amber",
        text: `${s.name} cao hơn trung bình 3 tháng ${Math.round(((s.total - avg) / avg) * 100)}%`,
      });
    }
  });

  return out.slice(0, 6);
}

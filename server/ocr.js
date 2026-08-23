const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

const PROMPT = `Bạn đọc hóa đơn bán lẻ Việt Nam. Trả về DUY NHẤT một object JSON, không markdown, không giải thích.

Cấu trúc:
{
  "merchant": "tên cửa hàng, chuỗi rỗng nếu không đọc được",
  "date": "YYYY-MM-DD, chuỗi rỗng nếu không đọc được",
  "total": số nguyên tổng tiền phải trả bằng VND, không dấu chấm phẩy, 0 nếu không đọc được,
  "items": [{"name": "tên món", "qty": số lượng, "price": đơn giá VND}],
  "suggested_category": một trong "Ăn uống","Di chuyển","Mua sắm","Hóa đơn","Giải trí","Sức khỏe","Tiếp khách","Khác",
  "confidence": số thực 0 đến 1
}

Quy tắc:
- total là số tiền KHÁCH PHẢI TRẢ cuối cùng, đã gồm VAT và trừ khuyến mãi.
- Hóa đơn VN thường ghi 1.250.000 nghĩa là 1250000. Dấu chấm là phân cách nghìn.
- Nếu ảnh mờ không đọc được số tiền, đặt total 0 và confidence dưới 0.3.
- Tối đa 20 items.`;

export async function readReceipt(base64Image, mime = "image/jpeg") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("Chưa cấu hình GEMINI_API_KEY trên máy chủ");
    err.code = "NO_KEY";
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mime, data: base64Image } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 1200, responseMimeType: "application/json" },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === "AbortError" ? "Đọc hóa đơn quá lâu, thử lại" : "Không gọi được Gemini");
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Đã hết hạn mức Gemini free hôm nay, nhập tay giúp mình");
    throw new Error(`Gemini lỗi ${res.status}: ${body.slice(0, 160)}`);
  }

  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini trả về dữ liệu không đọc được");
  }

  return {
    merchant: String(parsed.merchant || "").slice(0, 120),
    date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || "") ? parsed.date : "",
    total: Math.max(0, Math.round(Number(parsed.total) || 0)),
    items: Array.isArray(parsed.items)
      ? parsed.items.slice(0, 20).map((i) => ({
          name: String(i.name || "").slice(0, 80),
          qty: Number(i.qty) || 1,
          price: Math.round(Number(i.price) || 0),
        }))
      : [],
    suggested_category: String(parsed.suggested_category || "Khác"),
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
  };
}

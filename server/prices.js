/**
 * Lấy giá thị trường trực tiếp từ VCI (Vietcap) — cùng endpoint mà vnstock dùng.
 *
 * Vì sao gọi thẳng thay vì chờ snapshot: vị thế chỉ đổi khi có lệnh mua bán,
 * còn giá đổi liên tục trong phiên. Gộp chung vào một timer nghĩa là giá luôn cũ.
 * Ở đây chỉ là một request HTTPS, không cần Python hay pandas, gần như không tốn RAM.
 *
 * Giá trả về theo ĐỒNG (23300 = 23.300đ), khớp đơn vị costPerShare trong ledger.
 */

const URL = "https://trading.vietcap.com.vn/api/price/symbols/getList";

const CACHE_TTL_OPEN = 15000;   // trong phiên: 15 giây
const CACHE_TTL_CLOSED = 300000; // ngoài phiên: 5 phút, giá không đổi nữa

let cache = { at: 0, data: null, symbols: "" };

/** Phiên HOSE: T2–T6, 09:00–15:00 giờ Việt Nam. */
function marketOpen(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600000); // UTC -> UTC+7
  const dow = vn.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  return minutes >= 9 * 60 && minutes <= 15 * 60;
}

export async function fetchPrices(symbols) {
  const list = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))].sort();
  if (!list.length) return { prices: {}, at: Date.now(), cached: false, market_open: marketOpen() };

  const key = list.join(",");
  const ttl = marketOpen() ? CACHE_TTL_OPEN : CACHE_TTL_CLOSED;
  if (cache.data && cache.symbols === key && Date.now() - cache.at < ttl) {
    return { prices: cache.data, at: cache.at, cached: true, market_open: marketOpen() };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  let res;
  try {
    res = await fetch(URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        Referer: "https://trading.vietcap.com.vn/",
        Accept: "application/json",
      },
      body: JSON.stringify({ symbols: list }),
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === "AbortError" ? "Lấy giá quá lâu" : "Không gọi được máy chủ giá");
  }
  clearTimeout(timer);

  if (!res.ok) throw new Error(`Máy chủ giá trả lỗi ${res.status}`);

  const body = await res.json();
  const rows = Array.isArray(body) ? body : body.data || [];
  const out = {};

  for (const row of rows) {
    const li = row.listingInfo || {};
    const mp = row.matchPrice || {};
    const sym = String(li.symbol || mp.symbol || "").toUpperCase();
    if (!sym) continue;

    // matchPrice = 0 trước giờ khớp lệnh; khi đó dùng giá tham chiếu.
    const match = Number(mp.matchPrice) || 0;
    const ref = Number(li.refPrice) || Number(mp.referencePrice) || 0;
    const price = match > 0 ? match : ref;
    if (price <= 0) continue;

    out[sym] = {
      price,
      ref: ref || null,
      change: ref > 0 ? price - ref : null,
      change_pct: ref > 0 ? ((price - ref) / ref) * 100 : null,
      ceiling: Number(mp.ceilingPrice) || Number(li.ceiling) || null,
      floor: Number(mp.floorPrice) || Number(li.floor) || null,
      volume: Number(mp.accumulatedVolume) || 0,
      source: match > 0 ? "khop" : "tham_chieu",
    };
  }

  cache = { at: Date.now(), data: out, symbols: key };
  return { prices: out, at: cache.at, cached: false, market_open: marketOpen() };
}

/**
 * Ghép giá live vào vị thế lấy từ snapshot rồi tính lại NAV.
 * Nếu lấy giá thất bại, giữ nguyên số của snapshot và đánh dấu nguồn.
 */
export function applyLivePrices(snapshot, live) {
  const positions = (snapshot.positions || []).map((p) => {
    const q = live[p.symbol];
    if (!q) return { ...p, price_live: false };
    const marketValue = Math.round(q.price * p.qty);
    const pl = marketValue - p.cost_total;
    return {
      ...p,
      market_price: q.price,
      market_value: marketValue,
      pl,
      pl_pct: p.cost_total > 0 ? (pl / p.cost_total) * 100 : null,
      day_change: q.change,
      day_change_pct: q.change_pct,
      price_source: q.source,
      price_live: true,
    };
  });

  const allLive = positions.length > 0 && positions.every((p) => p.price_live);
  if (!allLive) return { ...snapshot, positions, live_prices: false };

  const stockValue = positions.reduce((s, p) => s + p.market_value, 0);
  const costValue = positions.reduce((s, p) => s + p.cost_total, 0);
  positions.forEach((p) => {
    p.weight = stockValue > 0 ? (p.market_value / stockValue) * 100 : null;
  });

  return {
    ...snapshot,
    degraded: false,
    live_prices: true,
    positions,
    stock_value: stockValue,
    cost_value: costValue,
    nav: stockValue + snapshot.cash,
    unrealized_pl: stockValue - costValue,
    unrealized_pct: costValue > 0 ? ((stockValue - costValue) / costValue) * 100 : null,
  };
}

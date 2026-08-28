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
    const sellableValue = Math.round(q.price * (p.sellable || 0));
    const pl = marketValue - p.cost_total;
    return {
      ...p,
      market_price: q.price,
      market_value: marketValue,
      pl,
      pl_pct: p.cost_total > 0 ? (pl / p.cost_total) * 100 : null,
      sellable_value: sellableValue,
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

/* ==================== Volume lịch sử & giao dịch bất thường ==================== */

const OHLC_URL = "https://trading.vietcap.com.vn/api/chart/OHLCChart/gap";
let ohlcCache = new Map(); // symbol -> { at, bars }
const OHLC_TTL = 30 * 60 * 1000; // 30 phút, dữ liệu ngày không đổi trong phiên

/**
 * Lấy nến ngày kèm khối lượng. Một request cho nhiều mã.
 *
 * Dùng chính endpoint mà bảng giá đang gọi nên không thêm phụ thuộc nào —
 * không Python, không pandas. Cache 30 phút vì nến ngày chỉ chốt sau phiên.
 */
export async function fetchDailyBars(symbols, days = 90) {
  const list = [...new Set(symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  if (!list.length) return {};

  const fresh = Date.now() - OHLC_TTL;
  const need = list.filter((s) => !ohlcCache.has(s) || ohlcCache.get(s).at < fresh);
  const out = {};
  for (const s of list) if (ohlcCache.has(s) && ohlcCache.get(s).at >= fresh) out[s] = ohlcCache.get(s).bars;
  if (!need.length) return out;

  const to = Math.floor(Date.now() / 1000);
  const from = to - 86400 * days;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let body;
  try {
    const res = await fetch(OHLC_URL, {
      method: "POST", signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        Referer: "https://trading.vietcap.com.vn/", Accept: "application/json",
      },
      body: JSON.stringify({ timeFrame: "ONE_DAY", symbols: need, from, to }),
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`máy chủ trả lỗi ${res.status}`);
    body = await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw new Error(e.name === "AbortError" ? "Lấy dữ liệu phiên quá lâu" : `Không lấy được dữ liệu phiên: ${e.message}`);
  }

  for (const d of (Array.isArray(body) ? body : body.data || [])) {
    const sym = String(d.symbol || "").toUpperCase();
    if (!sym || !Array.isArray(d.t)) continue;
    const bars = d.t.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: d.o[i], high: d.h[i], low: d.l[i], close: d.c[i], volume: d.v[i],
    }));
    ohlcCache.set(sym, { at: Date.now(), bars });
    out[sym] = bars;
  }
  return out;
}

/**
 * Phát hiện phiên có khối lượng bất thường.
 *
 * Cách làm cố ý đơn giản và dễ kiểm chứng: so khối lượng phiên gần nhất với
 * trung vị 20 phiên trước đó. Dùng trung vị chứ không dùng trung bình, vì chỉ
 * cần một phiên đột biến là trung bình bị kéo lệch và những phiên bất thường
 * sau đó sẽ không còn nổi lên nữa.
 *
 * Hướng tiền được suy từ vị trí giá đóng cửa trong biên độ ngày — đây là suy
 * luận, không phải số liệu mua/bán thật, nên nhãn ghi rõ là phỏng đoán.
 *
 * Đây là quan sát, không phải khuyến nghị mua bán.
 */
export function findUnusualVolume(bars, { lookback = 20, ratio = 2 } = {}) {
  if (!Array.isArray(bars) || bars.length < lookback + 1) return null;

  const last = bars[bars.length - 1];
  const prev = bars.slice(-lookback - 1, -1).map((b) => b.volume).filter((v) => v > 0);
  if (prev.length < Math.floor(lookback / 2)) return null;

  const sorted = [...prev].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return null;

  const times = last.volume / median;
  if (times < ratio) return { symbol: last.symbol, unusual: false, times, median, volume: last.volume, date: last.date };

  const range = last.high - last.low;
  const closePos = range > 0 ? (last.close - last.low) / range : 0.5;
  const changePct = last.open > 0 ? ((last.close - last.open) / last.open) * 100 : 0;

  let huong = "khong_ro";
  if (closePos >= 0.7) huong = "ben_mua_manh";
  else if (closePos <= 0.3) huong = "ben_ban_manh";

  return {
    unusual: true, date: last.date, volume: last.volume, median,
    times, huong, dong_cua_trong_bien: closePos, thay_doi_pct: changePct,
  };
}

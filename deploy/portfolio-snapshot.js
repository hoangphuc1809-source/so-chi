/**
 * portfolio-snapshot.js — tinh danh muc chung khoan hien tai va day sang app So Chi.
 *
 * FILE NAY CHAY TREN hermes-gateway, DAT TRONG THU MUC portfolio-bot,
 * KHONG phai tren hermes-family. No dung chung ledger.js + price.py cua
 * portfolio-bot nen phai nam canh cac file do.
 *
 * Cai dat:
 *   cd ~/portfolio-bot
 *   curl -sL -o snapshot.js https://raw.githubusercontent.com/hoangphuc1809-source/so-chi/main/deploy/portfolio-snapshot.js
 *   # them vao .env:  SOCHI_URL, SOCHI_PUSH_TOKEN, SNAPSHOT_CHAT_ID
 *
 *   node snapshot.js            -> in JSON ra man hinh (khong day)
 *   node snapshot.js --push     -> day len So Chi qua Cloudflare Worker
 *
 * Dung chung ledger.js + price.py cua portfolio-bot, khong viet lai logic FIFO.
 */
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const cfg = require("./config.js");
const store = require("./store.js");
const { rebuild } = require("./ledger.js");

const CHAT_ID = process.env.SNAPSHOT_CHAT_ID || (process.env.ALLOWED_CHAT_IDS || "").split(",")[0].trim();
const SOCHI_URL = process.env.SOCHI_URL || "";
const SOCHI_TOKEN = process.env.SOCHI_PUSH_TOKEN || "";

function livePrices(symbols) {
  if (!symbols.length) return { prices: {}, missing: [] };
  const r = spawnSync(cfg.PYTHON_EXE, [path.join(__dirname, "price.py"), ...symbols],
    { encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) return { prices: {}, missing: symbols, error: (r.stderr || "").slice(0, 200) };
  try {
    const out = JSON.parse(r.stdout);
    return out.ok ? { prices: out.prices || {}, missing: out.missing || [] }
                  : { prices: {}, missing: symbols, error: out.error };
  } catch {
    return { prices: {}, missing: symbols, error: "price.py tra ve JSON hong" };
  }
}

function build() {
  const data = store.load(CHAT_ID);
  const txs = (data && data.transactions) || [];
  const state = rebuild(txs);
  if (state.error) return { ok: false, error: state.error };

  const symbols = Object.keys(state.positions);
  const { prices, missing, error: priceErr } = livePrices(symbols);

  const positions = symbols.map((sym) => {
    // price.py tra gia theo NGHIN DONG, costPerShare trong ledger theo DONG.
    const mktVND = prices[sym] != null ? prices[sym] * 1000 : null;
    const p = state.positions[sym];
    const marketValue = mktVND != null ? Math.round(mktVND * p.qty) : null;
    const pl = marketValue != null ? marketValue - p.costTotal : null;
    return {
      symbol: sym,
      qty: p.qty,
      avg_cost: Math.round(p.avgCostVND),
      market_price: mktVND,
      cost_total: p.costTotal,
      market_value: marketValue,
      pl,
      pl_pct: pl != null && p.costTotal > 0 ? (pl / p.costTotal) * 100 : null,
      lots: p.lots.length,
      oldest_lot: p.lots.length ? p.lots[0].date : null,
    };
  }).sort((a, b) => (b.market_value || 0) - (a.market_value || 0));

  const stockValue = positions.reduce((s, p) => s + (p.market_value || 0), 0);
  const costValue = positions.reduce((s, p) => s + p.cost_total, 0);
  const nav = stockValue + state.cash;
  const realizedTotal = (state.realized || []).reduce((s, r) => s + (r.pl || 0), 0);

  positions.forEach((p) => {
    p.weight = stockValue > 0 && p.market_value != null ? (p.market_value / stockValue) * 100 : null;
  });

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    nav,
    cash: state.cash,
    margin_debt: state.cash < 0 ? -state.cash : 0,
    stock_value: stockValue,
    cost_value: costValue,
    unrealized_pl: stockValue - costValue,
    unrealized_pct: costValue > 0 ? ((stockValue - costValue) / costValue) * 100 : null,
    realized_pl: realizedTotal,
    positions,
    price_missing: missing,
    price_error: priceErr || null,
    tx_count: txs.length,
  };
}

async function main() {
  const snap = build();
  if (!process.argv.includes("--push")) {
    console.log(JSON.stringify(snap, null, 2));
    return;
  }
  if (!snap.ok) { console.error("[snapshot] loi ledger:", snap.error); process.exit(1); }
  if (!SOCHI_URL || !SOCHI_TOKEN) { console.error("[snapshot] thieu SOCHI_URL / SOCHI_PUSH_TOKEN"); process.exit(1); }

  const res = await fetch(SOCHI_URL.replace(/\/$/, "") + "/api/portfolio/snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sochi-Push": SOCHI_TOKEN },
    body: JSON.stringify(snap),
  });
  const body = await res.text();
  if (!res.ok) { console.error("[snapshot] day that bai", res.status, body.slice(0, 200)); process.exit(1); }
  console.log(`[snapshot] da day NAV=${snap.nav} ${snap.positions.length} ma`);
}

main().catch((e) => { console.error("[snapshot] loi:", e.message); process.exit(1); });

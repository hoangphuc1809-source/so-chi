/**
 * portfolio-migrate.js — di trú sổ giao dịch chứng khoán sang app Sổ Chi.
 *
 * CHẠY TRÊN hermes-gateway, đặt trong thư mục portfolio-bot.
 *
 *   node migrate.js            -> chỉ in ra những gì sẽ gửi, KHÔNG gửi
 *   node migrate.js --push     -> gửi sang Sổ Chi và đối chiếu
 *
 * KHÔNG xóa, KHÔNG sửa transactions.json. File gốc vẫn là bản gốc.
 * Script gửi kèm kết quả rebuild() do CHÍNH engine cũ tính trên file gốc,
 * để Sổ Chi dựng lại từ SQLite rồi so từng con số. Chỉ khi khớp tuyệt đối
 * mới được phép chuyển đường ghi sang app.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const store = require("./store.js");
const { rebuild } = require("./ledger.js");

const CHAT_ID = process.env.SNAPSHOT_CHAT_ID || (process.env.ALLOWED_CHAT_IDS || "").split(",")[0].trim();
const SOCHI_URL = process.env.SOCHI_URL || "";
const SOCHI_TOKEN = process.env.SOCHI_PUSH_TOKEN || "";

const vnd = (n) => Math.round(n || 0).toLocaleString("vi-VN") + "d";

function build() {
  const data = store.load(CHAT_ID);
  const txs = data.transactions || [];
  const voided = data.voided || [];
  const st = rebuild(txs);

  return {
    transactions: txs,
    voided,
    expected: {
      cash: st.cash,
      positions: Object.fromEntries(
        Object.entries(st.positions).map(([k, v]) => [k, { qty: v.qty, costTotal: v.costTotal }])
      ),
      realized: (st.realized || []).map((r) => ({ pl: r.pl, symbol: r.symbol, date: r.date })),
      error: st.error || null,
    },
  };
}

async function main() {
  const payload = build();
  const e = payload.expected;

  console.log("=== SO GIAO DICH TREN GATEWAY ===");
  console.log("  chat_id        :", CHAT_ID);
  console.log("  so giao dich   :", payload.transactions.length);
  console.log("  da huy         :", payload.voided.length);
  console.log("  tien mat       :", vnd(e.cash));
  console.log("  vi the         :");
  for (const [sym, p] of Object.entries(e.positions)) {
    console.log(`    ${sym.padEnd(4)} ${String(p.qty).padStart(6)} cp   gia von tong ${vnd(p.costTotal)}`);
  }
  console.log("  lai da thuc hien:", vnd(e.realized.reduce((s, r) => s + r.pl, 0)),
              `(${e.realized.length} lan ban)`);
  if (e.error) console.log("  LOI ENGINE     :", e.error);

  if (!process.argv.includes("--push")) {
    console.log("\n(chua gui - them --push de gui sang So Chi)");
    return;
  }
  if (!SOCHI_URL || !SOCHI_TOKEN) {
    console.error("Thieu SOCHI_URL hoac SOCHI_PUSH_TOKEN trong .env");
    process.exit(1);
  }

  const res = await fetch(SOCHI_URL.replace(/\/$/, "") + "/api/stock/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Sochi-Push": SOCHI_TOKEN },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("\nGui that bai:", res.status, body.slice(0, 300));
    process.exit(1);
  }

  const out = JSON.parse(body);
  console.log("\n=== KET QUA NHAP ===");
  console.log("  da nhap:", out.imported, "giao dich,", out.voided, "da huy");

  const dc = out.doi_chieu;
  if (!dc) {
    console.log("  (khong doi chieu duoc)");
    return;
  }
  console.log("\n=== DOI CHIEU HAI HE ===");
  console.log("  So Chi dung lai tu SQLite:");
  console.log("    so giao dich    :", dc.so_giao_dich);
  console.log("    tien mat        :", vnd(dc.tien_mat));
  console.log("    so ma           :", dc.so_ma);
  console.log("    lai da thuc hien:", vnd(dc.lai_da_thuc_hien));
  if (dc.khop) {
    console.log("\n  ==> KHOP TUYET DOI. Hai he cho ra cung mot ket qua.");
  } else {
    console.log("\n  ==> CO LECH, KHONG duoc chuyen duong ghi:");
    dc.lech.forEach((d) =>
      console.log(`    ${d.field}: So Chi=${d.so_chi}  portfolio-bot=${d.portfolio_bot}` +
                  (d.lech !== undefined ? `  lech=${d.lech}` : "")));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Loi:", e.message);
  process.exit(1);
});

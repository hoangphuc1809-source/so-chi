/**
 * Gop cac file src/*.jsx theo thu tu ten roi bien dich JSX -> JS thuan.
 * Chay tren may dev, KHONG chay tren VPS. Ket qua: public/app.js
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const babel = require("@babel/core");

const SRC = "src";
const OUT = "public/app.js";

const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".jsx")).sort();
const source = files
  .map((f) => `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(SRC, f), "utf8"))
  .join("\n\n");

const { code } = babel.transformSync(source, {
  presets: [[require("@babel/preset-react"), { runtime: "classic", development: false }]],
  compact: false,
  comments: false,
});

fs.writeFileSync(OUT, "/* So Chi - sinh tu src/*.jsx, dung sua truc tiep */\n" + code);
console.log(`build: ${files.length} file -> ${OUT} (${(code.length / 1024).toFixed(0)} KB)`);

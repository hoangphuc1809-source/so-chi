/**
 * Sao luu so lieu So Chi moi dem.
 * Dung VACUUM INTO: ra mot file .db hoan chinh, nhat quan ke ca khi app dang
 * chay (khong phai chep tay file -wal/-shm). Giu 14 ban gan nhat.
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "../server/db.js";

const DIR = process.env.SOCHI_BACKUP_DIR || "/home/hoang/sochi-backups";
const KEEP = Number(process.env.SOCHI_BACKUP_KEEP || 14);

fs.mkdirSync(DIR, { recursive: true });
const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const file = path.join(DIR, `sochi-${day}.db`);
if (fs.existsSync(file)) fs.unlinkSync(file); // chay lai trong ngay thi ghi de ban cua ngay do

db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
const size = fs.statSync(file).size;
if (size < 4096) throw new Error("file sao luu qua nho, kiem tra lai");

const all = fs.readdirSync(DIR).filter((f) => /^sochi-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
const old = all.slice(0, Math.max(0, all.length - KEEP));
for (const f of old) fs.unlinkSync(path.join(DIR, f));

console.log(`[sao-luu] ${file} ${(size / 1024).toFixed(0)} KB, giu ${all.length - old.length} ban, xoa ${old.length} ban cu`);

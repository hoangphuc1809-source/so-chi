import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = process.env.SOCHI_DATA || path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "sochi.db"));

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  salt        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  icon      TEXT NOT NULL DEFAULT '📌',
  color     TEXT NOT NULL DEFAULT '#6B7280',
  budget    INTEGER NOT NULL DEFAULT 0,
  subs      TEXT NOT NULL DEFAULT '[]',
  sort      INTEGER NOT NULL DEFAULT 0,
  archived  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank          TEXT NOT NULL,
  last4         TEXT NOT NULL DEFAULT '',
  limit_amount  INTEGER NOT NULL DEFAULT 0,
  statement_day INTEGER NOT NULL DEFAULT 1,
  due_day       INTEGER NOT NULL DEFAULT 15,
  opening       INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,
  category_id TEXT NOT NULL,
  sub         TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'personal',
  method      TEXT NOT NULL DEFAULT 'cash',
  card_id     TEXT,
  note        TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'manual',
  receipt     TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_card ON transactions(card_id);

CREATE TABLE IF NOT EXISTS bills (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        INTEGER NOT NULL DEFAULT 0,
  category_id   TEXT NOT NULL DEFAULT 'bills',
  next_due      TEXT NOT NULL,
  recurrence    TEXT NOT NULL DEFAULT 'monthly',
  reminder_days INTEGER NOT NULL DEFAULT 3,
  method        TEXT NOT NULL DEFAULT 'bank',
  card_id       TEXT,
  autopay       INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  last_notified TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bill_due ON bills(user_id, next_due);

CREATE TABLE IF NOT EXISTS bill_payments (
  id         TEXT PRIMARY KEY,
  bill_id    TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  paid_date  TEXT NOT NULL,
  tx_id      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS card_payments (
  id         TEXT PRIMARY KEY,
  card_id    TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  paid_date  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- So giao dich chung khoan: APPEND-ONLY, giong het triet ly cua portfolio-bot.
-- Cot raw giu nguyen van object JSON goc de rebuild() nhan dung dau vao
-- nhu ban chay tren gateway -> doi chieu moi co y nghia.
CREATE TABLE IF NOT EXISTS stock_tx (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL,
  date        TEXT NOT NULL,
  symbol      TEXT,
  qty         INTEGER,
  price_vnd   REAL,
  cash        INTEGER,
  note        TEXT,
  raw         TEXT NOT NULL,
  voided      INTEGER NOT NULL DEFAULT 0,
  voided_at   TEXT,
  void_reason TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_stock_tx_user ON stock_tx(user_id, date, seq);

-- Moc cat lo / chot loi do chinh nguoi dung dat. App khong tu sinh moc nao.
CREATE TABLE IF NOT EXISTS stock_alert (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  stop       INTEGER,
  target     INTEGER,
  note       TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_alert_uniq ON stock_alert(user_id, symbol);

-- Moc doi chieu voi so lieu that tu cong ty chung khoan.
-- Moi lan doi chieu la mot moc khoa so: du lieu truoc moc coi nhu da xac nhan.
CREATE TABLE IF NOT EXISTS stock_reconcile (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  cash_broker   INTEGER NOT NULL,
  cash_book     INTEGER NOT NULL,
  diff          INTEGER NOT NULL,
  positions_ok  INTEGER NOT NULL DEFAULT 1,
  adjustment_id TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_rec_user ON stock_reconcile(user_id, date);

CREATE TABLE IF NOT EXISTS portfolio_snapshot (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload     TEXT NOT NULL,
  generated_at TEXT,
  received_at INTEGER NOT NULL
);
`);

export const uid = () => randomUUID().replace(/-/g, "").slice(0, 16);
export const now = () => Date.now();

export const q = {
  all: (sql, ...p) => db.prepare(sql).all(...p),
  get: (sql, ...p) => db.prepare(sql).get(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

export const DEFAULT_CATEGORIES = [
  { name: "Ăn uống", icon: "🍜", color: "#DC2626", subs: [] },
  { name: "Di chuyển", icon: "🚗", color: "#2563EB", subs: [] },
  { name: "Mua sắm", icon: "🛍️", color: "#7C3AED", subs: [] },
  { name: "Hóa đơn", icon: "🧾", color: "#0E9F6E", subs: [] },
  { name: "Giải trí", icon: "🎬", color: "#DB2777", subs: [] },
  { name: "Sức khỏe", icon: "💊", color: "#0891B2", subs: [] },
  {
    name: "Tiếp khách",
    icon: "🥂",
    color: "#D97706",
    subs: ["Khách hàng", "Team building", "Công tác", "Quà / VIP"],
  },
  { name: "Khác", icon: "📦", color: "#6B7280", subs: [] },
];

export function seedCategories(userId) {
  DEFAULT_CATEGORIES.forEach((c, i) => {
    q.run(
      `INSERT INTO categories (id,user_id,name,icon,color,budget,subs,sort)
       VALUES (?,?,?,?,?,0,?,?)`,
      uid(), userId, c.name, c.icon, c.color, JSON.stringify(c.subs), i
    );
  });
}

import Database from "better-sqlite3";
import path from "node:path";
import menu from "@/data/safal-menu.json";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shops (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_open INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id), category TEXT NOT NULL,
  name TEXT NOT NULL, portion TEXT, available INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), size TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0), UNIQUE (item_id, size));
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id), email TEXT NOT NULL, code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN
    ('awaiting_payment','placed','accepted','preparing','ready','collected','rejected','cancelled','not_collected','expired')),
  total INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', pickup_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_lines (
  order_id TEXT NOT NULL REFERENCES orders(id), variant_id INTEGER NOT NULL,
  name TEXT NOT NULL, size TEXT NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_order ON orders(email)
  WHERE status IN ('awaiting_payment','placed','accepted','preparing','ready');
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_code ON orders(shop_id, code)
  WHERE status IN ('awaiting_payment','placed','accepted','preparing','ready');
CREATE TABLE IF NOT EXISTS payments (
  order_id TEXT PRIMARY KEY REFERENCES orders(id), provider TEXT NOT NULL CHECK (provider IN ('razorpay','mock')),
  gateway_order_id TEXT NOT NULL UNIQUE, payment_id TEXT UNIQUE, amount_paise INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','authorized','captured','refund_due','refunded')));
`;

// Version 1 added payments. SQLite can't alter a CHECK, so the orders table is rebuilt with its rows kept.
function migrate(db: Database.Database) {
  const old = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'orders'").get();
  if ((db.pragma("user_version", { simple: true }) as number) >= 1) return;
  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    if ((db.pragma("user_version", { simple: true }) as number) >= 1) return;
    if (old) {
      db.exec("DROP INDEX IF EXISTS one_active_order; DROP INDEX IF EXISTS unique_active_code; PRAGMA legacy_alter_table = ON; ALTER TABLE orders RENAME TO orders_old;");
      db.exec(SCHEMA);
      db.exec("INSERT INTO orders SELECT id, shop_id, email, code, status, total, note, pickup_at, created_at FROM orders_old; DROP TABLE orders_old;");
    } else db.exec(SCHEMA);
    if ((db.pragma("foreign_key_check") as unknown[]).length) throw new Error("Migration check failed");
    db.pragma("user_version = 1");
  }).immediate();
  db.pragma("legacy_alter_table = OFF");
}

// Version 2 added the shop dashboard. claim_at marks an order whose payment is being captured.
const migrateShop = (db: Database.Database) => db.transaction(() => {
  if ((db.pragma("user_version", { simple: true }) as number) >= 2) return;
  db.exec(`ALTER TABLE orders ADD COLUMN placed_at TEXT; ALTER TABLE orders ADD COLUMN accepted_at TEXT;
    ALTER TABLE orders ADD COLUMN ready_by TEXT; ALTER TABLE orders ADD COLUMN ready_at TEXT;
    ALTER TABLE orders ADD COLUMN done_at TEXT; ALTER TABLE orders ADD COLUMN reason TEXT;
    ALTER TABLE orders ADD COLUMN claim_at INTEGER;
    CREATE TABLE shop_login (shop_id TEXT PRIMARY KEY REFERENCES shops(id), salt TEXT NOT NULL, hash TEXT NOT NULL);`);
  db.pragma("user_version = 2");
}).immediate();

// Version 3 simplified the flow: a paid order goes straight to Safal, so the accept and preparing steps are gone.
// Their columns (accepted_at, ready_by, claim_at) stay but are no longer used.
const migrateFlow = (db: Database.Database) => db.transaction(() => {
  if ((db.pragma("user_version", { simple: true }) as number) >= 3) return;
  db.exec("UPDATE orders SET status='placed' WHERE status IN ('accepted','preparing'); UPDATE orders SET claim_at=NULL;");
  db.pragma("user_version = 3");
}).immediate();

function create() {
  const db = new Database(process.env.DB_PATH || path.join(process.cwd(), "data", "campus.db"), { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  migrate(db);
  migrateShop(db);
  migrateFlow(db);
  db.pragma("foreign_keys = ON");
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM shops WHERE id = 'safal'").get()) return;
    db.prepare("INSERT INTO shops (id, name) VALUES ('safal', ?)").run(menu.shop);
    const item = db.prepare("INSERT INTO items (id, shop_id, category, name, portion, sort) VALUES (?, 'safal', ?, ?, ?, ?)");
    const variant = db.prepare("INSERT INTO variants (item_id, size, price) VALUES (?, ?, ?)");
    let sort = 0;
    for (const c of menu.categories) for (const i of c.items) {
      item.run(i.id, c.name, i.name, "portion" in i ? i.portion : null, sort++);
      for (const v of i.variants) variant.run(i.id, v.size, v.price);
    }
  }).immediate();
  return db;
}
const g = globalThis as unknown as { __db?: Database.Database };
// Opened on first use so building the app never touches the database.
export const db = () => (g.__db ??= create());

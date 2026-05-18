import * as SQLite from "expo-sqlite";

// Lazy-init: openDatabaseSync is native-only, do NOT call at module load time
let _db: SQLite.SQLiteDatabase | null = null;

export const getDb = (): SQLite.SQLiteDatabase => {
  if (!_db) _db = SQLite.openDatabaseSync("idine_lite.db");
  return _db;
};

export const initDatabase = async () => {
  const db = getDb();
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      shop_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      local_id TEXT UNIQUE,
      shop_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      updated_at INTEGER,
      deleted_at INTEGER,
      server_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER,
      name TEXT NOT NULL,
      abbreviation TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT UNIQUE,
      shop_id INTEGER NOT NULL,
      category_id INTEGER,
      unit_id INTEGER,
      server_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      price REAL DEFAULT 0,
      image_url TEXT,
      is_available INTEGER DEFAULT 1,
      updated_at INTEGER,
      deleted_at INTEGER
    );

    -- Migrate existing products table if needed (ignore errors)


    CREATE TABLE IF NOT EXISTS portions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      server_id INTEGER,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      deleted_at INTEGER
    );



    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT UNIQUE NOT NULL,
      server_id INTEGER,
      shop_id INTEGER NOT NULL,
      user_id INTEGER,
      order_no TEXT,
      status TEXT DEFAULT 'open',
      table_no TEXT,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      collected_amount REAL,
      change_amount REAL,
      payment_method TEXT DEFAULT 'cash',
      kot_printed INTEGER DEFAULT 0,
      receipt_printed INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      portion_id INTEGER,
      product_name TEXT NOT NULL,
      portion_name TEXT,
      qty INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS local_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrations — safe: ignore if column already exists
  const migrations = [
    "ALTER TABLE products ADD COLUMN unit_id INTEGER",
    "ALTER TABLE products ADD COLUMN description TEXT",
    "ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'dine-in'",
  ];
  for (const sql of migrations) {
    try { db.execSync(sql); } catch { /* column already exists */ }
  }

  // Seed default portion template "Regular" if none exist (runs every init)
  try {
    db.runSync(
      `INSERT INTO portions (product_id, name, price)
       SELECT 0, 'Regular', 0 WHERE NOT EXISTS (
         SELECT 1 FROM portions WHERE product_id = 0 AND name = 'Regular' AND deleted_at IS NULL
       )`
    );
  } catch { /* ignore */ }
};

// Proxy object — all callers import `db` and use it as before
const db = {
  getAllSync: (...a: Parameters<SQLite.SQLiteDatabase["getAllSync"]>) => getDb().getAllSync(...a),
  runSync: (...a: Parameters<SQLite.SQLiteDatabase["runSync"]>) => getDb().runSync(...a),
  getFirstSync: (...a: Parameters<SQLite.SQLiteDatabase["getFirstSync"]>) => getDb().getFirstSync(...a),
  execSync: (...a: Parameters<SQLite.SQLiteDatabase["execSync"]>) => getDb().execSync(...a),
};

export default db;

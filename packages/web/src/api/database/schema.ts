import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Shops
export const shops = sqliteTable("shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  ownerName: text("owner_name"),
  ownerMobile: text("owner_mobile"),
  businessType: text("business_type"),
  remarks: text("remarks"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  suspendReason: text("suspend_reason"),
  receiptHeaderImage: text("receipt_header_image"), // base64 PNG/JPG for receipt header
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Users
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  plainPassword: text("plain_password"),
  role: text("role", { enum: ["admin", "cashier"] }).notNull().default("cashier"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Categories
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Products
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  categoryId: integer("category_id").references(() => categories.id),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull().default(0),
  imageUrl: text("image_url"),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Portions
export const portions = sqliteTable("portions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  price: real("price").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Orders
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  localId: text("local_id").unique(), // UUID from device
  shopId: integer("shop_id").notNull().references(() => shops.id),
  userId: integer("user_id").references(() => users.id),
  orderNo: text("order_no"),
  status: text("status", { enum: ["open", "kot", "billed", "cancelled"] }).notNull().default("open"),
  tableNo: text("table_no"),
  subtotal: real("subtotal").notNull().default(0),
  discount: real("discount").notNull().default(0),
  total: real("total").notNull().default(0),
  collectedAmount: real("collected_amount"),
  changeAmount: real("change_amount"),
  paymentMethod: text("payment_method", { enum: ["cash", "card", "online"] }).default("cash"),
  orderType: text("order_type", { enum: ["dine_in", "takeaway", "delivery"] }).default("dine_in"),
  kotPrinted: integer("kot_printed", { mode: "boolean" }).notNull().default(false),
  receiptPrinted: integer("receipt_printed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Order Items
export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  productId: integer("product_id").references(() => products.id),
  portionId: integer("portion_id").references(() => portions.id),
  productName: text("product_name").notNull(),
  portionName: text("portion_name"),
  qty: integer("qty").notNull().default(1),
  unitPrice: real("unit_price").notNull(),
  lineTotal: real("line_total").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Units (per shop)
export const units = sqliteTable("units", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Portion Templates (global per shop — not tied to a product)
export const portionTemplates = sqliteTable("portion_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Settings (key-value store for system config)
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Sync Log (server side — track what was pushed per device)
export const syncLog = sqliteTable("sync_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull(),
  deviceId: text("device_id"),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  operation: text("operation", { enum: ["insert", "update", "delete"] }).notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const client = createClient({ url: "file:idine.db" });

const hash = await bcrypt.hash("demo123", 10);

// Shop
await client.execute({
  sql: `INSERT OR IGNORE INTO shops (code, name, address, phone, created_at, updated_at)
        VALUES ('DEMO01', 'iDine Demo Restaurant', '123 Main Street, Colombo', '+94 11 234 5678', unixepoch(), unixepoch())`,
  args: [],
});

const shopRes = await client.execute(`SELECT id FROM shops WHERE code = 'DEMO01'`);
const shopId = shopRes.rows[0].id as number;
console.log("Shop ID:", shopId);

// Admin user
await client.execute({
  sql: `INSERT OR IGNORE INTO users (shop_id, username, password_hash, role, is_active, created_at, updated_at)
        VALUES (?, 'admin', ?, 'admin', 1, unixepoch(), unixepoch())`,
  args: [shopId, hash],
});

// Categories
const cats = ["Starters", "Rice & Noodles", "Grills", "Burgers", "Beverages", "Desserts"];
for (let i = 0; i < cats.length; i++) {
  await client.execute({
    sql: `INSERT OR IGNORE INTO categories (shop_id, name, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, unixepoch(), unixepoch())`,
    args: [shopId, cats[i], i],
  });
}

const catRows = await client.execute(`SELECT id, name FROM categories WHERE shop_id = ?`, [shopId]);
const catMap: Record<string, number> = {};
for (const r of catRows.rows) catMap[r.name as string] = r.id as number;
console.log("Categories:", catMap);

// Products
const products: [number, string, string, number][] = [
  [catMap["Starters"],       "Spring Rolls (4 pcs)",   "Crispy vegetable spring rolls",     350],
  [catMap["Starters"],       "Chicken Wings",           "Spicy buffalo chicken wings",       550],
  [catMap["Starters"],       "Prawn Cocktail",          "Chilled prawns with cocktail sauce", 650],
  [catMap["Rice & Noodles"], "Chicken Fried Rice",      "Wok-fried rice with chicken",        480],
  [catMap["Rice & Noodles"], "Seafood Noodles",         "Stir-fried noodles with seafood",    620],
  [catMap["Rice & Noodles"], "Veg Fried Rice",          "Classic veggie fried rice",          380],
  [catMap["Grills"],         "Grilled Chicken",         "Half grilled chicken with sides",   1200],
  [catMap["Grills"],         "BBQ Ribs",                "Slow-cooked pork ribs",             1500],
  [catMap["Grills"],         "Fish on the Grill",       "Fresh catch grilled to perfection",  980],
  [catMap["Burgers"],        "Classic Beef Burger",     "Beef patty with lettuce & cheese",   650],
  [catMap["Burgers"],        "Chicken Burger",          "Crispy chicken fillet burger",       550],
  [catMap["Burgers"],        "Veggie Burger",           "Garden patty with fresh veggies",    450],
  [catMap["Beverages"],      "Fresh Lime Juice",        "Squeezed lime with soda",            180],
  [catMap["Beverages"],      "Mango Lassi",             "Chilled mango yogurt drink",         220],
  [catMap["Beverages"],      "Soft Drink",              "Coke, Sprite, Fanta",                150],
  [catMap["Beverages"],      "Mineral Water",           "500ml bottled water",                 80],
  [catMap["Desserts"],       "Chocolate Lava Cake",     "Warm cake with molten center",       420],
  [catMap["Desserts"],       "Ice Cream (3 scoops)",    "Vanilla, Chocolate, Strawberry",     350],
  [catMap["Desserts"],       "Watalappan",              "Traditional Sri Lankan dessert",     280],
];

for (const [catId, name, desc, price] of products) {
  await client.execute({
    sql: `INSERT INTO products (shop_id, category_id, name, description, price, is_available, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, unixepoch(), unixepoch())`,
    args: [shopId, catId, name, desc, price],
  });
}

// Portions for Grills
const grillProds = await client.execute(
  `SELECT id FROM products WHERE shop_id = ? AND category_id = ?`,
  [shopId, catMap["Grills"]]
);
for (const p of grillProds.rows) {
  await client.execute({ sql: `INSERT INTO portions (product_id, name, price) VALUES (?, 'Half', 0)`, args: [p.id] });
  await client.execute({ sql: `INSERT INTO portions (product_id, name, price) VALUES (?, 'Full', 200)`, args: [p.id] });
}

const final = await client.execute(`SELECT COUNT(*) as c FROM products WHERE shop_id = ?`, [shopId]);
console.log("Total products:", final.rows[0].c);
console.log("Seed complete!");

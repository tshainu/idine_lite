import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { getDb } from "./database";

// ── CSV helpers ────────────────────────────────────────────────
function escapeCell(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(headers: string[], rows: any[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  rows.forEach((r) => lines.push(r.map(escapeCell).join(",")));
  return lines.join("\n");
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { cells.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

// ── Export Items ───────────────────────────────────────────────
export async function exportItems(): Promise<string> {
  const db = getDb();
  const rows = db.getAllSync(`
    SELECT p.name, p.description, p.price, c.name AS category, p.is_available
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.deleted_at IS NULL
    ORDER BY c.name, p.name
  `) as any[];

  const csv = toCSV(
    ["name", "description", "price", "category", "is_available"],
    rows.map((r) => [r.name, r.description ?? "", r.price, r.category ?? "", r.is_available])
  );

  const path = FileSystem.cacheDirectory + "idine_items_export.csv";
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export Items" });
  return path;
}

// ── Import Items ───────────────────────────────────────────────
export async function importItems(shopId: number): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const db = getDb();
  const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "*/*"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) throw new Error("Cancelled");

  const text = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
  const [header, ...dataRows] = parseCSV(text);

  // Normalize headers
  const h = header.map((x) => x.trim().toLowerCase());
  const col = (name: string) => h.indexOf(name);

  const iName = col("name");
  const iPrice = col("price");
  const iDesc = col("description");
  const iCat = col("category");
  const iAvail = col("is_available");

  if (iName === -1 || iPrice === -1) throw new Error("CSV must have 'name' and 'price' columns");

  let inserted = 0, skipped = 0;
  const errors: string[] = [];
  const ts = Date.now();

  // Cache categories
  const cats = db.getAllSync("SELECT id, name FROM categories WHERE deleted_at IS NULL") as { id: number; name: string }[];
  const catMap: Record<string, number> = {};
  cats.forEach((c) => { catMap[c.name.toLowerCase()] = c.id; });

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const name = row[iName]?.trim();
    const priceRaw = row[iPrice]?.trim();

    if (!name) { skipped++; continue; }
    const price = parseFloat(priceRaw);
    if (isNaN(price)) { errors.push(`Row ${i + 2}: invalid price "${priceRaw}"`); skipped++; continue; }

    const desc = iDesc >= 0 ? (row[iDesc]?.trim() || null) : null;
    const catName = iCat >= 0 ? row[iCat]?.trim() : "";
    const isAvail = iAvail >= 0 ? (row[iAvail]?.trim() === "0" ? 0 : 1) : 1;

    // Find or create category
    let catId: number | null = null;
    if (catName) {
      const key = catName.toLowerCase();
      if (catMap[key] !== undefined) {
        catId = catMap[key];
      } else {
        db.runSync("INSERT INTO categories (shop_id, name, sort_order, updated_at) VALUES (?, ?, 999, ?)", [shopId, catName, ts]);
        const newCat = db.getFirstSync("SELECT id FROM categories WHERE name = ? AND shop_id = ? ORDER BY id DESC LIMIT 1", [catName, shopId]) as { id: number } | null;
        if (newCat) { catMap[key] = newCat.id; catId = newCat.id; }
      }
    }

    // Check if product already exists (same name + shop)
    const exists = db.getFirstSync("SELECT id FROM products WHERE name = ? AND shop_id = ? AND deleted_at IS NULL", [name, shopId]);
    if (exists) { skipped++; continue; }

    db.runSync(
      "INSERT INTO products (shop_id, category_id, name, description, price, is_available, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [shopId, catId, name, desc, price, isAvail, ts]
    );
    inserted++;
  }

  return { inserted, skipped, errors };
}

// ── Export Sales ───────────────────────────────────────────────
export async function exportSales(): Promise<string> {
  const db = getDb();
  const rows = db.getAllSync(`
    SELECT
      o.id,
      datetime(o.created_at / 1000, 'unixepoch', 'localtime') AS date_time,
      o.status,
      o.order_type,
      oi.product_name,
      oi.portion_name,
      oi.qty,
      oi.unit_price,
      oi.line_total,
      o.subtotal,
      o.discount,
      o.total,
      o.payment_method
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    ORDER BY o.created_at DESC
  `) as any[];

  const csv = toCSV(
    ["order_id", "date_time", "status", "order_type", "item_name", "portion", "qty", "unit_price", "line_total", "order_subtotal", "discount", "order_total", "payment_method"],
    rows.map((r) => [r.id, r.date_time, r.status, r.order_type, r.product_name, r.portion_name ?? "", r.qty, r.unit_price, r.line_total, r.subtotal, r.discount, r.total, r.payment_method])
  );

  const path = FileSystem.cacheDirectory + "idine_sales_export.csv";
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export Sales" });
  return path;
}

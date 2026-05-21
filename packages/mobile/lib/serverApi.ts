/**
 * serverApi.ts
 * All server communication goes through here.
 * Local SQLite is a read cache — always write to server first, then refresh local.
 */
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import { store } from "./store";
import db from "./database";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getBase(): Promise<string> {
  const url = await store.getApiUrl();
  return url ?? "";
}

async function apiFetch(path: string, opts?: RequestInit) {
  const base = await getBase();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Full pull: download everything for a shop and seed local DB ──────────────

export async function pullAllFromServer(shopId: number): Promise<void> {
  if (Platform.OS === "web") return;

  const [catsRes, prodsRes, unitsRes, ptRes] = await Promise.all([
    apiFetch(`/api/categories?shop_id=${shopId}`),
    apiFetch(`/api/products?shop_id=${shopId}`),
    apiFetch(`/api/units?shop_id=${shopId}`).catch(() => ({ units: [] })),
    apiFetch(`/api/portion-templates?shop_id=${shopId}`).catch(() => ({ portionTemplates: [] })),
  ]);

  // ── Categories ──
  db.execSync("DELETE FROM categories WHERE shop_id = " + shopId);
  for (const c of catsRes.categories ?? []) {
    db.runSync(
      `INSERT OR REPLACE INTO categories (id, shop_id, name, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [c.id, c.shopId, c.name, c.sortOrder ?? 0, c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now()]
    );
  }

  // ── Units ──
  db.execSync("DELETE FROM units WHERE shop_id = " + shopId);
  for (const u of unitsRes.units ?? []) {
    db.runSync(
      `INSERT OR REPLACE INTO units (id, shop_id, name, abbreviation, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [u.id, u.shopId, u.name, u.abbreviation ?? null, u.updatedAt ? new Date(u.updatedAt).getTime() : Date.now()]
    );
  }

  // ── Portion templates (product_id = 0 convention) ──
  db.execSync("DELETE FROM portions WHERE product_id = 0");
  for (const pt of ptRes.portionTemplates ?? []) {
    db.runSync(
      `INSERT OR REPLACE INTO portions (id, product_id, name, price)
       VALUES (?, 0, ?, 0)`,
      [pt.id, pt.name]
    );
  }

  // ── Products + their portions ──
  db.execSync("DELETE FROM products WHERE shop_id = " + shopId);
  db.execSync("DELETE FROM portions WHERE product_id != 0");

  for (const p of prodsRes.products ?? []) {
    db.runSync(
      `INSERT OR REPLACE INTO products
         (id, shop_id, category_id, unit_id, server_id, name, description, image_url, price, is_available, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id, p.shopId, p.categoryId ?? null, null, p.id,
        p.name, p.description ?? null, p.imageUrl ?? null,
        p.price, p.isAvailable ? 1 : 0,
        p.updatedAt ? new Date(p.updatedAt).getTime() : Date.now(),
      ]
    );
    for (const pt of p.portions ?? []) {
      db.runSync(
        `INSERT OR REPLACE INTO portions (id, product_id, name, price)
         VALUES (?, ?, ?, ?)`,
        [pt.id, p.id, pt.name, pt.price]
      );
    }
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function serverCreateCategory(shopId: number, name: string, sortOrder: number = 0) {
  const data = await apiFetch("/api/categories", {
    method: "POST",
    body: JSON.stringify({ shopId, name, sortOrder }),
  });
  return data.category as { id: number; name: string; sortOrder: number };
}

export async function serverUpdateCategory(id: number, name: string, sortOrder?: number) {
  const data = await apiFetch(`/api/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, sortOrder }),
  });
  return data.category;
}

export async function serverDeleteCategory(id: number) {
  await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
}

// ─── Units ────────────────────────────────────────────────────────────────────

export async function serverCreateUnit(shopId: number, name: string, abbreviation?: string) {
  const data = await apiFetch("/api/units", {
    method: "POST",
    body: JSON.stringify({ shopId, name, abbreviation: abbreviation || null }),
  });
  return data.unit as { id: number; name: string; abbreviation?: string };
}

export async function serverUpdateUnit(id: number, name: string, abbreviation?: string) {
  const data = await apiFetch(`/api/units/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, abbreviation: abbreviation || null }),
  });
  return data.unit;
}

export async function serverDeleteUnit(id: number) {
  await apiFetch(`/api/units/${id}`, { method: "DELETE" });
}

// ─── Portion Templates ────────────────────────────────────────────────────────

export async function serverCreatePortionTemplate(shopId: number, name: string) {
  const data = await apiFetch("/api/portion-templates", {
    method: "POST",
    body: JSON.stringify({ shopId, name }),
  });
  return data.portionTemplate as { id: number; name: string };
}

export async function serverUpdatePortionTemplate(id: number, name: string) {
  const data = await apiFetch(`/api/portion-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
  return data.portionTemplate;
}

export async function serverDeletePortionTemplate(id: number) {
  await apiFetch(`/api/portion-templates/${id}`, { method: "DELETE" });
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function serverCreateProduct(data: {
  shopId: number;
  categoryId?: number | null;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  portions: { name: string; price: number }[];
}) {
  const res = await apiFetch("/api/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.product as { id: number; name: string; price: number };
}

export async function serverUpdateProduct(
  id: number,
  data: {
    categoryId?: number | null;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
    price: number;
    isAvailable?: boolean;
    portions?: { name: string; price: number }[];
  }
) {
  const res = await apiFetch(`/api/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.product;
}

export async function serverDeleteProduct(id: number) {
  await apiFetch(`/api/products/${id}`, { method: "DELETE" });
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function serverCreateOrder(order: {
  localId: string;
  shopId: number;
  userId?: number | null;
  status: string;
  tableNo?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  collectedAmount?: number | null;
  changeAmount?: number | null;
  paymentMethod?: string;
  kotPrinted?: boolean;
  receiptPrinted?: boolean;
  orderType?: string;
  items: {
    productId?: number | null;
    portionId?: number | null;
    productName: string;
    portionName?: string | null;
    qty: number;
    unitPrice: number;
  }[];
}) {
  try {
    const res = await apiFetch("/api/orders", {
      method: "POST",
      body: JSON.stringify(order),
    });
    return res.order;
  } catch (e) {
    // Orders push is best-effort — don't block the user
    console.warn("serverCreateOrder failed:", e);
    return null;
  }
}

// ─── Image Upload ──────────────────────────────────────────────────────────────

/**
 * Compress image to ≤50kb then upload to server.
 * Returns the server URL of the uploaded image.
 */
export async function uploadMenuImage(localUri: string): Promise<string> {
  const base = await getBase();
  const TARGET_SIZE = 50 * 1024; // 50kb

  // Step 1: resize to max 400x400 and compress
  let quality = 0.8;
  let result = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 400, height: 400 } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
  );

  // Step 2: iteratively reduce quality until ≤50kb
  let response = await fetch(result.uri);
  let blob = await response.blob();

  while (blob.size > TARGET_SIZE && quality > 0.1) {
    quality -= 0.1;
    result = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 400, height: 400 } }],
      { compress: Math.max(quality, 0.1), format: ImageManipulator.SaveFormat.JPEG }
    );
    response = await fetch(result.uri);
    blob = await response.blob();
  }

  // Step 3: upload to server
  const formData = new FormData();
  formData.append("image", {
    uri: result.uri,
    type: "image/jpeg",
    name: "menu_image.jpg",
  } as any);

  const uploadRes = await fetch(`${base}/api/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error((err as any)?.error ?? "Image upload failed");
  }

  const data = await uploadRes.json();
  return `${base}${data.url}`;
}

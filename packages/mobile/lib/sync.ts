import db from "./database";
import { store } from "./store";

let syncInterval: ReturnType<typeof setInterval> | null = null;

export const syncWithServer = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const [token, shop, apiUrl, lastSync] = await Promise.all([
      store.getToken(),
      store.getShop(),
      store.getApiUrl(),
      store.getLastSync(),
    ]);

    if (!token || !shop) return { success: false, error: "Not authenticated" };

    // 1. Push unsynced orders
    const unsyncedOrders = db.getAllSync(
      "SELECT * FROM orders WHERE synced = 0 AND status != 'open'"
    ) as any[];

    if (unsyncedOrders.length > 0) {
      const payload = unsyncedOrders.map((o) => {
        const items = db.getAllSync("SELECT * FROM order_items WHERE order_id = ?", [o.id]) as any[];
        return { ...o, items };
      });

      const pushRes = await fetch(`${apiUrl}/api/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shopId: shop.id, orders: payload }),
      });

      if (pushRes.ok) {
        const orderIds = unsyncedOrders.map((o) => o.id).join(",");
        db.execSync(`UPDATE orders SET synced = 1 WHERE id IN (${orderIds})`);
      }
    }

    // 2. Pull latest data
    const since = lastSync ?? new Date(0).toISOString();
    const pullRes = await fetch(
      `${apiUrl}/api/sync/pull?shop_id=${shop.id}&since=${encodeURIComponent(since)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!pullRes.ok) return { success: false, error: "Pull failed" };

    const data = await pullRes.json();

    // Upsert categories
    if (data.categories?.length > 0) {
      for (const cat of data.categories) {
        const existing = db.getFirstSync("SELECT id FROM categories WHERE server_id = ?", [cat.id]);
        if (existing) {
          db.runSync(
            "UPDATE categories SET name = ?, sort_order = ?, deleted_at = ? WHERE server_id = ?",
            [cat.name, cat.sortOrder, cat.deletedAt ? new Date(cat.deletedAt).getTime() : null, cat.id]
          );
        } else {
          db.runSync(
            "INSERT OR IGNORE INTO categories (server_id, shop_id, name, sort_order, updated_at) VALUES (?, ?, ?, ?, ?)",
            [cat.id, cat.shopId, cat.name, cat.sortOrder, Date.now()]
          );
        }
      }
    }

    // Upsert products
    if (data.products?.length > 0) {
      for (const prod of data.products) {
        const existing = db.getFirstSync("SELECT id FROM products WHERE server_id = ?", [prod.id]);
        if (existing) {
          db.runSync(
            "UPDATE products SET name = ?, price = ?, description = ?, image_url = ?, category_id = ?, is_available = ?, deleted_at = ? WHERE server_id = ?",
            [prod.name, prod.price, prod.description ?? null, prod.imageUrl ?? null, prod.categoryId, prod.isAvailable ? 1 : 0, prod.deletedAt ? new Date(prod.deletedAt).getTime() : null, prod.id]
          );
        } else {
          db.runSync(
            "INSERT OR IGNORE INTO products (server_id, shop_id, category_id, name, description, price, is_available, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [prod.id, prod.shopId, prod.categoryId, prod.name, prod.description ?? null, prod.price, prod.isAvailable ? 1 : 0, Date.now()]
          );
        }
      }
    }

    await store.setLastSync(data.serverTime ?? new Date().toISOString());
    return { success: true };
  } catch (e: any) {
    console.warn("Sync error:", e.message);
    return { success: false, error: e.message };
  }
};

export const startSyncEngine = () => {
  if (syncInterval) return;
  syncInterval = setInterval(() => {
    syncWithServer();
  }, 10000); // every 10 seconds
  // Initial sync after 2s
  setTimeout(() => syncWithServer(), 2000);
};

export const stopSyncEngine = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
};

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
        db.runSync(
          "INSERT OR REPLACE INTO categories (id, server_id, shop_id, name, sort_order, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [cat.id, cat.id, cat.shopId, cat.name, cat.sortOrder, Date.now(), cat.deletedAt ? new Date(cat.deletedAt).getTime() : null]
        );
      }
    }

    // Upsert products
    if (data.products?.length > 0) {
      for (const prod of data.products) {
        db.runSync(
          "INSERT OR REPLACE INTO products (id, server_id, shop_id, category_id, name, description, price, image_url, is_available, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [prod.id, prod.id, prod.shopId, prod.categoryId, prod.name, prod.description ?? null, prod.price, prod.imageUrl ?? null, prod.isAvailable ? 1 : 0, Date.now(), prod.deletedAt ? new Date(prod.deletedAt).getTime() : null]
        );
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

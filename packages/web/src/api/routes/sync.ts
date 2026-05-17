import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, gt, isNull } from "drizzle-orm";

export const sync = new Hono()
  // Pull: get all data updated since last sync
  .get("/pull", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    const since = c.req.query("since"); // ISO timestamp
    if (!shopId) return c.json({ error: "shop_id required" }, 400);

    const sinceDate = since ? new Date(since) : new Date(0);

    const [cats, prods, ports, ords] = await Promise.all([
      db.select().from(schema.categories).where(
        and(eq(schema.categories.shopId, shopId), gt(schema.categories.updatedAt, sinceDate))
      ),
      db.select().from(schema.products).where(
        and(eq(schema.products.shopId, shopId), gt(schema.products.updatedAt, sinceDate))
      ),
      db.select().from(schema.portions).where(gt(schema.portions.updatedAt, sinceDate)),
      db.select().from(schema.orders).where(
        and(eq(schema.orders.shopId, shopId), gt(schema.orders.updatedAt, sinceDate))
      ),
    ]);

    return c.json({
      categories: cats,
      products: prods,
      portions: ports,
      orders: ords,
      serverTime: new Date().toISOString(),
    }, 200);
  })
  // Push: receive batch of mutations from device
  .post("/push", async (c) => {
    const body = await c.req.json();
    const { shopId, orders: ordersPayload, categories: catsPayload, products: prodsPayload } = body;

    if (!shopId) return c.json({ error: "shop_id required" }, 400);

    const results: any = { inserted: { orders: 0, categories: 0, products: 0 } };

    // Upsert orders
    if (ordersPayload && ordersPayload.length > 0) {
      for (const ord of ordersPayload) {
        const { items, ...orderData } = ord;
        // Check if exists by localId
        if (ord.localId) {
          const existing = await db.select().from(schema.orders).where(eq(schema.orders.localId, ord.localId));
          if (existing.length > 0) {
            await db.update(schema.orders).set({ ...orderData, updatedAt: new Date() }).where(eq(schema.orders.localId, ord.localId));
            continue;
          }
        }
        const [inserted] = await db.insert(schema.orders).values({ ...orderData, shopId }).returning();
        if (items && items.length > 0) {
          await db.insert(schema.orderItems).values(
            items.map((item: any) => ({
              orderId: inserted.id,
              productId: item.productId,
              portionId: item.portionId,
              productName: item.productName,
              portionName: item.portionName,
              qty: item.qty,
              unitPrice: item.unitPrice,
              lineTotal: item.qty * item.unitPrice,
            }))
          );
        }
        results.inserted.orders++;
      }
    }

    // Upsert categories
    if (catsPayload && catsPayload.length > 0) {
      for (const cat of catsPayload) {
        if (cat.serverId) {
          await db.update(schema.categories).set({ name: cat.name, sortOrder: cat.sortOrder, updatedAt: new Date() })
            .where(eq(schema.categories.id, cat.serverId));
        } else {
          await db.insert(schema.categories).values({ shopId, name: cat.name, sortOrder: cat.sortOrder ?? 0 });
          results.inserted.categories++;
        }
      }
    }

    // Upsert products
    if (prodsPayload && prodsPayload.length > 0) {
      for (const prod of prodsPayload) {
        if (prod.serverId) {
          await db.update(schema.products).set({
            name: prod.name, price: prod.price, description: prod.description ?? null,
            categoryId: prod.categoryId, isAvailable: prod.isAvailable, updatedAt: new Date()
          }).where(eq(schema.products.id, prod.serverId));
        } else {
          await db.insert(schema.products).values({
            shopId, name: prod.name, price: prod.price, description: prod.description ?? null,
            categoryId: prod.categoryId, isAvailable: prod.isAvailable ?? true
          });
          results.inserted.products++;
        }
      }
    }

    return c.json({ success: true, results }, 200);
  });

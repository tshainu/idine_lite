import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export const orders = new Hono()
  .get("/", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!shopId) return c.json({ error: "shop_id required" }, 400);

    let conditions: any[] = [eq(schema.orders.shopId, shopId)];
    if (from) conditions.push(gte(schema.orders.createdAt, new Date(from)));
    if (to) conditions.push(lte(schema.orders.createdAt, new Date(to)));

    const rows = await db
      .select()
      .from(schema.orders)
      .where(and(...conditions))
      .orderBy(desc(schema.orders.createdAt))
      .limit(100);

    return c.json({ orders: rows }, 200);
  })
  .get("/:id/items", async (c) => {
    const id = parseInt(c.req.param("id"));
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));
    return c.json({ items }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const { items, ...orderData } = body;

    // Generate order number
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const count = await db.select().from(schema.orders).where(eq(schema.orders.shopId, orderData.shopId));
    const orderNo = `ORD-${dateStr}-${String(count.length + 1).padStart(4, "0")}`;

    const [order] = await db.insert(schema.orders).values({
      ...orderData,
      orderNo,
    }).returning();

    if (items && items.length > 0) {
      await db.insert(schema.orderItems).values(
        items.map((item: any) => ({
          orderId: order.id,
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

    return c.json({ order }, 201);
  })
  .put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [order] = await db
      .update(schema.orders)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    return c.json({ order }, 200);
  });

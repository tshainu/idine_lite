import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, isNull } from "drizzle-orm";

export const categories = new Hono()
  .get("/", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    if (!shopId) return c.json({ error: "shop_id required" }, 400);

    const rows = await db
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.shopId, shopId), isNull(schema.categories.deletedAt)))
      .orderBy(schema.categories.sortOrder);

    return c.json({ categories: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const [cat] = await db.insert(schema.categories).values({
      shopId: body.shopId,
      name: body.name,
      sortOrder: body.sortOrder ?? 0,
    }).returning();
    return c.json({ category: cat }, 201);
  })
  .put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [cat] = await db
      .update(schema.categories)
      .set({ name: body.name, sortOrder: body.sortOrder, updatedAt: new Date() })
      .where(eq(schema.categories.id, id))
      .returning();
    return c.json({ category: cat }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.update(schema.categories).set({ deletedAt: new Date() }).where(eq(schema.categories.id, id));
    return c.json({ success: true }, 200);
  });

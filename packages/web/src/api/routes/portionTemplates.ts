import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, isNull } from "drizzle-orm";

export const portionTemplates = new Hono()
  .get("/", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    if (!shopId) return c.json({ error: "shop_id required" }, 400);
    const rows = await db
      .select()
      .from(schema.portionTemplates)
      .where(and(eq(schema.portionTemplates.shopId, shopId), isNull(schema.portionTemplates.deletedAt)));
    return c.json({ portionTemplates: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const [pt] = await db.insert(schema.portionTemplates).values({
      shopId: body.shopId,
      name: body.name,
    }).returning();
    return c.json({ portionTemplate: pt }, 201);
  })
  .put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [pt] = await db.update(schema.portionTemplates)
      .set({ name: body.name, updatedAt: new Date() })
      .where(eq(schema.portionTemplates.id, id))
      .returning();
    return c.json({ portionTemplate: pt }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.update(schema.portionTemplates).set({ deletedAt: new Date() }).where(eq(schema.portionTemplates.id, id));
    return c.json({ success: true }, 200);
  });

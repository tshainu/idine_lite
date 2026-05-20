import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, isNull } from "drizzle-orm";

export const units = new Hono()
  .get("/", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    if (!shopId) return c.json({ error: "shop_id required" }, 400);
    const rows = await db
      .select()
      .from(schema.units)
      .where(and(eq(schema.units.shopId, shopId), isNull(schema.units.deletedAt)));
    return c.json({ units: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const [unit] = await db.insert(schema.units).values({
      shopId: body.shopId,
      name: body.name,
      abbreviation: body.abbreviation ?? null,
    }).returning();
    return c.json({ unit }, 201);
  })
  .put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [unit] = await db.update(schema.units)
      .set({ name: body.name, abbreviation: body.abbreviation ?? null, updatedAt: new Date() })
      .where(eq(schema.units.id, id))
      .returning();
    return c.json({ unit }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.update(schema.units).set({ deletedAt: new Date() }).where(eq(schema.units.id, id));
    return c.json({ success: true }, 200);
  });

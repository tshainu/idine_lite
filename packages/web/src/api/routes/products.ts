import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, isNull } from "drizzle-orm";

export const products = new Hono()
  .get("/", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    if (!shopId) return c.json({ error: "shop_id required" }, 400);

    const rows = await db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.shopId, shopId), isNull(schema.products.deletedAt)));

    // Also get portions for each product
    const productIds = rows.map((p) => p.id);
    let portionMap: Record<number, typeof schema.portions.$inferSelect[]> = {};

    if (productIds.length > 0) {
      const allPortions = await db
        .select()
        .from(schema.portions)
        .where(isNull(schema.portions.deletedAt));
      allPortions.forEach((p) => {
        if (!portionMap[p.productId]) portionMap[p.productId] = [];
        portionMap[p.productId].push(p);
      });
    }

    const result = rows.map((p) => ({ ...p, portions: portionMap[p.id] ?? [] }));
    return c.json({ products: result }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const [product] = await db.insert(schema.products).values({
      shopId: body.shopId,
      categoryId: body.categoryId,
      name: body.name,
      price: body.price,
      imageUrl: body.imageUrl,
      isAvailable: body.isAvailable ?? true,
    }).returning();

    // Insert portions if provided
    if (body.portions && body.portions.length > 0) {
      await db.insert(schema.portions).values(
        body.portions.map((p: any) => ({ productId: product.id, name: p.name, price: p.price }))
      );
    }

    return c.json({ product }, 201);
  })
  .put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [product] = await db
      .update(schema.products)
      .set({
        categoryId: body.categoryId ?? null,
        name: body.name,
        description: body.description ?? null,
        price: body.price,
        imageUrl: body.imageUrl ?? null,
        isAvailable: body.isAvailable,
        updatedAt: new Date(),
      })
      .where(eq(schema.products.id, id))
      .returning();

    // Replace portions if provided
    if (body.portions && Array.isArray(body.portions)) {
      await db.update(schema.portions).set({ deletedAt: new Date() }).where(eq(schema.portions.productId, id));
      if (body.portions.length > 0) {
        await db.insert(schema.portions).values(
          body.portions.map((p: any) => ({ productId: id, name: p.name, price: p.price }))
        );
      }
    }

    return c.json({ product }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.update(schema.products).set({ deletedAt: new Date() }).where(eq(schema.products.id, id));
    return c.json({ success: true }, 200);
  });

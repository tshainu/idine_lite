import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const users = new Hono()
  .get("/", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    if (!shopId) return c.json({ error: "shop_id required" }, 400);
    const rows = await db.select({
      id: schema.users.id,
      shopId: schema.users.shopId,
      username: schema.users.username,
      role: schema.users.role,
      isActive: schema.users.isActive,
      createdAt: schema.users.createdAt,
    }).from(schema.users).where(eq(schema.users.shopId, shopId));
    return c.json({ users: rows }, 200);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const hash = await bcrypt.hash(body.password, 10);
    const [user] = await db.insert(schema.users).values({
      shopId: body.shopId,
      username: body.username,
      passwordHash: hash,
      role: body.role ?? "cashier",
    }).returning();
    return c.json({ user: { id: user.id, username: user.username, role: user.role } }, 201);
  })
  .put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const update: any = { role: body.role, isActive: body.isActive, updatedAt: new Date() };
    if (body.password) update.passwordHash = await bcrypt.hash(body.password, 10);
    const [user] = await db.update(schema.users).set(update).where(eq(schema.users.id, id)).returning();
    return c.json({ user }, 200);
  })
  .delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, id));
    return c.json({ success: true }, 200);
  });

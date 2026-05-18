import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const auth = new Hono()
  // Login
  .post("/login", async (c) => {
    const body = await c.req.json();
    const { shopCode, username, password } = body;

    if (!shopCode || !username || !password) {
      return c.json({ error: "shopCode, username and password are required" }, 400);
    }

    const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.code, shopCode.toUpperCase().trim()));
    if (!shop) return c.json({ error: "Invalid shop code" }, 401);
    if (!shop.isActive) return c.json({ error: "This shop has been suspended. Please contact support." }, 403);

    const [user] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.shopId, shop.id), eq(schema.users.username, username)));

    if (!user || !user.isActive) return c.json({ error: "Invalid credentials" }, 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return c.json({ error: "Invalid credentials" }, 401);

    // Update shop last login timestamp
    await db.update(schema.shops).set({ lastLoginAt: new Date() }).where(eq(schema.shops.id, shop.id));

    // Simple token: base64(shopId:userId:timestamp)
    const token = Buffer.from(`${shop.id}:${user.id}:${Date.now()}`).toString("base64");

    return c.json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
      shop: { id: shop.id, name: shop.name, code: shop.code },
    }, 200);
  })
  // Register shop (setup)
  .post("/setup", async (c) => {
    const body = await c.req.json();
    const { shopName, shopCode, adminUsername, adminPassword } = body;

    if (!shopName || !shopCode || !adminUsername || !adminPassword) {
      return c.json({ error: "All fields required" }, 400);
    }

    const existing = await db.select().from(schema.shops).where(eq(schema.shops.code, shopCode));
    if (existing.length > 0) return c.json({ error: "Shop code already exists" }, 409);

    const [shop] = await db.insert(schema.shops).values({ name: shopName, code: shopCode }).returning();
    const hash = await bcrypt.hash(adminPassword, 10);
    const [user] = await db.insert(schema.users).values({
      shopId: shop.id,
      username: adminUsername,
      passwordHash: hash,
      role: "admin",
    }).returning();

    return c.json({ shop, user: { id: user.id, username: user.username, role: user.role } }, 201);
  });

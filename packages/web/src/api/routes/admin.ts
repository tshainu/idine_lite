import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, sql, and, gte, lte, desc, isNull, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";

// ── Super-admin token store (in-memory, simple) ──────────────────────────────
const activeSessions = new Set<string>();

function makeToken(): string {
  return Buffer.from(`superadmin:${Date.now()}:${Math.random()}`).toString("base64url");
}

// ── Middleware ────────────────────────────────────────────────────────────────
async function requireAdmin(c: any, next: any) {
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token || !activeSessions.has(token)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
}

// ── Router ────────────────────────────────────────────────────────────────────
export const admin = new Hono()

  // ── Auth ──────────────────────────────────────────────────────────────────
  .post("/login", async (c) => {
    const { password } = await c.req.json();
    const expected = process.env.SUPER_ADMIN_PASSWORD ?? "Asdasd@123";
    if (!password || password !== expected) {
      return c.json({ error: "Invalid password" }, 401);
    }
    const token = makeToken();
    activeSessions.add(token);
    return c.json({ token }, 200);
  })

  .post("/logout", requireAdmin, async (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "").trim() ?? "";
    activeSessions.delete(token);
    return c.json({ success: true }, 200);
  })

  // ── Dashboard ─────────────────────────────────────────────────────────────
  .get("/dashboard", requireAdmin, async (c) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    // All shops
    const allShops = await db.select().from(schema.shops);

    const totalShops = allShops.length;
    const activeShops = allShops.filter(s => s.isActive).length;
    const suspendedShops = allShops.filter(s => !s.isActive).length;
    const inactiveShops = allShops.filter(s => {
      if (!s.isActive) return false;
      if (!s.lastLoginAt) return true; // never logged in
      return s.lastLoginAt < sevenDaysAgo;
    }).length;

    // Top 10 shops by total orders (all time)
    const topShopsRaw = await db
      .select({
        shopId: schema.orders.shopId,
        totalOrders: sql<number>`count(*)`,
        totalRevenue: sql<number>`coalesce(sum(${schema.orders.total}),0)`,
      })
      .from(schema.orders)
      .groupBy(schema.orders.shopId)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const topShops = topShopsRaw.map(row => {
      const shop = allShops.find(s => s.id === row.shopId);
      return {
        shopId: row.shopId,
        shopName: shop?.name ?? "Unknown",
        shopCode: shop?.code ?? "",
        totalOrders: row.totalOrders,
        totalRevenue: row.totalRevenue,
        lastLoginAt: shop?.lastLoginAt ?? null,
        isActive: shop?.isActive ?? false,
      };
    });

    // New shops chart — grouped by month for year view, by day for custom
    // Query params: range = "this_month" | "last_month" | "this_year" | "custom"
    // For custom: from & to query params (ISO date strings)
    const range = c.req.query("range") ?? "this_month";
    let chartFrom: Date, chartTo: Date, groupBy: "day" | "month";

    if (range === "last_month") {
      chartFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      chartTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      groupBy = "day";
    } else if (range === "this_year") {
      chartFrom = new Date(now.getFullYear(), 0, 1);
      chartTo = now;
      groupBy = "month";
    } else if (range === "custom") {
      const fromStr = c.req.query("from");
      const toStr = c.req.query("to");
      chartFrom = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1);
      chartTo = toStr ? new Date(toStr + "T23:59:59") : now;
      groupBy = "day";
    } else {
      // this_month (default)
      chartFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      chartTo = now;
      groupBy = "day";
    }

    const dateExpr = groupBy === "month"
      ? sql<string>`strftime('%Y-%m', ${schema.shops.createdAt} / 1000, 'unixepoch')`
      : sql<string>`date(${schema.shops.createdAt} / 1000, 'unixepoch')`;

    const newShopsChart = await db
      .select({
        period: dateExpr,
        count: sql<number>`count(*)`,
      })
      .from(schema.shops)
      .where(sql`${schema.shops.createdAt} >= ${chartFrom.getTime()} AND ${schema.shops.createdAt} <= ${chartTo.getTime()}`)
      .groupBy(dateExpr)
      .orderBy(dateExpr);

    return c.json({
      totalShops,
      activeShops,
      suspendedShops,
      inactiveShops,
      topShops,
      newShopsChart,
    }, 200);
  })

  // ── Shops ─────────────────────────────────────────────────────────────────
  .get("/shops", requireAdmin, async (c) => {
    const shops = await db.select().from(schema.shops).orderBy(desc(schema.shops.createdAt));
    return c.json({ shops }, 200);
  })

  .post("/shops", requireAdmin, async (c) => {
    const { name, code, address, phone, ownerName, ownerMobile, businessType, remarks, adminUsername, receiptHeaderImage } = await c.req.json();
    if (!name || !code) return c.json({ error: "name and code required" }, 400);

    const existing = await db.select().from(schema.shops).where(eq(schema.shops.code, code));
    if (existing.length > 0) return c.json({ error: "Shop code already exists" }, 409);

    const [shop] = await db.insert(schema.shops).values({ name, code, address, phone, ownerName, ownerMobile, businessType, remarks, receiptHeaderImage: receiptHeaderImage ?? null }).returning();

    // Generate password: first 5 chars of a random flower name + 3 random digits
    const flowers = ["jasmine","rose","lily","tulip","daisy","lotus","iris","poppy","orchid","violet","peony","aster"];
    const flower = flowers[Math.floor(Math.random() * flowers.length)];
    const generatedPassword = flower.slice(0, 5) + String(Math.floor(100 + Math.random() * 900));

    const username = adminUsername || "admin";
    const hash = await bcrypt.hash(generatedPassword, 10);
    await db.insert(schema.users).values({
      shopId: shop.id,
      username,
      passwordHash: hash,
      plainPassword: generatedPassword,
      role: "admin",
      mustChangePassword: true,
    });

    return c.json({ shop, credentials: { username, password: generatedPassword } }, 201);
  })

  .get("/shops/:id", requireAdmin, async (c) => {
    const id = parseInt(c.req.param("id"));
    const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, id));
    if (!shop) return c.json({ error: "Not found" }, 404);

    const users = await db.select({
      id: schema.users.id,
      username: schema.users.username,
      plainPassword: schema.users.plainPassword,
      role: schema.users.role,
      isActive: schema.users.isActive,
      createdAt: schema.users.createdAt,
    }).from(schema.users).where(eq(schema.users.shopId, id));

    // Stats for this shop
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);

    const getStats = async (from: Date) => {
      const [row] = await db
        .select({
          revenue: sql<number>`coalesce(sum(${schema.orders.total}),0)`,
          orders: sql<number>`count(*)`,
        })
        .from(schema.orders)
        .where(and(eq(schema.orders.shopId, id), gte(schema.orders.createdAt, from)));
      return { revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 };
    };

    const [today, thisWeek, thisMonth] = await Promise.all([
      getStats(todayStart),
      getStats(weekStart),
      getStats(monthStart),
    ]);

    // 7-day chart
    const dailyRows = await db
      .select({
        date: sql<string>`date(${schema.orders.createdAt} / 1000, 'unixepoch')`,
        total: sql<number>`coalesce(sum(${schema.orders.total}),0)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.orders)
      .where(and(eq(schema.orders.shopId, id), gte(schema.orders.createdAt, weekStart)))
      .groupBy(sql`date(${schema.orders.createdAt} / 1000, 'unixepoch')`)
      .orderBy(sql`date(${schema.orders.createdAt} / 1000, 'unixepoch')`);

    return c.json({ shop, users, stats: { today, thisWeek, thisMonth }, dailyChart: dailyRows }, 200);
  })

  .put("/shops/:id", requireAdmin, async (c) => {
    const id = parseInt(c.req.param("id"));
    const { name, code, address, phone, ownerName, ownerMobile, businessType, remarks } = await c.req.json();
    if (!name || !code) return c.json({ error: "name and code required" }, 400);

    const existing = await db.select().from(schema.shops).where(eq(schema.shops.code, code));
    if (existing.length > 0 && existing[0].id !== id) {
      return c.json({ error: "Shop code already taken" }, 409);
    }

    const [shop] = await db
      .update(schema.shops)
      .set({ name, code, address, phone, ownerName, ownerMobile, businessType, remarks, updatedAt: new Date() })
      .where(eq(schema.shops.id, id))
      .returning();
    return c.json({ shop }, 200);
  })

  // ── Upload receipt header image ──
  .patch("/shops/:id/receipt-header", requireAdmin, async (c) => {
    const id = parseInt(c.req.param("id"));
    const { image } = await c.req.json(); // base64 data URL or null to clear
    const [shop] = await db
      .update(schema.shops)
      .set({ receiptHeaderImage: image ?? null, updatedAt: new Date() })
      .where(eq(schema.shops.id, id))
      .returning();
    return c.json({ shop }, 200);
  })

  .delete("/shops/:id", requireAdmin, async (c) => {
    const id = parseInt(c.req.param("id"));
    const [shop] = await db.select().from(schema.shops).where(eq(schema.shops.id, id));
    if (!shop) return c.json({ error: "Not found" }, 404);
    await db.delete(schema.shops).where(eq(schema.shops.id, id));
    return c.json({ success: true }, 200);
  })

  .patch("/shops/:id/suspend", requireAdmin, async (c) => {
    const id = parseInt(c.req.param("id"));
    const { suspend, reason } = await c.req.json();
    const [shop] = await db
      .update(schema.shops)
      .set({ isActive: !suspend, suspendReason: suspend ? (reason ?? null) : null, updatedAt: new Date() })
      .where(eq(schema.shops.id, id))
      .returning();
    return c.json({ shop }, 200);
  })

  // ── Users (per shop) ──────────────────────────────────────────────────────
  .post("/shops/:shopId/users", requireAdmin, async (c) => {
    const shopId = parseInt(c.req.param("shopId"));
    const { username, password, role } = await c.req.json();
    if (!username || !password) return c.json({ error: "username and password required" }, 400);
    const hash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(schema.users).values({
      shopId, username, passwordHash: hash, plainPassword: password, role: role ?? "cashier",
    }).returning();
    return c.json({ user: { id: user.id, username: user.username, role: user.role } }, 201);
  })

  .put("/shops/:shopId/users/:id", requireAdmin, async (c) => {
    const id = parseInt(c.req.param("id"));
    const { role, isActive, password } = await c.req.json();
    const update: any = { updatedAt: new Date() };
    if (role !== undefined) update.role = role;
    if (isActive !== undefined) update.isActive = isActive;
    if (password) { update.passwordHash = await bcrypt.hash(password, 10); update.plainPassword = password; }
    const [user] = await db.update(schema.users).set(update).where(eq(schema.users.id, id)).returning();
    return c.json({ user }, 200);
  })

  .delete("/shops/:shopId/users/:id", requireAdmin, async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, id));
    return c.json({ success: true }, 200);
  });

import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export const reports = new Hono()
  .get("/summary", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    if (!shopId) return c.json({ error: "shop_id required" }, 400);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const getTotal = async (from: Date, to: Date) => {
      const rows = await db
        .select({ total: sql<number>`sum(${schema.orders.total})`, count: sql<number>`count(*)` })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.shopId, shopId),
            gte(schema.orders.createdAt, from),
            lte(schema.orders.createdAt, to)
          )
        );
      return { total: rows[0]?.total ?? 0, count: rows[0]?.count ?? 0 };
    };

    const [today, yesterday, thisWeek, thisMonth] = await Promise.all([
      getTotal(todayStart, now),
      getTotal(yesterdayStart, todayStart),
      getTotal(weekStart, now),
      getTotal(monthStart, now),
    ]);

    // Daily breakdown for chart (last 7 days)
    const dailyRows = await db
      .select({
        date: sql<string>`date(${schema.orders.createdAt} / 1000, 'unixepoch')`,
        total: sql<number>`sum(${schema.orders.total})`,
        count: sql<number>`count(*)`,
      })
      .from(schema.orders)
      .where(and(eq(schema.orders.shopId, shopId), gte(schema.orders.createdAt, weekStart)))
      .groupBy(sql`date(${schema.orders.createdAt} / 1000, 'unixepoch')`)
      .orderBy(sql`date(${schema.orders.createdAt} / 1000, 'unixepoch')`);

    return c.json({ today, yesterday, thisWeek, thisMonth, dailyChart: dailyRows }, 200);
  })
  .get("/orders", async (c) => {
    const shopId = parseInt(c.req.query("shop_id") ?? "0");
    const period = c.req.query("period") ?? "today";
    if (!shopId) return c.json({ error: "shop_id required" }, 400);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const from = period === "today" ? todayStart : period === "week" ? weekStart : monthStart;

    const rows = await db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.shopId, shopId), gte(schema.orders.createdAt, from)))
      .orderBy(schema.orders.createdAt);

    return c.json({ orders: rows }, 200);
  });

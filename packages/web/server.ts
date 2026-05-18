import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./src/api/routes/auth";
import { categories } from "./src/api/routes/categories";
import { products } from "./src/api/routes/products";
import { orders } from "./src/api/routes/orders";
import { reports } from "./src/api/routes/reports";
import { sync } from "./src/api/routes/sync";
import { users } from "./src/api/routes/users";
import { print } from "./src/api/routes/print";
import { admin } from "./src/api/routes/admin";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./src/api/database";
import path from "path";
import { existsSync, readFileSync } from "fs";

const distDir = path.join(import.meta.dir, "dist");

// Run migrations on startup
async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder: path.join(import.meta.dir, "drizzle") });
    console.log("✓ Migrations applied");
  } catch (e: any) {
    // Tables already exist on re-deploy — that's fine
    console.warn("Migration warning (likely already applied):", e?.message ?? e);
  }
}

const app = new Hono()
  .use(cors({ origin: "*" }))
  .route("/api/auth", auth)
  .route("/api/categories", categories)
  .route("/api/products", products)
  .route("/api/orders", orders)
  .route("/api/reports", reports)
  .route("/api/sync", sync)
  .route("/api/users", users)
  .route("/api/print", print)
  .route("/api/admin", admin)
  .get("/api/health", (c) => c.json({ status: "ok", service: "iDine Lite API" }));

// Serve static files from dist/ — Bun native file serving
app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  let filePath = path.join(distDir, url.pathname);

  // Try exact file first
  if (existsSync(filePath) && !filePath.endsWith("/")) {
    const file = Bun.file(filePath);
    const contentType = getContentType(filePath);
    return new Response(file, {
      headers: { "Content-Type": contentType },
    });
  }

  // SPA fallback — serve index.html
  const indexPath = path.join(distDir, "index.html");
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: { "Content-Type": "text/html" },
    });
  }

  return c.text("Not found", 404);
});

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".webp": "image/webp",
  };
  return types[ext] ?? "application/octet-stream";
}

const port = parseInt(process.env.PORT ?? "3000");

runMigrations().then(() => {
  console.log(`✓ iDine Lite running on port ${port}`);
  Bun.serve({
    port,
    fetch: app.fetch,
  });
});

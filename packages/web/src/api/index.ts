import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth";
import { categories } from "./routes/categories";
import { products } from "./routes/products";
import { orders } from "./routes/orders";
import { reports } from "./routes/reports";
import { sync } from "./routes/sync";
import { users } from "./routes/users";
import { print } from "./routes/print";
import { admin } from "./routes/admin";
import { units } from "./routes/units";
import { portionTemplates } from "./routes/portionTemplates";

const app = new Hono()
  .basePath("api")
  .use(cors({ origin: "*" }))
  .get("/health", (c) => c.json({ status: "ok", service: "iDine Lite API" }, 200))
  .route("/auth", auth)
  .route("/categories", categories)
  .route("/products", products)
  .route("/orders", orders)
  .route("/reports", reports)
  .route("/sync", sync)
  .route("/users", users)
  .route("/print", print)
  .route("/admin", admin)
  .route("/units", units)
  .route("/portion-templates", portionTemplates);

export type AppType = typeof app;
export default app;

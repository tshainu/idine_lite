import { Hono } from "hono";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

export const upload = new Hono();

const UPLOADS_DIR = path.join(import.meta.dir, "../../../uploads");

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// POST /api/upload/image
upload.post("/image", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return c.json({ error: "No image provided" }, 400);
    }

    // Validate type
    if (!file.type.startsWith("image/")) {
      return c.json({ error: "File must be an image" }, 400);
    }

    // Validate size — 200kb max (mobile already compresses to 50kb, but be safe)
    if (file.size > 200 * 1024) {
      return c.json({ error: "Image too large (max 200kb)" }, 400);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename
    const ext = file.type === "image/png" ? ".png" : ".jpg";
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    writeFileSync(filePath, buffer);

    const url = `/uploads/${filename}`;
    return c.json({ url });
  } catch (e: any) {
    console.error("Upload error:", e);
    return c.json({ error: "Upload failed" }, 500);
  }
});

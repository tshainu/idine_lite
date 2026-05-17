import { Hono } from "hono";
import * as net from "net";

export const print = new Hono()
  // POST /api/print/wifi  { ip, port, data (base64 ESC/POS) }
  .post("/wifi", async (c) => {
    try {
      const { ip, port, data } = await c.req.json<{ ip: string; port?: number; data: string }>();
      if (!ip || !data) return c.json({ error: "ip and data required" }, 400);

      const tcpPort = port ?? 9100;
      const buf = Buffer.from(data, "base64");

      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error("Connection timed out"));
        }, 8000);

        socket.connect(tcpPort, ip, () => {
          socket.write(buf, (err) => {
            clearTimeout(timeout);
            socket.destroy();
            if (err) reject(err);
            else resolve();
          });
        });

        socket.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ error: e?.message ?? "Print failed" }, 500);
    }
  });

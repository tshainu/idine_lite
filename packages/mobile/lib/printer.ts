import { Platform } from "react-native";

export type PaperSize = "58" | "80";

// Characters per line: 58mm → 32, 80mm → 48
export function getLineWidth(paper: PaperSize): number {
  if (paper === "80") return 48;
  return 32;
}

const FOOTER = "iDine Lite | Product of AxisXNOR";

// ── Format a left+right padded line ──────────────────────────────
function lr(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(gap) + right + "\n";
}

function divider(width: number): string {
  return "-".repeat(width) + "\n";
}

// ── Build receipt ESC/POS ─────────────────────────────────────────
export function buildReceiptEsc(
  paper: PaperSize,
  data: {
    shopName: string;
    shopAddress?: string;
    shopPhone?: string;
    billNo: number;
    date: string;
    time: string;
    cashier: string;
    orderType?: "dine-in" | "takeaway";
    items: { name: string; portionName?: string; qty: number; price?: number; amt: number }[];
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    balance: number;
    receiptFooter?: string;
  }
): string {
  const W = getLineWidth(paper);
  const fmt = (n: number) => n.toLocaleString("en-LK");
  const div = divider(W);
  const is80 = paper === "80";

  let esc =
    "\x1B\x40" +          // init printer
    "\x1B\x61\x01";       // center

  // ── Shop name & contact ──
  // Shop name — always double width + double height
  esc +=
    "\x1B\x21\x30" +    // double width + double height
    `${data.shopName}\n` +
    "\x1B\x21\x00";
  if (data.shopAddress) esc += `${data.shopAddress}\n`;
  if (data.shopPhone)   esc += `${data.shopPhone}\n`;

  esc += div;

  // ── ORDER # + order type — single line, double height (18pt) ──
  const orderTypeLabel = data.orderType === "takeaway" ? "Take Away" : "Dine In";
  esc +=
    "\x1B\x21\x10" +    // double height only (~18pt)
    `ORDER # ${String(data.billNo).padStart(3, "0")}  (${orderTypeLabel})\n` +
    "\x1B\x21\x00";

  esc += div;

  // ── Bill info ──
  esc +=
    "\x1B\x61\x00" +      // left align
    `Bill No: ${String(data.billNo).padStart(3, "0")}` +
    " ".repeat(Math.max(1, W - `Bill No: ${String(data.billNo).padStart(3, "0")}`.length - `${data.date}  ${data.time}`.length)) +
    `${data.date}  ${data.time}\n` +
    div;

  // ── Items table header ──
  esc +=
    lr("#  ITEM", is80 ? "QTY  PRICE    AMT" : "QTY    AMT", W) +
    div;

  // ── Items ──
  data.items.forEach((it, i) => {
    const idx = `${i + 1}`;
    if (is80) {
      const ptn80 = it.portionName ? ` (${it.portionName.slice(0, 3)})` : "";
      const nameCol = `${idx}  ${it.name}${ptn80}`;
      const priceStr = it.price != null ? `Rs.${fmt(it.price)}` : "";
      esc += lr(nameCol, `${it.qty}  ${priceStr}  Rs.${fmt(it.amt)}`, W);
    } else {
      // 58mm: truncate name, portion first 3 chars in (), no Rs. on amt
      const ptnTag = it.portionName
        ? ` (${it.portionName.slice(0, 3)})`
        : "";
      const rightCol = `${it.qty}  ${fmt(it.amt)}`;
      const maxNameLen = W - rightCol.length - `${idx}  `.length - 2;
      let name = it.name;
      if ((name + ptnTag).length > maxNameLen) {
        name = name.slice(0, Math.max(1, maxNameLen - ptnTag.length - 3)) + "...";
      }
      esc += lr(`${idx}  ${name}${ptnTag}`, rightCol, W);
    }
  });

  esc += div;

  // ── Totals ──
  esc += lr("Sub Total", `Rs.${fmt(data.subtotal)}`, W);
  if (data.discount > 0) esc += lr("Discount", `- Rs.${fmt(data.discount)}`, W);

  // Net Pay — double height (~18pt)
  esc +=
    "\x1B\x21\x10" +
    lr("Net Pay", `Rs.${fmt(data.total)}`, W) +
    "\x1B\x21\x00";

  esc += div;
  esc += lr("Payment Method", "Cash", W);
  esc += lr("Total Paid", `Rs.${fmt(data.paid)}`, W);
  esc += lr("Balance", `Rs.${fmt(data.balance)}`, W);
  esc += div;

  // ── Footer ──
  const footerMsg = data.receiptFooter?.trim() || "Thank you! Come again";
  const feedLines = is80 ? "\n\n\n\n\n\n\n" : "\n\n\n\n";
  esc +=
    "\x1B\x61\x01" +      // center
    `${footerMsg}\n` +
    (is80 ? div : "") +
    `${FOOTER}\n` +
    feedLines +
    "\x1D\x56\x00";       // cut

  return esc;
}

// ── Build Test Page ESC/POS ───────────────────────────────────────
export function buildTestEsc(paper: PaperSize): string {
  const W = getLineWidth(paper);
  const div = divider(W);
  const feedLines = paper === "58" ? "\n\n\n\n" : "\n\n\n\n\n\n\n";

  let esc =
    "\x1B\x40" +              // init
    "\x1B\x61\x01" +          // center
    "\x1B\x21\x30" +          // double width + double height
    "iDine Lite\n" +
    "\x1B\x21\x00" +          // normal
    "by AxisXNOR\n" +
    div +
    "\x1B\x61\x00" +          // left
    `Paper: ${paper}mm  Width: ${W} chars\n` +
    `Printer connection OK\n` +
    div +
    "\x1B\x61\x01" +          // center
    "TEST PRINT\n" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ\n" +
    "0123456789\n" +
    "!@#$%&*()+-=\n" +
    div +
    "iDine Lite by AxisXNOR\n" +
    feedLines +
    "\x1D\x56\x00";           // cut

  return esc;
}

// ── Build KOT ESC/POS ─────────────────────────────────────────────
export function buildKotEsc(
  paper: PaperSize,
  data: {
    shopName: string;
    orderNo: string;
    cashier: string;
    dateTime: string;
    orderType?: "dine-in" | "takeaway";
    items: { name: string; portionName?: string; qty: number }[];
  }
): string {
  const W = getLineWidth(paper);
  const div = divider(W);
  const is80 = paper === "80";

  let esc =
    "\x1B\x40" +              // init
    "\x1B\x61\x01" +          // center
    "\x1B\x21\x00" +          // normal
    `${data.shopName}\n`;

  // KOT + ORDER# — double width+height always
  esc +=
    "\x1B\x21\x30" +          // double width + double height
    "KOT\n" +
    `ORDER # ${data.orderNo}\n` +
    "\x1B\x21\x00";           // normal

  // Order type label
  const orderTypeLabel = data.orderType === "takeaway" ? "TAKE AWAY" : "DINE IN";
  esc +=
    "\x1B\x21\x10" +          // double height
    `${orderTypeLabel}\n` +
    "\x1B\x21\x00" +          // normal
    "\x1B\x61\x00";           // left

  // "Order BY: Admin   17.05.2026 18:30"
  const byLabel = `Order BY: ${data.cashier}`;
  esc += lr(byLabel, data.dateTime, W);
  esc += div;

  // Items
  data.items.forEach(item => {
    const name = item.portionName
      ? `${item.name}(${item.portionName})`
      : item.name;
    esc += lr(name, `x ${item.qty}`, W);
  });

  // Footer
  const kotFeed = paper === "80" ? "\n\n\n\n\n\n\n" : "\n\n\n";
  esc +=
    div +
    kotFeed +
    "\x1D\x56\x00";           // cut

  return esc;
}

// ── WiFi print via direct TCP socket ──────────────────────────────
export async function printWifi(ip: string, port: number, escposData: string): Promise<void> {
  if (Platform.OS === "web") throw new Error("WiFi printing not available on web.");

  const TcpSocket = require("react-native-tcp-socket");

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (err?: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err); else resolve();
    };

    const client = TcpSocket.createConnection({ host: ip, port }, () => {
      client.write(escposData, "binary", (err: any) => {
        client.destroy();
        done(err);
      });
    });
    client.on("error", (err: any) => { client.destroy(); done(err); });
    client.on("close", () => done());

    const timer = setTimeout(() => {
      client.destroy();
      done(new Error("Connection timed out after 8s"));
    }, 8000);
  });
}

// ── BT print ──────────────────────────────────────────────────────
export async function printBluetooth(address: string, escposData: string): Promise<void> {
  if (Platform.OS === "web") throw new Error("Bluetooth printing not available on web.");

  const RNBt = require("react-native-bluetooth-classic").default;
  if (!RNBt || typeof RNBt.connectToDevice !== "function") {
    throw new Error("Bluetooth not available. Use a built APK.");
  }

  // Disconnect first if already connected (avoids "already connected" errors)
  try {
    const alreadyConnected = await RNBt.isDeviceConnected(address);
    if (alreadyConnected) await RNBt.disconnectFromDevice(address);
  } catch { /* ignore */ }

  const dev = await RNBt.connectToDevice(address);
  try {
    await dev.write(escposData, "binary");
    await new Promise(r => setTimeout(r, 500));
  } finally {
    try { await dev.disconnect(); } catch { /* ignore */ }
  }
}

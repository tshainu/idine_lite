import { Platform } from "react-native";

export type PaperSize = "58" | "80";

// Characters per line: 58mm → 32 chars, 80mm → 48 chars
export function getLineWidth(paper: PaperSize): number {
  return paper === "80" ? 48 : 32;
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
//
// Font size mapping (ESC ! byte):
//   0x00 = normal   (~12pt)
//   0x10 = 2x height (~18pt tall)
//   0x20 = 2x width  (~18pt wide)
//   0x30 = 2x width + 2x height (~24pt)
//
// 80mm WiFi:  shop name = 0x30 (24pt), address/phone = 0x10 (18pt), center
// 58mm BT:    shop name = 0x10 (18pt), address/phone = 0x10 (18pt), center
//
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
    items: { name: string; qty: number; amt: number }[];
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

  let esc =
    "\x1B\x40" +          // init printer
    "\x1B\x61\x01";       // center align

  if (paper === "80") {
    // ── 80mm: shop name 24pt (double width+height), address/phone 18pt (double height)
    esc +=
      "\x1B\x21\x30" +    // 24pt: double width + double height
      `${data.shopName}\n` +
      "\x1B\x21\x10";     // 18pt: double height only
    if (data.shopAddress) esc += `${data.shopAddress}\n`;
    if (data.shopPhone)   esc += `${data.shopPhone}\n`;
    esc += "\x1B\x21\x00"; // back to normal
  } else {
    // ── 58mm: shop name 18pt (double height), address/phone 18pt (double height)
    esc +=
      "\x1B\x21\x10" +    // 18pt: double height
      `${data.shopName}\n`;
    if (data.shopAddress) esc += `${data.shopAddress}\n`;
    if (data.shopPhone)   esc += `${data.shopPhone}\n`;
    esc += "\x1B\x21\x00"; // back to normal
  }

  esc += div;

  // Bill number — big font on 80mm, 18pt on 58mm
  if (paper === "80") {
    esc +=
      "\x1B\x61\x01" +      // center
      "\x1B\x21\x30" +      // 24pt: double width + double height
      `BILL # ${String(data.billNo).padStart(3, "0")}\n` +
      "\x1B\x21\x00";       // normal
  } else {
    esc +=
      "\x1B\x61\x01" +      // center
      "\x1B\x21\x10" +      // 18pt: double height only (safe for 58mm)
      `BILL # ${String(data.billNo).padStart(3, "0")}\n` +
      "\x1B\x21\x00";       // normal
  }

  // Bill info — left aligned, normal size
  esc +=
    "\x1B\x61\x00" +      // left align
    `${data.date} ${data.time}\n` +
    `Cashier: ${data.cashier}\n` +
    div;

  // Items
  data.items.forEach(it => {
    esc += lr(`${it.name} x${it.qty}`, `Rs.${fmt(it.amt)}`, W);
  });

  esc += div;
  esc += lr("Sub Total", `Rs.${fmt(data.subtotal)}`, W);
  if (data.discount > 0) esc += lr("Discount", `-Rs.${fmt(data.discount)}`, W);

  // NET PAY — double height on 58mm, double width+height on 80mm
  if (paper === "80") {
    esc +=
      "\x1B\x21\x10" +    // 18pt: double height only
      lr("NET PAY", `Rs.${fmt(data.total)}`, W) +
      "\x1B\x21\x00";
  } else {
    esc +=
      "\x1B\x21\x10" +    // 18pt
      lr("NET PAY", `Rs.${fmt(data.total)}`, W) +
      "\x1B\x21\x00";
  }

  esc += lr("Paid", `Rs.${fmt(data.paid)}`, W);
  esc += lr("Balance", `Rs.${fmt(data.balance)}`, W);
  esc += div;

  // Footer — centered
  const footerMsg = data.receiptFooter?.trim() || "Thank you! Come again";
  const feedLines = paper === "58" ? "\n\n\n\n" : "\n\n\n\n\n\n\n";
  esc +=
    "\x1B\x61\x01" +      // center
    `${footerMsg}\n` +
    div +
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
    items: { name: string; portionName?: string; qty: number }[];
  }
): string {
  const W = getLineWidth(paper);
  const div = divider(W);

  let esc =
    "\x1B\x40" +              // init
    "\x1B\x61\x01" +          // center
    "\x1B\x21\x00" +          // normal
    `${data.shopName}\n`;

  // KOT + ORDER# — double width+height on 80mm, double height only on 58mm
  if (paper === "80") {
    esc +=
      "\x1B\x21\x30" +          // 24pt: double width + double height
      "KOT\n" +
      `ORDER # ${data.orderNo}\n` +
      "\x1B\x21\x00" +          // normal
      "\x1B\x61\x00";           // left
  } else {
    esc +=
      "\x1B\x21\x10" +          // 18pt: double height only (safe for 58mm)
      "KOT\n" +
      `ORDER # ${data.orderNo}\n` +
      "\x1B\x21\x00" +          // normal
      "\x1B\x61\x00";           // left
  }

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

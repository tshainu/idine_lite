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

// ── ESC/POS raster image from base64 ─────────────────────────────
// Converts a base64 data URL to ESC/POS GS v 0 (raster bit image) bytes.
// `maxWidthPx`: 384 for 58mm @ 203dpi, 576 for 80mm @ 203dpi
// Returns empty string if image can't be decoded (falls back to text header).
export function buildImageEsc(base64DataUrl: string, maxWidthPx: number): string {
  try {
    // We can only do this at print-time via canvas in the billing screen.
    // This function is a no-op placeholder — actual raster conversion happens
    // in buildReceiptEscAsync which accepts a pre-rendered pixel array.
    return "";
  } catch {
    return "";
  }
}

// Paper width in dots (203 dpi thermal)
// 58mm → 384 dots, 80mm → 576 dots
export function getPaperWidthPx(paper: PaperSize): number {
  return paper === "80" ? 576 : 384;
}

// Build GS v 0 ESC/POS raster image command from a 1-bit pixel matrix.
// pixels: boolean[][] — rows of dots (true = black, false = white)
// widthPx: actual image width in dots (must be multiple of 8 after padding)
export function buildGsV0(pixels: boolean[][]): string {
  if (!pixels.length || !pixels[0].length) return "";

  const heightPx = pixels.length;
  const rawWidth = pixels[0].length;
  // ESC/POS requires width to be a multiple of 8
  const widthBytes = Math.ceil(rawWidth / 8);
  const widthPx = widthBytes * 8;

  // xL, xH = widthBytes low/high byte; yL, yH = heightPx low/high byte
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = heightPx & 0xff;
  const yH = (heightPx >> 8) & 0xff;

  let cmd = "\x1D\x76\x30\x00" + String.fromCharCode(xL, xH, yL, yH);

  for (let row = 0; row < heightPx; row++) {
    const rowData = pixels[row];
    for (let byteIdx = 0; byteIdx < widthBytes; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const col = byteIdx * 8 + bit;
        const dark = col < rawWidth ? rowData[col] : false;
        if (dark) byte |= (0x80 >> bit);
      }
      cmd += String.fromCharCode(byte);
    }
  }

  return cmd;
}

// ── Build receipt ESC/POS ─────────────────────────────────────────
export function buildReceiptEsc(
  paper: PaperSize,
  data: {
    shopName: string;
    shopAddress?: string;
    shopPhone?: string;
    headerImage?: string;       // base64 data URL — used to indicate header exists
    headerEscBytes?: string;    // pre-rendered ESC/POS GS v 0 bytes for raster print
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

  // ── Shop header ──
  if (data.headerEscBytes && data.headerEscBytes.length > 0) {
    // Raster image header — center + print + divider
    esc += "\x1B\x61\x01";  // center align
    esc += data.headerEscBytes;
    esc += div;
  } else if (data.headerImage) {
    // headerImage set but raster bytes not available — fall back to text
    esc +=
      "\x1B\x21\x30" +
      `${data.shopName}\n` +
      "\x1B\x21\x00";
    if (data.shopAddress) esc += `${data.shopAddress}\n`;
    if (data.shopPhone)   esc += `${data.shopPhone}\n`;
    esc += div;
  } else {
    // Text header — shop name double width+height, then address/phone
    esc +=
      "\x1B\x21\x30" +    // double width + double height
      `${data.shopName}\n` +
      "\x1B\x21\x00";
    if (data.shopAddress) esc += `${data.shopAddress}\n`;
    if (data.shopPhone)   esc += `${data.shopPhone}\n`;
    esc += div;
  }

  // ── ORDER # + order type — double height (~18pt) + bold ──
  const orderTypeLabel = data.orderType === "takeaway" ? "Take Away" : "Dine In";
  esc +=
    "\x1B\x45\x01" +    // bold on
    "\x1B\x21\x10" +    // double height only (~18pt)
    `ORDER # ${String(data.billNo).padStart(3, "0")}  (${orderTypeLabel})\n` +
    "\x1B\x21\x00" +    // normal size
    "\x1B\x45\x00";     // bold off

  esc += div;

  // ── Bill info ──
  esc +=
    "\x1B\x61\x00" +      // left align
    `Bill No: ${String(data.billNo).padStart(3, "0")} (${data.cashier || "admin"})` +
    " ".repeat(Math.max(1, W - `Bill No: ${String(data.billNo).padStart(3, "0")} (${data.cashier || "admin"})`.length - `${data.date}  ${data.time}`.length)) +
    `${data.date}  ${data.time}\n` +
    div;

  // ── Items table header ──
  if (is80) {
    // fixed cols: qty(3) price(9) amt(9) = 21, prefix "#  " = 3, name flex
    const hdrRight = `${"QTY".padStart(3)}${"PRICE".padStart(9)}${"AMT".padStart(9)}`;
    const hdrLeft  = `#  ITEM`;
    const hdrGap   = Math.max(1, W - hdrLeft.length - hdrRight.length);
    esc += hdrLeft + " ".repeat(hdrGap) + hdrRight + "\n" + div;
  } else {
    esc += lr("#  ITEM", "QTY    AMT", W) + div;
  }

  // ── Items ──
  data.items.forEach((it, i) => {
    const idx = `${i + 1}`;
    if (is80) {
      // 80mm fixed columns: prefix(3) | name(flex) | qty(3) | price(9) | amt(9) = total 48
      const ptn80 = it.portionName ? ` (${it.portionName.slice(0, 3)})` : "";
      const priceStr = it.price != null ? `Rs.${fmt(it.price)}` : "";
      const qtyCol   = String(it.qty).padStart(3);
      const priceCol = priceStr.padStart(9);
      const amtCol   = `Rs.${fmt(it.amt)}`.padStart(9);
      const rightFixed = `${qtyCol}${priceCol}${amtCol}`;  // 21 chars
      const PREFIX = 3; // "# " = index left-justified in 2 + 1 space
      const nameMaxLen = W - PREFIX - rightFixed.length;   // 48 - 3 - 21 = 24
      const fullName = `${it.name}${ptn80}`;
      const idxStr = idx.padEnd(2);  // "1 ", "2 ", ... "10" etc
      // wrap long names
      if (fullName.length <= nameMaxLen) {
        esc += `${idxStr} ${fullName.padEnd(nameMaxLen)}${rightFixed}\n`;
      } else {
        const line1 = fullName.slice(0, nameMaxLen);
        const line2 = fullName.slice(nameMaxLen);
        esc += `${idxStr} ${line1.padEnd(nameMaxLen)}${rightFixed}\n`;
        esc += `   ${line2}\n`;
      }
    } else {
      // 58mm: wrap item name at 15 chars, full name + portion, no Rs. on amt
      const ptnTag = it.portionName ? ` (${it.portionName.slice(0, 3)})` : "";
      const rightCol = `${it.qty}  ${fmt(it.amt)}`;
      const fullName = `${it.name}${ptnTag}`;
      const WRAP = 15;
      if (fullName.length <= WRAP) {
        esc += lr(`${idx}  ${fullName}`, rightCol, W);
      } else {
        // first line: index + first 15 chars, right col
        esc += lr(`${idx}  ${fullName.slice(0, WRAP)}`, rightCol, W);
        // remaining lines: indented, no right col
        let rest = fullName.slice(WRAP);
        while (rest.length > 0) {
          esc += `    ${rest.slice(0, WRAP)}\n`;
          rest = rest.slice(WRAP);
        }
      }
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

  const { NativeModules } = require("react-native");
  if (!NativeModules.TcpSockets) {
    throw new Error("WiFi printing requires a compiled build. Not supported in Expo Go.");
  }

  const TcpSocket = require("react-native-tcp-socket");

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let client: any = null;
    const done = (err?: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (client) client.destroy(); } catch {}
      if (err) reject(err); else resolve();
    };

    const timer = setTimeout(() => {
      done(new Error("Connection timed out after 15s"));
    }, 15000);

    client = TcpSocket.createConnection({ host: ip, port }, () => {
      // Use Buffer.from for safe binary byte transmission (avoids JS string encoding quirks)
      const buf = Buffer.from(escposData, "binary");
      client.write(buf, (err: any) => {
        if (err) { done(err); return; }
        // Gracefully close the write side — do NOT destroy() immediately.
        // destroy() kills the socket before the OS finishes flushing large payloads
        // (image data = many TCP segments). end() sends FIN after all data is sent,
        // and the 'close' event fires only when the connection is truly done.
        try { client.end(); } catch { done(); }
      });
    });
    client.on("error", (err: any) => done(err));
    // Resolve only on actual close — guarantees all data was transmitted
    client.on("close", () => done());
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
  if (!dev) throw new Error("Bluetooth device connection returned null.");
  try {
    // Convert to Buffer for safe binary byte transmission
    const buf = Buffer.from(escposData, "binary");
    await dev.write(buf);
    // Wait for BT SPP to flush — image data (~10-30KB) needs more than 500ms.
    // Scale wait time with payload size: ~1ms per 10 bytes, clamped 800-4000ms.
    const waitMs = Math.max(800, Math.min(4000, Math.floor(buf.length / 10)));
    await new Promise(r => setTimeout(r, waitMs));
  } finally {
    try { await dev.disconnect(); } catch { /* ignore */ }
  }
}

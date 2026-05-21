/**
 * imageToEscPos.ts
 * Convert an image URI (file:// or http:// or base64 data URL) to ESC/POS
 * GS v 0 raster bytes, sized to fit the given paper width.
 *
 * Paper widths (203 dpi):
 *   58mm → 384 dots max
 *   80mm → 576 dots max
 *
 * Strategy:
 *  1. Use expo-image-manipulator to resize the image to fit the paper width,
 *     keeping aspect ratio, and get a base64 PNG.
 *  2. Decode the PNG pixel data using a pure-JS DEFLATE/PNG parser (pako).
 *  3. Convert to 1-bit (threshold) and build ESC/POS GS v 0 command.
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
// Static import so Metro bundles pako at build time (dynamic require() can fail)
import * as pako from "pako";
import { getPaperWidthPx, buildGsV0 } from "./printer";
import type { PaperSize } from "./printer";

// ── helpers ───────────────────────────────────────────────────────

function readUint32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

/** Decode base64 string (with or without data-URL prefix) → Uint8Array */
function b64ToBytes(b64: string): Uint8Array {
  const raw = b64.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// PNG filter reconstruction helper
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

interface DecodedPng {
  width: number;
  height: number;
  /** Flat RGBA array, length = width * height * 4 */
  data: Uint8Array;
}

// ── PNG decoder ───────────────────────────────────────────────────

function decodePng(bytes: Uint8Array): DecodedPng | null {
  // Verify PNG signature
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== SIG[i]) {
      console.warn("[imageToEscPos] decodePng: bad PNG signature at byte", i);
      return null;
    }
  }

  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let off = 8;

  while (off < bytes.length) {
    const len = readUint32BE(bytes, off); off += 4;
    const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]); off += 4;
    const data = bytes.slice(off, off + len); off += len;
    off += 4; // skip CRC

    if (type === "IHDR") {
      width = readUint32BE(data, 0);
      height = readUint32BE(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      console.log(`[imageToEscPos] PNG IHDR: ${width}x${height} depth=${bitDepth} colorType=${colorType}`);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height) {
    console.warn("[imageToEscPos] decodePng: zero width/height after parsing");
    return null;
  }

  // Concatenate IDAT chunks and inflate
  const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of idatChunks) { combined.set(chunk, pos); pos += chunk.length; }

  let inflated: Uint8Array;
  try {
    inflated = pako.inflate(combined);
  } catch (e) {
    console.warn("[imageToEscPos] decodePng: pako.inflate failed:", e);
    return null;
  }

  // Bytes per pixel based on colorType
  let bpp = 1;
  if (colorType === 2) bpp = 3;       // RGB
  else if (colorType === 4) bpp = 2;  // Grayscale+Alpha
  else if (colorType === 6) bpp = 4;  // RGBA
  // colorType 0 = grayscale (bpp=1), colorType 3 = indexed (bpp=1)

  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);

  let infOff = 0;
  let prev = new Uint8Array(stride);

  for (let row = 0; row < height; row++) {
    const filter = inflated[infOff++];
    const rowBytes = inflated.slice(infOff, infOff + stride);
    infOff += stride;

    const recon = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const x = rowBytes[i];
      const a = i >= bpp ? recon[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      switch (filter) {
        case 0: recon[i] = x; break;
        case 1: recon[i] = (x + a) & 0xff; break;
        case 2: recon[i] = (x + b) & 0xff; break;
        case 3: recon[i] = (x + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: recon[i] = (x + paethPredictor(a, b, c)) & 0xff; break;
        default: recon[i] = x;
      }
    }
    prev = recon;

    for (let col = 0; col < width; col++) {
      const pxOff = (row * width + col) * 4;
      if (colorType === 0 || colorType === 4) {
        const gray = recon[col * bpp];
        rgba[pxOff] = rgba[pxOff + 1] = rgba[pxOff + 2] = gray;
        rgba[pxOff + 3] = colorType === 4 ? recon[col * bpp + 1] : 255;
      } else if (colorType === 2) {
        rgba[pxOff]     = recon[col * 3];
        rgba[pxOff + 1] = recon[col * 3 + 1];
        rgba[pxOff + 2] = recon[col * 3 + 2];
        rgba[pxOff + 3] = 255;
      } else if (colorType === 6) {
        rgba[pxOff]     = recon[col * 4];
        rgba[pxOff + 1] = recon[col * 4 + 1];
        rgba[pxOff + 2] = recon[col * 4 + 2];
        rgba[pxOff + 3] = recon[col * 4 + 3];
      } else {
        // Indexed / other — treat first byte as gray
        const v = recon[col];
        rgba[pxOff] = rgba[pxOff + 1] = rgba[pxOff + 2] = v;
        rgba[pxOff + 3] = 255;
      }
    }
  }

  return { width, height, data: rgba };
}

// ── bitmap conversion ─────────────────────────────────────────────

/** Convert RGBA pixel array to 1-bit boolean matrix (true = dark/printed dot) */
function rgbaToBitmap(rgba: Uint8Array, width: number, height: number): boolean[][] {
  const rows: boolean[][] = [];
  for (let row = 0; row < height; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < width; col++) {
      const off = (row * width + col) * 4;
      const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2], a = rgba[off + 3];
      if (a < 128) { line.push(false); continue; } // transparent → white
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      line.push(luma < 128); // dark = printed dot
    }
    rows.push(line);
  }
  return rows;
}

// ── main export ───────────────────────────────────────────────────

/**
 * Convert any image URI / base64 data URL to ESC/POS raster bytes for the given paper size.
 * Returns empty string on failure (caller falls back to text header).
 */
export async function imageUriToEscPos(uri: string, paper: PaperSize): Promise<string> {
  try {
    const paperWidthPx = getPaperWidthPx(paper);
    console.log(`[imageToEscPos] start uri=${uri.slice(0, 60)}... paper=${paper} targetWidth=${paperWidthPx}`);

    // Step 1: resize to paper width and get base64 PNG
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: paperWidthPx } }],
      { format: ImageManipulator.SaveFormat.PNG, base64: true }
    );

    console.log(`[imageToEscPos] manipulateAsync done uri=${result.uri} base64len=${result.base64?.length ?? "null"}`);

    // Get base64 — prefer inline result, fallback to reading the saved file
    let b64: string | null = result.base64 ?? null;
    if (!b64) {
      console.warn("[imageToEscPos] result.base64 was null, reading from file:", result.uri);
      try {
        b64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: "base64" as any,
        });
        console.log(`[imageToEscPos] read from file ok, len=${b64?.length}`);
      } catch (fsErr) {
        console.warn("[imageToEscPos] FileSystem.readAsStringAsync failed:", fsErr);
        return "";
      }
    }

    if (!b64) {
      console.warn("[imageToEscPos] no base64 data available, giving up");
      return "";
    }

    // Step 2: decode PNG pixels
    const pngBytes = b64ToBytes(b64);
    console.log(`[imageToEscPos] pngBytes len=${pngBytes.length}`);

    const decoded = decodePng(pngBytes);
    if (!decoded) {
      console.warn("[imageToEscPos] decodePng returned null");
      return "";
    }

    console.log(`[imageToEscPos] decoded ${decoded.width}x${decoded.height}`);

    // Step 3: 1-bit bitmap
    const pixels = rgbaToBitmap(decoded.data, decoded.width, decoded.height);
    if (!pixels.length) {
      console.warn("[imageToEscPos] bitmap is empty");
      return "";
    }

    // Step 4: build ESC/POS GS v 0 command
    const escBytes = buildGsV0(pixels);
    console.log(`[imageToEscPos] escBytes len=${escBytes.length} ✓`);
    return escBytes;

  } catch (e) {
    console.warn("[imageToEscPos] unexpected error:", e);
    return "";
  }
}

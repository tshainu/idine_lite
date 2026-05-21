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
 *  2. Decode the PNG pixel data using a pure-JS DEFLATE/PNG parser.
 *  3. Convert to 1-bit (threshold) and build ESC/POS GS v 0 command.
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { getPaperWidthPx, buildGsV0 } from "./printer";
import type { PaperSize } from "./printer";

// ── PNG decoder (pure JS) ─────────────────────────────────────────
// We use a minimal PNG IDAT/IDHR parser to extract RGBA pixel rows.
// React Native doesn't have a DOM canvas, so we decode raw bytes ourselves.

// Inflate (DEFLATE) using pako — available as a transitive dep via react-native
let pako: any = null;
try { pako = require("pako"); } catch { /* not available */ }

function readUint32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// Decode base64 string to Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  // strip data URL prefix if present
  const raw = b64.replace(/^data:[^;]+;base64,/, "");
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// PNG filter reconstruction
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

function decodePng(bytes: Uint8Array): DecodedPng | null {
  if (!pako) return null;

  // Check signature
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) return null;

  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let off = 8;

  while (off < bytes.length) {
    const len = readUint32BE(bytes, off); off += 4;
    const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]); off += 4;
    const data = bytes.slice(off, off + len); off += len;
    off += 4; // CRC skip

    if (type === "IHDR") {
      width = readUint32BE(data, 0);
      height = readUint32BE(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height) return null;

  // Concatenate IDAT chunks and inflate
  const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of idatChunks) { combined.set(chunk, pos); pos += chunk.length; }

  let inflated: Uint8Array;
  try { inflated = pako.inflate(combined); } catch { return null; }

  // Determine bytes per pixel
  let bpp = 1;
  if (colorType === 2) bpp = 3;       // RGB
  else if (colorType === 4) bpp = 2;  // Grayscale+Alpha
  else if (colorType === 6) bpp = 4;  // RGBA
  else if (colorType === 3) bpp = 1;  // Indexed (palette) — treat as 1

  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);

  let infOff = 0;
  let prev = new Uint8Array(stride); // previous row for filters

  for (let row = 0; row < height; row++) {
    const filter = inflated[infOff++];
    const rowBytes = inflated.slice(infOff, infOff + stride);
    infOff += stride;

    // Reconstruct with filter
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

    // Write RGBA
    for (let col = 0; col < width; col++) {
      const pxOff = (row * width + col) * 4;
      if (colorType === 0 || colorType === 4) {
        // Grayscale
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
        // Indexed / other — just use first byte as gray
        const v = recon[col];
        rgba[pxOff] = rgba[pxOff + 1] = rgba[pxOff + 2] = v;
        rgba[pxOff + 3] = 255;
      }
    }
  }

  return { width, height, data: rgba };
}

// Convert RGBA pixel array to 1-bit boolean matrix (threshold 128)
function rgbaToBitmap(rgba: Uint8Array, width: number, height: number): boolean[][] {
  const rows: boolean[][] = [];
  for (let row = 0; row < height; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < width; col++) {
      const off = (row * width + col) * 4;
      const r = rgba[off], g = rgba[off + 1], b = rgba[off + 2], a = rgba[off + 3];
      // Transparent pixels → white (not printed)
      if (a < 128) { line.push(false); continue; }
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      line.push(luma < 128); // dark = printed dot
    }
    rows.push(line);
  }
  return rows;
}

// ── Main export ───────────────────────────────────────────────────

/**
 * Convert any image URI/base64 to ESC/POS raster bytes for the given paper size.
 * Returns empty string on failure (caller falls back to text header).
 */
export async function imageUriToEscPos(uri: string, paper: PaperSize): Promise<string> {
  try {
    const paperWidthPx = getPaperWidthPx(paper);

    // Step 1: resize image to paper width using expo-image-manipulator
    // Keep aspect ratio, convert to PNG for reliable decoding
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: paperWidthPx } }],
      { format: ImageManipulator.SaveFormat.PNG, base64: true }
    );

    const b64 = result.base64;
    if (!b64) return "";

    // Step 2: decode PNG pixels
    const pngBytes = b64ToBytes(b64);
    const decoded = decodePng(pngBytes);
    if (!decoded) return "";

    // Step 3: convert to 1-bit bitmap
    const pixels = rgbaToBitmap(decoded.data, decoded.width, decoded.height);
    if (!pixels.length) return "";

    // Step 4: build ESC/POS GS v 0 command
    return buildGsV0(pixels);
  } catch (e) {
    console.warn("[imageToEscPos] failed:", e);
    return "";
  }
}

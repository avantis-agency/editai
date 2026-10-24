// Font metrics for `style.size_basis: "em"`. libass sizes a font by its line
// box (OS/2 winAscent + winDescent), CSS by its em square: Anton's line box is
// 1.73 em, so "86 px" in a browser (the editonny headline) is 149 px in libass.
// With size_basis "em", font_px means the CSS size and is converted here. Bun only.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FONTS_DIR } from "./spec.ts";

const cache = new Map<string, number>();

/** libass size / em size for a family whose file in assets/fonts starts with the family name. */
export function lineRatio(family = "Inter"): number {
  const key = family.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const file = existsSync(FONTS_DIR)
    ? readdirSync(FONTS_DIR).find((f) => f.toLowerCase().startsWith(key.replace(/\s+/g, "")) && /\.(ttf|otf)$/i.test(f))
    : undefined;
  if (!file) throw new Error(`size_basis "em": no font file for "${family}" in assets/fonts (file name must start with the family name)`);
  const buf = readFileSync(join(FONTS_DIR, file));
  const b = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables: Record<string, number> = {};
  for (let i = 0, n = b.getUint16(4); i < n; i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(b.getUint8(o), b.getUint8(o + 1), b.getUint8(o + 2), b.getUint8(o + 3))] = b.getUint32(o + 8);
  }
  const upm = b.getUint16(tables.head + 18);
  const os2 = tables["OS/2"];
  const ratio = (b.getUint16(os2 + 74) + b.getUint16(os2 + 76)) / upm; // usWinAscent + usWinDescent
  cache.set(key, ratio);
  return ratio;
}

/** Font file in assets/fonts for a family (file name starts with the family name), or null. */
export function fontFile(family: string): string | null {
  const key = family.toLowerCase().replace(/\s+/g, "");
  const file = existsSync(FONTS_DIR) ? readdirSync(FONTS_DIR).find((f) => f.toLowerCase().startsWith(key) && /\.(ttf|otf)$/i.test(f)) : undefined;
  return file ?? null;
}

/**
 * Vertical metrics the mini editor needs to draw text where libass draws it: libass centres a line
 * (\an5) on its winAscent + winDescent box and sizes the font by that box (see lineRatio).
 */
export function vMetrics(family: string): { file: string; upm: number; win_asc: number; win_desc: number; ratio: number } | null {
  const file = fontFile(family);
  if (!file) return null;
  const buf = readFileSync(join(FONTS_DIR, file));
  const b = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables: Record<string, number> = {};
  for (let i = 0, n = b.getUint16(4); i < n; i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(b.getUint8(o), b.getUint8(o + 1), b.getUint8(o + 2), b.getUint8(o + 3))] = b.getUint32(o + 8);
  }
  const upm = b.getUint16(tables.head + 18), os2 = tables["OS/2"];
  const win_asc = b.getUint16(os2 + 74), win_desc = b.getUint16(os2 + 76);
  return { file, upm, win_asc, win_desc, ratio: (win_asc + win_desc) / upm };
}

/** Size handed to libass for a style (font_px, or a CSS em size converted). */
export function assSize(px: number, st: { font_family?: string; size_basis?: "line" | "em" }): number {
  return st.size_basis === "em" ? Math.round(px * lineRatio(st.font_family ?? "Inter")) : px;
}

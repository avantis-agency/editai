// Font metrics for `style.size_basis: "em"`. libass sizes a font by its line
// box (OS/2 winAscent + winDescent), CSS by its em square: Anton's line box is
// 1.73 em, so "86 px" in a browser (the editonny headline) is 149 px in libass.
// With size_basis "em", font_px means the CSS size and is converted here. Bun only.
// User fonts (2.3.0): a font the person supplied (spec.fonts: a folder such as <project>/fonts, or files),
// never copied into the squad. Its family comes from the file's own name table; the render copies it into
// its work folder for libass (measure.ts fontsDirFor). A style with font_fallback falls back to a squad
// font while the file has not arrived, and says so (spec.notes, QA caption_font).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { FONTS_DIR, SQUAD_ROOT, type EditSpec, type TextStyle, type UserFonts } from "./spec.ts";

const cache = new Map<string, number>();

function sfntTables(buf: Buffer): { b: DataView; tables: Record<string, number> } {
  const b = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables: Record<string, number> = {};
  for (let i = 0, n = b.getUint16(4); i < n; i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(b.getUint8(o), b.getUint8(o + 1), b.getUint8(o + 2), b.getUint8(o + 3))] = b.getUint32(o + 8);
  }
  return { b, tables };
}

/** Family (name ID 1), typographic family (16), subfamily (2) and weight of a .ttf/.otf, read from the file. */
export function fontNames(file: string): { family: string; typographic: string | null; subfamily: string; weight: number; bold: boolean } {
  const buf = readFileSync(file);
  const { b, tables } = sfntTables(buf);
  const nt = tables.name;
  if (nt === undefined) throw new Error(`${basename(file)}: no name table`);
  const count = b.getUint16(nt + 2), strings = nt + b.getUint16(nt + 4);
  const names = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const r = nt + 6 + i * 12;
    const platform = b.getUint16(r), lang = b.getUint16(r + 4), id = b.getUint16(r + 6), len = b.getUint16(r + 8), off = b.getUint16(r + 10);
    if (![1, 2, 16].includes(id)) continue;
    let s = "";
    if (platform === 3 || platform === 0) { for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(b.getUint16(strings + off + k)); }
    else if (platform === 1) { for (let k = 0; k < len; k++) s += String.fromCharCode(b.getUint8(strings + off + k)); }
    else continue;
    // Windows English first, then whatever came first
    if (!names.has(id) || (platform === 3 && lang === 0x409)) names.set(id, s.trim());
  }
  const os2 = tables["OS/2"];
  const weight = os2 !== undefined ? b.getUint16(os2 + 4) : 400;
  const fsSel = os2 !== undefined ? b.getUint16(os2 + 62) : 0;
  const sub = names.get(2) ?? "Regular";
  return { family: names.get(1) ?? basename(file, extname(file)), typographic: names.get(16) ?? null, subfamily: sub, weight, bold: weight >= 600 || !!(fsSel & 0x20) || /bold|black|heavy/i.test(sub) };
}

const userFonts: { family: string; typographic: string | null; file: string; bold: boolean; license: string }[] = [];
export const USER_FONT_LICENSE = "fornecida pelo usuário";

/** .ttf/.otf files of spec.fonts (folder scanned now, then the listed files); files inside the squad are left out (validateFonts says why). */
export function scanUserFonts(u: UserFonts): NonNullable<UserFonts["found"]> {
  const files: string[] = [];
  if (u.dir && existsSync(u.dir) && statSync(u.dir).isDirectory()) for (const f of readdirSync(u.dir).sort()) files.push(join(u.dir, f));
  for (const f of u.files ?? []) files.push(f);
  const out: NonNullable<UserFonts["found"]> = [];
  for (const f of files) {
    if (!/\.(ttf|otf)$/i.test(f) || !existsSync(f) || insideSquad(f)) continue;
    try { const n = fontNames(f); out.push({ family: n.family, file: resolve(f), bold: n.bold, license: u.license ?? USER_FONT_LICENSE }); } catch { /* not a font: validateFonts reports it */ }
  }
  return out;
}

const insideSquad = (f: string) => { const r = relative(SQUAD_ROOT, resolve(f)); return !r.startsWith("..") && !/^[a-z]:/i.test(r); };

/** The user font for a family name (name ID 1 or 16, or the file name), the bold face first when asked. */
export function userFontFor(family: string, bold = false) {
  const k = family.toLowerCase().replace(/\s+/g, "");
  const hits = userFonts.filter((f) => [f.family, f.typographic ?? "", basename(f.file)].some((n) => n.toLowerCase().replace(/\s+/g, "").startsWith(k)));
  return hits.sort((a, b) => Number(b.bold === bold) - Number(a.bold === bold))[0] ?? null;
}

/** spec.fonts found, the registry for this process, then font_used for every style with a fallback. Idempotent. */
export function resolveFonts(s: EditSpec): void {
  userFonts.length = 0;
  if (s.fonts) {
    s.fonts.found = scanUserFonts(s.fonts);
    for (const f of s.fonts.found) {
      const n = fontNames(f.file);
      userFonts.push({ family: n.family, typographic: n.typographic, file: f.file, bold: n.bold, license: f.license });
    }
  }
  const styles: TextStyle[] = [...(s.texts ?? []).map((t) => t.style), ...(s.captions ? [s.captions.style] : [])];
  for (const st of styles) {
    if (!st?.font_fallback) continue;
    const want = st.font_family ?? "Inter";
    const u = fontFile(want) ? null : userFontFor(want, st.bold !== false);
    st.font_used = fontFile(want) ? want : u ? u.family : st.font_fallback;
    if (st.font_used === st.font_fallback && want !== st.font_fallback) {
      const where = s.fonts?.dir ? ` em ${s.fonts.dir}` : "";
      const note = `fonte "${want}" não encontrada${where}: o texto usa ${st.font_fallback}. Ponha o .ttf ou .otf${where || " em spec.fonts"} e renderize de novo.`;
      s.notes = [...(s.notes ?? []).filter((n) => !n.startsWith(`fonte "${want}"`)), note];
    } else s.notes = s.notes?.filter((n) => !n.startsWith(`fonte "${want}"`));
  }
}

export function validateFonts(s: EditSpec): string[] {
  const p: string[] = [];
  const u = s.fonts;
  if (!u) return p;
  if (u.dir && insideSquad(u.dir)) p.push(`fonts.dir is inside the squad (${u.dir}): a font the person supplied lives in the project (for example <project>/fonts), never in the squad`);
  for (const f of u.files ?? []) {
    if (!/\.(ttf|otf)$/i.test(f)) p.push(`fonts.files: ${basename(f)} is not .ttf or .otf`);
    else if (!existsSync(f)) p.push(`fonts.files: not found: ${f}`);
    else if (insideSquad(f)) p.push(`fonts.files: ${basename(f)} is inside the squad; keep the person's fonts in the project`);
  }
  return p;
}

/** The family name libass should get for a style (the fallback while a user font is missing). */
export const familyOf = (st: { font_family?: string; font_used?: string }) => st.font_used ?? st.font_family ?? "Inter";

/** Font file (absolute) for a family: assets/fonts first, then the user fonts. */
function fontPath(family: string): string | null {
  const f = fontFile(family);
  if (f) return join(FONTS_DIR, f);
  return userFontFor(family)?.file ?? null;
}

/** The user font files of this process (render work folder, mini editor). */
export const userFontFiles = () => userFonts.map((f) => f.file);

/** libass size / em size for a family whose file in assets/fonts starts with the family name (or a user font, 2.3.0). */
export function lineRatio(family = "Inter"): number {
  const key = family.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const path = fontPath(family);
  if (!path) throw new Error(`size_basis "em": no font file for "${family}" in assets/fonts (file name must start with the family name) nor in spec.fonts`);
  const buf = readFileSync(path);
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
export function vMetrics(family: string): { file: string; upm: number; win_asc: number; win_desc: number; ratio: number; user?: boolean } | null {
  const path = fontPath(family);
  if (!path) return null;
  const file = basename(path), user = !fontFile(family);
  const buf = readFileSync(path);
  const b = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables: Record<string, number> = {};
  for (let i = 0, n = b.getUint16(4); i < n; i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(b.getUint8(o), b.getUint8(o + 1), b.getUint8(o + 2), b.getUint8(o + 3))] = b.getUint32(o + 8);
  }
  const upm = b.getUint16(tables.head + 18), os2 = tables["OS/2"];
  const win_asc = b.getUint16(os2 + 74), win_desc = b.getUint16(os2 + 76);
  return { file, upm, win_asc, win_desc, ratio: (win_asc + win_desc) / upm, ...(user ? { user: true } : {}) };
}

/** Size handed to libass for a style (font_px, or a CSS em size converted). */
export function assSize(px: number, st: { font_family?: string; font_used?: string; size_basis?: "line" | "em" }): number {
  return st.size_basis === "em" ? Math.round(px * lineRatio(familyOf(st))) : px;
}

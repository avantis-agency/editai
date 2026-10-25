// Safe-zone geometry and the pre-render text fit. Bun only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captionGroups, captionStyle, widestMoment } from "./ass.ts";
import { intersect, measureTextBox } from "./measure.ts";
import type { EditSpec, Platform, Rect, TextLayer } from "./spec.ts";

const DATA = JSON.parse(readFileSync(join(import.meta.dir, "safe-zones.json"), "utf8"));
export const ALL_PLATFORMS = Object.keys(DATA.platforms) as Platform[];

export interface Zone extends Rect { label: string; platform: Platform }

/** "portrait" (9:16, the base of the file) or "landscape" (2.3.0, 16:9 platforms with their own base); null when unknown. */
export function platformOrientation(platform: string): "portrait" | "landscape" | null {
  const p = DATA.platforms[platform];
  return p ? (p.orientation ?? "portrait") : null;
}

/** The platforms a canvas is measured against: the ones of its own orientation (a 9:16 canvas sees the same four as before). */
export function platformsFor(W: number, H: number): Platform[] {
  const want = W > H ? "landscape" : "portrait";
  return ALL_PLATFORMS.filter((p) => platformOrientation(p) === want);
}

/** Unsafe rectangles of a platform, scaled to the canvas. */
export function unsafeRects(platform: Platform, W: number, H: number): Zone[] {
  const p = DATA.platforms[platform];
  if (!p) throw new Error(`unknown platform ${platform}; known: ${ALL_PLATFORMS.join(", ")}`);
  const base = p.base ?? DATA.base;
  const sx = W / base.width, sy = H / base.height;
  return p.unsafe.map((r: any) => ({
    label: r.label, platform, x: Math.round(r.x * sx), y: Math.round(r.y * sy), w: Math.round(r.w * sx), h: Math.round(r.h * sy),
  }));
}

export function zoneSources(platform: Platform): string[] {
  return DATA.platforms[platform]?.sources ?? [];
}

/** Moment a text block is fully on screen (entrance done, exit not started). */
export function measureTime(t: TextLayer): number {
  const s = t.stagger ?? 0.35;
  const lead = t.animation === "line_stagger" ? s * (t.lines.length - 1) + 0.35
    : t.animation === "word_reveal" ? s * t.lines.join(" ").split(" ").length + 0.15
    : 0.45;
  return Math.min(Math.max(t.start + lead, t.start + 0.3), Math.max(t.start + 0.3, t.end - 0.3));
}

export interface FitLog { layer: string; action: string }

/**
 * Before rendering: measure each text block that asks for `fit_width` and move or
 * shrink it until it clears every unsafe rectangle of the target platforms.
 * Mutates the spec (the resolved spec is what gets saved next to the MP4).
 */
export function fitTexts(spec: EditSpec, workdir: string, minFontPx = 52): FitLog[] {
  const { width: W, height: H } = spec.canvas;
  const zones = spec.platforms.flatMap((p) => unsafeRects(p, W, H));
  const log: FitLog[] = [];
  for (const t of spec.texts) {
    // width budget first (headline "largura máxima segura"), measured on the rendered glyphs
    for (let i = 0; t.max_width_px && i < 3; i++) {
      const box = measureTextBox(spec, t.id, measureTime(t), workdir);
      if (!box || box.w <= t.max_width_px) break;
      const next = Math.floor(t.style.font_px * (t.max_width_px - 4) / box.w);
      log.push({ layer: t.id, action: `font ${t.style.font_px}px -> ${next}px: measured ${box.w}px wide, budget ${t.max_width_px}px` });
      if (t.style.line_spacing_px) t.style.line_spacing_px = Math.round(t.style.line_spacing_px * next / t.style.font_px);
      t.style.font_px = next;
    }
  }
  for (const t of spec.texts.filter((x) => x.fit_width !== false)) {
    for (let i = 0; i < 6; i++) {
      const box = measureTextBox(spec, t.id, measureTime(t), workdir);
      if (!box) break;
      const hits = zones.map((z) => ({ z, o: intersect(box, z) })).filter((h) => h.o);
      if (!hits.length) break;
      const band = hits.find((h) => h.z.w >= W * 0.9);
      if (band) {
        const dy = band.z.y === 0 ? band.o!.h + 12 : -(band.o!.h + 12);
        t.y += dy;
        log.push({ layer: t.id, action: `moved ${dy > 0 ? "down" : "up"} ${Math.abs(dy)}px to clear "${band.z.label}" (${band.z.platform})` });
        continue;
      }
      const worst = Math.max(...hits.map((h) => h.o!.w));
      const factor = Math.max(0.7, (box.w - 2 * worst - 12) / box.w);
      const next = Math.floor(t.style.font_px * factor);
      if (next < minFontPx) {
        log.push({ layer: t.id, action: `cannot shrink below ${minFontPx}px; still overlaps ${hits.map((h) => h.z.label).join(", ")}` });
        break;
      }
      log.push({ layer: t.id, action: `font ${t.style.font_px}px -> ${next}px to clear ${hits.map((h) => `"${h.z.label}" (${h.z.platform})`).join(", ")}` });
      if (t.style.line_spacing_px) t.style.line_spacing_px = Math.round(t.style.line_spacing_px * next / t.style.font_px);
      t.style.font_px = next;
    }
  }
  return [...log, ...fitCaptions(spec, workdir)];
}

/**
 * bold-word captions: each group is measured at its widest moment and, when it
 * is wider than max_width_px, gets its own smaller font (captions.group_font_px).
 * Recomputed from scratch on every render, so a resolved spec re-renders the same.
 */
export function fitCaptions(spec: EditSpec, workdir: string): FitLog[] {
  const c = spec.captions;
  if (!c || c.preset !== "bold-word" || !c.words.length) return [];
  const base = captionStyle(c).font_px;
  const max = c.max_width_px ?? Math.round(spec.canvas.width * 0.8);
  const groups = captionGroups(c);
  c.group_font_px = groups.map(() => base);
  const log: FitLog[] = [];
  groups.forEach((g, gi) => {
    for (let i = 0; i < 3; i++) {
      const box = measureTextBox(spec, "captions", widestMoment(g), workdir);
      if (!box || box.w <= max) break;
      const next = Math.floor(c.group_font_px![gi] * (max - 4) / box.w);
      log.push({ layer: "captions", action: `group "${g.map((w) => w.word).join(" ")}": ${c.group_font_px![gi]}px -> ${next}px (measured ${box.w}px, budget ${max}px)` });
      c.group_font_px![gi] = next;
    }
  });
  return log;
}

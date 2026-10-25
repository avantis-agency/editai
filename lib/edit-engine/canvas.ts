// Canvas sizes and the horizontal (16:9) part of wave 5 (EditAi 2.3.0). Bun only.
//
//   spec.canvas = {width, height, fps}           as before (every template keeps its 1080x1920 object)
//   spec.canvas = "1920x1080" | "1080x1920"      by name, 30 fps
//   spec.canvas = "same-as-source"               the size (and fps, when it is a usual rate) of the first full-frame take
//
// A horizontal canvas gets its own safe zones (safe-zones.json: youtube_16x9, screen_16x9), captions in the
// lower third (QA captions_lower_third) and, when the spec declares no protect_regions, the face measured
// by the installed editonny (track_faces.py, the same driver as reframe.ts) as the region text must not cover.
// Text over a soft shadow only (no outline, no box) gets a measured look at what is behind it
// (caption_background): the shadow is light, so a bright background is the risk.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fontsDirFor, probe, run } from "./measure.ts";
import { buildAss } from "./ass.ts";
import { trackFaces, reframeOn } from "./reframe.ts";
import { platformOrientation } from "./safezones.ts";
import type { Canvas, CanvasName, EditSpec, Rect, TextStyle } from "./spec.ts";

export const CANVAS_NAMES: Record<Exclude<CanvasName, "same-as-source">, Canvas> = {
  "1080x1920": { width: 1080, height: 1920, fps: 30 },
  "1920x1080": { width: 1920, height: 1080, fps: 30 },
};
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export const isLandscape = (c: { width: number; height: number }) => c.width > c.height;

/** Full-frame video takes in timeline order (the camera of a talking head). */
const fullTakes = (s: EditSpec) => (s.layers ?? []).filter((l) => l.kind === "video" && !l.rect && !l.broll).sort((a, b) => a.start - b.start);

/** A canvas name to {width, height, fps}; idempotent (an object is left as it is). */
export function resolveCanvas(s: EditSpec): void {
  const c = s.canvas as unknown;
  if (typeof c !== "string") return;
  if (c === "same-as-source") {
    const t = fullTakes(s)[0];
    if (!t || !existsSync(t.src)) return; // validation reports it
    const p = probe(t.src);
    const fps = [24, 25, 30, 50, 60].find((f) => Math.abs(p.fps - f) < 0.05) ?? 30;
    s.canvas = { width: even(p.width), height: even(p.height), fps };
  } else if (c in CANVAS_NAMES) s.canvas = { ...CANVAS_NAMES[c as keyof typeof CANVAS_NAMES] };
  else return;
  s.canvas_request = c as CanvasName;
}

export function validateCanvas(s: EditSpec): string[] {
  const p: string[] = [];
  const c = s.canvas as unknown;
  if (typeof c === "string") { p.push(`canvas "${c}" unknown or without a full-frame video take; use 1080x1920, 1920x1080, same-as-source or {width, height, fps}`); return p; }
  if (s.canvas && (s.canvas.width % 2 || s.canvas.height % 2)) p.push("canvas width and height must be even (yuv420p)");
  if (s.canvas && Array.isArray(s.platforms)) {
    const want = isLandscape(s.canvas) ? "landscape" : "portrait";
    for (const pl of s.platforms) {
      const o = platformOrientation(pl);
      if (o && o !== want) p.push(`platform ${pl} is a ${o === "portrait" ? "9:16" : "16:9"} platform; a ${s.canvas.width}x${s.canvas.height} canvas uses ${want === "landscape" ? "youtube_16x9 or screen_16x9" : "instagram_reels, tiktok, youtube_shorts or facebook_reels"}`);
    }
  }
  return p;
}

/** Quick draft size for the mini editor and th-batch: half the canvas (540x960 for 9:16, as before; 960x540 for 16:9). */
export function draftSize(c: { width: number; height: number }): { width: number; height: number } {
  return { width: even(c.width / 2), height: even(c.height / 2) };
}

/** Default caption centre on a horizontal canvas: inside the lower third, above the player controls and the title-safe edge. */
export const landscapeCaptionY = (H: number) => Math.round(H * 0.83);

// ── face on a horizontal canvas ──────────────────────────────────────────────────

/** Where a source pixel box lands on the canvas for a cover-fitted full-frame take (zoom 1). */
function coverMap(W: number, H: number, sw: number, sh: number, focus = { x: 0.5, y: 0.5 }) {
  const k = Math.max(W / sw, H / sh), ox = (sw * k - W) * focus.x, oy = (sh * k - H) * focus.y;
  return { k, ox, oy, toCanvas: (r: Rect): Rect => ({ x: Math.round(r.x * k - ox), y: Math.round(r.y * k - oy), w: Math.round(r.w * k), h: Math.round(r.h * k) }) };
}

/**
 * Horizontal canvas without declared protect_regions: the face of every full-frame take, measured by
 * editonny track_faces (10 samples a second, cached per source), becomes one protected region (the union
 * of the boxes, 12 px margin). Nothing for a vertical canvas, a reframe (reframe.ts does its own) or
 * declared regions. Returns notes.
 */
export function materializeFaces(s: EditSpec, cacheRoot: string): string[] {
  if (!s.canvas || typeof s.canvas !== "object" || !isLandscape(s.canvas) || s.protect_regions?.length || reframeOn(s)) return [];
  const notes: string[] = [];
  const { width: W, height: H } = s.canvas;
  let u: Rect | null = null, samples = 0;
  for (const { r } of canvasFaces(s, cacheRoot, notes)) {
    samples++;
    u = u ? { x: Math.min(u.x, r.x), y: Math.min(u.y, r.y), w: Math.max(u.x + u.w, r.x + r.w) - Math.min(u.x, r.x), h: Math.max(u.y + u.h, r.y + r.h) - Math.min(u.y, r.y) } : r;
  }
  if (u) {
    const pad = 12, x = Math.max(0, u.x - pad), y = Math.max(0, u.y - pad);
    s.protect_regions = [{ label: `rosto medido (track_faces, ${samples} amostras)`, x, y, w: Math.min(W, u.x + u.w + pad) - x, h: Math.min(H, u.y + u.h + pad) - y }];
  }
  return notes;
}

/**
 * Every measured face sample of the full-frame takes, on the canvas and on the timeline (editonny track_faces,
 * cached per source in cacheRoot). Notes get the takes that could not be measured.
 */
function canvasFaces(s: EditSpec, cacheRoot: string, notes: string[]): { t: number; r: Rect }[] {
  const { width: W, height: H } = s.canvas, out: { t: number; r: Rect }[] = [];
  for (const l of fullTakes(s)) {
    if (!existsSync(l.src)) continue;
    const st = statSync(l.src);
    const sig = createHash("sha1").update(JSON.stringify([resolve(l.src), st.size, st.mtimeMs, 1])).digest("hex").slice(0, 16);
    const file = join(cacheRoot, `${sig}.json`);
    let faces: number[][] = [], sw = 0, sh = 0;
    if (existsSync(file)) ({ faces, width: sw, height: sh } = JSON.parse(readFileSync(file, "utf8")));
    else {
      const t = trackFaces(l.src);
      if (!t.ok) { notes.push(`${basename(l.src)}: rosto não medido (${t.reason}); o QA não confere legenda contra o rosto`); continue; }
      faces = t.faces; sw = t.width!; sh = t.height!;
      mkdirSync(cacheRoot, { recursive: true });
      writeFileSync(file, JSON.stringify({ src: l.src, width: sw, height: sh, faces, tool: "editonny track_faces.py (YuNet, 10 Hz)" }));
    }
    const m = coverMap(W, H, sw, sh, { x: l.crop_focus?.x ?? 0.5, y: l.crop_focus?.y ?? 0.5 });
    const a = l.in ?? 0, b = a + l.duration * (l.speed ?? 1);
    for (const f of faces) {
      if (f[0] < a || f[0] > b || !f[5]) continue;
      out.push({ t: l.start + (f[0] - a) / (l.speed ?? 1), r: m.toCanvas({ x: f[1] - f[3] / 2, y: f[2] - f[4] / 2, w: f[3], h: f[4] }) });
    }
  }
  return out;
}

/** 2.4.0: the face samples of a horizontal canvas (no reframe) for the centred caption line; null when none was measured. */
export function faceSamples(s: EditSpec, cacheRoot: string, notes: string[] = []): { t: number; r: Rect }[] | null {
  if (!s.canvas || typeof s.canvas !== "object" || !isLandscape(s.canvas) || reframeOn(s)) return null;
  const f = canvasFaces(s, cacheRoot, notes);
  return f.length ? f : null;
}

// ── QA ───────────────────────────────────────────────────────────────────────────

export interface CanvasCheck { id: string; blocking: boolean; pass: boolean; detail: string; tool: string; info?: boolean }

/** Horizontal canvas: every caption group inside the lower third (measured boxes from the QA). */
export function landscapeChecks(s: EditSpec, groups: { text: string; at: number; box: Rect | null }[]): CanvasCheck[] {
  // 2.4.0: a caption line asked for the centre is checked by captions_center (captions.ts) instead
  if (!isLandscape(s.canvas) || !groups.length || s.captions?.position === "center") return [];
  const H = s.canvas.height, top = Math.round((2 * H) / 3);
  const high = groups.filter((g) => g.box && g.box.y < top);
  return [{ id: "captions_lower_third", blocking: true, pass: high.length === 0,
    detail: high.length ? `${high.length} grupo(s) acima do terço de baixo (y < ${top}px): ${high.slice(0, 4).map((g) => `"${g.text}" y ${g.box!.y}`).join(", ")}`
      : `todos os ${groups.length} grupos no terço de baixo (topo da caixa >= ${top}px de ${H})`,
    tool: "ffmpeg bbox on a text mask" }];
}

/** Soft shadow only: no outline of 3 px or more and no box (the caption_background check applies). */
export const softShadowOnly = (st: TextStyle) => !st.box && (st.outline_px ?? 4) < 3 && (st.shadow_blur ?? 0) > 0;

/**
 * What sits behind each caption group on the source picture (full-frame take, cover fit, no reframe): the
 * mean luma and the share of bright pixels (Y >= 190 on the TV range) of the box, from the source frame at
 * that moment. Where it is bright, the contrast the viewer gets is measured on the render (renderedContrast,
 * WCAG 2 AA 4.5:1). Non-blocking: it says where white text over a soft shadow may be hard to read.
 */
export function captionBackground(s: EditSpec, groups: { text: string; at: number; box: Rect | null }[], video: string, work: string): CanvasCheck[] {
  if (!s.captions || reframeOn(s) || !groups.length) return [];
  const { width: W, height: H } = s.canvas;
  const takes = fullTakes(s);
  const rows: { text: string; at: number; mean: number; bright: number }[] = [];
  for (const g of groups) {
    if (!g.box) continue;
    const l = takes.find((x) => g.at >= x.start && g.at < x.start + x.duration);
    if (!l) continue;
    const pr = probe(l.src);
    const m = coverMap(W, H, pr.width, pr.height, { x: l.crop_focus?.x ?? 0.5, y: l.crop_focus?.y ?? 0.5 });
    const x = Math.max(0, Math.round((g.box.x + m.ox) / m.k)), y = Math.max(0, Math.round((g.box.y + m.oy) / m.k));
    const w = Math.min(pr.width - x, Math.max(2, Math.round(g.box.w / m.k))), h = Math.min(pr.height - y, Math.max(2, Math.round(g.box.h / m.k)));
    const t = (l.in ?? 0) + (g.at - l.start) * (l.speed ?? 1);
    const r = Bun.spawnSync(["ffmpeg", "-v", "error", "-nostdin", "-ss", t.toFixed(3), "-i", l.src, "-frames:v", "1",
      "-vf", `crop=${w}:${h}:${x}:${y},scale=96:24:flags=area,format=gray`, "-f", "rawvideo", "-"], { stdout: "pipe", stderr: "pipe" });
    const px = r.stdout;
    if (r.exitCode !== 0 || !px.length) continue;
    let sum = 0, br = 0;
    for (const v of px) { sum += v; if (v >= 190) br++; }
    rows.push({ text: g.text, at: g.at, mean: sum / px.length, bright: br / px.length });
  }
  if (!rows.length) return [];
  const worst = [...rows].sort((a, b) => b.bright - a.bright || b.mean - a.mean);
  const hard = rows.filter((r) => r.bright > 0.35 || r.mean > 150);
  // on a bright background the shadow is what makes the word readable: measure it on the render itself
  const measured = hard.map((r) => ({ ...r, c: renderedContrast(s, video, r.at, groups.find((g) => g.at === r.at && g.text === r.text)!.box!, work) }));
  const low = measured.filter((m) => m.c !== null && m.c.ratio < WCAG_AA);
  const minC = measured.filter((m) => m.c).sort((a, b) => a.c!.ratio - b.c!.ratio)[0];
  return [{ id: "caption_background", blocking: false, pass: low.length === 0 && measured.every((m) => m.c !== null),
    detail: (hard.length ? `${hard.length} de ${rows.length} palavra(s) sobre fundo claro na fonte` : `${rows.length} palavras medidas, nenhuma sobre fundo claro`) +
      `; fundo mais claro: ${worst.slice(0, 3).map((r) => `"${r.text}" ${r.at.toFixed(1)} s luma ${Math.round(r.mean)}, ${Math.round(r.bright * 100)}% claro`).join("; ")}` +
      (minC ? `; contraste medido no vídeo entre a letra e os 5 px em volta: mínimo ${minC.c!.ratio.toFixed(1)}:1 ("${minC.text}" ${minC.at.toFixed(1)} s, entorno luma ${Math.round(minC.c!.ring)}; WCAG 2 AA pede ${WCAG_AA}:1)` : "") +
      (low.length ? `; abaixo de ${WCAG_AA}:1: ${low.slice(0, 4).map((m) => `"${m.text}" ${m.c!.ratio.toFixed(1)}:1`).join(", ")}` : ""),
    tool: "ffmpeg crop on the source frame under each measured caption box; on bright ones, the rendered frame against the caption mask (WCAG 2 contrast ratio)" }];
}

const WCAG_AA = 4.5;
const lin = (y: number) => { const v = Math.min(1, Math.max(0, (y - 16) / 219)); return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

/**
 * Contrast of a caption as rendered: the text pixels of the caption mask (the same .ass in white, no shadow)
 * against the ring of 5 px around them, both read on the rendered frame (luma, TV range), as a WCAG 2
 * contrast ratio. null when it cannot be measured.
 */
function renderedContrast(s: EditSpec, video: string, at: number, box: Rect, work: string): { ratio: number; ring: number; text: number } | null {
  const { width: W, height: H } = s.canvas, pad = 8;
  // even position and size: a crop of a yuv420p frame is rounded to even, which would misalign the two reads
  const ev = (n: number) => Math.floor(n / 2) * 2;
  const x = ev(Math.max(0, box.x - pad)), y = ev(Math.max(0, box.y - pad)), w = ev(Math.min(W - x, box.w + 2 * pad + 1)), h = ev(Math.min(H - y, box.h + 2 * pad + 1));
  const gray = (args: string[], cwd?: string) => { const r = Bun.spawnSync(["ffmpeg", "-v", "error", "-nostdin", ...args, "-frames:v", "1", "-f", "rawvideo", "-"], { cwd, stdout: "pipe", stderr: "pipe" }); return r.exitCode === 0 ? r.stdout : null; };
  // 2.4.0: both reads on the same video frame (the mask used to run at 25 fps, so a word shorter than a frame could be
  // read against the next word's mask); the seek lands a quarter frame before the frame, which ffmpeg then returns
  const fps = s.canvas.fps || 30, t0 = Math.round(at * fps) / fps - 0.25 / fps;
  const fin = gray(["-ss", t0.toFixed(4), "-i", video, "-vf", `crop=${w}:${h}:${x}:${y},format=gray`]);
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "mask-contrast.ass"), buildAss(s, { mask: true, only: "captions" }), "utf8");
  const mask = gray(["-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=${fps}:d=${(at + 0.2).toFixed(2)}`,
    "-vf", `ass=mask-contrast.ass:fontsdir=${fontsDirFor(work, s)},trim=start=${t0.toFixed(4)},setpts=PTS-STARTPTS,crop=${w}:${h}:${x}:${y},format=gray`], work);
  if (!fin || !mask || fin.length !== w * h || mask.length !== w * h) return null;
  const R = 5;
  let ts = 0, tn = 0, rs = 0, rn = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const m = mask[j * w + i];
    if (m >= 180) { ts += fin[j * w + i]; tn++; continue; }
    if (m >= 60) continue;
    let near = false;
    for (let dj = -R; dj <= R && !near; dj++) for (let di = -R; di <= R; di++) {
      const jj = j + dj, ii = i + di;
      if (jj >= 0 && jj < h && ii >= 0 && ii < w && mask[jj * w + ii] >= 180) { near = true; break; }
    }
    if (near) { rs += fin[j * w + i]; rn++; }
  }
  if (!tn || !rn) return null;
  const Lt = lin(ts / tn), Lr = lin(rs / rn);
  return { ratio: (Math.max(Lt, Lr) + 0.05) / (Math.min(Lt, Lr) + 0.05), ring: rs / rn, text: ts / tn };
}

/** Scene cuts found by ffmpeg scdet in a file or a window of it (seconds from the window start). */
export function sceneCuts(file: string, from = 0, dur?: number, threshold = 10): number[] {
  const r = run(["ffmpeg", "-hide_banner", "-nostdin", ...(from ? ["-ss", from.toFixed(3)] : []), ...(dur ? ["-t", dur.toFixed(3)] : []), "-i", file,
    "-map", "0:v:0", "-vf", `scdet=threshold=${threshold}`, "-f", "null", "-"]);
  return [...r.err.matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)].map((m) => Math.round(Number(m[1]) * 1000) / 1000);
}

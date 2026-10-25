// Automatic B-roll (EditAi 2.1.0, wave 1 of the editonny fusion). Bun only.
//
//   bun lib/edit-engine/cli.ts broll-suggest <spec.json> [--project DIR] [--out F]   moments -> spec.broll.items
//   bun lib/edit-engine/cli.ts broll-render  <spec.json> [--project DIR]             cards -> alpha .mov in the project cache
//
// Where a B-roll item comes from, in this order (BROLL.md §6.1):
//   1. the person's own media in <project>/editai/broll/, matched by a spoken word (file name, or the
//      optional broll.json tags: [{"arquivo": "forno.mp4", "palavras": ["forno", "pizza"]}]);
//   2. an animated card of the installed editonny 1.0.0: suggest_visuals.py finds the moment in the
//      words (PT-first detectors), render_visuals.py draws it as a QuickTime Animation clip with alpha.
//      Points marked in the mini editor ("põe um card aqui") go to suggest_visuals as preview marks,
//      which it always keeps.
// Placement rules (§6.3): nothing in the first 3 s nor the last 2.5 s, at most one item every 6 s,
// never over eyes and mouth (face_layout.py when editonny is present, protect_regions otherwise),
// never over the fixed headline, and the captions either stay clear, move up above the card, or hide
// while a card writes the same words. Values on a card come from the speech, never from a template
// example (suggest_visuals drops a moment it cannot read a value for).
// Without editonny: broll-suggest exits 3, the client media still matches and the video renders.
//
// The editonny helpers run as subprocesses (editonny.ts); nothing is copied from them and nothing is
// written into their install. Card clips are cached in <project>/editai/cache/broll/<key>/.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { editonnyStatus, runHelper, type EditonnyStatus } from "./editonny.ts";
import { zoomAt } from "./ffmpeg.ts";
import { pickSfx } from "./library.ts";
import { intersect, measureTextBox } from "./measure.ts";
import { measureTime, unsafeRects } from "./safezones.ts";
import { captionGroups, captionSpans, widestMoment } from "./ass.ts";
import type { EditSpec, MediaLayer, Rect, Sfx } from "./spec.ts";

// ── the contract in the spec (BROLL.md §6.2) ────────────────────────────────────

export type BrollMode = "auto" | "manual" | "off";
export interface BrollProvenance { source: string; license?: string; file?: string; credits_file?: string; [k: string]: unknown }
/** A rendered card: the alpha clip, where it sits on the canvas and the drawn pixels (ink). */
export interface BrollClip { file: string; key: string; x: number; y: number; w: number; h: number; ink: [number, number, number, number] | null; frames: number; fps: number; sfx: { frame: number; name: string; volume?: number }[] }
export interface BrollItem {
  id: string;
  kind: "card" | "insert";
  template?: string;                 // card: editonny template id (render_visuals.py --list)
  params?: Record<string, unknown>;  // card: values read from the speech
  rect?: Rect;                       // card: region given to the renderer; insert pip: the window
  src?: string;                      // insert: the person's own file
  media?: "image" | "video";
  layout?: "full" | "pip";           // insert: full-frame cutaway (default) or a window
  in?: number;                       // insert video: source second it starts from
  start: number;
  end: number;
  captions?: "keep" | "move_up" | "hide";
  caption_y?: number;                // move_up: caption centre while the item is on screen
  sfx?: Sfx[];
  quote: string;                     // the spoken words it illustrates (checked against the transcript)
  provenance: BrollProvenance;
  clip?: BrollClip;
  marked?: boolean;                  // asked for in the mini editor ("põe um card aqui")
  explicit?: boolean;                // asked for explicitly: may sit in the hook or CTA window
  note?: string;
}
export interface BrollMark { at: number; note?: string; resolved?: string }
export interface BrollFace { start: number; end: number; rect: Rect; source: string }
export interface BrollSkip { at: number; what: string; why: string }
export interface BrollSpec {
  mode: BrollMode;
  min_gap_s?: number;                // default 6
  hook_free_s?: number;              // default 3
  cta_free_s?: number;               // default 2.5
  max_items?: number;                // default 6
  project?: string;                  // the project folder the media and the cache belong to
  items: BrollItem[];
  marks?: BrollMark[];
  faces?: BrollFace[];               // written by broll-suggest: eyes-to-lip box per stretch, canvas px at zoom 1
  skipped?: BrollSkip[];
  notes?: string[];
  editonny?: string;                 // "editonny 1.0.0" when cards were made, else why not
  lang?: "pt" | "en";                // speech language for the fixed card words (default: detected from the words)
  render_cost?: { with_s: number; without_s: number; measured_by: string };
}

export const BROLL_DEFAULTS = { min_gap_s: 6, hook_free_s: 3, cta_free_s: 2.5, max_items: 6 } as const;
const LEAD = 0.25;          // an insert enters this long before the word it shows (suggest_visuals LEAD)
const INSERT_MIN = 1.5, INSERT_MAX = 3;
const MARGIN = 24;          // px kept between a card and a face, the headline or the captions
const SAFE_TOP = 230, SAFE_BOTTOM = 1520;   // editonny REGIONS (top_band top, bottom region end) on 1080x1920

/** Vertical band a card may use: editonny's regions, narrowed by the top and bottom bars of every target platform. */
function safeBand(spec: EditSpec): { top: number; bottom: number } {
  const { width: W, height: H } = spec.canvas;
  let top = SAFE_TOP, bottom = SAFE_BOTTOM;
  for (const p of spec.platforms ?? []) for (const r of unsafeRects(p, W, H)) {
    if (r.w < W * 0.9) continue;                       // side rails are kept clear by the card width
    if (r.y <= 0) top = Math.max(top, r.y + r.h + MARGIN);
    else if (r.y + r.h >= H - 1) bottom = Math.min(bottom, r.y - MARGIN);
  }
  return { top, bottom };
}
const CARD_X = 140, CARD_W = 800;
const REGIONS: Record<string, Rect> = { center: { x: 140, y: 640, w: 800, h: 640 }, bottom: { x: 140, y: 1000, w: 800, h: 520 } };
const DEFAULT_REGION: Record<string, "center" | "bottom"> = { counter: "center", stamp: "center", guarantee_badge: "center" };
const MIN_H: Record<string, number> = { impact_word: 200, stamp: 240, counter: 240, price_tag: 260, progress_bar: 240, guarantee_badge: 280,
  comment_cta: 240, notification: 240, checklist: 340, steps: 280, strikeout: 340, bar_chart: 380, line_chart: 380 };
/** Cards that write the spoken words themselves: the caption may hide while they are on screen (editonny hidesCaptions). */
const WRITES_WORDS = new Set(["impact_word", "checklist", "steps", "strikeout", "stamp"]);
/** editonny sound cue -> category or role of the squad's CC0 library (one sound per card). */
const SFX_MAP: Record<string, string> = { pop: "pop-ui", tick: "click", count: "click", success: "correct", keyboard: "typing", mouse_click: "click",
  metal_hit: "hit", bass_drop: "hit", cash: "cash-register", whoosh: "whoosh", notification: "notification" };
const PRIORITY: Record<string, number> = { comment_cta: 100, price_tag: 90, strikeout: 80, checklist: 70, steps: 65, progress_bar: 50, counter: 40, stamp: 75, guarantee_badge: 78, impact_word: 55 };
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]), VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
export const brollOn = (s: EditSpec) => !!s.broll && s.broll.mode !== "off";
const opt = (b: BrollSpec) => ({ gap: b.min_gap_s ?? BROLL_DEFAULTS.min_gap_s, hook: b.hook_free_s ?? BROLL_DEFAULTS.hook_free_s, cta: b.cta_free_s ?? BROLL_DEFAULTS.cta_free_s, max: b.max_items ?? BROLL_DEFAULTS.max_items });

// ── words ───────────────────────────────────────────────────────────────────

const STOP = new Set(("a o as os um uma uns umas de do da dos das e ou que em no na nos nas para pra por com sem se eu voce ele ela isso esse essa este esta " +
  "aqui ali mais menos muito ja nao sim the an of to in on and or for with at by is are was it this that you your my me we our be so just then not but " +
  "do does did have has had from as if all can will").split(" "));
/** Lower case, no accents, letters and digits only. */
export const normWord = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const stem = (w: string) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
type W = { word: string; start: number; end: number };

/** Words with start in [a, b], in order. */
const wordsIn = (words: W[], a: number, b: number) => words.filter((w) => w.start >= a - 1e-6 && w.start <= b + 1e-6);

/** True when the normalised `quote` is a contiguous run of the words that start in [start - 0.5, end]. */
export function quoteInWords(quote: string, words: W[], start: number, end: number): boolean {
  const q = quote.split(/\s+/).map(normWord).filter(Boolean);
  if (!q.length) return false;
  const win = wordsIn(words, start - 0.5, end).map((w) => normWord(w.word)).filter(Boolean);
  for (let i = 0; i + q.length <= win.length; i++) if (q.every((x, j) => win[i + j] === x)) return true;
  return false;
}

/** End of the sentence a word belongs to (a pause of 0.7 s or . ! ? closes it). */
function sentenceEnd(words: W[], i: number): number {
  for (let k = i; k < words.length; k++) {
    const nx = words[k + 1];
    if (!nx || /[.!?]$/.test(words[k].word) || nx.start - words[k].end > 0.7) return words[k].end;
  }
  return words[words.length - 1].end;
}

// ── the person's media folder ───────────────────────────────────────────────────

export interface MediaFile { file: string; media: "image" | "video"; tags: string[][]; from: string }

/** Top-level files of <folder> with their spoken-word tags (broll.json first, the file name too). */
export function scanMedia(folder: string): { files: MediaFile[]; notes: string[] } {
  const notes: string[] = [];
  if (!existsSync(folder)) return { files: [], notes: [`pasta de mídia ${folder} não existe: só cards`] };
  const tagsOf = new Map<string, string[]>();
  const tf = join(folder, "broll.json");
  if (existsSync(tf)) {
    try {
      const j = JSON.parse(readFileSync(tf, "utf8"));
      const list: any[] = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : j?.arquivo || j?.file ? [j]
        : Object.entries(j ?? {}).map(([k, v]) => ({ arquivo: k, palavras: v }));
      for (const e of list) {
        const f = String(e?.arquivo ?? e?.file ?? "").trim(), ws = e?.palavras ?? e?.words;
        if (f && Array.isArray(ws)) tagsOf.set(f.toLowerCase(), ws.map(String));
      }
    } catch (e) { notes.push(`broll.json ilegível (${(e as Error).message}); valem só os nomes dos arquivos`); }
  }
  const files: MediaFile[] = [];
  for (const name of readdirSync(folder).sort()) {
    const p = join(folder, name), ext = extname(name).toLowerCase();
    if (name.startsWith(".") || !statSync(p).isFile()) continue;
    const media = IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
    if (!media) continue;
    const fromName = basename(name, extname(name)).split(/[^\p{L}\p{N}]+/u).map(normWord).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w));
    const given = tagsOf.get(name.toLowerCase()) ?? [];
    const tags = [...given.map((t) => t.split(/\s+/).map(normWord).filter(Boolean)), ...fromName.map((w) => [w])].filter((t) => t.length && !(t.length === 1 && STOP.has(t[0])));
    const seen = new Set<string>();
    files.push({ file: p, media, tags: tags.filter((t) => { const k = t.join(" "); if (seen.has(k)) return false; seen.add(k); return true; }), from: given.length ? "broll.json + nome do arquivo" : "nome do arquivo" });
  }
  return { files, notes };
}

interface Cand { item: BrollItem; rank: number }

/** Each media file: the first spoken occurrence of one of its tags that leaves 1.5 to 3 s inside the allowed window. */
function mediaCandidates(files: MediaFile[], words: W[], D: number, fps: number, o: ReturnType<typeof opt>, skipped: BrollSkip[]): Cand[] {
  const out: Cand[] = [];
  const nw = words.map((w) => stem(normWord(w.word)));
  const snap = (t: number) => r3(Math.round(t * fps) / fps);
  for (const f of files) {
    let found: BrollItem | null = null, why = "nenhuma palavra dita bate com o nome ou as etiquetas";
    for (let i = 0; i < words.length && !found; i++) {
      for (const tag of f.tags) {
        const st = tag.map(stem);
        if (!st.every((t, j) => nw[i + j] === t)) continue;
        const w0 = words[i], wl = words[i + tag.length - 1];
        if (w0.start < o.hook) { why = `"${w0.word}" é dito em ${fmtT(w0.start)}, dentro do gancho (0 a ${o.hook} s)`; continue; }
        const start = snap(Math.max(o.hook, w0.start - LEAD));
        const limit = D - o.cta;
        const end = snap(Math.min(start + INSERT_MAX, Math.max(start + INSERT_MIN, sentenceEnd(words, i + tag.length - 1) + 0.4), limit));
        if (end - start < INSERT_MIN - 1e-6) { why = `"${w0.word}" em ${fmtT(w0.start)} não deixa ${INSERT_MIN} s antes do CTA`; continue; }
        const quote = words.slice(i, i + tag.length).map((w) => w.word.replace(/[.,!?;:…]+$/u, "")).join(" ");
        found = {
          id: "", kind: "insert", src: f.file, media: f.media, layout: "full", in: 0, start, end, captions: "keep", quote,
          sfx: [{ src: "@sfx:whoosh", at: start, gain_db: -26, hook: "whoosh", anchor: true, only_with_music: true }],
          provenance: { source: "pasta do cliente", file: basename(f.file), matched_by: f.from },
          note: `"${wl.word}" dito em ${fmtT(w0.start)}`,
        };
        break;
      }
    }
    if (found) out.push({ item: found, rank: 500 });
    else skipped.push({ at: 0, what: basename(f.file), why });
  }
  return out;
}

// ── faces ───────────────────────────────────────────────────────────────────

/** Where a source-frame rectangle (fractions) lands on the canvas for a take (cover or contain, crop_focus). */
function sourceToCanvas(l: MediaLayer, sw: number, sh: number, W: number, H: number, f: { x0: number; y0: number; x1: number; y1: number }): Rect {
  const s = l.fit === "contain" ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
  const ox = (sw * s - W) * (l.crop_focus?.x ?? 0.5), oy = (sh * s - H) * (l.crop_focus?.y ?? 0.5);
  const x0 = f.x0 * sw * s - ox, y0 = f.y0 * sh * s - oy, x1 = f.x1 * sw * s - ox, y1 = f.y1 * sh * s - oy;
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

const union = (a: Rect | null, b: Rect): Rect => (a ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) } : { ...b });

/**
 * Eyes-to-lip box of the speaker per take, on the canvas at zoom 1: face_layout.py (YuNet) on each source
 * clip, cached in <cache>/faces/; the stretches of the clip that a take shows. Falls back to the spec's
 * protect_regions when editonny is absent or finds no face.
 */
export function computeFaces(spec: EditSpec, st: EditonnyStatus, cacheRoot: string, notes: string[]): BrollFace[] {
  const { width: W, height: H } = spec.canvas;
  const out: BrollFace[] = [];
  const takes = spec.layers.filter((l) => l.kind === "video" && !l.rect && !l.broll);
  if (st.usable && st.helpers.face_layout) {
    const layouts = new Map<string, any>();
    for (const src of new Set(takes.map((l) => l.src))) {
      const s = statSync(src);
      const dir = join(cacheRoot, "faces", sha1(`${resolve(src)}|${s.size}|${s.mtimeMs}`).slice(0, 16));
      mkdirSync(dir, { recursive: true });
      const r = runHelper(st, "face_layout", ["--edit-dir", dir, "--video", src], dir);
      const f = join(dir, "face_layout.json");
      if (r.code === 0 && existsSync(f)) layouts.set(src, JSON.parse(readFileSync(f, "utf8")));
      else notes.push(`face_layout.py falhou em ${basename(src)} (saída ${r.code}): ${r.stderr.trim().split("\n").pop() ?? ""}`);
    }
    for (const l of takes) {
      const lay = layouts.get(l.src);
      if (!lay) continue;
      const a = l.in ?? 0, b = a + l.duration * (l.speed ?? 1);
      let rect: Rect | null = null;
      for (const sg of lay.segments ?? []) {
        if (!sg.core || sg.end <= a || sg.start >= b) continue;
        rect = union(rect, sourceToCanvas(l, lay.width, lay.height, W, H, sg.core));
      }
      if (rect) {
        out.push({ start: r3(l.start), end: r3(l.start + l.duration), rect, source: "editonny face_layout.py (YuNet), olhos ao lábio" });
        if (rect.x < 0 || rect.x + rect.w > W) notes.push(`rosto parcialmente fora do quadro no take ${l.id} (corte central de uma fonte fora de 9:16; o reenquadramento pelo rosto é da onda 5)`);
      }
    }
  }
  if (!out.length && spec.protect_regions?.length) {
    let rect: Rect | null = null;
    for (const p of spec.protect_regions) rect = union(rect, p);
    out.push({ start: 0, end: r3(spec.duration), rect: rect!, source: "protect_regions do spec" });
  }
  return out;
}

// ── geometry ────────────────────────────────────────────────────────────────

/** Distinct zooms of the camera between two seconds (same as the QA). */
export function zoomsDuring(spec: EditSpec, s: number, e: number): number[] {
  if (!spec.camera?.length) return [1];
  const fps = spec.canvas.fps, set = new Set<number>();
  for (let n = Math.round(s * fps); n < Math.max(Math.round(e * fps), Math.round(s * fps) + 1); n++) set.add(Number(zoomAt(spec.camera, fps, n).toFixed(3)));
  return [...set].sort((a, b) => b - a);
}

/** A rectangle declared at zoom 1, on the output at zoom z (zoompan window clamped to the frame). */
export function zoomRect(spec: EditSpec, r: Rect, z: number): Rect {
  const { width: W, height: H } = spec.canvas;
  const fx = spec.camera_focus?.x ?? 0.5, fy = spec.camera_focus?.y ?? 0.5;
  const ww = W / z, wh = H / z;
  const x0 = Math.min(Math.max(fx * W - ww / 2, 0), W - ww), y0 = Math.min(Math.max(fy * H - wh / 2, 0), H - wh);
  return { x: Math.round((r.x - x0) * z), y: Math.round((r.y - y0) * z), w: Math.round(r.w * z), h: Math.round(r.h * z) };
}

/** Face and protect rectangles over [s, e], each at every zoom the camera reaches then. */
export function protectedDuring(spec: EditSpec, s: number, e: number): { rect: Rect; label: string }[] {
  const out: { rect: Rect; label: string }[] = [];
  const zs = zoomsDuring(spec, s, e);
  for (const f of spec.broll?.faces ?? []) if (f.start < e && f.end > s) for (const z of zs) out.push({ rect: zoomRect(spec, f.rect, z), label: `rosto (${f.source}) a zoom ${z.toFixed(3)}` });
  for (const p of spec.protect_regions ?? []) for (const z of zs) out.push({ rect: zoomRect(spec, p, z), label: `${p.label} a zoom ${z.toFixed(3)}` });
  return out;
}

interface Band { y0: number; y1: number }
function freeBands(blocked: Band[], top: number, bottom: number): Band[] {
  const bs = blocked.map((b) => ({ y0: Math.max(top, b.y0), y1: Math.min(bottom, b.y1) })).filter((b) => b.y1 > b.y0).sort((a, b) => a.y0 - b.y0);
  const out: Band[] = [];
  let y = top;
  for (const b of bs) { if (b.y0 > y) out.push({ y0: y, y1: b.y0 }); y = Math.max(y, b.y1); }
  if (bottom > y) out.push({ y0: y, y1: bottom });
  return out;
}

interface Geo { headline: { band: Band; start: number; end: number } | null; caption: Band | null; capH: number }

/** Measured headline and caption bands (ffmpeg bbox on the text masks), shared by every card of the spec. */
function measureGeo(spec: EditSpec, work: string): Geo {
  mkdirSync(work, { recursive: true });
  const hook = spec.texts.find((t) => t.role === "hook");
  let headline: Geo["headline"] = null;
  if (hook) {
    const b = measureTextBox(spec, hook.id, measureTime(hook), work);
    if (b) headline = { band: { y0: b.y - MARGIN, y1: b.y + b.h + MARGIN }, start: hook.start, end: hook.end };
  }
  let caption: Band | null = null, capH = 0;
  if (spec.captions?.words.length) {
    const gs = captionGroups(spec.captions);
    const g = gs.reduce((a, b) => (b.map((w) => w.word).join(" ").length > a.map((w) => w.word).join(" ").length ? b : a), gs[0]);
    const b = measureTextBox(spec, "captions", widestMoment(g), work);
    if (b) { caption = { y0: b.y - MARGIN, y1: b.y + b.h + MARGIN }; capH = b.h; }
  }
  return { headline, caption, capH };
}

const captionsDuring = (spec: EditSpec, s: number, e: number) => (spec.captions?.words ?? []).some((w) => w.end > s && w.start < e + 0.25);

/**
 * Region, caption decision and caption y for one card, or why it cannot be placed. Before the first render the card
 * height is a per-template estimate; after it, need = the drawn height (ink) and width, and the region is re-chosen
 * so the ink lands in a free band (fitCard). The card is centred in its region by the editonny templates.
 */
function placeCard(spec: EditSpec, it: BrollItem, geo: Geo, need?: { h: number; w: number }): { rect: Rect; captions: "keep" | "move_up" | "hide"; caption_y?: number } | { fail: string } {
  const tpl = it.template ?? "";
  const W = spec.canvas.width;
  const cw = need?.w ?? CARD_W, cx = Math.round((W - cw) / 2);
  const minH = need ? need.h + 4 : MIN_H[tpl] ?? 260;
  const def = REGIONS[DEFAULT_REGION[tpl] ?? "bottom"], maxH = Math.max(def.h, minH);
  const prot = protectedDuring(spec, it.start, it.end);
  if (!prot.length) return { fail: "rosto não medido (sem editonny e sem protect_regions no spec)" };
  const sb = safeBand(spec);
  const faceBands = prot.map((p) => ({ y0: p.rect.y - MARGIN, y1: p.rect.y + p.rect.h + MARGIN }));
  const head = geo.headline && geo.headline.start < it.end && geo.headline.end > it.start ? [geo.headline.band] : [];
  const cap = geo.caption && captionsDuring(spec, it.start, it.end) ? [geo.caption] : [];
  const tryPlace = (blocked: Band[]): Rect | null => {
    const bands = freeBands(blocked, sb.top, sb.bottom);
    if (!need && bands.some((b) => def.y >= b.y0 && def.y + def.h <= b.y1)) return { ...def };
    const best = bands.filter((b) => b.y1 - b.y0 >= minH).sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0];
    if (!best) return null;
    const h = Math.min(maxH, best.y1 - best.y0);
    return { x: cx, y: Math.round(best.y0 + (best.y1 - best.y0 - h) / 2), w: cw, h: Math.round(h) };
  };
  // a card that writes the spoken words takes the caption's place while it is on screen (editonny hidesCaptions)
  if (WRITES_WORDS.has(tpl) && cap.length) {
    const r = tryPlace([...faceBands, ...head]);
    return r ? { rect: r, captions: "hide" } : { fail: "sem faixa livre que não cubra olhos e boca ou a headline" };
  }
  const all = tryPlace([...faceBands, ...head, ...cap]);
  if (all) return { rect: all, captions: "keep" };
  if (!cap.length) return { fail: "sem faixa livre entre o rosto e a headline" };
  // the card goes low and the caption rises to just above it, if that still clears the mouth
  const lowest = Math.max(...faceBands.map((f) => f.y1));
  const band = freeBands([...faceBands, ...head], sb.top, sb.bottom).filter((x) => x.y0 >= lowest - 1).sort((x, y) => (y.y1 - y.y0) - (x.y1 - x.y0))[0];
  if (band) {
    const h = Math.min(maxH, band.y1 - band.y0 - geo.capH - 2 * MARGIN);
    if (h >= minH) {
      const rect = { x: cx, y: Math.round(band.y1 - h), w: cw, h: Math.round(h) };
      const capY = Math.round(rect.y - MARGIN - geo.capH / 2);
      if (capY - geo.capH / 2 >= band.y0) return { rect, captions: "move_up", caption_y: capY };
    }
  }
  // last resort (EditAi decision, not in BROLL.md §6.3): the card shows the number that was just said, so the
  // caption gives it the stretch, as for a card that writes the same words, instead of the card being dropped
  const low = tryPlace([...faceBands, ...head]);
  if (low) return { rect: low, captions: "hide" };
  return { fail: "sem lugar que não cubra olhos e boca, a headline ou a legenda" };
}

/** What the drawn card (ink) still hits after a render: a face, the headline, the captions, a platform bar; null = clear. */
function inkProblem(spec: EditSpec, it: BrollItem, geo: Geo): string | null {
  const r = inkOf(it);
  if (!r) return "card sem retângulo medido";
  const hit = protectedDuring(spec, it.start, it.end).find((p) => intersect(r, p.rect));
  if (hit) return `cobre ${hit.label}`;
  const band = (b: Band) => ({ x: 0, y: b.y0 + MARGIN, w: spec.canvas.width, h: b.y1 - b.y0 - 2 * MARGIN });
  if (geo.headline && geo.headline.start < it.end && geo.headline.end > it.start && intersect(r, band(geo.headline.band))) return "cruza a headline";
  if (geo.caption && captionsDuring(spec, it.start, it.end)) {
    if ((it.captions ?? "keep") === "keep" && intersect(r, band(geo.caption))) return "cruza a legenda";
    if (it.captions === "move_up" && it.caption_y && intersect(r, { x: 0, y: it.caption_y - geo.capH / 2, w: spec.canvas.width, h: geo.capH })) return "cruza a legenda que subiu";
  }
  for (const p of spec.platforms ?? []) for (const z of unsafeRects(p, spec.canvas.width, spec.canvas.height)) if (intersect(r, z)) return `sai da área segura (${z.label}, ${p})`;
  return null;
}

/**
 * Draws a card and checks where its ink really landed (the templates size some cards by their own font, not by the
 * region): when it hits something, the region is re-chosen with the measured height, then a narrower card is tried.
 * Returns null when the card is clear, else why it stays out.
 */
function fitCard(spec: EditSpec, it: BrollItem, st: EditonnyStatus, cacheRoot: string, geo: Geo): string | null {
  let problem: string | null = null;
  const W = spec.canvas.width;
  it.rect ??= { ...REGIONS.bottom };
  for (const w of [...new Set([it.rect.w, 640, 520])]) {
    // a narrower region makes the template choose a smaller font, so a shorter card
    if (it.rect.w !== w) it.rect = { ...it.rect, x: Math.round((W - w) / 2), w };
    for (let k = 0; k < 2; k++) {
      it.clip = renderCard(spec, it, st, cacheRoot);
      problem = inkProblem(spec, it, geo);
      if (!problem) return null;
      const p = placeCard(spec, it, geo, { h: inkOf(it)!.h, w });
      if ("fail" in p) break;
      const same = p.rect.x === it.rect.x && p.rect.y === it.rect.y && p.rect.w === it.rect.w && p.rect.h === it.rect.h && p.captions === it.captions;
      it.rect = p.rect; it.captions = p.captions;
      if (p.caption_y) it.caption_y = p.caption_y; else delete it.caption_y;
      if (same) break;
    }
  }
  delete it.clip;
  return problem;
}

// ── choosing ────────────────────────────────────────────────────────────────

/** Greedy pick in rank order: allowed window, gap between starts, no overlap, at most `max` items. */
function choose(cands: Cand[], D: number, o: ReturnType<typeof opt>, keep: BrollItem[], skipped: BrollSkip[]): BrollItem[] {
  const picked: BrollItem[] = [...keep];
  for (const c of [...cands].sort((a, b) => b.rank - a.rank || a.item.start - b.item.start)) {
    const it = c.item, what = it.kind === "card" ? `card ${it.template}` : `mídia ${basename(it.src ?? "")}`;
    if (!it.explicit && (it.start < o.hook - 1e-6 || it.end > D - o.cta + 1e-6)) { skipped.push({ at: it.start, what, why: `fora da janela livre (${o.hook} s de gancho, ${o.cta} s de CTA)` }); continue; }
    const clash = [...picked].sort((x, y) => Math.abs(x.start - it.start) - Math.abs(y.start - it.start)).find((p) => (it.marked ? false : Math.abs(p.start - it.start) < o.gap - 1e-6) || (p.start < it.end + 0.3 && it.start < p.end + 0.3));
    if (clash) { skipped.push({ at: it.start, what, why: `perto demais de ${clash.kind === "card" ? `um card (${clash.template})` : `uma mídia do cliente (${basename(clash.src ?? "")})`} em ${fmtT(clash.start)}: no máximo um item a cada ${o.gap} s` }); continue; }
    if (picked.length >= o.max) { skipped.push({ at: it.start, what, why: `limite de ${o.max} itens (o alvo é de 4 a 6 num vídeo de 45 a 60 s)` }); continue; }
    picked.push(it);
  }
  return picked.sort((a, b) => a.start - b.start);
}

// ── editonny: moments and cards ─────────────────────────────────────────────────

/** suggest_visuals.py on the spec's words (the edit folder is <project>/editai/broll/<id>/edit/). */
function suggestCards(spec: EditSpec, st: EditonnyStatus, project: string, o: ReturnType<typeof opt>, marks: BrollMark[], notes: string[], skipped: BrollSkip[]): Cand[] {
  const words = spec.captions!.words;
  const lang = spec.broll?.lang ?? speechLang(words);
  const edit = join(project, "editai", "broll", spec.id, "edit");
  mkdirSync(join(edit, "transcripts"), { recursive: true });
  writeFileSync(join(edit, "transcripts", "cut.json"), JSON.stringify({ words: words.map((w) => ({ text: w.word, start: w.start, end: w.end })) }, null, 1));
  writeFileSync(join(edit, "cut_timeline.json"), JSON.stringify({ duration: spec.duration }));
  writeFileSync(join(edit, "edit_data.json"), JSON.stringify({ hook: { start: 0, end: o.hook }, cta: { start: r3(spec.duration - o.cta), duration: o.cta } }, null, 1));
  writeFileSync(join(edit, "preview_marks.json"), JSON.stringify({ marks: marks.map((m) => ({ in: m.at, kind: "motion", note: m.note ?? "" })) }, null, 1));
  const r = runHelper(st, "suggest_visuals", ["--edit-dir", edit, "--json", "--interval", String(o.gap)], edit);
  if (r.code !== 0 || !r.json) { notes.push(`suggest_visuals.py saiu com ${r.code}: ${r.stderr.trim().split("\n").pop() ?? ""}`); return []; }
  for (const s of r.json.skipped ?? []) skipped.push({ at: Number(s.time) || 0, what: `card ${s.template}`, why: `editonny: ${s.why} ("${String(s.quote ?? "").slice(0, 60)}")` });
  for (const n of r.json.notes ?? []) notes.push(`editonny: ${n}`);
  const out: Cand[] = [];
  for (const m of r.json.motion ?? []) {
    const marked = /marcado no preview/.test(String(m.note ?? ""));
    const said = String(m.note ?? "").match(/"(.+?)"/)?.[1] ?? "";
    const it: BrollItem = {
      id: "", kind: "card", template: m.template, params: localizeParams(m.template, m.params ?? {}, lang), start: r3(m.start), end: r3(m.end), quote: quoteFor(said, words, m.start, m.end),
      provenance: { source: `editonny ${st.version ?? "?"} suggest_visuals + render_visuals`, license: "MIT (código do editonny, Copyright (c) 2026 Matheus Gomes)" },
      note: String(m.note ?? ""), ...(marked ? { marked: true } : {}),
    };
    if (it.template === "impact_word") keepNegation(it, words, notes);
    out.push({ item: it, rank: marked ? 1000 : (PRIORITY[m.template] ?? 50) });
  }
  return out;
}

const NEGATION = new Set(["not", "no", "never", "dont", "doesnt", "isnt", "arent", "wont", "cant", "nao", "nem", "nunca", "sem", "jamais", "nada"]);

/**
 * An impact word built from the words after a negation would say the opposite ("Not a workout" -> "WORKOUT"). When a
 * negation is spoken in the 3 words before the card text, the card keeps the words from the negation on, as spoken
 * (matrix 12.1: check negations before the scene).
 */
function keepNegation(it: BrollItem, words: W[], notes: string[]): void {
  const text = String(it.params?.text ?? "");
  const first = normWord(text.replace(/\*/g, "").split(/\s+/)[0] ?? "");
  if (!first) return;
  const i = words.findIndex((w) => w.start >= it.start - 0.05 && normWord(w.word) === first);
  if (i < 0) return;
  for (let k = Math.max(0, i - 3); k < i; k++) {
    if (!NEGATION.has(normWord(words[k].word))) continue;
    if (/[.!?]$/.test(words.slice(k, i).map((w) => w.word).join(" "))) return;   // another sentence
    const spoken = words.slice(k, i).map((w) => w.word.replace(/[.,!?;:…]+$/u, "").toUpperCase()).join(" ");
    it.params = { ...it.params, text: `${spoken} ${text}`.slice(0, 32) };
    it.start = r3(Math.max(0, Math.min(it.start, words[k].start - 0.25)));
    notes.push(`card ${it.template}: a negação dita ("${words[k].word}") entrou no texto do card`);
    return;
  }
}

/** pt or en, from the function words of the speech (BrollSpec.lang overrides). */
export function speechLang(words: W[]): "pt" | "en" {
  const PT = new Set(["de", "que", "nao", "voce", "uma", "um", "para", "pra", "com", "isso", "mais", "e", "o", "a", "os", "as", "do", "da", "no", "na", "em", "eu", "se", "ja", "so"]);
  const EN = new Set(["the", "and", "you", "to", "of", "is", "it", "that", "your", "with", "for", "this", "not", "just", "then", "before", "a", "in", "on"]);
  let pt = 0, en = 0;
  for (const w of words) { const n = normWord(w.word); if (PT.has(n)) pt++; if (EN.has(n)) en++; }
  return pt > en ? "pt" : "en";
}

/**
 * editonny 1.0.0 writes a few fixed card words in English even for Portuguese speech ("only", "What you *receive*:",
 * "GUARANTEE"). For PT speech they become their PT-BR words; values, items and spoken text are never touched.
 */
const PT_FIXED: Record<string, Record<string, string>> = {
  price_tag: { label: "apenas" },
  checklist: { title: "Você *recebe*:" },
  strikeout: { title: "Você *não* precisa de:" },
  progress_bar: { label: "Concluído" },
  guarantee_badge: { title: "GARANTIA", unit: "dias" },
};
const EN_SOURCE: Record<string, Record<string, string>> = {
  price_tag: { label: "only" }, checklist: { title: "What you *receive*:" }, strikeout: { title: "You do *not* need:" },
  progress_bar: { label: "Completed" }, guarantee_badge: { title: "GUARANTEE", unit: "days" },
};
export function localizeParams(tpl: string, params: Record<string, unknown>, lang: "pt" | "en"): Record<string, unknown> {
  if (lang !== "pt" || !PT_FIXED[tpl]) return params;
  const out = { ...params };
  for (const [k, v] of Object.entries(EN_SOURCE[tpl])) if (out[k] === v) out[k] = PT_FIXED[tpl][k];
  return out;
}

/** The part of the spoken sentence that falls inside the item window (what broll_quote checks). */
function quoteFor(said: string, words: W[], start: number, end: number): string {
  const win = wordsIn(words, start - 0.5, end);
  const toks = said.split(/\s+/).map(normWord).filter(Boolean);
  const nwin = win.map((w) => normWord(w.word));
  // longest run of the sentence that is also a run of the window
  let best: [number, number] = [0, 0];
  for (let i = 0; i < nwin.length; i++) for (let k = 0; k < toks.length; k++) {
    let n = 0;
    while (i + n < nwin.length && k + n < toks.length && nwin[i + n] === toks[k + n]) n++;
    if (n > best[1]) best = [i, n];
  }
  const run = best[1] ? win.slice(best[0], best[0] + best[1]) : wordsIn(words, start, end).slice(0, 8);
  return run.map((w) => w.word.replace(/[.,!?;:…]+$/u, "")).join(" ");
}

/** Stable key of a card clip: what render_visuals.py draws from. */
export function clipKey(spec: EditSpec, it: BrollItem, version: string | null): string {
  const frames = Math.round((it.end - it.start) * spec.canvas.fps);
  return sha1(JSON.stringify([version, it.template, it.params, it.rect, frames, spec.canvas.fps, spec.canvas.width, spec.canvas.height])).slice(0, 16);
}

/** render_visuals.py --format clip into <cache>/<key>/ (reused when it is there). */
function renderCard(spec: EditSpec, it: BrollItem, st: EditonnyStatus, cacheRoot: string): BrollClip {
  const key = clipKey(spec, it, st.version);
  const dir = join(cacheRoot, key), meta = join(dir, "editai-clip.json");
  if (existsSync(meta)) {
    const c = JSON.parse(readFileSync(meta, "utf8")) as BrollClip;
    if (c.key === key && existsSync(c.file)) return c;
  }
  mkdirSync(dir, { recursive: true });
  const pf = join(dir, "params.json");
  writeFileSync(pf, JSON.stringify(it.params ?? {}));
  const r0 = it.rect!;
  const dur = (Math.round((it.end - it.start) * spec.canvas.fps) / spec.canvas.fps).toFixed(4);
  const r = runHelper(st, "render_visuals", ["--template", it.template!, "--params-file", pf, "--format", "clip", "--duration", dur, "--fps", String(spec.canvas.fps),
    "--size", `${spec.canvas.width}x${spec.canvas.height}`, "--region", `${r0.x},${r0.y},${r0.w},${r0.h}`, "--out", dir], dir);
  if (r.code !== 0 || !r.json?.files?.clip) throw new Error(`render_visuals.py ${it.template} saiu com ${r.code}: ${r.stderr.trim().split("\n").pop() ?? ""}`);
  const c = r.json.clip ?? {};
  const clip: BrollClip = { file: r.json.files.clip, key, x: c.x ?? 0, y: c.y ?? 0, w: c.w ?? spec.canvas.width, h: c.h ?? spec.canvas.height, ink: c.ink ?? null,
    frames: r.json.frames, fps: r.json.fps, sfx: r.json.sfx ?? [] };
  writeFileSync(meta, JSON.stringify(clip, null, 2));
  return clip;
}

/** One library sound for a card: its first cue, mapped to the squad's CC0 library, anchored on the cue frame. */
function cardSfx(spec: EditSpec, it: BrollItem): Sfx[] {
  const cue = it.clip?.sfx?.[0];
  if (!cue) return [];
  let name = SFX_MAP[cue.name] ?? "pop-ui";
  if (!pickSfx(name)) name = "pop-ui";
  if (!pickSfx(name)) return [];
  const at = r3(it.start + cue.frame / spec.canvas.fps);
  return [{ src: `@sfx:${name}`, at, gain_db: name === "whoosh" ? -26 : -16, hook: name === "whoosh" ? "whoosh" : name === "hit" ? "hit" : "asmr_detail", anchor: true, ...(name === "whoosh" ? { only_with_music: true } : {}) }];
}

const cacheOf = (b: BrollSpec, fallback: string) => (b.project ? join(b.project, "editai", "cache", "broll") : fallback);

// ── the two commands ────────────────────────────────────────────────────────

export interface SuggestResult { spec: EditSpec; exitCode: 0 | 3; editonny: EditonnyStatus; candidates: BrollItem[]; skipped: BrollSkip[]; notes: string[] }

/**
 * broll-suggest: fills spec.broll (mode auto) with the chosen items, the faces, what was skipped and why.
 * Exit code 3 when editonny is missing (the person's media still matched; the video still renders).
 */
export function suggestBroll(spec: EditSpec, project: string): SuggestResult {
  if (!spec.captions?.words.length) throw new Error("broll-suggest precisa das palavras com tempo (captions.words): rode cli.ts transcribe antes");
  const b: BrollSpec = spec.broll ?? { mode: "auto", items: [] };
  if (b.mode === "off") b.mode = "auto";
  b.project = resolve(project);
  const o = opt(b), D = spec.duration, words = spec.captions.words;
  const notes: string[] = [], skipped: BrollSkip[] = [];
  const st = editonnyStatus();
  const cacheRoot = cacheOf(b, join(project, "editai", "cache", "broll"));
  spec.broll = b;
  b.faces = computeFaces(spec, st, cacheRoot, notes);
  const { files, notes: mn } = scanMedia(join(b.project, "editai", "broll"));
  notes.push(...mn);
  const cands = mediaCandidates(files, words, D, spec.canvas.fps, o, skipped);
  if (st.usable) cands.push(...suggestCards(spec, st, b.project, o, b.marks ?? [], notes, skipped));
  else notes.push(`cards indisponíveis: ${st.reason}. Só a mídia da pasta do cliente entra, casada por palavra`);
  const geo = measureGeo(spec, join(cacheRoot, ".measure"));
  // cards need a place before they compete: one that fits nowhere never takes a slot
  const placed: Cand[] = [];
  for (const c of cands) {
    if (c.item.kind !== "card") { placed.push(c); continue; }
    const p = placeCard(spec, c.item, geo);
    if ("fail" in p) { skipped.push({ at: c.item.start, what: `card ${c.item.template}`, why: p.fail }); continue; }
    Object.assign(c.item, p);
    placed.push(c);
  }
  b.items = choose(placed, D, o, [], skipped);
  b.items.forEach((it, i) => { it.id = `b${i + 1}`; });
  for (const m of b.marks ?? []) {
    const hit = b.items.find((it) => it.marked && Math.abs(it.start - m.at) < 3);
    m.resolved = hit ? hit.id : st.usable ? "sem card: veja skipped" : `sem editonny (${st.reason})`;
  }
  b.skipped = skipped.sort((x, y) => x.at - y.at);
  b.notes = notes;
  b.editonny = st.usable ? `editonny ${st.version ?? "?"}` : `sem cards: ${st.reason}`;
  return { spec, exitCode: st.usable ? 0 : 3, editonny: st, candidates: cands.map((c) => c.item), skipped: b.skipped, notes };
}

/**
 * Cards to clips, marks to cards (render path, also broll-render): every card without a current clip is
 * drawn by render_visuals.py into the cache; a mark from the mini editor is resolved with suggest_visuals.
 * Without editonny an unrendered card is dropped with a note, so the video still renders.
 */
export function materializeBroll(spec: EditSpec, fallbackCache: string): string[] {
  const b = spec.broll;
  if (!b || b.mode === "off") return [];
  const notes: string[] = [];
  const st = editonnyStatus();
  const cacheRoot = cacheOf(b, fallbackCache);
  const open = (b.marks ?? []).filter((m) => !m.resolved);
  if (open.length) {
    if (!st.usable || !b.project || !spec.captions?.words.length) {
      for (const m of open) m.resolved = st.usable ? "sem palavras ou sem pasta de projeto" : `sem editonny (${st.reason})`;
      notes.push(`${open.length} marcação(ões) de card não viraram card: ${open[0].resolved}`);
    } else {
      const o = opt(b), skipped: BrollSkip[] = [];
      const cands = suggestCards(spec, st, b.project, o, open, notes, skipped).filter((c) => c.item.marked);
      const geo = measureGeo(spec, join(cacheRoot, ".measure"));
      for (const m of open) {
        const c = cands.find((x) => Math.abs(x.item.start - m.at) < 3);
        if (!c) { m.resolved = "suggest_visuals não achou a frase desse ponto"; continue; }
        const p = placeCard(spec, c.item, geo);
        if ("fail" in p) { m.resolved = p.fail; continue; }
        Object.assign(c.item, p);
        const before = b.items.length;
        b.items = choose([c], spec.duration, o, b.items, skipped);
        if (b.items.length === before) { m.resolved = skipped.pop()?.why ?? "não coube"; continue; }
        c.item.id = `b${1 + Math.max(0, ...b.items.map((x) => Number(x.id.slice(1)) || 0))}`;
        m.resolved = c.item.id;
      }
      for (const m of open) if (!/^b\d+$/.test(m.resolved ?? "")) notes.push(`card marcado em ${fmtT(m.at)} não entrou: ${m.resolved}`);
    }
  }
  let geo: Geo | undefined;
  for (const it of [...b.items]) {
    if (it.kind !== "card") continue;
    const key = clipKey(spec, it, st.version);
    if (it.clip?.key === key && existsSync(it.clip.file)) continue;
    if (!st.usable) { b.items = b.items.filter((x) => x !== it); notes.push(`card ${it.id} (${it.template}) fora do vídeo: ${st.reason}`); continue; }
    try {
      geo ??= measureGeo(spec, join(cacheRoot, ".measure"));
      const why = fitCard(spec, it, st, cacheRoot, geo);
      if (why) { b.items = b.items.filter((x) => x !== it); (b.skipped ??= []).push({ at: it.start, what: `card ${it.template}`, why: `desenhado, mas ${why}` }); notes.push(`card ${it.id} (${it.template}) fora do vídeo: ${why}`); continue; }
      it.sfx = cardSfx(spec, it);
    } catch (e) { b.items = b.items.filter((x) => x !== it); notes.push(`card ${it.id} fora do vídeo: ${(e as Error).message}`); }
  }
  if (notes.length) b.notes = [...(b.notes ?? []), ...notes];
  return notes;
}

// ── spec: derived layers, sounds, caption windows and hooks (called by resolveSpec) ─────────

const HOOK_OF = (it: BrollItem) => (it.kind === "card" ? "broll_card" : it.layout === "pip" ? "broll_pip" : "broll_full");

/**
 * Idempotent. Removes what an earlier call derived, then, unless broll.mode is "off", turns each item
 * into a MediaLayer drawn above the camera (cards with alpha), its sounds, the caption windows (move up
 * or hide) and its catalog hook. With mode "off" (or no broll) the spec is left as it was.
 */
export function resolveBroll(s: EditSpec): void {
  if (s.layers?.some((l) => l.broll)) s.layers = s.layers.filter((l) => !l.broll);
  if (s.audio?.sfx?.some((f) => f.broll)) s.audio.sfx = s.audio.sfx.filter((f) => !f.broll);
  if (s.captions?.windows) delete s.captions.windows;
  if (s.hooks_applied?.some((h) => h.broll)) s.hooks_applied = s.hooks_applied.filter((h) => !h.broll);
  const b = s.broll;
  if (!b || b.mode === "off" || !b.items?.length) return;
  const { width: W, height: H } = s.canvas;
  const windows: NonNullable<NonNullable<EditSpec["captions"]>["windows"]> = [];
  for (const it of [...b.items].sort((x, y) => x.start - y.start)) {
    const dur = it.end - it.start;
    if (it.kind === "card") {
      if (!it.clip) continue;
      s.layers.push({ id: `broll-${it.id}`, src: it.clip.file, kind: "video", start: it.start, duration: dur, in: 0, alpha: true,
        rect: { x: it.clip.x, y: it.clip.y, w: it.clip.w, h: it.clip.h }, broll: it.id, provenance: it.provenance });
    } else if (it.src) {
      const rect = it.layout === "pip" && it.rect ? it.rect : { x: 0, y: 0, w: W, h: H };
      s.layers.push({ id: `broll-${it.id}`, src: it.src, kind: it.media ?? "video", start: it.start, duration: dur, in: it.in ?? 0, fit: "cover", rect,
        ...(it.layout === "pip" ? { border_px: 6, border_color: "white" } : {}), broll: it.id, provenance: it.provenance });
    }
    for (const f of it.sfx ?? []) s.audio.sfx.push({ ...structuredClone(f), broll: it.id });
    if (it.captions === "hide") windows.push({ start: it.start, end: it.end, hide: true, broll: it.id });
    else if (it.captions === "move_up" && it.caption_y) windows.push({ start: it.start, end: it.end, y: it.caption_y, broll: it.id });
    s.hooks_applied.push({ hook: HOOK_OF(it), at: r3(it.start), why: `B-roll ${it.id} (${it.kind === "card" ? it.template : basename(it.src ?? "")}): "${it.quote}"`, broll: it.id });
  }
  if (windows.length && s.captions) s.captions.windows = windows;
}

/** After an edit moved the items (a cut, a trim): keep them out of the hook and the CTA, at least 1.5 s each. */
export function fitBrollWindows(s: EditSpec): string[] {
  const b = s.broll;
  if (!b || b.mode === "off") return [];
  const o = opt(b), D = s.duration, out: string[] = [];
  const keep: BrollItem[] = [];
  for (const it of b.items ?? []) {
    if (!it.explicit) {
      const a = Math.max(it.start, o.hook), e = Math.min(it.end, D - o.cta);
      if (e - a < INSERT_MIN - 1e-6) { out.push(`B-roll ${it.id} saiu: depois da edição ficou sem 1,5 s fora do gancho e do CTA`); continue; }
      if (a !== it.start || e !== it.end) { out.push(`B-roll ${it.id} ajustado para ${fmtT(a)}-${fmtT(e)} (fora do gancho e do CTA)`); it.start = r3(a); it.end = r3(e); }
    }
    keep.push(it);
  }
  b.items = keep;
  return out;
}

/** Structural problems of the broll section (validateSpec). */
export function validateBroll(s: EditSpec): string[] {
  const b = s.broll, p: string[] = [];
  if (!b) return p;
  if (!["auto", "manual", "off"].includes(b.mode)) p.push("broll.mode must be auto, manual or off");
  if (!Array.isArray(b.items)) { p.push("broll.items must be a list"); return p; }
  const ids = new Set<string>();
  for (const it of b.items) {
    const n = `broll ${it.id || "?"}`;
    if (!it.id || ids.has(it.id)) p.push(`${n}: id missing or repeated`);
    ids.add(it.id);
    if (!(it.end > it.start) || it.start < 0 || it.end > s.duration + 1e-6) p.push(`${n}: start/end must sit inside the video (${it.start}-${it.end} of ${s.duration} s)`);
    if (it.kind === "card") {
      if (!it.template) p.push(`${n}: card needs template`);
      if (b.mode !== "off" && it.clip && !existsSync(it.clip.file)) p.push(`${n}: card clip missing (bun lib/edit-engine/cli.ts broll-render <spec>)`);
    } else if (it.kind === "insert") {
      if (!it.src || !existsSync(it.src)) p.push(`${n}: media not found: ${it.src}`);
      if (it.layout === "pip" && !it.rect) p.push(`${n}: pip needs rect`);
    } else p.push(`${n}: kind must be card or insert`);
  }
  return p;
}

// ── QA (BROLL.md §6.4) ──────────────────────────────────────────────────────

export interface BrollCheck { id: string; blocking: boolean; pass: boolean; detail: string; tool: string; info?: boolean }

/** The B-roll checks. groups: caption groups measured on the render (qa.ts); headline: measured box. */
export function brollChecks(spec: EditSpec, groups: { text?: string; at: number; box: Rect | null }[], headline: Rect | null): BrollCheck[] {
  const b = spec.broll!, o = opt(b), D = spec.duration, items = [...b.items].sort((x, y) => x.start - y.start);
  const words = spec.captions?.words ?? [];
  const out: BrollCheck[] = [];
  const cards = items.filter((i) => i.kind === "card"), inserts = items.filter((i) => i.kind === "insert");
  out.push({ id: "broll_items", blocking: false, info: true, pass: true, tool: "spec",
    detail: `${items.length} item(ns): ${cards.length} card(s) (${[...new Set(cards.map((c) => c.template))].join(", ") || "nenhum"}), ${inserts.length} mídia(s) do cliente; ${b.editonny ?? ""}` });
  const win = items.filter((i) => !i.explicit && (i.start < o.hook - 1e-6 || i.end > D - o.cta + 1e-6));
  out.push({ id: "broll_hook_window", blocking: true, pass: win.length === 0, tool: "spec",
    detail: win.length ? win.map((i) => `${i.id} ${i.start.toFixed(2)}-${i.end.toFixed(2)} s`).join("; ") + ` cruza 0-${o.hook} s ou os ${o.cta} s finais` : `nada em 0-${o.hook} s nem depois de ${(D - o.cta).toFixed(2)} s${items.some((i) => i.explicit) ? " (itens pedidos explicitamente liberados)" : ""}` });
  const gaps: string[] = [];
  for (let k = 1; k < items.length; k++) if (items[k].start - items[k - 1].start < o.gap - 1e-6) gaps.push(`${items[k - 1].id}→${items[k].id} ${(items[k].start - items[k - 1].start).toFixed(2)} s`);
  out.push({ id: "broll_gap", blocking: false, pass: gaps.length === 0, tool: "spec", detail: gaps.length ? `intervalo menor que ${o.gap} s: ${gaps.join(", ")}` : `todos os inícios a ${o.gap} s ou mais um do outro` });
  // face: card ink (or pip window) against eyes-to-lip and protect_regions at every zoom while on screen
  const faceHits: string[] = [], faceOk: string[] = [];
  let unmeasured = false;
  for (const it of items) {
    if (it.kind === "insert" && it.layout !== "pip") { faceOk.push(`${it.id} tela cheia (corte para a mídia, o rosto não aparece)`); continue; }
    const r = inkOf(it);
    if (!r) { faceHits.push(`${it.id} sem retângulo medido`); continue; }
    const prot = protectedDuring(spec, it.start, it.end);
    if (!prot.length) { unmeasured = true; continue; }
    const hit = prot.find((p) => intersect(r, p.rect));
    if (hit) faceHits.push(`${it.id} cobre ${hit.label}`); else faceOk.push(`${it.id} livre`);
  }
  out.push({ id: "broll_face", blocking: true, pass: !faceHits.length && !unmeasured, tool: "render_visuals ink + face_layout/protect_regions + camera zoom",
    detail: faceHits.length ? faceHits.join("; ") : unmeasured ? "rosto não medido: sem face_layout e sem protect_regions" : faceOk.join("; ") || "sem item" });
  // captions and headline: no crossing in the same frame
  const capHits: string[] = [];
  const spans = spec.captions?.words.length ? captionSpans(spec.captions) : [];
  for (const it of items) {
    if (it.kind === "insert" && it.layout !== "pip") continue;
    const r = inkOf(it);
    if (!r) continue;
    for (const [gi, parts] of spans.entries()) {
      const g = groups[gi], sp = parts.find(([a, e]) => e > it.start + 1e-3 && a < it.end - 1e-3);
      if (!sp || !g?.box || !intersect(r, g.box)) continue;
      capHits.push(`${it.id} cruza a legenda "${g.text ?? ""}" (${sp[0].toFixed(2)}-${sp[1].toFixed(2)} s)`);
      break;
    }
    const hook = spec.texts.find((t) => t.role === "hook");
    if (headline && hook && hook.start < it.end && hook.end > it.start && intersect(r, headline)) capHits.push(`${it.id} cruza a headline`);
  }
  out.push({ id: "broll_caption_overlap", blocking: true, pass: !capHits.length, tool: "ffmpeg bbox das legendas (por grupo) e da headline + ink do card",
    detail: capHits.length ? capHits.join("; ") : `cards e janelas livres da legenda e da headline${items.some((i) => i.captions === "hide") ? "; legenda escondida durante card que escreve as mesmas palavras" : ""}${items.some((i) => i.captions === "move_up") ? "; legenda sobe acima do card" : ""}` });
  const zoneHits: string[] = [];
  for (const it of items) {
    if (it.kind === "insert" && it.layout !== "pip") continue;
    const r = inkOf(it);
    if (!r) continue;
    for (const p of spec.platforms ?? []) for (const z of unsafeRects(p, spec.canvas.width, spec.canvas.height)) if (intersect(r, z)) zoneHits.push(`${it.id} cruza "${z.label}" (${p})`);
  }
  out.push({ id: "broll_safe_zone", blocking: true, pass: !zoneHits.length, tool: "ink do card + lib/edit-engine/safe-zones.json (plataformas do spec)",
    detail: zoneHits.length ? zoneHits.join("; ") : `cards e janelas dentro da área segura de ${(spec.platforms ?? []).join(", ")}` });
  const bad = items.filter((i) => !quoteInWords(i.quote ?? "", words, i.start, i.end));
  out.push({ id: "broll_quote", blocking: true, pass: !bad.length, tool: "spec quote vs captions.words",
    detail: bad.length ? bad.map((i) => `${i.id}: "${i.quote}" não está na fala entre ${(i.start - 0.5).toFixed(2)} e ${i.end.toFixed(2)} s`).join("; ") : items.map((i) => `${i.id} "${i.quote}"`).join("; ") || "sem item" });
  const noProv = items.filter((i) => !i.provenance?.source || (i.kind === "card" && !i.provenance.license) || (i.provenance.credits_file && !creditsHas(String(i.provenance.credits_file), i)));
  out.push({ id: "broll_provenance", blocking: true, pass: !noProv.length, tool: "spec provenance",
    detail: noProv.length ? `sem origem completa: ${noProv.map((i) => i.id).join(", ")}` : items.map((i) => `${i.id} ${i.provenance.source}${i.provenance.license ? ` (${i.provenance.license.split(" ")[0]})` : ""}`).join("; ") || "sem item" });
  const rc = b.render_cost;
  out.push({ id: "broll_render_cost", blocking: false, info: true, pass: true, tool: "render() seconds",
    detail: rc ? `${rc.with_s.toFixed(1)} s com B-roll / ${rc.without_s.toFixed(1)} s sem = ${(rc.with_s / Math.max(0.001, rc.without_s)).toFixed(2)}x (${rc.measured_by})` : "não medido neste render (a prova mede com e sem B-roll)" });
  return out;
}

/** Drawn pixels of an item on the canvas: card ink (render_visuals), else its clip box; pip: its window. */
function inkOf(it: BrollItem): Rect | null {
  if (it.kind === "card") {
    const c = it.clip;
    if (!c) return null;
    if (c.ink) return { x: c.ink[0], y: c.ink[1], w: c.ink[2] - c.ink[0], h: c.ink[3] - c.ink[1] };
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  }
  return it.rect ? { x: it.rect.x - 6, y: it.rect.y - 6, w: it.rect.w + 12, h: it.rect.h + 12 } : null;
}

function creditsHas(file: string, it: BrollItem): boolean {
  try { return readFileSync(file, "utf8").includes(basename(it.src ?? "")); } catch { return false; }
}

/** Contact sheet: one frame from the middle of each item, side by side, labelled. */
export function contactSheet(spec: EditSpec, videoIn: string, out: string, work: string): string | null {
  const video = resolve(videoIn);
  const items = [...(spec.broll?.items ?? [])].sort((a, b) => a.start - b.start);
  if (!items.length) return null;
  mkdirSync(work, { recursive: true });
  const font = join(work, "Inter-Bold.ttf");
  const src = join(resolve(import.meta.dir, "..", ".."), "assets", "fonts", "Inter-Bold.ttf");
  if (!existsSync(font) && existsSync(src)) writeFileSync(font, readFileSync(src));
  const frames: string[] = [];
  items.forEach((it, i) => {
    const t = (it.start + it.end) / 2, f = join(work, `sheet-${i}.png`);
    const label = `${it.id} ${it.kind === "card" ? it.template : "midia " + basename(it.src ?? "").replace(/[^A-Za-z0-9._-]/g, "")} ${t.toFixed(2)} s`;
    const p = Bun.spawnSync(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(3), "-i", video, "-frames:v", "1", "-vf",
      `scale=432:768,drawtext=fontfile=Inter-Bold.ttf:text='${label}':fontsize=22:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=8:x=10:y=10`, f], { cwd: work, stdout: "pipe", stderr: "pipe" });
    if (p.exitCode === 0) frames.push(`sheet-${i}.png`);
  });
  if (!frames.length) return null;
  const args = frames.flatMap((f) => ["-i", f]);
  const filter = frames.length === 1 ? "[0:v]null[o]" : `${frames.map((_, i) => `[${i}:v]`).join("")}hstack=inputs=${frames.length}[o]`;
  const p = Bun.spawnSync(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", ...args, "-filter_complex", filter, "-map", "[o]", "-frames:v", "1", "-update", "1", resolve(out)], { cwd: work, stdout: "pipe", stderr: "pipe" });
  return p.exitCode === 0 ? resolve(out) : null;
}


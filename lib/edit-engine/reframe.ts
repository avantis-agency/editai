// Reframe a wider source (16:9) into the vertical canvas following the face (EditAi 2.2.0, an early
// slice of wave 5 of the editonny fusion). Bun only.
//
//   spec.reframe = { "mode": "follow-face" | "center" | "off", "layout": "fill" | "band", ... }
//
// follow-face: the installed editonny 1.0.0 measures the face 10 times a second (track_faces.py: YuNet,
// median of 5, dead zone of 3% of the width, eased 0.5 s moves), called as a subprocess on the source
// itself. On top of that path the EditAi runs a calmer virtual camera: the crop window stands still
// while the face stays inside a dead zone (15% of the crop width by default), and when the person
// really moved it travels to where the face settles (median of the face from 1 s before to 3 s after, so a sway does not drag the frame) in 0.8 to 1.6 s with a cosine ease, at most once
// every 1.2 s. The crop keeps the full source height (the hand microphone at the mouth stays in) and
// the face centred, so gestures have the same margin on both sides.
// layout "band": the picture sits under a top band (blurred, darkened copy of the same crop, or a
// solid colour) that holds the headline, so a source with the head near the top never puts text over
// the face. layout "fill": the crop fills the canvas.
// center, or no editonny: a fixed centre crop, and the QA says the face was not measured.
//
// The path is cached per source in <project>/editai/cache/reframe/ (or next to the render). The crop
// is an ffmpeg crop with a per-frame x expression in the layer chain (ffmpeg.ts); the QA checks every
// measured face sample of every take against the window (reframe_face).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { editonnyStatus } from "./editonny.ts";
import { probe } from "./measure.ts";
import type { EditSpec, MediaLayer, Rect } from "./spec.ts";

export type ReframeMode = "follow-face" | "center" | "off";
export interface ReframePath {
  src: string; sig: string; width: number; height: number; fps: number; duration: number;
  cw: number; ch: number; y0: number;              // crop window, source pixels
  segs: [number, number, number, number][];         // [t0, t1, x0, x1]: crop left edge, cosine ease from x0 to x1
  faces: [number, number, number, number, number, number][]; // [t, cx, cy, w, h, measured], source pixels, 10 Hz
  measured: boolean; tool: string; moves: number;
}
export interface ReframeSpec {
  mode: ReframeMode;
  layout?: "fill" | "band";
  band_px?: number;            // band height at the canvas size (default 470 at 1920)
  band_style?: "blur" | "solid";
  band_color?: string;         // solid band colour (#RRGGBB)
  dead_zone?: number;          // share of the crop width the face may drift before the frame moves (default 0.15)
  project?: string;            // project folder: the path cache goes to <project>/editai/cache/reframe/
  paths?: Record<string, ReframePath>;  // written by materializeReframe, keyed by source path
  notes?: string[];
}

export const reframeOn = (s: EditSpec) => !!s.reframe && s.reframe.mode !== "off";
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/** Height of the picture area: the canvas minus the band. */
export function pictureArea(spec: EditSpec): { y: number; w: number; h: number } {
  const { width: W, height: H } = spec.canvas;
  const band = spec.reframe?.layout === "band" ? Math.round(spec.reframe.band_px ?? (470 * H) / 1920) : 0;
  return { y: band, w: W, h: H - band };
}

/** The crop window in the source: full height, the picture area's aspect. */
export function cropSize(spec: EditSpec, sw: number, sh: number): { cw: number; ch: number; y0: number } {
  const a = pictureArea(spec);
  let ch = sh, cw = even((ch * a.w) / a.h);
  if (cw > sw) { cw = even(sw); ch = even((cw * a.h) / a.w); }
  return { cw, ch, y0: Math.round((sh - ch) / 2) };
}

/** Does this take need a reframe (source shape differs from the picture area)? */
export function needsReframe(spec: EditSpec, sw: number, sh: number): boolean {
  const a = pictureArea(spec);
  return Math.abs(sw / sh - a.w / a.h) > 0.01;
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/**
 * The virtual camera over a measured face path: holds while the face stays within the dead zone, then
 * one eased move to where the face settles (median of the next second). Pure, tested without video.
 */
export function cameraPath(faces: ReframePath["faces"], sw: number, cw: number, duration: number, deadZone = 0.15): ReframePath["segs"] {
  const clampC = (c: number) => Math.min(sw - cw / 2, Math.max(cw / 2, c));
  const DZ = deadZone * cw, SPEED = 0.45 * cw, MIN_MOVE = 0.8, MAX_MOVE = 1.6, MIN_HOLD = 1.2;
  if (!faces.length) { const x = Math.round((sw - cw) / 2); return [[0, r3(duration), x, x]]; }
  const ts = faces.map((f) => f[0]), cx = faces.map((f) => f[1]), fw = faces.map((f) => f[3]);
  const within = (a: number, b: number) => cx.filter((_, k) => ts[k] >= a && ts[k] <= b);
  let c = clampC(median(within(0, 1.5)));
  const segs: ReframePath["segs"] = [];
  let segStart = 0, holdFrom = 0, i = 0;
  while (i < faces.length) {
    const t = ts[i], d = cx[i] - c;
    const edge = Math.abs(d) > cw / 2 - fw[i] / 2 - 0.04 * cw; // the face is about to leave the window: move now
    if (Math.abs(d) > DZ && (t >= holdFrom + MIN_HOLD || edge)) {
      // where the person settles: the median of the face around the next seconds (a sway to one side and back
      // averages out, so the frame does not chase it)
      const target = clampC(median(within(t - 1.0, t + 3.0)));
      if (Math.abs(target - c) > DZ * 0.5 || edge) {
        const dur = Math.min(MAX_MOVE, Math.max(MIN_MOVE, Math.abs(target - c) / SPEED));
        const t0 = Math.max(segStart, t - 0.3), t1 = Math.min(duration, t0 + dur);
        if (t0 > segStart) segs.push([r3(segStart), r3(t0), r1(c - cw / 2), r1(c - cw / 2)]);
        segs.push([r3(t0), r3(t1), r1(c - cw / 2), r1(target - cw / 2)]);
        c = target; segStart = t1; holdFrom = t1;
        while (i < faces.length && ts[i] < t1) i++;
        continue;
      }
    }
    i++;
  }
  if (segStart < duration) segs.push([r3(segStart), r3(duration), r1(c - cw / 2), r1(c - cw / 2)]);
  return segs;
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * u));

/** Crop left edge at source second `s`. */
export function cropXAt(p: ReframePath, s: number): number {
  for (const [t0, t1, x0, x1] of p.segs) if (s < t1 || t1 >= p.duration - 1e-6) return x0 + (x1 - x0) * ease((s - t0) / Math.max(1e-6, t1 - t0));
  const last = p.segs[p.segs.length - 1];
  return last ? last[3] : Math.round((p.width - p.cw) / 2);
}

/** ffmpeg expression of the crop x for a layer whose frame time t maps to source second t + off, over [a, b]. */
export function cropXExpr(p: ReframePath, off: number, a: number, b: number): string {
  const S = `(t+${r3(off)})`;
  const segs = p.segs.filter(([t0, t1]) => t1 > a - 0.05 && t0 < b + 0.05);
  if (!segs.length) return String(Math.round(cropXAt(p, a)));
  const one = ([t0, t1, x0, x1]: [number, number, number, number]) =>
    Math.abs(x1 - x0) < 0.05 ? `${r1(x0)}` : `${r1(x0)}+(${r1(x1 - x0)})*(1-cos(PI*(${S}-${r3(t0)})/${r3(Math.max(0.001, t1 - t0))}))/2`;
  let expr = one(segs[segs.length - 1]);
  for (let k = segs.length - 2; k >= 0; k--) expr = `if(lt(${S},${r3(segs[k][1])}),${one(segs[k])},${expr})`;
  return expr;
}

/**
 * Filter chain that turns one take's frames into the canvas picture (replaces the cover fit). `i` makes
 * the labels unique; `off` = source second of the layer's frame t = 0.
 */
export function reframeChain(spec: EditSpec, l: MediaLayer, i: number, off: number, a: number, b: number): string | null {
  const p = reframeOn(spec) ? spec.reframe!.paths?.[l.src] : undefined;
  if (!p) return null;
  const { width: W, height: H } = spec.canvas;
  const area = pictureArea(spec);
  const crop = `crop=w=${p.cw}:h=${p.ch}:x='${cropXExpr(p, off, a, b)}':y=${p.y0}:exact=1,scale=${area.w}:${area.h}:flags=lanczos:out_range=tv`;
  if (!area.y) return crop;
  const rf = spec.reframe!;
  if (rf.band_style === "solid") return `${crop},pad=${W}:${H}:0:${area.y}:color=${(rf.band_color ?? "#0e0b0a").replace("#", "0x")}`;
  // blurred, darkened copy of the same picture behind it (cheap: blurred at a quarter of the size)
  const q = (n: number) => even(n / 4);
  return `${crop},split=2[rf${i}a][rf${i}b];[rf${i}b]scale=${q(W)}:${q(H)}:force_original_aspect_ratio=increase:flags=bilinear,crop=${q(W)}:${q(H)},boxblur=10:2,scale=${W}:${H}:flags=bicubic,eq=brightness=-0.20:saturation=0.55[rf${i}g];[rf${i}g][rf${i}a]overlay=0:${area.y}`;
}

// ── measuring ─────────────────────────────────────────────────────────────────

const FACE_DRIVER = `
import sys, json
sys.path.insert(0, sys.argv[1])
from pathlib import Path
import track_faces as tf
from common import probe_video
v = Path(sys.argv[2]); info = probe_video(v)
W = int(info.get("display_width") or info.get("width") or 0); H = int(info.get("display_height") or info.get("height") or 0)
fps = float(info.get("fps") or 30.0); dur = float(info.get("duration") or 0.0)
m = tf.measure_value(v, fps, W, H, progress=False)
shots = tf.assemble_shots([{"id": "src", "start": 0.0, "end": dur}], m, W, H)
print(json.dumps({"width": W, "height": H, "fps": fps, "duration": dur, "shots": shots,
  "parameters": {"step_s": tf.STEP_S, "median": tf.WINDOW, "dead_zone": tf.DEAD_ZONE, "transition_s": tf.TRANSITION_S}}))
`;

/** Face path of a whole source with editonny's track_faces (subprocess, nothing written into the install). */
export function trackFaces(src: string): { ok: boolean; reason?: string; faces: ReframePath["faces"]; width?: number; height?: number; seconds?: number } {
  const st = editonnyStatus();
  if (!st.usable || !st.engine || !st.python) return { ok: false, reason: st.reason || "editonny indisponível", faces: [] };
  if (!existsSync(join(st.engine, "helpers", "track_faces.py"))) return { ok: false, reason: "editonny sem track_faces.py", faces: [] };
  const t0 = performance.now();
  const p = Bun.spawnSync([st.python, "-B", "-c", FACE_DRIVER, join(st.engine, "helpers"), resolve(src)], {
    stdout: "pipe", stderr: "pipe", timeout: 900_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  const last = p.stdout.toString().trim().split(/\r?\n/).pop() ?? "";
  if (p.exitCode !== 0 || !last.startsWith("{")) return { ok: false, reason: `track_faces saiu ${p.exitCode}: ${p.stderr.toString().trim().split("\n").pop() ?? ""}`, faces: [] };
  const j = JSON.parse(last);
  const W = j.width, H = j.height;
  const pts = (j.shots?.[0]?.points ?? []) as number[][];
  const faces = pts.map((q) => [r3(q[0]), r1(q[1] * W), r1(q[2] * H), r1(q[3] * W), r1(q[4] * H), q[5]] as ReframePath["faces"][number]);
  return { ok: faces.length > 0, reason: faces.length ? undefined : "nenhum rosto encontrado", faces, width: W, height: H, seconds: (performance.now() - t0) / 1000 };
}

/**
 * Fills spec.reframe.paths for every take source that needs it (cached per source). Returns notes.
 * Without editonny (or without a face) the path is a fixed centre crop marked as not measured.
 */
export function materializeReframe(spec: EditSpec, fallbackCache: string): string[] {
  if (!reframeOn(spec)) return [];
  const rf = spec.reframe!;
  rf.paths ??= {};
  const notes: string[] = [];
  const cacheRoot = rf.project ? join(rf.project, "editai", "cache", "reframe") : fallbackCache;
  const takes = spec.layers.filter((l) => l.kind === "video" && !l.rect && !l.broll);
  for (const src of new Set(takes.map((l) => l.src))) {
    const s = statSync(src);
    const pr = probe(src);
    if (!needsReframe(spec, pr.width, pr.height)) { delete rf.paths[src]; continue; }
    const { cw, ch, y0 } = cropSize(spec, pr.width, pr.height);
    const sig = sha1(JSON.stringify([resolve(src), s.size, s.mtimeMs, rf.mode, cw, ch, rf.dead_zone ?? 0.15, 3]));
    if (rf.paths[src]?.sig === sig) continue;
    const file = join(cacheRoot, `${sig.slice(0, 16)}.json`);
    if (existsSync(file)) { rf.paths[src] = JSON.parse(readFileSync(file, "utf8")); continue; }
    let faces: ReframePath["faces"] = [], measured = false, tool = "corte central (rosto não medido)";
    if (rf.mode === "follow-face") {
      const t = trackFaces(src);
      if (t.ok) { faces = t.faces; measured = true; tool = `editonny track_faces.py (YuNet, 10 Hz) + câmera virtual do EditAi (zona morta ${Math.round((rf.dead_zone ?? 0.15) * 100)}% do corte), ${t.seconds?.toFixed(0)} s`; }
      else notes.push(`${basename(src)}: rosto não medido (${t.reason}); corte central`);
    }
    const segs = cameraPath(faces, pr.width, cw, pr.duration, rf.dead_zone ?? 0.15);
    const path: ReframePath = { src, sig, width: pr.width, height: pr.height, fps: pr.fps, duration: r3(pr.duration), cw, ch, y0, segs, faces, measured, tool, moves: segs.filter((g) => Math.abs(g[3] - g[2]) >= 0.05).length };
    mkdirSync(cacheRoot, { recursive: true });
    writeFileSync(file, JSON.stringify(path));
    rf.paths[src] = path;
  }
  rf.notes = notes;
  // eyes and mouth for the text checks, from the same measurement, when the spec declared none
  if (!spec.protect_regions?.length) {
    const r = faceUnion(spec);
    if (r) spec.protect_regions = [{ label: "rosto medido (track_faces)", ...r }];
  }
  return notes;
}

/** Where a source face box lands on the canvas for a take at source second s (zoom 1). */
export function faceOnCanvas(spec: EditSpec, p: ReframePath, f: ReframePath["faces"][number]): Rect {
  const area = pictureArea(spec), k = area.w / p.cw, x = cropXAt(p, f[0]);
  return { x: Math.round((f[1] - f[3] / 2 - x) * k), y: Math.round(area.y + (f[2] - f[4] / 2 - p.y0) * k), w: Math.round(f[3] * k), h: Math.round(f[4] * k) };
}

/** Union of the measured face boxes over the takes, on the canvas. */
export function faceUnion(spec: EditSpec, from?: number, to?: number): Rect | null {
  let u: Rect | null = null;
  for (const l of spec.layers.filter((x) => x.kind === "video" && !x.rect && !x.broll)) {
    if (from !== undefined && to !== undefined && (l.start + l.duration <= from || l.start >= to)) continue;
    const p = spec.reframe?.paths?.[l.src];
    if (!p?.measured) continue;
    const a = l.in ?? 0, b = a + l.duration;
    for (const f of p.faces) {
      if (f[0] < a || f[0] > b || !f[5]) continue;
      const r = faceOnCanvas(spec, p, f);
      u = u ? { x: Math.min(u.x, r.x), y: Math.min(u.y, r.y), w: Math.max(u.x + u.w, r.x + r.w) - Math.min(u.x, r.x), h: Math.max(u.y + u.h, r.y + r.h) - Math.min(u.y, r.y) } : r;
    }
  }
  return u;
}

export interface ReframeCheck { id: string; blocking: boolean; pass: boolean; detail: string; tool: string; info?: boolean }

/** QA: every measured face sample of every take inside the crop window; the camera's motion. */
export function reframeChecks(spec: EditSpec): ReframeCheck[] {
  if (!reframeOn(spec)) return [];
  const out: ReframeCheck[] = [];
  const takes = spec.layers.filter((l) => l.kind === "video" && !l.rect && !l.broll);
  let samples = 0, misses: string[] = [], unmeasured = new Set<string>(), maxSpeed = 0, moves = 0, minHold = Infinity;
  for (const l of takes) {
    const p = spec.reframe!.paths?.[l.src];
    if (!p) continue;
    if (!p.measured) { unmeasured.add(basename(l.src)); continue; }
    const a = l.in ?? 0, b = a + l.duration;
    for (const f of p.faces) {
      if (f[0] < a || f[0] > b || !f[5]) continue;
      samples++;
      const x = cropXAt(p, f[0]);
      const inside = f[1] - f[3] / 2 >= x && f[1] + f[3] / 2 <= x + p.cw && f[2] - f[4] / 2 >= p.y0 && f[2] + f[4] / 2 <= p.y0 + p.ch;
      if (!inside) misses.push(`${l.id} ${r1(l.start + f[0] - a)} s`);
    }
  }
  for (const p of Object.values(spec.reframe!.paths ?? {})) {
    const k = pictureArea(spec).w / p.cw;
    moves += p.moves;
    for (const [t0, t1, x0, x1] of p.segs) {
      if (Math.abs(x1 - x0) >= 0.05) maxSpeed = Math.max(maxSpeed, (Math.abs(x1 - x0) * k * Math.PI) / 2 / Math.max(0.001, t1 - t0));
      else if (t1 - t0 < minHold && t1 < p.duration - 0.01 && t0 > 0.01) minHold = t1 - t0;
    }
  }
  if (samples) out.push({ id: "reframe_face", blocking: true, pass: misses.length === 0,
    detail: misses.length ? `${misses.length} de ${samples} amostras com o rosto fora do corte: ${misses.slice(0, 6).join(", ")}` : `rosto dentro do corte em ${samples} de ${samples} amostras medidas (10 por segundo) dos takes`,
    tool: "editonny track_faces.py + lib/edit-engine/reframe.ts" });
  if (unmeasured.size) out.push({ id: "reframe_face_measured", blocking: false, pass: false,
    detail: `rosto não medido em ${[...unmeasured].join(", ")}: corte central (sem editonny ou sem rosto); confira o enquadramento`, tool: "lib/edit-engine/reframe.ts" });
  out.push({ id: "reframe_motion", blocking: false, info: true, pass: true,
    detail: `${spec.reframe!.mode}, layout ${spec.reframe!.layout ?? "fill"}: ${moves} movimento(s) da câmera, pico ${Math.round(maxSpeed)} px/s no quadro${Number.isFinite(minHold) ? `, parada mais curta ${minHold.toFixed(1)} s` : ""}`,
    tool: "lib/edit-engine/reframe.ts" });
  return out;
}

export function validateReframe(s: EditSpec): string[] {
  const r = s.reframe;
  if (!r) return [];
  const p: string[] = [];
  if (!["follow-face", "center", "off"].includes(r.mode)) p.push("reframe.mode must be follow-face, center or off");
  if (r.layout && !["fill", "band"].includes(r.layout)) p.push("reframe.layout must be fill or band");
  if (r.band_px !== undefined && !(r.band_px >= 0 && r.band_px <= s.canvas.height * 0.4)) p.push("reframe.band_px must be in [0, 40% of the canvas height]");
  if (r.band_style && !["blur", "solid"].includes(r.band_style)) p.push("reframe.band_style must be blur or solid");
  if (r.dead_zone !== undefined && !(r.dead_zone >= 0.02 && r.dead_zone <= 0.3)) p.push("reframe.dead_zone must be in [0.02, 0.3]");
  return p;
}

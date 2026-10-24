// Review feedback: what a person decided in the local preview (marks, take
// trims, style, caption fixes, keyword highlights, approval), saved as one
// versioned JSON next to the spec, with the mini editor's undo steps. The
// preview server validates and writes it; apply-feedback.ts reads it. Bun only.
//   <dir>/<name>.spec.json  ->  <dir>/<name>.feedback.json
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { EditOp } from "./live-ops.ts";
import { takes, type EditSpec } from "./spec.ts";

export const FEEDBACK_VERSION = 1;

export interface Mark { in: number; out: number; note: string }
export interface Trim { id: string; start_delta: number; end_delta: number }
export interface StyleChoice {
  caption_preset: "bold-word" | "classic";
  headline_mode: "fixed" | "intro";
  headline_lines: string[];
  music_enabled: boolean;
  music_gain_delta_db: number;   // relative to the reviewed spec: -3 = music 3 dB lower
  whoosh_enabled: boolean;
  note: string;
  headline_size_pct?: number;    // mini editor (1.4.0): headline font as % of the reviewed spec, 80 to 120; absent = 100
}
export interface CaptionEdit { index: number; from: string; to: string }
/** Mini editor (1.4.0): turn the keyword colour (captions.emphasis_color) on or off for one caption word. */
export interface EmphasisEdit { index: number; word: string; on: boolean }
/**
 * version / edit_key (1.4.0, mini editor): which video was approved ("original", "draft2") and the
 * key of the edits it was rendered from; Finalizar only runs while the current edits have that key.
 */
export interface Approval { approved: true; note: string; video_sha256: string; version?: string; edit_key?: string }
/** One step of the mini editor's undo: the values the sections had before a save; `req` = the AI request that made it (1.7.0). */
export interface UndoEntry { label: string; at: string; sections: Partial<Record<Section, unknown>>; req?: string }
export const UNDO_LIMIT = 50;

export interface Feedback {
  feedback_version: 1;
  revision: number;
  spec: string;               // file name of the reviewed spec, next to this file
  spec_id: string;
  spec_sha256: string;
  video: string;              // file name (or path) of the reviewed MP4
  video_sha256: string;
  created_at: string;
  updated_at: string;
  marks: Mark[];
  trims: Trim[];
  style: StyleChoice | null;
  caption_edits: CaptionEdit[];
  approval: Approval | null;
  emphasis?: EmphasisEdit[];  // 1.4.0; absent in older files
  ops?: EditOp[];             // 1.7.0, editor com IA: validated operations (live-ops.ts), applied in order after the take trims
  saved_at: Partial<Record<Section, string>>;
  history: { revision: number; section: Section; at: string }[];
  undo?: UndoEntry[];         // 1.4.0; newest last, at most UNDO_LIMIT
}
export type Section = "marks" | "trims" | "style" | "caption_edits" | "approval" | "emphasis" | "ops";

export class BadRequest extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export const nowIso = () => new Date().toISOString();

export function feedbackPathFor(specPath: string): string {
  const name = basename(specPath).replace(/(\.plan)?\.spec\.json$/i, "").replace(/\.json$/i, "");
  return join(dirname(specPath), `${name}.feedback.json`);
}

/** Default MP4 for a spec: X.spec.json / X.plan.spec.json -> X.mp4 in the same folder. */
export function videoPathFor(specPath: string): string {
  const name = basename(specPath).replace(/(\.plan)?\.spec\.json$/i, "").replace(/\.json$/i, "");
  return join(dirname(specPath), `${name}.mp4`);
}

const shaCache = new Map<string, { key: string; sha: string }>();
/** sha256 of a file, cached by size and mtime. */
export function fileSha256(path: string): string {
  const st = statSync(path);
  const key = `${st.size}:${st.mtimeMs}`;
  const hit = shaCache.get(path);
  if (hit && hit.key === key) return hit.sha;
  const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
  shaCache.set(path, { key, sha });
  return sha;
}

export function loadFeedback(path: string): Feedback | null {
  if (!existsSync(path)) return null;
  const f = JSON.parse(readFileSync(path, "utf8")) as Feedback;
  if (f.feedback_version !== FEEDBACK_VERSION) throw new Error(`${path}: feedback_version ${f.feedback_version} is not ${FEEDBACK_VERSION}`);
  return f;
}

export function emptyFeedback(spec: EditSpec, specPath: string, videoPath: string): Feedback {
  const t = nowIso();
  return {
    feedback_version: FEEDBACK_VERSION, revision: 0, spec: basename(specPath), spec_id: spec.id,
    spec_sha256: fileSha256(specPath), video: basename(videoPath), video_sha256: fileSha256(videoPath),
    created_at: t, updated_at: t, marks: [], trims: [], style: null, caption_edits: [], approval: null, saved_at: {}, history: [],
  };
}

/** Atomic write (temp file + rename), so a reader never sees half a file. */
export function saveFeedback(path: string, f: Feedback): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(f, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

// ── validation (every value that reaches feedback.json passes through here) ──

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function num(v: unknown, name: string): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (!isNum(n)) throw new BadRequest(`'${name}' precisa ser um número`);
  return n;
}

function text(v: unknown, limit: number, name: string): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new BadRequest(`'${name}' precisa ser texto`);
  return v.replace(/\u0000/g, "").trim().slice(0, limit);
}

export function validateMarks(body: any, spec: EditSpec): Mark[] {
  if (!Array.isArray(body?.marks)) throw new BadRequest("'marks' precisa ser uma lista");
  if (body.marks.length > 200) throw new BadRequest("marcações demais (máximo 200)");
  const out = body.marks.map((m: any, i: number) => {
    if (!m || typeof m !== "object") throw new BadRequest(`marcação ${i + 1} inválida`);
    let a = Math.max(0, Math.min(spec.duration, num(m.in, "in"))), b = Math.max(0, Math.min(spec.duration, num(m.out, "out")));
    if (b < a) [a, b] = [b, a];
    return { in: r3(a), out: r3(b), note: text(m.note, 1000, "note") };
  });
  return out.sort((x: Mark, y: Mark) => x.in - y.in || x.out - y.out);
}

/** Bounds of a take trim, from the source clip length: the edge can only move inside the original take. */
export function trimLimits(spec: EditSpec, id: string, srcDuration: (src: string) => number) {
  const l = takes(spec).find((t) => t.id === id);
  if (!l) return null;
  const speed = l.speed ?? 1, inn = l.in ?? 0, src = srcDuration(l.src);
  return {
    layer: l,
    start_min: r3(Math.max(-2, -inn / speed)),                         // extend the start back to source second 0
    start_max: r3(Math.min(2, l.duration - 0.2)),                       // shorten, keeping 0.2 s
    end_min: r3(Math.max(-2, -(l.duration - 0.2))),
    end_max: r3(Math.min(2, Math.max(0, (src - inn) / speed - l.duration))), // extend up to the end of the source
  };
}

export function validateTrims(body: any, spec: EditSpec, srcDuration: (src: string) => number): Trim[] {
  if (!Array.isArray(body?.trims)) throw new BadRequest("'trims' precisa ser uma lista");
  if (body.trims.length > 100) throw new BadRequest("ajustes demais (máximo 100)");
  const seen = new Set<string>(), out: Trim[] = [];
  for (const [i, t] of body.trims.entries()) {
    if (!t || typeof t.id !== "string") throw new BadRequest(`ajuste ${i + 1}: id do trecho inválido`);
    if (seen.has(t.id)) throw new BadRequest(`o trecho ${t.id} aparece duas vezes`);
    seen.add(t.id);
    const lim = trimLimits(spec, t.id, srcDuration);
    if (!lim) throw new BadRequest(`o trecho ${t.id} não é um take do spec`);
    const sd = r3(t.start_delta === undefined ? 0 : num(t.start_delta, "start_delta"));
    const ed = r3(t.end_delta === undefined ? 0 : num(t.end_delta, "end_delta"));
    if (sd < lim.start_min - 1e-6 || sd > lim.start_max + 1e-6) throw new BadRequest(`${t.id}: início fora do take original (${lim.start_min} a ${lim.start_max} s)`);
    if (ed < lim.end_min - 1e-6 || ed > lim.end_max + 1e-6) throw new BadRequest(`${t.id}: fim fora do take original (${lim.end_min} a ${lim.end_max} s)`);
    if (lim.layer.duration - sd + ed < 0.2) throw new BadRequest(`${t.id}: o trecho ficaria com menos de 0,2 s`);
    if (sd || ed) out.push({ id: t.id, start_delta: sd, end_delta: ed });
  }
  return out;
}

export function validateStyle(body: any): StyleChoice {
  const pick = <T extends string>(v: unknown, opts: readonly T[], name: string): T => {
    if (!opts.includes(v as T)) throw new BadRequest(`'${name}' precisa ser ${opts.join(" ou ")}`);
    return v as T;
  };
  if (!Array.isArray(body?.headline_lines)) throw new BadRequest("'headline_lines' precisa ser uma lista de linhas");
  const lines = body.headline_lines.map((l: unknown) => text(l, 80, "headline_lines")).filter(Boolean);
  if (lines.length < 1 || lines.length > 3) throw new BadRequest("a headline precisa de 1 a 3 linhas");
  if (typeof body.music_enabled !== "boolean") throw new BadRequest("'music_enabled' precisa ser true ou false");
  if (typeof body.whoosh_enabled !== "boolean") throw new BadRequest("'whoosh_enabled' precisa ser true ou false");
  const gain = Math.round(num(body.music_gain_delta_db ?? 0, "music_gain_delta_db") * 2) / 2;
  if (gain < -20 || gain > 10) throw new BadRequest("'music_gain_delta_db' precisa estar entre -20 e +10 dB");
  const size = Math.round(num(body.headline_size_pct ?? 100, "headline_size_pct"));
  if (size < HEADLINE_SIZE_PCT.min || size > HEADLINE_SIZE_PCT.max) throw new BadRequest(`'headline_size_pct' precisa estar entre ${HEADLINE_SIZE_PCT.min} e ${HEADLINE_SIZE_PCT.max}`);
  return {
    caption_preset: pick(body.caption_preset, ["bold-word", "classic"] as const, "caption_preset"),
    headline_mode: pick(body.headline_mode, ["fixed", "intro"] as const, "headline_mode"),
    headline_lines: lines,
    music_enabled: body.music_enabled,
    music_gain_delta_db: gain,
    whoosh_enabled: body.whoosh_enabled,
    note: text(body.note, 2000, "note"),
    headline_size_pct: size,
  };
}

/**
 * Safe limits of the headline size in the mini editor, as % of the spec's font. Below 80 % the
 * Anton headline of the talking-head template nears the QA floor (60 px libass); above 120 % the
 * render fit (max_width_px) shrinks it back anyway.
 */
export const HEADLINE_SIZE_PCT = { min: 80, max: 120 } as const;

export function validateEmphasis(body: any, spec: EditSpec): EmphasisEdit[] {
  if (!Array.isArray(body?.edits)) throw new BadRequest("'edits' precisa ser uma lista");
  const words = spec.captions?.words ?? [];
  if (!words.length) throw new BadRequest("este spec não tem legenda");
  if (body.edits.length > words.length) throw new BadRequest("destaques demais");
  const byIndex = new Map<number, EmphasisEdit>();
  for (const [i, e] of body.edits.entries()) {
    const idx = num(e?.index, "index");
    if (!Number.isInteger(idx) || idx < 0 || idx >= words.length) throw new BadRequest(`destaque ${i + 1}: palavra inexistente`);
    const word = text(e.word, 60, "word");
    if (word !== words[idx].word) throw new BadRequest(`destaque ${i + 1}: a palavra ${idx} é "${words[idx].word}", não "${word}"`, 409);
    if (typeof e.on !== "boolean") throw new BadRequest(`destaque ${i + 1}: 'on' precisa ser true ou false`);
    if (e.on !== !!words[idx].emphasis) byIndex.set(idx, { index: idx, word, on: e.on });
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

export function validateCaptionEdits(body: any, spec: EditSpec): CaptionEdit[] {
  if (!Array.isArray(body?.edits)) throw new BadRequest("'edits' precisa ser uma lista");
  const words = spec.captions?.words ?? [];
  if (!words.length) throw new BadRequest("este spec não tem legenda");
  if (body.edits.length > words.length) throw new BadRequest("correções demais");
  const byIndex = new Map<number, CaptionEdit>();
  for (const [i, e] of body.edits.entries()) {
    const idx = num(e?.index, "index");
    if (!Number.isInteger(idx) || idx < 0 || idx >= words.length) throw new BadRequest(`correção ${i + 1}: palavra inexistente`);
    const from = text(e.from, 60, "from"), to = text(e.to, 40, "to");
    if (from !== words[idx].word) throw new BadRequest(`correção ${i + 1}: a palavra ${idx} é "${words[idx].word}", não "${from}"`, 409);
    if (!to) throw new BadRequest(`correção ${i + 1}: o texto novo está vazio`);
    if (/\s/.test(to)) throw new BadRequest(`correção ${i + 1}: uma palavra por vez (sem espaço)`);
    if (to !== from) byIndex.set(idx, { index: idx, from, to });
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * The approval names the sha256 of the MP4 watched. `allowed` is the reviewed MP4 (a sha256) or, in
 * the mini editor, every video of the session with its version name and edit key.
 */
export function validateApproval(body: any, allowed: string | { sha256: string; version: string; edit_key: string }[]): Approval {
  const sha = text(body?.video_sha256, 64, "video_sha256");
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new BadRequest("a aprovação precisa do sha256 do vídeo assistido");
  const note = text(body.note, 2000, "note");
  if (typeof allowed === "string") {
    if (sha !== allowed) throw new BadRequest("o vídeo mudou; assista à versão atual e aprove de novo", 409);
    return { approved: true, note, video_sha256: sha };
  }
  const v = allowed.find((a) => a.sha256 === sha);
  if (!v) throw new BadRequest("este vídeo não é desta sessão; recarregue a página e aprove de novo", 409);
  return { approved: true, note, video_sha256: sha, version: v.version, edit_key: v.edit_key };
}

/** The style the spec has now: the starting point of the style panel and the base apply-feedback compares to. */
export function styleOfSpec(spec: EditSpec): StyleChoice {
  const hook = spec.texts.find((t) => t.role === "hook");
  return {
    caption_preset: spec.captions?.preset === "bold-word" ? "bold-word" : "classic",
    headline_mode: hook?.mode === "intro" ? "intro" : "fixed",
    headline_lines: hook ? [...hook.lines] : [],
    music_enabled: !!spec.audio.music,
    music_gain_delta_db: 0,
    whoosh_enabled: spec.audio.sfx.some(isWhoosh),
    note: "",
    headline_size_pct: 100,
  };
}

export const isWhoosh = (s: { src: string; hook?: string }) => s.hook === "whoosh" || /whoosh/i.test(basename(s.src));

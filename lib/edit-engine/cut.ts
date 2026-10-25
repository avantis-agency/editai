// Measured cut and standard cleanup (EditAi 2.2.0, wave 2 of the editonny fusion). Bun only.
//
//   bun lib/edit-engine/cli.ts cut <recordings folder | video ...> [--project DIR] [--name N] [--lang pt]
//        [--script F] [--fix "kiwifai=Kiwify"] [--plan cut.plan.json] [--pace tight|natural|reverent]
//        [--fit N] [--denoise off|auto|light|strong] [--prompt "Nomes"] [--no-audit] [--dry-run]
//
// Raw recordings in, the takes of an EditAi spec out, every step measured by the installed editonny 1.0.0
// (subprocess, its .venv Python, -B, offline, nothing written into the install):
//   1. diagnosis: noise_check.py (noise, clipping, echo) before editing;
//   2. words: transcribe_batch.py (a folder) or transcribe.py (files), cached in the edit folder;
//   3. phrases: pack_transcripts.py (takes_packed.md);
//   4. draft: assemble_cut.py splits at measured pauses and flags false starts, retakes, breaths and
//      hesitations (edl.draft.json, automatic-cut.md). A draft, never the final cut;
//   5. EditAi review of the draft (the standard cleanup contract, matrix 3.1 and 12.2): breaths, noise,
//      hesitations, false starts and retakes go; a complete sentence said again right away, word for
//      word, is emphasis and stays (unless --plan or --fit says otherwise); a word the draft left
//      between two blocks without a decision goes back to its neighbour; an edge inside a word moves
//      past the word; --plan keeps or drops what the agent decided;
//   6. edges: waveform_cut.py (10 ms RMS, 60/70 ms pads, consonant tails) and precise_edges.py;
//   7. pace: the EditAi keeps a pause on purpose only where the pace asks for it (after a sentence, after
//      a comma), extending the outgoing take into its own measured silence; every junction also keeps
//      the J-cut lead clear of the last word. These pauses are written as holds for the QA;
//   8. fit (--fit N, "caber em N segundos"): repeated sentences first, then what --plan marked optional,
//      then the pace down to tight; what came out is listed; if it still does not fit, exit 4;
//   9. proof: render_cut.py renders the cut (16:9, plain), verify_cut.py checks junctions (cut inside a
//      word, clicks, levels) with one automatic repair pass, audit_cut.py retranscribes the cut, and the
//      EditAi compares the whole speech with the expected one (the script, or the kept words);
//  10. words for captions: align_words.py measures onsets on the source (a correction over 0.25 s is
//      refused), the script fixes the spelling word by word (it never adds speech), --fix maps the
//      transcriber's misspellings;
//  11. optional denoise (denoise.ts) of each source into a WAV that the takes use as their audio.
// Output in <project>/editai/cut/<name>/: cut.json (takes, words files, holds, removals, proof), CORTE.md
// (the report: draft and final side by side, what was cut with times and why) and edit/ (editonny files).
// Without editonny: exit 3 (the takes are then written by hand or by the agent, as before).
//
// --continuous (2.3.0, cut "none"): for a church service, a sermon or anything that must play whole. Only
// steps 1, 2, 10 and 11 run: diagnosis, words, measured onsets and spelling for the captions, optional
// denoise. Steps 3 to 9 (draft, review, edges, pace, fit, proof) do not: nothing is cut, and each source
// becomes one take from its first to its last frame. cut.json says mode "none"; th-batch then builds a
// continuous spec (no punch-in, zoom or reframe; lib/edit-engine/continuous.ts).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { editonnyStatus, runHelper, type EditonnyStatus } from "./editonny.ts";
import { probe, hasAudio } from "./measure.ts";
import { appDir } from "./project.ts";
import { envelope, quietAround, silences, soundAfter, threshold } from "./silence.ts";
import { denoiseSource, noiseCheck, type DenoiseMode, type NoiseReport } from "./denoise.ts";

export type Pace = "tight" | "natural" | "reverent";
/** Pause kept after a sentence / after a comma (seconds of silence heard), and the still tail at the end. */
export const PACES: Record<Pace, { sentence_s: number; comma_s: number; end_hold_s: number }> = {
  tight: { sentence_s: 0, comma_s: 0, end_hold_s: 0.15 },
  natural: { sentence_s: 0.3, comma_s: 0, end_hold_s: 0.4 },
  reverent: { sentence_s: 0.38, comma_s: 0.25, end_hold_s: 0.8 },
};
const VIDEO = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"]);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const norm = (w: string) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ts = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;

interface TWord { text: string; start: number; end: number; prob?: number; stem: string; i: number }
interface Block { stem: string; a: number; b: number; text: string; kept: boolean; draft: "kept" | "dropped"; reason: string; decision?: string; by?: string; beat?: string; restored?: "emphasis" | "plan" | "orphan" }
interface Sel { text?: string; source?: string; at?: number; why?: string }
export interface CutPlan { keep?: Sel[]; drop?: Sel[]; optional?: Sel[] }
export interface CutOptions {
  inputs: string[]; project: string; name?: string; lang?: string; prompt?: string; script?: string; fix?: Record<string, string>;
  plan?: CutPlan; pace?: Pace; fit?: number; denoise?: DenoiseMode | "auto"; audit?: boolean; dryRun?: boolean; jcutFrames?: number;
  continuous?: boolean;   // 2.3.0: cut "none", the sources whole (see the header)
}
export interface CutTake { id: string; src: string; in: number; duration: number; framing: string; beat: string; quote: string; audio_src?: string }
export interface CutResult {
  cut_version: 1; mode?: "measured" | "none"; name: string; dir: string; edit_dir: string; sources: Record<string, string>; pace: Pace; jcut_frames: number;
  takes: CutTake[]; words_files: Record<string, string>; holds: { start: number; end: number; max_s: number; why: string }[]; end_hold_s: number;
  duration: { raw: number; draft: number; final: number };
  removed: { source: string; start: number; end: number; text: string; why: string; by: string }[];
  kept_against_draft: { source: string; start: number; end: number; text: string; why: string }[];
  fit: { target: number | null; ok: boolean | null; removed: string[]; note: string } ;
  diagnosis: NoiseReport | null; denoise: { mode: string; sources: Record<string, string> };
  verify: { flags: string[]; clicks: number | null; inside_words: number | null; within_speech: number | null; passes: number; report: string | null; junction_silence?: number[] };
  audit: { ran: boolean; speech_equal: boolean | null; expected: string; heard: string; diff: string[]; breaths: string; per_interval: string; log: string | null };
  notes: string[]; exit: number;
}

// ── small text tools ─────────────────────────────────────────────────────────────────

/** "kiwifai=Kiwify,quiwify=Kiwify" -> map on normalized words. */
export function parseFix(s?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of (s ?? "").split(",")) { const [a, b] = kv.split("=").map((x) => x?.trim()); if (a && b) out[norm(a)] = b; }
  return out;
}

/** Longest common subsequence alignment of two token lists; equal-length gaps between matches pair up 1:1. */
export function alignTokens(a: string[], b: string[]): (number | null)[] {
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const map: (number | null)[] = new Array(n).fill(null);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  for (const [i, j] of pairs) map[i] = j;
  // substitutions: a run of unmatched a between two matches with the same number of unmatched b
  let pi = -1, pj = -1;
  for (const [i, j] of [...pairs, [n, m] as [number, number]]) {
    if (i - pi - 1 > 0 && i - pi - 1 === j - pj - 1) for (let k = 1; k < i - pi; k++) map[pi + k] = pj + k;
    pi = i; pj = j;
  }
  return map;
}

/** Script tokens with their trailing punctuation: "Dele," -> {word: "Dele", punct: ","}. */
function scriptTokens(script: string) {
  return script.split(/\s+/).filter((t) => norm(t)).map((t) => {
    const m = t.match(/^(.*?)([.,!?;:…"»”)]*)$/u)!;
    return { raw: t, word: m[1].replace(/^[«“"(]+/u, ""), punct: m[2].replace(/["»”)]/g, ""), n: norm(t) };
  });
}

// ── editonny steps ─────────────────────────────────────────────────────────────────

function helper(st: EditonnyStatus, name: string, args: string[], cwd: string, log: string[], timeoutMs = 1_800_000) {
  const r = runHelper(st, name, args, cwd, timeoutMs);
  log.push(`$ ${name}.py ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}  (saída ${r.code}, ${r.seconds.toFixed(1)} s)`);
  return r;
}

/** "- clip-a [12.10-13.40] "a gente vai ver" · tomada repetida (...)" lines of automatic-cut.md. */
export function parseDropped(md: string): { stem: string; a: number; b: number; text: string; reason: string }[] {
  const out: { stem: string; a: number; b: number; text: string; reason: string }[] = [];
  // the editonny writes the report in text mode: CRLF on Windows
  const sec = md.replace(/\r\n/g, "\n").split(/^## /m).find((s) => /^Tirado/.test(s)) ?? "";
  for (const line of sec.split("\n")) {
    const m = line.trim().match(/^- (.+?) \[([\d.]+)-([\d.]+)\] "(.*)" · (.+)$/);
    if (m) out.push({ stem: m[1], a: Number(m[2]), b: Number(m[3]), text: m[4], reason: m[5].trim() });
  }
  return out;
}

const matches = (sel: Sel, b: Block, ws: TWord[]) => {
  if (sel.source && sel.source !== b.stem) return false;
  if (sel.at !== undefined && !(sel.at >= b.a - 0.05 && sel.at <= b.b + 0.05)) return false;
  if (sel.text) {
    const t = ws.filter((w) => w.stem === b.stem && mid(w) >= b.a && mid(w) < b.b).map((w) => norm(w.text)).join(" ");
    if (!` ${t} `.includes(` ${sel.text.split(/\s+/).map(norm).filter(Boolean).join(" ")} `)) return false;
  }
  return sel.text !== undefined || sel.at !== undefined;
};
const mid = (w: { start: number; end: number }) => (w.start + w.end) / 2;
const toks = (ws: TWord[], b: { stem: string; a: number; b: number }) => ws.filter((w) => w.stem === b.stem && mid(w) >= b.a && mid(w) < b.b).map((w) => norm(w.text)).filter(Boolean);

/**
 * The EditAi review of assemble_cut's draft. Returns every block (kept and dropped) with the final
 * decision and its reason. Rules in the header of this file (step 5).
 */
export function reviewDraft(kept: { stem: string; start: number; end: number }[], dropped: ReturnType<typeof parseDropped>, words: TWord[], order: string[], plan: CutPlan): Block[] {
  const blocks: Block[] = [
    ...kept.map((r) => ({ stem: r.stem, a: r.start, b: r.end, text: "", kept: true, draft: "kept" as const, reason: "rascunho: frase completa" })),
    ...dropped.map((d) => ({ stem: d.stem, a: d.a, b: d.b, text: d.text, kept: false, draft: "dropped" as const, reason: d.reason })),
  ].sort((x, y) => order.indexOf(x.stem) - order.indexOf(y.stem) || x.a - y.a);
  for (const b of blocks) b.text = words.filter((w) => w.stem === b.stem && mid(w) >= b.a && mid(w) < b.b).map((w) => w.text).join(" ") || b.text;
  const nextKept = (k: number) => blocks.slice(k + 1).find((x) => x.draft === "kept" && x.stem === blocks[k].stem);
  blocks.forEach((b, k) => {
    if (b.draft === "kept") { b.decision = "fica: frase completa do rascunho"; b.by = "rascunho"; return; }
    if (/no speech|breath|noise/i.test(b.reason)) { b.decision = "sai: respiração ou ruído (sem fala)"; b.by = "rascunho"; return; }
    if (/hesitation/i.test(b.reason)) { b.decision = `sai: hesitação ("${b.text}")`; b.by = "rascunho"; return; }
    if (/abandonada|abandoned/i.test(b.reason)) { b.decision = "sai: fim de tomada abandonada, refeita logo depois"; b.by = "rascunho"; return; }
    if (/repetida|retake|repeated/i.test(b.reason)) {
      const nk = nextKept(k), mine = toks(words, b), theirs = nk ? toks(words, nk) : [];
      const same = mine.length >= 3 && theirs.length === mine.length && mine.every((t, i) => t === theirs[i]);
      if (same && nk && nk.a - b.b < 2.0) {
        b.kept = true; b.restored = "emphasis"; b.decision = "fica: frase completa repetida em seguida, palavra por palavra (ênfase, não erro)"; b.by = "EditAi";
        return;
      }
      const opens = theirs.length > mine.length && mine.slice(0, -1).every((t, i) => t === theirs[i] || theirs.slice(0, mine.length + 1).includes(t));
      b.decision = opens || mine.length < theirs.length ? `sai: falso começo, recomeçado em "${nk ? words.filter((w) => w.stem === nk.stem && mid(w) >= nk.a && mid(w) < nk.b).slice(0, 6).map((w) => w.text).join(" ") : "?"}..."` : "sai: tomada repetida, a melhor vem depois";
      b.by = "rascunho";
      return;
    }
    b.decision = `sai: ${b.reason}`; b.by = "rascunho";
  });
  for (const b of blocks) {
    const d = plan.drop?.find((s) => matches(s, b, words));
    const keep = plan.keep?.find((s) => matches(s, b, words));
    if (keep && !b.kept) { b.kept = true; b.restored = "plan"; b.decision = `fica: pedido do plano${keep.why ? ` (${keep.why})` : ""}`; b.by = "plano"; }
    if (d && b.kept) { b.kept = false; b.restored = undefined; b.decision = `sai: pedido do plano${d.why ? ` (${d.why})` : ""}`; b.by = "plano"; }
  }
  // words outside every block: back to the nearest kept block of the same source when it is close
  for (const w of words) {
    if (blocks.some((b) => b.stem === w.stem && mid(w) >= b.a && mid(w) < b.b)) continue;
    const near = blocks.filter((b) => b.kept && b.stem === w.stem).map((b) => ({ b, d: w.start >= b.b ? w.start - b.b : b.a - w.end })).filter((x) => x.d >= -0.05 && x.d < 0.6).sort((x, y) => x.d - y.d)[0];
    if (near) {
      const others = blocks.filter((b) => b !== near.b && b.stem === w.stem);
      const nextA = Math.min(...others.filter((b) => b.a >= near.b.b - 0.01).map((b) => b.a), Infinity);
      const prevB = Math.max(...others.filter((b) => b.b <= near.b.a + 0.01).map((b) => b.b), -Infinity);
      if (w.start >= near.b.b) { if (w.end + 0.06 >= nextA) continue; near.b.b = r3(w.end + 0.06); }
      else { if (w.start - 0.07 <= prevB) continue; near.b.a = r3(Math.max(0, w.start - 0.07)); }
      near.b.decision += ` · "${w.text}" estava fora de todo bloco e voltou`;
    }
  }
  return blocks;
}

/** A kept range whose edge falls inside a word that belongs to it: the edge moves past the word. */
export function edgesOutOfWords(ranges: { source: string; start: number; end: number }[], words: TWord[], notes: string[]) {
  ranges.forEach((r, k) => {
    const nextStart = ranges.slice(k + 1).find((x) => x.source === r.source)?.start ?? Infinity;
    const prevEnd = [...ranges.slice(0, k)].reverse().find((x) => x.source === r.source)?.end ?? -Infinity;
    for (const w of words) {
      if (w.stem !== r.source) continue;
      if (w.start < r.end && w.end > r.end && mid(w) >= r.start && mid(w) < r.end + (w.end - w.start) / 2) {
        const e = Math.min(r3(w.end + 0.04), r3(nextStart - 0.02));
        if (e > r.end) { notes.push(`borda dentro de "${w.text}" (${r.source} ${r.end.toFixed(2)} s): fim levado para ${e.toFixed(2)} s`); r.end = e; }
      }
      if (w.start < r.start && w.end > r.start && mid(w) >= r.start - (w.end - w.start) / 2 && mid(w) < r.end) {
        const s = Math.max(r3(w.start - 0.04), r3(prevEnd + 0.02), 0);
        if (s < r.start) { notes.push(`borda dentro de "${w.text}" (${r.source} ${r.start.toFixed(2)} s): início levado para ${s.toFixed(2)} s`); r.start = s; }
      }
    }
  });
}

// ── the run ─────────────────────────────────────────────────────────────────────────

export function listInputs(inputs: string[]): { files: string[]; folder: string | null } {
  if (inputs.length === 1 && existsSync(inputs[0]) && statSync(inputs[0]).isDirectory()) {
    const d = resolve(inputs[0]);
    const files = readdirSync(d).filter((f) => VIDEO.has(extname(f).toLowerCase())).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map((f) => join(d, f));
    return { files, folder: d };
  }
  return { files: inputs.map((f) => resolve(f)), folder: null };
}

export async function runCut(o: CutOptions): Promise<CutResult> {
  const st = editonnyStatus();
  const { files, folder } = listInputs(o.inputs);
  if (!files.length) throw new Error("nenhum vídeo: dê uma pasta com gravações ou os arquivos");
  for (const f of files) { if (!existsSync(f)) throw new Error(`não existe: ${f}`); if (!hasAudio(f)) throw new Error(`sem áudio: ${f}`); }
  const name = (o.name ?? basename(folder ?? files[0]).replace(/\.[^.]+$/, "")).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "corte";
  const dir = appDir(o.project, "cut", name);
  const edit = join(dir, "edit");
  mkdirSync(edit, { recursive: true });
  const pace: Pace = o.pace ?? "tight";
  const jf = o.jcutFrames ?? 2;
  const log: string[] = [], notes: string[] = [];
  const stems = files.map((f) => basename(f).replace(/\.[^.]+$/, ""));
  const sources: Record<string, string> = Object.fromEntries(stems.map((s, i) => [s, files[i]]));
  const res: CutResult = {
    cut_version: 1, mode: o.continuous ? "none" : "measured", name, dir, edit_dir: edit, sources, pace, jcut_frames: jf, takes: [], words_files: {}, holds: [], end_hold_s: 0,
    duration: { raw: r3(files.reduce((s, f) => s + probe(f).duration, 0)), draft: 0, final: 0 }, removed: [], kept_against_draft: [],
    fit: { target: o.fit ?? null, ok: null, removed: [], note: "" }, diagnosis: null, denoise: { mode: String(o.denoise ?? "off"), sources: {} },
    verify: { flags: [], clicks: null, inside_words: null, within_speech: null, passes: 0, report: null },
    audit: { ran: false, speech_equal: null, expected: "", heard: "", diff: [], breaths: "", per_interval: "", log: null }, notes, exit: 0,
  };
  if (!st.usable) { res.exit = 3; notes.push(`sem editonny: ${st.reason}. Os takes ficam a cargo do agente (palavras de outro transcritor), como antes; o QA de silêncio e o SRT continuam.`); writeOut(res, log); return res; }

  // 1. diagnosis
  res.diagnosis = noiseCheck(files, edit);
  // 2. words
  const lang = o.lang ?? "auto";
  const tArgs = (x: string) => [x, "--edit-dir", edit, "--language", lang, ...(o.prompt ? ["--prompt", o.prompt] : ["--no-prompt"])];
  if (folder) { const r = helper(st, "transcribe_batch", tArgs(folder), edit, log); if (r.code !== 0) throw new Error(`transcribe_batch: ${r.stderr.trim().split("\n").pop()}`); }
  else for (const f of files) { const r = helper(st, "transcribe", tArgs(f), edit, log); if (r.code !== 0) throw new Error(`transcribe: ${r.stderr.trim().split("\n").pop()}`); }
  const words: TWord[] = [];
  for (const s of stems) {
    const tr = JSON.parse(readFileSync(join(edit, "transcripts", `${s}.json`), "utf8"));
    for (const w of tr.words ?? []) if (w.start !== null && w.start !== undefined) words.push({ text: String(w.text).trim(), start: w.start, end: w.end, prob: w.prob, stem: s, i: words.length });
  }
  // script alignment: spelling, punctuation (sentence and comma ends) and the expected speech
  const sTok = o.script ? scriptTokens(o.script) : [];
  const fix = o.fix ?? {};
  const fixN = (w: string) => norm(fix[norm(w)] ?? w);
  const amap = sTok.length ? alignTokens(words.map((w) => fixN(w.text)), sTok.map((t) => t.n)) : [];
  const punctOf = (w: TWord): string => {
    const j = amap[w.i];
    if (j !== null && j !== undefined) return sTok[j].punct;
    return (w.text.match(/[.,!?;:…]+$/u)?.[0] ?? "");
  };

  // 10. words for captions: measured onsets, script spelling, --fix
  const captionWords = () => {
    const wfDir = join(dir, "words");
    mkdirSync(wfDir, { recursive: true });
    for (const s of stems) {
      const aw = join(edit, "verify", `words_${s}.json`);
      helper(st, "align_words", ["--video", sources[s], "--transcript", join(edit, "transcripts", `${s}.json`), "--all", "-o", aw], edit, log);
      let onsets: any[] = [];
      try { const j = JSON.parse(readFileSync(aw, "utf8")); onsets = j.words ?? j; } catch { onsets = []; }
      let moved = 0, refused = 0;
      const byI = new Map(onsets.map((m: any, k: number) => [m?.i ?? k, m]));
      const out = words.filter((w) => w.stem === s).map((w, k) => {
        const m: any = byI.get(k);
        let start = w.start;
        const ws = Number(m?.start);
        if (Number.isFinite(ws) && Math.abs(ws - w.start) >= 0.01) {
          if (Math.abs(ws - w.start) <= 0.25 && ws < w.end - 0.02) { start = ws; moved++; } else refused++;
        }
        const j = amap[w.i];
        let text = j !== null && j !== undefined ? sTok[j].word : (fix[norm(w.text)] ?? w.text.replace(/[.,!?;:…]+$/u, ""));
        const p = j !== null && j !== undefined ? sTok[j].punct : (w.text.match(/[.,!?;:…]+$/u)?.[0] ?? "");
        text += p.replace(/[.…]/g, "");   // the caption breaks at the pause; the full stop stays out, comma and question mark stay
        return { word: text, start: r3(start), end: r3(w.end), whisper: w.text };
      });
      const file = join(wfDir, `${s}.words.json`);
      writeFileSync(file, JSON.stringify({ source: sources[s], engine: "editonny faster-whisper + align_words (onsets) + EditAi spelling", language: lang,
        words: out, note: `source-time words; ${moved} onsets moved by align_words (<= 0.25 s), ${refused} refused (larger jumps are not trusted); spelling from ${sTok.length ? "the script, word by word" : "the transcriber"}${Object.keys(fix).length ? " and --fix" : ""}` }, null, 2));
      res.words_files[basename(sources[s])] = file;
    }
  };
  // 11. denoise
  const denoise = () => {
    const dmode: DenoiseMode = o.denoise === "auto" ? (res.diagnosis?.suggest ?? "off") : (o.denoise ?? "off");
    res.denoise.mode = o.denoise === "auto" ? `auto -> ${dmode}` : dmode;
    if (dmode !== "off") for (const s of stems) {
      const d = denoiseSource(sources[s], dmode, edit, appDir(o.project, "cache", "denoise"));
      if (d.ok) { res.denoise.sources[s] = d.wav!; notes.push(`denoise ${d.applied} em ${s}: piso de ruído ${d.report?.floor_before_db ?? "?"} -> ${d.report?.floor_after_db ?? "?"} dBFS (${d.report?.profile?.how ?? ""})`); }
      else notes.push(`denoise em ${s} não aplicado: ${d.reason}`);
    }
  };

  // continuous (2.3.0, cut "none"): nothing is cut; each source is one take, first to last frame
  if (o.continuous) {
    captionWords();
    denoise();
    res.pace = pace;
    res.takes = stems.map((stem, k) => {
      const t: CutTake = { id: `c${String(k + 1).padStart(2, "0")}`, src: sources[stem], in: 0, duration: r3(probe(sources[stem]).duration), framing: "talking-head", beat: "inteiro",
        quote: words.filter((w) => w.stem === stem).slice(0, 8).map((w) => w.text).join(" ") };
      if (res.denoise.sources[stem]) t.audio_src = res.denoise.sources[stem];
      return t;
    });
    res.duration.draft = res.duration.raw;
    res.duration.final = r3(res.takes.reduce((a, t) => a + t.duration, 0));
    notes.push("contínuo (cut none): nada foi cortado; rascunho, revisão, bordas, ritmo, caber em N s e a prova do corte não rodam");
    writeOut(res, log);
    return res;
  }

  // 3. phrases, 4. draft
  helper(st, "pack_transcripts", ["--edit-dir", edit], edit, log);
  const ra = helper(st, "assemble_cut", ["--edit-dir", edit, "--sources", ...files, "--pause", "0.35", "--format", "horizontal"], edit, log);
  if (ra.code !== 0 || !existsSync(join(edit, "edl.json"))) throw new Error(`assemble_cut: ${ra.stderr.trim().split("\n").pop()}`);
  copyFileSync(join(edit, "edl.json"), join(edit, "edl.draft.json"));
  const draft = JSON.parse(readFileSync(join(edit, "edl.draft.json"), "utf8"));
  res.duration.draft = r3(draft.ranges.reduce((s: number, r: any) => s + r.end - r.start, 0));
  const dropped = parseDropped(readFileSync(join(edit, "automatic-cut.md"), "utf8"));

  // 5. review
  const plan = o.plan ?? {};
  const blocks = reviewDraft(draft.ranges.map((r: any) => ({ stem: r.source, start: r.start, end: r.end })), dropped, words, stems, plan);
  let n = 0;
  for (const b of blocks) { b.beat = `b${String(++n).padStart(2, "0")}`; }
  for (const b of blocks) {
    if (!b.kept) res.removed.push({ source: b.stem, start: r2(b.a), end: r2(b.b), text: b.text, why: b.decision!, by: b.by! });
    else if (b.draft === "dropped") res.kept_against_draft.push({ source: b.stem, start: r2(b.a), end: r2(b.b), text: b.text, why: b.decision! });
  }
  writeFileSync(join(edit, "review.json"), JSON.stringify(blocks, null, 2));

  // the selection, one interval per kept block (waveform_cut refines and splits it)
  const env = new Map<string, { db: Float32Array; th: number }>();
  for (const s of stems) { const db = envelope(sources[s]); env.set(s, { db, th: threshold(db) }); }
  const manual = blocks.filter((b) => b.kept).map((b, k) => ({ id: `m${String(k + 1).padStart(2, "0")}`, source: b.stem, start: r3(b.a), end: r3(b.b), beat: b.beat!, quote: b.text, reason: b.decision!, gain_db: 0 }));
  for (const m of manual) { const g = draft.ranges.find((r: any) => r.source === m.source && Math.abs(r.start - m.start) < 0.3); if (g?.gain_db) m.gain_db = g.gain_db; }
  edgesOutOfWords(manual, words, notes);

  const buildEdl = (ranges: any[]) => ({ ...draft, ranges, jcut: { lead_frames: jf, tail_trim_frames: 0 } });
  let fitDropBeats = new Set<string>();
  let usePace: Pace = pace;
  const refine = (): any[] => {
    const sel = manual.filter((m) => !fitDropBeats.has(m.beat));
    writeFileSync(join(edit, "edl_manual.json"), JSON.stringify(buildEdl(sel), null, 2));
    const w = helper(st, "waveform_cut", [join(edit, "edl_manual.json"), "-o", join(edit, "edl.json")], edit, log);
    if (w.code !== 0) throw new Error(`waveform_cut: ${w.stderr.trim().split("\n").pop()}`);
    for (const line of w.stdout.split("\n")) if (/warning:/.test(line)) notes.push(`waveform_cut: ${line.replace(/^\s*warning:\s*/, "")}`);
    helper(st, "precise_edges", [join(edit, "edl.json"), "--apply"], edit, log);
    const e = JSON.parse(readFileSync(join(edit, "edl.json"), "utf8"));
    edgesOutOfWords(e.ranges, words, notes);
    return e.ranges;
  };

  // 7. pace and J-cut room at every junction, measured on the source envelope
  const fps = probe(files[0]).fps || 30;
  const jcut = jf / fps;
  // the extension is always measured from the waveform edge (base_end), so pace and repairs never stack;
  // `adj` is the correction measured on the rendered cut (step 9)
  const srcDur = Object.fromEntries(stems.map((s) => [s, probe(sources[s]).duration]));
  const applyPace = (ranges: any[], p: Pace) => {
    const P = PACES[p], holds: { k: number; s: number; why: string }[] = [];
    ranges.forEach((r, k) => {
      r.base_end ??= r.end;
      const base = r.base_end as number;
      const e = env.get(r.source)!;
      const last = words.filter((w) => w.stem === r.source && mid(w) >= r.start && mid(w) < base).pop();
      const next = ranges[k + 1];
      const isLast = k === ranges.length - 1;
      const pn = last ? punctOf(last) : "";
      const sentence = /[.!?…]/.test(pn) || (!sTok.length && !pn && next && next.source === r.source && next.start - base > 1.0 && /^\p{Lu}/u.test(words.find((w) => w.stem === next.source && mid(w) >= next.start)?.text ?? ""));
      const comma = !sentence && /[,;:]/.test(pn);
      const tail = quietAround(e.db, e.th, base, -1, 1);            // silence already inside the range end
      // room after it in the source: clean silence only (a breath, a noise or the next word ends it)
      const nextWord = words.find((w) => w.stem === r.source && w.start >= base - 0.02);
      const room = Math.min(soundAfter(e.db, e.th, base), nextWord ? nextWord.start - base - 0.1 : 5);
      const nextHead = next ? quietAround(env.get(next.source)!.db, env.get(next.source)!.th, next.start, 1, 1) : 0;
      const want = isLast ? P.end_hold_s : sentence ? P.sentence_s : comma ? P.comma_s : 0;
      const heard = tail + nextHead;
      let ext = Math.max(want > 0 ? want - heard : 0, isLast ? 0 : Math.max(0, jcut + 0.02 - tail)) + (r.adj ?? 0);
      const sameNext = next && next.source === r.source && next.start >= base ? next.start - base - 0.03 : Infinity;
      ext = Math.max(isLast ? 0 : Math.max(0, Math.min(jcut + 0.02 - tail, room - 0.03)), Math.min(ext, room - 0.03, sameNext, srcDur[r.source] - base - 0.02));
      r.end = r3(base + Math.max(0, ext));
      r.hold_target = want;
      if (want > 0) holds.push({ k, s: r3(Math.min(want, heard + Math.max(0, ext))), why: isLast ? "fim parado" : sentence ? `fim de frase (${p})` : `vírgula (${p})` });
    });
    return holds;
  };
  /** Silence heard at every junction of the rendered cut (cut_timeline audio starts), measured like the QA. */
  const junctionSilences = (): number[] => {
    const tl = JSON.parse(readFileSync(join(edit, "cut_timeline.json"), "utf8"));
    const mp4 = join(edit, "cut.mp4");
    // runs split by a blip of 50 ms or less are one pause to the ear
    const runs: { start: number; end: number }[] = [];
    for (const x of silences(mp4, 0.04).runs) { const l = runs[runs.length - 1]; if (l && x.start - l.end <= 0.05) l.end = x.end; else runs.push({ ...x }); }
    return (tl.segments as any[]).slice(1).map((s) => {
      const t = Number(s.audio_out_start ?? s.out_start);
      const run = runs.find((x) => x.start <= t + 0.12 && x.end >= t - 0.12);
      return run ? r3(Math.min(run.end, tl.duration) - run.start) : 0;
    });
  };
  let ranges = refine();
  let holds = applyPace(ranges, usePace);
  // the EditAi timeline: every take after the first starts its picture jcut later (its audio leads by jcut)
  const total = (rs: any[]) => rs.reduce((s, r) => s + r.end - r.start, 0) - Math.max(0, rs.length - 1) * jcut;

  // 8. fit in N seconds
  if (o.fit) {
    const target = o.fit;
    const beatsRepeated = blocks.filter((b) => b.kept && b.restored === "emphasis").map((b) => b.beat!);
    const optional = blocks.filter((b) => b.kept && plan.optional?.some((s) => matches(s, b, words))).map((b) => b.beat!);
    const queue: { kind: "beat" | "pace"; beat?: string; pace?: Pace; why: string }[] = [
      ...beatsRepeated.map((b) => ({ kind: "beat" as const, beat: b, why: "frase repetida (ênfase)" })),
      ...optional.map((b) => ({ kind: "beat" as const, beat: b, why: "desvio marcado no plano" })),
      ...(usePace === "reverent" ? [{ kind: "pace" as const, pace: "natural" as Pace, why: "ritmo reverente -> natural" }] : []),
      ...(usePace !== "tight" ? [{ kind: "pace" as const, pace: "tight" as Pace, why: "ritmo -> justo (pausas mínimas)" }] : []),
    ];
    while (total(ranges) > target && queue.length) {
      const q = queue.shift()!;
      if (q.kind === "beat") {
        fitDropBeats.add(q.beat!);
        const b = blocks.find((x) => x.beat === q.beat)!;
        res.fit.removed.push(`${b.stem} ${ts(b.a)}-${ts(b.b)} "${b.text}" · ${q.why}`);
        res.removed.push({ source: b.stem, start: r2(b.a), end: r2(b.b), text: b.text, why: `sai: para caber em ${target} s (${q.why})`, by: "caber em N s" });
        res.kept_against_draft = res.kept_against_draft.filter((x) => !(x.source === b.stem && x.start === r2(b.a)));
        b.kept = false; b.decision = `sai: para caber em ${target} s (${q.why})`; b.by = "caber em N s";
      } else { usePace = q.pace!; res.fit.removed.push(q.why); }
      ranges = refine();
      holds = applyPace(ranges, usePace);
    }
    res.fit.ok = total(ranges) <= target + 0.05;
    res.fit.note = res.fit.ok ? `cabe: ${total(ranges).toFixed(1)} s (alvo ${target} s)` : `não coube: ${total(ranges).toFixed(1)} s, faltam ${(total(ranges) - target).toFixed(1)} s. Nada mais sai sozinho; candidatos para o agente decidir (marque em --plan "optional"): ${blocks.filter((b) => b.kept && !fitDropBeats.has(b.beat!)).sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, 4).map((b) => `"${b.text.slice(0, 50)}" (${(b.b - b.a).toFixed(1)} s)`).join("; ")}`;
    if (!res.fit.ok) res.exit = 4;
  }
  res.pace = usePace;
  const finalEdl = buildEdl(ranges);
  writeFileSync(join(edit, "edl.json"), JSON.stringify(finalEdl, null, 2));
  writeFileSync(join(edit, "edl.final.json"), JSON.stringify(finalEdl, null, 2));

  // 9. proof: render, verify (one repair pass), audit
  if (!o.dryRun) {
    for (let pass = 1; pass <= 3; pass++) {
      const rr = helper(st, "render_cut", [join(edit, "edl.json")], edit, log);
      if (rr.code !== 0) throw new Error(`render_cut: ${rr.stderr.trim().split("\n").slice(-2).join(" | ")}`);
      helper(st, "verify_cut", [join(edit, "edl.json"), join(edit, "cut.mp4"), "--without-approval"], edit, log);
      const rep = JSON.parse(readFileSync(join(edit, "verify", "cut_report.json"), "utf8"));
      res.verify.passes = pass;
      res.verify.report = join(edit, "verify", "cut_report.json");
      const flags: any[] = rep.flags ?? [];
      res.verify.flags = flags.map((f) => `${f.code ?? f.type ?? "?"} ${f.time !== undefined ? ts(Number(f.time)) : ""} ${f.message ?? f.detail ?? ""}`.trim());
      res.verify.clicks = (rep.junctions ?? []).filter((j: any) => j.click).length;
      res.verify.inside_words = (rep.edges ?? []).filter((e: any) => e.in_word).length;
      res.verify.within_speech = (rep.edges ?? []).filter((e: any) => e.in_speech).length;
      // the pauses as heard in the cut: each hold brought to its length, any other pause under 0.25 s
      const heard = junctionSilences();
      res.verify.junction_silence = heard;
      let changed = false;
      heard.forEach((d, k) => {
        const r = ranges[k], want = r.hold_target as number;
        const delta = want > 0 ? want - d : d >= 0.24 ? 0.18 - d : 0;
        if (Math.abs(delta) > 0.04 && pass < 3) { r.adj = r3((r.adj ?? 0) + delta); changed = true; }
      });
      if (pass === 3) break;
      // repair: move each edge flagged inside a word past the word
      for (const f of flags.filter((x) => /EDGE-IN-WORD|EDGE-IN-SPEECH/.test(x.code ?? x.type ?? ""))) {
        const msg = String(f.message ?? f.detail ?? "");
        const id = msg.match(/\b(r\d{2,3})\b/)?.[1];
        const r = ranges.find((x) => x.id === id);
        const to = Number(msg.match(/closer to ([\d.]+)s/)?.[1]);
        if (!r || !Number.isFinite(to)) continue;
        if (/termina|ends/.test(msg) && to > r.base_end) { r.base_end = r3(to + 0.04); changed = true; notes.push(`verify_cut: ${id} terminava dentro de uma palavra; borda levada para ${r.base_end.toFixed(2)} s`); }
        else if (to < r.start) { r.start = r3(Math.max(0, to - 0.04)); changed = true; notes.push(`verify_cut: ${id} começava dentro de uma palavra; início levado para ${r.start.toFixed(2)} s`); }
      }
      if (!changed) break;
      holds = applyPace(ranges, usePace);
      writeFileSync(join(edit, "edl.json"), JSON.stringify(buildEdl(ranges), null, 2));
      writeFileSync(join(edit, "edl.final.json"), JSON.stringify(buildEdl(ranges), null, 2));
    }
    // what each hold measured in the cut (the QA window allows that much)
    const heardFinal = res.verify.junction_silence ?? [];
    holds = holds.map((h) => (h.k < heardFinal.length ? { ...h, s: r3(Math.max(h.s, heardFinal[h.k])) } : h));
    if (o.audit !== false) {
      const au = helper(st, "audit_cut", [edit], edit, log, 3_600_000);
      res.audit.ran = /Verification completed|Verifica/i.test(au.stdout) && existsSync(join(edit, "transcripts", "cut.json"));
      writeFileSync(join(edit, "verify", "audit_cut.txt"), au.stdout + au.stderr);
      res.audit.log = join(edit, "verify", "audit_cut.txt");
      res.audit.breaths = au.stdout.match(/=== Remaining[^\n]*\n([^\n]*)/)?.[1] ?? "";
      res.audit.per_interval = au.stdout.match(/(\d+ intervals differ[^\n]*|Recorded speech matches[^\n]*)/)?.[1] ?? "";
      const cutTr = join(edit, "transcripts", "cut.json");
      if (existsSync(cutTr)) {
        const heard = (JSON.parse(readFileSync(cutTr, "utf8")).words ?? []).map((w: any) => fixN(String(w.text))).filter(Boolean);
        const keptWords = words.filter((w) => ranges.some((r) => r.source === w.stem && mid(w) >= r.start && mid(w) < r.end));
        const expected = sTok.length ? sTok.map((t) => t.n) : keptWords.map((w) => fixN(w.text));
        res.audit.expected = expected.join(" ");
        res.audit.heard = heard.join(" ");
        const m = alignTokens(expected, heard);
        const missing = expected.filter((_, i) => m[i] === null || heard[m[i]!] !== expected[i]);
        const used = new Set(m.filter((x) => x !== null) as number[]);
        const extra = heard.filter((_, j) => !used.has(j));
        res.audit.diff = [...missing.map((x) => `falta "${x}"`), ...extra.map((x) => `a mais "${x}"`)];
        res.audit.speech_equal = res.audit.diff.length === 0;
      }
    }
  }


  captionWords();
  denoise();

  // the takes, the holds on the timeline
  let at = 0;
  // a take after the first opens its picture jcut after the range start: with transitions.jcut_frames its audio
  // starts at the range start, jcut before the picture cut, exactly like render_cut's lead (the verified cut)
  res.takes = ranges.map((r: any, k: number) => {
    const lead = k > 0 ? jcut : 0;
    const t: CutTake = { id: r.id, src: sources[r.source], in: r3(r.start + lead), duration: r3(r.end - r.start - lead), framing: "talking-head", beat: r.beat, quote: r.quote };
    if (res.denoise.sources[r.source]) t.audio_src = res.denoise.sources[r.source];
    return t;
  });
  const ends: number[] = [];
  for (const t of res.takes) { at += t.duration; ends.push(at); }
  res.end_hold_s = holds.find((h) => h.k === ranges.length - 1)?.s ?? 0;
  res.holds = holds.filter((h) => h.k < ranges.length - 1).map((h) => ({ start: r3(ends[h.k] - h.s - 0.15), end: r3(ends[h.k] + 0.2), max_s: r3(h.s + 0.15), why: h.why }));
  res.duration.final = r3(at);
  writeOut(res, log, blocks);
  return res;
}

function writeOut(res: CutResult, log: string[], blocks: Block[] = []) {
  mkdirSync(res.dir, { recursive: true });
  writeFileSync(join(res.dir, "cut.json"), JSON.stringify(res, null, 2));
  if (res.mode === "none") {
    // continuous (2.3.0): what was measured, and that nothing was cut
    writeFileSync(join(res.dir, "CORTE.md"), [
      `# Sem cortes (contínuo) · ${res.name}`, "",
      `Material: ${Object.values(res.sources).map((s) => `\`${basename(s)}\``).join(", ")} · ${res.duration.raw.toFixed(1)} s, **inteiro**: nenhuma pausa, respiração ou repetição sai, e não há punch-in, zoom nem reframe.`, "",
      "## Diagnóstico do áudio", "",
      ...(res.diagnosis?.ok ? res.diagnosis.sources.map((s) => `- \`${basename(s.file)}\`: voz ${s.speech_db} dB, fundo ${s.noise_db} dB, diferença ${s.snr_db} dB (${s.level}); clipping ${s.clipping ?? "?"}; eco ${s.echo ?? "?"}. Sugestão do editonny: denoise \`${s.suggest}\`.`) : [`- ${res.diagnosis?.text ?? "não rodou"}`]),
      `- Denoise: ${res.denoise.mode}${Object.keys(res.denoise.sources).length ? ` (${Object.keys(res.denoise.sources).join(", ")})` : ""}. As métricas são indícios; ouça antes de chamar de defeito.`, "",
      "## Takes", "", ...res.takes.map((t) => `- ${t.id}: \`${basename(t.src)}\` de 0 a ${t.duration.toFixed(3)} s (a fonte inteira)${t.audio_src ? ", voz limpa" : ""}`), "",
      "## Notas", "", ...(res.notes.length ? res.notes.map((x) => `- ${x}`) : ["- nenhuma"]), "",
      "## Usar no EditAi", "",
      "No lote de talking head (`th-batch`), o item recebe `\"cut\": \"" + join(res.dir, "cut.json").replace(/\\/g, "/") + "\"`: a fonte inteira, as palavras medidas e o modo sem cortes.", "",
      "## Comandos do editonny", "", "```", ...log, "```", "",
    ].join("\n"));
    return;
  }
  const rows = blocks.map((b) => `| ${b.stem} ${ts(b.a)}-${ts(b.b)} | ${b.text.replace(/\|/g, "/").slice(0, 70)} | ${b.draft === "kept" ? "fica" : "sai"} | ${b.kept ? "fica" : "sai"} | ${(b.decision ?? "").replace(/\|/g, "/")} |`);
  const md = [
    `# Corte medido · ${res.name}`, "",
    `Material: ${Object.values(res.sources).map((s) => `\`${basename(s)}\``).join(", ")} · ${res.duration.raw.toFixed(1)} s brutos → rascunho ${res.duration.draft.toFixed(1)} s → corte final **${res.duration.final.toFixed(1)} s** (ritmo \`${res.pace}\`, J-cut ${res.jcut_frames} quadros).`, "",
    "## Diagnóstico do áudio (antes de editar)", "",
    ...(res.diagnosis?.ok ? res.diagnosis.sources.map((s) => `- \`${basename(s.file)}\`: voz ${s.speech_db} dB, fundo ${s.noise_db} dB, diferença ${s.snr_db} dB (${s.level}); clipping ${s.clipping ?? "?"}; eco ${s.echo ?? "?"}. Sugestão do editonny: denoise \`${s.suggest}\`.`) : [`- ${res.diagnosis?.text ?? "não rodou"}`]),
    `- Denoise: ${res.denoise.mode}${Object.keys(res.denoise.sources).length ? ` (${Object.keys(res.denoise.sources).join(", ")})` : ""}. As métricas são indícios; ouça os trechos antes de chamar de defeito.`, "",
    "## Rascunho automático e corte final, lado a lado", "",
    "| Trecho (fonte) | Fala | Rascunho | Final | Por quê |", "|---|---|---|---|---|", ...rows, "",
    "## O que saiu", "",
    ...(res.removed.length ? res.removed.map((r) => `- ${r.source} ${ts(r.start)}-${ts(r.end)} "${r.text}" · ${r.why} (${r.by})`) : ["- nada"]),
    "- Pausas longas: viraram junções medidas (bordas pela forma de onda); só ficou a pausa que o ritmo pede, listada abaixo.", "",
    "## O que ficou contra o rascunho", "",
    ...(res.kept_against_draft.length ? res.kept_against_draft.map((r) => `- ${r.source} ${ts(r.start)}-${ts(r.end)} "${r.text}" · ${r.why}`) : ["- nada"]), "",
    "## Pausas mantidas de propósito (o QA `breaths_remaining` aceita só estas)", "",
    ...(res.holds.length ? res.holds.map((h) => `- ${ts(h.start)}-${ts(h.end)}: até ${h.max_s.toFixed(2)} s · ${h.why}`) : ["- nenhuma"]),
    `- fim parado: ${res.end_hold_s.toFixed(2)} s`, "",
    ...(res.fit.target ? ["## Caber em N segundos", "", `- alvo ${res.fit.target} s: ${res.fit.note}`, ...res.fit.removed.map((x) => `- saiu: ${x}`), ""] : []),
    "## Prova do corte", "",
    `- \`verify_cut\` (${res.verify.passes} passada(s)): ${res.verify.inside_words ?? "?"} borda(s) dentro de palavra, ${res.verify.within_speech ?? "?"} em fala, ${res.verify.clicks ?? "?"} clique(s). ${res.verify.flags.length ? `Avisos: ${res.verify.flags.join("; ")}` : "Nenhum aviso."}`,
    `- \`audit_cut\`: ${res.audit.ran ? `fala do corte retranscrita; ${res.audit.speech_equal ? "**igual** à fala esperada" : `**diferente** da esperada: ${res.audit.diff.join(", ")}`}. Por trecho: ${res.audit.per_interval || "?"} (o Whisper adianta o começo da palavra e a joga no trecho anterior; a comparação que vale é a da fala inteira). Silêncio: ${res.audit.breaths || "?"}` : "não rodou"}`,
    "", "## Notas", "", ...(res.notes.length ? res.notes.map((x) => `- ${x}`) : ["- nenhuma"]), "",
    "## Usar no EditAi", "",
    "No lote de talking head (`th-batch`), o item recebe `\"cut\": \"" + join(res.dir, "cut.json").replace(/\\/g, "/") + "\"`: os takes, as palavras e as pausas pedidas vêm daqui.", "",
    "## Comandos do editonny", "", "```", ...log, "```", "",
  ].join("\n");
  writeFileSync(join(res.dir, "CORTE.md"), md);
}

/** th-batch: the takes, words and holds of a cut.json. */
export function loadCut(file: string): CutResult {
  const j = JSON.parse(readFileSync(file, "utf8")) as CutResult;
  if (j.cut_version !== 1 || !j.takes?.length) throw new Error(`cut.json inválido ou sem takes: ${file}`);
  return j;
}

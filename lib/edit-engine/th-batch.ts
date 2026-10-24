// Talking-head batch: N sets of takes + script -> N edited videos, each with its
// spec, measured QA and a review preview checked to open. Bun only.
//   bun lib/edit-engine/cli.ts th-batch <batch.json> [--no-preview-check]
//
// batch.json:
// {
//   "out_dir": "out",                       relative to the batch file
//   "concurrency": 1,                       renders in parallel (each render is already multi-threaded)
//   "defaults": { <talking-head-captions slots> },
//   "items": [{
//     "id": "habits-talking-head-v2",
//     "hook_lines": ["healthy girl habits", "that survive a bad week"],
//     "takes": [{ "src": "${MEDIA}/clip-b.mp4", "in": 1.2063, "duration": 1.6, "framing": "selfie-medium" }, ...],
//     "words": [{ "word": "If", "start": 0.084, "end": 0.214 }, ...],     timeline seconds; or
//     "words_files": { "clip-b.mp4": "clip-b.words.json" },               source seconds per clip (cli.ts transcribe); or
//                                                                          neither: the clips are transcribed (editonny, optional)
//     "script": "If your week just fell apart, ...",                      optional: fixes the spelling of the words
//     "emphasis": ["water", "ten minutes"],                               optional: keywords painted in the caption
//     "cut_whoosh": true,                                                 optional: low whoosh on clip changes (only with music)
//     "style": "editai/styles/ref.style.json",                             optional: reference style profile (cli.ts style-extract)
//     "slots": { <overrides> }
//   }],
//   "style": "editai/styles/ref.style.json"   optional: the same for every item (an item's own style wins)
// }
// Slot precedence: defaults < style profile < item.slots.
// Paths accept ${VAR} from the environment and are relative to the batch file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { render } from "./ffmpeg.ts";
import { runQa, type QaReport } from "./qa.ts";
import { expandPath, expandSlotPaths, fillTemplate, loadTemplate } from "./template.ts";
import { transcribe } from "./transcribe.ts";
import { startPreview } from "./preview-server.ts";
import type { EditSpec, MediaLayer } from "./spec.ts";
import { applyStyleToSpec, loadStyle, styleSlots, type StyleProfile } from "./style.ts";

type Word = { word: string; start: number; end: number; emphasis?: boolean };
export interface Take { src: string; in: number; duration: number; framing?: string }
export interface ThItem {
  id: string; hook_lines: string[]; takes: Take[]; words?: Word[]; words_files?: Record<string, string>;
  script?: string; emphasis?: string[]; cut_whoosh?: boolean; cut_whoosh_gain_db?: number; style?: string; slots?: Record<string, unknown>;
}
export interface ThBatch { out_dir: string; concurrency?: number; defaults?: Record<string, unknown>; style?: string; items: ThItem[] }
export interface ThResult {
  id: string; ok: boolean; error?: string; mp4?: string; spec?: string; qa?: QaReport; render_s?: number;
  words_from?: string; script_check?: string; preview?: string; preview_command?: string; style?: string; style_log?: string[]; draft?: string;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9']/g, "");

/** Source-time words of one clip, cut to the take window and moved to the timeline (clamped inside the take). */
function shiftWords(words: Word[], take: Take, at: number): Word[] {
  const a = take.in, b = take.in + take.duration;
  // a word belongs to the take that holds its midpoint (a transcriber start can sit a few frames before the cut)
  return words.filter((w) => (w.start + w.end) / 2 >= a && (w.start + w.end) / 2 < b)
    .map((w) => ({ word: w.word, start: r3(Math.max(at, w.start - a + at)), end: r3(Math.min(at + take.duration, w.end - a + at)) }));
}

/** Words for the item: given on the timeline, from per-clip files, or transcribed (cached next to the output). */
function wordsFor(item: ThItem, takes: Take[], base: string, outDir: string): { words: Word[]; from: string } {
  if (item.words?.length) return { words: item.words, from: "item.words (timeline seconds)" };
  const perClip = new Map<string, Word[]>();
  const load = (src: string): Word[] => {
    if (perClip.has(src)) return perClip.get(src)!;
    const name = basename(src);
    const given = item.words_files?.[name] ?? item.words_files?.[src];
    let file = given ? expandPath(given, base) : join(outDir, ".words", `${name}.words.json`);
    if (!given && !existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      const r = transcribe(src, file);
      if (!r.ok) throw new Error(`no word timings for ${name}: ${r.reason}. Give "words" or "words_files" (cli.ts transcribe or another transcriber)`);
    }
    const w = (JSON.parse(readFileSync(file, "utf8")).words ?? []) as Word[];
    perClip.set(src, w);
    return w;
  };
  const out: Word[] = [];
  let at = 0;
  for (const t of takes) { out.push(...shiftWords(load(t.src), t, at)); at += t.duration; }
  return { words: out, from: item.words_files ? "words_files (source seconds, shifted per take)" : "transcribed per clip (editonny), shifted per take" };
}

/** Script spelling over the transcribed timing, only when the word counts match; otherwise reports the difference. */
function applyScript(words: Word[], script?: string): string {
  if (!script) return "no script given";
  const toks = script.split(/\s+/).filter((t) => norm(t));
  if (toks.length !== words.length) return `script has ${toks.length} words, captions ${words.length}: spelling kept as transcribed, check by hand`;
  let changed = 0;
  toks.forEach((t, i) => { if (words[i].word !== t) { words[i].word = t; changed++; } });
  return changed ? `script spelling applied to ${changed} word(s)` : "captions equal the script";
}

function markEmphasis(words: Word[], phrases?: string[]): void {
  for (const p of phrases ?? []) {
    const k = p.split(/\s+/).map(norm).filter(Boolean);
    for (let i = 0; i + k.length <= words.length; i++) {
      if (k.every((x, j) => norm(words[i + j].word) === x)) for (let j = 0; j < k.length; j++) words[i + j].emphasis = true;
    }
  }
}

export function buildItemSpec(item: ThItem, defaults: Record<string, unknown>, base: string, outDir: string, style?: StyleProfile): { spec: EditSpec; words_from: string; script_check: string; style_log: string[] } {
  const template = loadTemplate("talking-head-captions");
  if (!item.id || !/^[a-z0-9][a-z0-9._-]*$/i.test(item.id)) throw new Error(`item id must be a filename-safe slug: ${item.id}`);
  if (!item.takes?.length) throw new Error(`${item.id}: takes is empty`);
  const takes = item.takes.map((t) => ({ ...t, src: expandPath(t.src, base) }));
  for (const t of takes) if (!existsSync(t.src)) throw new Error(`${item.id}: clip not found: ${t.src}`);
  const duration = takes.reduce((s, t) => s + t.duration, 0); // not rounded: the last take must end exactly on it
  const { words, from } = wordsFor(item, takes, base, outDir);
  const script_check = applyScript(words, item.script);
  markEmphasis(words, item.emphasis);
  const slots = expandSlotPaths(template, {
    ...defaults, ...(style ? styleSlots(style) : {}), ...(item.slots ?? {}),
    id: item.id, video: takes[0].src, video_in: takes[0].in, words, hook_lines: item.hook_lines, duration,
  }, base);
  slots.alignment_text ??= `headline "${item.hook_lines.join(" / ")}"; captions are the speaker's own words`;
  const spec = fillTemplate(template, slots);
  const framing = (t: Take) => t.framing ?? "talking-head";
  let at = 0;
  spec.layers = takes.map((t, i): MediaLayer => {
    const l: MediaLayer = { id: `t${i + 1}`, src: t.src, kind: "video", in: t.in, start: at, duration: t.duration, fit: "cover", audio: true, framing: framing(t) };
    at += t.duration;
    return l;
  });
  if (takes.length > 1) {
    // several takes: the alternating punch-in of `transitions` replaces the template's fixed one
    spec.camera = spec.camera.filter((m) => m.type !== "punch_in");
    spec.hooks_applied = spec.hooks_applied.filter((h) => h.hook !== "punch_in_cut");
    const cuts = spec.layers.slice(1).map((l) => r3(l.start));
    spec.hooks_applied.push(
      { hook: "hard_cut", at: cuts[0], why: `${takes.length} takes, silences and dead frames out` },
      { hook: "smooth_take_cut", at: cuts[0], why: "every cut: audio leads 2 frames, 60 ms audio crossfade, scale alternates 100/107% on the cut frame; no image dissolve" });
  }
  const style_log = style ? applyStyleToSpec(spec, style) : [];
  const cutWhoosh = style ? style.apply.sfx.cut_whoosh : item.cut_whoosh;
  const whooshDb = item.cut_whoosh_gain_db ?? (style ? style.apply.sfx.gain_db : -30);
  if (takes.length > 1) {
    if (cutWhoosh) {
      // a very low whoosh where the clip (not just the take) changes, only under a music bed
      spec.layers.forEach((l, i) => {
        if (i === 0 || l.src === spec.layers[i - 1].src) return;
        spec.audio.sfx.push({ src: "@sfx:whoosh", at: r3(l.start), gain_db: whooshDb, hook: "whoosh", anchor: true, only_with_music: true });
        spec.hooks_applied.push({ hook: "whoosh", at: r3(l.start), why: `very low whoosh on the turn to ${basename(l.src)}, only with the music bed` });
      });
    }
  }
  if (spec.audio.music) {
    const m = spec.audio.music;
    spec.hooks_applied.push({ hook: "music_duck", at: m.start ?? 0, why: `${m.mood ? `library mood ${m.mood}` : basename(String(m.path))}, ${m.below_voice_db ?? 22} LU under the voice, ducked up to ${m.duck_db ?? 8} dB under speech` });
  }
  return { spec, words_from: from, script_check, style_log };
}

async function checkPreview(specPath: string): Promise<string> {
  // opens the review server on a free port, reads its state over HTTP like the page does, then stops it
  const p = await startPreview(specPath, { port: 4870 });
  try {
    const r = await fetch(`${p.url}/api/state`);
    const j = (await r.json()) as { spec?: { takes?: unknown[] }; video?: { sha256?: string } };
    return r.ok && j.spec?.takes?.length ? `ok (${j.spec.takes.length} takes, video ${String(j.video?.sha256).slice(0, 12)})` : `failed (HTTP ${r.status})`;
  } finally {
    await p.stop();
  }
}

export async function runThBatch(batchPath: string, opts: { previewCheck?: boolean; draft?: boolean; style?: string } = {}): Promise<ThResult[]> {
  const batch: ThBatch = JSON.parse(readFileSync(batchPath, "utf8"));
  const base = dirname(resolve(batchPath));
  const outDir = expandPath(batch.out_dir ?? ".", base);
  mkdirSync(outDir, { recursive: true });
  const cli = resolve(import.meta.dir, "cli.ts").replace(/\\/g, "/");
  const results: ThResult[] = [];
  const queue = [...batch.items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const res: ThResult = { id: item.id, ok: false };
      try {
        const stylePath = opts.style ? resolve(opts.style) : (item.style ?? batch.style);
        const style = stylePath ? loadStyle(expandPath(stylePath, base)) : undefined;
        const { spec, words_from, script_check, style_log } = buildItemSpec(item, batch.defaults ?? {}, base, outDir, style);
        res.words_from = words_from;
        res.script_check = script_check;
        if (style) { res.style = style.name; res.style_log = style_log; }
        writeFileSync(join(outDir, `${spec.id}.plan.spec.json`), JSON.stringify(spec, null, 2));
        if (opts.draft) {
          // quick look first: 540x960, veryfast, the same draft the mini editor makes
          const d = await render(structuredClone(spec), join(outDir, `${spec.id}-draft.mp4`), { draft: { width: 540, height: 960, preset: "veryfast", crf: 26 } });
          res.draft = d.out;
          console.log(`[th-batch] ${spec.id}: quick draft ${d.seconds.toFixed(1)}s -> ${d.out}`);
        }
        const r = await render(spec, join(outDir, `${spec.id}.mp4`));
        res.qa = runQa(spec, r.out, { reportDir: outDir, expectedText: { hook: item.hook_lines } });
        Object.assign(res, { mp4: r.out, spec: r.resolved_spec, render_s: r.seconds, ok: res.qa.verdict !== "FAIL" });
        res.preview_command = `bun "${cli}" preview "${r.resolved_spec.replace(/\\/g, "/")}" --open`;
        console.log(`[th-batch] ${spec.id}: render ${r.seconds.toFixed(1)}s, QA ${res.qa.verdict}`);
      } catch (e) {
        res.error = String((e as Error).message).split("\n").slice(0, 6).join(" | ");
        console.error(`[th-batch] ${item.id}: ${res.error}`);
      }
      results.push(res);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, batch.concurrency ?? 1) }, worker));
  // previews one at a time, after the renders (each binds a port)
  if (opts.previewCheck !== false) {
    for (const r of results) if (r.spec) {
      try { r.preview = await checkPreview(r.spec); } catch (e) { r.preview = `failed: ${(e as Error).message}`; r.ok = false; }
    }
  }
  results.sort((a, b) => a.id.localeCompare(b.id));
  const md = [
    "# Lote de talking head", "",
    "| Vídeo | QA | Render | Palavras | Roteiro | Prévia |", "|---|---|---|---|---|---|",
    ...results.map((r) => r.error ? `| \`${r.id}\` | ERRO | | | | ${r.error.replace(/\|/g, "/")} |`
      : `| \`${r.id}.mp4\` | ${r.qa!.verdict} | ${r.render_s!.toFixed(1)} s | ${r.words_from} | ${r.script_check} | ${r.preview ?? "não conferida"} |`),
    "", "## Abrir a prévia de revisão", "",
    ...results.filter((r) => r.preview_command).flatMap((r) => [`- \`${r.id}\`:`, "", "  ```bash", `  ${r.preview_command}`, "  ```", ""]),
    "Cada vídeo tem ao lado o `.plan.spec.json` (o que o lote montou), o `.spec.json` resolvido, o `.qa.md` e o `.png`.", "",
    ...results.filter((r) => r.style).flatMap((r) => [`## Estilo de \`${r.id}\`: ${r.style}`, "", ...(r.style_log ?? []).map((x) => `- ${x}`), ""]),
  ].join("\n");
  writeFileSync(join(outDir, "th-batch-report.md"), md);
  writeFileSync(join(outDir, "th-batch-report.json"), JSON.stringify(results.map(({ qa, ...r }) => ({ ...r, verdict: qa?.verdict ?? "ERROR" })), null, 2));
  return results;
}

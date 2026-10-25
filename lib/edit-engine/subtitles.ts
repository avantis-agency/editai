// SRT and VTT from the spec's own caption words (EditAi 2.2.0, matrix 3.13; ported to Bun from the idea of
// editonny 1.1.0 export_subtitles.py, MIT). No retranscription: the words, their spelling and their
// timeline times are the ones the video burns. Bun only.
//   bun lib/edit-engine/cli.ts subtitles <spec.json> [--out-dir DIR]   -> <id>.srt, <id>.vtt and the check
// Cues follow the speech: a cue ends at a sentence or comma, at a pause of 0.3 s or more (as the burned captions), or at 42
// characters (one comfortable line on YouTube and in ads). checkSubtitles() proves the file: sequential
// numbers, valid times, no overlap, every cue inside the video, and the text, word for word, equal to the
// caption words.
import type { EditSpec } from "./spec.ts";

type W = { word: string; start: number; end: number };
export interface Cue { start: number; end: number; text: string }

const MAX_CHARS = 42, PAUSE_S = 0.3;
const clock = (sec: number, comma: boolean) => {
  let ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${comma ? "," : "."}${String(ms).padStart(3, "0")}`;
};

export function cuesFrom(words: W[], duration: number): Cue[] {
  const cues: Cue[] = [];
  let cur: W[] = [];
  const flush = () => {
    if (!cur.length) return;
    cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.word).join(" ") });
    cur = [];
  };
  words.forEach((w, i) => {
    const next = words[i + 1];
    if (cur.length && [...cur, w].map((x) => x.word).join(" ").length > MAX_CHARS) flush();
    cur.push(w);
    if (!next || /[.,!?;:…]$/u.test(w.word) || next.start - w.end >= PAUSE_S) flush();
  });
  // a cue stays until the next one starts (or 0.6 s after its last word): easier to read, never overlapping
  cues.forEach((c, i) => { const nx = cues[i + 1]; c.end = Math.min(nx ? nx.start : duration, Math.max(c.end, c.end + 0.6)); });
  return cues;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${clock(c.start, true)} --> ${clock(c.end, true)}\n${esc(c.text)}\n`).join("\n");
}
export function toVtt(cues: Cue[]): string {
  return "WEBVTT\n\n" + cues.map((c, i) => `${i + 1}\n${clock(c.start, false)} --> ${clock(c.end, false)}\n${esc(c.text)}\n`).join("\n");
}

const secs = (t: string) => { const m = t.trim().match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : NaN; };
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);

/** Parses an SRT or VTT and checks it against the caption words. */
export function checkSubtitles(text: string, words: W[], duration: number, kind: "srt" | "vtt"): { ok: boolean; cues: number; problems: string[] } {
  const p: string[] = [];
  let body = text.replace(/\r\n/g, "\n");
  if (kind === "vtt") { if (!body.startsWith("WEBVTT")) p.push("VTT sem o cabeçalho WEBVTT"); body = body.replace(/^WEBVTT[^\n]*\n+/, ""); }
  const blocks = body.trim().split(/\n{2,}/);
  let prevEnd = -1, all: string[] = [];
  blocks.forEach((b, k) => {
    const lines = b.split("\n");
    if (lines[0].trim() !== String(k + 1)) p.push(`cue ${k + 1}: número ${JSON.stringify(lines[0])}`);
    const m = (lines[1] ?? "").match(/^(\S+) --> (\S+)$/);
    if (!m) { p.push(`cue ${k + 1}: linha de tempo inválida`); return; }
    const a = secs(m[1]), e = secs(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(e)) p.push(`cue ${k + 1}: tempo mal formado (${kind === "srt" ? "HH:MM:SS,mmm" : "HH:MM:SS.mmm"})`);
    if (kind === "srt" && !m[1].includes(",")) p.push(`cue ${k + 1}: SRT usa vírgula nos milissegundos`);
    if (!(e > a)) p.push(`cue ${k + 1}: fim antes do início`);
    if (a < prevEnd - 1e-6) p.push(`cue ${k + 1}: começa antes do fim da anterior`);
    if (e > duration + 0.05) p.push(`cue ${k + 1}: passa do fim do vídeo`);
    if (lines.length < 3 || !lines.slice(2).join(" ").trim()) p.push(`cue ${k + 1}: sem texto`);
    prevEnd = e;
    all.push(...norm(lines.slice(2).join(" ")));
  });
  const want = words.flatMap((w) => norm(w.word));
  if (all.join(" ") !== want.join(" ")) {
    const i = all.findIndex((x, j) => x !== want[j]);
    p.push(`texto diferente das palavras da legenda a partir da palavra ${i + 1}: "${all.slice(i, i + 4).join(" ")}" x "${want.slice(i, i + 4).join(" ")}"`);
  }
  return { ok: p.length === 0, cues: blocks.length, problems: p };
}

/** Both files for a spec with captions. */
export function exportSubtitles(spec: EditSpec): { srt: string; vtt: string; cues: Cue[] } {
  const words = spec.captions?.words ?? [];
  if (!words.length) throw new Error("o spec não tem palavras de legenda: o SRT não se inventa");
  const cues = cuesFrom(words, spec.duration);
  return { srt: toSrt(cues), vtt: toVtt(cues), cues };
}

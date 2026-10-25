// Silence in speech, measured (EditAi 2.2.0, wave 2 of the editonny fusion). Bun only.
// The threshold and the 10 ms envelope follow editonny's waveform_cut.py / breaths.py (MIT, Matheus
// Gomes): floor = 10th percentile, loud speech = 90th percentile, threshold = min(max(floor + 14,
// loud - 28), loud - 20) dB, and a silence is a run of 10 ms windows under it (breaths.py find).
// Not ffmpeg silencedetect: it compares each sample's amplitude, so room noise peaks above an RMS threshold
// and it misses pauses that editonny's breaths.py (and a listener) hear; measured on a real recording in a room with reverb.
//   breaths_remaining (qa.ts): the voice of the spec alone (no music, no effects) is rendered and every
//   silence of 0.25 s or more is listed; the ones the cut declared on purpose (spec.cut.holds) and the
//   end hold are excused.
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { ffmpeg, hasAudio, run } from "./measure.ts";
import { layerAudioChain, planLayers } from "./ffmpeg.ts";
import type { EditSpec } from "./spec.ts";

export const HOP_S = 0.01;
const SR = 48000;

/** dB of the mono mix in 10 ms windows (index 0 = second 0 of the file). */
export function envelope(file: string): Float32Array {
  const p = Bun.spawnSync(["ffmpeg", "-v", "error", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`could not decode the audio of ${file}: ${p.stderr.toString().trim().split("\n").pop()}`);
  const buf = p.stdout;
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const w = Math.round(SR * HOP_S), n = Math.floor(x.length / w);
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * w; k < (i + 1) * w; k++) s += x[k] * x[k];
    db[i] = 10 * Math.log10(s / w + 1e-12);
  }
  return db;
}

const pct = (a: Float32Array, p: number) => { const s = Float32Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * (s.length - 1))))]; };

/** Pause threshold of a voice, relative to its own floor and loud speech (waveform_cut.threshold). */
export function threshold(db: Float32Array): number {
  const floor = pct(db, 10), loud = pct(db, 90);
  return Math.round(Math.min(Math.max(floor + 14, loud - 28), loud - 20) * 10) / 10;
}

/** First and last loud window around a point: how much silence the source has before/after it. */
export function quietAround(db: Float32Array, th: number, t: number, dir: 1 | -1, maxS = 5): number {
  let i = Math.round(t / HOP_S);
  const stop = i + dir * Math.round(maxS / HOP_S);
  let n = 0;
  for (; dir > 0 ? i < Math.min(db.length, stop) : i > Math.max(-1, stop); i += dir) {
    if (i < 0 || i >= db.length) break;
    if (db[i] >= th) break;
    n++;
  }
  return n * HOP_S;
}

/** Runs of 10 ms windows under `th` lasting at least `minS` (breaths.py find). */
export function quietRuns(db: Float32Array, th: number, minS: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let run = -1;
  for (let i = 0; i <= db.length; i++) {
    const quiet = i < db.length && db[i] < th;
    if (quiet && run < 0) run = i;
    if (!quiet && run >= 0) { if ((i - run) * HOP_S >= minS - 1e-9) out.push({ start: +(run * HOP_S).toFixed(2), end: +(i * HOP_S).toFixed(2) }); run = -1; }
  }
  return out;
}

/** Silences of a file as editonny's breaths.py measures them: threshold from its own envelope, 10 ms runs. */
export function silences(file: string, minS: number): { threshold_db: number; runs: { start: number; end: number }[] } {
  const db = envelope(file), th = threshold(db);
  return { threshold_db: th, runs: quietRuns(db, th, minS) };
}

/** Seconds from t until sound comes back: a run of at least minS windows over the threshold (a breath, a noise, a word). */
export function soundAfter(db: Float32Array, th: number, t: number, minS = 0.05, maxS = 5): number {
  const need = Math.round(minS / HOP_S), i0 = Math.round(t / HOP_S), i1 = Math.min(db.length, i0 + Math.round(maxS / HOP_S));
  let run = 0;
  for (let i = i0; i < i1; i++) { run = db[i] >= th ? run + 1 : 0; if (run >= need) return (i - need + 1 - i0) * HOP_S; }
  return (i1 - i0) * HOP_S;
}

/** ffmpeg silencedetect runs (sample amplitude): kept for comparison only, see the header. */
export function silencedetect(file: string, thDb: number, minS: number): { start: number; end: number }[] {
  const r = run(["ffmpeg", "-hide_banner", "-nostdin", "-i", file, "-vn", "-af", `silencedetect=noise=${thDb}dB:d=${minS}`, "-f", "null", "-"]);
  const out: { start: number; end: number }[] = [];
  let s: number | null = null;
  for (const line of r.err.split("\n")) {
    const a = line.match(/silence_start: (-?[\d.]+)/);
    if (a) s = Math.max(0, Number(a[1]));
    const b = line.match(/silence_end: ([\d.]+)/);
    if (b && s !== null) { out.push({ start: s, end: Number(b[1]) }); s = null; }
  }
  if (s !== null) out.push({ start: s, end: Number.POSITIVE_INFINITY });
  return out;
}

/**
 * The voice of the spec alone, on its timeline (the same layer audio chains the render uses). original: the
 * takes' own audio, before a denoise (audio_src): what the cut left is judged against the speaker's real room,
 * since a cleaner floor turns the natural gap of a comma into a "silence" by the relative threshold.
 */
export function voiceStem(spec: EditSpec, out: string, work: string, original = false): boolean {
  const plans = planLayers(spec);
  const args: string[] = [], chains: string[] = [], labels: string[] = [];
  let input = 0;
  for (const l of spec.layers) {
    if (l.broll || l.kind !== "video") continue;
    const p = plans.get(l)!;
    if (!p.audible) continue;
    const tail = Math.max(0, p.aEnd - (l.start + l.duration));
    const src = original && l.audio_src && hasAudio(l.src) ? l.src : (l.audio_src ?? l.src);
    args.push("-ss", ((l.in ?? 0) - p.lead).toFixed(3), "-t", (p.lead + l.duration + tail + 0.5).toFixed(3), "-i", src);
    chains.push(layerAudioChain(spec, l, p, input, `A${input}`));
    labels.push(`A${input}`);
    input++;
  }
  if (!labels.length) return false;
  mkdirSync(work, { recursive: true });
  out = resolve(out); work = resolve(work); // ffmpeg runs inside work: a relative output would land in work/work
  const D = spec.duration.toFixed(3);
  const mix = `${labels.map((l) => `[${l}]`).join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad=whole_dur=${D},atrim=end=${D}[VOX]`;
  ffmpeg([...args, "-filter_complex", [...chains, mix].join(";"), "-map", "[VOX]", "-c:a", "pcm_f32le", out], work);
  return true;
}

export interface BreathsResult {
  threshold_db: number; min_s: number;
  found: { start: number; end: number; dur: number; why?: string }[];   // every silence of min_s or more
  unintended: { start: number; end: number; dur: number }[];           // the ones nobody asked for
}

/**
 * Silences of 0.25 s or more left in the voice of a rendered spec. Excused: the leading silence before
 * the first word (under 0.3 s), a declared hold (spec.cut.holds: the window and the length it allows),
 * and the end hold (silence that runs to the end, up to spec.cut.end_hold_s + 0.2 s).
 */
export function breathsRemaining(spec: EditSpec, work: string, minS = 0.25): BreathsResult | null {
  const wav = join(work, "breaths-voice.wav");
  if (!voiceStem(spec, wav, work, true)) return null;
  const { threshold_db: th, runs } = silences(wav, minS);
  rmSync(wav, { force: true });
  const holds = spec.cut?.holds ?? [];
  const D = spec.duration;
  const found: BreathsResult["found"] = [], unintended: BreathsResult["unintended"] = [];
  for (const r of runs) {
    const end = Math.min(D, r.end), dur = +(end - r.start).toFixed(3);
    const item = { start: +r.start.toFixed(3), end: +end.toFixed(3), dur };
    let why: string | undefined;
    if (r.start < 0.01 && dur < 0.3) why = "início";
    else if (end >= D - 0.02 && dur <= (spec.cut?.end_hold_s ?? 0) + 0.2) why = "fim parado (end hold)";
    else {
      const h = holds.find((x) => r.start >= x.start - 0.05 && end <= x.end + 0.05 && dur <= x.max_s + 0.05);
      if (h) why = `pausa pedida (${h.why})`;
    }
    found.push({ ...item, why });
    if (!why) unintended.push(item);
  }
  return { threshold_db: th, min_s: minS, found, unintended };
}

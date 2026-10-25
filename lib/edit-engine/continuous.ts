// Continuous mode, no cuts (EditAi 2.3.0). Bun only.
//
//   spec.cut = "none"   (read as {mode: "none", holds: []})       or a cut.json from `cli.ts cut --continuous`
//
// For a church service, a sermon or any recording that must play whole. It wins over the standard cleanup
// of wave 2: no pause, breath, false start or repetition is taken out, and there is no punch-in, zoom,
// flash or reframe. resolveSpec enforces it (camera moves, alternating punch-in, flashes and reframe go,
// with a note), validateSpec refuses takes that skip source time, and the QA proves it on the render:
//   continuous_take   the takes cover every source from its first to its last frame (within 0.1 s),
//                     the video lasts as long as the sources;
//   no_scene_cut      ffmpeg scdet finds no cut in the render that the source itself does not have;
//   caption_sync      (also for the word preset) every caption event starts on its word, and the words that
//                     open a phrase start within 0.1 s of the voice measured on the waveform.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { buildAss } from "./ass.ts";
import { probe } from "./measure.ts";
import { sceneCuts } from "./canvas.ts";
import { envelope, HOP_S, threshold, voiceStem } from "./silence.ts";
import type { EditSpec, MediaLayer } from "./spec.ts";

export const continuousOn = (s: EditSpec) => (s.cut as unknown) === "none" || s.cut?.mode === "none";
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const takesOf = (s: EditSpec): MediaLayer[] => (s.layers ?? []).filter((l) => l.kind === "video" && !l.rect && !l.broll).sort((a, b) => a.start - b.start);

/** Hooks that mean a cut or a camera move: never in a continuous video. */
const MOVING_HOOKS = ["punch_in_cut", "slow_push", "impact_zoom", "hard_cut", "smooth_take_cut", "reframe_follow_face", "speed_ramp", "pattern_break"];

/** "none" -> {mode: "none"}; then the continuous rules win over whatever the template or a style added. Idempotent. */
export function resolveContinuous(s: EditSpec): void {
  if ((s.cut as unknown) === "none") s.cut = { mode: "none", holds: [] };
  if (!continuousOn(s)) return;
  const out: string[] = [];
  if (s.camera?.length) { out.push(`${s.camera.length} movimento(s) de câmera`); s.camera = []; }
  if (s.transitions?.punch_alternate) { out.push("zoom alternado entre takes"); s.transitions = { ...s.transitions, punch_alternate: 0 }; }
  if (s.flashes?.length) { out.push(`${s.flashes.length} flash(es)`); s.flashes = []; }
  if (s.reframe && s.reframe.mode !== "off") { out.push("reframe"); s.reframe = { ...s.reframe, mode: "off" }; }
  const before = s.hooks_applied?.length ?? 0;
  s.hooks_applied = (s.hooks_applied ?? []).filter((h) => !MOVING_HOOKS.includes(h.hook));
  if (s.hooks_applied.length < before) out.push(`${before - s.hooks_applied.length} gancho(s) de corte ou movimento`);
  if (!s.hooks_applied.some((h) => h.hook === "continuous_take")) s.hooks_applied.unshift({ hook: "continuous_take", at: 0, why: "cut none: the recording plays whole, no cut, no pause removed, no zoom" });
  if (out.length) s.notes = [...(s.notes ?? []).filter((n) => !n.startsWith("contínuo:")), `contínuo: saíram ${out.join(", ")} (o modo sem cortes vence a limpeza padrão e o template)`];
}

export function validateContinuous(s: EditSpec): string[] {
  if (!continuousOn(s)) return [];
  const p: string[] = [];
  const t = takesOf(s);
  if (!t.length) p.push("cut none: no full-frame video take");
  for (let k = 0; k < t.length; k++) {
    const l = t[k];
    if ((l.speed ?? 1) !== 1) p.push(`cut none: take ${l.id} has speed ${l.speed}; a continuous video plays at speed 1`);
    const prev = t[k - 1];
    if (prev && Math.abs(prev.start + prev.duration - l.start) > 0.5 / s.canvas.fps) p.push(`cut none: gap or overlap between ${prev.id} and ${l.id}`);
    if (prev && prev.src === l.src && Math.abs((prev.in ?? 0) + prev.duration - (l.in ?? 0)) > 0.5 / s.canvas.fps) p.push(`cut none: ${l.id} skips source time after ${prev.id} (that is a cut)`);
  }
  if (s.camera?.length) p.push("cut none: camera moves are not allowed (no zoom, no punch-in)");
  return p;
}

export interface ContinuityCheck { id: string; blocking: boolean; pass: boolean; detail: string; tool: string; info?: boolean }

/** continuous_take and no_scene_cut on the render. */
export function continuityChecks(s: EditSpec, video: string): ContinuityCheck[] {
  if (!continuousOn(s)) return [];
  const out: ContinuityCheck[] = [];
  const t = takesOf(s), fps = s.canvas.fps;
  // 1. every source whole
  const bySrc = new Map<string, MediaLayer[]>();
  for (const l of t) bySrc.set(l.src, [...(bySrc.get(l.src) ?? []), l]);
  const problems: string[] = [], seen: string[] = [];
  let srcTotal = 0;
  for (const [src, ls] of bySrc) {
    const d = probe(src).duration;
    srcTotal += d;
    const a = Math.min(...ls.map((l) => l.in ?? 0)), b = Math.max(...ls.map((l) => (l.in ?? 0) + l.duration));
    seen.push(`${src.split(/[\\/]/).pop()} ${r3(a)}-${r3(b)} s de ${r3(d)} s`);
    if (a > 0.1) problems.push(`começa em ${r3(a)} s`);
    if (b < d - 0.1) problems.push(`termina ${r3(d - b)} s antes do fim da fonte`);
  }
  const dd = Math.abs(s.duration - srcTotal);
  if (dd > 0.1) problems.push(`duração ${r3(s.duration)} s contra ${r3(srcTotal)} s da fonte`);
  out.push({ id: "continuous_take", blocking: true, pass: problems.length === 0,
    detail: (problems.length ? `${problems.join("; ")}; ` : "") + `${t.length} take(s), ${seen.join("; ")}; vídeo ${r3(s.duration)} s (diferença ${Math.round(dd * 1000)} ms)`,
    tool: "ffprobe + spec" });
  // 2. no cut in the render the source does not have
  const allowed: number[] = [];
  for (let k = 0; k < t.length; k++) {
    const l = t[k];
    if (k > 0 && t[k - 1].src !== l.src) allowed.push(l.start); // a change of file is the person's own edit
    for (const c of sceneCuts(l.src, l.in ?? 0, l.duration)) allowed.push(l.start + c);
  }
  const cuts = sceneCuts(video);
  const extra = cuts.filter((c) => !allowed.some((a) => Math.abs(a - c) <= 2 / fps));
  out.push({ id: "no_scene_cut", blocking: true, pass: extra.length === 0,
    detail: extra.length ? `${extra.length} corte(s) de cena no vídeo que a fonte não tem: ${extra.slice(0, 6).map((c) => `${c.toFixed(2)} s`).join(", ")}`
      : `nenhum corte de cena a mais: ${cuts.length} no vídeo, ${allowed.length} na fonte (o detector compara quadro a quadro)`,
    tool: "ffmpeg scdet=threshold=10 on the render and on the source windows" });
  return out;
}

const SYNC_MAX_S = 0.1;

/** Runs of 10 ms windows at or over th, at least 30 ms long, joined across gaps of 20 ms or less. */
function voicedRuns(db: Float32Array, th: number): [number, number][] {
  const raw: [number, number][] = [];
  let st = -1;
  for (let i = 0; i <= db.length; i++) {
    const on = i < db.length && db[i] >= th;
    if (on && st < 0) st = i;
    if (!on && st >= 0) { if (i - st >= 3) raw.push([st, i]); st = -1; }
  }
  const out: [number, number][] = [];
  for (const r of raw) { const l = out[out.length - 1]; if (l && r[0] - l[1] <= 2) l[1] = r[1]; else out.push([...r]); }
  return out;
}

/**
 * caption_sync: (a) each caption event starts on its word (the .ass the render burns, centisecond times);
 * (b) every word after a pause of 0.15 s or more starts within SYNC_MAX_S of its voice onset, measured on
 * the spec's own voice before any denoise (10 ms envelope and threshold of silence.ts): the voiced run that
 * overlaps the word most, its first window at 18 dB under the run's peak, and only when the 0.1 s before
 * that run are quiet. Words inside running speech have no measurable onset on the envelope; their timing
 * comes from the transcriber and align_words (cut.ts). (c) voiced runs of 80 ms or more that no word
 * covers are listed (a word the transcriber missed, or a breath): informative, for a human to hear.
 */
export function captionSync(s: EditSpec, work: string): ContinuityCheck[] {
  const c = s.captions;
  if (!c?.words.length || !(continuousOn(s) || c.preset === "word")) return [];
  // (a) events vs words
  const ass = buildAss(s);
  const starts = [...ass.matchAll(/^Dialogue: 1,(d+):(dd):(dd).(dd),[^,]*,Captions,/gm)].map((m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 100);
  let evMax = 0;
  if (c.preset === "word") for (const t of starts) evMax = Math.max(evMax, Math.min(...c.words.map((w) => Math.abs(t - w.start))));
  // (b) phrase onsets on the voice
  const wav = join(work, "sync-voice.wav");
  const rows: { word: string; at: number; d: number }[] = [];
  const orphans: [number, number][] = [];
  if (voiceStem(s, wav, work, true)) {
    const db = envelope(wav), th = threshold(db);
    rmSync(wav, { force: true });
    const runs = voicedRuns(db, th);
    const sec = (k: number) => k * HOP_S;
    c.words.forEach((w, i) => {
      const prevEnd = i ? c.words[i - 1].end : 0;
      if (i && w.start - prevEnd < 0.15) return;
      const we = Math.max(w.end, w.start + 0.05);
      const near = runs.filter(([x]) => sec(x) >= w.start - 0.35 && sec(x) <= w.start + 0.35);
      const ov = (r: [number, number]) => Math.max(0, Math.min(sec(r[1]), we) - Math.max(sec(r[0]), w.start));
      const run = near.sort((p, q) => ov(q) - ov(p) || Math.abs(sec(p[0]) - w.start) - Math.abs(sec(q[0]) - w.start))[0];
      if (!run) return;
      const k0 = run[0];
      // not measurable when the run does not start out of silence
      for (let k = Math.max(0, k0 - 10); k < k0; k++) if (db[k] >= th) return;
      let peak = -Infinity;
      for (let k = k0; k < Math.min(run[1], k0 + 30); k++) peak = Math.max(peak, db[k]);
      let k = k0;
      while (k < run[1] && db[k] < Math.max(th, peak - 18)) k++;
      rows.push({ word: w.word, at: r3(w.start), d: r3(sec(k) - w.start) });
    });
    // (c) voice no word covers
    for (const r of runs) {
      if (sec(r[1]) - sec(r[0]) < 0.08) continue;
      if (!c.words.some((w) => w.start < sec(r[1]) + 0.05 && w.end > sec(r[0]) - 0.05)) orphans.push([r3(sec(r[0])), r3(sec(r[1]))]);
    }
  }
  const worst = [...rows].sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const maxD = worst.length ? Math.abs(worst[0].d) : 0;
  const tol = SYNC_MAX_S + 0.5 / s.canvas.fps; // the caption shows on whole frames
  const pass = evMax <= 0.011 && maxD <= tol;
  return [{ id: "caption_sync", blocking: true, pass,
    detail: `${c.preset === "word" ? `eventos da legenda no início da palavra (desvio máximo ${Math.round(evMax * 1000)} ms); ` : ""}` +
      (rows.length ? `${rows.length} início(s) de frase medidos na voz: desvio máximo ${Math.round(maxD * 1000)} ms (limite ${Math.round(tol * 1000)} ms)` +
        `; maiores: ${worst.slice(0, 4).map((r) => `"${r.word}" ${r.at.toFixed(2)} s ${r.d > 0 ? "+" : ""}${Math.round(r.d * 1000)} ms`).join(", ")}` : "nenhum início de frase mensurável na voz") +
      (orphans.length ? `; voz sem palavra da legenda (ouça: respiração ou palavra que o transcritor perdeu): ${orphans.slice(0, 6).map(([x, y]) => `${x.toFixed(2)}-${y.toFixed(2)} s`).join(", ")}` : ""),
    tool: "lib/edit-engine/ass.ts events + voice stem envelope (silence.ts, 10 ms)" }];
}

// Captions without fillers, gone in the pauses, placed by name (EditAi 2.4.0). Bun only.
//
//   captions.drop_fillers: true     the hesitations leave the captions (and the SRT), never the audio or the video
//   captions.hide_in_pauses: true   (preset word) a word shows only while it is spoken: it goes at the measured
//                                   end of the voice and never hangs on screen through a pause of 0.3 s or more
//   captions.position: "center"     centre of the canvas (both axes); "lower_third" = the 2.3.0 place on 16:9
//
// Fillers. Two lists per language. `pure` words are hesitation and nothing else ("ãh", "hum", "éh" / "um",
// "uh"): they always go. `ambiguous` words are also real words ("é" is a verb, "ou" and "o" are grammar,
// "né", "tipo", "like" can be crutches or meaning): they never go by the list. One of them leaves only
// when the person or the agent marked it, after listening (`filler: true` on the word, with `filler_why`),
// or when the transcriber wrote it as a dragged vowel ("éé", "ahh"). `filler: false` keeps any word.
// resolveSpec moves the dropped words to `captions.dropped` (with the reason), so the decision stays in
// the spec and is undone by turning drop_fillers off.
//
// Pauses. The render measures the voice of the spec (the same 10 ms envelope and threshold as silence.ts
// and caption_sync) and ends each word where a pause of 0.3 s or more begins after it (`pause_after`),
// so a word whose transcribed end runs into the silence goes when the voice stops. QA caption_pauses
// proves it on the .ass the render burns.
//
// Absent fields: as 2.3.0 (no drop, the 0.25 s hold, the y written in the spec). The style profiles turn
// drop_fillers and hide_in_pauses on with the word preset (style.ts applyStyleToSpec).
import { rmSync } from "node:fs";
import { join } from "node:path";
import { buildAss } from "./ass.ts";
import { assSize, familyOf } from "./fonts.ts";
import { envelope, quietRuns, threshold, voiceStem } from "./silence.ts";
import type { Captions, EditSpec, Rect } from "./spec.ts";

export type CaptionPosition = "center" | "lower_third";
export const CAPTION_POSITIONS: CaptionPosition[] = ["center", "lower_third"];
export type FillerLang = "pt" | "en";

/** Written as the transcriber spells them; matched lowercase, without punctuation, repeated letters squeezed. */
export const FILLERS: Record<FillerLang, { pure: string[]; ambiguous: string[] }> = {
  pt: { pure: ["ãh", "ã", "ãhn", "ahn", "hã", "éh", "eh", "hum", "hm", "uhm", "uh"], ambiguous: ["é", "né", "tipo", "oh", "ó", "ah", "ou", "o", "assim", "então"] },
  en: { pure: ["um", "uh", "uhm", "er", "erm", "hm", "mm"], ambiguous: ["like", "so", "well", "oh", "ah", "right", "okay"] },
};

export const PAUSE_S = 0.3;   // a pause the eye reads as silence (the caption groups and the SRT use the same 0.3 s)
export const TAIL_S = 0.08;   // a word stays this long after the voice stops (the release and the room)
const HANG_TOL_S = 0.12;      // QA: a word may show this far inside a pause, at either edge (sync of ~0.1 s)

const squeeze = (w: string) => w.toLowerCase().normalize("NFC").replace(/[^\p{L}]/gu, "").replace(/(\p{L})\1+/gu, "$1");
const bare = (w: string) => w.toLowerCase().normalize("NFC").replace(/[^\p{L}]/gu, "");

/** pt or en by the commonest short words; null when it cannot tell. */
export function guessLang(words: { word: string }[]): FillerLang | null {
  const pt = new Set(["que", "não", "nao", "de", "uma", "nós", "nos", "você", "voce", "gente", "isso", "está", "esta", "para", "pra", "com", "é"]);
  const en = new Set(["the", "and", "you", "is", "to", "of", "it", "that", "this", "we", "i", "for", "with"]);
  let p = 0, e = 0;
  for (const w of words) { const b = bare(w.word); if (pt.has(b)) p++; if (en.has(b)) e++; }
  return p === e ? null : p > e ? "pt" : "en";
}

const langOf = (s: EditSpec): FillerLang | null => s.captions?.lang ?? (s.broll?.lang === "en" || s.broll?.lang === "pt" ? s.broll.lang : null) ?? guessLang(s.captions?.words ?? []);

/** Why a word is a filler, or null. lang null: only the pure fillers that are not a word in either language. */
export function fillerWhy(w: Captions["words"][number], lang: FillerLang | null): string | null {
  if (w.filler === false) return null;
  if (w.filler === true) return w.filler_why ?? "marcado como vício";
  const sq = squeeze(w.word), b = bare(w.word);
  if (!sq) return null;
  const langs: FillerLang[] = lang ? [lang] : ["pt", "en"];
  for (const l of langs) {
    if (FILLERS[l].pure.includes(sq) && !(lang === null && sq === "um")) return `hesitação (${sq})`;
    if (FILLERS[l].ambiguous.includes(sq) && b !== sq && b.length > sq.length) return `vogal arrastada (${w.word})`;
  }
  return null;
}

/** Is a word on the ambiguous list (a real word that can also be a crutch)? */
export const isAmbiguous = (word: string, lang: FillerLang) => FILLERS[lang].ambiguous.includes(squeeze(word));

/**
 * drop_fillers (idempotent, called by resolveSpec): the dropped words of an earlier call come back first,
 * then the fillers leave `words` for `dropped`. Off: everything is back in `words`.
 */
export function resolveFillers(s: EditSpec): void {
  const c = s.captions;
  if (!c) return;
  if (c.dropped?.length) {
    c.words = [...c.words, ...c.dropped.map(({ why: _w, ...w }) => w)].sort((a, b) => a.start - b.start);
    delete c.dropped;
  }
  if (!c.drop_fillers || !c.words?.length) return;
  const lang = langOf(s);
  const keep: Captions["words"] = [], dropped: NonNullable<Captions["dropped"]> = [];
  for (const w of c.words) {
    const why = fillerWhy(w, lang);
    if (why) dropped.push({ ...w, why }); else keep.push(w);
  }
  if (dropped.length) { c.words = keep; c.dropped = dropped; }
}

/** position (called by resolveSpec after the canvas has its size): the caption line's y. */
export function resolvePosition(s: EditSpec): void {
  const c = s.captions;
  if (!c?.position || typeof s.canvas !== "object" || !s.canvas?.height) return;
  const { width: W, height: H } = s.canvas;
  if (c.position === "center") c.y = Math.round(H / 2);
  else if (c.position === "lower_third") c.y = W > H ? Math.round(H * 0.83) : Math.round(H * (1330 / 1920));
}

export function validateCaptionOptions(s: EditSpec): string[] {
  const c = s.captions, p: string[] = [];
  if (!c) return p;
  if (c.position !== undefined && !CAPTION_POSITIONS.includes(c.position)) p.push(`captions.position must be ${CAPTION_POSITIONS.join(" or ")}`);
  if (c.lang !== undefined && !["pt", "en"].includes(c.lang)) p.push("captions.lang must be pt or en");
  for (const k of ["drop_fillers", "hide_in_pauses"] as const) if (c[k] !== undefined && typeof c[k] !== "boolean") p.push(`captions.${k} must be true or false`);
  if (c.hide_in_pauses && c.preset !== "word") p.push("captions.hide_in_pauses is an option of the word preset");
  return p;
}

// ── pauses ───────────────────────────────────────────────────────────────────────

/** Pauses of PAUSE_S or more in the voice of the spec (original takes' audio, as caption_sync and breaths_remaining). */
export function voicePauses(s: EditSpec, work: string, minS = PAUSE_S): { threshold_db: number; runs: { start: number; end: number }[] } | null {
  const wav = join(work, "pauses-voice.wav");
  if (!voiceStem(s, wav, work, true)) return null;
  const db = envelope(wav), th = threshold(db);
  rmSync(wav, { force: true });
  return { threshold_db: th, runs: quietRuns(db, th, minS) };
}

/**
 * hide_in_pauses (render): every word followed by a measured pause of PAUSE_S or more before the next word
 * ends where that pause starts (`pause_after`). Returns the notes.
 */
export function fitWordsToPauses(s: EditSpec, work: string): string[] {
  const c = s.captions;
  if (!c?.hide_in_pauses || c.preset !== "word" || !c.words.length) return [];
  const m = voicePauses(s, work);
  if (!m) return ["hide_in_pauses: sem voz para medir; as palavras somem no fim escrito de cada uma"];
  let moved = 0, marked = 0;
  c.words.forEach((w, i) => {
    delete w.pause_after;
    const nextStart = c.words[i + 1]?.start ?? s.duration;
    const r = m.runs.find((x) => x.start >= w.start + 0.05 && x.start < nextStart);
    if (!r) return;
    w.pause_after = true;
    marked++;
    const end = Math.round(Math.max(w.start + 0.06, Math.min(w.end, r.start)) * 1000) / 1000;
    if (Math.abs(end - w.end) > 0.0005) { w.end = end; moved++; }
  });
  c.pauses_measured = { threshold_db: m.threshold_db, min_s: PAUSE_S, pauses: m.runs.length, words_before_pause: marked, ends_moved: moved, tool: "voice stem envelope, 10 ms (silence.ts)" };
  return [`hide_in_pauses: ${m.runs.length} pausa(s) de ${PAUSE_S} s ou mais medidas na voz; ${marked} palavra(s) somem no começo da pausa (${moved} fim(ns) de palavra puxado(s) para onde a voz para)`];
}

// ── face on a centred caption ────────────────────────────────────────────────────

/** Rough ink box of a word drawn at (x, y): the font's line size high, 0.62 em per character wide. */
export function wordBox(c: Captions, text: string, x: number, y: number): Rect {
  const size = assSize(c.style.font_px, { ...c.style, font_family: familyOf(c.style) });
  const w = Math.round(0.62 * size * Math.max(1, [...text].length)), h = Math.round(size);
  return { x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h };
}

const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * position center (render, 16:9 with the face measured): a word whose box would touch a face sample while
 * it is on screen moves up or down by the least that clears every sample of that moment (16 px margin),
 * only for that word; consecutive moves to the same y join. Writes captions.face_shifts. Returns notes.
 */
export function avoidFaceCenter(s: EditSpec, samples: { t: number; r: Rect }[] | null, spans: [number, number][]): string[] {
  const c = s.captions;
  if (!c || c.position !== "center") return [];
  delete c.face_shifts;
  if (!samples) return ["legenda no centro: rosto não medido, nada foi deslocado (o QA de rosto não confere)"];
  const { width: W, height: H } = s.canvas, M = 16, out: NonNullable<Captions["face_shifts"]> = [];
  c.words.forEach((w, i) => {
    const [a, b] = spans[i];
    const box = wordBox(c, w.word, W / 2, c.y);
    const faces = samples.filter((f) => f.t >= a - 0.1 && f.t <= b + 0.1).map((f) => ({ x: f.r.x - M, y: f.r.y - M, w: f.r.w + 2 * M, h: f.r.h + 2 * M }));
    if (!faces.some((f) => hit(box, f))) return;
    const up = Math.min(...faces.map((f) => f.y)) - box.h / 2, down = Math.max(...faces.map((f) => f.y + f.h)) + box.h / 2;
    const cands = [up, down].map(Math.round).filter((y) => y - box.h / 2 >= H * 0.05 && y + box.h / 2 <= H * 0.95);
    if (!cands.length) return;
    const y = cands.sort((p, q) => Math.abs(p - c.y) - Math.abs(q - c.y))[0];
    const last = out[out.length - 1];
    if (last && last.y === y && a - last.end < 0.5) last.end = b; else out.push({ start: a, end: b, y, why: "rosto" });
  });
  if (out.length) c.face_shifts = out;
  return out.length ? [`legenda no centro: ${out.length} trecho(s) deslocado(s) para não cobrir o rosto (${out.map((x) => `${x.start.toFixed(2)}-${x.end.toFixed(2)} s y ${x.y}`).join("; ")})`]
    : [`legenda no centro (y ${c.y}): longe do rosto em todas as ${samples.length} amostras medidas`];
}

/** y of a word after the face shifts (null: as written). */
export function faceShiftY(c: Captions, at: number): number | null {
  return c.face_shifts?.find((f) => at >= f.start && at < f.end)?.y ?? null;
}

// ── QA ───────────────────────────────────────────────────────────────────────────

export interface CaptionCheck { id: string; blocking: boolean; pass: boolean; detail: string; tool: string; info?: boolean }

const clock = (t: number) => t.toFixed(2).replace(".", ",");

/** The text events of the captions in the .ass the render burns: [start, end, text]. */
export function captionEventsOfAss(s: EditSpec): { start: number; end: number; text: string }[] {
  const t = (h: string, m: string, x: string, cs: string) => Number(h) * 3600 + Number(m) * 60 + Number(x) + Number(cs) / 100;
  return [...buildAss(s).matchAll(/^Dialogue: 1,(\d+):(\d\d):(\d\d)\.(\d\d),(\d+):(\d\d):(\d\d)\.(\d\d),Captions,[^\n]*?,,(?:\{[^}]*\})*(.*)$/gm)]
    .map((m) => ({ start: t(m[1], m[2], m[3], m[4]), end: t(m[5], m[6], m[7], m[8]), text: m[9].replace(/\{[^}]*\}/g, "") }));
}

/**
 * caption_fillers (drop_fillers): no word of the filler lists on screen, and none of the dropped words;
 * caption_pauses (hide_in_pauses): no word on screen inside a measured pause of 0.3 s or more, past 0.12 s
 * from either edge; captions_center (position center): every measured box centred on the canvas, or on the
 * y a face shift asked for.
 */
export function captionChecks(s: EditSpec, groups: { text: string; at: number; box: Rect | null }[], work: string, faces: { t: number; r: Rect }[] | null = null): CaptionCheck[] {
  const c = s.captions, out: CaptionCheck[] = [];
  if (!c?.words.length) return out;
  const ev = captionEventsOfAss(s);
  if (c.drop_fillers) {
    const lang = langOf(s);
    const left = ev.filter((e) => { const sq = squeeze(e.text); return (lang ? FILLERS[lang].pure : [...FILLERS.pt.pure, ...FILLERS.en.pure].filter((x) => x !== "um")).includes(sq); });
    const shown = (c.dropped ?? []).filter((d) => ev.some((e) => e.start < d.end && e.end > d.start && squeeze(e.text) === squeeze(d.word)));
    out.push({ id: "caption_fillers", blocking: true, pass: !left.length && !shown.length,
      detail: (left.length || shown.length ? `vício na legenda: ${[...left.map((e) => `"${e.text}" ${clock(e.start)} s`), ...shown.map((d) => `"${d.word}" ${clock(d.start)} s`)].slice(0, 6).join(", ")}; `
        : `nenhum vício na legenda (lista ${lang ?? "pt+en"}); `) +
        `${c.dropped?.length ?? 0} palavra(s) fora da legenda${c.dropped?.length ? `: ${c.dropped.map((d) => `"${d.word}" ${clock(d.start)} s (${d.why})`).join("; ")}` : ""}; o áudio e o vídeo não mudam`,
      tool: "lib/edit-engine/captions.ts lists + the .ass the render burns" });
  }
  if (c.hide_in_pauses && c.preset === "word") {
    const m = voicePauses(s, work);
    if (!m) out.push({ id: "caption_pauses", blocking: true, pass: false, detail: "sem voz para medir as pausas", tool: "voice stem envelope" });
    else {
      const hangs: string[] = [];
      for (const r of m.runs) for (const e of ev) {
        const a = Math.max(e.start, r.start + HANG_TOL_S), b = Math.min(e.end, r.end - HANG_TOL_S);
        if (b - a > 0.01) hangs.push(`"${e.text}" ${(b - a).toFixed(2).replace(".", ",")} s na pausa ${clock(r.start)}-${clock(r.end)} s`);
      }
      const inSpeech = m.runs.filter((r) => r.start > c.words[0].start && r.end < c.words[c.words.length - 1].end);
      out.push({ id: "caption_pauses", blocking: true, pass: !hangs.length,
        detail: hangs.length ? `${hangs.length} palavra(s) pendurada(s) em pausa: ${hangs.slice(0, 6).join("; ")}`
          : `nenhuma palavra na tela durante as ${inSpeech.length} pausa(s) de ${PAUSE_S} s ou mais entre a primeira e a última palavra (folga de ${Math.round(HANG_TOL_S * 1000)} ms nas bordas; limiar ${m.threshold_db} dB)`,
        tool: "voice stem envelope, 10 ms (silence.ts) against the caption events of the .ass" });
    }
  }
  if (c.position === "center") {
    const { width: W, height: H } = s.canvas, tol = Math.round(H * 0.05);
    const off = groups.filter((g) => g.box).filter((g) => {
      const want = faceShiftY(c, g.at) ?? c.y, b = g.box!;
      return Math.abs(b.y + b.h / 2 - want) > tol || Math.abs(b.x + b.w / 2 - W / 2) > Math.round(W * 0.03);
    });
    out.push({ id: "captions_center", blocking: true, pass: off.length === 0,
      detail: off.length ? `${off.length} palavra(s) fora do centro: ${off.slice(0, 4).map((g) => `"${g.text}" caixa y ${g.box!.y}`).join(", ")}`
        : `todas as ${groups.filter((g) => g.box).length} palavras medidas no centro da tela (y ${c.y} de ${H}, folga ${tol} px)${c.face_shifts?.length ? `; ${c.face_shifts.length} trecho(s) deslocado(s) pelo rosto` : ""}`,
      tool: "ffmpeg bbox on a text mask" });
    // the face at the moment of each word (the union check of qa.ts would flag a word moved off the face elsewhere in the video)
    if (faces) {
      const near = groups.filter((g) => g.box).map((g) => ({ g, f: faces.filter((f) => Math.abs(f.t - g.at) <= 0.15) }));
      const over = near.filter(({ g, f }) => f.some((x) => hit(g.box!, x.r)));
      out.push({ id: "caption_face", blocking: true, pass: over.length === 0,
        detail: over.length ? `${over.length} palavra(s) sobre o rosto: ${over.slice(0, 4).map(({ g }) => `"${g.text}" ${clock(g.at)} s`).join(", ")}`
          : `nenhuma palavra sobre o rosto medido no mesmo instante (${near.reduce((a, x) => a + x.f.length, 0)} comparações, ${faces.length} amostras)`,
        tool: "ffmpeg bbox on a text mask + editonny track_faces (10 Hz)" });
    }
  }
  return out;
}

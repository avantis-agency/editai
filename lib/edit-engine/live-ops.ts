// Editor com IA (1.7.0): the closed set of edit operations a request can turn into, for the quick
// commands (quick.ts) and for the person's own agent (`cli.ts edit-op`). Bun only.
//
// An operation never carries a path, a command or free code: every field is a number, a known id
// (take, caption word, library item, mood) or short text, checked here before anything is saved.
// Two kinds of result:
// - the controls the page already has (headline text, mode and size; caption preset, word fix and
//   keyword; music on/off and volume; whoosh on/off) go into their existing feedback sections, so
//   the Editor panel stays in sync with what the agent did;
// - everything else (cut a stretch, trim or extend a take, zoom and punch-in at T, a library sound
//   effect at T, change or move the music, caption size and position) is stored as `ops` in
//   feedback.json, tagged with the request id, and applied in order after the take trims
//   (applyOps, called by apply-feedback.ts). Times in an op are seconds of the timeline the person
//   saw when they asked: the video with every earlier change applied.
import { BOLD_WORD_STYLE, captionGroups } from "./ass.ts";
import { BadRequest, styleOfSpec, trimLimits, validateCaptionEdits, validateEmphasis, validateStyle, type CaptionEdit, type EmphasisEdit, type Feedback, type Section, type StyleChoice } from "./feedback.ts";
import { musicIndex, pickSfx, pickTrack, sfxIndex, trackFile, effectFile } from "./library.ts";
import { musicPath, takes, type EditSpec, type MediaLayer } from "./spec.ts";

export type StoredOp =
  | { op: "cut"; start: number; end: number }
  | { op: "trim_take"; take: string; start_delta: number; end_delta: number }
  | { op: "zoom"; at: number; amount: number }
  | { op: "punch_in"; at: number; until: number; amount: number }
  | { op: "sfx"; at: number; name: string; gain_db: number }
  | { op: "sfx_remove"; at: number; name?: string }
  | { op: "music"; mood?: string; track?: string; start?: number }
  | { op: "caption_size"; pct: number }
  | { op: "caption_move"; y: number }
  | { op: "whoosh_cuts" };
/** One stored operation: `uid` names it, `req` is the request that made it ("p3"). */
export type EditOp = StoredOp & { uid: string; req?: string };

export class OpError extends Error {}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** "00:03.6" for replies (the page's timecode uses the same mm:ss). */
export const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
/** "0,25 s" */
export const fmtS = (s: number) => `${(Math.round(s * 100) / 100).toLocaleString("pt-BR")} s`;
const fmtDb = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("pt-BR")} dB`;

function num(v: unknown, name: string, lo: number, hi: number): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (!isNum(n)) throw new OpError(`'${name}' precisa ser um número`);
  if (n < lo - 1e-9 || n > hi + 1e-9) throw new OpError(`'${name}' precisa estar entre ${r3(lo)} e ${r3(hi)} (veio ${n})`);
  return n;
}
const optNum = (v: unknown, name: string, lo: number, hi: number, d: number) => (v === undefined || v === null ? d : num(v, name, lo, hi));
function id(v: unknown, name: string): string {
  if (typeof v !== "string" || !/^[a-z0-9][a-z0-9._-]{0,60}$/i.test(v)) throw new OpError(`'${name}' precisa ser um nome simples (letras, números, - e _)`);
  return v;
}
const snapF = (t: number, fps: number) => Math.round(t * fps) / fps;

// ── the timeline operations (stored in ops) ─────────────────────────────────────

/**
 * Ripple trim of one take. The take keeps its timeline start; its source in-point
 * moves by start_delta and its length by end_delta - start_delta. Everything after
 * the take moves by the same amount; times inside the take follow its picture.
 * A point event in the last 0.5 s of the take (a whoosh leading the cut) stays
 * anchored to the cut. (Moved here from apply-feedback.ts in 1.7.0, unchanged.)
 */
export function rippleTrim(spec: EditSpec, t: { id: string; start_delta: number; end_delta: number }, dropped: string[]): void {
  const fmt = (x: number) => `${Math.floor(x / 60)}:${(x % 60).toFixed(2).padStart(5, "0")}`;
  const layer = spec.layers.find((l) => l.id === t.id)!;
  const S = layer.start, E = layer.start + layer.duration;
  const ds = t.start_delta, de = t.end_delta, shift = de - ds;
  const newEnd = E + shift;
  const inside = (x: number) => Math.min(newEnd, Math.max(S, x - ds));
  const span = (x: number) => (x < S - 1e-6 ? x : x < E - 1e-6 ? inside(x) : x + shift);
  const point = (x: number) => (x >= S - 1e-6 && x < E - 1e-6 && E - x <= 0.5 ? x + shift : span(x));
  const oldD = spec.duration;

  layer.in = r3((layer.in ?? 0) + ds * (layer.speed ?? 1));
  layer.duration = layer.duration + shift;   // layer times keep full precision: rounding one side left the last take ending after the video
  for (const l of spec.layers) if (l !== layer && l.start >= E - 1e-6) l.start = l.start + shift;
  for (const l of spec.layers) if (l !== layer && l.rect && l.start > S && l.start < E) l.start = r3(inside(l.start));

  if (spec.captions) {
    const kept: typeof spec.captions.words = [];
    for (const w of spec.captions.words) {
      if (w.start >= S - 1e-6 && w.start < E - 1e-6) {
        const a = w.start - ds, b = w.end - ds;
        if (a < S - 1e-6 || a >= newEnd - 1e-6) { dropped.push(`"${w.word}" (${fmt(w.start)}) saiu com o corte de ${t.id}`); continue; }
        kept.push({ ...w, start: r3(a), end: r3(Math.min(b, newEnd)) });
      } else kept.push({ ...w, start: r3(span(w.start)), end: r3(span(w.end)) });
    }
    spec.captions.words = kept;
    delete spec.captions.group_font_px;
  }
  for (const x of spec.texts) if (x.mode !== "fixed") { x.start = r3(span(x.start)); x.end = r3(span(x.end)); }
  for (const m of spec.camera) {
    if (m.type === "push") { m.start = r3(span(m.start)); m.end = Math.abs(m.end - oldD) < 1e-6 ? oldD + shift : r3(span(m.end)); }
    else if (m.type === "impact") m.at = r3(point(m.at));
    else if (m.type === "punch_in" && !m.auto) { m.at = r3(span(m.at)); m.until = r3(span(m.until)); }
  }
  for (const f of spec.flashes ?? []) f.at = r3(point(f.at));
  for (const s of spec.audio.sfx) s.at = r3(point(s.at));
  for (const m of spec.audio.mutes ?? []) { m.start = r3(span(m.start)); m.end = r3(span(m.end)); }
  if (spec.audio.music?.start) spec.audio.music.start = r3(span(spec.audio.music.start));
  for (const h of spec.hooks_applied) h.at = r3(point(h.at));
  if (spec.frame_at !== undefined) spec.frame_at = r3(span(spec.frame_at));
  spec.duration = oldD + shift;
}

/** Splits take `l` at timeline second t: same source, the second piece continues where the first stops. */
function splitTake(spec: EditSpec, l: MediaLayer, t: number): MediaLayer {
  const used = new Set(spec.layers.map((x) => x.id));
  let n = 2, nid = `${l.id}-${n}`;
  while (used.has(nid)) nid = `${l.id}-${++n}`;
  const b: MediaLayer = { ...structuredClone(l), id: nid, start: t, duration: l.start + l.duration - t, in: r3((l.in ?? 0) + (t - l.start) * (l.speed ?? 1)) };
  delete b.transition_in;
  l.duration = t - l.start;
  spec.layers.splice(spec.layers.indexOf(l) + 1, 0, b);
  return b;
}

/** Removes [a, b] of the timeline (ripple): whole takes, take edges, or the middle of a take (split + trim). */
function cutRange(spec: EditSpec, a: number, b: number, dropped: string[]): void {
  const fps = spec.canvas.fps, eps = 0.5 / fps;
  const tk = takes(spec);
  if (!tk.length) throw new OpError("cortar só funciona em vídeo com takes (rosto falando)");
  // the stretch must be covered by takes, without a hole
  let covered = a;
  for (const l of tk) if (l.start <= covered + eps && l.start + l.duration > covered) covered = l.start + l.duration;
  if (covered < b - eps) throw new OpError("o trecho tem uma parte sem take de vídeo; corte só dentro dos takes");
  for (const l of [...tk].reverse()) {
    const S = l.start, E = l.start + l.duration;
    const pa = Math.max(a, S), pb = Math.min(b, E);
    if (pb - pa < eps) continue;
    const head = pa - S, tail = E - pb;
    if (head < eps && tail < eps) {
      rippleTrim(spec, { id: l.id, start_delta: 0, end_delta: -(E - S) }, dropped);
      spec.layers = spec.layers.filter((x) => x !== l);
    } else if (head < eps) {
      if (tail < 0.2) throw new OpError(`sobraria só ${fmtS(tail)} do take ${l.id}; corte o take inteiro ou um trecho menor`);
      rippleTrim(spec, { id: l.id, start_delta: pb - S, end_delta: 0 }, dropped);
    } else if (tail < eps) {
      if (head < 0.2) throw new OpError(`sobraria só ${fmtS(head)} do take ${l.id}; corte o take inteiro ou um trecho menor`);
      rippleTrim(spec, { id: l.id, start_delta: 0, end_delta: -(E - pa) }, dropped);
    } else {
      if (head < 0.2 || tail < 0.2) throw new OpError(`o corte deixaria um pedaço de take com menos de 0,2 s (${l.id})`);
      splitTake(spec, l, pb);
      rippleTrim(spec, { id: l.id, start_delta: 0, end_delta: -(pb - pa) }, dropped);
    }
  }
  if (spec.duration < 1) throw new OpError("o vídeo ficaria com menos de 1 s");
}

const SFX_HOOK: Record<string, string> = { whoosh: "whoosh", hit: "hit", riser: "riser" };
const isWhooshSfx = (s: { src: string; hook?: string }) => s.hook === "whoosh" || /whoosh/i.test(s.src);

function addHook(spec: EditSpec, hook: string, at: number, why: string) {
  spec.hooks_applied.push({ hook, at: r3(at), why });
}

/**
 * Applies one stored operation to `spec` (in place) and returns what it did, in Portuguese.
 * `src` is the reviewed spec (sizes are relative to it). Throws OpError when it cannot apply.
 */
export function applyOp(spec: EditSpec, src: EditSpec, o: StoredOp, srcDuration: (p: string) => number, dropped: string[] = []): string {
  const D = spec.duration, fps = spec.canvas.fps;
  switch (o.op) {
    case "cut": {
      if (o.start < -1e-6 || o.end > D + 1e-6 || o.end - o.start < 1 / fps - 1e-6) throw new OpError(`trecho ${fmtT(o.start)} a ${fmtT(o.end)} fora do vídeo (${fmtS(D)})`);
      if (o.end - o.start > D * 0.6) throw new OpError("corte grande demais (mais de 60 % do vídeo); peça em partes");
      cutRange(spec, Math.max(0, o.start), Math.min(D, o.end), dropped);
      addHook(spec, "hard_cut", o.start, "editor com IA: stretch removed, jump cut");
      return `corte de ${fmtS(o.end - o.start)} em ${fmtT(o.start)}`;
    }
    case "trim_take": {
      const lim = trimLimits(spec, o.take, srcDuration);
      if (!lim) throw new OpError(`o take ${o.take} não existe (takes: ${takes(spec).map((t) => t.id).join(", ")})`);
      if (o.start_delta < lim.start_min - 1e-6 || o.start_delta > lim.start_max + 1e-6) throw new OpError(`${o.take}: início fora do take original (${lim.start_min} a ${lim.start_max} s)`);
      if (o.end_delta < lim.end_min - 1e-6 || o.end_delta > lim.end_max + 1e-6) throw new OpError(`${o.take}: fim fora do take original (${lim.end_min} a ${lim.end_max} s)`);
      rippleTrim(spec, { id: o.take, start_delta: o.start_delta, end_delta: o.end_delta }, dropped);
      const parts = [o.start_delta && `início ${o.start_delta > 0 ? "+" : ""}${o.start_delta} s`, o.end_delta && `fim ${o.end_delta > 0 ? "+" : ""}${o.end_delta} s`].filter(Boolean);
      return `take ${o.take}: ${parts.join(", ")}`;
    }
    case "zoom": {
      if (o.at > D - 0.1) throw new OpError(`zoom em ${fmtT(o.at)} fica depois do fim do vídeo`);
      spec.camera.push({ type: "impact", at: r3(o.at), amount: o.amount, attack: 0.1, release: 0.35 });
      addHook(spec, "impact_zoom", o.at, "editor com IA: zoom requested at this moment");
      return `zoom de ${Math.round(o.amount * 100)} % em ${fmtT(o.at)}`;
    }
    case "punch_in": {
      if (o.until > D + 1e-6 || o.at >= D) throw new OpError(`punch-in de ${fmtT(o.at)} a ${fmtT(o.until)} sai do vídeo`);
      spec.camera.push({ type: "punch_in", at: r3(o.at), until: r3(o.until), amount: o.amount });
      addHook(spec, "punch_in_cut", o.at, "editor com IA: punch-in requested over this stretch");
      return `punch-in de ${Math.round(o.amount * 100)} % de ${fmtT(o.at)} a ${fmtT(o.until)}`;
    }
    case "sfx": {
      if (o.at >= D) throw new OpError(`efeito em ${fmtT(o.at)} fica depois do fim do vídeo`);
      const x = pickSfx(o.name);
      if (!x) throw new OpError(`o efeito "${o.name}" não está na biblioteca deste computador (veja library.sfx no agent-inbox)`);
      spec.audio.sfx.push({ src: `@sfx:${o.name}`, at: r3(o.at), gain_db: o.gain_db, hook: SFX_HOOK[o.name] ?? o.name, anchor: true });
      addHook(spec, SFX_HOOK[o.name] ?? "asmr_detail", o.at, `editor com IA: sound effect ${o.name}`);
      return `efeito ${o.name} em ${fmtT(o.at)} (${fmtDb(o.gain_db)})`;
    }
    case "sfx_remove": {
      const hit = (s: EditSpec["audio"]["sfx"][number]) => Math.abs(s.at - o.at) <= 0.35 && (!o.name || s.hook === o.name || s.library === o.name || s.src === `@sfx:${o.name}` || s.src.includes(o.name));
      const n = spec.audio.sfx.filter(hit).length;
      if (!n) throw new OpError(`não há efeito${o.name ? ` ${o.name}` : ""} perto de ${fmtT(o.at)}`);
      spec.audio.sfx = spec.audio.sfx.filter((s) => !hit(s));
      return `${n} efeito(s) tirado(s) perto de ${fmtT(o.at)}`;
    }
    case "music": {
      const ref = o.track ?? o.mood;
      if (ref) {
        const t = pickTrack(o.mood ?? ref, o.track);
        if (!t) throw new OpError(`a música "${ref}" não está disponível neste computador (veja library.music no agent-inbox)`);
        const m = spec.audio.music ?? { below_voice_db: 22, duck_db: 8 };
        m.path = `@music:${t.id}`;
        delete m.src; delete m.offset; delete m.measured; delete m.library; delete m.mood; delete m.track;
        if (m.below_voice_db === undefined && m.gain_db === undefined) m.below_voice_db = 22;
        spec.audio.music = m;
        if (!spec.hooks_applied.some((h) => h.hook === "music_duck")) addHook(spec, "music_duck", m.start ?? 0, "editor com IA: library music under the voice");
      }
      if (o.start !== undefined) {
        if (!spec.audio.music) throw new OpError("o vídeo não tem música para mudar o início");
        if (o.start > D - 0.5) throw new OpError(`a música precisa entrar antes de ${fmtT(D - 0.5)}`);
        spec.audio.music.start = r3(o.start);
      }
      return [ref && `música: ${ref}`, o.start !== undefined && `música entra em ${fmtT(o.start)}`].filter(Boolean).join(", ");
    }
    case "caption_size": {
      if (!spec.captions || !src.captions) throw new OpError("este vídeo não tem legenda");
      const from = src.captions.style.font_px ?? BOLD_WORD_STYLE.font_px;
      spec.captions.style.font_px = Math.round(from * o.pct / 100);
      delete spec.captions.group_font_px;
      return `legenda em ${o.pct} % (fonte ${from} -> ${spec.captions.style.font_px} px; a largura máxima segura ainda vale)`;
    }
    case "caption_move": {
      if (!spec.captions) throw new OpError("este vídeo não tem legenda");
      const H = spec.canvas.height;
      if (o.y < H * 0.45 || o.y > H * 0.85) throw new OpError(`a legenda precisa ficar entre y ${Math.round(H * 0.45)} e ${Math.round(H * 0.85)}`);
      const was = spec.captions.y;
      spec.captions.y = Math.round(o.y);
      return `legenda ${o.y < was ? "mais para cima" : "mais para baixo"} (y ${was} -> ${spec.captions.y})`;
    }
    case "whoosh_cuts": {
      const tk = takes(spec);
      if (tk.length < 2) throw new OpError("não há troca de take para pôr whoosh");
      let n = 0;
      for (let k = 1; k < tk.length; k++) {
        const at = r3(tk[k].start);
        if (spec.audio.sfx.some((s) => isWhooshSfx(s) && Math.abs(s.at - at) < 0.3)) continue;
        spec.audio.sfx.push({ src: "@sfx:whoosh", at, gain_db: -26, hook: "whoosh", only_with_music: true, anchor: true });
        n++;
      }
      if (n) addHook(spec, "whoosh", tk[1].start, "editor com IA: low whoosh on the take cuts, only with music");
      return `whoosh em ${n} troca(s) de take${spec.audio.music ? "" : " (só toca com música)"}`;
    }
  }
}

/** Applies the stored ops in order (render path): one that no longer fits goes to `pending`, never stops the render. */
export function applyOps(spec: EditSpec, src: EditSpec, ops: EditOp[], srcDuration: (p: string) => number, applied: string[], pending: string[]): void {
  const dropped: string[] = [];
  for (const o of ops) {
    try { applied.push(`${o.req ? `pedido ${o.req}: ` : ""}${applyOp(spec, src, o, srcDuration, dropped)}`); }
    catch (e) { pending.push(`operação ${o.op}${o.req ? ` do pedido ${o.req}` : ""} não aplicada: ${(e as Error).message}`); }
  }
  for (const d of dropped) applied.push(`palavra da legenda removida: ${d}`);
}

// ── what the agent sends (edit-op) -> sections and stored ops ──────────────────

/** Operation names the agent (and the quick commands) may use: the closed set. */
export const OP_NAMES = ["cut", "trim_take", "zoom", "punch_in", "sfx", "sfx_remove", "music", "caption_size", "caption_move", "whoosh",
  "headline", "caption_style", "caption_word", "caption_emphasis"] as const;
export type OpName = (typeof OP_NAMES)[number];

export interface TranslateCtx {
  base: EditSpec;             // the session spec (reviewed)
  fb: Feedback | null;        // feedback now
  current: EditSpec;          // base + every saved change (the timeline the person sees)
  srcDuration: (p: string) => number;
  req?: string;
  uid: () => string;
}
export interface Translated { values: Partial<Record<Section, unknown>>; done: string[] }

/** Current values of a section (what the page shows). */
export function styleNow(ctx: { base: EditSpec; fb: Feedback | null }): StyleChoice {
  return { headline_size_pct: 100, ...(ctx.fb?.style ?? styleOfSpec(ctx.base)) };
}

/** Validates the raw ops of one edit-op call (or quick command) and turns them into section values. */
export function translateOps(raw: unknown, ctx: TranslateCtx): Translated {
  if (!Array.isArray(raw) || !raw.length) throw new OpError("mande pelo menos uma operação ('ops': [...])");
  if (raw.length > 20) throw new OpError("operações demais de uma vez (máximo 20)");
  const done: string[] = [];
  const values: Partial<Record<Section, unknown>> = {};
  let style: StyleChoice | null = null;
  let words: Map<number, CaptionEdit> | null = null, emph: Map<number, EmphasisEdit> | null = null;
  const ops: EditOp[] = [...(ctx.fb?.ops ?? [])];
  const work = structuredClone(ctx.current);
  const baseWords = ctx.base.captions?.words ?? [];
  const st = () => (style ??= structuredClone(styleNow(ctx)));
  const addStored = (o: StoredOp) => {
    const d = applyOp(work, ctx.base, o, ctx.srcDuration);   // throws when it does not fit the current video
    ops.push({ uid: ctx.uid(), ...(ctx.req ? { req: ctx.req } : {}), ...o } as EditOp);
    done.push(d);
  };
  const D = () => work.duration;
  for (const [i, r] of (raw as any[]).entries()) {
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new OpError(`operação ${i + 1}: precisa ser um objeto`);
    const name = r.op as OpName;
    if (!OP_NAMES.includes(name)) throw new OpError(`operação ${i + 1}: '${String(r.op).slice(0, 30)}' não existe (use ${OP_NAMES.join(", ")})`);
    const at = (k = "at") => snapF(num(r[k], k, 0, D()), work.canvas.fps);
    try {
      switch (name) {
        case "cut": {
          const a = at("start"), b = at("end");
          if (b <= a) throw new OpError("'end' precisa ser depois de 'start'");
          addStored({ op: "cut", start: a, end: b });
          break;
        }
        case "trim_take":
          addStored({ op: "trim_take", take: id(r.take, "take"), start_delta: r3(optNum(r.start_delta, "start_delta", -2, 2, 0)), end_delta: r3(optNum(r.end_delta, "end_delta", -2, 2, 0)) });
          break;
        case "zoom":
          addStored({ op: "zoom", at: at(), amount: r3(optNum(r.amount, "amount", 0.04, 0.3, 0.12)) });
          break;
        case "punch_in": {
          const a = at(), u = r.until === undefined ? Math.min(D(), a + 1.5) : snapF(num(r.until, "until", 0, D()), work.canvas.fps);
          if (u - a < 0.2 || u - a > 8) throw new OpError("o punch-in precisa durar de 0,2 a 8 s");
          addStored({ op: "punch_in", at: a, until: r3(u), amount: r3(optNum(r.amount, "amount", 0.04, 0.2, 0.1)) });
          break;
        }
        case "sfx":
          addStored({ op: "sfx", at: r3(num(r.at, "at", 0, D())), name: id(r.name, "name"), gain_db: Math.round(optNum(r.gain_db, "gain_db", -40, 0, -12)) });
          break;
        case "sfx_remove":
          addStored({ op: "sfx_remove", at: r3(num(r.at, "at", 0, D())), ...(r.name !== undefined ? { name: id(r.name, "name") } : {}) });
          break;
        case "caption_size": {
          const pct = Math.round(num(r.pct, "pct", 70, 140));
          addStored({ op: "caption_size", pct });
          break;
        }
        case "caption_move":
          addStored({ op: "caption_move", y: Math.round(num(r.y, "y", 0, work.canvas.height)) });
          break;
        case "music": {
          const s = st();
          const stored: StoredOp & { op: "music" } = { op: "music" };
          if (r.mood !== undefined) stored.mood = id(r.mood, "mood");
          if (r.track !== undefined) stored.track = id(r.track, "track");
          if (r.start !== undefined) stored.start = r3(num(r.start, "start", 0, D()));
          if (stored.mood || stored.track || stored.start !== undefined) {
            addStored(stored);
            if (stored.mood || stored.track) s.music_enabled = true;
          }
          if (r.enabled !== undefined) {
            if (typeof r.enabled !== "boolean") throw new OpError("'enabled' precisa ser true ou false");
            if (r.enabled && !work.audio.music && !ctx.base.audio.music) throw new OpError("o vídeo não tem música: diga qual (mood ou track) junto");
            s.music_enabled = r.enabled;
            done.push(r.enabled ? "música ligada" : "música desligada");
          }
          if (r.change_db !== undefined) {
            const d = num(r.change_db, "change_db", -20, 20);
            const next = Math.round((s.music_gain_delta_db + d) * 2) / 2;
            if (next < -12 || next > 6) throw new OpError(`o volume da música ficaria em ${fmtDb(next)}; o limite é de −12 a +6 dB`);
            s.music_gain_delta_db = next;
            done.push(`música ${fmtDb(d)} (agora ${fmtDb(next)} em relação ao original)`);
          }
          if (!stored.mood && !stored.track && stored.start === undefined && r.enabled === undefined && r.change_db === undefined) throw new OpError("'music' precisa de mood, track, start, enabled ou change_db");
          break;
        }
        case "whoosh": {
          if (typeof r.on !== "boolean") throw new OpError("'on' precisa ser true ou false");
          const s = st();
          const baseHas = ctx.base.audio.sfx.some(isWhooshSfx);
          s.whoosh_enabled = r.on;
          if (r.on && !baseHas && !work.audio.sfx.some(isWhooshSfx)) addStored({ op: "whoosh_cuts" });
          else done.push(r.on ? "whoosh ligado" : "whoosh desligado");
          break;
        }
        case "headline": {
          const s = st();
          if (!ctx.base.texts.some((t) => t.role === "hook")) throw new OpError("este vídeo não tem headline");
          if (r.lines !== undefined) {
            if (!Array.isArray(r.lines)) throw new OpError("'lines' precisa ser uma lista de linhas");
            s.headline_lines = r.lines.map((l: unknown) => (typeof l === "string" ? l : ""));
            done.push(`headline: "${s.headline_lines.join(" / ")}"`);
          }
          if (r.mode !== undefined) { s.headline_mode = r.mode; done.push(r.mode === "intro" ? "headline só nos 3 primeiros segundos" : "headline no vídeo todo"); }
          if (r.size_pct !== undefined) { s.headline_size_pct = Math.round(num(r.size_pct, "size_pct", 80, 120)); done.push(`headline em ${s.headline_size_pct} %`); }
          if (r.lines === undefined && r.mode === undefined && r.size_pct === undefined) throw new OpError("'headline' precisa de lines, mode ou size_pct");
          break;
        }
        case "caption_style": {
          const s = st();
          s.caption_preset = r.preset;
          done.push(r.preset === "classic" ? "legenda clássica" : "legenda palavra que cresce (bold)");
          break;
        }
        case "caption_word": {
          const idx = num(r.index, "index", 0, baseWords.length - 1);
          if (!Number.isInteger(idx)) throw new OpError("'index' precisa ser o número inteiro da palavra (campo i do transcript)");
          words ??= new Map((ctx.fb?.caption_edits ?? []).map((e) => [e.index, e]));
          const to = typeof r.to === "string" ? r.to.trim() : "";
          if (to === baseWords[idx].word) words.delete(idx);
          else words.set(idx, { index: idx, from: baseWords[idx].word, to });
          done.push(`legenda: "${baseWords[idx].word}" -> "${to}"`);
          break;
        }
        case "caption_emphasis": {
          const idx = num(r.index, "index", 0, baseWords.length - 1);
          if (!Number.isInteger(idx)) throw new OpError("'index' precisa ser o número inteiro da palavra (campo i do transcript)");
          if (typeof r.on !== "boolean") throw new OpError("'on' precisa ser true ou false");
          emph ??= new Map((ctx.fb?.emphasis ?? []).map((e) => [e.index, e]));
          if (r.on === !!baseWords[idx].emphasis) emph.delete(idx);
          else emph.set(idx, { index: idx, word: baseWords[idx].word, on: r.on });
          done.push(`"${baseWords[idx].word}" ${r.on ? "em destaque" : "sem destaque"}`);
          break;
        }
      }
    } catch (e) {
      if (e instanceof OpError || e instanceof BadRequest) throw new OpError(`operação ${i + 1} (${name}): ${e.message}`);
      throw e;
    }
  }
  try {
    if (style) values.style = validateStyle(style);
    if (words) values.caption_edits = validateCaptionEdits({ edits: [...words.values()] }, ctx.base);
    if (emph) values.emphasis = validateEmphasis({ edits: [...emph.values()] }, ctx.base);
  } catch (e) { throw new OpError((e as Error).message); }
  if (ops.length !== (ctx.fb?.ops ?? []).length) values.ops = ops;
  return { values, done };
}

// ── what the agent reads (agent-inbox) ────────────────────────────────────────

type W = { word: string; start: number; end: number; emphasis?: boolean; src_index?: number };

/** Short description of the current video: what the agent edits. */
export function liveSummary(cur: EditSpec, base: EditSpec, fb: Feedback | null) {
  const s = styleNow({ base, fb });
  const hook = cur.texts.find((t) => t.role === "hook");
  const m = cur.audio.music;
  const capPct = [...(fb?.ops ?? [])].reverse().find((o) => o.op === "caption_size") as { pct: number } | undefined;
  return {
    duration: r3(cur.duration), fps: cur.canvas.fps, canvas: { width: cur.canvas.width, height: cur.canvas.height }, template: cur.template,
    takes: takes(cur).map((l) => ({ id: l.id, start: r3(l.start), end: r3(l.start + l.duration), source: l.src.split(/[\\/]/).pop(), source_in: r3(l.in ?? 0) })),
    headline: hook ? { lines: hook.lines, mode: hook.mode ?? "timed", start: r3(hook.start), end: r3(hook.end), size_pct: s.headline_size_pct ?? 100 } : null,
    captions: cur.captions ? { preset: cur.captions.preset ?? "classic", y: cur.captions.y, size_pct: capPct?.pct ?? 100, words: cur.captions.words.length,
      emphasis: cur.captions.words.filter((w) => w.emphasis).map((w) => w.word) } : null,
    music: m ? { track: (m as { library?: string }).library ?? (musicPath(m) ?? "").split(/[\\/]/).pop()?.replace(/^@music:/, ""), start: m.start ?? 0,
      level: m.below_voice_db !== undefined ? `${m.below_voice_db} LU below the voice` : `${m.gain_db ?? -6} dB`, enabled: s.music_enabled, change_db: s.music_gain_delta_db } : null,
    whoosh: { enabled: s.whoosh_enabled, count: cur.audio.sfx.filter(isWhooshSfx).length },
    zooms: cur.camera.filter((c) => c.type !== "push").map((c) => c.type === "impact" ? { kind: "zoom", at: r3(c.at), amount: c.amount }
      : c.type === "punch_in" ? { kind: c.auto ? "punch_in (auto, alternate takes)" : "punch_in", at: r3(c.at), until: r3(c.until), amount: c.amount } : null).filter(Boolean),
    sfx: cur.audio.sfx.map((x) => ({ at: r3(x.at), name: x.library ?? x.hook ?? x.src.split(/[\\/]/).pop(), gain_db: x.gain_db ?? 0 })),
  };
}

/** Words of the current timeline around t (i = index for caption_word / caption_emphasis). */
export function transcriptAround(cur: EditSpec, t: number, span = 5) {
  const words = (cur.captions?.words ?? []) as W[];
  const near = words.filter((w) => w.end >= t - span && w.start <= t + span);
  return {
    cursor: r3(t),
    text_before: words.filter((w) => w.end <= t).slice(-12).map((w) => w.word).join(" "),
    text_after: words.filter((w) => w.start >= t).slice(0, 12).map((w) => w.word).join(" "),
    words: near.map((w) => ({ i: w.src_index ?? null, word: w.word, start: w.start, end: w.end, ...(w.emphasis ? { emphasis: true } : {}) })),
    full_text: words.map((w) => w.word).join(" ").slice(0, 3000),
  };
}

/** What is on this computer: sound effect names and music moods and tracks the ops accept. */
export function libraryNow() {
  const si = sfxIndex(), mi = musicIndex();
  const fx = si ? Object.entries(si.effects).filter(([, e]) => effectFile(e)).map(([k]) => k) : [];
  return {
    sfx_roles: Object.keys(si?.roles ?? {}),
    sfx_categories: Object.entries(si?.categories ?? {}).filter(([, ids]) => ids.some((i) => si!.effects[i] && effectFile(si!.effects[i]))).map(([c]) => c),
    sfx: fx,
    music_moods: Object.keys(mi?.moods ?? {}),
    music_tracks: mi ? Object.entries(mi.tracks).filter(([, t]) => trackFile(t)).map(([k, t]) => `${k} (${t.mood})`) : [],
  };
}

/** The closed set, as the agent reads it in agent-inbox. Times are seconds of the current video. */
export const OPS_HELP = [
  { op: "cut", fields: "start, end", what: "remove the stretch [start, end] (ripple; may split a take). Remove a pause by cutting the silence between two words, keeping ~0.1 s after the last word.", example: { op: "cut", start: 3.93, end: 4.17 } },
  { op: "trim_take", fields: "take, start_delta, end_delta", what: "move a take edge inside the original clip (+start_delta shortens the start, +end_delta extends the end), -2 to 2 s", example: { op: "trim_take", take: "s3-b", end_delta: 0.2 } },
  { op: "zoom", fields: "at, amount=0.12 (0.04..0.3)", what: "quick impact zoom at T", example: { op: "zoom", at: 3.62 } },
  { op: "punch_in", fields: "at, until=at+1.5, amount=0.1 (0.04..0.2)", what: "hold a closer framing from at to until", example: { op: "punch_in", at: 3.6, until: 4.6 } },
  { op: "sfx", fields: "at, name, gain_db=-12 (-40..0)", what: "library sound effect whose audible hit lands on T; name = a role, category or id from library", example: { op: "sfx", at: 3.62, name: "pop-ui" } },
  { op: "sfx_remove", fields: "at, name?", what: "remove the effect(s) within 0.35 s of T", example: { op: "sfx_remove", at: 5.03 } },
  { op: "music", fields: "mood? | track?, start?, enabled?, change_db?", what: "change the track (library mood or id), when it enters, switch it on or off, or change its level (change_db is relative, total -12..+6 dB)", example: { op: "music", change_db: -3 } },
  { op: "whoosh", fields: "on", what: "whoosh on the take cuts on or off", example: { op: "whoosh", on: false } },
  { op: "headline", fields: "lines?, mode? (fixed|intro), size_pct? (80..120)", what: "headline text (1 to 3 lines), whole video or first 3 s, size", example: { op: "headline", mode: "intro" } },
  { op: "caption_style", fields: "preset (bold-word|classic)", what: "caption look", example: { op: "caption_style", preset: "classic" } },
  { op: "caption_word", fields: "index, to", what: "fix the text of one caption word (index = i in transcript.words; one word, no spaces)", example: { op: "caption_word", index: 11, to: "água," } },
  { op: "caption_emphasis", fields: "index, on", what: "keyword colour on or off for one caption word", example: { op: "caption_emphasis", index: 11, on: true } },
  { op: "caption_size", fields: "pct (70..140)", what: "caption font as % of the original", example: { op: "caption_size", pct: 110 } },
  { op: "caption_move", fields: "y (45 to 85 % of the height)", what: "move the captions up or down (canvas px)", example: { op: "caption_move", y: 1250 } },
] as const;

/** Caption groups of the current video, for the timeline (text as shown, first word index). */
export function groupsOf(cur: EditSpec) {
  if (!cur.captions?.words.length) return [];
  return captionGroups(cur.captions).map((g) => ({ start: r3(g[0].start), end: r3(g[g.length - 1].end), text: g.map((w) => w.word).join(" "),
    i: (g[0] as W).src_index ?? null, emphasis: g.some((w) => w.emphasis) }));
}

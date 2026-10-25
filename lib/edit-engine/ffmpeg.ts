// Default render engine: edit spec (JSON) -> MP4 through one ffmpeg filtergraph.
// No resident process; specs render in parallel. Bun only.
//   bun lib/edit-engine/cli.ts render <spec.json> <out.mp4>
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildAss } from "./ass.ts";
import { ffmpeg, fontsDirFor, hasAudio, loudness } from "./measure.ts";
import { fitTexts, type FitLog } from "./safezones.ts";
import { adjacent, assertValid, musicPath, sfxStart, takes, type CameraMove, type EditSpec, type MediaLayer } from "./spec.ts";
import { materializeBroll } from "./broll.ts";
import { materializeReframe, reframeChain } from "./reframe.ts";

const f3 = (n: number) => Number(n.toFixed(3)).toString();
const SS = 2; // zoompan supersampling, limits sub-pixel jitter on slow pushes

function fitChain(l: MediaLayer, w: number, h: number): string {
  return l.fit === "contain"
    ? `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos:out_range=tv,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`
    : `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos:out_range=tv,crop=${w}:${h}${l.crop_focus ? `:(iw-ow)*${f3(l.crop_focus.x ?? 0.5)}:(ih-oh)*${f3(l.crop_focus.y ?? 0.5)}` : ""}`;
}

/**
 * Zoom as a function of the output frame for zoompan. Punch-ins switch on whole
 * frames, half-open [at, until): the frame of a cut belongs to the incoming take
 * only (an inclusive end zoomed the first frame of the next take).
 */
export function zoomExpr(moves: CameraMove[], fps: number): string {
  const T = `(on/${fps})`;
  const parts: string[] = [];
  const push = moves.find((m) => m.type === "push") as Extract<CameraMove, { type: "push" }> | undefined;
  if (push) {
    const span = Math.max(0.001, push.end - push.start);
    parts.push(`if(lt(${T},${f3(push.start)}),${f3(push.from)},if(gt(${T},${f3(push.end)}),${f3(push.to)},${f3(push.from)}+(${f3(push.to - push.from)})*(${T}-${f3(push.start)})/${f3(span)}))`);
  } else parts.push("1");
  for (const m of moves) {
    if (m.type === "impact") {
      const a = m.attack ?? 0.1, r = m.release ?? 0.35;
      parts.push(`${f3(m.amount)}*if(lt(${T},${f3(m.at)}),0,if(lt(${T},${f3(m.at + a)}),(${T}-${f3(m.at)})/${f3(a)},if(lt(${T},${f3(m.at + a + r)}),pow(1-(${T}-${f3(m.at + a)})/${f3(r)},2),0)))`);
    } else if (m.type === "punch_in") {
      parts.push(`${f3(m.amount)}*gte(on,${Math.round(m.at * fps)})*lt(on,${Math.round(m.until * fps)})`);
    }
  }
  return `max(1,${parts.join("+")})`;
}

/** Same zoom as zoomExpr, evaluated in TypeScript for output frame `n` (used by the QA). */
export function zoomAt(moves: CameraMove[], fps: number, n: number): number {
  const T = n / fps;
  let z = 1;
  const push = moves.find((m) => m.type === "push") as Extract<CameraMove, { type: "push" }> | undefined;
  if (push) {
    const span = Math.max(0.001, push.end - push.start);
    z = T < push.start ? push.from : T > push.end ? push.to : push.from + (push.to - push.from) * (T - push.start) / span;
  }
  for (const m of moves) {
    if (m.type === "impact") {
      const a = m.attack ?? 0.1, r = m.release ?? 0.35;
      z += T < m.at ? 0 : T < m.at + a ? m.amount * (T - m.at) / a : T < m.at + a + r ? m.amount * Math.pow(1 - (T - m.at - a) / r, 2) : 0;
    } else if (m.type === "punch_in") {
      if (n >= Math.round(m.at * fps) && n < Math.round(m.until * fps)) z += m.amount;
    }
  }
  return Math.max(1, z);
}

const stageOf = (o: RenderOptions) => o.onStage ?? (() => {});

/**
 * One B-roll layer over the camera output (2.1.0). Cards: QuickTime Animation with alpha, placed frame-exact
 * like editonny's render.py (settb, setpts=N+start, overlay format=auto). Inserts: the person's image (slow push)
 * or video (muted), cover-fitted to its rect. k scales positions for the draft render. Returns the next input index.
 */
function brollLayer(l: MediaLayer, k: number, input: number, below: string, outLabel: string, args: string[], graph: string[], fps: number, scale: number): number {
  const F0 = Math.round(l.start * fps), F1 = Math.round((l.start + l.duration) * fps), n = Math.max(1, F1 - F0);
  const r = l.rect!, rw = Math.round(r.w * scale), rh = Math.round(r.h * scale), x = Math.round(r.x * scale), y = Math.round(r.y * scale);
  const enable = `enable='between(n,${F0},${F1 - 1})'`;
  if (l.alpha) {
    args.push("-i", l.src);
    const sc = scale !== 1 ? `,scale=${rw}:${rh}:flags=bicubic` : "";
    graph.push(`[${input}:v]trim=end_frame=${n},settb=1/${fps},setpts=N+${F0},format=rgba${sc},scale=out_color_matrix=bt709:out_range=tv,format=yuva420p[B${k}]`);
    graph.push(`[${below}][B${k}]overlay=x=${x}:y=${y}:eof_action=pass:format=auto:${enable}[${outLabel}]`);
    return input + 1;
  }
  const b = Math.round((l.border_px ?? 0) * scale);
  const pad = b ? `,pad=iw+${2 * b}:ih+${2 * b}:${b}:${b}:color=${l.border_color ?? "white"}` : "";
  let head: string;
  if (l.kind === "image") {
    args.push("-loop", "1", "-framerate", String(fps), "-t", f3(l.duration + 0.5), "-i", l.src);
    // slow push 1.00 -> 1.05 over the insert (supersampled, as the main camera)
    head = `fps=${fps},${fitChain(l, rw * SS, rh * SS)},setsar=1,zoompan=z='1+0.05*on/${n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${rw}x${rh}:fps=${fps}`;
  } else {
    args.push("-ss", f3(l.in ?? 0), "-t", f3(l.duration + 0.5), "-i", l.src);
    head = `setpts=PTS-STARTPTS,fps=${fps},${fitChain(l, rw, rh)},setsar=1`;
  }
  graph.push(`[${input}:v]${head},format=yuv420p${pad},tpad=stop_mode=clone:stop_duration=${f3(l.duration)},trim=end_frame=${n},settb=1/${fps},setpts=PTS-STARTPTS+${F0}[B${k}]`);
  graph.push(`[${below}][B${k}]overlay=x=${x - b}:y=${y - b}:eof_action=pass:${enable}[${outLabel}]`);
  return input + 1;
}

export interface RenderResult { out: string; frame: string; fit_log: FitLog[]; seconds: number; resolved_spec: string }

/**
 * Options used by the mini editor (editor-job.ts). `cli.ts render` sets none of them, so a normal
 * render builds exactly the same filtergraph and the same bytes as before.
 *   draft         picture scaled to width x height (zoompan without supersampling), faster x264 preset
 *                 and higher CRF; text is still burned (libass scales PlayRes to the frame)
 *   noText        clean base layer: no headline and no captions burned, no text fit (the page draws them)
 *   progressFile  ffmpeg -progress file of the picture pass; the editor reads frame=N from it
 *   onStage       called with a stage name (music, audio, picture, loudness, frame) before each pass
 */
export interface RenderOptions {
  keepWork?: boolean;
  draft?: { width: number; height: number; preset?: string; crf?: number };
  noText?: boolean;
  progressFile?: string;
  onStage?: (stage: string) => void;
}

/** Per-layer cut plan: how far before `in` the input opens, and the audio window. */
interface LayerPlan {
  vLead: number;   // picture starts this much early (dissolve between different framings)
  aLead: number;   // audio starts this much early (J-cut)
  lead: number;    // max of the two: the input opens at in - lead
  audible: boolean;
  aStart: number;  // timeline second the layer's audio starts
  aEnd: number;    // timeline second it ends
  fadeIn: number;
  fadeOut: number;
}

export function planLayers(spec: EditSpec): Map<MediaLayer, LayerPlan> {
  const fps = spec.canvas.fps;
  const tr = spec.transitions;
  const jcut = (tr?.jcut_frames ?? 0) / fps;
  const xf = (tr?.audio_xfade_ms ?? 0) / 1000;
  const plans = new Map<MediaLayer, LayerPlan>();
  for (const l of spec.layers) {
    const audible = !!l.audio && (l.speed ?? 1) === 1 && l.kind === "video" && hasAudio(l.audio_src ?? l.src);
    plans.set(l, { vLead: 0, aLead: 0, lead: 0, audible, aStart: l.start, aEnd: l.start + l.duration, fadeIn: 0, fadeOut: 0 });
  }
  const tk = takes(spec);
  for (let k = 0; k < tk.length; k++) {
    const l = tk[k], p = plans.get(l)!, src = l.in ?? 0;
    if (l.transition_in?.type === "dissolve" && k > 0) p.vLead = Math.min(l.transition_in.duration ?? 0.3, src);
    const prev = tk[k - 1];
    if (tr && prev && adjacent(prev, l, fps) && p.audible && plans.get(prev)!.audible) {
      p.aLead = Math.min(jcut, src);
      p.fadeIn = xf;
    }
    p.lead = Math.max(p.vLead, p.aLead);
    p.aStart = l.start - p.aLead;
  }
  for (let k = 0; k + 1 < tk.length; k++) {
    const p = plans.get(tk[k])!, n = plans.get(tk[k + 1])!;
    if (n.fadeIn > 0 || (tr && n.aLead > 0)) {
      // outgoing audio fades out over the same window the incoming fades in: [T - jcut, T - jcut + xf]
      p.aEnd = tk[k + 1].start - n.aLead + xf;
      p.fadeOut = xf;
    }
  }
  return plans;
}

/** Audio chain of one layer: its own track, cleaned, cut to its window, faded, placed on the timeline. */
export function layerAudioChain(spec: EditSpec, l: MediaLayer, p: LayerPlan, input: number, label: string): string {
  const hp = spec.audio.voice_cleanup?.highpass_hz;
  const clean = hp ? `highpass=f=${hp},` : "";
  const dur = p.aEnd - p.aStart;
  const skip = p.lead - p.aLead;
  const trim = skip > 0 ? `atrim=start=${f3(skip)}:duration=${f3(dur)}` : `atrim=duration=${f3(dur)}`;
  const fades = (p.fadeIn ? `,afade=t=in:st=0:d=${f3(p.fadeIn)}` : "") + (p.fadeOut ? `,afade=t=out:st=${f3(dur - p.fadeOut)}:d=${f3(p.fadeOut)}` : "");
  return `[${input}:a]aresample=48000,${clean}${trim},asetpts=PTS-STARTPTS${fades},adelay=${Math.round(p.aStart * 1000)}:all=1[${label}]`;
}

/**
 * Deterministic audio (1.3.0). Filters with two or more inputs (amix,
 * sidechaincompress) handle the last partial frame according to which input
 * reaches EOF first, and that order depends on thread scheduling: two renders of
 * the same spec differed in the last ~30 ms (up to 6 LSB) and the ducking stems
 * by 0.1 dB. Every stream feeding such a filter is therefore padded TAIL seconds
 * past the end and the result is cut at the video length afterwards; all the
 * filters involved are causal, so the cut removes the only divergent samples.
 */
const TAIL = 0.5;

/** Music chain: offset into the track, gain, fades, placed at `start`, padded past the video length (see TAIL). */
function musicChain(spec: EditSpec, input: number, gainDb: number, label: string): string {
  const m = spec.audio.music!, D = spec.duration;
  const at = m.start ?? 0, needs = D - at;
  const fi = m.fade_in_s ?? (at > 0 ? 0.4 : 0.15);
  const fo = Math.min(m.fade_out_s ?? 1.5, needs / 3);
  return `[${input}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start=${f3(m.offset ?? 0)}:duration=${f3(needs)},asetpts=PTS-STARTPTS,` +
    `volume=${gainDb.toFixed(2)}dB,afade=t=in:st=0:d=${f3(fi)},afade=t=out:st=${f3(needs - fo)}:d=${f3(fo)},adelay=${Math.round(at * 1000)}:all=1,apad=whole_dur=${f3(D + TAIL)},atrim=end=${f3(D + TAIL)}[${label}]`;
}

/** Sidechain ducking (ffmpeg sidechaincompress): ratio 20 with a dry/wet mix caps the reduction at duck_db. */
function duckFilter(thr: number, duckDb: number): string {
  const mix = 1 - Math.pow(10, -duckDb / 20);
  return `sidechaincompress=threshold=${thr.toFixed(6)}:ratio=20:attack=15:release=350:knee=2:detection=rms:link=maximum:mix=${mix.toFixed(4)}`;
}

const STEREO = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

export async function render(spec: EditSpec, outMp4: string, opts: RenderOptions = {}): Promise<RenderResult> {
  const t0 = performance.now();
  const out = resolve(outMp4);
  const outDir = dirname(out);
  // B-roll: cards without a current clip are drawn (editonny), marks become cards; nothing when absent or "off"
  if (spec.broll && spec.broll.mode !== "off") { stageOf(opts)("broll"); materializeBroll(spec, join(outDir, ".editai-broll-cache")); }
  // reframe (2.2.0): the face path of each wider source (editonny track_faces), cached; nothing when absent or "off"
  if (spec.reframe && spec.reframe.mode !== "off") { stageOf(opts)("reframe"); materializeReframe(spec, join(outDir, ".editai-reframe-cache")); }
  assertValid(spec);
  const work = join(outDir, `.work-${spec.id}`);
  mkdirSync(work, { recursive: true });
  const { width: W, height: H, fps } = spec.canvas;
  const D = spec.duration;
  const frames = Math.round(D * fps);

  const stage = opts.onStage ?? (() => {});
  const fit_log = opts.noText ? [] : fitTexts(spec, work);
  if (!opts.noText) writeFileSync(join(work, "edit.ass"), buildAss(spec), "utf8");

  const args: string[] = [];
  const graph: string[] = [];
  const audioLayers: string[] = []; // audio chains of the layers (shared by the measuring passes)
  let input = 0;
  const plans = planLayers(spec);

  // ── video layers ───────────────────────────────────────────────────────────
  graph.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${f3(D)},format=yuv420p[base]`);
  let cur = "base";
  const layerAudio: string[] = [];
  spec.layers.forEach((l, i) => {
    if (l.broll) return; // B-roll layers go above the camera, after the zoom (below)
    const speed = l.speed ?? 1;
    const p = plans.get(l)!;
    const tail = Math.max(0, p.aEnd - (l.start + l.duration));
    if (l.kind === "image") args.push("-loop", "1", "-framerate", String(fps), "-t", f3(l.duration + 0.5), "-i", l.src);
    else args.push("-ss", f3((l.in ?? 0) - p.lead), "-t", f3(p.lead + l.duration * speed + tail + 0.5), "-i", l.src);
    const r = l.rect ?? { x: 0, y: 0, w: W, h: H };
    const b = l.border_px ?? 0;
    const vSkip = p.lead - p.vLead;
    const vDur = l.duration + p.vLead;
    const head = l.kind === "video" ? `${vSkip > 0 ? `trim=start=${f3(vSkip)},` : ""}setpts=(PTS-STARTPTS)/${f3(speed)},fps=${fps},` : `fps=${fps},`;
    const pad = b ? `,pad=iw+${2 * b}:ih+${2 * b}:${b}:${b}:color=${l.border_color ?? "white"}` : "";
    const dissolve = p.vLead > 0 ? `,format=yuva420p,fade=t=in:st=0:d=${f3(p.vLead)}:alpha=1` : "";
    // placed on whole output frames: an offset in seconds (5.3333/TB = 159.9999) is truncated by setpts,
    // which put the layer one frame early and left a black frame before the next take (seen in the 1.0 renders)
    const F0 = Math.round((l.start - p.vLead) * fps), F1 = Math.round((l.start + l.duration) * fps);
    const src0 = (l.in ?? 0) - p.vLead;
    const fit = (l.kind === "video" && !l.rect && reframeChain(spec, l, i, src0, src0, (l.in ?? 0) + l.duration * speed)) || fitChain(l, r.w, r.h);
    graph.push(`[${input}:v]${head}${fit},setsar=1,format=yuv420p${pad}${dissolve},` +
      `tpad=stop_mode=clone:stop_duration=${f3(vDur)},trim=end_frame=${F1 - F0},settb=1/${fps},setpts=PTS-STARTPTS+${F0}[L${i}]`);
    graph.push(`[${cur}][L${i}]overlay=x=${r.x - b}:y=${r.y - b}:eof_action=pass:enable='between(n,${F0},${F1 - 1})'[V${i}]`);
    cur = `V${i}`;
    if (p.audible) {
      // zero-latency cleanup only (afftdn was tried and delays the voice ~30 ms against the picture)
      let ain = input;
      if (l.audio_src) {
        // cleaned voice (2.2.0, cli.ts cut --denoise): same timeline as the video, opened at the same second
        args.push("-ss", f3((l.in ?? 0) - p.lead), "-t", f3(p.lead + l.duration * speed + tail + 0.5), "-i", l.audio_src);
        ain = ++input;
      }
      audioLayers.push(layerAudioChain(spec, l, p, ain, `A${i}`));
      layerAudio.push(`A${i}`);
    }
    input++;
  });

  // ── camera, flashes, text ──────────────────────────────────────────────────
  const post: string[] = [];
  const OW = opts.draft?.width ?? W, OH = opts.draft?.height ?? H;
  if (spec.camera.length) {
    const fx = spec.camera_focus?.x ?? 0.5, fy = spec.camera_focus?.y ?? 0.5;
    if (!opts.draft) post.push(`scale=${W * SS}:${H * SS}:flags=lanczos`);
    post.push(`zoompan=z='${zoomExpr(spec.camera, fps)}':x='min(max(${fx}*iw-iw/zoom/2,0),iw-iw/zoom)':y='min(max(${fy}*ih-ih/zoom/2,0),ih-ih/zoom)':d=1:s=${OW}x${OH}:fps=${fps}`);
  } else if (opts.draft) post.push(`scale=${OW}:${OH}:flags=bicubic`);
  for (const f of spec.flashes ?? []) {
    post.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${f.color ?? "white"}@${f.opacity ?? 0.85}:t=fill:enable='between(t,${f3(f.at)},${f3(f.at + f.duration)})'`);
  }
  if (!opts.noText && (spec.texts.length || spec.captions)) post.push(`ass=edit.ass:fontsdir=${fontsDirFor(work)}`);
  post.push("format=yuv420p");
  const broll = spec.layers.filter((l) => l.broll);
  if (!broll.length) graph.push(`[${cur}]${post.join(",")}[vout]`);
  else {
    // camera (and flashes) first, then the B-roll over the moved picture, then the text on top of everything
    const textAt = post.findIndex((p) => p.startsWith("ass="));
    const cam = post.slice(0, textAt >= 0 ? textAt : post.length - 1);
    graph.push(`[${cur}]${cam.length ? cam.join(",") : "null"}[cam]`);
    let top = "cam";
    broll.forEach((l, k) => { input = brollLayer(l, k, input, top, `P${k}`, args, graph, fps, OW / W); top = `P${k}`; });
    graph.push(`[${top}]${post.slice(cam.length).join(",")}[vout]`);
  }
  // audio lives in its own graph and its own pass (deterministic, see TAIL)
  const agraph: string[] = [];
  const Dp = f3(D + TAIL);

  // ── audio ──────────────────────────────────────────────────────────────────
  const a = spec.audio;
  const sfxLabels: string[] = [];
  const bedLabels: string[] = [...layerAudio];
  const sfx = a.sfx.filter((s) => !s.only_with_music || a.music);
  const droppedSfx = a.sfx.length - sfx.length;
  for (const s of sfx) {
    args.push("-i", s.src);
    // anchored effects start anchor_s before `at`; a start before 0 skips the head of the file
    const st = sfxStart(s);
    const head = st < 0 ? `atrim=start=${f3(-st)},asetpts=PTS-STARTPTS,` : "";
    agraph.push(`[${input}:a]aresample=48000,aformat=channel_layouts=stereo,${head}volume=${s.gain_db ?? 0}dB,adelay=${Math.round(Math.max(0, st) * 1000)}:all=1[S${input}]`);
    sfxLabels.push(`S${input}`);
    input++;
  }
  const mutes = (a.mutes ?? []).map((m) => `volume=enable='between(t,${f3(m.start)},${f3(m.end)})':volume=0`).join(",");
  const notes: string[] = [];
  if (droppedSfx) notes.push(`${droppedSfx} sfx marked only_with_music left out: the spec has no music`);

  let bed: string | null = null;
  if (a.music) {
    const musicInput = input++;
    const m = a.music;
    // looped (a short track still covers the video) but capped: an endless input never lets the passes finish
    args.push("-stream_loop", "-1", "-t", f3((m.offset ?? 0) + D - (m.start ?? 0) + 1), "-i", musicPath(m)!);
    const voiceMix = layerAudio.length
      ? `${layerAudio.map((l) => `[${l}]`).join("")}amix=inputs=${layerAudio.length}:normalize=0:duration=longest,${STEREO},apad=whole_dur=${Dp},atrim=end=${Dp}`
      : null;
    if (voiceMix) {
      // pass 1: voice alone -> its integrated loudness sets the ducking threshold
      stage("music");
      const vox = join(work, "stem-voice.wav");
      // one stem per pass, cut at D inside the graph: two outputs of one pass (or -t per output) ended the
      // ducked stem early in some runs, which moved the measured gain by ~0.1 dB between renders
      const cut = `atrim=end=${f3(D)}`;
      ffmpeg([...args, "-filter_complex", [...audioLayers, `${voiceMix},${cut}[VOX]`].join(";"), "-map", "[VOX]", "-c:a", "pcm_f32le", vox], work);
      const Lv = loudness(vox).lufs;
      if (Lv === null || Lv < -60) throw new Error("music ducking: the voice layers are silent, cannot measure the voice level");
      const thr = Math.max(0.000977, Math.min(0.5, Math.pow(10, (Lv - 30) / 20))); // speech sits ~20 dB above this
      const duckDb = m.duck_db ?? 8;
      // pass 2: music at 0 dB, ducked and dry -> gain for the requested gap, and the ducking actually applied
      const md = join(work, "stem-music-ducked.wav"), dry = join(work, "stem-music-dry.wav");
      ffmpeg([...args, "-filter_complex", [...audioLayers, `${voiceMix}[SC]`, musicChain(spec, musicInput, 0, "MUS"),
        `[MUS][SC]${duckFilter(thr, duckDb)},${cut}[MD]`].join(";"), "-map", "[MD]", "-c:a", "pcm_f32le", md], work);
      ffmpeg([...args, "-filter_complex", [musicChain(spec, musicInput, 0, "MUS"), `[MUS]${cut}[DRY]`].join(";"),
        "-map", "[DRY]", "-c:a", "pcm_f32le", dry], work);
      const Ls = loudness(md).lufs ?? -99, Ld = loudness(dry).lufs ?? -99;
      const gain = m.below_voice_db !== undefined ? Lv - m.below_voice_db - Ls : (m.gain_db ?? -6);
      m.measured = {
        voice_lufs: +Lv.toFixed(2), threshold: +thr.toFixed(6), gain_db: +gain.toFixed(2), duck_db_max: duckDb,
        music_lufs_ducked: +(Ls + gain).toFixed(2), below_voice_db: +(Lv - Ls - gain).toFixed(2),
        duck_integrated_db: +(Ld - Ls).toFixed(2), tool: "ffmpeg ebur128 on voice / ducked music / dry music stems",
      };
      // the bed is built from the two measured stems: the compressor takes its gain from the voice only, so
      // ducking the music at 0 dB and then applying `gain` equals ducking it at `gain`. Re-running asplit +
      // sidechaincompress + amix in the final graph ended the whole mix at the first take in some specs
      // (ffmpeg 8.1 scheduling), so that graph is never built again here.
      const vi = input++, mi = input++;
      args.push("-i", vox, "-i", md);
      agraph.push(`[${vi}:a]apad=whole_dur=${Dp}[VOX]`, `[${mi}:a]volume=${gain.toFixed(2)}dB,apad=whole_dur=${Dp}[MD]`,
        `[VOX][MD]amix=inputs=2:normalize=0:duration=longest${mutes ? "," + mutes : ""}[BED]`);
    } else {
      const gain = m.gain_db ?? -6;
      if (m.below_voice_db !== undefined) notes.push("music.below_voice_db ignored: no voice layer to measure against; gain_db used");
      m.measured = { gain_db: gain, tool: "no voice layer: fixed gain, no ducking" };
      agraph.push(musicChain(spec, musicInput, gain, "MUS"), `[MUS]anull${mutes ? "," + mutes : ""}[BED]`);
    }
    bed = "BED";
  } else if (layerAudio.length > 1) {
    // several voice layers and no music: the voice is mixed in a pass of its own into a WAV stem, as in the
    // music path. amix of the delayed takes inside the final graph ended the whole mix at the end of the
    // first take (ffmpeg 8.1; seen in 1.5.0 on a talking head without music).
    stage("voice");
    const vox = join(work, "stem-voice.wav");
    const voiceMix = `${layerAudio.map((l) => `[${l}]`).join("")}amix=inputs=${layerAudio.length}:normalize=0:duration=longest,${STEREO},apad=whole_dur=${Dp},atrim=end=${Dp}`;
    ffmpeg([...args, "-filter_complex", [...audioLayers, `${voiceMix},atrim=end=${f3(D)}[VOX]`].join(";"), "-map", "[VOX]", "-c:a", "pcm_f32le", vox], work);
    const vi = input++;
    args.push("-i", vox);
    agraph.push(`[${vi}:a]apad=whole_dur=${Dp}${mutes ? "," + mutes : ""}[BED]`);
    bed = "BED";
  } else if (bedLabels.length) {
    agraph.push(...audioLayers);
    agraph.push(`${bedLabels.map((l) => `[${l}]`).join("")}amix=inputs=${bedLabels.length}:normalize=0:duration=longest${mutes ? "," + mutes : ""}[BED]`);
    bed = "BED";
  }
  const needsLoudnorm = !!bed;
  let audioOut: string | null = null;
  if (bed || sfxLabels.length) {
    const all = [...(bed ? [bed] : []), ...sfxLabels];
    agraph.push(`${all.map((l) => `[${l}]`).join("")}amix=inputs=${all.length}:normalize=0:duration=longest,apad=whole_dur=${Dp},aformat=sample_rates=48000:channel_layouts=stereo` +
      (needsLoudnorm ? "" : ",alimiter=limit=0.708:level=disabled") + `,atrim=end=${f3(D)}[aout]`);
    audioOut = "aout";
  }

  const encode = ["-c:v", "libx264", "-preset", opts.draft?.preset ?? spec.output.preset, "-crf", String(opts.draft?.crf ?? spec.output.crf), "-profile:v", "high",
    "-pix_fmt", "yuv420p", "-r", String(fps), "-frames:v", String(frames)];
  writeFileSync(join(work, "filtergraph.txt"), [...graph, ...agraph].join(";\n"), "utf8");
  const progress = opts.progressFile ? ["-progress", opts.progressFile] : [];

  if (audioOut) {
    // audio alone first (float WAV cut at D), then the picture alone, then one mux: the same spec gives the same samples
    const mix = join(work, "mix.wav"), pic = join(work, "picture.mkv");
    stage("audio");
    ffmpeg([...args, "-filter_complex", agraph.join(";"), "-map", `[${audioOut}]`, "-c:a", "pcm_f32le", mix], work);
    stage("picture");
    ffmpeg([...progress, ...args, "-filter_complex", graph.join(";"), "-map", "[vout]", ...encode, "-an", pic], work);
    stage("loudness");
    if (needsLoudnorm) notes.push(...finalizeLoudness(spec, mix, pic, out, work));
    else ffmpeg(["-i", pic, "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-t", f3(D), "-movflags", "+faststart", out], work);
  } else {
    stage("picture");
    ffmpeg([...progress, ...args, "-filter_complex", graph.join(";"), "-map", "[vout]", ...encode, "-an", "-movflags", "+faststart", out], work);
  }

  stage("frame");
  const frame = out.replace(/\.mp4$/i, ".png");
  const at = spec.frame_at ?? Math.min(D / 2, 1.5);
  ffmpeg(["-ss", f3(at), "-i", out, "-frames:v", "1", "-update", "1", frame]);

  if (fit_log.length) notes.push(...fit_log.map((f) => `fit ${f.layer}: ${f.action}`));
  if (opts.draft) notes.push(`draft render: ${OW}x${OH}, x264 ${opts.draft.preset ?? spec.output.preset} crf ${opts.draft.crf ?? spec.output.crf} (not for posting)`);
  if (opts.noText) notes.push("clean base layer: headline and captions not burned (the mini editor draws them)");
  if (notes.length) spec.notes = [...(spec.notes ?? []).filter((n) => !/^(fit |loudness: |\d+ sfx marked|music\.below)/.test(n)), ...notes];
  const resolved_spec = out.replace(/\.mp4$/i, ".spec.json");
  writeFileSync(resolved_spec, JSON.stringify(spec, null, 2), "utf8");
  if (!opts.keepWork) rmSync(work, { recursive: true, force: true });
  return { out, frame, fit_log, seconds: (performance.now() - t0) / 1000, resolved_spec };
}

/**
 * Two-pass loudnorm in linear mode to the spec target. The AAC encode adds
 * inter-sample peaks, so the pass aims 0.5 dB under the ceiling, measures the
 * encoded file and, if it is still over, encodes again 1.2 dB under. When the
 * linear gain would push the peaks over, a latency-compensated limiter goes
 * first (otherwise loudnorm silently switches to dynamic mode).
 */
function finalizeLoudness(spec: EditSpec, mix: string, pic: string, out: string, work: string): string[] {
  const L = spec.audio.loudness;
  const ceiling = L.true_peak_db;
  const notes: string[] = [];
  const measure = (af: string) => {
    const err = ffmpeg(["-i", mix, "-map", "0:a", "-af", `${af}loudnorm=I=${L.target_lufs}:TP=${ceiling}:LRA=11:print_format=json`, "-f", "null", "-"], work);
    return JSON.parse(err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1));
  };
  for (const tp of [ceiling - 0.5, ceiling - 1.2]) {
    let pre_af = "";
    let j = measure("");
    const gain = L.target_lufs - Number(j.input_i);
    if (Number(j.input_tp) + gain > tp - 0.2) {
      const lim = Math.max(0.0625, Math.min(1, Math.pow(10, (tp - gain - 1) / 20)));
      pre_af = `alimiter=limit=${lim.toFixed(5)}:attack=5:release=60:level=disabled:latency=1,`;
      j = measure(pre_af);
    }
    ffmpeg(["-i", pic, "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af",
      `${pre_af}loudnorm=I=${L.target_lufs}:TP=${tp.toFixed(2)}:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`,
      "-c:a", "aac", "-b:a", "192k", "-t", f3(spec.duration), "-movflags", "+faststart", out], work);
    const got = loudness(out);
    notes.push(`loudness: aimed ${tp.toFixed(1)} dBTP${pre_af ? " with limiter" : ""}, encoded ${got.lufs} LUFS / ${got.true_peak} dBTP (ceiling ${ceiling})`);
    if (got.true_peak !== null && got.true_peak <= ceiling) break;
  }
  return notes;
}

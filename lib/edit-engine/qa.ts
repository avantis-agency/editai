// Edit QA: measures a rendered MP4 against its edit spec. Every number names the
// tool that produced it. Verdict: FAIL if a blocking check fails, CONCERNS if a
// non-blocking one does, PASS otherwise.
//   bun lib/edit-engine/cli.ts qa <resolved.spec.json> <video.mp4> [report-dir]
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { blackFrames, intersect, loudness, measureTextBox, probe } from "./measure.ts";
import { ALL_PLATFORMS, measureTime, unsafeRects } from "./safezones.ts";
import { captionGroups, captionStyle, widestMoment } from "./ass.ts";
import { zoomAt } from "./ffmpeg.ts";
import { assSize } from "./fonts.ts";
import { adjacent, ghostDissolves, resolveSpec, SQUAD_ROOT, takes, type EditSpec, type Rect } from "./spec.ts";
import { brollChecks, brollOn, contactSheet } from "./broll.ts";
import { breathsRemaining } from "./silence.ts";
import { reframeChecks } from "./reframe.ts";

/** Distinct zoom values (3 decimals) the camera reaches between two timeline seconds. */
function zoomsDuring(spec: EditSpec, s: number, e: number): number[] {
  if (!spec.camera?.length) return [1];
  const fps = spec.canvas.fps, set = new Set<number>();
  for (let n = Math.round(s * fps); n < Math.max(Math.round(e * fps), Math.round(s * fps) + 1); n++) set.add(Number(zoomAt(spec.camera, fps, n).toFixed(3)));
  return [...set].sort((a, b) => b - a);
}

/** Where a rectangle declared at zoom 1 lands on the output at zoom z (zoompan window clamped to the frame). */
function zoomRect(spec: EditSpec, r: Rect, z: number): Rect {
  const { width: W, height: H } = spec.canvas;
  const fx = spec.camera_focus?.x ?? 0.5, fy = spec.camera_focus?.y ?? 0.5;
  const ww = W / z, wh = H / z;
  const x0 = Math.min(Math.max(fx * W - ww / 2, 0), W - ww), y0 = Math.min(Math.max(fy * H - wh / 2, 0), H - wh);
  return { x: Math.round((r.x - x0) * z), y: Math.round((r.y - y0) * z), w: Math.round(r.w * z), h: Math.round(r.h * z) };
}

/** info = reported, never counted in the verdict (e.g. a platform the video does not target). */
export interface Check { id: string; blocking: boolean; pass: boolean; detail: string; tool: string; info?: boolean }
export interface QaReport {
  video: string; spec_id: string; verdict: "PASS" | "CONCERNS" | "FAIL"; checks: Check[];
  measured: Record<string, unknown>; judged_by_agent: string[];
}

/** House legibility floor at 1080x1920, scaled with canvas height. See references/edit-hooks-catalog.md. */
const MIN_FONT = { hook: 60, cta: 52, label: 48, caption: 48 } as const;

export function catalogHookIds(): Set<string> {
  const md = readFileSync(join(SQUAD_ROOT, "references", "edit-hooks-catalog.md"), "utf8");
  return new Set([...md.matchAll(/^###\s+`([a-z0-9_]+)`/gm)].map((m) => m[1]));
}

export function runQa(spec: EditSpec, video: string, opts: { reportDir?: string; expectedText?: Record<string, string[]> } = {}): QaReport {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const measured: Record<string, unknown> = {};
  resolveSpec(spec);
  const { width: W, height: H, fps } = spec.canvas;
  const reportDir = opts.reportDir ?? dirname(video);
  const work = join(reportDir, `.qa-${spec.id}`);
  mkdirSync(work, { recursive: true });

  // 1. container and stream
  const pr = probe(video);
  measured.ffprobe = pr;
  add({ id: "codec_h264", blocking: true, pass: pr.codec === "h264" && pr.pix_fmt === "yuv420p", detail: `${pr.codec} ${pr.profile} ${pr.pix_fmt}`, tool: "ffprobe" });
  add({ id: "resolution", blocking: true, pass: pr.width === W && pr.height === H, detail: `${pr.width}x${pr.height} (spec ${W}x${H})`, tool: "ffprobe" });
  add({ id: "frame_rate", blocking: true, pass: Math.abs(pr.fps - fps) < 0.01, detail: `${pr.fps.toFixed(3)} fps (spec ${fps})`, tool: "ffprobe" });
  add({ id: "duration", blocking: true, pass: Math.abs(pr.duration - spec.duration) <= 1 / fps + 0.05, detail: `${pr.duration.toFixed(3)} s (spec ${spec.duration} s)`, tool: "ffprobe" });
  const black = blackFrames(video);
  measured.black_frames = black;
  add({ id: "no_black_frames", blocking: true, pass: black.length === 0, detail: black.length ? `${black.length} black frame(s) at ${black.slice(0, 8).join(", ")} (a gap between layers)` : "no fully black frame", tool: "ffmpeg blackframe=amount=98:threshold=24" });

  // 2. text geometry, measured on the rendered glyphs
  const boxes: Record<string, Rect | null> = {};
  for (const t of spec.texts) boxes[t.id] = measureTextBox(spec, t.id, measureTime(t), work);
  const perGroup: { text: string; at: number; box: Rect | null }[] = [];
  if (spec.captions?.words.length) {
    // every caption group is measured (each group has its own width); the union is checked
    let u: Rect | null = null;
    for (const g of captionGroups(spec.captions)) {
      const at = widestMoment(g); // whole group on screen, longest word active (widest state)
      const b = measureTextBox(spec, "captions", at, work);
      perGroup.push({ text: g.map((w) => w.word).join(" "), at: Number(at.toFixed(3)), box: b });
      if (b) u = u ? { x: Math.min(u.x, b.x), y: Math.min(u.y, b.y), w: Math.max(u.x + u.w, b.x + b.w) - Math.min(u.x, b.x), h: Math.max(u.y + u.h, b.y + b.h) - Math.min(u.y, b.y) } : b;
    }
    boxes.captions = u;
    measured.caption_group_boxes = perGroup;
  }
  measured.text_boxes = boxes;
  for (const platform of ALL_PLATFORMS) {
    const target = spec.platforms.includes(platform);
    const zones = unsafeRects(platform, W, H);
    const hits: string[] = [];
    for (const [id, box] of Object.entries(boxes)) {
      if (!box) continue;
      for (const z of zones) {
        const o = intersect(box, z);
        if (o) hits.push(`${id} overlaps "${z.label}" by ${o.w}x${o.h}px`);
      }
    }
    add({ id: `safe_zone_${platform}`, blocking: target, info: !target, pass: hits.length === 0,
      detail: (target ? "" : "(not a target platform) ") + (hits.length ? hits.join("; ") : "all text clear of the platform UI"), tool: "ffmpeg bbox on a text mask + lib/edit-engine/safe-zones.json" });
  }
  // eyes and mouth are declared at zoom 1; the camera moves them, so each text is checked against
  // the region at every zoom the camera reaches while that text is on screen (fixed headline included)
  const spans: Record<string, [number, number]> = Object.fromEntries(spec.texts.map((t) => [t.id, [t.start, t.end]]));
  if (spec.captions?.words.length) spans.captions = [spec.captions.words[0].start, spec.captions.words[spec.captions.words.length - 1].end + 0.25];
  for (const pz of spec.protect_regions ?? []) {
    const hits: string[] = [];
    let zmax = 1;
    for (const [id, b] of Object.entries(boxes)) {
      if (!b) continue;
      const [s, e] = spans[id] ?? [0, spec.duration];
      for (const z of zoomsDuring(spec, s, e)) {
        zmax = Math.max(zmax, z);
        if (intersect(b, zoomRect(spec, pz, z))) { hits.push(`${id} at zoom ${z.toFixed(3)}`); break; }
      }
    }
    add({ id: `protect_${pz.label.replace(/\W+/g, "_")}`, blocking: true, pass: hits.length === 0,
      detail: hits.length ? `${hits.join(", ")} covers ${pz.label}` : `text clear of ${pz.label} at every zoom while on screen (max ${zmax.toFixed(3)})`, tool: "ffmpeg bbox + camera zoom (lib/edit-engine/ffmpeg.ts zoomAt)" });
  }
  for (const t of spec.texts) {
    const b = boxes[t.id];
    if (!b) add({ id: `text_rendered_${t.id}`, blocking: true, pass: false, detail: "no lit pixels: text did not render", tool: "ffmpeg bbox" });
  }
  // 2b. B-roll (2.1.0): hook and CTA windows, gap, face, captions, quote, provenance, render cost
  if (brollOn(spec) && spec.broll!.items.length) {
    for (const c of brollChecks(spec, perGroup, boxes[spec.texts.find((t) => t.role === "hook")?.id ?? ""] ?? null)) add(c);
    const sheet = contactSheet(spec, video, join(reportDir, `${spec.id}.broll-sheet.png`), join(work, "sheet"));
    measured.broll_sheet = sheet;
    measured.broll_items = spec.broll!.items.map((i) => ({ id: i.id, kind: i.kind, template: i.template ?? null, src: i.src ?? null, start: i.start, end: i.end, captions: i.captions ?? "keep", quote: i.quote, ink: i.clip?.ink ?? null }));
  }

  // 2c. reframe (2.2.0): every measured face sample inside the crop window; the camera's motion
  for (const c of reframeChecks(spec)) add(c);

  // 3. legibility and dwell time
  const scale = H / 1920;
  for (const t of spec.texts) {
    const min = Math.round(MIN_FONT[t.role] * scale);
    const lineT = assSize(t.style.font_px, t.style);
    add({ id: `font_size_${t.id}`, blocking: true, pass: lineT >= min, detail: `${t.style.size_basis === "em" ? `${t.style.font_px}px em = ${lineT}px libass` : `${t.style.font_px}px`} (floor ${min}px libass for ${t.role})`, tool: "spec + lib/edit-engine/fonts.ts" });
    const maxLines = t.role === "hook" ? 2 : 3;
    add({ id: `line_count_${t.id}`, blocking: true, pass: t.lines.length <= maxLines, detail: `${t.lines.length} lines (max ${maxLines})`, tool: "spec" });
    const longest = Math.max(...t.lines.map((l) => l.length));
    add({ id: `line_length_${t.id}`, blocking: false, pass: longest <= 32, detail: `longest line ${longest} chars (comfort <= 32)`, tool: "spec" });
    const contrast = !!t.style.box || (t.style.outline_px ?? 0) >= 3;
    add({ id: `contrast_${t.id}`, blocking: true, pass: contrast, detail: t.style.box ? "opaque box" : `outline ${t.style.outline_px ?? 0}px`, tool: "spec" });
    const words = t.lines.join(" ").split(/\s+/).length;
    const need = Math.max(t.role === "hook" ? 3 : 1.5, 0.3 * words);
    const shown = t.end - t.start;
    add({ id: `dwell_${t.id}`, blocking: true, pass: shown + 1e-6 >= need, detail: `${shown.toFixed(2)} s on screen, needs ${need.toFixed(2)} s (${words} words)`, tool: "spec" });
    const exp = opts.expectedText?.[t.id];
    if (exp) {
      const same = JSON.stringify(exp) === JSON.stringify(t.lines);
      add({ id: `text_exact_${t.id}`, blocking: true, pass: same, detail: same ? "lines identical to the source note" : `expected ${JSON.stringify(exp)}, got ${JSON.stringify(t.lines)}`, tool: "string compare" });
    }
  }

  if (spec.captions) {
    const min = Math.round(MIN_FONT.caption * scale);
    const cst = captionStyle(spec.captions);
    const smallest = Math.min(cst.font_px, ...(spec.captions.group_font_px ?? []));
    const lineC = assSize(smallest, cst);
    add({ id: "font_size_captions", blocking: true, pass: lineC >= min, detail: `${cst.font_px}px${cst.size_basis === "em" ? " em" : ""}${smallest < cst.font_px ? `, smallest fitted group ${smallest}px` : ""} = ${lineC}px libass (floor ${min}px for captions)`, tool: "spec + lib/edit-engine/fonts.ts" });
    add({ id: "caption_group_size", blocking: false, pass: spec.captions.max_words <= 4, detail: `${spec.captions.max_words} words per group (comfort 1-4)`, tool: "spec" });
    add({ id: "contrast_captions", blocking: true, pass: !!cst.box || (cst.outline_px ?? 0) >= 3, detail: cst.box ? "opaque box" : `outline ${cst.outline_px ?? 0}px`, tool: "spec" });
    add({ id: "caption_preset", blocking: false, info: true, pass: true, detail: `${spec.captions.preset ?? "classic"}, font ${cst.font_family ?? "Inter"}`, tool: "spec" });
  }
  for (const t of spec.texts.filter((x) => x.mode)) {
    add({ id: `headline_mode_${t.id}`, blocking: false, info: true, pass: true, detail: `${t.mode}: on screen ${t.start.toFixed(2)}-${t.end.toFixed(2)} s, ${t.style.font_px}px`, tool: "spec" });
  }

  // 3b. cuts between takes
  const ghosts = ghostDissolves(spec);
  const tk = takes(spec);
  if (tk.length > 1) {
    add({ id: "no_ghost_dissolve", blocking: true, pass: ghosts.length === 0,
      detail: ghosts.length ? `image dissolve over the same framing at ${ghosts.join(", ")}` : `${tk.length - 1} take changes, none dissolves over the same framing`, tool: "spec" });
  }
  const tr = spec.transitions;
  if (tr && tk.length > 1 && spec.captions?.words.length) {
    // the outgoing audio starts fading jcut frames before the picture cut: no spoken word may end inside that fade
    const j = (tr.jcut_frames ?? 0) / fps;
    const cut: string[] = [];
    for (let k = 1; k < tk.length; k++) {
      if (!adjacent(tk[k - 1], tk[k], fps) || j <= 0) continue;
      const T = tk[k].start;
      for (const w of spec.captions.words) if (w.end > T - j + 0.005 && w.end <= T + 0.005) cut.push(`"${w.word}" ends ${w.end.toFixed(3)} s, fade starts ${(T - j).toFixed(3)} s`);
    }
    add({ id: "jcut_word_tail", blocking: false, pass: cut.length === 0,
      detail: cut.length ? cut.join("; ") : `J-cut ${tr.jcut_frames ?? 0} frames + ${tr.audio_xfade_ms ?? 0} ms audio crossfade clear every word ending`, tool: "spec words vs cut plan" });
  }

  // 4. audio
  const L = loudness(video);
  measured.loudness = L;
  const hasBed = !!spec.audio.music || spec.layers.some((l) => l.audio);
  if (L.lufs === null && L.true_peak === null) {
    add({ id: "audio_present", blocking: false, pass: false, detail: "no audio stream: add platform music in the app or a bed in the spec", tool: "ffprobe" });
  } else if (hasBed) {
    const t = spec.audio.loudness;
    add({ id: "loudness_integrated", blocking: true, pass: L.lufs !== null && Math.abs(L.lufs - t.target_lufs) <= 1, detail: `${L.lufs} LUFS (target ${t.target_lufs} +/- 1)`, tool: "ffmpeg ebur128" });
    add({ id: "true_peak", blocking: true, pass: L.true_peak !== null && L.true_peak <= t.true_peak_db + 0.1, detail: `${L.true_peak} dBTP (ceiling ${t.true_peak_db})`, tool: "ffmpeg ebur128 peak=true" });
  } else {
    add({ id: "true_peak", blocking: true, pass: L.true_peak !== null && L.true_peak <= spec.audio.loudness.true_peak_db + 0.1, detail: `${L.true_peak} dBTP, SFX-only track (ceiling ${spec.audio.loudness.true_peak_db})`, tool: "ffmpeg ebur128 peak=true" });
    add({ id: "loudness_integrated", blocking: false, pass: true, detail: `${L.lufs} LUFS, informational: SFX-only track, the platform music sets the final level`, tool: "ffmpeg ebur128" });
  }
  const mm = spec.audio.music?.measured as Record<string, number> | undefined;
  if (spec.audio.music && mm && typeof mm.below_voice_db === "number") {
    const want = spec.audio.music.below_voice_db;
    add({ id: "music_below_voice", blocking: false, pass: want === undefined || Math.abs(mm.below_voice_db - want) <= 1.5,
      detail: `music ${mm.below_voice_db} LU under the voice${want !== undefined ? ` (asked ${want})` : ""}, gain ${mm.gain_db} dB`, tool: "ffmpeg ebur128 on the render stems" });
    add({ id: "music_ducking", blocking: false, pass: mm.duck_integrated_db >= 3,
      detail: `ducked bed ${mm.duck_integrated_db} LU under the dry bed (cap ${mm.duck_db_max} dB under speech)`, tool: "ffmpeg sidechaincompress + ebur128" });
  }
  // 4b. remaining silence (2.2.0, matrix 3.6): the voice of the spec alone, every silence of 0.25 s or more.
  // With a measured cut (spec.cut) only its declared holds and the end hold may remain, and the check blocks;
  // takes chosen by hand only get the list (the person may have wanted those pauses).
  const br = breathsRemaining(spec, work);
  if (br) {
    measured.breaths = br;
    const kept = br.found.filter((x) => x.why);
    const list = (xs: { start: number; end: number; dur: number }[]) => xs.slice(0, 6).map((x) => `${x.start.toFixed(2)}-${x.end.toFixed(2)} s (${x.dur.toFixed(2)} s)`).join(", ");
    add({ id: "breaths_remaining", blocking: !!spec.cut, info: !spec.cut, pass: br.unintended.length === 0,
      detail: (br.unintended.length ? `${br.unintended.length} silêncio(s) de ${br.min_s} s ou mais que ninguém pediu: ${list(br.unintended)}` : `nenhum silêncio de ${br.min_s} s ou mais fora das pausas pedidas`) +
        (kept.length ? `; ${kept.length} pedido(s): ${kept.slice(0, 6).map((x) => `${x.start.toFixed(2)} s ${x.why}`).join(", ")}` : "") + (spec.cut ? "" : " (sem corte medido: só informa)"),
      tool: `voz do spec renderizada sozinha, janelas de 10 ms abaixo de ${br.threshold_db} dB (regra do breaths.py / waveform_cut do editonny, portada em Bun)` });
  }
  measured.av_duration = { video: pr.duration, audio: pr.audio_duration };
  if (pr.audio_duration !== null) {
    const d = Math.abs(pr.audio_duration - spec.duration);
    add({ id: "audio_length", blocking: true, pass: d <= 0.05, detail: `audio ${pr.audio_duration.toFixed(3)} s vs spec ${spec.duration.toFixed(3)} s (${Math.round(d * 1000)} ms)`, tool: "ffprobe" });
  }

  // 5. hooks and the triple alignment
  const known = catalogHookIds();
  const unknown = spec.hooks_applied.filter((h) => !known.has(h.hook)).map((h) => h.hook);
  add({ id: "hooks_from_catalog", blocking: true, pass: spec.hooks_applied.length >= 2 && unknown.length === 0,
    detail: `${spec.hooks_applied.map((h) => `${h.hook}@${h.at}s`).join(", ")}${unknown.length ? `; not in catalog: ${unknown.join(", ")}` : ""}`, tool: "references/edit-hooks-catalog.md" });
  const al = spec.alignment;
  add({ id: "alignment_declared", blocking: true, pass: !!(al?.text && al?.visual && al?.audio), detail: "text, visual and audio intents declared in the spec", tool: "spec" });
  const frame = video.replace(/\.mp4$/i, ".png");
  add({ id: "frame_png", blocking: true, pass: existsSync(frame), detail: basename(frame), tool: "ffmpeg" });

  rmSync(work, { recursive: true, force: true });
  const failBlocking = checks.some((c) => c.blocking && !c.pass);
  const failSoft = checks.some((c) => !c.blocking && !c.pass && !c.info);
  const report: QaReport = {
    video, spec_id: spec.id, verdict: failBlocking ? "FAIL" : failSoft ? "CONCERNS" : "PASS", checks, measured,
    judged_by_agent: [
      "Triple alignment: seeing only the frame, could a viewer guess the text? (Kallaway, references/kallaway-method/08-spoken-hooks.md)",
      "Text does not cover eyes or mouth when protect_regions was not declared",
      "Hook pacing feels intentional, not noisy (no more than one bass hit per 5 s)",
    ],
  };
  writeFileSync(join(reportDir, `${spec.id}.qa.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(reportDir, `${spec.id}.qa.md`), toMarkdown(report));
  return report;
}

export function toMarkdown(r: QaReport): string {
  const rows = r.checks.map((c) => `| ${c.pass ? "ok" : c.info ? "info" : c.blocking ? "FAIL" : "aviso"} | \`${c.id}\` | ${c.blocking ? "sim" : "não"} | ${c.detail.replace(/\|/g, "/")} | ${c.tool} |`);
  return [`# QA de edição: ${r.spec_id}`, "", `Veredito: **${r.verdict}**`, "", `Vídeo: \`${r.video}\``, "",
    "| Resultado | Check | Bloqueia | Medido | Ferramenta |", "|---|---|---|---|---|", ...rows, "",
    "## Julgado pelo agente (não medido)", "", ...r.judged_by_agent.map((j) => `- ${j}`), ""].join("\n");
}

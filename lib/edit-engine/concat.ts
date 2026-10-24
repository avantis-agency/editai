// OPTIONAL adapter: turns an edit spec into a Concat 0.2.7 project that a person
// opens and adjusts by hand, like a small local editor. ffmpeg.ts stays the
// engine that renders; this only builds the project. Bun only.
//
//   bun lib/edit-engine/cli.ts concat <spec.json> --project-dir <dir under your home> [--name <name>]
//        [--token-file <file> | env CONCAT_TOKEN] [--port 7420] [--no-verify] [--frame <png under home>]
//
// Needs the Concat app OPEN with its API switched on (its Automation screen, or
// settings.json "server": {"enabled": true, "listen": "127.0.0.1:7420", "token": ...}).
// The token is read from the file or the variable, never written and never logged.
//
// Security risks (from the Concat test of 17/10/2026):
// - The Concat 0.2.7 .msi is NOT code-signed. A SHA-256 matching SHA256SUMS proves integrity, not authorship.
// - The API only runs with the app window open; there is no headless server and no CLI.
// - The API writes anywhere under the user's HOME; there is no setting to confine it to one folder.
// - 0.2.7 has no switch to turn auto-update off; its Version page queries GitHub when opened.
// Mitigations here: loopback only (127.0.0.1), token from a file or variable, project folder refused
// outside HOME (the API would refuse it anyway).
//
// What goes into the project (verified end to end on 20/10/2026 with Concat 0.2.7):
// - full-frame video takes, cut at their `in`, in order on track T1, each with its own audio;
//   the alternating punch-in as the clip scale (1.07 on every other take);
// - a single full-frame image with the slow push as two scale keys;
// - the music on T4 (offset, length, gain from the render's measurement, fades);
// - sound effects on an extra track, placed by their impact second, at their gain;
// - each text layer (headline) as a title on T3, each caption group as a title on T2.
// What does NOT go (listed in `dropped`, to redo by hand in Concat if wanted): J-cut and audio
// crossfade (cuts are hard), the slow push across takes, the voice high-pass, music ducking,
// bold-word animation and keyword colours, text animations, windowed layers (split screen, app slot),
// flashes and mutes. Concat 0.2.7's API has no subtitle (SRT) import; its own captions need a
// Whisper model download, so the captions go in as titles.
import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { captionGroups, captionStyle } from "./ass.ts";
import { ConcatClient, readToken } from "./concat-client.ts";
import { lineRatio } from "./fonts.ts";
import { probe } from "./measure.ts";
import { FONTS_DIR, musicPath, sfxStart, takes, type EditSpec, type TextStyle } from "./spec.ts";

export interface ConcatOptions { projectDir: string; name: string; token: string; port?: number; verify?: boolean; frameAt?: number; framePng?: string }
export interface ConcatResult {
  project: string; file: string; dropped: string[]; built: Record<string, number>;
  verified?: { opened: boolean; clips: Record<string, number>; tracks: Record<string, number>; matches: boolean };
  frame?: string;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const dbToLin = (db: number) => Math.min(1, Math.pow(10, db / 20));

/** Token from --token-file or CONCAT_TOKEN; the value never leaves memory. */
export function concatToken(tokenFile?: string): string {
  if (tokenFile) return readToken(tokenFile);
  const t = process.env.CONCAT_TOKEN;
  if (!t) throw new Error("Concat token missing: pass --token-file <file> or set CONCAT_TOKEN (the token is in Concat's Automation screen)");
  return t.trim();
}

/** What the adapter cannot carry over, so the person knows what to redo by hand. */
export function dropped(spec: EditSpec): string[] {
  const out: string[] = [];
  const tk = takes(spec);
  const windowed = spec.layers.filter((l) => l.rect);
  if (windowed.length) out.push(`windowed layers (${windowed.map((l) => l.id).join(", ")}): split screen and app slot are not placed`);
  if (spec.layers.some((l) => l.kind === "image" && !l.rect) && spec.layers.filter((l) => !l.rect).length > 1) out.push("image layers mixed with takes");
  if (tk.length > 1 && spec.transitions) out.push("J-cut and audio crossfade between takes (the cuts are hard in Concat)");
  if (tk.length > 1 && spec.camera.some((m) => m.type === "push")) out.push("slow push across takes");
  for (const m of spec.camera) if (m.type === "impact" || (m.type === "punch_in" && !m.auto)) out.push(`camera ${m.type} at ${m.at}s`);
  if (spec.flashes?.length) out.push("flashes");
  if (spec.audio.voice_cleanup?.highpass_hz) out.push(`voice high-pass ${spec.audio.voice_cleanup.highpass_hz} Hz`);
  if (spec.audio.music && spec.layers.some((l) => l.audio)) out.push("music ducking under the voice (the music sits at one fixed gain)");
  if (spec.audio.mutes?.length) out.push("mutes (silence before the turn)");
  for (const t of spec.texts) if (t.animation !== "none") out.push(`text animation ${t.animation} on ${t.id}`);
  if (spec.captions) out.push(`caption style ${spec.captions.preset ?? "classic"}: word pop and keyword colours (captions go in as one title per group)`);
  out.push("subtitles as SRT: Concat 0.2.7's API has no subtitle import");
  return out;
}

function fontFile(family: string): string | null {
  const key = family.toLowerCase().replace(/\s+/g, "");
  const f = existsSync(FONTS_DIR) ? readdirSync(FONTS_DIR).find((x) => x.toLowerCase().startsWith(key) && /\.(ttf|otf)$/i.test(x)) : undefined;
  return f ? join(FONTS_DIR, f).replace(/\\/g, "/") : null;
}

/** Concat font size is the em size as a fraction of the frame height. */
function emFraction(st: TextStyle, height: number): number {
  const em = st.size_basis === "em" ? st.font_px : st.font_px / lineRatio(st.font_family ?? "Inter");
  return r4(em / height);
}

function textStyle(st: TextStyle, content: string, height: number) {
  return {
    content: st.uppercase ? content.toUpperCase() : content, fontFamily: st.font_family ?? "Inter", fontSize: emFraction(st, height),
    fontWeight: st.bold === false ? 400 : 700, color: st.color ?? "#ffffff", align: "center",
    strokeWidth: r4((st.outline_px ?? 0) / height), strokeColor: st.outline_color ?? "#000000",
    shadow: (st.shadow_px ?? 0) > 0, lineHeight: 1.1,
  };
}

export async function toConcat(spec: EditSpec, o: ConcatOptions): Promise<ConcatResult> {
  const home = resolve(homedir()).toLowerCase();
  const dir = resolve(o.projectDir).replace(/\\/g, "/");
  if (!dir.toLowerCase().startsWith(home.replace(/\\/g, "/"))) throw new Error(`Concat's API only writes under ${homedir()}: ${o.projectDir}`);
  if (o.framePng && !resolve(o.framePng).toLowerCase().startsWith(home)) throw new Error(`frame must be under ${homedir()}`);
  const { width: W, height: H, fps } = spec.canvas;
  const D = spec.duration;
  const c = await ConcatClient.connect("127.0.0.1", o.port ?? 7420, o.token);
  const built: Record<string, number> = { takes: 0, images: 0, titles: 0, captions: 0, music: 0, sfx: 0, fonts: 0 };
  const project = `${dir}/${o.name}`;
  try {
    let v = await c.call("project.create", { location: dir, name: o.name, video: { width: W, height: H, rateNum: fps, rateDen: 1 } });
    const tracks: string[] = v.project.timelines[0].tracks.map((x: any) => x.id); // T1..T4
    const edit = async (command: any) => (v = await c.call("edit.apply", { path: project, command }));
    const clip = (id: string) => v.project.timelines[0].clips.find((x: any) => x.id === id);

    const families = new Set([...spec.texts.map((t) => t.style.font_family ?? "Inter"), ...(spec.captions ? [captionStyle(spec.captions).font_family ?? "Inter"] : [])]);
    for (const fam of families) {
      const f = fontFile(fam);
      if (f) { await edit({ op: "addFont", family: fam, path: f }); built.fonts++; }
    }
    const media = new Map<string, string>();
    const importMedia = async (src: string) => {
      const key = src.replace(/\\/g, "/");
      if (!media.has(key)) { const r = await c.call("media.import", { path: project, file: key }); media.set(key, r.createdId); }
      return media.get(key)!;
    };
    // a clip lands far right first, is trimmed to its window, then moved to its place (no collision while trimming)
    let park = 100000;
    const place = async (src: string, track: string, start: number, inS: number, dur: number) => {
      const mediaId = await importMedia(src);
      await edit({ op: "addClip", mediaId, trackId: track, start: park });
      const id = v.createdId;
      park += 10000;
      if (inS > 0) await edit({ op: "trimClip", clipId: id, edge: "start", delta: inS });
      await edit({ op: "trimClip", clipId: id, edge: "end", delta: dur - clip(id).duration });
      await edit({ op: "moveClips", moves: [{ clipId: id, trackId: track, start }] });
      return id as string;
    };

    // pictures on T1
    const tk = takes(spec);
    const punches = spec.camera.filter((m) => m.type === "punch_in" && m.auto);
    for (const l of tk) {
      const id = await place(l.src, tracks[0], l.start, l.in ?? 0, l.duration);
      const p = punches.find((m) => m.type === "punch_in" && Math.abs(m.at - l.start) < 0.5 / fps);
      if (p && p.type === "punch_in") await edit({ op: "setClipTransform", clipId: id, scale: r4(1 + p.amount) });
      if (!l.audio) await edit({ op: "updateClip", clipId: id, patch: { volume: 0 } });
      built.takes++;
    }
    const still = spec.layers.find((l) => l.kind === "image" && !l.rect);
    if (!tk.length && still) {
      const id = await place(still.src, tracks[0], still.start, 0, still.duration);
      const push = spec.camera.find((m) => m.type === "push");
      if (push && push.type === "push") {
        await edit({ op: "setClipKey", clipId: id, property: "scale", at: 0, value: push.from });
        await edit({ op: "setClipKey", clipId: id, property: "scale", at: 1, value: push.to });
      }
      built.images++;
    }

    // captions on T2, one title per group, held up to 0.25 s into the pause
    if (spec.captions?.words.length) {
      const st = captionStyle(spec.captions);
      const groups = captionGroups(spec.captions);
      for (let g = 0; g < groups.length; g++) {
        const a = groups[g][0].start, next = groups[g + 1]?.[0].start ?? D;
        const b = Math.min(next, groups[g][groups[g].length - 1].end + 0.25, D);
        await edit({ op: "addTextClip", trackId: tracks[1], start: r4(a), duration: r4(b - a),
          style: textStyle(st, groups[g].map((w) => w.word).join(" "), H), offsetY: r4((spec.captions.y - H / 2) / H) });
        built.captions++;
      }
    }
    // headline and other texts on T3
    for (const t of spec.texts) {
      await edit({ op: "addTextClip", trackId: tracks[2], start: r4(t.start), duration: r4(t.end - t.start),
        style: textStyle(t.style, t.lines.join("\n"), H), offsetY: r4((t.y - H / 2) / H) });
      built.titles++;
    }
    // music on T4
    const m = spec.audio.music;
    if (m && musicPath(m)) {
      const at = m.start ?? 0;
      const id = await place(musicPath(m)!, tracks[3], at, m.offset ?? 0, D - at);
      const gain = typeof m.measured?.gain_db === "number" ? (m.measured.gain_db as number) : (m.gain_db ?? -20);
      await edit({ op: "updateClip", clipId: id, patch: { volume: r4(dbToLin(gain)), fadeIn: m.fade_in_s ?? 0.15, fadeOut: Math.min(m.fade_out_s ?? 1.5, (D - at) / 3) } });
      built.music++;
    }
    // sound effects on a fifth track
    const sfx = spec.audio.sfx.filter((s) => !s.only_with_music || m);
    if (sfx.length) {
      await edit({ op: "addTrack" });
      const t5 = v.project.timelines[0].tracks.map((x: any) => x.id).find((x: string) => !tracks.includes(x));
      for (const s of sfx) {
        const st = sfxStart(s), skip = Math.max(0, -st), at = Math.max(0, st);
        const id = await place(s.src, t5, at, skip, Math.min(probe(s.src).duration - skip, D - at));
        await edit({ op: "updateClip", clipId: id, patch: { volume: r4(dbToLin(s.gain_db ?? 0)) } });
        built.sfx++;
      }
    }
    await c.call("project.save", { path: project });
    await c.call("project.close", { path: project, save: true });

    const res: ConcatResult = { project, file: `${project}/concat.json`, dropped: dropped(spec), built };
    if (o.verify !== false) {
      // reopen the saved project and count what is in it
      const op = await c.call("project.open", { path: project });
      const doc = op?.project ?? (await c.call("project.get", { path: project }))?.project ?? (await c.call("project.get", { path: project }));
      const clips = (doc?.timelines?.[0]?.clips ?? doc?.clips ?? []) as any[];
      const byKind: Record<string, number> = {}, byTrack: Record<string, number> = {};
      for (const k of clips) { byKind[k.kind] = (byKind[k.kind] ?? 0) + 1; byTrack[k.trackId] = (byTrack[k.trackId] ?? 0) + 1; }
      const want = { video: built.takes, image: built.images, text: built.titles + built.captions, audio: built.music + built.sfx };
      const matches = Object.entries(want).every(([k, n]) => (byKind[k] ?? 0) === n);
      res.verified = { opened: !!doc, clips: byKind, tracks: byTrack, matches };
      if (o.framePng) {
        await c.call("preview.frame", { path: project, time: o.frameAt ?? Math.min(1.5, D / 2), output: resolve(o.framePng).replace(/\\/g, "/") });
        res.frame = o.framePng;
      }
      await c.call("project.close", { path: project, save: false });
    }
    return res;
  } finally {
    c.close();
  }
}

export const concatProjectName = (spec: EditSpec) => `${spec.id}-concat`;
export const describe = (r: ConcatResult) => [
  `projeto: ${r.project}`, `arquivo: ${r.file}`,
  `montado: ${Object.entries(r.built).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ")}`,
  ...(r.verified ? [`reaberto pela API: ${r.verified.opened ? "sim" : "não"}; clipes ${JSON.stringify(r.verified.clips)}; trilhas ${JSON.stringify(r.verified.tracks)}; confere: ${r.verified.matches ? "sim" : "NÃO"}`] : []),
  ...(r.frame ? [`quadro: ${r.frame}`] : []),
  "fica de fora (refazer à mão no Concat, se quiser):", ...r.dropped.map((d) => `  - ${d}`),
  `abrir: no Concat, Arquivo > Abrir (ou Recentes) e escolha ${basename(r.project)}/concat.json`,
].join("\n");

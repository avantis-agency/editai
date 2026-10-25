// Measurements with ffmpeg/ffprobe: probe, text bounding box, loudness.
// Every number the QA reports comes from one of these functions. Bun only.
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { basename, join, relative, isAbsolute } from "node:path";
import { buildAss } from "./ass.ts";
import { FONTS_DIR, type EditSpec, type Rect } from "./spec.ts";

export function run(cmd: string[], cwd?: string): { code: number; out: string; err: string } {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
}

export function ffmpeg(args: string[], cwd?: string): string {
  const r = run(["ffmpeg", "-y", "-hide_banner", "-nostdin", ...args], cwd);
  if (r.code !== 0) throw new Error(`ffmpeg failed (${r.code}):\n${r.err.split("\n").slice(-25).join("\n")}`);
  return r.err;
}

export interface Probe {
  codec: string; profile: string; pix_fmt: string; width: number; height: number;
  fps: number; duration: number; frames: number | null; audio_codec: string | null; audio_rate: number | null; audio_duration: number | null;
}

export function probe(file: string): Probe {
  const r = run(["ffprobe", "-v", "error", "-show_entries",
    "stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_frames,sample_rate,duration:format=duration",
    "-of", "json", file]);
  if (r.code !== 0) throw new Error("ffprobe failed: " + r.err);
  const j = JSON.parse(r.out);
  const v = j.streams.find((s: any) => s.codec_type === "video");
  const a = j.streams.find((s: any) => s.codec_type === "audio");
  const [n, d] = String(v?.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    codec: v?.codec_name ?? "none", profile: v?.profile ?? "", pix_fmt: v?.pix_fmt ?? "",
    width: v?.width ?? 0, height: v?.height ?? 0, fps: d ? n / d : 0,
    duration: Number(j.format?.duration ?? 0), frames: v?.nb_frames ? Number(v.nb_frames) : null,
    audio_codec: a?.codec_name ?? null, audio_rate: a?.sample_rate ? Number(a.sample_rate) : null,
    audio_duration: a?.duration ? Number(a.duration) : null,
  };
}

export function hasAudio(file: string): boolean {
  const r = run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file]);
  return r.out.trim().length > 0;
}

/**
 * Make fonts reachable from `workdir` through a relative path (libass fontsdir). With user fonts (2.3.0,
 * spec.fonts.found) the squad fonts and the user files are copied into <workdir>/fonts: the render work
 * folder sits next to the output, never in the squad.
 */
export function fontsDirFor(workdir: string, spec?: EditSpec): string {
  const user = spec?.fonts?.found ?? [];
  if (user.length) {
    const local = join(workdir, "fonts");
    mkdirSync(local, { recursive: true });
    for (const f of readdirSync(FONTS_DIR)) if (!existsSync(join(local, f))) copyFileSync(join(FONTS_DIR, f), join(local, f));
    for (const u of user) { const to = join(local, `user-${basename(u.file)}`); if (!existsSync(to)) copyFileSync(u.file, to); }
    return "fonts";
  }
  const rel = relative(workdir, FONTS_DIR);
  if (rel && !isAbsolute(rel) && !/^[a-z]:/i.test(rel)) return rel.replace(/\\/g, "/");
  const local = join(workdir, "fonts");
  mkdirSync(local, { recursive: true });
  for (const f of readdirSync(FONTS_DIR)) if (!existsSync(join(local, f))) copyFileSync(join(FONTS_DIR, f), join(local, f));
  return "fonts";
}

/**
 * Bounding box of one text layer, measured, not estimated: the layer is rendered
 * alone in white (outline included, shadow excluded) on black for one frame and
 * the bbox filter reports the lit pixels.
 */
export function measureTextBox(spec: EditSpec, layerId: string, at: number, workdir: string): Rect | null {
  mkdirSync(workdir, { recursive: true });
  const name = `mask-${layerId}.ass`;
  writeFileSync(join(workdir, name), buildAss(spec, { mask: true, only: layerId }), "utf8");
  const { width: W, height: H } = spec.canvas;
  const err = ffmpeg(["-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:r=25:d=${(at + 0.2).toFixed(2)}`,
    "-vf", `ass=${name}:fontsdir=${fontsDirFor(workdir, spec)},trim=start=${at.toFixed(2)},setpts=PTS-STARTPTS,bbox=min_val=60`,
    "-frames:v", "1", "-f", "null", "-"], workdir);
  const m = [...err.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)].pop();
  if (!m) return null;
  const [x1, x2, y1, y2] = m.slice(1).map(Number);
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

/** Output frames that are (almost) entirely black, via the blackframe filter: a gap between layers shows as one. */
export function blackFrames(file: string): number[] {
  const r = run(["ffmpeg", "-hide_banner", "-nostdin", "-i", file, "-map", "0:v:0", "-vf", "blackframe=amount=98:threshold=24", "-f", "null", "-"]);
  return [...r.err.matchAll(/blackframe.*?frame:(\d+)/g)].map((m) => Number(m[1]));
}

/** Integrated loudness (LUFS) and true peak (dBTP) via the ebur128 filter. */
export function loudness(file: string): { lufs: number | null; true_peak: number | null } {
  if (!hasAudio(file)) return { lufs: null, true_peak: null };
  const r = run(["ffmpeg", "-hide_banner", "-nostdin", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = r.err.slice(r.err.lastIndexOf("Summary:"));
  const i = summary.match(/I:\s+(-?[\d.]+|-inf)\s+LUFS/);
  const p = summary.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/);
  const val = (s?: string) => (s && s !== "-inf" ? Number(s) : null);
  return { lufs: val(i?.[1]), true_peak: val(p?.[1]) };
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

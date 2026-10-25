// Voice cleanup and audio diagnosis through the installed editonny 1.0.0 (EditAi 2.2.0, wave 2). Bun only.
//
// Diagnosis (noise_check.py): background noise in the pauses against the speech level (SNR), clipping
// and echo, with editonny's recommendation (off >= 30 dB, light >= 20 dB, strong below). Metrics are
// indicators: listen to the reported moments before calling a defect.
// Denoise (denoise.py, a library with no CLI, driven here through `python -B -c`): high-pass 80 Hz and
// afftdn with a noise profile sampled from the source's own pauses; light = nr 10, strong = nr 20. The
// whole source track is cleaned into a 48 kHz float WAV with the same length and sync (editonny's
// self-test measures the filter delay and the graph trims it), cached in <project>/editai/cache/denoise/.
// The take keeps its picture and takes the audio from that WAV (MediaLayer.audio_src). Nothing is
// written into the editonny install.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { editonnyStatus, runHelper } from "./editonny.ts";

export type DenoiseMode = "off" | "light" | "strong";

export interface NoiseReport {
  ok: boolean; reason?: string;
  sources: { file: string; snr_db: number | null; noise_db: number | null; speech_db: number | null; level: string | null; suggest: DenoiseMode;
    clipping: string | null; echo: string | null; error?: string }[];
  suggest: DenoiseMode; text: string;
}

/** noise_check.py --json on the sources (edit dir for its regions cache). */
export function noiseCheck(files: string[], editDir: string): NoiseReport {
  const st = editonnyStatus();
  if (!st.usable) return { ok: false, reason: st.reason, sources: [], suggest: "off", text: `diagnóstico indisponível: ${st.reason}` };
  mkdirSync(editDir, { recursive: true });
  const r = runHelper(st, "noise_check", [...files.map((f) => resolve(f)), "--edit-dir", editDir, "--json"], editDir);
  let j: any = null;
  try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch { j = null; }
  if (!j?.videos) return { ok: false, reason: `noise_check saiu ${r.code}: ${r.stderr.trim().split("\n").pop() ?? ""}`, sources: [], suggest: "off", text: "diagnóstico falhou" };
  const sources = j.videos.map((v: any) => ({
    file: v.source, snr_db: v.snr_db ?? null, noise_db: v.noise_db ?? null, speech_db: v.speech_db ?? null, level: v.level ?? null,
    suggest: (v.suggest ?? "off") as DenoiseMode, clipping: v.voice?.clipping?.level ?? null, echo: v.voice?.echo?.level ?? null, error: v.error,
  }));
  return { ok: true, sources, suggest: (j.recommendation?.suggest ?? "off") as DenoiseMode, text: j.recommendation?.text ?? "" };
}

const DRIVER = `
import sys, json
sys.path.insert(0, sys.argv[1])
from pathlib import Path
import denoise as dn
from common import probe_video
src, edit, work, mode, out = Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]), sys.argv[5], Path(sys.argv[6])
st = dn.self_test(work)
if not st.get("ok"):
    print(json.dumps({"ok": False, "reason": "self-test: " + str(st.get("reason"))})); sys.exit(0)
info = probe_video(src)
import render_cut as rc
prof = dn.learn_profile(src, info, rc.channel_mode(src, info), edit, work)
if not prof.usable:
    print(json.dumps({"ok": False, "reason": prof.reason, "profile": prof.as_dict()})); sys.exit(0)
applied = mode if prof.how == "pauses" else "light"
before = dn.read_audio(src)
total = len(before)
script = work / "denoise-graph.txt"
script.write_text(dn.whole_graph(rc.wav_samples(prof.wav), dn.NR[applied], prof.nf, int(st["delay"]), total) + "\\n", encoding="utf-8")
tmp = out.with_name(".tmp-" + out.name)
dn.run_ffmpeg(["-v", "error", "-y", "-i", src, "-i", prof.wav, *dn.graph_args(script), "-map", "[out]", "-c:a", "pcm_f32le", "-ar", dn.SR, "-ac", 2, "-f", "wav", tmp], "denoise the source")
import os
os.replace(tmp, out)
after = dn.read_audio(out)
fb, fa = dn.noise_floors(before, after, [])
print(json.dumps({"ok": True, "applied": applied, "profile": prof.as_dict(), "samples": total, "samples_out": len(after),
  "floor_before_db": None if fb is None else round(fb, 1), "floor_after_db": None if fa is None else round(fa, 1), "delay": st["delay"]}))
`;

export interface DenoiseResult { ok: boolean; wav?: string; applied?: DenoiseMode; reason?: string; report?: any }

/** Cleans one source's voice into a WAV (cached by source, mode and editonny version). */
export function denoiseSource(src: string, mode: DenoiseMode, editDir: string, cacheRoot: string): DenoiseResult {
  if (mode === "off") return { ok: false, reason: "off" };
  const st = editonnyStatus();
  if (!st.usable || !st.engine || !st.python) return { ok: false, reason: st.reason || "editonny indisponível" };
  const s = statSync(src);
  const key = createHash("sha1").update(JSON.stringify([resolve(src), s.size, s.mtimeMs, mode, st.version, 1])).digest("hex").slice(0, 16);
  const dir = join(cacheRoot, key);
  const wav = join(dir, `${basename(src).replace(/\.[^.]+$/, "")}.voice-${mode}.wav`), meta = join(dir, "denoise.json");
  if (existsSync(wav) && existsSync(meta)) return { ok: true, wav, applied: JSON.parse(readFileSync(meta, "utf8")).applied, report: JSON.parse(readFileSync(meta, "utf8")) };
  mkdirSync(dir, { recursive: true });
  const p = Bun.spawnSync([st.python, "-B", "-c", DRIVER, join(st.engine, "helpers"), resolve(src), resolve(editDir), dir, mode, wav], {
    cwd: dir, stdout: "pipe", stderr: "pipe", timeout: 900_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  const last = p.stdout.toString().trim().split(/\r?\n/).pop() ?? "";
  let j: any = null;
  try { j = JSON.parse(last); } catch { j = null; }
  if (!j?.ok || !existsSync(wav)) return { ok: false, reason: j?.reason ?? `denoise saiu ${p.exitCode}: ${p.stderr.toString().trim().split("\n").pop() ?? ""}` };
  if (j.samples !== j.samples_out) return { ok: false, reason: `denoise mudou o número de amostras (${j.samples} -> ${j.samples_out}); voz original mantida` };
  writeFileSync(meta, JSON.stringify(j, null, 2));
  return { ok: true, wav, applied: j.applied, report: j };
}

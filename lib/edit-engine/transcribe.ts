// Optional local transcriber: word timings from the editonny skill's
// faster-whisper helper, called as a subprocess (its code is not copied and its
// install is never written to). Bun only.
//   bun lib/edit-engine/cli.ts transcribe <video> <out.words.json> [language] [--hesitations] [--prompt "..."]
//
// --hesitations (2.4.0): a second pass that keeps the hesitations ("é…", "ãh", "hum", "né" / "um", "uh")
// instead of cleaning them away, with an initial prompt written in the language that already contains them
// (Whisper imitates the style of its prompt). It has its own cache folder, so the first transcription is not
// overwritten; compare the two to find the fillers (captions.drop_fillers, lib/edit-engine/captions.ts).
//
// Lookup: $EDITONNY_ENGINE, else ~/.local/share/editonny/engine. It needs the
// engine's own .venv with the model already downloaded: the call runs with
// HF_HUB_OFFLINE=1 (no download) and PYTHONDONTWRITEBYTECODE=1 (no __pycache__
// inside the install). Fallback when it is missing or fails: exit 3 with the
// reason; supply word timings from another transcriber (Gemini, Whisper API) and
// check phrase onsets on the waveform, as the talking-head template requires.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface Word { word: string; start: number; end: number; prob?: number }
export interface TranscribeResult { ok: boolean; words: Word[]; engine?: string; seconds?: number; reason?: string; raw?: string }

export function editonnyEngine(): string | null {
  const dir = process.env.EDITONNY_ENGINE ?? join(homedir(), ".local", "share", "editonny", "engine");
  const py = join(dir, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  return existsSync(join(dir, "helpers", "transcribe.py")) && existsSync(py) ? dir : null;
}

/** Initial prompt of the hesitation-preserving pass: a sentence in the language with the hesitations in it. */
export const HESITATION_PROMPT: Record<string, string> = {
  pt: "É… éh, ãh, então… hum, a gente, ah, precisa, né? Oh, é… ãh.",
  en: "Um, uh, so… er, hmm, we, ah, need to, you know? Oh, uh… um.",
};

export function transcribe(video: string, outJson: string, language = "auto", opts: { hesitations?: boolean; prompt?: string } = {}): TranscribeResult {
  const engine = editonnyEngine();
  if (!engine) return { ok: false, words: [], reason: "editonny engine not found (set EDITONNY_ENGINE or install the editonny skill)" };
  const py = join(engine, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const prompt = [opts.hesitations ? HESITATION_PROMPT[language === "en" ? "en" : "pt"] : "", opts.prompt ?? ""].filter(Boolean).join(" ");
  const editDir = join(dirname(resolve(outJson)), opts.hesitations ? ".transcribe-cache-hesitations" : ".transcribe-cache");
  mkdirSync(editDir, { recursive: true });
  const t0 = performance.now();
  const p = Bun.spawnSync([py, join(engine, "helpers", "transcribe.py"), resolve(video), "--edit-dir", editDir, "--language", language, ...(prompt ? ["--prompt", prompt] : [])], {
    cwd: editDir, stdout: "pipe", stderr: "pipe",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  const raw = join(editDir, "transcripts", `${basename(video).replace(/\.[^.]+$/, "")}.json`);
  if (p.exitCode !== 0 || !existsSync(raw)) {
    return { ok: false, words: [], reason: `editonny transcribe.py exited ${p.exitCode}: ${p.stderr.toString().trim().split("\n").slice(-3).join(" | ")}` };
  }
  const doc = JSON.parse(readFileSync(raw, "utf8"));
  const words: Word[] = (doc.words ?? []).map((w: any) => ({ word: String(w.text).trim(), start: w.start, end: w.end, prob: w.prob }));
  const res: TranscribeResult = { ok: words.length > 0, words, engine: `editonny ${doc.engine ?? "faster-whisper"}`, seconds: (performance.now() - t0) / 1000, raw };
  if (!words.length) res.reason = "transcriber returned no words";
  writeFileSync(outJson, JSON.stringify({ source: resolve(video), engine: res.engine, language: doc.language, ...(prompt ? { prompt, hesitations: !!opts.hesitations } : {}), words,
    note: "source-time word timings (seconds from the start of the clip); shift them to the timeline per cut; phrase onsets still deserve a waveform check" }, null, 2));
  return res;
}

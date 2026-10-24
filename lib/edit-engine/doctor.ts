// Checks what this squad needs on this machine and says how to fix what is missing.
//   bun lib/edit-engine/cli.ts doctor            exit 0 when every required item is present
// Required: Bun, ffmpeg + ffprobe with libass and the filters the engine uses, the
// fonts, the binary files intact (assets/checksums.json), the starter kit covering every
// music mood and sound-effect role, the license files, the templates. Optional (reported,
// never a failure): the rest of the library (library pull), the editonny transcriber and the Concat API.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { effectFile, musicIndex, pickSfx, sfxIndex, trackFile, MUSIC_DIR, SFX_DIR } from "./library.ts";
import { run } from "./measure.ts";
import { SQUAD_ROOT } from "./spec.ts";
import { editonnyEngine } from "./transcribe.ts";
import { loadNiches } from "./briefing.ts";

interface Item { name: string; ok: boolean; required: boolean; detail: string; fix?: string }

const FILTERS = ["ass", "drawtext", "zoompan", "loudnorm", "bbox", "ebur128", "sidechaincompress", "amix", "alimiter", "showwavespic", "blackframe", "tile", "drawbox", "tpad", "overlay"];
const FFMPEG_FIX = {
  win32: "winget install Gyan.FFmpeg  (or: choco install ffmpeg -y); reopen the terminal",
  darwin: "brew install ffmpeg  (check libass: ffmpeg -filters | grep ' ass '; if missing use a full build, e.g. brew tap homebrew-ffmpeg/ffmpeg && brew install homebrew-ffmpeg/ffmpeg/ffmpeg)",
  linux: "sudo apt install -y ffmpeg  (Debian/Ubuntu builds include libass)",
} as Record<string, string>;

async function concatApi(port: number): Promise<boolean> {
  try {
    const s = await Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {}, error() {} } });
    s.end();
    return true;
  } catch { return false; }
}

export async function doctor(): Promise<{ items: Item[]; ok: boolean }> {
  const items: Item[] = [];
  const add = (i: Item) => items.push(i);
  const os = process.platform;

  add({ name: "bun", ok: true, required: true, detail: `Bun ${Bun.version}` });

  const ff = run(["ffmpeg", "-hide_banner", "-version"]);
  const ffok = ff.code === 0;
  add({ name: "ffmpeg", ok: ffok, required: true, detail: ffok ? ff.out.split("\n")[0].slice(0, 90) : "not found on PATH", fix: FFMPEG_FIX[os] ?? FFMPEG_FIX.linux });
  const fp = run(["ffprobe", "-hide_banner", "-version"]);
  add({ name: "ffprobe", ok: fp.code === 0, required: true, detail: fp.code === 0 ? "present" : "not found on PATH (comes with ffmpeg)", fix: FFMPEG_FIX[os] ?? FFMPEG_FIX.linux });
  if (ffok) {
    const list = run(["ffmpeg", "-hide_banner", "-filters"]).out;
    const missing = FILTERS.filter((f) => !new RegExp(`\\s${f}\\s`).test(list));
    add({ name: "ffmpeg filters", ok: missing.length === 0, required: true,
      detail: missing.length ? `missing: ${missing.join(", ")}${missing.includes("ass") ? " (ass = libass, needed for every text)" : ""}` : `${FILTERS.length} filters present, libass included`,
      fix: "install an ffmpeg build with libass and freetype: " + (FFMPEG_FIX[os] ?? FFMPEG_FIX.linux) });
  }

  const fonts = ["Anton-Regular.ttf", "Inter-Bold.ttf", "OFL-Anton.txt", "LICENSE-Inter.txt"].filter((f) => !existsSync(join(SQUAD_ROOT, "assets", "fonts", f)));
  add({ name: "fonts", ok: fonts.length === 0, required: true, detail: fonts.length ? `missing in assets/fonts: ${fonts.join(", ")}` : "Anton and Inter with their OFL licenses", fix: "reinstall the squad (nrv activate editai)" });

  const sums = (() => { try { return JSON.parse(readFileSync(join(SQUAD_ROOT, "assets", "checksums.json"), "utf8")).files as Record<string, string>; } catch { return null; } })();
  const broken = sums ? Object.entries(sums).filter(([f, h]) => { const p = join(SQUAD_ROOT, f); return !existsSync(p) || createHash("sha256").update(readFileSync(p)).digest("hex") !== h; }).map(([f]) => f) : [];
  add({ name: "binary files", ok: !!sums && broken.length === 0, required: true,
    detail: !sums ? "assets/checksums.json missing" : broken.length ? `${broken.length} differ from the release or are missing: ${broken.slice(0, 4).join(", ")}${broken.length > 4 ? ", ..." : ""}` : `${Object.keys(sums).length} fonts, audio and images match assets/checksums.json`,
    fix: "reinstall with git clone (squads add 0.3.x saves binary files as text and corrupts them)" });

  const mi = musicIndex();
  const tracks = mi ? Object.values(mi.tracks) : [];
  const where = tracks.map((t) => trackFile(t)?.where);
  const uncovered = mi ? Object.entries(mi.moods).filter(([, ids]) => !ids.some((i) => trackFile(mi.tracks[i]))).map(([m]) => m) : [];
  const originals = where.filter((w) => w === "squad" || w === "cache").length, kit = where.filter((w) => w === "kit").length;
  add({ name: "music library", ok: !!mi && uncovered.length === 0 && existsSync(join(MUSIC_DIR, "LICENSES.md")) && existsSync(join(MUSIC_DIR, "CREDITS.md")), required: true,
    detail: mi ? `${originals + kit} of ${tracks.length} CC0 tracks available (${kit} starter kit AAC 96 kbps, ${originals} original), ${uncovered.length ? `moods without a track: ${uncovered.join(", ")}` : `all ${Object.keys(mi.moods).length} moods covered`}${originals < tracks.length ? `; library pull --music brings the ${tracks.length - originals} original(s) missing` : ""}` : "assets/music/index.json missing",
    fix: "reinstall the squad, or bun lib/edit-engine/cli.ts library pull --music; a spec can always use its own music file with audio.music.path" });
  const si = sfxIndex();
  const effects = si ? Object.values(si.effects) : [];
  const sHere = effects.filter((e) => effectFile(e)).length;
  const synth = ["whoosh-synth.wav", "hit-synth.wav", "riser-synth.wav"].filter((f) => !existsSync(join(SFX_DIR, f)));
  const roles = si ? Object.keys(si.roles).filter((r) => !pickSfx(r)) : [];
  add({ name: "sound effects", ok: !!si && roles.length === 0 && synth.length === 0 && existsSync(join(SFX_DIR, "LICENSES.md")) && existsSync(join(SFX_DIR, "CREDITS.md")), required: true,
    detail: si ? `${sHere} of ${effects.length} CC0 effects available, roles ${roles.length ? `unresolved: ${roles.join(", ")}` : "whoosh, hit and riser resolved"}, synthesized fallbacks ${synth.length ? `missing ${synth.join(", ")}` : "present"}${sHere < effects.length ? `; library pull --sfx brings the other ${effects.length - sHere}` : ""}` : "assets/sfx/index.json missing",
    fix: synth.length ? "bun lib/edit-engine/cli.ts sfx-synth" : "reinstall the squad, or bun lib/edit-engine/cli.ts library pull --sfx" });

  const tdir = join(SQUAD_ROOT, "templates", "edit");
  const bad: string[] = [];
  for (const f of readdirSync(tdir).filter((x) => x.endsWith(".json"))) { try { JSON.parse(readFileSync(join(tdir, f), "utf8")); } catch { bad.push(f); } }
  add({ name: "templates", ok: bad.length === 0, required: true, detail: bad.length ? `unreadable: ${bad.join(", ")}` : "text-only, pov-app-screen, this-vs-that, talking-head-captions", fix: "reinstall the squad" });

  const eng = editonnyEngine();
  add({ name: "transcriber (optional)", ok: !!eng, required: false,
    detail: eng ? `editonny engine found (${process.env.EDITONNY_ENGINE ? "EDITONNY_ENGINE" : "default location"}): cli.ts transcribe works offline` : "editonny not found: talking-head captions need word timings from another transcriber",
    fix: "install the editonny skill (https://github.com/soumatheusgomes/editonny) and run its setup once, or set EDITONNY_ENGINE" });
  const measureOk = !!eng && existsSync(join(eng, "helpers", "measure_reference.py"));
  add({ name: "reference style meter (optional)", ok: measureOk, required: false,
    detail: measureOk ? "editonny measure_reference.py found: cli.ts style-extract measures pace, text, sound, palette and framing" : "editonny measure_reference.py not found: cli.ts style-extract measures cuts and loudness only (ffmpeg)",
    fix: "install the editonny skill and run its setup once, or set EDITONNY_ENGINE" });
  const nd = loadNiches().length;
  add({ name: "niche starting profiles", ok: nd >= 4, required: true, detail: `${nd} in templates/niches (guided briefing)`, fix: "reinstall the squad" });
  const ytdlp = (() => { try { return Bun.spawnSync(["yt-dlp", "--version"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0; } catch { return false; } })();
  add({ name: "yt-dlp (optional)", ok: ytdlp, required: false,
    detail: ytdlp ? "present: style-extract accepts TikTok and YouTube links" : "not found: style-extract takes local files only (send the reference video itself)",
    fix: "install yt-dlp (winget install yt-dlp / brew install yt-dlp / pipx install yt-dlp)" });
  add({ name: "Instagram links (optional)", ok: !!(process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN), required: false,
    detail: process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN ? "APIFY_TOKEN set: style-extract downloads Instagram reels through Apify" : "APIFY_TOKEN not set: for an Instagram reference, send the video file",
    fix: "set APIFY_TOKEN in the environment (never in a file of the squad)" });
  const port = Number(process.env.CONCAT_PORT ?? 7420);
  const api = await concatApi(port);
  add({ name: "Concat API (optional)", ok: api, required: false,
    detail: api ? `answering on 127.0.0.1:${port}` : `not answering on 127.0.0.1:${port}: only needed for cli.ts concat`,
    fix: "open Concat 0.2.7+ and switch the API on (its Automation screen); keep its token in a file or in CONCAT_TOKEN" });

  return { items, ok: items.every((i) => i.ok || !i.required) };
}

export function printDoctor(r: { items: Item[]; ok: boolean }): string {
  const lines = r.items.map((i) => `${i.ok ? "ok      " : i.required ? "FALTA   " : "opcional"} ${i.name}: ${i.detail}${!i.ok && i.fix ? `\n         como resolver: ${i.fix}` : ""}`);
  lines.push("", r.ok ? "doctor: tudo o que é obrigatório está presente" : "doctor: falta algo obrigatório (veja FALTA acima)");
  return lines.join("\n");
}

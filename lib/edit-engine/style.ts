// Reference style: measure the editing language of someone else's video and keep
// it as a style profile (JSON) that this engine applies to the person's own
// footage. It copies the language (pace, zoom, text placement and size, caption
// look, headline, sound design density, music level), never the content: no
// speech, music, brand, logo, people or claims of the reference. Bun only.
//
//   bun lib/edit-engine/cli.ts style-extract <video|url> --name <name> [--project DIR]
//   bun lib/edit-engine/cli.ts style-apply <style.json> <th-batch.json> [--review]
//
// Measurement: editonny's helpers/measure_reference.py (and filmstrip.py for
// the first 3 s), run as a subprocess with the engine's own .venv, offline
// (HF_HUB_OFFLINE=1) and without writing bytecode into the install
// (PYTHONDONTWRITEBYTECODE=1). Nothing of editonny is copied. Without editonny the
// fallback measures only cuts and loudness with ffmpeg and says so.
// Download (links only): yt-dlp for TikTok and YouTube (YouTube with the mweb
// player client), Apify for Instagram only when APIFY_TOKEN is in the
// environment. Every file goes to the user's project, never into the squad.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { editonnyEngine } from "./transcribe.ts";
import { appDir, slug, stylePath } from "./project.ts";
import type { EditSpec, MediaLayer, Rect } from "./spec.ts";

export type Mood = "calm" | "chill-beat" | "emotional" | "groove" | "hiphop" | "upbeat";
export type Origin = "measured" | "estimated" | "default" | "reviewed" | "uncertain";

export interface StyleProfile {
  style_profile_version: 1;
  name: string;
  created_at: string;
  source: { kind: RefKind; input: string; file: string; sha256: string; duration_s: number; width: number; height: number; fps: number };
  measured_by: string;
  measurements_dir: string;
  measured: Record<string, unknown>;
  apply: {
    /** mode (2.3.0): "none" = continuous, no cuts (lib/edit-engine/continuous.ts); absent = the standard cleanup */
    cut: { zoom_cut_every_s: number | null; punch_amount: number; mode?: "standard" | "none" };
    /** 2.3.0: word = one word at a time; font_family may be a font the person supplies (font_fallback while it is missing) */
    captions: { enabled: boolean; preset: "bold-word" | "classic" | "word"; font_px: number; y: number; uppercase: boolean; emphasis_color: string | null; box: boolean;
      font_family?: string; font_fallback?: string; color?: string };
    /** 2.3.0: output size (a name of lib/edit-engine/canvas.ts); absent = the template's 1080x1920 */
    canvas?: "1080x1920" | "1920x1080" | "same-as-source";
    headline: { mode: "fixed" | "intro" | "none"; y: number; font_px: number; font_family: "Anton" | "Inter" };
    music: { enabled: boolean; mood: Mood | null; below_voice_db: number };
    sfx: { cut_whoosh: boolean; gain_db: number };
  };
  origin: Record<string, Origin>;
  not_reproduced: string[];
  review_notes: string[];
}

export type RefKind = "file" | "tiktok" | "youtube" | "instagram" | "link" | "briefing";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Number for the Portuguese report: 0.6 -> "0,6". */
export const pt = (n: number, d = 1) => Number(n).toFixed(d).replace(".", ",");
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const sha256 = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const pyEnv = () => ({ ...process.env, PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" });
const enginePython = (engine: string) => join(engine, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

export function classifyRef(input: string): RefKind {
  if (!/^https?:\/\//i.test(input)) return "file";
  if (/tiktok\.com/i.test(input)) return "tiktok";
  if (/youtube\.com|youtu\.be/i.test(input)) return "youtube";
  if (/instagram\.com/i.test(input)) return "instagram";
  return "link";
}

const has = (bin: string) => { try { return Bun.spawnSync([bin, "--version"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0; } catch { return false; } };

/** A local reference is used where it is; a link is downloaded into `dir` (the project). */
export async function fetchReference(input: string, dir: string): Promise<{ file: string; kind: RefKind }> {
  const kind = classifyRef(input);
  if (kind === "file") {
    const f = resolve(input);
    if (!existsSync(f)) throw new Error(`reference not found: ${f}`);
    return { file: f, kind };
  }
  mkdirSync(dir, { recursive: true });
  if (kind === "tiktok" || kind === "youtube" || kind === "link") {
    if (!has("yt-dlp")) throw new Error("yt-dlp is not installed: download the video yourself and pass the file (or install yt-dlp, see dependencies.yaml)");
    const args = ["yt-dlp", "--no-playlist", "--max-filesize", "300M", "-f", "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/b", "--merge-output-format", "mp4", "-o", join(dir, "reference.%(ext)s")];
    if (kind === "youtube") args.push("--extractor-args", "youtube:player_client=mweb"); // the web client asks for a login on some machines
    const p = Bun.spawnSync([...args, input], { stdout: "pipe", stderr: "pipe" });
    const file = readdirSync(dir).filter((f) => /^reference\.(mp4|mkv|webm|mov)$/i.test(f)).map((f) => join(dir, f))[0];
    if (p.exitCode !== 0 || !file) throw new Error(`yt-dlp failed (${p.exitCode}): ${p.stderr.toString().trim().split("\n").slice(-2).join(" | ")}. Download the video and pass the file`);
    return { file, kind };
  }
  // Instagram: the Apify path documented by instagram-intelligence-nirvana, only with a token in the environment.
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("Instagram link without APIFY_TOKEN in the environment: save the reel (or screen-record it) and pass the file");
  const res = await fetch("https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=120", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ directUrls: [input], resultsType: "posts", resultsLimit: 1 }),
  });
  if (!res.ok) throw new Error(`Apify answered ${res.status}: pass the file instead`);
  const items = (await res.json()) as { videoUrl?: string }[];
  const url = items.find((i) => i.videoUrl)?.videoUrl;
  if (!url) throw new Error("Apify returned no video for this link (private post or a photo): pass the file instead");
  const v = await fetch(url);
  if (!v.ok) throw new Error(`video download failed (${v.status}): pass the file instead`);
  const file = join(dir, "reference.mp4");
  writeFileSync(file, new Uint8Array(await v.arrayBuffer()));
  return { file, kind };
}

/** editonny's measure_reference.py (plus a filmstrip of the first 3 s), or the ffmpeg fallback. */
export function measure(video: string, outDir: string): { rules: any; by: string; notes: string[] } {
  mkdirSync(outDir, { recursive: true });
  const engine = editonnyEngine();
  const notes: string[] = [];
  if (engine && existsSync(join(engine, "helpers", "measure_reference.py"))) {
    const p = Bun.spawnSync([enginePython(engine), join(engine, "helpers", "measure_reference.py"), video, "--output", outDir], { cwd: outDir, env: pyEnv(), stdout: "pipe", stderr: "pipe" });
    const rulesFile = join(outDir, "reference-rules.json");
    if (p.exitCode === 0 && existsSync(rulesFile)) {
      writeFileSync(join(outDir, "measure.log"), p.stdout.toString() + p.stderr.toString());
      const fs = Bun.spawnSync([enginePython(engine), join(engine, "helpers", "filmstrip.py"), video, "0", "3", "--output", join(outDir, "hook-filmstrip.jpg"), "--fps", "6"], { cwd: outDir, env: pyEnv(), stdout: "pipe", stderr: "pipe" });
      if (fs.exitCode !== 0) notes.push("filmstrip.py failed; the contact sheets are still there");
      return { rules: JSON.parse(readFileSync(rulesFile, "utf8")), by: "editonny measure_reference.py (subprocess)", notes };
    }
    notes.push(`measure_reference.py failed (${p.exitCode}): ${p.stderr.toString().trim().split("\n").slice(-2).join(" | ")}; using the ffmpeg fallback`);
  } else notes.push("editonny not found: ffmpeg fallback measures cuts and loudness only");
  return { rules: ffmpegFallback(video), by: "ffmpeg fallback (cuts and loudness only)", notes };
}

function ffmpegFallback(video: string): any {
  const pr = JSON.parse(Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate", "-of", "json", video]).stdout.toString());
  const v = pr.streams.find((s: any) => s.codec_type === "video");
  const [a, b] = String(v.r_frame_rate).split("/").map(Number);
  const dur = Number(pr.format.duration);
  const sc = Bun.spawnSync(["ffmpeg", "-hide_banner", "-nostats", "-i", video, "-vf", "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"], { stderr: "pipe" }).stderr.toString();
  const cuts = [...sc.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const lo = Bun.spawnSync(["ffmpeg", "-hide_banner", "-nostats", "-i", video, "-af", "ebur128", "-f", "null", "-"], { stderr: "pipe" }).stderr.toString();
  const I = [...lo.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].map((m) => Number(m[1])).pop() ?? null;
  return {
    metadata: { duration_s: dur, width: v.width, height: v.height, fps: b ? a / b : a, has_audio: pr.streams.some((s: any) => s.codec_type === "audio") },
    pacing: { cuts_per_minute: r2((cuts.length / dur) * 60), mean_shot_s: r2(dur / (cuts.length + 1)), cuts },
    audio: { loudness: { integrated_lufs: I } },
  };
}

const isPlainColor = (hex?: string | null) => {
  if (!hex) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) > 60; // clearly coloured, not white/grey/black
};

/** Measured rules -> profile. Every applied value carries its origin; unmeasured values keep the engine default. */
export function profileFromRules(rules: any, src: StyleProfile["source"], name: string, by: string, measDir: string, notes: string[]): StyleProfile {
  const origin: Record<string, Origin> = {};
  const nr: string[] = [];
  const dur = Number(rules.metadata?.duration_s) || src.duration_s;
  const pac = rules.pacing ?? {};
  const cap = rules.captions ?? {};
  const vision = cap.backend === "vision";

  // pace and zoom
  const cpm = Number(pac.cuts_per_minute ?? 0), mean = Number(pac.mean_shot_s ?? dur);
  let every: number | null = null;
  if (cpm >= 20) {
    every = r2(clamp(mean, 0.9, 3));
    if (mean < 0.9) nr.push(`Ritmo de ${pt(mean, 2)} s por plano: numa câmera só, o motor faz corte de zoom a cada 0,9 s no mínimo, para não parecer falha.`);
  }
  origin["cut.zoom_cut_every_s"] = pac.cuts_per_minute !== undefined ? "measured" : "default";
  const z = rules.framing?.zoom_at_cuts;
  let punch = every ? 0.07 : 0;
  if (z?.likely_zoom && z.suggested_level) { punch = r2(clamp(z.suggested_level - 1, 0.04, 0.12)); origin["cut.punch_amount"] = "measured"; }
  else origin["cut.punch_amount"] = every ? "estimated" : "measured";

  // text bands: the longest-lasting one is the headline, another frequent one is the caption line
  const bands = ((cap.positions ?? []) as any[]).map((p) => ({ y: Number(p.center_y), start: Number(p.start), end: Number(p.end), share: Number(p.caption_part ?? 0) }))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.y - b.y);
  const head = bands[0];
  const capBand = bands.slice(1).find((b) => b.share >= 0.5);
  const est = Number(cap.estimated_standard_font ?? 0);
  const upper = vision && Number(cap.uppercase_pct ?? 0) >= 0.7;
  const headline: StyleProfile["apply"]["headline"] = head
    ? { mode: head.end - head.start >= 0.8 * dur ? "fixed" : "intro", y: Math.round(head.y * 1920), font_px: Math.round(clamp(est ? est * (rules.written_hook?.larger_than_captions ? 1.1 : 1) : 86, 60, 110)), font_family: upper ? "Anton" : "Inter" }
    : { mode: "none", y: 350, font_px: 86, font_family: "Anton" };
  origin["headline.mode"] = head ? "estimated" : "measured";
  origin["headline.y"] = head ? "measured" : "default";
  origin["headline.font_px"] = est ? "estimated" : "default";
  origin["headline.font_family"] = vision ? "estimated" : "uncertain";
  if (est && est < 60) nr.push(`Texto pequeno da referência (cerca de ${Math.round(est)} px em 1080x1920): o QA da casa exige pelo menos 60 px de headline e 48 px de legenda.`);

  const enabled = !!(cap.has_captions && capBand);
  const preset = upper ? "bold-word" : "classic";
  const captions: StyleProfile["apply"]["captions"] = {
    enabled, preset, font_px: Math.round(clamp(est || 64, 48, 80)), y: capBand ? Math.round(capBand.y * 1920) : 1330, uppercase: upper,
    emphasis_color: vision && isPlainColor(cap.accent_color ?? cap.text_color) ? (cap.accent_color ?? cap.text_color) : null,
    box: Number(cap.solid_background_pct ?? 0) >= 0.5,
  };
  origin["captions.enabled"] = cap.backend ? "estimated" : "default";
  origin["captions.preset"] = vision ? "estimated" : "uncertain";
  origin["captions.y"] = capBand ? "measured" : "default";
  origin["captions.emphasis_color"] = vision ? "estimated" : "uncertain";
  if (!vision && cap.backend) nr.push("Leitura das palavras na tela (caixa alta, palavras por linha, cor do texto): sem o Apple Vision (só no macOS), o editonny acha a forma do texto mas não lê as letras. Esses campos ficam como estimativa e o agente confere na folha de contato.");

  // sound
  const mus = rules.audio?.music ?? {};
  const musicOn = ["probable music", "loud continuous sound"].includes(mus.verdict);
  const bpm = Number(mus.bpm ?? 0);
  const mood: Mood = bpm >= 115 ? "upbeat" : bpm && bpm <= 90 ? "calm" : cpm >= 40 ? "upbeat" : cpm >= 15 ? "chill-beat" : "calm";
  const music = { enabled: musicOn, mood: musicOn ? mood : null, below_voice_db: musicOn && mus.difference_db ? Math.round(clamp(mus.difference_db, 10, 30)) : 22 };
  origin["music.enabled"] = mus.verdict ? (mus.verdict === "uncertain" ? "uncertain" : "estimated") : "default";
  origin["music.mood"] = "estimated";
  origin["music.below_voice_db"] = musicOn && mus.difference_db ? "estimated" : "default";
  if (mus.verdict === "uncertain") nr.push("Música da referência incerta (fala quase sem pausa): ficou desligada; o briefing ou o mini editor podem ligar.");
  const eff = rules.audio?.effects ?? {};
  const perMin = Number(eff.per_minute ?? 0);
  const sfx = { cut_whoosh: eff.confidence !== "low" && perMin >= 10, gain_db: perMin >= 30 ? -20 : -26 };
  origin["sfx.cut_whoosh"] = eff.confidence ? "estimated" : "default";

  nr.push(
    "A fonte exata: o motor tem só Anton e Inter (OFL); a referência foi aproximada pela mais parecida.",
    "Cor, gradação e paleta da imagem: medidas e guardadas no perfil, mas não aplicadas (o motor não faz correção de cor).",
    "Cortes entre planos diferentes (B-roll, outro ângulo): com uma câmera só, o ritmo vira corte de zoom alternado; o motor não inventa planos.",
    "Transições além de corte seco e dissolve (deslize, giro, máscara, glitch) e animações de texto da referência (máquina de escrever, karaokê por sílaba, emoji, adesivo).",
    "Ritmo mais calmo que o material: os cortes de take que o material já tem continuam.",
    "Conteúdo da referência: fala, música, marca, logo, pessoas e promessas nunca são copiados; a música vem da biblioteca CC0 do squad, por clima.",
  );

  return {
    style_profile_version: 1, name, created_at: new Date().toISOString(), source: src, measured_by: by, measurements_dir: measDir,
    measured: {
      pacing: { cuts_per_minute: cpm, mean_shot_s: mean, median_shot_s: pac.median_shot_s ?? null, cuts_in_first_3s: pac.cuts_in_first_3s ?? null, cuts: pac.cuts ?? [] },
      zoom_at_cuts: z ?? null,
      text: cap.backend ? { backend: cap.backend, bands, estimated_font_px_1080: est || null, uppercase_pct: cap.uppercase_pct ?? null, words_per_line: cap.median_words_per_line ?? null, text_color: cap.text_color ?? null, accent: cap.accent_color ?? null, box_pct: cap.solid_background_pct ?? null, outline_pct: cap.dark_outline_pct ?? null, written_hook: rules.written_hook ?? null } : null,
      sound: rules.audio ? { loudness: rules.audio.loudness ?? null, music_verdict: mus.verdict ?? null, music_below_voice_db: mus.difference_db ?? null, bpm: mus.bpm ?? null, effects_per_minute: eff.per_minute ?? null, effects_at_cuts_pct: eff.cuts_with_sound_pct ?? null, effects_confidence: eff.confidence ?? null } : null,
      palette: rules.colors ? { dominant: (rules.colors.dominant ?? []).slice(0, 5).map((c: any) => c.hex), temperature: rules.colors.temperature ?? null, brightness: rules.colors.mean_brightness ?? null, saturation: rules.colors.mean_saturation ?? null } : null,
      framing: rules.framing ? { shot_type: rules.framing.shot_type ?? null, face_pct: rules.framing.face_pct ?? null, eye_y: rules.framing.median_eye_y ?? null } : null,
      notes,
    },
    apply: { cut: { zoom_cut_every_s: every, punch_amount: punch }, captions, headline, music, sfx },
    origin, not_reproduced: nr, review_notes: [],
  };
}

export function validateStyle(p: StyleProfile): string[] {
  const e: string[] = [];
  if (p?.style_profile_version !== 1) e.push("style_profile_version must be 1");
  const a = p?.apply;
  if (!a) return [...e, "apply missing"];
  if (a.cut.zoom_cut_every_s !== null && !(a.cut.zoom_cut_every_s >= 0.9 && a.cut.zoom_cut_every_s <= 6)) e.push("apply.cut.zoom_cut_every_s must be null or in [0.9, 6]");
  if (!(a.cut.punch_amount >= 0 && a.cut.punch_amount <= 0.15)) e.push("apply.cut.punch_amount must be in [0, 0.15]");
  if (!["bold-word", "classic", "word"].includes(a.captions.preset)) e.push("apply.captions.preset must be bold-word, classic or word");
  if (a.cut.mode !== undefined && !["standard", "none"].includes(a.cut.mode)) e.push("apply.cut.mode must be standard or none");
  if (a.canvas !== undefined && !["1080x1920", "1920x1080", "same-as-source"].includes(a.canvas)) e.push("apply.canvas must be 1080x1920, 1920x1080 or same-as-source");
  if (!(a.captions.font_px >= 48 && a.captions.font_px <= 110)) e.push("apply.captions.font_px must be in [48, 110]");
  if (!["fixed", "intro", "none"].includes(a.headline.mode)) e.push("apply.headline.mode must be fixed, intro or none");
  if (!(a.headline.font_px >= 60 && a.headline.font_px <= 130)) e.push("apply.headline.font_px must be in [60, 130]");
  if (!["Anton", "Inter"].includes(a.headline.font_family)) e.push("apply.headline.font_family must be Anton or Inter");
  if (a.music.enabled && !a.music.mood) e.push("apply.music.mood is required when music is enabled");
  if (!(a.music.below_voice_db >= 6 && a.music.below_voice_db <= 40)) e.push("apply.music.below_voice_db must be in [6, 40]");
  if (!(a.captions.y > 0 && a.captions.y < 1920 && a.headline.y > 0 && a.headline.y < 1920)) e.push("text y must be inside the 1920 px canvas");
  return e;
}

export function loadStyle(path: string): StyleProfile {
  const p = JSON.parse(readFileSync(path, "utf8")) as StyleProfile;
  const e = validateStyle(p);
  if (e.length) throw new Error(`invalid style profile ${path}:\n- ${e.join("\n- ")}`);
  return p;
}

/** Human report (PT-BR): what was measured, what the engine will apply, what it cannot reproduce. */
export function styleReport(p: StyleProfile): string {
  const a = p.apply, m = p.measured as any;
  const o = (k: string) => (p.origin[k] ? ` _(${({ measured: "medido", estimated: "estimado", default: "padrão", reviewed: "revisado", uncertain: "incerto" } as any)[p.origin[k]]})_` : "");
  return [
    `# Perfil de estilo: ${p.name}`, "",
    `Referência: \`${basename(p.source.file)}\` (${p.source.kind}, ${pt(p.source.duration_s)} s, ${p.source.width}x${p.source.height}), sha256 \`${p.source.sha256.slice(0, 12)}…\`. Medido por ${p.measured_by}. Medições, folhas de contato e o guia do editonny: \`${p.measurements_dir}\`.`, "",
    "Só a linguagem de edição entra no perfil. Fala, música, marca, logo, pessoas e promessas da referência ficam de fora.", "",
    "## O que o motor vai aplicar", "",
    `- Ritmo: ${m.pacing ? `${m.pacing.cuts_per_minute} cortes por minuto, ${pt(m.pacing.mean_shot_s, 2)} s por plano na referência` : "não medido"}; ${a.cut.zoom_cut_every_s ? `corte de zoom a cada ~${pt(a.cut.zoom_cut_every_s)} s nas pausas da fala` : "sem cortes extras"}${o("cut.zoom_cut_every_s")}.`,
    `- Zoom: ${a.cut.punch_amount ? `alterna 100/${Math.round(100 + a.cut.punch_amount * 100)} % nos cortes` : "sem zoom alternado"}${o("cut.punch_amount")}.`,
    `- Headline: ${a.headline.mode === "none" ? "sem headline" : `${a.headline.mode === "fixed" ? "fixa no vídeo todo" : "só nos 3 primeiros segundos"}, y ${a.headline.y}, ${a.headline.font_px} px, ${a.headline.font_family}`}${o("headline.mode")}. O texto vem do seu material, nunca da referência.`,
    ...(a.cut.mode === "none" ? ["- Corte: nenhum (contínuo): o vídeo passa inteiro, sem tirar pausa, sem zoom e sem reframe."] : []),
    ...(a.canvas ? [`- Proporção: ${a.canvas === "same-as-source" ? "a do vídeo original" : a.canvas}.`] : []),
    `- Legenda: ${a.captions.enabled ? `${a.captions.preset === "bold-word" ? "palavra que cresce, caixa alta" : a.captions.preset === "word" ? `uma palavra por vez, ${a.captions.font_family ?? "Inter"}${a.captions.font_fallback ? ` (sem o arquivo, ${a.captions.font_fallback})` : ""}, branca com sombra suave` : "clássica"}, y ${a.captions.y}, ${a.captions.font_px} px${a.captions.box ? ", com caixa" : ""}${a.captions.emphasis_color ? `, destaque ${a.captions.emphasis_color}` : ""}` : "sem legenda"}${o("captions.enabled")}.`,
    `- Música: ${a.music.enabled ? `clima ${a.music.mood} da biblioteca, ${a.music.below_voice_db} LU abaixo da voz` : "sem música"}${o("music.enabled")}.`,
    `- Efeitos: ${a.sfx.cut_whoosh ? `whoosh baixo (${a.sfx.gain_db} dB) nas trocas de clipe` : "sem efeitos nas viradas"}${o("sfx.cut_whoosh")}.`,
    "", "## Medido e guardado, mas não aplicado", "",
    `- Paleta: ${m.palette ? `${(m.palette.dominant ?? []).join(", ")}; ${m.palette.temperature ?? "?"}` : "não medida"}.`,
    `- Enquadramento: ${m.framing ? `${m.framing.shot_type ?? "?"}, rosto em ${Math.round(100 * (m.framing.face_pct ?? 0))} % do tempo` : "não medido"}.`,
    `- Volume: ${m.sound?.loudness?.integrated_lufs ?? "?"} LUFS na referência; o motor entrega sempre -14 LUFS.`,
    "", "## O que o perfil não reproduz", "", ...p.not_reproduced.map((x) => `- ${x}`),
    ...(p.review_notes.length ? ["", "## Revisão do agente", "", ...p.review_notes.map((x) => `- ${x}`)] : []),
    ...((m.notes ?? []).length ? ["", "## Avisos da medição", "", ...m.notes.map((x: string) => `- ${x}`)] : []), "",
  ].join("\n");
}

/** Full extract: fetch (links), measure, profile, report. Files go to <project>/editai/. */
export async function extractStyle(input: string, opts: { project: string; name: string }): Promise<{ profile: StyleProfile; path: string; report: string }> {
  const name = slug(opts.name);
  const refDir = appDir(opts.project, "references", name);
  const { file, kind } = await fetchReference(input, refDir);
  const measDir = join(refDir, "measure");
  const { rules, by, notes } = measure(file, measDir);
  const md = rules.metadata ?? {};
  const src = { kind, input: kind === "file" ? resolve(input) : input, file, sha256: sha256(file), duration_s: Number(md.duration_s ?? 0), width: Number(md.width ?? 0), height: Number(md.height ?? 0), fps: Number(md.fps ?? 0) };
  const profile = profileFromRules(rules, src, name, by, measDir, notes);
  const path = stylePath(opts.project, name);
  writeFileSync(path, JSON.stringify(profile, null, 2));
  const report = path.replace(/\.style\.json$/, ".style.md");
  writeFileSync(report, styleReport(profile));
  return { profile, path, report };
}

// ---------------------------------------------------------------------------- apply

type Word = { word: string; start: number; end: number; emphasis?: boolean };

/** Slot values for the talking-head template (they sit between the batch defaults and the item's own slots). */
export function styleSlots(p: StyleProfile): Record<string, unknown> {
  const a = p.apply;
  const s: Record<string, unknown> = {
    caption_preset: a.captions.preset, caption_font_px: a.captions.font_px, caption_y: a.captions.y,
    music_mood: a.music.enabled ? a.music.mood : null, music_below_voice_db: a.music.below_voice_db,
  };
  if (a.headline.mode !== "none") Object.assign(s, { headline_mode: a.headline.mode, text_y: a.headline.y, font_px: a.headline.font_px, headline_line_px: Math.round(a.headline.font_px * 1.07) });
  return s;
}

/** Highest zoom the camera reaches (push end plus every punch), for the protect-region margin. */
function maxZoom(spec: EditSpec): number {
  const push = spec.camera.find((m) => m.type === "push") as any;
  const punch = Math.max(0, ...spec.camera.filter((m) => m.type === "punch_in").map((m: any) => m.amount), spec.transitions?.punch_alternate ?? 0);
  return (push ? Math.max(push.from, push.to) : 1) + punch;
}

/** Where a rectangle declared at zoom 1 lands at zoom z: the same zoompan window as the QA (qa.ts zoomRect). */
function zoomedBand(spec: EditSpec, r: Rect, z: number): [number, number] {
  const H = spec.canvas.height, fy = spec.camera_focus?.y ?? 0.5, wh = H / z;
  const y0 = Math.min(Math.max(fy * H - wh / 2, 0), H - wh);
  return [(r.y - y0) * z, (r.y + r.h - y0) * z];
}

/** Moves a text centre out of the protected rectangles (eyes, mouth) at any zoom, to the nearest side. */
function clearProtected(y: number, h: number, spec: EditSpec): number {
  const regions = spec.protect_regions ?? [];
  if (!regions.length) return y;
  const pad = 20, zs = [1, maxZoom(spec)];
  const bands = regions.map((r: Rect) => {
    const b = zs.map((z) => zoomedBand(spec, r, z));
    return [Math.min(...b.map((x) => x[0])) - pad, Math.max(...b.map((x) => x[1])) + pad] as [number, number];
  }).sort((a, b) => a[0] - b[0]);
  // merge bands with no room for the text between them, then step out of the one the text hits
  const merged: [number, number][] = [];
  for (const [a, b] of bands) { const l = merged[merged.length - 1]; if (l && a <= l[1] + h) l[1] = Math.max(l[1], b); else merged.push([a, b]); }
  for (const [a, b] of merged) {
    if (y + h / 2 > a && y - h / 2 < b) {
      const up = a - h / 2, down = b + h / 2;
      return Math.round(Math.abs(y - up) <= Math.abs(y - down) && up - h / 2 > 0 ? up : down);
    }
  }
  return y;
}

/** Zoom-cut points inside long takes: word gaps near every `every` seconds (never inside a word). */
export function zoomCutPoints(layers: MediaLayer[], words: Word[], every: number): number[] {
  const out: number[] = [];
  for (const l of layers) {
    const s = l.start, e = l.start + l.duration;
    const gaps = words.slice(1).map((w, i) => ({ t: (words[i].end + w.start) / 2 })).map((g) => g.t).filter((t) => t > s + 0.5 && t < e - 0.5);
    let t = s;
    while (e - t > 1.5 * every) {
      const c = gaps.filter((g) => g >= t + 0.6 * every && g <= e - 0.5).sort((a, b) => Math.abs(a - (t + every)) - Math.abs(b - (t + every)))[0];
      if (c === undefined) break;
      out.push(Math.round(c * 1000) / 1000);
      t = c;
    }
  }
  return out;
}

/**
 * What the slots cannot say: captions or headline off, fonts and case, box and
 * emphasis colour, zoom cuts on the reference's rhythm, music off, and text
 * moved out of the eyes and mouth. Returns the log lines for the handoff.
 */
export function applyStyleToSpec(spec: EditSpec, p: StyleProfile): string[] {
  const a = p.apply, log: string[] = [];
  const dropHooks = (...ids: string[]) => { spec.hooks_applied = spec.hooks_applied.filter((h) => !ids.includes(h.hook)); };
  // headline
  const head = spec.texts.find((t) => t.role === "hook");
  if (a.headline.mode === "none") { spec.texts = spec.texts.filter((t) => t.role !== "hook"); dropHooks("text_pop_in", "headline_fixed"); log.push("headline: off (the reference has no fixed text)"); }
  else if (head) {
    head.style.font_family = a.headline.font_family;
    if (a.headline.font_family === "Inter") { head.style.bold = true; head.style.outline_px = Math.max(4, head.style.outline_px ?? 4); }
    if (a.headline.mode === "intro") dropHooks("headline_fixed");
  }
  // captions
  const c = spec.captions;
  if (c && !a.captions.enabled) { delete spec.captions; dropHooks("caption_bold_word", "caption_word_highlight"); log.push("captions: off (the reference has no caption line)"); }
  else if (c && a.captions.preset === "word") {
    // word (2.3.0): one word at a time, white, bold, soft black shadow, no outline and no keyword colour
    const fam = a.captions.font_family ?? "Inter";
    c.preset = "word"; c.max_words = 1; c.highlight_active = false; delete c.emphasis_color; delete c.max_width_px;
    c.style = { font_family: fam, ...(fam !== "Inter" ? { font_fallback: a.captions.font_fallback ?? "Inter" } : {}), font_px: a.captions.font_px, size_basis: "em", bold: true,
      color: a.captions.color ?? "#ffffff", outline_px: 0, shadow_px: 3, shadow_blur: 6, shadow_color: "#000000", shadow_alpha: 0.85, uppercase: a.captions.uppercase };
    spec.hooks_applied = spec.hooks_applied.map((h) => (["caption_bold_word", "caption_word_highlight"].includes(h.hook) ? { hook: "caption_single_word", at: h.at, why: `${p.name}: one word at a time, white with a soft black shadow, ${fam}` } : h));
    log.push(`captions: one word at a time, ${fam}${fam !== "Inter" ? ` (fallback ${a.captions.font_fallback ?? "Inter"} while the file is missing)` : ""}, white with a soft shadow`);
  }
  else if (c) {
    c.style.uppercase = a.captions.uppercase || a.captions.preset === "bold-word";
    c.style.font_family = a.captions.preset === "bold-word" ? "Anton" : "Inter";
    c.style.bold = a.captions.preset === "classic";
    if (a.captions.emphasis_color) { c.emphasis_color = a.captions.emphasis_color; if (a.captions.preset === "classic") c.style.highlight_color = a.captions.emphasis_color; }
    else if (a.captions.preset === "classic") c.style.highlight_color = "#ffd84d";
    if (a.captions.box) { c.style.box = true; c.style.box_color = "#000000"; spec.hooks_applied.push({ hook: "caption_style_box", at: 0, why: `${p.name}: captions on a solid box, as in the reference` }); }
    if (a.captions.preset === "classic") {
      spec.hooks_applied = spec.hooks_applied.map((h) => (h.hook === "caption_bold_word" ? { hook: "caption_word_highlight", at: h.at, why: `${p.name}: classic captions, active word coloured` } : h));
    }
  }
  if (!a.music.enabled && spec.audio.music && !spec.audio.music.path) { delete spec.audio.music; log.push("music: off (no music measured in the reference)"); }
  // pace: zoom cuts on the reference rhythm, alternating across takes and splits
  const takes = spec.layers.filter((l) => l.kind === "video" && !l.rect).sort((x, y) => x.start - y.start);
  const words = c?.words ?? [];
  spec.transitions = { ...(spec.transitions ?? {}), punch_alternate: 0 };
  spec.camera = spec.camera.filter((m) => m.type !== "punch_in");
  dropHooks("punch_in_cut");
  if (a.cut.punch_amount > 0) {
    const splits = a.cut.zoom_cut_every_s ? zoomCutPoints(takes, words, a.cut.zoom_cut_every_s) : [];
    const edges = [...new Set([...takes.map((l) => Math.round(l.start * 1000) / 1000), ...splits])].sort((x, y) => x - y);
    edges.push(spec.duration);
    for (let i = 1; i < edges.length - 1; i += 2) spec.camera.push({ type: "punch_in", at: edges[i], until: edges[i + 1], amount: a.cut.punch_amount });
    splits.slice(0, 6).forEach((t) => spec.hooks_applied.push({ hook: "punch_in_cut", at: t, why: `${p.name}: zoom cut in a speech pause, reference pace ~${a.cut.zoom_cut_every_s} s per shot` }));
    if (!splits.length) spec.hooks_applied.push({ hook: "punch_in_cut", at: takes[1]?.start ?? 0, why: `${p.name}: scale alternates 100/${Math.round(100 + a.cut.punch_amount * 100)}% on the take cuts` });
    log.push(`pace: ${splits.length} zoom cut(s) added inside takes, ${edges.length - 2} switches of ${Math.round(a.cut.punch_amount * 100)}%`);
  } else log.push("pace: no alternating zoom (calm reference); the take cuts of the material stay");
  spec.hooks_applied = spec.hooks_applied.map((h) => h.hook === "smooth_take_cut" ? { ...h, why: `every cut: audio leads 2 frames, 60 ms audio crossfade${a.cut.punch_amount ? `, zoom alternates on the cut frame` : ", no zoom change"}; no image dissolve` } : h);
  // keep text out of the eyes and mouth (the style's y comes from another person's face)
  for (const t of spec.texts) {
    const h = t.style.font_px * 1.35 * t.lines.length + 24;
    const y = clearProtected(t.y, h, spec);
    if (y !== t.y) { log.push(`headline y ${t.y} -> ${y}: the reference position would cover eyes or mouth`); t.y = y; }
  }
  if (spec.captions) {
    const h = spec.captions.style.font_px * 2 + 24; // the active word grows, outline included
    const y = clearProtected(spec.captions.y, h, spec);
    if (y !== spec.captions.y) { log.push(`captions y ${spec.captions.y} -> ${y}: the reference position would cover eyes or mouth`); spec.captions.y = y; }
  }
  if (spec.hooks_applied.length < 2) spec.hooks_applied.push({ hook: "slow_push", at: 0, why: "keeps a locked-off shot alive" });
  (spec.notes ??= []).push(`style profile "${p.name}" (${p.source.kind}: ${basename(p.source.file)}), measured by ${p.measured_by}`);
  return log;
}

/** Copy of the profile next to a run, so the run folder says which style made it. */
export function stampStyle(stylePathIn: string, dir: string): string {
  const to = join(dir, basename(stylePathIn));
  if (resolve(to) !== resolve(stylePathIn)) copyFileSync(stylePathIn, to);
  return to;
}

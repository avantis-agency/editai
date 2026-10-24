// Music and sound-effect libraries of the squad, CC0 items from editonny's library with
// per-item license records. A spec picks them by name instead of by path. Bun only.
//   music: { "mood": "calm" }                 first available track of the mood (deterministic)
//          { "mood": "calm", "track": "calm-ghosts" } or { "path": "@music:calm-ghosts" }
//   sfx:   { "src": "@sfx:whoosh", "anchor": true }   role (whoosh, hit, riser) or first available item of a category
//          { "src": "@sfx:swish-3" }                  one item
// The squad ships a starter kit (assets/music: 2 tracks per mood as AAC 96 kbps; assets/sfx: a
// lean set of original WAVs). `library pull` downloads the rest, the 320 kbps music originals
// included, into the cache in config/library.json (~/.nirvana/cache/editai),
// never into the squad, checking each file against the sha256 in the index.
// A cache left by retention-video-studio (the name before 2.0.0, legacy_cache_dirs) is moved into
// it on first use; whatever cannot be moved is still read from the old folder.
// Track resolution: original in the squad, then original in the cache, then the kit transcode.
// When a role's library item is missing, the role falls back to assets/sfx/*-synth.wav.
//   bun lib/edit-engine/cli.ts library [music|sfx]
//   bun lib/edit-engine/cli.ts library pull [--music] [--sfx] [--only id,id] [--dry-run]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const SQUAD_ROOT = resolve(import.meta.dir, "..", ".."); // same as spec.ts SQUAD_ROOT, kept local to avoid an import cycle
export const MUSIC_DIR = join(SQUAD_ROOT, "assets", "music");
export const SFX_DIR = join(SQUAD_ROOT, "assets", "sfx");

interface KitFile { file: string; sha256: string; codec: string; bitrate_kbps: number; duration_s: number; derived_from_sha256: string }
export interface Track { file: string; title: string; mood: string; author: string; source: string; license: string; duration_s: number; lufs: number; fill_at_s: number; sha256: string; kit?: KitFile }
export interface Effect { file: string; category: string; name: string; author: string; license: string; source: string; anchor_s: number; duration_s: number; sha256: string }
interface MusicIndex { moods: Record<string, string[]>; tracks: Record<string, Track> }
interface SfxIndex { roles: Record<string, { use: string; fallback: string; fallback_anchor_s: number }>; categories: Record<string, string[]>; effects: Record<string, Effect>; kit?: { effects: string[] } }
interface LibraryConfig { source: { raw_base: string; music_dir: string; sfx_dir: string; commit: string; repo: string }; cache_dir: string; legacy_cache_dirs?: string[] }

let mi: MusicIndex | null | undefined, si: SfxIndex | null | undefined, lc: LibraryConfig | null | undefined;
const read = <T>(f: string): T | null => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
export const musicIndex = () => (mi === undefined ? (mi = read<MusicIndex>(join(MUSIC_DIR, "index.json"))) : mi);
export const sfxIndex = () => (si === undefined ? (si = read<SfxIndex>(join(SFX_DIR, "index.json"))) : si);
export const libraryConfig = () => (lc === undefined ? (lc = read<LibraryConfig>(join(SQUAD_ROOT, "config", "library.json"))) : lc);

const LEGACY_CACHE = ["~/.nirvana/cache/retention-video-studio"]; // before 2.0.0, when config/library.json does not say
const expand = (raw: string) => resolve(raw.replace(/^~(?=$|[\\/])/, homedir()));
let cache: string | undefined, legacyCaches: string[] = [];

/** Moves an old cache into the new one: the whole folder when the new one does not exist, else file by file (the new copy wins). */
function moveCache(from: string, to: string): void {
  try {
    if (!existsSync(to)) { mkdirSync(dirname(to), { recursive: true }); renameSync(from, to); return; }
    for (const name of readdirSync(from)) {
      const a = join(from, name), b = join(to, name);
      if (statSync(a).isDirectory()) moveCache(a, b);
      else if (existsSync(b)) rmSync(a, { force: true });
      else renameSync(a, b);
    }
    if (!readdirSync(from).length) rmdirSync(from);
  } catch { /* left in place (another drive, a locked file): still read from there */ }
}

/** Cache of the downloaded originals; refuses a folder inside the squad. On first use, moves the legacy cache into it. */
export function cacheDir(): string {
  if (cache) return cache;
  const cfg = libraryConfig();
  const dir = expand(cfg?.cache_dir ?? "~/.nirvana/cache/editai");
  const rel = relative(SQUAD_ROOT, dir);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel))) throw new Error(`library cache ${dir} is inside the squad; set cache_dir in config/library.json outside it`);
  const legacy = (cfg?.legacy_cache_dirs ?? LEGACY_CACHE).map(expand).filter((d) => d !== dir && existsSync(d));
  for (const d of legacy) moveCache(d, dir);
  legacyCaches = legacy.filter((d) => existsSync(d));
  return (cache = dir);
}

/** A downloaded file in the cache, or in a legacy cache that could not be moved; null when absent. */
const cachedFile = (kind: "music" | "sfx", file: string) => [cacheDir(), ...legacyCaches].map((d) => join(d, kind, file)).find((p) => existsSync(p)) ?? null;

export type Where = "squad" | "cache" | "kit";
/** Where a track can be read from, best first: the original (squad or cache), then the kit transcode. */
export function trackFile(t: Track): { path: string; where: Where } | null {
  const own = join(MUSIC_DIR, t.file), cached = cachedFile("music", t.file);
  if (existsSync(own)) return { path: own, where: "squad" };
  if (cached) return { path: cached, where: "cache" };
  if (t.kit && existsSync(join(MUSIC_DIR, t.kit.file))) return { path: join(MUSIC_DIR, t.kit.file), where: "kit" };
  return null;
}
export function effectFile(e: Effect): { path: string; where: Where } | null {
  const own = join(SFX_DIR, e.file), cached = cachedFile("sfx", e.file);
  if (existsSync(own)) return { path: own, where: "squad" };
  if (cached) return { path: cached, where: "cache" };
  return null;
}

/** Track id for a mood (first available of the mood) or an explicit id; null when unknown or not available. */
export function pickTrack(moodOrId: string, track?: string): { id: string; track: Track; path: string } | null {
  const idx = musicIndex();
  if (!idx) return null;
  const id = track ?? (idx.tracks[moodOrId] ? moodOrId : idx.moods[moodOrId]?.find((i) => idx.tracks[i] && trackFile(idx.tracks[i])));
  const t = id ? idx.tracks[id] : undefined;
  if (!t || (track && t.mood !== moodOrId && idx.moods[moodOrId])) return null;
  const f = trackFile(t);
  return f ? { id: id!, track: t, path: f.path } : null;
}

/** Resolves "@sfx:<role|category|id>" to a file and the second of its audible impact. */
export function pickSfx(name: string): { id: string; path: string; anchor_s: number } | null {
  const idx = sfxIndex();
  const role = idx?.roles[name];
  const ids = role ? [role.use] : idx?.effects[name] ? [name] : idx?.categories[name] ?? [];
  for (const id of ids) {
    const e = idx?.effects[id], f = e ? effectFile(e) : null;
    if (e && f) return { id, path: f.path, anchor_s: e.anchor_s };
  }
  const synth = role?.fallback ?? (["whoosh", "hit", "riser"].includes(name) ? `${name}-synth.wav` : null);
  if (synth && existsSync(join(SFX_DIR, synth))) {
    const anchor = role?.fallback_anchor_s ?? ({ whoosh: 0.3, hit: 0, riser: 1.5 } as Record<string, number>)[name] ?? 0;
    return { id: synth, path: join(SFX_DIR, synth), anchor_s: anchor };
  }
  return null;
}

/** Peak second of a synthesized file referenced by path (old specs that point at *-synth.wav). */
export function synthAnchor(path: string): number | null {
  const m = path.replace(/\\/g, "/").match(/\/(whoosh|hit|riser)-synth\.wav$/i);
  return m ? ({ whoosh: 0.3, hit: 0, riser: 1.5 } as Record<string, number>)[m[1].toLowerCase()] : null;
}

const mark = (w: Where | undefined) => (w === "kit" ? " [kit]" : w === "cache" ? " [cache]" : w === "squad" ? "" : " [pull]");

export function listLibrary(kind?: string): string {
  const out: string[] = [];
  const m = musicIndex(), s = sfxIndex();
  if (!kind || kind === "music") {
    const n = m ? Object.values(m.tracks).filter((t) => trackFile(t)).length : 0;
    out.push(m ? `music (${n} of ${Object.keys(m.tracks).length} tracks here, CC0, assets/music/LICENSES.md; [kit] = AAC 96 kbps starter kit, [pull] = library pull --music)` : "music: assets/music/index.json missing");
    for (const [mood, ids] of Object.entries(m?.moods ?? {})) out.push(`  ${mood.padEnd(11)} ${ids.map((i) => `${i} (${Math.round(m!.tracks[i].duration_s)} s)${mark(trackFile(m!.tracks[i])?.where)}`).join(", ")}`);
  }
  if (!kind || kind === "sfx") {
    const n = s ? Object.values(s.effects).filter((e) => effectFile(e)).length : 0;
    out.push(s ? `sfx (${n} of ${Object.keys(s.effects).length} effects here, CC0, assets/sfx/LICENSES.md; [pull] = library pull --sfx); roles: ${Object.entries(s.roles).map(([r, v]) => `${r} -> ${v.use}`).join(", ")}` : "sfx: assets/sfx/index.json missing (roles fall back to *-synth.wav)");
    for (const [c, ids] of Object.entries(s?.categories ?? {})) out.push(`  ${c.padEnd(14)} ${ids.map((i) => `${i}${mark(effectFile(s!.effects[i])?.where)}`).join(", ")}`);
  }
  return out.join("\n");
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export interface PullItem { kind: "music" | "sfx"; id: string; file: string; url: string; dest: string; sha256: string }
export interface PullResult { cache: string; planned: PullItem[]; done: { id: string; bytes: number }[]; skipped: string[]; failed: { id: string; reason: string }[] }

/** Downloads the library items that have no original here yet (music originals replace the kit transcode). */
export async function pullLibrary(o: { music: boolean; sfx: boolean; only?: string[]; dryRun?: boolean }): Promise<PullResult> {
  const cfg = libraryConfig();
  if (!cfg) throw new Error("config/library.json missing: reinstall the squad");
  const cache = cacheDir(), m = musicIndex(), s = sfxIndex();
  const res: PullResult = { cache, planned: [], done: [], skipped: [], failed: [] };
  const want = (id: string) => !o.only?.length || o.only.includes(id);
  const known = new Set([...Object.keys(m?.tracks ?? {}), ...Object.keys(s?.effects ?? {})]);
  for (const id of o.only ?? []) if (!known.has(id)) res.failed.push({ id, reason: "unknown id (see: cli.ts library)" });
  if (o.music) for (const [id, t] of Object.entries(m?.tracks ?? {})) {
    if (!want(id)) continue;
    const w = trackFile(t)?.where;
    if (w === "squad" || w === "cache") { res.skipped.push(id); continue; }
    res.planned.push({ kind: "music", id, file: t.file, url: `${cfg.source.raw_base}/${cfg.source.music_dir}/${t.file}`, dest: join(cache, "music", t.file), sha256: t.sha256 });
  }
  if (o.sfx) for (const [id, e] of Object.entries(s?.effects ?? {})) {
    if (!want(id)) continue;
    if (effectFile(e)) { res.skipped.push(id); continue; }
    res.planned.push({ kind: "sfx", id, file: e.file, url: `${cfg.source.raw_base}/${cfg.source.sfx_dir}/${e.file}`, dest: join(cache, "sfx", e.file), sha256: e.sha256 });
  }
  if (o.dryRun) return res;
  for (const it of res.planned) {
    try {
      const r = await fetch(it.url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = new Uint8Array(await r.arrayBuffer());
      const got = sha256(body);
      if (got !== it.sha256) throw new Error(`sha256 ${got.slice(0, 12)}… differs from the index ${it.sha256.slice(0, 12)}…; nothing written`);
      mkdirSync(dirname(it.dest), { recursive: true });
      const tmp = `${it.dest}.part`;
      writeFileSync(tmp, body);
      renameSync(tmp, it.dest);
      res.done.push({ id: it.id, bytes: body.length });
    } catch (e) {
      rmSync(`${it.dest}.part`, { force: true });
      res.failed.push({ id: it.id, reason: (e as Error).message });
    }
  }
  return res;
}

// Local review preview for one edit spec: serves the UI in ./preview, the
// rendered MP4 with HTTP Range, a waveform and a filmstrip drawn by ffmpeg, and
// a small JSON API that saves the person's decisions to <name>.feedback.json.
// Bun only (Bun.serve), never node.
//   bun lib/edit-engine/cli.ts preview <spec.json> [--video out.mp4] [--port 4840] [--open]
//   bun lib/edit-engine/cli.ts preview <spec.json> --stop
//
// Adapted from editonny 1.1.0 (commit 08e86fe), engine/helpers/preview_server.py,
// Copyright (c) 2026 Matheus Gomes, MIT License (see preview/LICENSE-editonny.md).
// Same protections as the original (an agent treats every saved click as the
// person speaking):
// - listens on 127.0.0.1 only; the Host header must name this computer and port (blocks DNS rebinding);
// - /api/* and /media/* refuse requests another site started (Sec-Fetch-Site cross-site / same-site);
// - every POST needs the per-run token from /api/state in X-Preview-Token, a matching Origin when one
//   is sent, and JSON of at most 1 MB; the body is read in full before any refusal and the
//   connection is closed after every POST and every error;
// - a GET carrying a body is refused; media is only the one MP4 of this spec (no path in the URL);
// - strips are cached under preview_cache/ with sizes snapped to a grid, at most 2 ffmpeg jobs at once.
// It writes preview_cache/server.json ({status, url, port, pid, spec, video, feedback, started_at})
// so the agent never parses the log.
//
// Mini editor (1.4.0, editor.ts): the page also draws the headline and captions live over a clean base
// layer, saves keyword highlights, undoes the last change, goes back to a version, and asks for a quick
// draft or the final. Those POSTs pass the same checks (token, Host, Origin, Sec-Fetch-Site); the render
// ones take no path: the server only ever renders this session's spec, one job at a time, in a child
// process. Media are the session's own files only: the reviewed MP4, the clean base, and the drafts and
// finals listed in <name>.versions.json, picked by version id.
//
// Editor com IA (1.7.0, live.ts): POST /api/request (text + cursor + selection; a quick command is applied at
// once, anything else waits for the person's own agent) and POST /api/request/undo, with the same checks.
// The request text is data: matched or handed to the agent, never run. The agent's commands (agent-inbox,
// edit-op, agent-reply) reach the server through preview_cache/agent/ (no token in any file).
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { captionGroups } from "./ass.ts";
import { EditorSession, snapshot, type JobKind } from "./editor.ts";
import {
  BadRequest, emptyFeedback, feedbackPathFor, fileSha256, HEADLINE_SIZE_PCT, loadFeedback, nowIso, saveFeedback, styleOfSpec, trimLimits, UNDO_LIMIT,
  validateApproval, validateCaptionEdits, validateEmphasis, validateMarks, validateStyle, validateTrims, videoPathFor, type Feedback, type Section,
} from "./feedback.ts";
import { fontFile } from "./fonts.ts";
import { LiveDesk } from "./live.ts";
import { probe } from "./measure.ts";
import { FONTS_DIR, loadSpec, takes, type EditSpec } from "./spec.ts";

export const DEFAULT_PORT = 4840;
const HOST = "127.0.0.1";
const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);
const TOKEN_HEADER = "x-preview-token";
const MAX_BODY = 1_000_000;
const UI_DIR = resolve(import.meta.dir, "preview");
const STATIC: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.css": ["app.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/api.mjs": ["api.mjs", "text/javascript; charset=utf-8"],
  "/dom.mjs": ["dom.mjs", "text/javascript; charset=utf-8"],
  "/toast.mjs": ["toast.mjs", "text/javascript; charset=utf-8"],
  "/review/view.mjs": ["review/view.mjs", "text/javascript; charset=utf-8"],
  "/review/playback.mjs": ["review/playback.mjs", "text/javascript; charset=utf-8"],
  "/review/timeline.mjs": ["review/timeline.mjs", "text/javascript; charset=utf-8"],
  "/review/marks.mjs": ["review/marks.mjs", "text/javascript; charset=utf-8"],
  "/review/trims.mjs": ["review/trims.mjs", "text/javascript; charset=utf-8"],
  "/review/captions.mjs": ["review/captions.mjs", "text/javascript; charset=utf-8"],
  "/review/approval.mjs": ["review/approval.mjs", "text/javascript; charset=utf-8"],
  "/editor/model.mjs": ["editor/model.mjs", "text/javascript; charset=utf-8"],
  "/editor/overlay.mjs": ["editor/overlay.mjs", "text/javascript; charset=utf-8"],
  "/editor/panel.mjs": ["editor/panel.mjs", "text/javascript; charset=utf-8"],
  "/editor/ai.mjs": ["editor/ai.mjs", "text/javascript; charset=utf-8"],
  "/editor/tracks.mjs": ["editor/tracks.mjs", "text/javascript; charset=utf-8"],
};
/** Fonts the overlay draws with, from assets/fonts (fixed list, never a path from the URL). */
const FONTS = new Set(["Anton", "Inter"].map((f) => fontFile(f)).filter(Boolean) as string[]);
const UNDO_LABEL: Record<Section, string> = {
  marks: "marcações", trims: "ajuste de corte", style: "headline, legenda e som", caption_edits: "correção de palavra",
  approval: "aprovação", emphasis: "palavra em destaque", ops: "pedido",
};
const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'";

/** finalName: name of the final's copy in Downloads (without .mp4); downloads: that folder (default ~/Downloads). */
export interface PreviewOptions { video?: string; port?: number; open?: boolean; verbose?: boolean; finalName?: string; downloads?: string }

const snap = (v: number, step: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v / step) * step));

/** At most `n` ffmpeg strip jobs at once. */
function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => queue.push(r));
    active++;
    try { return await job(); } finally { active--; queue.shift()?.(); }
  };
}

async function ffmpegAsync(args: string[]): Promise<void> {
  const p = Bun.spawn(["ffmpeg", "-y", "-hide_banner", "-nostdin", "-v", "error", ...args], { stdout: "ignore", stderr: "pipe" });
  const err = await new Response(p.stderr).text();
  if ((await p.exited) !== 0) throw new Error(err.slice(-400));
}

export class PreviewSession {
  readonly specPath: string;
  readonly videoPath: string;
  readonly feedbackPath: string;
  readonly cacheDir: string;
  readonly token = randomBytes(24).toString("base64url");
  port = 0;
  private srcDur = new Map<string, number>();
  private strips = new Map<string, Promise<string>>();
  private writeChain: Promise<unknown> = Promise.resolve();
  private stripJobs = limiter(2);
  readonly editor: EditorSession;
  readonly live: LiveDesk;

  constructor(specPath: string, opts: PreviewOptions) {
    this.specPath = resolve(specPath);
    this.videoPath = resolve(opts.video ?? videoPathFor(this.specPath));
    this.feedbackPath = feedbackPathFor(this.specPath);
    this.cacheDir = join(dirname(this.specPath), "preview_cache");
    this.editor = new EditorSession(this.specPath, this.videoPath, this.cacheDir, this.srcDuration, { finalName: opts.finalName, downloads: opts.downloads });
    this.live = new LiveDesk(this);
  }

  spec(): EditSpec { return loadSpec(this.specPath); }

  srcDuration = (src: string): number => {
    let d = this.srcDur.get(src);
    if (d === undefined) { d = probe(src).duration; this.srcDur.set(src, d); }
    return d;
  };

  videoInfo() {
    const st = statSync(this.videoPath);
    return { name: basename(this.videoPath), size: st.size, mtime: st.mtimeMs, sha256: fileSha256(this.videoPath) };
  }

  /** Everything the page draws: the spec as tracks, the current feedback and the token. */
  state() {
    const spec = this.spec();
    const errors: string[] = [];
    let feedback: Feedback | null = null;
    try { feedback = loadFeedback(this.feedbackPath); } catch (e) { errors.push(String((e as Error).message)); }
    const video = this.videoInfo();
    if (feedback && feedback.video_sha256 !== video.sha256) errors.push("o feedback salvo é de outra renderização deste spec");
    const words = spec.captions?.words ?? [];
    let gi = 0;
    const groups = spec.captions ? captionGroups(spec.captions).map((g) => {
      const first = gi; gi += g.length;
      return { first, count: g.length, start: g[0].start, end: g[g.length - 1].end };
    }) : [];
    const m = spec.audio.music;
    return {
      token: this.token,
      spec_file: basename(this.specPath),
      feedback_file: basename(this.feedbackPath),
      video,
      spec: {
        id: spec.id, template: spec.template, duration: spec.duration, fps: spec.canvas.fps,
        width: spec.canvas.width, height: spec.canvas.height,
        takes: takes(spec).map((l) => {
          const lim = trimLimits(spec, l.id, this.srcDuration)!;
          return { id: l.id, start: l.start, end: l.start + l.duration, in: l.in ?? 0, src: basename(l.src), framing: l.framing ?? "",
            limits: { start_min: lim.start_min, start_max: lim.start_max, end_min: lim.end_min, end_max: lim.end_max } };
        }),
        texts: spec.texts.map((t) => ({ id: t.id, role: t.role, lines: t.lines, mode: t.mode ?? null, start: t.start, end: t.end })),
        words: words.map((w, index) => ({ index, word: w.word, start: w.start, end: w.end, emphasis: !!w.emphasis })),
        caption_groups: groups,
        caption_preset: spec.captions?.preset ?? null,
        sfx: spec.audio.sfx.map((s) => ({ at: s.at, hook: s.hook ?? basename(s.src), only_with_music: !!s.only_with_music })),
        music: m ? { name: basename(m.path ?? m.src ?? ""), start: m.start ?? 0, below_voice_db: m.below_voice_db ?? null, gain_db: m.gain_db ?? null } : null,
        hooks: spec.hooks_applied.map((h) => h.hook),
      },
      style_now: styleOfSpec(spec),
      headline_size: HEADLINE_SIZE_PCT,
      feedback,
      editor: this.editor.state(feedback),
      live: this.live.state(feedback),
      errors,
      server_time: Date.now(),
    };
  }

  /** Serialises writes: one change at a time, each on top of the last (the editor com IA uses it too). */
  chain<T>(run: () => T | Promise<T>): Promise<T> {
    const p = this.writeChain.then(run, run);
    this.writeChain = p.catch(() => {});
    return p;
  }

  /**
   * Writes new values for some sections as one revision; with `undoLabel` the old values become one Desfazer step
   * (`req`: the editor com IA request it belongs to).
   */
  commit(fb: Feedback, values: Partial<Record<Section, unknown>>, undoLabel: string | null, req?: string): Feedback {
    const at = nowIso();
    const before: Partial<Record<Section, unknown>> = {};
    for (const [k, v] of Object.entries(values) as [Section, unknown][]) {
      before[k] = (fb as any)[k] ?? (k === "style" || k === "approval" ? null : []);
      (fb as any)[k] = v;
      fb.saved_at[k] = at;
    }
    if (undoLabel) fb.undo = [...(fb.undo ?? []), { label: undoLabel, at, sections: before, ...(req ? { req } : {}) }].slice(-UNDO_LIMIT);
    fb.revision += 1;
    fb.updated_at = at;
    fb.spec_sha256 = fileSha256(this.specPath);
    fb.video_sha256 = fileSha256(this.videoPath);
    fb.history = [...fb.history, ...Object.keys(values).map((section) => ({ revision: fb.revision, section: section as Section, at }))].slice(-200);
    saveFeedback(this.feedbackPath, fb);
    return fb;
  }

  save(section: Section, body: any): Promise<Feedback> {
    return this.chain(() => {
      const spec = this.spec();
      const value =
        section === "marks" ? validateMarks(body, spec)
        : section === "trims" ? validateTrims(body, spec, this.srcDuration)
        : section === "style" ? validateStyle(body)
        : section === "caption_edits" ? validateCaptionEdits(body, spec)
        : section === "emphasis" ? validateEmphasis(body, spec)
        : validateApproval(body, this.editor.approvable());
      const fb = loadFeedback(this.feedbackPath) ?? emptyFeedback(spec, this.specPath, this.videoPath);
      const old = (fb as any)[section] ?? (section === "style" || section === "approval" ? null : []);
      if (JSON.stringify(old) === JSON.stringify(value)) return fb;   // an autosave of the same value is not a change
      const saved = this.commit(fb, { [section]: value }, UNDO_LABEL[section]);
      if (section === "marks") this.editor.writePendingNotes(saved);   // free notes reach the retention-editor at once
      return saved;
    });
  }

  /** Desfazer: puts back the values the last change replaced. */
  undo(): Promise<{ fb: Feedback; label: string }> {
    return this.chain(() => {
      const fb = loadFeedback(this.feedbackPath);
      const last = fb?.undo?.pop();
      if (!fb || !last) throw new BadRequest("Não há nada para desfazer.", 409);
      const saved = this.commit(fb, last.sections, null);
      this.live.undidStep(last.req);
      return { fb: saved, label: last.label };
    });
  }

  /** Voltar a esta versão: the edits a draft or final was made from ("original" = no edits), as one undoable change. */
  restore(version: string): Promise<{ fb: Feedback; label: string }> {
    return this.chain(() => {
      const v = version === "original" ? { label: "Original", sections: snapshot(null) } : this.editor.versions.find((x) => x.id === version);
      if (!v) throw new BadRequest("versão desconhecida", 404);
      const spec = this.spec();
      const fb = loadFeedback(this.feedbackPath) ?? emptyFeedback(spec, this.specPath, this.videoPath);
      const label = `voltar a: ${v.label}`;
      return { fb: this.commit(fb, { ops: [], ...v.sections }, label), label };
    });
  }

  /** Gerar prévia rápida / Finalizar / vídeo limpo: always this session's spec plus its saved feedback. */
  render(kind: JobKind): Promise<{ id: string }> {
    return this.chain(() => {
      const fb = loadFeedback(this.feedbackPath);
      return this.editor.start(kind, fb, fb?.revision ?? 0);
    });
  }

  /**
   * PNG strip cached as preview_cache/<kind>_<video sig>_<params>.png; older versions are removed.
   * `base`: of the clean base video (the Editor tab's tracks follow the cuts), cached as base-<kind>_...
   */
  strip(kind0: "waveform" | "filmstrip", a: number, b: number, base = false): Promise<string> {
    const video = base ? this.editor.baseInfo()?.mp4 : this.videoPath;
    if (!video) return Promise.reject(new Error("o vídeo limpo ainda não existe"));
    const kind = base ? `base-${kind0}` : kind0;
    const st = statSync(video);
    const sig = new Bun.CryptoHasher("sha1").update(`${st.size}:${st.mtimeMs}`).digest("hex").slice(0, 12);
    const out = join(this.cacheDir, `${kind}_${sig}_${a}x${b}.png`);
    const hit = this.strips.get(out);
    if (hit) return hit;
    const job = this.stripJobs(async () => {
      if (existsSync(out) && statSync(out).size > 0) return out;
      mkdirSync(this.cacheDir, { recursive: true });
      const tmp = join(this.cacheDir, `.tmp-${process.pid}-${kind}-${a}x${b}.png`);
      if (kind0 === "waveform") {
        // white on transparent: the page uses it as a CSS mask, time-aligned to the audio length
        await ffmpegAsync(["-i", video, "-filter_complex", `[0:a:0]aformat=channel_layouts=mono,showwavespic=s=${a}x${b}:colors=white:scale=sqrt:draw=full`, "-frames:v", "1", tmp]);
      } else {
        const d = base ? probe(video).duration : this.spec().duration, slot = d / a;
        const tw = Math.max(8, Math.round((b * this.spec().canvas.width) / this.spec().canvas.height));
        await ffmpegAsync(["-ss", (slot / 2).toFixed(4), "-i", video, "-map", "0:v:0",
          "-vf", `tpad=stop_mode=clone:stop_duration=${slot.toFixed(4)},fps=fps=${a}/${d.toFixed(6)}:round=near,scale=${tw}:${b}:flags=area,tile=${a}x1:padding=0:color=0x0c0d10`, "-frames:v", "1", tmp]);
      }
      writeFileSync(out, readFileSync(tmp));
      rmSync(tmp, { force: true });
      for (const f of readdirSync(this.cacheDir)) if (f.startsWith(`${kind}_`) && !f.startsWith(`${kind}_${sig}_`)) rmSync(join(this.cacheDir, f), { force: true });
      return out;
    });
    this.strips.set(out, job);
    job.catch(() => this.strips.delete(out));
    return job;
  }

  writeServerInfo(info: Record<string, unknown>): void {
    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(join(this.cacheDir, "server.json"), JSON.stringify({ ...info, updated_at: nowIso() }, null, 2) + "\n", "utf8");
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function json(status: number, obj: unknown, close = false): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(close || status >= 400 ? { Connection: "close" } : {}) },
  });
}
const fail = (status: number, error: string) => json(status, { ok: false, error }, true);

function sameToken(given: string, token: string): boolean {
  const a = Buffer.from(given), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeHandler(s: PreviewSession) {
  const hostOk = (req: Request) => {
    const host = (req.headers.get("host") ?? "").trim().toLowerCase();
    if (!host) return false;
    const m = host.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
    if (!m) return false;
    if (m[2] && m[2] !== String(s.port)) return false;
    return LOOPBACK_NAMES.has(m[1]);
  };
  const originOk = (req: Request) => {
    const origin = req.headers.get("origin");
    return origin === null || origin === `http://${req.headers.get("host") ?? ""}`;
  };
  const siteOk = (req: Request) => !["cross-site", "same-site"].includes((req.headers.get("sec-fetch-site") ?? "").trim().toLowerCase());

  async function get(req: Request, url: URL): Promise<Response> {
    const len = req.headers.get("content-length");
    if ((len && len !== "0") || req.headers.get("transfer-encoding")) return fail(400, "pedido inválido");
    if (!hostOk(req)) return fail(403, "Host não permitido");
    const route = url.pathname;
    if ((route.startsWith("/api/") || route.startsWith("/media/")) && !siteOk(req)) return fail(403, "o pedido veio de outro site");
    if (STATIC[route]) {
      const [name, type] = STATIC[route];
      const path = join(UI_DIR, name);
      if (!existsSync(path)) return fail(404, `arquivo da interface ausente: preview/${name}`);
      const extra: Record<string, string> = name === "index.html"
        ? { "Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } : {};
      return new Response(Bun.file(path), { headers: { "Content-Type": type, "Cache-Control": "no-store", ...extra } });   // no-store: a squad update never leaves an old page in the cache
    }
    if (route === "/favicon.ico") return new Response(null, { status: 204 });
    if (route === "/api/health") return json(200, { ok: true, spec: s.specPath });
    if (route === "/api/state") return json(200, s.state());
    if (route === "/media/video") return media(req, s.videoPath);
    if (route === "/media/base") {
      const b = s.editor.baseInfo();
      return b ? media(req, b.mp4) : fail(404, "o vídeo limpo ainda não existe");
    }
    if (route === "/media/version") {
      const p = s.editor.versionPath(url.searchParams.get("id") ?? "");
      return p ? media(req, p) : fail(404, "versão desconhecida");
    }
    if (route.startsWith("/fonts/")) {
      const name = route.slice(7);
      if (!FONTS.has(name)) return fail(404, "não encontrado");
      return new Response(Bun.file(join(FONTS_DIR, name)), { headers: { "Content-Type": "font/ttf", "Cache-Control": "max-age=86400", "X-Content-Type-Options": "nosniff" } });
    }
    if (route === "/api/waveform" || route === "/api/filmstrip") {
      const q = (k: string, d: number) => { const v = Number(url.searchParams.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
      try {
        const base = url.searchParams.get("src") === "base";
        const png = route === "/api/waveform"
          ? await s.strip("waveform", snap(q("w", 2000), 250, 500, 4000), snap(q("h", 104), 8, 16, 256), base)
          : await s.strip("filmstrip", snap(q("n", 40), 4, 4, 160), snap(q("h", 96), 16, 32, 192), base);
        return new Response(Bun.file(png), { headers: { "Content-Type": "image/png", "Cache-Control": url.searchParams.get("v") ? "private, max-age=31536000, immutable" : "no-cache" } });
      } catch (e) {
        console.error(`[preview] strip failed: ${(e as Error).message}`);
        return fail(422, "não foi possível gerar a imagem");
      }
    }
    return fail(404, "não encontrado");
  }

  function media(req: Request, path: string): Response {
    if (!existsSync(path)) return fail(404, "vídeo não encontrado");
    const st = statSync(path), size = st.size;
    const etag = `"${size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
    const common: Record<string, string> = {
      "Content-Type": "video/mp4", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "Accept-Ranges": "bytes", ETag: etag, "Last-Modified": new Date(st.mtimeMs).toUTCString(), "Cache-Control": "no-cache",
    };
    const range = req.headers.get("range"), ifRange = req.headers.get("if-range");
    let start = 0, end = size - 1, status = 200;
    if (range && (!ifRange || ifRange === etag)) {
      const m = range.split(",")[0].trim().match(/^bytes=(\d*)-(\d*)$/);
      const bad = () => new Response(JSON.stringify({ ok: false, error: "intervalo inválido" }), { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes", Connection: "close" } });
      if (!m || (m[1] === "" && m[2] === "")) return bad();
      if (m[1] === "") { const suffix = Number(m[2]); if (!suffix) return bad(); start = Math.max(0, size - suffix); }
      else { start = Number(m[1]); if (m[2] !== "") end = Math.min(Number(m[2]), size - 1); }
      if (start >= size || start > end) return bad();
      status = 206;
    }
    const headers: Record<string, string> = { ...common, "Content-Length": String(end - start + 1) };
    if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(req.method === "HEAD" ? null : Bun.file(path).slice(start, end + 1), { status, headers });
  }

  async function post(req: Request, url: URL): Promise<Response> {
    if (req.headers.get("transfer-encoding")) return fail(400, "envie o corpo com Content-Length");
    const length = Number(req.headers.get("content-length") ?? 0);
    if (!Number.isInteger(length) || length < 0) return fail(400, "Content-Length inválido");
    if (length > MAX_BODY) return fail(413, "corpo grande demais");
    const raw = length ? new Uint8Array(await req.arrayBuffer()) : new Uint8Array(); // read it all before any refusal
    if (!hostOk(req) || !originOk(req) || !siteOk(req)) return fail(403, "origem não permitida");
    if (!sameToken(req.headers.get(TOKEN_HEADER) ?? "", s.token)) return fail(403, "token da prévia inválido; recarregue a página");
    if ((req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") return fail(415, "envie JSON (Content-Type: application/json)");
    if (!raw.length || raw.length > MAX_BODY) return fail(400, "corpo vazio ou grande demais");
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); } catch { return fail(400, "JSON inválido"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "o corpo precisa ser um objeto JSON");
    try {
      if (url.pathname === "/api/undo") {
        const { fb, label } = await s.undo();
        return json(200, { ok: true, revision: fb.revision, undone: label }, true);
      }
      if (url.pathname === "/api/restore") {
        const version = typeof (body as any).version === "string" ? (body as any).version : "";
        const { fb, label } = await s.restore(version);
        return json(200, { ok: true, revision: fb.revision, restored: label }, true);
      }
      if (url.pathname === "/api/request") return json(200, { ok: true, request: await s.live.submit(body) }, true);
      if (url.pathname === "/api/request/undo") return json(200, { ok: true, message: await s.live.undo(body) }, true);
      const kind = ({ "/api/render/base": "base", "/api/render/draft": "draft", "/api/render/final": "final" } as Record<string, JobKind>)[url.pathname];
      if (kind) return json(202, { ok: true, ...(await s.render(kind)) }, true);
    } catch (e) {
      if (e instanceof BadRequest) return fail(e.status, e.message);
      console.error(`[preview] POST ${url.pathname}: ${(e as Error).message}`);
      return fail(500, "erro interno");
    }
    const section = ({ "/api/marks": "marks", "/api/trims": "trims", "/api/style": "style", "/api/captions": "caption_edits", "/api/approve": "approval", "/api/emphasis": "emphasis" } as Record<string, Section>)[url.pathname];
    if (!section) return fail(404, "não encontrado");
    try {
      const fb = await s.save(section, body);
      return json(200, { ok: true, file: basename(s.feedbackPath), revision: fb.revision, saved: (fb as any)[section], saved_at: fb.saved_at[section] }, true);
    } catch (e) {
      if (e instanceof BadRequest) return fail(e.status, e.message);
      console.error(`[preview] POST ${url.pathname}: ${(e as Error).message}`);
      return fail(500, "erro interno ao salvar");
    }
  }

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    try {
      if (req.method === "GET" || req.method === "HEAD") return await get(req, url);
      if (req.method === "POST") return await post(req, url);
      return fail(405, "método não permitido");
    } catch (e) {
      console.error(`[preview] ${req.method} ${url.pathname}: ${(e as Error).message}`);
      return fail(500, "erro interno");
    }
  };
}

function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? ["cmd", "/c", "start", "", url] : process.platform === "darwin" ? ["open", url] : ["xdg-open", url];
  try { Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" }); } catch { /* the URL is printed anyway */ }
}

async function answering(port: number): Promise<string | null> {
  try {
    const r = await fetch(`http://${HOST}:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    const j = (await r.json()) as { ok?: boolean; spec?: string };
    return j.ok ? j.spec ?? null : null;
  } catch { return null; }
}

/** Starts the server and resolves once it listens. Stop with Ctrl+C or `preview <spec> --stop`. */
export async function startPreview(specPath: string, opts: PreviewOptions = {}) {
  const s = new PreviewSession(specPath, opts);
  if (!existsSync(s.specPath)) throw new Error(`spec not found: ${s.specPath}`);
  if (!existsSync(s.videoPath)) throw new Error(`video not found: ${s.videoPath} (render the spec first or pass --video)`);
  if (!existsSync(join(UI_DIR, "index.html"))) throw new Error(`preview UI missing in ${UI_DIR}`);
  s.spec();                         // fails early on an unreadable spec
  const handler = makeHandler(s);
  const first = opts.port ?? DEFAULT_PORT;
  let server: ReturnType<typeof Bun.serve> | null = null;
  for (let port = first; port < first + 20 && !server; port++) {
    try {
      s.port = port;
      server = Bun.serve({ hostname: HOST, port, fetch: handler, idleTimeout: 60 });
    } catch (e) {
      const other = await answering(port);
      if (other && resolve(other) === s.specPath) {
        const url = `http://${HOST}:${port}`;
        console.log(`A prévia deste spec já está aberta em ${url}`);
        if (opts.open) openBrowser(url);
        return { url, reused: true, stop: async () => {} };
      }
      if (!/in use|EADDRINUSE|EACCES/i.test(String((e as Error).message))) {
        s.writeServerInfo({ status: "error", error: String((e as Error).message), spec: s.specPath });
        throw e;
      }
    }
  }
  if (!server) {
    const msg = `as portas ${first} a ${first + 19} estão ocupadas; use --port`;
    s.writeServerInfo({ status: "error", error: msg, spec: s.specPath });
    throw new Error(msg);
  }
  const url = `http://${HOST}:${s.port}`;
  const info = { status: "running", url, host: HOST, port: s.port, pid: process.pid, spec: s.specPath, video: s.videoPath,
    feedback: s.feedbackPath, started_at: nowIso() };
  s.writeServerInfo(info);
  s.live.start();
  console.log(`Prévia rodando em ${url}${s.port !== first ? ` (porta ${first} estava ocupada)` : ""}`);
  console.log(`Spec: ${s.specPath}\nVídeo: ${s.videoPath}\nFeedback: ${s.feedbackPath}\nPare com Ctrl+C.`);
  if (opts.open) setTimeout(() => openBrowser(url), 300);
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    s.live.close();
    s.editor.kill();
    server!.stop(true);
    s.writeServerInfo({ ...info, status: "stopped" });
    console.log("Prévia parada.");
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop().then(() => process.exit(0)); });
  return { url, reused: false, stop, session: s };
}

/** Stops the preview recorded in preview_cache/server.json of this spec. */
export async function stopPreview(specPath: string): Promise<string> {
  const file = join(dirname(resolve(specPath)), "preview_cache", "server.json");
  if (!existsSync(file)) return "nenhuma prévia registrada para este spec";
  const info = JSON.parse(readFileSync(file, "utf8"));
  if (info.status !== "running") return `a prévia já está ${info.status}`;
  if (typeof info.pid === "number" && info.pid !== process.pid) {
    // the whole tree: a mini-editor render runs in a child process with its own ffmpeg
    if (process.platform === "win32") Bun.spawnSync(["taskkill", "/PID", String(info.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    else try { process.kill(info.pid); } catch { /* already gone */ }
  }
  for (let i = 0; i < 25 && (await answering(info.port)); i++) await Bun.sleep(200);
  if (await answering(info.port)) return `a porta ${info.port} ainda responde; pare o processo ${info.pid} à mão`;
  writeFileSync(file, JSON.stringify({ ...info, status: "stopped", updated_at: nowIso() }, null, 2) + "\n", "utf8");
  return `prévia parada (pid ${info.pid}, porta ${info.port})`;
}

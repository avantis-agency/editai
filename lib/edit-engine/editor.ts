// Mini editor (1.4.0): the server side of the preview page's "ver a mudança na hora",
// "Gerar prévia rápida", "Finalizar", undo and version history. Bun only.
//
// - Live view: the player shows a clean base layer of the spec (rendered without headline and
//   captions, preview_cache/base-<sig>.mp4) and the page draws the text on top. overlaySpec() hands
//   the page the spec's text and words with the saved take trims already applied; the page applies
//   the text choices itself while the person types.
// - Renders run one at a time in a child process (editor-job.ts), so the server keeps answering;
//   the page polls /api/state for the stage and the frame count of the picture pass.
// - Every draft and final is a new file next to the spec (<id>-draftN, <id>-finalN), listed in
//   <name>.versions.json with the edits it was made from. Nothing is overwritten.
// - Only the session spec is ever rendered; the page never sends a path.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { applyToSpec, pendingMarkdown } from "./apply-feedback.ts";
import { BadRequest, fileSha256, nowIso, type EmphasisEdit, type Feedback } from "./feedback.ts";
import type { EditOp } from "./live-ops.ts";
import { familyOf, vMetrics } from "./fonts.ts";
import { draftSize } from "./canvas.ts";
import type { QaReport } from "./qa.ts";
import { loadSpec, resolveSpec, validateSpec, type EditSpec } from "./spec.ts";

/** Quick draft: half the canvas (540x960 for 9:16; 960x540 for 16:9, 2.3.0), veryfast. */
export const DRAFT = { width: 540, height: 960, preset: "veryfast", crf: 26 } as const;
export const draftFor = (c: { width: number; height: number }) => ({ ...DRAFT, ...draftSize(c) });

export type JobKind = "base" | "draft" | "final";
export type Snapshot = { trims: Feedback["trims"]; style: Feedback["style"]; caption_edits: Feedback["caption_edits"]; emphasis: EmphasisEdit[]; ops?: EditOp[] };

export interface Version {
  id: string;                 // draft1, final2 (the name the page uses)
  kind: "draft" | "final";
  n: number;
  label: string;              // Prévia 1, Final 2
  spec: string;               // file names next to the session spec
  mp4: string;
  sha256: string;
  edit_key: string;
  created_at: string;
  seconds: number;
  width: number;
  height: number;
  sections: Snapshot;         // the edits it was made from ("voltar a esta versão" restores them)
  qa?: { verdict: string; problems: string[]; report: string };
  download?: string | null;   // full path of the copy in Downloads
  download_error?: string;
}

/** Status file the child process writes (atomic). */
export interface JobStatus {
  kind: JobKind; id: string; started_at: string; stage: string; lo: number; hi: number;
  progress_file: string | null; frames: number; done: boolean; ok: boolean; error?: string;
  result?: { mp4: string; spec: string; sha256: string; seconds: number; width: number; height: number;
    qa?: { verdict: string; problems: string[]; report: string }; download?: string | null; download_error?: string;
    base?: { sig: string; mp4: string } };
}

export const STAGE_PT: Record<string, string> = {
  prepare: "Preparando", music: "Medindo a voz e a música", audio: "Montando o áudio", picture: "Desenhando a imagem",
  loudness: "Ajustando o volume final", frame: "Salvando um quadro", qa: "Conferindo o vídeo (QA completo)",
  copy: "Copiando para Downloads", base: "Atualizando o vídeo limpo",
};
const KIND_PT: Record<JobKind, string> = { base: "Preparando o vídeo limpo", draft: "Gerando a prévia rápida", final: "Gerando o vídeo final" };

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

/** Key of what a render would show: the applied spec (notes never change the picture or the sound). */
export function editKey(spec: EditSpec): string {
  const { notes: _n, id: _i, ...rest } = spec as EditSpec & Record<string, unknown>;
  return sha1(JSON.stringify(rest)).slice(0, 16);
}

/** Key of the picture timing only (takes, camera, length): the clean base matches the overlay when this matches. */
export function baseSig(spec: EditSpec): string {
  const parts: unknown[] = [spec.canvas, spec.duration, spec.layers, spec.camera, spec.camera_focus, spec.flashes, spec.transitions];
  if (spec.broll) parts.push(spec.broll.mode, spec.broll.items, spec.broll.marks ?? []); // B-roll is in the picture (2.1.0)
  if (spec.reframe) parts.push(spec.reframe.mode, spec.reframe.layout ?? "fill", spec.reframe.band_px ?? null, spec.reframe.band_style ?? null, spec.reframe.dead_zone ?? null); // reframe is in the picture (2.2.0)
  return sha1(JSON.stringify(parts)).slice(0, 12);
}

export function snapshot(fb: Feedback | null): Snapshot {
  return { trims: fb?.trims ?? [], style: fb?.style ?? null, caption_edits: fb?.caption_edits ?? [], emphasis: fb?.emphasis ?? [], ops: fb?.ops ?? [] };
}

/** "loja-vestido-v2" -> "Loja - vestido - final v1.mp4"; a custom name (from the command line) wins. */
export function downloadName(specId: string, n: number, custom?: string): string {
  const clean = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  if (custom && clean(custom)) return `${clean(custom).replace(/\.mp4$/i, "")}.mp4`;
  const parts = specId.replace(/-v\d+$/i, "").split("-").filter(Boolean);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const who = cap(parts[0] ?? "video"), rest = parts.slice(1).join(" ");
  return clean(`${who}${rest ? ` - ${rest}` : ""} - final v${n}.mp4`);
}

/** A path in `dir` that does not exist yet: "name.mp4", "name (2).mp4", ... */
export function freePath(dir: string, name: string): string {
  const stem = name.replace(/\.mp4$/i, "");
  for (let i = 1; ; i++) {
    const p = join(dir, i === 1 ? `${stem}.mp4` : `${stem} (${i}).mp4`);
    if (!existsSync(p)) return p;
  }
}

const QA_PT: [RegExp, string][] = [
  [/^codec_h264$/, "o vídeo não saiu em H.264 yuv420p"],
  [/^resolution$/, "a resolução não é a do spec"],
  [/^frame_rate$/, "a taxa de quadros não é a do spec"],
  [/^duration$/, "a duração não bate com o spec"],
  [/^no_black_frames$/, "há quadro preto entre takes"],
  [/^safe_zone_/, "um texto entra na área de botões ou legenda do app"],
  [/^protect_/, "um texto cobre os olhos ou a boca"],
  [/^text_rendered_/, "um texto não apareceu no vídeo"],
  [/^font_size_captions$/, "a fonte da legenda ficou pequena demais para ler"],
  [/^font_size_/, "a fonte da headline ficou pequena demais para ler"],
  [/^line_count_/, "a headline tem linhas demais"],
  [/^line_length_/, "uma linha da headline está comprida (mais de 32 letras)"],
  [/^contrast_/, "o texto não tem contorno ou caixa suficiente para ler"],
  [/^dwell_/, "a headline fica pouco tempo na tela para ser lida"],
  [/^text_exact_/, "o texto não é igual ao da nota de origem"],
  [/^caption_group_size$/, "a legenda mostra palavras demais de uma vez"],
  [/^no_ghost_dissolve$/, "há dissolve entre takes iguais (rosto fantasma)"],
  [/^jcut_word_tail$/, "um corte pega o fim de uma palavra"],
  [/^audio_present$/, "o vídeo não tem áudio"],
  [/^loudness_integrated$/, "o volume final não ficou em -14 LUFS"],
  [/^true_peak$/, "o pico do áudio passou do limite"],
  [/^music_below_voice$/, "a música não ficou na distância pedida da voz"],
  [/^music_ducking$/, "a música não abaixa o suficiente quando ela fala"],
  [/^audio_length$/, "o áudio não tem o tamanho do vídeo"],
  [/^hooks_from_catalog$/, "o spec cita ganchos fora do catálogo"],
  [/^alignment_declared$/, "o spec não declara a intenção de texto, imagem e som"],
  [/^frame_png$/, "o quadro PNG não foi gerado"],
];

/** Failed QA checks in Portuguese, blocking ones first, with the measured detail in parentheses. */
export function qaProblemsPt(r: QaReport): string[] {
  const failed = r.checks.filter((c) => !c.pass && !c.info).sort((a, b) => Number(b.blocking) - Number(a.blocking));
  return failed.map((c) => {
    const pt = QA_PT.find(([re]) => re.test(c.id))?.[1] ?? c.id;
    return `${c.blocking ? "Bloqueia" : "Atenção"}: ${pt} (${c.detail})`;
  });
}

function writeJsonAtomic(path: string, obj: unknown): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

export interface EditorOptions { finalName?: string; downloads?: string }

interface RunningJob { kind: JobKind; id: string; statusFile: string; started: number; pid: number; frames: number; snapshot: Snapshot; editKey: string; n: number; rev: number; proc: ReturnType<typeof Bun.spawn> }
/** What a finished render tells the editor com IA (live.ts): the feedback revision it was made from. */
export interface JobDone { kind: JobKind; ok: boolean; version?: string; rev: number; message: string }

export class EditorSession {
  readonly versionsPath: string;
  readonly baseInfoPath: string;
  readonly jobsDir: string;
  readonly outDir: string;
  readonly downloads: string;
  versions: Version[] = [];
  job: RunningJob | null = null;
  lastJob: { kind: JobKind; ok: boolean; message: string; version?: string; at: string } | null = null;
  private baseSpecCache: { key: string; spec: EditSpec } | null = null;
  /** Called after every render ends (editor com IA: requests waiting for their quick draft). */
  onFinish: ((d: JobDone) => void) | null = null;

  constructor(
    readonly specPath: string, readonly videoPath: string, readonly cacheDir: string,
    readonly srcDuration: (src: string) => number, readonly opts: EditorOptions = {},
  ) {
    this.outDir = dirname(specPath);
    const name = basename(specPath).replace(/(\.plan)?\.spec\.json$/i, "").replace(/\.json$/i, "");
    this.versionsPath = join(this.outDir, `${name}.versions.json`);
    this.baseInfoPath = join(cacheDir, "base.json");
    this.jobsDir = join(cacheDir, "jobs");
    this.downloads = resolve(opts.downloads ?? join(homedir(), "Downloads"));
    if (existsSync(this.versionsPath)) this.versions = JSON.parse(readFileSync(this.versionsPath, "utf8")).versions ?? [];
  }

  /** The session spec as loaded (cached by mtime). */
  base(): EditSpec {
    const st = statSync(this.specPath);
    const key = `${st.size}:${st.mtimeMs}`;
    if (this.baseSpecCache?.key !== key) this.baseSpecCache = { key, spec: loadSpec(this.specPath) };
    return structuredClone(this.baseSpecCache.spec);
  }

  applied(fb: Feedback | null): ReturnType<typeof applyToSpec> {
    return applyToSpec(this.base(), (fb ?? {}) as Feedback, this.srcDuration);
  }

  currentKey(fb: Feedback | null): string { return editKey(this.applied(fb).spec); }
  originalKey(): string { return editKey(this.base()); }

  /**
   * The spec the page draws on: take trims and the editor com IA operations applied (cuts, zooms, caption
   * size and position), text choices not (the page applies those live).
   */
  overlayBase(fb: Feedback | null): EditSpec {
    const tagged = this.base();
    tagged.captions?.words.forEach((w, i) => { (w as typeof w & { src_index: number }).src_index = i; });
    return applyToSpec(tagged, { trims: fb?.trims ?? [], ops: fb?.ops ?? [] } as Feedback, this.srcDuration).spec;
  }

  /** The current video as a resolved spec, every saved change applied; caption words keep src_index. */
  liveSpec(fb: Feedback | null): EditSpec {
    const tagged = this.base();
    tagged.captions?.words.forEach((w, i) => { (w as typeof w & { src_index: number }).src_index = i; });
    return resolveSpec(applyToSpec(tagged, (fb ?? {}) as Feedback, this.srcDuration).spec);
  }

  overlaySpec(fb: Feedback | null) {
    const s = this.overlayBase(fb);
    const hook = s.texts.find((t) => t.role === "hook") ?? null;
    const c = s.captions ?? null;
    // the family each style really renders with (2.3.0: a user font, or its fallback while the file is missing)
    const used = (st?: { font_family?: string; font_used?: string }) => (st ? familyOf(st) : "Inter");
    const families = new Set<string>([used(hook?.style), used(c?.style), "Anton", "Inter"]);
    const fonts: Record<string, unknown> = {};
    for (const f of families) { const m = vMetrics(f); if (m) fonts[f] = { ...m, url: m.user ? `/fonts/user/${encodeURIComponent(m.file)}` : `/fonts/${m.file}` }; }
    return {
      sig: baseSig(s), canvas: s.canvas, duration: s.duration, fonts,
      hook: hook ? { id: hook.id, lines: hook.lines, mode: hook.mode ?? null, start: hook.start, end: hook.end, x: hook.x, y: hook.y,
        animation: hook.animation, max_width_px: hook.max_width_px ?? null, highlight_words: hook.highlight_words ?? [], style: { ...hook.style, font_family: used(hook.style) } } : null,
      captions: c ? { preset: c.preset ?? "classic", y: c.y, x: s.canvas.width / 2, max_words: c.max_words, highlight_active: c.highlight_active !== false,
        emphasis_color: c.emphasis_color ?? null, pop_scale: c.pop_scale ?? 114, windows: resolveSpec(structuredClone(s)).captions?.windows ?? null, max_width_px: c.max_width_px ?? Math.round(s.canvas.width * 0.8), style: { ...c.style, font_family: used(c.style) },
        words: c.words.map((w) => ({ i: (w as typeof w & { src_index: number }).src_index, word: w.word, start: w.start, end: w.end, emphasis: !!w.emphasis })) } : null,
    };
  }

  baseInfo(): { sig: string; mp4: string } | null {
    if (!existsSync(this.baseInfoPath)) return null;
    const b = JSON.parse(readFileSync(this.baseInfoPath, "utf8"));
    return b?.mp4 && existsSync(b.mp4) ? b : null;
  }

  versionPath(id: string): string | null {
    if (id === "original") return this.videoPath;
    const v = this.versions.find((x) => x.id === id);
    return v ? join(this.outDir, v.mp4) : null;
  }

  /** pending-notes.md next to the spec, for the current feedback (also rewritten by every draft and final). */
  writePendingNotes(fb: Feedback): string {
    const base = this.base();
    const { spec, applied, pending } = this.applied(fb);
    const path = join(this.outDir, "pending-notes.md");
    spec.id = `${base.id} (mudanças atuais)`;
    writeFileSync(path, pendingMarkdown(fb, base, spec, applied, pending, this.specPath, "sai na próxima prévia rápida ou no final"), "utf8");
    return path;
  }

  /** Every video of the session the person can approve, with its edit key. */
  approvable(): { sha256: string; version: string; edit_key: string }[] {
    return [{ sha256: fileSha256(this.videoPath), version: "original", edit_key: this.originalKey() },
      ...this.versions.map((v) => ({ sha256: v.sha256, version: v.id, edit_key: v.edit_key }))];
  }

  finalizeBlock(fb: Feedback | null): string | null {
    if (this.job) return "Espere o vídeo que está sendo gerado terminar.";
    const a = fb?.approval;
    if (!a?.approved) return "Aprove uma versão antes de finalizar.";
    if (!a.edit_key) return "A aprovação é de antes do mini editor. Aprove de novo.";
    if (a.edit_key !== this.currentKey(fb)) return "Você mudou algo depois de aprovar. Gere uma prévia rápida e aprove de novo, ou volte à versão aprovada.";
    return null;
  }

  nextDownloadName(): string {
    const n = this.versions.filter((v) => v.kind === "final").length + 1;
    return downloadName(this.base().id, n, this.opts.finalName);
  }

  /** Progress of the running job for the page. */
  jobState() {
    const j = this.job;
    if (!j) return null;
    let st: JobStatus | null = null;
    try { st = JSON.parse(readFileSync(j.statusFile, "utf8")); } catch { /* not written yet */ }
    let frac = 0;
    if (st?.progress_file && existsSync(st.progress_file)) {
      const m = [...readFileSync(st.progress_file, "utf8").matchAll(/^frame=(\d+)/gm)].pop();
      if (m && st.frames) frac = Math.min(1, Number(m[1]) / st.frames);
    }
    const pct = st ? Math.round(st.lo + (st.hi - st.lo) * frac) : 0;
    return { kind: j.kind, id: j.id, label: KIND_PT[j.kind], stage: st?.stage ?? "prepare", stage_pt: STAGE_PT[st?.stage ?? "prepare"] ?? st?.stage,
      percent: Math.max(1, Math.min(99, pct)), elapsed_s: Math.round((Date.now() - j.started) / 1000) };
  }

  /** Starts a render of the session spec. Throws BadRequest (409) when one is already running. */
  start(kind: JobKind, fb: Feedback | null, feedbackRevision = 0): { id: string } {
    if (this.job) throw new BadRequest("Já tem um vídeo sendo gerado. Espere terminar.", 409);
    if (kind === "final") { const why = this.finalizeBlock(fb); if (why) throw new BadRequest(why, 409); }
    const base = this.base();
    mkdirSync(this.jobsDir, { recursive: true });
    const overlay = this.overlayBase(fb);
    const sig = baseSig(overlay);
    const baseJob = (s: EditSpec) => {
      const plan = structuredClone(s);
      plan.id = `${base.id}-base-${sig}`;
      delete plan.captions?.group_font_px;
      return { plan, mp4: join(this.cacheDir, `base-${sig}.mp4`) };
    };
    let id: string, n = 0, label: string, plan: EditSpec, mp4: string, key = "", also: { plan: EditSpec; mp4: string } | null = null;
    if (kind === "base") {
      ({ plan, mp4 } = baseJob(overlay));
      id = plan.id; label = "base";
    } else {
      const { spec, applied, pending } = this.applied(fb);
      key = editKey(spec);
      n = Math.max(0, ...this.versions.filter((v) => v.kind === kind).map((v) => v.n)) + 1;
      while (existsSync(join(this.outDir, `${base.id}-${kind}${n}.mp4`))) n++;
      id = `${base.id}-${kind}${n}`;
      label = `${kind}${n}`;
      plan = spec;
      plan.id = id;
      plan.notes = [...(plan.notes ?? []), `mini editor: ${kind === "draft" ? "quick draft" : "final"} from ${base.id} (feedback revision ${feedbackRevision}): ${applied.length} change(s) applied, ${pending.length} pending`];
      mp4 = join(this.outDir, `${id}.mp4`);
      if (fb) writeFileSync(join(this.outDir, "pending-notes.md"), pendingMarkdown(fb, base, plan, applied, pending, this.specPath, join(this.outDir, `${id}.plan.spec.json`)), "utf8");
      if (kind === "draft" && this.baseInfo()?.sig !== sig) also = baseJob(overlay);
    }
    resolveSpec(plan);
    const problems = validateSpec(plan);
    if (problems.length) throw new BadRequest(`O spec com as mudanças ficou inválido: ${problems.join("; ")}`, 422);
    const planPath = join(kind === "base" ? this.cacheDir : this.outDir, `${plan.id}.plan.spec.json`);
    writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf8");
    let alsoPlan: string | null = null;
    if (also) { alsoPlan = join(this.cacheDir, `${also.plan.id}.plan.spec.json`); resolveSpec(also.plan); writeFileSync(alsoPlan, JSON.stringify(also.plan, null, 2), "utf8"); }

    const statusFile = join(this.jobsDir, `${id}.status.json`);
    const job = {
      kind, id, plan_spec: planPath, mp4, status: statusFile, frames: Math.round(plan.duration * plan.canvas.fps),
      progress_file: join(this.jobsDir, `${id}.progress.txt`),
      draft: kind === "final" ? null : draftFor(plan.canvas), no_text: kind === "base", qa: kind === "final",
      download: kind === "final" ? { dir: this.downloads, name: downloadName(base.id, n, this.opts.finalName) } : null,
      also_base: also ? { plan_spec: alsoPlan, mp4: also.mp4, sig, progress_file: join(this.jobsDir, `${id}.base.progress.txt`) } : null,
      base_sig: kind === "base" ? sig : null,
    };
    const jobFile = join(this.jobsDir, `${id}.job.json`);
    writeJsonAtomic(jobFile, job);
    rmSync(statusFile, { force: true });
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "editor-job.ts"), jobFile], { stdout: "ignore", stderr: "pipe" });
    this.job = { kind, id: label, statusFile, started: Date.now(), pid: proc.pid, frames: job.frames, snapshot: snapshot(fb), editKey: key, n, rev: feedbackRevision, proc };
    const errText = new Response(proc.stderr).text();
    proc.exited.then(async (code) => this.finish(code, await errText));
    return { id: label };
  }

  private finish(code: number, stderr: string): void {
    const j = this.job;
    if (!j) return;
    this.finishJob(j, code, stderr);
    const lj = this.lastJob;
    try { this.onFinish?.({ kind: j.kind, ok: !!lj?.ok, version: lj?.version, rev: j.rev, message: lj?.message ?? "" }); }
    catch (e) { console.error(`[editor] onFinish: ${(e as Error).message}`); }
  }

  private finishJob(j: RunningJob, code: number, stderr: string): void {
    this.job = null;
    let st: JobStatus | null = null;
    try { st = JSON.parse(readFileSync(j.statusFile, "utf8")); } catch { /* the child died before writing */ }
    const at = nowIso();
    if (!st?.ok || !st.result) {
      const msg = st?.error ?? (stderr.trim().split("\n").slice(-3).join(" ") || `o processo do render saiu com código ${code}`);
      this.lastJob = { kind: j.kind, ok: false, message: `Não deu para gerar o vídeo: ${msg}`, at };
      console.error(`[editor] ${j.kind} failed: ${msg}`);
      return;
    }
    const r = st.result;
    if (r.base) writeJsonAtomic(this.baseInfoPath, { sig: r.base.sig, mp4: r.base.mp4, updated_at: at });
    if (j.kind === "base") { this.lastJob = { kind: "base", ok: true, message: "Vídeo limpo pronto: a sobreposição acompanha o vídeo.", at }; return; }
    const kind = j.kind as "draft" | "final";
    const v: Version = {
      id: j.id, kind, n: j.n, label: `${kind === "draft" ? "Prévia" : "Final"} ${j.n}`, spec: basename(r.spec), mp4: basename(r.mp4),
      sha256: r.sha256, edit_key: j.editKey, created_at: at, seconds: r.seconds, width: r.width, height: r.height, sections: j.snapshot,
      ...(r.qa ? { qa: r.qa } : {}), ...(kind === "final" ? { download: r.download ?? null, ...(r.download_error ? { download_error: r.download_error } : {}) } : {}),
    };
    this.versions.push(v);
    writeJsonAtomic(this.versionsPath, { spec: basename(this.specPath), updated_at: at, versions: this.versions });
    if (kind === "draft") this.lastJob = { kind, ok: true, message: `${v.label} pronta. Ela já está no player.`, version: v.id, at };
    else if (r.qa?.verdict === "FAIL") this.lastJob = { kind, ok: false, message: `O vídeo final não passou no QA e não foi copiado: ${r.qa.problems.filter((p) => p.startsWith("Bloqueia")).join(" ")}`, version: v.id, at };
    else if (r.download) this.lastJob = { kind, ok: true, message: `Vídeo final pronto (QA ${r.qa?.verdict}). Copiado para ${r.download}`, version: v.id, at };
    else this.lastJob = { kind, ok: false, message: `O vídeo final passou no QA mas não foi copiado: ${r.download_error ?? "erro desconhecido"}`, version: v.id, at };
  }

  /** Stops a running render (server shutdown): the child and its ffmpeg. */
  kill(): void {
    if (!this.job) return;
    const pid = this.job.pid;
    if (process.platform === "win32") Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    else try { process.kill(pid); } catch { /* gone */ }
  }

  state(fb: Feedback | null) {
    const ov = this.overlaySpec(fb);
    const b = this.baseInfo();
    const key = this.currentKey(fb);
    const job = this.jobState();
    const a = fb?.approval ?? null;
    const sha = fileSha256(this.videoPath);
    return {
      overlay: ov,
      base: b ? { status: b.sig === ov.sig ? "ready" : "stale", url: `/media/base?v=${b.sig}` } : { status: job?.kind === "base" ? "rendering" : "missing", url: null },
      job, last_job: this.lastJob,
      original: { id: "original", label: "Original", url: `/media/version?id=original&v=${sha.slice(0, 12)}`, sha256: sha, edit_key: this.originalKey(), current: this.originalKey() === key },
      versions: this.versions.map((v) => ({ id: v.id, kind: v.kind, label: v.label, url: `/media/version?id=${v.id}&v=${v.sha256.slice(0, 12)}`, sha256: v.sha256,
        created_at: v.created_at, width: v.width, height: v.height, seconds: v.seconds, current: v.edit_key === key,
        qa: v.qa ? { verdict: v.qa.verdict, problems: v.qa.problems } : null, download: v.download ? basename(v.download) : null, download_error: v.download_error ?? null })),
      edit_key: key,
      approved: a?.approved ? { version: a.version ?? null, matches: a.edit_key === key } : null,
      finalize_block: this.finalizeBlock(fb),
      undo: { count: fb?.undo?.length ?? 0, last: fb?.undo?.length ? fb.undo[fb.undo.length - 1].label : null },
      notes_pending: (fb?.marks ?? []).filter((m) => m.note).length,
      final_name: this.nextDownloadName(),
      downloads: this.downloads,
    };
  }
}

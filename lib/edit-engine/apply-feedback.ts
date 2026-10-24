// apply-feedback: turns a reviewed spec plus its feedback.json into the next
// spec version, without AI. Applied here (deterministic): caption preset,
// headline mode, text and size, music on/off and gain, whoosh on/off, caption
// word fixes and keyword highlights, take edge trims (ripple). The mini editor
// (editor-job.ts) uses applyToSpec for its drafts and finals. Left for the retention-editor agent in
// pending-notes.md: every mark with free text, the style note, and anything
// that needs a decision (music switched on without a track, whoosh switched on
// without positions, words a trim uncovered). The operations of the editor com IA
// (feedback.ops, live-ops.ts) are applied last, in order. Bun only.
//   bun lib/edit-engine/cli.ts apply-feedback <spec.json> <feedback.json> [--out-dir DIR] [--no-render]
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileSha256, isWhoosh, loadFeedback, styleOfSpec, type Feedback } from "./feedback.ts";
import { render } from "./ffmpeg.ts";
import { probe } from "./measure.ts";
import { runQa, type QaReport } from "./qa.ts";
import { applyOps, rippleTrim } from "./live-ops.ts";
import { loadSpec, resolveSpec, takes, validateSpec, type EditSpec } from "./spec.ts";

export interface ApplyResult {
  spec: EditSpec;
  applied: string[];
  pending: string[];
  plan_spec: string;
  pending_notes: string;
  mp4?: string;
  qa?: QaReport;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** loja-vestido-v2 -> loja-vestido-v3; anything else gets -v2. */
export function nextId(id: string): string {
  const m = id.match(/^(.*-v)(\d+)$/i);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${id}-v2`;
}

function swapHook(spec: EditSpec, from: string | null, to: string | null, why: string) {
  if (from) spec.hooks_applied = spec.hooks_applied.filter((h) => h.hook !== from);
  if (to && !spec.hooks_applied.some((h) => h.hook === to)) spec.hooks_applied.push({ hook: to, at: 0, why });
}

/** Applies the deterministic part of the feedback to a copy of the spec. */
export function applyToSpec(src: EditSpec, fb: Feedback, srcDuration: (p: string) => number = (p) => probe(p).duration) {
  const spec: EditSpec = structuredClone(src);
  const applied: string[] = [], pending: string[] = [];
  const base = styleOfSpec(src);

  // caption fixes first: indexes refer to the reviewed word list
  for (const e of fb.caption_edits ?? []) {
    const w = spec.captions?.words[e.index];
    if (!w || w.word !== e.from) { pending.push(`correção de legenda não aplicada: palavra ${e.index} não é mais "${e.from}"`); continue; }
    w.word = e.to;
    applied.push(`legenda: palavra ${e.index} "${e.from}" -> "${e.to}" (${fmt(w.start)})`);
  }
  // keyword highlights (mini editor): same indexes, checked against the reviewed word
  for (const e of fb.emphasis ?? []) {
    const w = src.captions?.words[e.index], out = spec.captions?.words[e.index];
    if (!w || !out || w.word !== e.word) { pending.push(`destaque não aplicado: palavra ${e.index} não é mais "${e.word}"`); continue; }
    if (e.on) out.emphasis = true; else delete out.emphasis;
    applied.push(`legenda: "${out.word}" ${e.on ? "em destaque (amarelo)" : "sem destaque"} (${fmt(out.start)})`);
  }

  const st = fb.style;
  if (st) {
    if (spec.captions && st.caption_preset !== base.caption_preset) {
      spec.captions.preset = st.caption_preset;
      delete spec.captions.group_font_px;
      if (st.caption_preset === "classic") swapHook(spec, "caption_bold_word", "caption_word_highlight", "classic captions: active word at 110%, chosen in the preview");
      else swapHook(spec, "caption_word_highlight", "caption_bold_word", "bold-word captions, chosen in the preview");
      applied.push(`legenda: ${base.caption_preset} -> ${st.caption_preset}`);
    }
    const hook = spec.texts.find((t) => t.role === "hook");
    if (hook && st.headline_mode !== base.headline_mode) {
      hook.mode = st.headline_mode;
      if (st.headline_mode === "intro") {
        hook.start = 0;
        hook.end = r3(Math.min(3, spec.duration));
        swapHook(spec, "headline_fixed", null, "");
        applied.push(`headline: fixa -> intro (0 a ${hook.end.toFixed(2)} s)`);
      } else {
        swapHook(spec, null, "headline_fixed", "headline on screen for the whole video, chosen in the preview");
        applied.push("headline: intro -> fixa (vídeo inteiro)");
      }
    }
    const pct = st.headline_size_pct ?? 100;
    if (hook && pct !== 100) {
      const from = hook.style.font_px;
      hook.style.font_px = Math.round(from * pct / 100);
      if (hook.style.line_spacing_px) hook.style.line_spacing_px = Math.round(hook.style.line_spacing_px * pct / 100);
      applied.push(`headline: tamanho ${pct}% (fonte ${from} -> ${hook.style.font_px} px; a largura máxima segura ainda vale no render)`);
    }
    if (hook && JSON.stringify(st.headline_lines) !== JSON.stringify(base.headline_lines)) {
      hook.lines = [...st.headline_lines];
      if (hook.highlight_words?.length) hook.highlight_words = hook.highlight_words.filter((w) => hook.lines.join(" ").toLowerCase().includes(w.toLowerCase()));
      applied.push(`headline: texto -> "${hook.lines.join(" / ")}"`);
      pending.push(`a headline mudou para "${hook.lines.join(" / ")}": conferir \`alignment.text\` e a nota de origem`);
    }
    if (!st.music_enabled && spec.audio.music) {
      delete spec.audio.music;
      swapHook(spec, "music_duck", null, "");
      applied.push("música: desligada");
      const gated = spec.audio.sfx.filter((s) => s.only_with_music).length;
      if (gated) applied.push(`${gated} efeito(s) marcados only_with_music saem junto com a música`);
    } else if (st.music_enabled && !spec.audio.music) {
      pending.push("música ligada na prévia, mas o spec não tem faixa: escolher a faixa, `start`, `offset` e `below_voice_db`");
    }
    const m = spec.audio.music;
    if (m && st.music_enabled && st.music_gain_delta_db) {
      const d = st.music_gain_delta_db;
      if (m.below_voice_db !== undefined) {
        const next = r3(m.below_voice_db - d);
        if (next < 6 || next > 40) pending.push(`ganho da música ${d > 0 ? "+" : ""}${d} dB levaria below_voice_db a ${next} (fora de 6 a 40): decidir à mão`);
        else { applied.push(`música: ${d > 0 ? "+" : ""}${d} dB (below_voice_db ${m.below_voice_db} -> ${next} LU abaixo da voz)`); m.below_voice_db = next; }
      } else {
        const g = r3((m.gain_db ?? -6) + d);
        applied.push(`música: ${d > 0 ? "+" : ""}${d} dB (gain_db ${m.gain_db ?? -6} -> ${g})`);
        m.gain_db = g;
      }
      delete m.measured;
      const duck = spec.hooks_applied.find((h) => h.hook === "music_duck");
      if (duck) duck.why = `${duck.why}; music ${d > 0 ? "+" : ""}${d} dB from the preview`;
    }
    const whooshes = spec.audio.sfx.filter(isWhoosh).length;
    if (!st.whoosh_enabled && whooshes) {
      spec.audio.sfx = spec.audio.sfx.filter((s) => !isWhoosh(s));
      spec.hooks_applied = spec.hooks_applied.filter((h) => h.hook !== "whoosh");
      applied.push(`whoosh: desligado (${whooshes} removido(s))`);
    } else if (st.whoosh_enabled && !whooshes && !(fb.ops ?? []).some((o) => o.op === "whoosh_cuts")) {
      pending.push("whoosh ligado na prévia, mas o spec não tem whoosh: escolher em quais cortes entra (ver `whoosh` no catálogo)");
    }
    if (st.note) pending.push(`nota do painel de estilo: ${st.note}`);
  }

  const dropped: string[] = [];
  const order = [...(fb.trims ?? [])].sort((a, b) => {
    const la = spec.layers.find((l) => l.id === a.id), lb = spec.layers.find((l) => l.id === b.id);
    return (lb?.start ?? 0) - (la?.start ?? 0);   // latest take first: earlier takes keep their times
  });
  for (const t of order) {
    const layer = takes(spec).find((l) => l.id === t.id);
    if (!layer) { pending.push(`ajuste de corte não aplicado: ${t.id} não é um take do spec`); continue; }
    const inn = (layer.in ?? 0) + t.start_delta * (layer.speed ?? 1);
    const srcEnd = inn + (layer.duration - t.start_delta + t.end_delta) * (layer.speed ?? 1);
    if (inn < -1e-6 || srcEnd > srcDuration(layer.src) + 1e-3) { pending.push(`ajuste de corte não aplicado: ${t.id} sairia do clipe original`); continue; }
    rippleTrim(spec, t, dropped);
    const parts = [t.start_delta && `início ${t.start_delta > 0 ? "+" : ""}${t.start_delta} s`, t.end_delta && `fim ${t.end_delta > 0 ? "+" : ""}${t.end_delta} s`].filter(Boolean);
    applied.push(`corte ${t.id}: ${parts.join(", ")}`);
    if (t.start_delta < 0 || t.end_delta > 0) pending.push(`${t.id} ficou mais longo: o trecho novo pode ter fala sem legenda; transcrever e completar \`captions.words\` se tiver`);
  }
  for (const d of dropped) pending.push(`palavra da legenda removida: ${d}`);

  // editor com IA (1.7.0): the operations of the requests, in order, on the timeline after the trims
  if (fb.ops?.length) {
    applyOps(spec, src, fb.ops, srcDuration, applied, pending);
    if (st && !st.whoosh_enabled) {
      const n = spec.audio.sfx.filter(isWhoosh).length;
      if (n) { spec.audio.sfx = spec.audio.sfx.filter((s) => !isWhoosh(s)); applied.push(`whoosh: desligado (${n} de pedidos removido(s))`); }
    }
  }

  for (const m of fb.marks ?? []) pending.push(`marcação ${fmt(m.in)} a ${fmt(m.out)}: ${m.note || "(sem nota)"}`);
  return { spec, applied, pending };
}

export function pendingMarkdown(fb: Feedback, from: EditSpec, to: EditSpec, applied: string[], pending: string[], specPath: string, planSpec: string): string {
  const lines = [
    `# Notas pendentes: ${to.id}`, "",
    `Origem: \`${basename(specPath)}\` (${from.id}), feedback revisão ${fb.revision} de ${fb.updated_at}.`,
    `Spec novo: \`${basename(planSpec)}\`.`, "",
    "## Para o retention-editor resolver", "",
    ...(pending.length ? pending.map((p) => `- [ ] ${p}`) : ["Nada pendente."]), "",
    "Como resolver: edite o spec novo, rode `bun lib/edit-engine/cli.ts validate`, depois `render` e `qa`. Uma marcação que pede corte, troca de take ou efeito novo é decisão de edição, não de motor.", "",
    "## Já aplicado pelo motor (sem IA)", "",
    ...(applied.length ? applied.map((a) => `- ${a}`) : ["Nada."]), "",
  ];
  if (fb.approval) lines.push("## Aprovação", "", `A pessoa aprovou o vídeo de sha256 \`${fb.approval.video_sha256.slice(0, 16)}…\`${fb.approval.note ? `: ${fb.approval.note}` : "."}`, "");
  return lines.join("\n");
}

export async function applyFeedback(specPath: string, feedbackPath: string, opts: { outDir?: string; render?: boolean } = {}): Promise<ApplyResult> {
  const src = loadSpec(specPath);
  const fb = loadFeedback(feedbackPath);
  if (!fb) throw new Error(`feedback not found: ${feedbackPath}`);
  if (fb.spec_id !== src.id) throw new Error(`the feedback is for ${fb.spec_id}, not ${src.id}`);
  const warn: string[] = [];
  if (fb.spec_sha256 && fb.spec_sha256 !== fileSha256(specPath)) warn.push("o spec mudou depois da revisão: as correções foram conferidas palavra a palavra");

  const { spec, applied, pending } = applyToSpec(src, fb);
  pending.unshift(...warn);
  spec.id = nextId(src.id);
  spec.notes = [...(spec.notes ?? []), `apply-feedback: from ${src.id} (feedback revision ${fb.revision}): ${applied.length} change(s) applied, ${pending.length} pending`];
  resolveSpec(spec);
  const problems = validateSpec(spec);
  if (problems.length) throw new Error("the spec after the feedback is invalid:\n- " + problems.join("\n- "));

  const outDir = resolve(opts.outDir ?? dirname(resolve(specPath)));
  mkdirSync(outDir, { recursive: true });
  const planSpec = join(outDir, `${spec.id}.plan.spec.json`);
  writeFileSync(planSpec, JSON.stringify(spec, null, 2), "utf8");
  const notes = join(outDir, "pending-notes.md");
  writeFileSync(notes, pendingMarkdown(fb, src, spec, applied, pending, specPath, planSpec), "utf8");

  const result: ApplyResult = { spec, applied, pending, plan_spec: planSpec, pending_notes: notes };
  if (opts.render !== false) {
    const r = await render(spec, join(outDir, `${spec.id}.mp4`));
    result.mp4 = r.out;
    result.qa = runQa(spec, r.out, { reportDir: outDir });
  }
  return result;
}

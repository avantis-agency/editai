#!/usr/bin/env bun
// Edit engine CLI (Bun only, never node):
//   bun lib/edit-engine/cli.ts render <spec.json> <out.mp4>          render one spec with ffmpeg
//   bun lib/edit-engine/cli.ts qa <spec.json> <video.mp4> [dir]      measure a render against its spec
//   bun lib/edit-engine/cli.ts batch <batch.json>                    template + items -> MP4s + QA
//   bun lib/edit-engine/cli.ts from-template <template> <slots.json> <out.spec.json>
//   bun lib/edit-engine/cli.ts sfx-synth [dir]                       regenerate the provisional SFX
//   bun lib/edit-engine/cli.ts validate <spec.json>                  structural check only
//   bun lib/edit-engine/cli.ts transcribe <video> <out.json> [lang]  optional local word timings (editonny faster-whisper)
//   bun lib/edit-engine/cli.ts broll-suggest <spec.json> [--project DIR] [--out F]   automatic B-roll: client media by spoken word + editonny cards (exit 3: no editonny, media only)
//   bun lib/edit-engine/cli.ts broll-render <spec.json> [--project DIR] [--out F]    draw the cards (editonny render_visuals) into the project cache
//   bun lib/edit-engine/cli.ts preview <spec.json> [--video out.mp4] [--port 4840] [--open] [--final-name "Nome"] [--downloads DIR]   mini editor on 127.0.0.1
//   bun lib/edit-engine/cli.ts preview <spec.json> --stop            stop the preview of this spec
//   bun lib/edit-engine/cli.ts apply-feedback <spec.json> <feedback.json> [--out-dir DIR] [--no-render]
//   bun lib/edit-engine/cli.ts agent-inbox <spec.json> [--wait] [--timeout 600]   editor com IA: next request for your agent, as JSON (exit 3: none)
//   bun lib/edit-engine/cli.ts edit-op <spec.json> <op.json>                     apply operations of the closed set ({"request":"p3","ops":[...]})
//   bun lib/edit-engine/cli.ts agent-reply <spec.json> <id> --status feito|precisa|nao-deu --message "..."   answer the request in the page
//   bun lib/edit-engine/cli.ts th-batch <batch.json> [--no-preview-check]   N talking heads: takes + words/script -> MP4 + spec + QA each
//   bun lib/edit-engine/cli.ts concat <spec.json> --project-dir <dir under home> [--name N] [--token-file F] [--port 7420] [--frame out.png]
//   bun lib/edit-engine/cli.ts library [music|sfx]                   list the CC0 music moods and sound effects ([kit], [cache], [pull])
//   bun lib/edit-engine/cli.ts library pull [--music] [--sfx] [--only id,id] [--dry-run]   download the rest of the library (sha256 checked) to the cache, never into the squad
//   bun lib/edit-engine/cli.ts placeholder-screen <out.png> [label]  neutral app screen labelled PLACEHOLDER (POV template)
//   bun lib/edit-engine/cli.ts doctor                                check ffmpeg, libass, fonts, libraries; say how to fix
//   bun lib/edit-engine/cli.ts brief <input.json> [--project DIR] [--format ask|list]          guided briefing: questions for what is missing
//   bun lib/edit-engine/cli.ts brief <state.json> --answers "1=2,2=1" | --answers-json F       answers -> suggested plan ("Posso editar?")
//   bun lib/edit-engine/cli.ts brief <state.json> --confirm [--adjust "mood=calm"]            save the client profile and the edit style
//   bun lib/edit-engine/cli.ts profiles [--project DIR]               client profiles of the project and the niche starting profiles
//   bun lib/edit-engine/cli.ts style-extract <video|url> --name N [--project DIR]   measure a reference -> editai/styles/N.style.json + .md
//   bun lib/edit-engine/cli.ts style-check <style.json>              validate a hand-reviewed profile and rewrite its .md report
//   bun lib/edit-engine/cli.ts style-apply <style.json> <th-batch.json> [--review] [--no-draft]   quick draft, final + QA, mini editor
import { existsSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runBatch } from "./batch.ts";
import { render } from "./ffmpeg.ts";
import { runQa } from "./qa.ts";
import { synthAll } from "./sfx-synth.ts";
import { loadSpec, validateSpec } from "./spec.ts";
import { expandSlotPaths, fillTemplate, loadTemplate } from "./template.ts";
import { transcribe } from "./transcribe.ts";
import { startPreview, stopPreview } from "./preview-server.ts";
import { applyFeedback } from "./apply-feedback.ts";
import { runThBatch } from "./th-batch.ts";
import { concatProjectName, concatToken, describe, toConcat } from "./concat.ts";
import { listLibrary, pullLibrary } from "./library.ts";
import { placeholderScreen } from "./placeholder.ts";
import { doctor, printDoctor } from "./doctor.ts";
import { answerBrief, askUserQuestion, confirmBrief, isState, loadNiches, numberedList, startBrief, type BriefState } from "./briefing.ts";
import { extractStyle, loadStyle, styleReport } from "./style.ts";
import { APP_DIR, appRoots, projectDir } from "./project.ts";
import { agentInbox, sendCommand, serverFor } from "./live.ts";
import { materializeBroll, suggestBroll } from "./broll.ts";

const argv = process.argv.slice(2);
/** Removes `--name [value]` from argv; undefined when absent, "" when given without a value. */
const flag = (name: string) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1], has = v !== undefined && !v.startsWith("--");
  argv.splice(i, has ? 2 : 1);
  return has ? v : "";
};
const [cmd] = argv;
const usage = () => { const l = readFileSync(import.meta.path, "utf8").split("\n"); console.error(l.slice(1, l.findIndex((x) => x.startsWith("import"))).join("\n")); process.exit(2); };

const fwd = (p: string) => p.replace(/\\/g, "/");
const printBrief = (s: BriefState, format?: string) => {
  console.log(`briefing: ${s.dir}`);
  if (s.first_use) console.log(`primeiro uso: ${s.first_use.status} (${s.first_use.reason})`);
  if (s.first_use?.show_now && s.first_use.welcome) console.log(`\n${s.first_use.welcome}\n`); // the welcome, then this round's questions or plan
  if (s.questions.length) {
    console.log(`${s.questions.length} pergunta(s), rodada ${s.round}:\n`);
    console.log(format === "ask" ? JSON.stringify(askUserQuestion(s.questions), null, 2) : numberedList(s.questions));
    console.log(`\nresponda: bun lib/edit-engine/cli.ts brief "${fwd(join(s.dir, "state.json"))}" --answers "1=..."`);
  } else if (s.plan) {
    console.log(s.plan.markdown);
    if (!s.confirmed) console.log(`\nconfirme: bun lib/edit-engine/cli.ts brief "${fwd(join(s.dir, "state.json"))}" --confirm`);
  }
};

if (cmd === "agent-inbox" || cmd === "edit-op" || cmd === "agent-reply") {
  // editor com IA: the person's own agent (Claude Code, Codex...) talks to the open editor through its mailbox
  const o = { wait: flag("--wait") !== undefined, timeout: flag("--timeout"), status: flag("--status"), message: flag("--message") };
  const [, a, b] = argv;
  if (!a) usage();
  const spec = resolve(a);
  if (cmd === "agent-inbox") {
    const r = await agentInbox(spec, { wait: o.wait, timeoutS: o.timeout ? Number(o.timeout) : undefined });
    console.log(JSON.stringify(r.out, null, 2));
    process.exit(r.code);
  }
  if (!(await serverFor(spec))) { console.error(`o editor deste spec não está aberto. Abra com: bun lib/edit-engine/cli.ts preview "${a}"`); process.exit(2); }
  if (cmd === "edit-op") {
    if (!b) usage();
    const raw = b.trim().startsWith("{") || b.trim().startsWith("[") ? b : readFileSync(b, "utf8");
    if (raw.length > 64_000) { console.error("op.json grande demais (máximo 64 KB)"); process.exit(1); }
    let j: any;
    try { j = JSON.parse(raw); } catch { console.error("op.json não é JSON válido"); process.exit(1); }
    const body = Array.isArray(j) ? { ops: j } : j.ops ? j : { request: j.request, ops: [j] };
    const r = await sendCommand(spec, { cmd: "op", request: body.request ?? null, ops: body.ops });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r?.ok ? 0 : 1);
  }
  if (!b || !o.status) usage();
  const r = await sendCommand(spec, { cmd: "reply", id: b, status: o.status, message: o.message ?? "" });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r?.ok ? 0 : 1);
} else if (cmd === "broll-suggest" || cmd === "broll-render") {
  const o = { project: flag("--project"), out: flag("--out") };
  const [, a] = argv;
  if (!a) usage();
  const spec = loadSpec(a);
  const out = resolve(o.out || (cmd === "broll-suggest" && !/\.broll\.spec\.json$/i.test(a) ? a.replace(/(\.plan)?\.spec\.json$|\.json$/i, "") + ".broll.spec.json" : a));
  const ts = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
  let code = 0;
  if (cmd === "broll-suggest") {
    const r = suggestBroll(spec, projectDir(o.project || spec.broll?.project || undefined));
    code = r.exitCode;
    if (r.exitCode === 3) console.error(`broll-suggest: ${r.editonny.reason}\nsó a mídia da pasta do cliente entrou (casada por palavra); o vídeo renderiza com ela e com os ganchos de sempre`);
  } else {
    if (o.project) spec.broll = { ...(spec.broll ?? { mode: "auto", items: [] }), project: projectDir(o.project) };
    const notes = materializeBroll(spec, join(dirname(out), ".editai-broll-cache"));
    if (notes.some((n) => /fora do vídeo|sem editonny/.test(n))) code = 3;
  }
  const b = spec.broll!;
  writeFileSync(out, JSON.stringify(spec, null, 2));
  console.log(`B-roll ${b.mode}: ${b.items.length} item(ns) · ${b.editonny ?? ""}`);
  for (const it of b.items) console.log(`  ${it.id} ${ts(it.start)}-${ts(it.end)} ${it.kind === "card" ? `card ${it.template}${it.clip ? " [clip ok]" : " [falta broll-render]"}` : `mídia ${it.src?.split(/[\\/]/).pop()} (${it.layout ?? "full"})`} · legenda ${it.captions ?? "keep"} · "${it.quote}"`);
  for (const s of b.skipped ?? []) console.log(`  fora    ${ts(s.at)} ${s.what}: ${s.why}`);
  for (const n of b.notes ?? []) console.log(`  nota    ${n}`);
  console.log(`spec: ${out}`);
  process.exit(code);
} else if (cmd === "brief") {
  const o = { project: flag("--project"), answers: flag("--answers"), answersJson: flag("--answers-json"), confirm: flag("--confirm") !== undefined, adjust: flag("--adjust"), format: flag("--format") };
  const [, a] = argv;
  if (!a) usage();
  if (isState(a)) {
    if (o.confirm) {
      const r = confirmBrief(a, o.adjust || undefined);
      printBrief(r.state);
      console.log(`\nperfil salvo: ${r.profile}\nestilo da edição: ${r.style}\nno lote (th-batch ou style-apply): "style": "${fwd(r.style)}"`);
    } else {
      const s = await answerBrief(a, o.answers || undefined, o.answersJson ? JSON.parse(readFileSync(o.answersJson, "utf8")) : undefined);
      printBrief(s, o.format);
    }
  } else {
    const input = JSON.parse(readFileSync(a, "utf8"));
    const base = dirname(resolve(a));
    input.material = (input.material ?? []).map((m: string) => resolve(base, m));
    input.references = (input.references ?? []).map((m: string) => (/^https?:/i.test(m) ? m : resolve(base, m)));
    printBrief(await startBrief(input, projectDir(o.project || undefined)), o.format);
  }
} else if (cmd === "profiles") {
  const p = projectDir(flag("--project") || undefined);
  const dir = join(p, APP_DIR, "profiles");
  // editai/profiles, then the legacy rvs/profiles (a client saved in both shows once, from editai/)
  const own = new Map<string, string>();
  for (const d of appRoots(p).map((r) => join(r, "profiles"))) for (const f of existsSync(d) ? readdirSync(d) : []) if (f.endsWith(".json") && !own.has(f)) own.set(f, join(d, f));
  console.log(`perfis de cliente em ${dir}: ${own.size ? "" : "nenhum"}`);
  for (const [f, file] of own) { const j = JSON.parse(readFileSync(file, "utf8")); console.log(`  ${f.replace(/\.json$/, "").padEnd(24)} ${j.client} · ${j.niche ?? "sem nicho"} · ${j.template} · usado ${j.uses}x${file.startsWith(dir) ? "" : " (pasta antiga rvs/)"}`); }
  console.log("perfis de partida por nicho (templates/niches):");
  for (const n of loadNiches()) console.log(`  ${n.id.padEnd(24)} ${n.name}`);
} else if (cmd === "style-extract") {
  const o = { name: flag("--name"), project: flag("--project") };
  const [, a] = argv;
  if (!a || !o.name) usage();
  const r = await extractStyle(a, { project: projectDir(o.project || undefined), name: o.name! });
  console.log(readFileSync(r.report, "utf8"));
  console.log(`perfil: ${r.path}\nrelatório: ${r.report}`);
} else if (cmd === "style-check") {
  // after the agent reviewed a profile by hand (review_notes, origin "reviewed"): validate it and rewrite its .md report
  const [, a] = argv;
  if (!a) usage();
  const p = loadStyle(a);
  writeFileSync(a.replace(/\.style\.json$/, ".style.md"), styleReport(p));
  console.log(`valid: ${a}`);
} else if (cmd === "style-apply") {
  const o = { review: flag("--review") !== undefined, noDraft: flag("--no-draft") !== undefined };
  const [, a, b] = argv;
  if (!a || !b) usage();
  const res = await runThBatch(b, { style: a, draft: !o.noDraft, previewCheck: !o.review });
  for (const r of res) console.log(`${r.id}: ${r.error ? `ERRO ${r.error}` : `QA ${r.qa?.verdict} · ${r.mp4}`}${r.draft ? ` · prévia rápida ${r.draft}` : ""}`);
  const first = res.find((r) => r.ok && r.spec);
  if (o.review && first) await startPreview(first.spec!, { open: true });
  else process.exit(res.some((r) => !r.ok) ? 1 : 0);
} else if (cmd === "th-batch") {
  const noCheck = flag("--no-preview-check") !== undefined;
  const [, a] = argv;
  if (!a) usage();
  const res = await runThBatch(a, { previewCheck: !noCheck });
  process.exit(res.some((r) => !r.ok) ? 1 : 0);
} else if (cmd === "concat") {
  const o = { dir: flag("--project-dir"), name: flag("--name"), tokenFile: flag("--token-file"), port: flag("--port"), frame: flag("--frame"), noVerify: flag("--no-verify") !== undefined };
  const [, a] = argv;
  if (!a || !o.dir) usage();
  const spec = loadSpec(a);
  const r = await toConcat(spec, { projectDir: o.dir!, name: o.name || concatProjectName(spec), token: concatToken(o.tokenFile || undefined),
    port: o.port ? Number(o.port) : undefined, verify: !o.noVerify, framePng: o.frame || undefined });
  console.log(describe(r));
  process.exit(r.verified && !r.verified.matches ? 1 : 0);
} else if (cmd === "library" && argv[1] === "pull") {
  const o = { music: flag("--music") !== undefined, sfx: flag("--sfx") !== undefined, only: flag("--only"), dryRun: flag("--dry-run") !== undefined };
  const both = !o.music && !o.sfx;
  const r = await pullLibrary({ music: o.music || both, sfx: o.sfx || both, only: o.only ? o.only.split(",").map((x) => x.trim()).filter(Boolean) : undefined, dryRun: o.dryRun });
  console.log(`cache: ${r.cache}`);
  console.log(`${o.dryRun ? "baixaria" : "a baixar"}: ${r.planned.length} arquivo(s)${r.skipped.length ? `; já presentes: ${r.skipped.length}` : ""}`);
  if (o.dryRun) for (const p of r.planned) console.log(`  ${p.kind} ${p.id}  ${p.url}`);
  for (const d of r.done) console.log(`  ok    ${d.id} (${(d.bytes / 1e6).toFixed(2)} MB, sha256 conferido)`);
  for (const f of r.failed) console.log(`  ERRO  ${f.id}: ${f.reason}`);
  if (!o.dryRun && !r.failed.length) console.log(`pronto: ${r.done.length} baixado(s); o kit continua valendo para o que não foi baixado`);
  process.exit(r.failed.length ? 1 : 0);
} else if (cmd === "doctor") {
  const r = await doctor();
  console.log(printDoctor(r));
  process.exit(r.ok ? 0 : 1);
} else if (cmd === "preview" || cmd === "apply-feedback") {
  const opts = { video: flag("--video"), port: flag("--port"), open: flag("--open") !== undefined, stop: flag("--stop") !== undefined,
    outDir: flag("--out-dir"), noRender: flag("--no-render") !== undefined, finalName: flag("--final-name"), downloads: flag("--downloads") };
  const [, a, b] = argv;
  if (cmd === "preview") {
    if (!a) usage();
    if (opts.stop) { console.log(await stopPreview(a)); process.exit(0); }
    await startPreview(a, { video: opts.video || undefined, port: opts.port ? Number(opts.port) : undefined, open: opts.open,
      finalName: opts.finalName || undefined, downloads: opts.downloads || undefined });
  } else {
    if (!a || !b) usage();
    const r = await applyFeedback(a, b, { outDir: opts.outDir || undefined, render: !opts.noRender });
    console.log(`spec: ${r.plan_spec}`);
    for (const x of r.applied) console.log(`  aplicado  ${x}`);
    for (const x of r.pending) console.log(`  pendente  ${x}`);
    console.log(`notas pendentes: ${r.pending_notes}`);
    if (r.qa) {
      console.log(`mp4: ${r.mp4}`);
      console.log(`QA ${r.qa.verdict}`);
      for (const k of r.qa.checks) if (!k.pass && !k.info) console.log(`  ${k.blocking ? "FAIL" : "warn"} ${k.id}: ${k.detail}`);
      process.exit(r.qa.verdict === "FAIL" ? 1 : 0);
    }
  }
} else {
const [, a, b, c] = argv;
switch (cmd) {
  case "render": {
    if (!a || !b) usage();
    const r = await render(loadSpec(a), b);
    console.log(JSON.stringify(r, null, 2));
    break;
  }
  case "qa": {
    if (!a || !b) usage();
    const r = runQa(loadSpec(a), b, { reportDir: c });
    console.log(`QA ${r.verdict}`);
    for (const k of r.checks) console.log(`  ${k.pass ? "ok  " : k.info ? "info" : k.blocking ? "FAIL" : "warn"} ${k.id}: ${k.detail}`);
    process.exit(r.verdict === "FAIL" ? 1 : 0);
  }
  case "batch": {
    if (!a) usage();
    const res = await runBatch(a);
    process.exit(res.some((r) => r.qa.verdict === "FAIL") ? 1 : 0);
  }
  case "from-template": {
    if (!a || !b || !c) usage();
    const t = loadTemplate(a);
    const spec = fillTemplate(t, expandSlotPaths(t, JSON.parse(readFileSync(b, "utf8")), dirname(resolve(b))));
    writeFileSync(c, JSON.stringify(spec, null, 2));
    console.log(c);
    break;
  }
  case "library": {
    console.log(listLibrary(a));
    break;
  }
  case "placeholder-screen": {
    if (!a) usage();
    console.log(placeholderScreen(a, b));
    break;
  }
  case "sfx-synth": {
    console.log(JSON.stringify(synthAll(a), null, 2));
    break;
  }
  case "validate": {
    if (!a) usage();
    const p = validateSpec(loadSpec(a));
    console.log(p.length ? "INVALID\n- " + p.join("\n- ") : "valid");
    process.exit(p.length ? 1 : 0);
  }
  case "transcribe": {
    if (!a || !b) usage();
    const r = transcribe(a, b, c);
    if (!r.ok) { console.error(`transcribe: ${r.reason}\nfallback: supply word timings from another transcriber and check phrase onsets on the waveform`); process.exit(3); }
    console.log(`${r.words.length} words, ${r.engine}, ${r.seconds?.toFixed(1)} s -> ${b}`);
    break;
  }
  default:
    usage();
}
}

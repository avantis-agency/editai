// One mini-editor render, run by the preview server in its own process (the render calls ffmpeg
// synchronously; in a child the server keeps answering the page). Reads the job JSON written by
// editor.ts, renders the plan spec (draft 540x960, clean base without text, or the 1080x1920
// final), runs the full QA on a final and copies a final that is not FAIL to Downloads under a
// name that does not exist yet. Writes its stage to the status file after every step. Bun only.
//   bun lib/edit-engine/editor-job.ts <job.json>
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { render } from "./ffmpeg.ts";
import { fileSha256, nowIso } from "./feedback.ts";
import { freePath, qaProblemsPt, type JobStatus } from "./editor.ts";
import { probe } from "./measure.ts";
import { runQa } from "./qa.ts";
import { loadSpec } from "./spec.ts";

const jobPath = process.argv[2];
if (!jobPath) { console.error("usage: bun lib/edit-engine/editor-job.ts <job.json>"); process.exit(2); }
const job = JSON.parse(readFileSync(jobPath, "utf8"));

/** Stage ranges in % of the whole job. A draft that also refreshes the clean base gives it the last 40 %. */
const RANGES: Record<string, Record<string, [number, number]>> = {
  base: { prepare: [0, 2], music: [2, 25], audio: [25, 35], picture: [35, 80], loudness: [80, 97], frame: [97, 100] },
  draft: { prepare: [0, 8], music: [8, 25], audio: [25, 35], picture: [35, 75], loudness: [75, 95], frame: [95, 100] },
  final: { prepare: [0, 5], music: [5, 13], audio: [13, 18], picture: [18, 55], loudness: [55, 64], frame: [64, 66], qa: [66, 97], copy: [97, 100] },
};

const status: JobStatus = { kind: job.kind, id: job.id, started_at: nowIso(), stage: "prepare", lo: 0, hi: 2, progress_file: null, frames: job.frames, done: false, ok: false };
const write = () => { const tmp = `${job.status}.tmp`; writeFileSync(tmp, JSON.stringify(status, null, 2), "utf8"); renameSync(tmp, job.status); };
const scale = (r: [number, number], into: [number, number]): [number, number] => [into[0] + (into[1] - into[0]) * r[0] / 100, into[0] + (into[1] - into[0]) * r[1] / 100];
const stage = (kind: string, name: string, into: [number, number] = [0, 100], progressFile: string | null = null, label = name) => {
  const [lo, hi] = scale(RANGES[kind][name] ?? [0, 100], into);
  status.lo = Math.round(lo); status.hi = Math.round(hi);
  status.stage = label;
  status.progress_file = name === "picture" ? progressFile : null;
  write();
};

try {
  const mainInto: [number, number] = job.also_base ? [0, 60] : [0, 100];
  stage(job.kind, "prepare", mainInto);
  const spec = loadSpec(job.plan_spec);
  const r = await render(spec, job.mp4, {
    draft: job.draft ?? undefined, noText: !!job.no_text, progressFile: job.progress_file,
    onStage: (s) => stage(job.kind, s, mainInto, job.progress_file),
  });
  const pr = probe(r.out);
  const result: NonNullable<JobStatus["result"]> = { mp4: r.out, spec: r.resolved_spec, sha256: fileSha256(r.out), seconds: Math.round(r.seconds * 10) / 10, width: pr.width, height: pr.height };
  if (job.kind === "base") result.base = { sig: job.base_sig, mp4: r.out };
  if (job.qa) {
    stage(job.kind, "qa");
    const qa = runQa(spec, r.out);
    result.qa = { verdict: qa.verdict, problems: qaProblemsPt(qa), report: r.out.replace(/\.mp4$/i, ".qa.md") };
    if (qa.verdict !== "FAIL" && job.download) {
      stage(job.kind, "copy");
      if (!existsSync(job.download.dir)) result.download_error = `a pasta ${job.download.dir} não existe`;
      else {
        const target = freePath(job.download.dir, job.download.name);
        copyFileSync(r.out, target);
        if (fileSha256(target) !== result.sha256) result.download_error = `a cópia em ${target} não ficou igual ao original`;
        else result.download = target;
      }
    }
  }
  if (job.also_base) {
    // the takes changed: refresh the clean base so the live text lines up with the picture again
    const into: [number, number] = [60, 100];
    stage("base", "prepare", into, null, "base");
    const b = await render(loadSpec(job.also_base.plan_spec), job.also_base.mp4, {
      draft: job.draft, noText: true, progressFile: job.also_base.progress_file,
      onStage: (s) => stage("base", s, into, job.also_base.progress_file, "base"),
    });
    result.base = { sig: job.also_base.sig, mp4: b.out };
  }
  status.result = result;
  status.ok = true;
} catch (e) {
  status.error = String((e as Error).message ?? e).split("\n").slice(0, 4).join(" ");
}
status.done = true;
status.stage = "done";
write();
process.exit(0);

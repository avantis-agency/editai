// Text-hook batch: one template, many items, parallel renders, QA per video.
//   bun lib/edit-engine/cli.ts batch <batch.json>
// batch.json: { template, out_dir, concurrency?, defaults?: {slots}, items: [{ slots, expected_text?, source_note? }] }
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { render } from "./ffmpeg.ts";
import { runQa, type QaReport } from "./qa.ts";
import { expandSlotPaths, fillTemplate, loadTemplate } from "./template.ts";

export interface BatchItem { slots: Record<string, unknown>; expected_text?: string[]; source_note?: string }
export interface Batch { template: string; out_dir: string; concurrency?: number; defaults?: Record<string, unknown>; items: BatchItem[] }

export async function runBatch(batchPath: string) {
  const batch: Batch = JSON.parse(readFileSync(batchPath, "utf8"));
  const base = dirname(resolve(batchPath));
  const outDir = isAbsolute(batch.out_dir) ? batch.out_dir : resolve(base, batch.out_dir);
  mkdirSync(outDir, { recursive: true });
  const template = loadTemplate(batch.template);
  const results: { id: string; mp4: string; frame: string; spec: string; render_s: number; qa: QaReport; source_note?: string }[] = [];

  const queue = [...batch.items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const slots = expandSlotPaths(template, { ...(batch.defaults ?? {}), ...item.slots }, base);
      const lines = slots.hook_lines as string[];
      slots.alignment_text ??= Array.isArray(lines) ? lines.join(" / ") : undefined;
      const spec = fillTemplate(template, slots);
      if ((spec.texts[0]?.highlight_words?.length ?? 0) > 0) {
        spec.hooks_applied.push({ hook: "word_highlight", at: 0, why: `colours ${spec.texts[0].highlight_words!.join(", ")}` });
      }
      const r = await render(spec, join(outDir, `${spec.id}.mp4`));
      const qa = runQa(spec, r.out, { reportDir: outDir, expectedText: item.expected_text ? { hook: item.expected_text } : undefined });
      results.push({ id: spec.id, mp4: r.out, frame: r.frame, spec: r.resolved_spec, render_s: r.seconds, qa, source_note: item.source_note });
      console.log(`[batch] ${spec.id}: render ${r.seconds.toFixed(1)}s, QA ${qa.verdict}`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, batch.concurrency ?? 2) }, worker));

  results.sort((a, b) => a.id.localeCompare(b.id));
  const md = [
    `# Lote de ganchos em texto: ${batch.template}`, "",
    "| Vídeo | QA | Render | Spec | Quadro | Nota de origem |", "|---|---|---|---|---|---|",
    ...results.map((r) => `| \`${r.id}.mp4\` | ${r.qa.verdict} | ${r.render_s.toFixed(1)} s | \`${r.id}.spec.json\` | \`${r.id}.png\` | ${r.source_note ?? ""} |`),
    "",
  ].join("\n");
  writeFileSync(join(outDir, "batch-report.md"), md);
  writeFileSync(join(outDir, "batch-report.json"), JSON.stringify(results.map(({ qa, ...r }) => ({ ...r, verdict: qa.verdict })), null, 2));
  return results;
}

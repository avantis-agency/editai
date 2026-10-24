---
name: render-edit-spec
description: "Render an edit spec (or a batch) to MP4 with the ffmpeg engine, saving the resolved spec and a PNG frame."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: renderEditSpec()
responsavel: "Retention Editor"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: edit_spec
    tipo: file
    obrigatorio: true
    descricao: "<id>.spec.json from plan-retention-edit, or batch.json from plan-text-hook-batch"
Saida:
  - nome: mp4
    tipo: file
    obrigatorio: true
    descricao: "<id>.mp4 per video"
  - nome: frame
    tipo: file
    obrigatorio: true
    descricao: "<id>.png per video"
  - nome: resolved_spec
    tipo: file
    obrigatorio: true
    descricao: "<id>.spec.json next to the MP4"
  - nome: batch_report
    tipo: file
    obrigatorio: false
    descricao: "batch-report.md for a batch"
Checklist:
  - "every planned video has an MP4 and a PNG"
  - "ffprobe reports h264, yuv420p, the spec size and frame rate"
  - "no resolved spec has a cannot shrink note"
---

# Render edit spec

## Input
`<id>.spec.json` from plan-retention-edit, or `batch.json` from plan-text-hook-batch.

## Steps
1. Confirm `ffmpeg -version` works and `ffmpeg -filters` lists `ass`; otherwise stop with "run nrv activate editai".
2. Single video: `bun lib/edit-engine/cli.ts render <id>.spec.json <run-dir>/<id>.mp4`.
3. Batch: `bun lib/edit-engine/cli.ts batch batch.json` (renders in parallel and runs the QA per item).
4. Read the fit log in the resolved spec (`notes`): any "cannot shrink" line goes back to the planning step.

## Output
`<id>.mp4`, `<id>.png`, `<id>.spec.json` (resolved) per video; for a batch also `batch-report.md`.

## Acceptance Criteria
- Every planned video has an MP4 and a PNG on disk.
- ffprobe reports h264, yuv420p, the spec canvas size and the spec frame rate for every MP4.
- The resolved spec next to each MP4 has no "cannot shrink" note.

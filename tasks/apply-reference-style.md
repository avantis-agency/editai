---
name: apply-reference-style
description: "Apply a style profile (from a reference or from the briefing) to the person's talking-head takes: quick 540x960 draft, final 1080x1920 with measured QA, then the mini editor for approval."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: applyReferenceStyle()
responsavel: "Retention Editor"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: style_profile
    tipo: file
    obrigatorio: true
    descricao: "*.style.json from style-extract or edit.style.json from the briefing"
  - nome: talking_head_batch
    tipo: file
    obrigatorio: true
    descricao: "batch in the shape of examples/talking-head-batch.json"
Saida:
  - nome: videos
    tipo: file
    obrigatorio: true
    descricao: "per item <id>-draft.mp4, <id>.mp4, specs, .qa.md and .png"
  - nome: batch_report
    tipo: file
    obrigatorio: true
    descricao: "th-batch-report.md with the style log"
Checklist:
  - "every final QA is PASS or CONCERNS and audio is as long as the video"
  - "the plan spec notes name the style profile"
  - "captions or headline turned off in the profile are absent from the spec"
  - "server.json says stopped at the end unless the review continues"
---

# Apply reference style

## Input
A style profile (`*.style.json` from `style-extract`, or `edit.style.json` from the briefing) and a talking-head batch in the shape of `examples/talking-head-batch.json`: takes, word timings (given, per-clip files, or none to transcribe) and headline lines from the person's own material.

## Steps
1. Set `protect_regions` (eyes, mouth) from a gridded frame of the person's footage. The style's text positions come from someone else's face; the engine moves text out of these rectangles at every zoom the camera reaches.
2. `bun lib/edit-engine/cli.ts style-apply <style.json> <batch.json>` renders `<id>-draft.mp4` (540x960), then `<id>.mp4` with QA, then checks that the mini editor opens. Add `--review` to leave the mini editor open for the person (127.0.0.1); stop it with `cli.ts preview <spec> --stop`.
3. Read `th-batch-report.md`: its style section lists the zoom cuts added and every text moved out of the face.

## Output
Per item `<id>-draft.mp4`, `<id>.mp4`, `<id>.plan.spec.json`, `<id>.spec.json`, `<id>.qa.md`, `<id>.png`; `th-batch-report.md` with the style log.

## Acceptance Criteria
- Every final has a QA verdict of PASS or CONCERNS, never FAIL, and ffprobe reports audio as long as the video.
- The plan spec's `notes` names the style profile used.
- When the profile has `captions.enabled` false or `headline.mode` none, the spec has no captions or no hook text.
- `preview_cache/server.json` says `stopped` at the end unless the person is still reviewing.

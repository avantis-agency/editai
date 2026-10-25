---
name: audit-retention-edit
description: "Measure each rendered video against its resolved edit spec and write the QA verdict, with fixes for every FAIL."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: auditRetentionEdit()
responsavel: "Edit QA Auditor"
responsavel_type: Agente
atomic_layer: Analysis
Entrada:
  - nome: videos
    tipo: array
    obrigatorio: true
    descricao: "every <id>.mp4 with its <id>.spec.json in the run directory"
Saida:
  - nome: qa_reports
    tipo: file
    obrigatorio: true
    descricao: "<id>.qa.md and <id>.qa.json per video"
  - nome: qa_summary
    tipo: file
    obrigatorio: true
    descricao: "edit-qa-summary.md with the overall verdict"
Checklist:
  - "one .qa.json per MP4 with verdict PASS, CONCERNS or FAIL"
  - "every number names the tool that measured it"
  - "every FAIL carries a spec field and a corrected value"
  - "the summary is FAIL whenever a video failed a blocking check"
---

# Audit retention edit

## Input
Every `<id>.mp4` with its `<id>.spec.json` in the run directory.

## Steps
1. `bun lib/edit-engine/cli.ts qa <id>.spec.json <id>.mp4 <run-dir>` per video (skip if the batch already wrote `<id>.qa.json` for this exact MP4).
2. Open each PNG and add the judged lines (triple alignment, eyes and mouth, pacing) to `<id>.qa.md`. With B-roll, open `<id>.broll-sheet.png` too (one frame per item) and judge whether each card says what the person said at that second.
3. For each FAIL, write the spec field, the new value and the measured reason.
4. Write `edit-qa-summary.md` with one line per video and the overall verdict.

## Output
`<id>.qa.md`, `<id>.qa.json`, `edit-qa-summary.md`.

## Acceptance Criteria
- One `.qa.json` exists per MP4 and its verdict is PASS, CONCERNS or FAIL.
- Every number in the reports names the tool that measured it.
- Every FAIL line carries a spec field and a corrected value.
- `edit-qa-summary.md` exists and its overall verdict is FAIL whenever any video failed a blocking check.

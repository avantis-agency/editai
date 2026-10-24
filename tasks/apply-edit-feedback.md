---
name: apply-edit-feedback
description: "Turn a reviewed spec plus its feedback.json into the next spec version: apply the deterministic changes without AI, re-render with QA, and resolve the free-text notes left in pending-notes.md."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: applyEditFeedback()
responsavel: "Retention Editor"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: edit_spec
    tipo: file
    obrigatorio: true
    descricao: "<id>.spec.json reviewed in the mini editor"
  - nome: feedback
    tipo: file
    obrigatorio: true
    descricao: "<id>.feedback.json from review-edit-preview"
Saida:
  - nome: next_version
    tipo: file
    obrigatorio: true
    descricao: "<next-id>.plan.spec.json, .mp4, .png, .spec.json and .qa.md"
  - nome: pending_notes
    tipo: file
    obrigatorio: true
    descricao: "pending-notes.md"
Checklist:
  - "the command exits 0 and the new QA is PASS or CONCERNS"
  - "every saved change is applied or listed in pending-notes.md"
  - "every mark with a note stays in pending-notes.md until resolved"
---

# Apply edit feedback

## Input
`<id>.spec.json` and `<id>.feedback.json` from review-edit-preview.

## Steps
1. `bun lib/edit-engine/cli.ts apply-feedback <id>.spec.json <id>.feedback.json [--out-dir DIR]`. Applied without AI: caption preset, headline mode, text and size, music on or off and gain (`below_voice_db` or `gain_db`), whoosh on or off, caption word fixes, keyword highlights (yellow words), take edge trims (ripple: later takes, words, sound effects and moves shift with the cut; a whoosh in the last 0.5 s of a take stays anchored to its cut). It writes `<next-id>.plan.spec.json`, renders `<next-id>.mp4`, writes the resolved `<next-id>.spec.json` and the QA (`<next-id>.qa.md`, `.qa.json`). The id gets the next `-vN`.
2. Read `pending-notes.md` in the output folder. Every mark with a free note, the style note, and anything needing a decision (music switched on with no track, whoosh switched on with no positions, a lengthened take that may hold uncaptioned speech, a caption fix whose word changed) is listed there as a checkbox.
3. Resolve each pending item in the new plan spec with the catalog hooks, then `validate`, `render` and `qa` again. If an item cannot be done with the material, say so in the handoff instead of guessing.
4. If the feedback only carries an approval, nothing is rendered: report the approved file and its sha256.

## Output
`<next-id>.plan.spec.json`, `<next-id>.mp4`, `<next-id>.png`, `<next-id>.spec.json`, `<next-id>.qa.md`, `pending-notes.md`.

## Acceptance Criteria
- The command exits 0 and the QA verdict of the new MP4 is PASS or CONCERNS.
- Every change the person saved is listed under "Já aplicado" or as an open item in `pending-notes.md`, none silently dropped.
- Every mark with a note appears in `pending-notes.md` until the editor resolves it.

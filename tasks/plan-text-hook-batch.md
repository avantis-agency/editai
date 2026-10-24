---
name: plan-text-hook-batch
description: "Turn a list of approved text hooks and base media into a batch.json for the text-only template, with the exact source text and its provenance per item."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: planTextHookBatch()
responsavel: "Retention Editor"
responsavel_type: Agente
atomic_layer: Strategy
Entrada:
  - nome: hooks
    tipo: array
    obrigatorio: true
    descricao: "hook lines per video with the path of the note they came from"
  - nome: base_media
    tipo: array
    obrigatorio: true
    descricao: "one photo or clip per item, or one default"
Saida:
  - nome: batch_json
    tipo: file
    obrigatorio: true
    descricao: "batch.json for the text-only template"
Checklist:
  - "batch.json parses and has one item per hook"
  - "slots.hook_lines equals expected_text and the note's text"
  - "every source_note path exists"
  - "every slots.id is unique and filename-safe"
---

# Plan text-hook batch

## Input
- Hook list: one entry per video with its lines and the path of the note it came from.
- Base media: one photo or clip per item, or one default for all.

## Steps
1. Copy each hook's lines verbatim from the note into both `slots.hook_lines` and `expected_text`; set `source_note` to the note path.
2. Give each item a filename-safe `slots.id`.
3. Inspect each distinct base media on a gridded frame; set `protect_regions`, `text_y` and `focus` in `defaults` or per item.
4. Set `platforms`, `visual_note` and optional `highlight_words` (colour only, words unchanged).
5. Write `batch.json` with `template: "text-only"`, `out_dir`, `concurrency: 2`.

## Output
`batch.json` in the run directory.

## Acceptance Criteria
- `batch.json` parses and has one item per input hook.
- For every item, `slots.hook_lines` equals `expected_text` and equals the note's on-screen text.
- Every item has a `source_note` path that exists.
- Every `slots.id` is unique and matches `^[a-z0-9][a-z0-9._-]*$`.

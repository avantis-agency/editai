---
name: direct-video
description: "Write script.md, storyboard.md and shot-list.csv from the intent brief."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: directVideo()
responsavel: "Video Director"
responsavel_type: Agente
atomic_layer: Content
Entrada:
  - nome: intent_brief
    tipo: file
    obrigatorio: true
    descricao: "video-intent-brief.md"
Saida:
  - nome: script
    tipo: file
    obrigatorio: true
    descricao: "script.md"
  - nome: storyboard
    tipo: file
    obrigatorio: true
    descricao: "storyboard.md"
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
Checklist:
  - "the CSV parses with the declared header and at least one row"
  - "every duration_sec is an integer from 2 to 15"
---

## Outcome
Write script.md, storyboard.md and shot-list.csv from the intent brief.

## Input

`video-intent-brief.md`.

## Output

`script.md`, `storyboard.md`, `shot-list.csv`.

## Acceptance Criteria

* CSV parses with the declared header and at least one data row.
* Every `duration_sec` is an integer in 2-15.
- Sum of durations is within 15 percent of intent-brief `duration_sec`.
- `script.md` contains a logline.

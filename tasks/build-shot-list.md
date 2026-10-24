---
name: build-shot-list
description: "Split a 30s+ narrative into 5 or more legal-length shots with continuity_chain marks."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: buildShotList()
responsavel: "Video Director"
responsavel_type: Agente
atomic_layer: Content
Entrada:
  - nome: narrative
    tipo: string
    obrigatorio: true
    descricao: "the brief or an existing script.md"
  - nome: intent_brief
    tipo: file
    obrigatorio: true
    descricao: "video-intent-brief.md"
Saida:
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
Checklist:
  - "at least 5 data rows"
  - "at least one continuity_chain value"
---

## Outcome
Split a 30s+ narrative into 5 or more legal-length shots with continuity_chain marks.

## Input

The brief or an existing `script.md` plus `video-intent-brief.md`.

## Output

`shot-list.csv`.

## Acceptance Criteria

- At least 5 data rows.
- At least one `continuity_chain` value.
- Every `duration_sec` is an integer in 2-15.

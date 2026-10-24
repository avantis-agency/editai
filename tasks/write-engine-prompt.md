---
name: write-engine-prompt
description: "Write prompts.yaml in the routed engine's native dialect per shot."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: writeEnginePrompt()
responsavel: "Prompt Architect"
responsavel_type: Agente
atomic_layer: Content
Entrada:
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
  - nome: routing_plan
    tipo: file
    obrigatorio: true
    descricao: "routing-plan.yaml"
  - nome: character_anchors
    tipo: file
    obrigatorio: false
    descricao: "character-anchors.yaml"
Saida:
  - nome: prompts
    tipo: file
    obrigatorio: true
    descricao: "prompts.yaml"
Checklist:
  - "one entry per shot_id"
  - "each entry has tool, prompt and duration_sec"
  - "continuity shots contain continues from the previous pose"
---

## Outcome
Write prompts.yaml in the routed engine's native dialect per shot.

## Input

`shot-list.csv`, `routing-plan.yaml`, `character-anchors.yaml`, `data/prompt-templates.yaml`.

## Output

`prompts.yaml`.

## Acceptance Criteria

- One entry per shot_id.
* Each entry has `tool`, `prompt`, `duration_sec`.
- Continuity shots contain the phrase `continues from the previous pose`.

---
name: plan-character-lora
description: "Decide anchor-only versus a LoRA plan for a character that appears in 10+ shots."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: planCharacterLora()
responsavel: "Character Consistency Keeper"
responsavel_type: Agente
atomic_layer: Strategy
Entrada:
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
  - nome: character_anchors
    tipo: file
    obrigatorio: false
    descricao: "character-anchors.yaml if present"
Saida:
  - nome: character_anchors
    tipo: file
    obrigatorio: true
    descricao: "character-anchors.yaml"
  - nome: lora_plan
    tipo: file
    obrigatorio: false
    descricao: "lora-plan.md"
Checklist:
  - "lora_required is true or false"
  - "when true, lora-plan.md exists with a still count from 15 to 30"
---

## Outcome
Decide anchor-only versus a LoRA plan for a character that appears in 10+ shots.

## Input

`shot-list.csv`, `character-anchors.yaml` if present.

## Output

`character-anchors.yaml`, optional `lora-plan.md`.

## Acceptance Criteria

- `lora_required` is true or false.
* If true, `lora-plan.md` exists and names a still count between 15 and 30.

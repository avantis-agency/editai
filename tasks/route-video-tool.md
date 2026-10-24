---
name: route-video-tool
description: "Probe live engines and write routing-plan.yaml with primary plus fallback per shot."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: routeVideoTool()
responsavel: "Tool Router"
responsavel_type: Agente
atomic_layer: Config
Entrada:
  - nome: intent_brief
    tipo: file
    obrigatorio: true
    descricao: "video-intent-brief.md"
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
  - nome: engine_menu
    tipo: file
    obrigatorio: true
    descricao: "lib/video-fundamentals/ENGINE-MENU.md and data/tool-registry.yaml"
Saida:
  - nome: routing_plan
    tipo: file
    obrigatorio: true
    descricao: "routing-plan.yaml"
Checklist:
  - "every shot_id has primary_tool and fallback_tool"
  - "live_engines lists the probes that passed"
  - "no primary whose probe failed"
---

## Outcome
Probe live engines and write routing-plan.yaml with primary plus fallback per shot.

## Input

`video-intent-brief.md`, `shot-list.csv`, `lib/video-fundamentals/ENGINE-MENU.md`, `data/tool-registry.yaml`.

## Output

`routing-plan.yaml`.

## Acceptance Criteria

- Every shot_id from the CSV has `primary_tool` and `fallback_tool`.
- `live_engines` lists the probes that passed.
- No primary whose probe failed.

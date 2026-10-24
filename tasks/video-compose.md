---
name: video-compose
description: "Write compose-plan.yaml from the brief, ENGINE-MENU and live probes."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: videoCompose()
responsavel: "Veo Video"
responsavel_type: Agente
atomic_layer: Config
Entrada:
  - nome: brief
    tipo: string
    obrigatorio: true
    descricao: "the compose brief"
  - nome: hero_image
    tipo: file
    obrigatorio: false
    descricao: "optional hero image"
Saida:
  - nome: compose_plan
    tipo: file
    obrigatorio: true
    descricao: "compose-plan.yaml"
Checklist:
  - "compose-plan.yaml exists"
  - "duration_sec is legal for the engine"
  - "audio is on or off"
  - "probe_log lists each probe and its result"
---

## Outcome
Write compose-plan.yaml from the brief, ENGINE-MENU and live probes.

## Input

The brief, optional hero image, `lib/video-fundamentals/ENGINE-MENU.md`, FUNDAMENTALS.md, AUDIO-POLICY.md, CREDIT-DISCIPLINE.md.

## Output

`compose-plan.yaml`.

## Acceptance Criteria

- File exists.
- `duration_sec` is legal for `engine`.
- `audio` is `on` or `off`.
- `probe_log` lists each probe and pass/fail.

---
name: stitch-shots
description: "Concat clips into outputs/master.mp4 at the brief's aspect and measure continuity joins."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: stitchShots()
responsavel: "Shot Stitcher"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
  - nome: clips
    tipo: file
    obrigatorio: true
    descricao: "clips/ or clips-lipsynced/"
  - nome: intent_brief
    tipo: file
    obrigatorio: true
    descricao: "video-intent-brief.md"
Saida:
  - nome: master
    tipo: file
    obrigatorio: true
    descricao: "outputs/master.mp4"
  - nome: edl
    tipo: file
    obrigatorio: true
    descricao: "edl.csv"
  - nome: continuity_metrics
    tipo: file
    obrigatorio: true
    descricao: "continuity-metrics.json"
Checklist:
  - "outputs/master.mp4 has a video stream"
  - "aspect matches the intent brief"
  - "continuity-metrics.json has one row per chained join"
---

## Outcome
Concat clips into outputs/master.mp4 at the brief's aspect and measure continuity joins.

## Input

`shot-list.csv`, `clips/` or `clips-lipsynced/`, `video-intent-brief.md`.

## Output

`outputs/master.mp4`, `edl.csv`, `continuity-metrics.json`.

## Acceptance Criteria

- `outputs/master.mp4` exists and ffprobe reports a video stream.
- Aspect matches the intent brief.
- `continuity-metrics.json` has one row per continuity_chain join, or is empty when there are none.

---
name: generate-video-clip
description: "Call the live engine per shot, download MP4, pass previous last frame into continuity shots."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: generateVideoClip()
responsavel: "Video Generator"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: routing_plan
    tipo: file
    obrigatorio: true
    descricao: "routing-plan.yaml"
  - nome: prompts
    tipo: file
    obrigatorio: true
    descricao: "prompts.yaml"
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
Saida:
  - nome: clips
    tipo: file
    obrigatorio: true
    descricao: "clips/<shot_id>.mp4 and .json"
  - nome: generation_log
    tipo: file
    obrigatorio: true
    descricao: "generation-log.jsonl"
Checklist:
  - "one MP4 per shot_id with a video stream"
  - "every chained shot after the first has a start_frame in its sidecar"
  - "generation-log.jsonl has one object per attempt"
---

## Outcome
Call the live engine per shot, download MP4, pass previous last frame into continuity shots.

## Input

`routing-plan.yaml`, `prompts.yaml`, `shot-list.csv`.

## Output

`clips/{shot_id}.mp4`, `clips/{shot_id}.json`, `generation-log.jsonl`, optional `keyframes/`.

## Acceptance Criteria

- One MP4 per shot_id, ffprobe video stream present.
- Every continuity_chain shot after the first has a `start_frame` path in its sidecar JSON.
- `generation-log.jsonl` has one object per attempt.

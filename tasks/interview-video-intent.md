---
name: interview-video-intent
description: "Write video-intent-brief.md from the raw ask. Never wait for answers."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: interviewVideoIntent()
responsavel: "Video Intent Archaeologist"
responsavel_type: Agente
atomic_layer: Strategy
Entrada:
  - nome: brief
    tipo: string
    obrigatorio: true
    descricao: "the user's raw video ask"
  - nome: intent_brief
    tipo: file
    obrigatorio: false
    descricao: "an existing video-intent-brief.md to refine"
Saida:
  - nome: intent_brief
    tipo: file
    obrigatorio: true
    descricao: "video-intent-brief.md"
Checklist:
  - "video-intent-brief.md exists with a numeric duration_sec"
  - "aspect is 9:16, 16:9 or 1:1"
---

## Outcome
Write video-intent-brief.md from the raw ask. Never wait for answers.

## Input

The user brief. Optional existing `video-intent-brief.md` to refine.

## Output

`video-intent-brief.md`.

## Acceptance Criteria

- File exists and contains a numeric `duration_sec`.
- Aspect is one of 9:16, 16:9, 1:1.
- At least one `PREMISE:` line.
- No question addressed to the user.

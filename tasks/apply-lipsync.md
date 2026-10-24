---
name: apply-lipsync
description: "Re-sync lips when native audio misses the tier, or when the brief is existing footage plus a voice track."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: applyLipsync()
responsavel: "Lipsync Specialist"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: video
    tipo: file
    obrigatorio: true
    descricao: "clips or a source video"
  - nome: voice
    tipo: file
    obrigatorio: true
    descricao: "audio/dialogue.wav or native audio"
  - nome: intent_brief
    tipo: file
    obrigatorio: true
    descricao: "video-intent-brief.md"
Saida:
  - nome: lipsynced_mp4
    tipo: file
    obrigatorio: true
    descricao: "lipsynced MP4"
  - nome: lipsync_log
    tipo: file
    obrigatorio: true
    descricao: "lipsync-log.jsonl"
Checklist:
  - "output width and height equal the source"
  - "the log records skipped or a model id"
  - "broadcast tier uses the live Sync.so model when SYNC_API_KEY is set"
---

## Outcome
Re-sync lips when native audio misses the tier, or when the brief is existing footage plus a voice track.

## Input

Clips or a source video, `audio/dialogue.wav` or native audio, `video-intent-brief.md`.

## Output

Lipsynced MP4 plus `lipsync-log.jsonl`.

## Acceptance Criteria

* Output ffprobe width and height equal the source.
- Log records `skipped` or a model id.
- Broadcast tier uses the live Sync.so broadcast model when `SYNC_API_KEY` is set.

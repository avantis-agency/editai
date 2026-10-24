---
name: synthesize-audio
description: "Apply AUDIO-POLICY: keep native audio, synthesize missing layers, or strip to silence."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: synthesizeAudio()
responsavel: "Audio Producer"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: destination
    tipo: string
    obrigatorio: true
    descricao: "intent brief destination (silent or published)"
  - nome: video
    tipo: file
    obrigatorio: true
    descricao: "clips or master"
  - nome: dialogue
    tipo: string
    obrigatorio: false
    descricao: "dialogue text"
Saida:
  - nome: audio_layers
    tipo: file
    obrigatorio: true
    descricao: "audio/*.wav and the muxed master when this step owns mux"
Checklist:
  - "silent destination has no dialogue-length audio"
  - "published destination has an audio stream"
  - "each synthesized wav went through loudnorm"
---

## Outcome
Apply AUDIO-POLICY: keep native audio, synthesize missing layers, or strip to silence.

## Input

Intent brief destination, clips or master, optional dialogue text.

## Output

`audio/*.wav` and the muxed master when this step owns mux.

## Acceptance Criteria

- Silent destination: ffprobe shows no dialogue-length audio, or audio is an ambience bed without speech.
- Published destination: the output file has an audio stream.
- Each synthesized wav was passed through ffmpeg loudnorm.

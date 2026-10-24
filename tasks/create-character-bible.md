---
name: create-character-bible
description: "Write character-anchors.yaml with an immutable 20-30 token anchor per recurring character."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: createCharacterBible()
responsavel: "Character Consistency Keeper"
responsavel_type: Agente
atomic_layer: Content
Entrada:
  - nome: shot_list
    tipo: file
    obrigatorio: true
    descricao: "shot-list.csv"
  - nome: script
    tipo: file
    obrigatorio: true
    descricao: "script.md"
Saida:
  - nome: character_anchors
    tipo: file
    obrigatorio: true
    descricao: "character-anchors.yaml, optional character-bible/<id>/"
Checklist:
  - "character-anchors.yaml exists"
  - "characters_required is false or an anchor has 20 or more tokens"
---

## Outcome
Write character-anchors.yaml with an immutable 20-30 token anchor per recurring character.

## Input

`shot-list.csv`, `script.md`.

## Output

`character-anchors.yaml`. Optional `character-bible/{id}/`.

## Acceptance Criteria

* File exists.
- Either `characters_required: false` or at least one `anchor` string of 20 or more tokens.
- No paraphrased second copy of the same anchor.

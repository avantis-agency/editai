---
name: plan-retention-edit
description: "Choose the format template and the cataloged edit hooks, and write a valid JSON edit spec for one video."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: planRetentionEdit()
responsavel: "Retention Editor"
responsavel_type: Agente
atomic_layer: Strategy
Entrada:
  - nome: material
    tipo: array
    obrigatorio: true
    descricao: "clip, photo or screen-recording paths, or outputs/master.mp4"
  - nome: text_source
    tipo: string
    obrigatorio: true
    descricao: "script, note or brief with the on-screen text; word timings for speech"
  - nome: platforms
    tipo: array
    obrigatorio: false
    descricao: "target platforms (default instagram_reels, tiktok)"
Saida:
  - nome: edit_spec
    tipo: file
    obrigatorio: true
    descricao: "<id>.spec.json in the run directory"
Checklist:
  - "cli.ts validate <id>.spec.json exits 0"
  - "hooks_applied has at least 2 entries, all in references/edit-hooks-catalog.md"
  - "on-screen text equals the source character for character"
  - "alignment.text, alignment.visual and alignment.audio are non-empty"
  - "protect_regions has a rectangle when the media shows a face"
---

# Plan retention edit

## Input
- Material: clip, photo or screen-recording paths (or `outputs/master.mp4` from a generation pipeline).
- The on-screen text source (script, note or brief) and, for speech, word timings from a transcriber.
- Target platforms (default `instagram_reels`, `tiktok`).

## Steps
1. Pick the template in `templates/edit/` that matches the material (see `templates/edit/README.md`).
2. Write `slots.json` and run `bun lib/edit-engine/cli.ts from-template <template> slots.json <id>.spec.json`.
3. Inspect a gridded frame of the main media; set `protect_regions` (eyes and mouth), `text_y`, `focus`.
4. Confirm every `hooks_applied` id exists in `references/edit-hooks-catalog.md`; fill `alignment`.
5. Run `bun lib/edit-engine/cli.ts validate <id>.spec.json` until it prints `valid`.

## Output
`<id>.spec.json` in the run directory.

## Acceptance Criteria
- `bun lib/edit-engine/cli.ts validate <id>.spec.json` exits 0.
- `hooks_applied` has at least 2 entries and every id appears as a `### \`id\`` heading in the catalog.
- On-screen text lines equal the source text character for character.
- `alignment.text`, `alignment.visual` and `alignment.audio` are non-empty.
- When the main media shows a face, `protect_regions` has at least one rectangle.

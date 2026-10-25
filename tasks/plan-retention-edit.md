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
  - "recorded speech went through cli.ts cut (standard cleanup) unless the person switched it off"
---

# Plan retention edit

## Input
- Material: clip, photo or screen-recording paths (or `outputs/master.mp4` from a generation pipeline).
- The on-screen text source (script, note or brief) and, for speech, word timings from a transcriber.
- Target platforms (default `instagram_reels`, `tiktok`).

## Steps
0. Recorded speech (talking head, lesson, sermon): run the standard cleanup first, `bun lib/edit-engine/cli.ts cut <recordings> --project <dir> --lang <pt|en>` (`--script` for spelling, `--fix` for a misheard word, `--pace natural|reverent` for kept pauses, `--fit N` for "caber em N segundos", `--denoise auto` after a noisy `audio-check`). Read `CORTE.md`; the batch item takes `"cut": "<cut.json>"`. A 16:9 recording for a vertical destination gets `"reframe": {"mode": "follow-face"}` (`"layout": "band"` when the head sits near the top). Skip the cut only when the person asked ("mantém as pausas", "não corta nada"). A sermon or service, or "sem cortes", is continuous: `cli.ts cut <video> --continuous` and the item plays whole (`"cut": "none"`), with `"canvas": "same-as-source"` for a 16:9 destination.
1. Pick the template in `templates/edit/` that matches the material (see `templates/edit/README.md`).
2. Write `slots.json` and run `bun lib/edit-engine/cli.ts from-template <template> slots.json <id>.spec.json`.
3. Inspect a gridded frame of the main media; set `protect_regions` (eyes and mouth), `text_y`, `focus`.
4. Confirm every `hooks_applied` id exists in `references/edit-hooks-catalog.md`; fill `alignment`.
5. Talking head with B-roll (`talking-head-broll`, or a `broll` section): run `bun lib/edit-engine/cli.ts broll-suggest <id>.spec.json --project <dir>` and `broll-render`; every item keeps a `quote` from the transcript and a `provenance`, and a card value comes from the speech (exit 3 = no editonny: client media only).
6. Run `bun lib/edit-engine/cli.ts validate <id>.spec.json` until it prints `valid`.

## Output
`<id>.spec.json` in the run directory.

## Acceptance Criteria
- `bun lib/edit-engine/cli.ts validate <id>.spec.json` exits 0.
- `hooks_applied` has at least 2 entries and every id appears as a `### \`id\`` heading in the catalog.
- On-screen text lines equal the source text character for character.
- `alignment.text`, `alignment.visual` and `alignment.audio` are non-empty.
- When the main media shows a face, `protect_regions` has at least one rectangle.
- With `broll.mode` other than `off`, every item has a non-empty `quote` and `provenance.source`.
- With takes from `cli.ts cut`, `CORTE.md` shows 0 edges inside a word, 0 clicks and the cut speech equal to the expected speech.

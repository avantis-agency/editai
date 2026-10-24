---
name: extract-reference-style
description: "Measure the editing language of a reference video (pace, zoom, text position and size, captions, headline, sound effects, music level, palette, framing) into a style profile JSON in the user's project, with an honest list of what the engine cannot reproduce."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: extractReferenceStyle()
responsavel: "Edit Briefing Guide"
responsavel_type: Agente
atomic_layer: Analysis
Entrada:
  - nome: reference
    tipo: string
    obrigatorio: true
    descricao: "local file, TikTok or YouTube link, or Instagram link with APIFY_TOKEN"
  - nome: name
    tipo: string
    obrigatorio: true
    descricao: "style profile name"
  - nome: project_dir
    tipo: string
    obrigatorio: true
    descricao: "the user's project folder"
Saida:
  - nome: style_profile
    tipo: file
    obrigatorio: true
    descricao: "<project>/editai/styles/<name>.style.json and .style.md"
  - nome: measurements
    tipo: file
    obrigatorio: true
    descricao: "<project>/editai/references/<name>/measure/"
Checklist:
  - "style-check prints valid"
  - "the profile has source.sha256 and a non-empty not_reproduced list"
  - "every hand-changed value has origin reviewed and a review_notes line"
  - "no speech, music, brand or words of the reference in apply"
  - "nothing written in the squad or in the editonny install"
---

# Extract reference style

## Input
A reference: a local file, a TikTok or YouTube link (yt-dlp; YouTube with `--extractor-args "youtube:player_client=mweb"`), or an Instagram link only when `APIFY_TOKEN` is set (the Apify path documented by `instagram-intelligence-nirvana`; without the token, ask for the file). A name and the user's project folder.

## Steps
1. `bun lib/edit-engine/cli.ts style-extract <file|link> --name <name> --project <dir>`. Downloads go to `<dir>/editai/references/<name>/`. The measurement runs editonny's `measure_reference.py` and `filmstrip.py` by subprocess, offline and without writing into the editonny install; without editonny the fallback measures cuts and loudness only.
2. Open `measure/contact-sheets/*.jpg`, `measure/hook-filmstrip.jpg` and `measure/style-guide.md`. Correct in `apply` what the frames contradict (on Windows on-screen text is located, not read; a caption band may be a prop), add one line per change to `review_notes` and set its `origin` to `reviewed`.
3. `bun lib/edit-engine/cli.ts style-check <dir>/editai/styles/<name>.style.json` validates it and rewrites the `.style.md` report.

## Output
`<dir>/editai/styles/<name>.style.json` and `<name>.style.md`; `<dir>/editai/references/<name>/measure/` (rules, guide, contact sheets, filmstrip).

## Acceptance Criteria
- `style-check` prints `valid`.
- The profile has the `source.sha256` of the measured file and a non-empty `not_reproduced` list.
- Every value changed by hand has origin `reviewed` and a line in `review_notes`.
- No speech, music, brand or on-screen words of the reference appear in `apply`.
- Nothing was written in the squad folder or in the editonny install.

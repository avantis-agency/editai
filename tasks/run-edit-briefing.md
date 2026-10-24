---
name: run-edit-briefing
description: "Turn what the person sent (video, text, audio transcript, reference) into a confirmed edit plan: only the missing questions (0 to 5, multiple choice with an outro option), a suggested plan ending in Posso editar?, and a client profile saved in the user's project."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: runEditBriefing()
responsavel: "Edit Briefing Guide"
responsavel_type: Agente
atomic_layer: Strategy
Entrada:
  - nome: message
    tipo: string
    obrigatorio: false
    descricao: "what the person wrote, or an audio transcript"
  - nome: material
    tipo: array
    obrigatorio: true
    descricao: "clip, photo or screen-recording paths"
  - nome: client
    tipo: string
    obrigatorio: true
    descricao: "client or project name"
  - nome: reference
    tipo: string
    obrigatorio: false
    descricao: "reference video file or link"
  - nome: project_dir
    tipo: string
    obrigatorio: true
    descricao: "the user's project folder (--project or EDITAI_PROJECT), never the squad"
Saida:
  - nome: brief_state
    tipo: file
    obrigatorio: true
    descricao: "<project>/editai/briefs/<id>/state.json, questions and plan.md"
  - nome: client_profile
    tipo: file
    obrigatorio: true
    descricao: "<project>/editai/profiles/<client>.json"
  - nome: edit_style
    tipo: file
    obrigatorio: true
    descricao: "edit.style.json"
Checklist:
  - "at most 5 questions per round, at most 1 when destination, format and mood were given"
  - "every question has an other option, except the yes/no first-use question"
  - "state.json records first_use; welcome.md exists only when first_use.status is yes"
  - "plan.md ends with Posso editar?"
  - "after confirmation the profile and edit.style.json exist and style-check prints valid"
  - "nothing was written inside the squad folder"
---

# Run edit briefing

## Input
- The person's message, any audio transcript, the material paths, an optional reference (file or link), the client or project name.
- The user's project folder (`--project`, or `EDITAI_PROJECT`); never the squad folder.

## Steps
1. Write `entrada.json` and run `bun lib/edit-engine/cli.ts brief entrada.json --project <dir>`. A saved profile for the client makes the first question "Mesmo estilo da última vez?". Add `"session": "ongoing"` when the squad already ran in this conversation, `"first_use": true|false` when the person said whether it is the first time, `"lang": "en"` for English.
2. First use, from `state.json` → `first_use`: with `show_now` true, show `welcome.md` (7 lines) before the questions or the plan of the same round; with `status` `ask`, the round is only "É a primeira vez usando o squad?" (yes/no) and the answer opens the next round; with `no`, nothing about first use.
3. Ask the listed questions: Claude Code with `AskUserQuestion` from `questions-r<N>.ask.json` (4 questions per call, 4 options each, "Other" added by Claude Code); any other runtime with the numbered list in `questions-r<N>.md`.
4. `bun lib/edit-engine/cli.ts brief <state.json> --answers "1=2, 2=Outro: ..."` (or `--answers-json` keyed by question header). Repeat when the engine opens a second round.
5. Show `plan.md`; it ends with "Posso editar?". On yes run `brief <state.json> --confirm [--adjust "k=v"]`.

## Output
`<project>/editai/briefs/<id>/state.json`, `questions-r*.ask.json`, `questions-r*.md`, `welcome.md` (first use only), `plan.md`, `edit.style.json`; `<project>/editai/profiles/<client>.json`.

## Acceptance Criteria
- `state.json` lists at most 5 questions per round, and at most 1 when the message gave destination, format and mood.
- Every question has an option whose value is `other`, except the yes/no question whose id is `first_use`.
- `state.json` has a `first_use` block; `welcome.md` exists only when `first_use.status` is `yes`, and its welcome has at most 8 lines.
- `plan.md` ends with the line "Posso editar?".
- After confirmation `editai/profiles/<client>.json` and `edit.style.json` exist under the project folder, and `bun lib/edit-engine/cli.ts style-check edit.style.json` prints `valid`.
- No file was written inside the squad folder.

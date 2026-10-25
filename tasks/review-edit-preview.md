---
name: review-edit-preview
description: "Open a rendered edit in the local mini editor (browser, 127.0.0.1) so a person can change the headline and captions and see it at once, render a quick draft, approve, and finalize to Downloads with the full QA; marks, take trims, undo and versions included, all saved to feedback.json."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: reviewEditPreview()
responsavel: "Retention Editor"
responsavel_type: Agente
atomic_layer: Media
Entrada:
  - nome: edit_spec
    tipo: file
    obrigatorio: true
    descricao: "resolved <id>.spec.json with the rendered MP4 next to it (or --video)"
  - nome: final_name
    tipo: string
    obrigatorio: false
    descricao: "name of the final's copy in Downloads"
  - nome: downloads
    tipo: string
    obrigatorio: false
    descricao: "folder for the final's copy (default ~/Downloads)"
Saida:
  - nome: feedback
    tipo: file
    obrigatorio: true
    descricao: "<id>.feedback.json and <id>.versions.json next to the spec"
  - nome: drafts_and_finals
    tipo: file
    obrigatorio: false
    descricao: "<id>-draftN and <id>-finalN renders, the final with QA"
  - nome: pending_notes
    tipo: file
    obrigatorio: false
    descricao: "pending-notes.md with free-text marks"
Checklist:
  - "server.json reported a http://127.0.0.1 URL while the review ran"
  - "feedback.json has feedback_version 1 and revision >= 1, or nothing to change"
  - "every final has a QA report and a FAIL final is never copied to Downloads"
  - "server.json says stopped after the review"
---

# Review edit preview (mini editor)

## Input
A rendered `<id>.mp4` with its resolved `<id>.spec.json` in the same folder (or `--video <mp4>`). Optional: the name of the final's copy in Downloads (`--final-name "<Cliente> - <tema> - final"`, default derived from the spec id: `loja-vestido-v2` gives `Loja - vestido - final vN.mp4`) and the folder (`--downloads DIR`, default `~/Downloads`).

## Steps
1. Start it: `bun lib/edit-engine/cli.ts preview <id>.spec.json [--port 4840] [--open] [--final-name "..."] [--downloads DIR]`. It listens on 127.0.0.1 only and writes `preview_cache/server.json` with `status` and `url`; read the URL there, never from the log.
2. Hand the person the URL (PT-BR UI). The Editor tab (default):
   - the player plays a clean base of the spec (no headline, no captions; rendered once at 540x960 when the page opens, a few seconds) and the page draws the headline and captions over it, in sync with the video, with the render's font, position, size fit and animation. A note says it is an approximation;
   - controls, saved on their own: headline text (1 to 3 lines), "o vídeo todo" or "só nos 3 primeiros segundos", size 80 to 120 %; caption style (palavra que cresce = bold-word, or clássica); click a caption word to correct it or turn its yellow keyword on or off; music on or off and its volume; whoosh on or off. Sound changes show only in the quick draft;
   - "Gerar prévia rápida": applies everything saved (trims, music, gain, whoosh included), renders `<id>-draftN.mp4` at 540x960 and puts it in the player, with a progress bar;
   - "Aprovar": approves the video in the player (the original, a draft or a final), by sha256;
   - "Finalizar": enabled while the approved video matches the current changes; renders `<id>-finalN.mp4` at 1080x1920, runs the full QA and, if it is not FAIL, copies it to Downloads under a name that does not exist yet. On FAIL the page says why in Portuguese and copies nothing;
   - "Desfazer" undoes the last change; "Versões" lists the original, drafts and finals with "Ver" and "Voltar a esta" (restores the changes that version was made from, undoable).
   - editor com IA (1.7.0): the box "Você pede" sends a request with the cursor time and the selection of the 5 tracks below the player (Vídeo, Legenda, Edição, B-roll, Áudio; drag the ruler to move the cursor, drag on a track to select). Quick commands are applied at once and render a quick draft; free requests wait in `<id>.requests.json` for the person's agent (task `serve-editor-requests`). "A IA edita" lists each request with its status (na fila, aplicando, feito, precisa de você, não deu, desfeito), the answer and its own Desfazer.
   The Linha do tempo tab keeps the timeline of the reviewed MP4, marks with a free note (they need the retention-editor; they go to `pending-notes.md`) and take trims.
3. One render at a time; the buttons are disabled while it runs. Wait for the person to say they are done.
4. Stop it: `bun lib/edit-engine/cli.ts preview <id>.spec.json --stop` (it stops a running render too). `server.json` must end with `"status": "stopped"`.

## Output
Next to the spec: `<id>.feedback.json` (`feedback_version` 1, with `undo`), `<id>.versions.json`, every `<id>-draftN.*` and `<id>-finalN.*` (MP4, PNG, plan and resolved spec; the final with `.qa.md` and `.qa.json`), `pending-notes.md`; the final's copy in Downloads; `preview_cache/` (clean base, strips, job status, `server.json`).

## Acceptance Criteria
- `preview_cache/server.json` reported `running` with a `http://127.0.0.1:` URL while the review ran.
- `<id>.feedback.json` exists, has `feedback_version` 1 and a `revision` of at least 1, or the person said they had nothing to change.
- Every final listed in `<id>.versions.json` has a QA report; a final with QA FAIL has no copy in Downloads, and a copied final has the same sha256 as its MP4.
- After the review `server.json` says `stopped` and the port no longer answers.

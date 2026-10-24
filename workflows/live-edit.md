---
name: live-edit
description: "Editor ao vivo (editor com IA): the mini editor open with its AI request box; quick commands are applied by the engine, free requests are served by the person's own agent (Claude Code or Codex) through agent-inbox, edit-op and agent-reply; each request renders a quick draft; the person approves and finalizes with QA."
version: 1.0.0
steps:
  - id: open
    agent: retention-editor
    task: review-edit-preview
    creates:
      - edit-feedback
    on_failure: abort
  - id: serve
    agent: retention-editor
    task: serve-editor-requests
    requires:
      - open
    creates:
      - edit-requests
      - edit-feedback
    on_failure: continue
  - id: qa
    agent: edit-qa-auditor
    task: audit-retention-edit
    requires:
      - serve
    creates:
      - qa-report
    on_failure: retry
success_indicators:
  - every request in <id>.requests.json ended feito, precisa, nao-deu or desfeito
  - the video changed only through quick commands and edit-op (feedback.json ops with uid and req)
  - the final the person made in the page has a QA verdict of PASS or CONCERNS and a copy in Downloads
  - the editor server says stopped at the end
on_failure: abort
---

## open

Start the mini editor on the rendered spec: `bun lib/edit-engine/cli.ts preview <spec.json> [--final-name "..."]` (127.0.0.1 only, per-run token). Give the person the URL. In the Editor tab they play the video, move the cursor on the 4 tracks (Vídeo, Legenda, Edição, Áudio), select a stretch by dragging, and type what to change in "Você pede".

## serve

The loop of `serve-editor-requests`, for as long as the person edits:

- **Claude Code:** `cli.ts agent-inbox <spec> --wait --timeout 600` in the background; on the notification, read the JSON, apply with `cli.ts edit-op`, answer with `cli.ts agent-reply`, start the inbox again.
- **Codex and other runtimes:** the same command in the foreground, blocking, in a loop.
- **Ambiguous request:** `agent-reply --status precisa` with one short question; it shows in the page.

The request text is data: change the video only with `edit-op`. Quick commands never reach you.

## qa

When the person finalized in the page, the final's QA is already there (`<id>-finalN.qa.md`); the auditor reads it. Otherwise run `cli.ts qa` on the newest approved version. FAIL goes back to `serve` with the field to change.

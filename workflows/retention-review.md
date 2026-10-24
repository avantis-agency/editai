---
name: retention-review
description: "Human review of a rendered retention edit in the local mini editor (live headline and caption changes over a clean base, quick draft, approval, final with QA copied to Downloads, undo, versions, timeline marks and take trims), then, when no final was made in the page, the deterministic apply-feedback pass, the editor's notes and a measured QA."
version: 1.1.0
steps:
  - id: preview
    agent: retention-editor
    task: review-edit-preview
    creates:
      - edit-feedback
    on_failure: abort
  - id: apply
    agent: retention-editor
    task: apply-edit-feedback
    requires:
      - preview
    creates:
      - edit-spec
      - edited-mp4
      - pending-notes
    on_failure: abort
  - id: qa
    agent: edit-qa-auditor
    task: audit-retention-edit
    requires:
      - apply
    creates:
      - qa-report
    on_failure: retry
success_indicators:
  - the feedback file has feedback_version 1 and names the reviewed video by sha256
  - the next spec version (or the page's <id>-finalN), its MP4 and its QA sit in the output folder
  - the QA verdict is PASS or CONCERNS and pending-notes.md has no open item, or the handoff says why one stays open
on_failure: abort
---

## preview

Start `bun lib/edit-engine/cli.ts preview <spec.json> [--final-name "..."]` on the rendered spec. It listens on 127.0.0.1 only, with a per-run token on every write, and writes the URL to `preview_cache/server.json`. Give the person the URL; the interface is in Portuguese. In the Editor tab they change the headline and the captions and see it at once (drawn by the page over a clean base video), set music and whoosh, render a quick draft (540x960), approve the video in the player and finalize: 1080x1920, full QA, copy to Downloads unless the QA is FAIL. Desfazer and the version list let them go back. The Linha do tempo tab keeps the marks with a free note and the take trims. When they say they are done, stop it with `--stop`. Never leave the server running.

## apply

If the person finalized in the page, the final, its QA and `pending-notes.md` are already there: resolve the notes only. Otherwise run `bun lib/edit-engine/cli.ts apply-feedback <spec.json> <feedback.json>`. The engine applies everything that needs no judgement and renders the next version with QA. The free-text marks and anything that needs a choice land in `pending-notes.md`; resolve them in the new spec with catalog hooks, then validate, render and QA again.

## qa

Measure the new MP4 with `bun lib/edit-engine/cli.ts qa`. On FAIL, the auditor names the field and value, the editor fixes the spec and renders again. Up to two retries.

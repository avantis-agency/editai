---
name: retention-edit
description: "Existing material to a retention-edited 9:16 MP4: template and hooks into an edit spec, ffmpeg render, measured edit QA, and an optional human review in a local browser preview with apply-feedback."
version: 1.3.0
steps:
  - id: plan
    agent: retention-editor
    task: plan-retention-edit
    creates:
      - edit-spec
    on_failure: abort
  - id: render
    agent: retention-editor
    task: render-edit-spec
    requires:
      - plan
    creates:
      - edited-mp4
      - frame-png
    on_failure: abort
  - id: qa
    agent: edit-qa-auditor
    task: audit-retention-edit
    requires:
      - render
    creates:
      - qa-report
    on_failure: retry
  - id: review
    agent: retention-editor
    task: review-edit-preview
    requires:
      - qa
    creates:
      - edit-feedback
    on_failure: continue
    meta:
      when: "input.review == true"
  - id: apply-feedback
    agent: retention-editor
    task: apply-edit-feedback
    requires:
      - review
    creates:
      - edit-spec
      - edited-mp4
      - pending-notes
      - qa-report
    on_failure: retry
    meta:
      when: "input.review == true"
success_indicators:
  - the MP4 is h264 yuv420p at the spec size and frame rate
  - the resolved spec sits next to the MP4
  - the QA verdict is PASS or CONCERNS
on_failure: abort
---

## plan

Read the brief, the material and the text source. Recorded speech gets the standard cleanup first (`cli.ts cut`: pauses, breaths, false starts and repeated takes out on measured waveform edges, emphasis kept, proven by `verify_cut` and `audit_cut`), unless the person asked to keep it as it is; a sermon, a church service or "sem cortes" plays whole instead (`cut --continuous`, `"cut": "none"`: no pause out, no punch-in, zoom or reframe). Its `cut.json` feeds the talking-head batch. A 16:9 recording for a vertical destination is reframed following the face (`reframe`). Choose the template whose format matches the material: a photo plus a written hook is `text-only`; a person plus an app recording is `pov-app-screen`; two sides of a comparison is `this-vs-that`; a speaker with word timings is `talking-head-captions`. Fill the slots, inspect a gridded frame to declare eyes and mouth, and hand a spec that `cli.ts validate` accepts. A talking head that should get B-roll by itself uses `talking-head-broll`: `cli.ts broll-suggest` matches the client media in `<project>/editai/broll/` to spoken words and asks the installed editonny 1.0.0 for cards, then `cli.ts broll-render` draws them (without editonny, exit 3 and client media only).

## render

Render with `bun lib/edit-engine/cli.ts render`. The engine measures each text block before encoding and moves or shrinks it to clear the target platforms' unsafe rectangles; the fit log ends up in the resolved spec. A "cannot shrink" note sends the spec back to `plan` with a shorter line or a lower `text_y`.

## qa

Measure with `bun lib/edit-engine/cli.ts qa` and look at the PNG. On FAIL, the auditor returns the field and the value to change, the editor replans, and the render runs again. Up to two retries; after that the run stops with the FAIL report, never with an unverified MP4.

## review (optional)

Runs only when the brief asks for a human review ("quero revisar no navegador", "abre a prévia", "review it on a timeline"). After a PASS or CONCERNS, open the local preview with `bun lib/edit-engine/cli.ts preview <id>.spec.json` (127.0.0.1 only, PT-BR interface) and hand the person the URL from `preview_cache/server.json`. Their marks, take trims, style picks, caption fixes and approval go to `<id>.feedback.json`. Stop it with `--stop` when they are done. A person who closes without saving is not a failure: the run ends with the QA'd MP4.

## apply-feedback (optional)

`bun lib/edit-engine/cli.ts apply-feedback <id>.spec.json <id>.feedback.json` writes the next version (`-vN`), applies what needs no judgement, renders and runs the QA. The free-text marks wait in `pending-notes.md` for the editor, who resolves them and renders again. An approval with no changes ends the run on the approved file.

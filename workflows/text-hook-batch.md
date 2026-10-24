---
name: text-hook-batch
description: "List of approved text hooks plus base media to one text-only 9:16 MP4 per hook, with spec, frame, measured QA and a batch report."
version: 1.0.0
steps:
  - id: plan-batch
    agent: retention-editor
    task: plan-text-hook-batch
    creates:
      - batch-json
    on_failure: abort
  - id: render-batch
    agent: retention-editor
    task: render-edit-spec
    requires:
      - plan-batch
    creates:
      - edited-mp4s
      - batch-report
    on_failure: abort
  - id: audit-batch
    agent: edit-qa-auditor
    task: audit-retention-edit
    requires:
      - render-batch
    creates:
      - qa-reports
    on_failure: retry
success_indicators:
  - one MP4, spec, PNG and QA report per hook
  - every QA report has text_exact_hook ok
  - batch-report.md lists no FAIL
on_failure: abort
---

## plan-batch

Copy each hook's on-screen text verbatim from its note (the English text that goes in the video, not the translation) into `hook_lines` and `expected_text`, with the note path as `source_note`. One gridded-frame inspection per distinct base image sets `protect_regions`, `text_y` and `focus`. Default template `text-only`: staggered text entrance, slow push, impact zoom with a hit at 2.5 s, whoosh on the entrance.

## render-batch

`bun lib/edit-engine/cli.ts batch batch.json` renders two items at a time (no resident process, so a batch of ten takes about a minute on a laptop) and writes the QA per item. Exit code 1 means at least one FAIL.

## audit-batch

The auditor reads each `.qa.md`, looks at each PNG, adds the judged lines and writes `edit-qa-summary.md`. Any FAIL item goes back to `plan-batch` alone; the items that passed are not re-rendered.

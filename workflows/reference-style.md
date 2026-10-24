---
name: reference-style
description: "Copy the editing style of a reference video: measure it into a style profile in the user's project, apply it to the person's footage, quick draft, final with QA and the mini editor for approval."
version: 1.0.0
steps:
  - id: extract
    agent: edit-briefing-guide
    task: extract-reference-style
    creates:
      - style-profile
    on_failure: abort
  - id: apply
    agent: retention-editor
    task: apply-reference-style
    requires:
      - extract
    creates:
      - edited-mp4
      - edit-spec
    on_failure: abort
  - id: qa
    agent: edit-qa-auditor
    task: audit-retention-edit
    requires:
      - apply
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
success_indicators:
  - the style profile validates with cli.ts style-check and lists what it does not reproduce
  - the final MP4 has a QA verdict of PASS or CONCERNS and audio as long as the video
  - references, profiles and outputs sit in the user's project
on_failure: abort
---

## extract

`cli.ts style-extract <file|link> --name <name> --project <dir>`. TikTok and YouTube links go through yt-dlp, YouTube with the mweb client. An Instagram link goes through Apify only with `APIFY_TOKEN` set; without it, ask for the file. The measurement is editonny's `measure_reference.py` and `filmstrip.py` by subprocess. The agent checks the contact sheet, fixes what the frames contradict and records it in `review_notes`.

## apply

`cli.ts style-apply <style.json> <batch.json>` gives the quick draft, then the final with QA. The reference pace becomes zoom cuts in the speech pauses, and text that would land on the eyes or mouth moves out of the face.

## qa

As in `retention-edit`. A FAIL names the field, usually a text position, fixed in the profile's `apply` or in the batch's `protect_regions`.

## review

`cli.ts preview <id>.spec.json` opens the mini editor, where the person approves and finalizes. Stop it with `--stop`.

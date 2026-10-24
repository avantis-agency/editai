---
name: video-compose
description: "One clip from a brief and optional hero image: probe engines, generate, apply audio policy, record the dispatch."
version: 3.0.0
steps:
  - id: select-engine
    agent: VEO_VIDEO
    task: video-compose
    creates:
      - compose-plan
    on_failure: abort
  - id: generate
    agent: video-generator
    task: generate-video-clip
    requires:
      - select-engine
    creates:
      - clip
    on_failure: abort
  - id: audio-policy
    agent: audio-producer
    task: synthesize-audio
    requires:
      - generate
    creates:
      - composed
    on_failure: continue
  - id: record
    agent: video-quality-auditor
    task: audit-video-quality
    requires:
      - audio-policy
    creates:
      - handoff
    on_failure: continue
  - id: retention-plan
    agent: retention-editor
    task: plan-retention-edit
    requires:
      - record
    creates:
      - edit-spec
    on_failure: continue
  - id: retention-render
    agent: retention-editor
    task: render-edit-spec
    requires:
      - retention-plan
    creates:
      - edited-mp4
    on_failure: continue
  - id: retention-qa
    agent: edit-qa-auditor
    task: audit-retention-edit
    requires:
      - retention-render
    creates:
      - edit-qa-report
    on_failure: retry
success_indicators:
  - the retention-edited MP4 has a QA report that is not FAIL, or the brief declared the edit pass off
  - composed MP4 exists on disk
  - silent hero has no dialogue; published destination has audio
  - handoff names engine_used and the probe that passed
on_failure: abort
---

## select-engine

Read `lib/video-fundamentals/ENGINE-MENU.md`, `FUNDAMENTALS.md`, `AUDIO-POLICY.md`, `CREDIT-DISCIPLINE.md`. Probe live engines. Pick one. Snap duration to that engine's legal lengths. Hero/background loop = audio off. Instagram/YouTube/TikTok = audio on plus captions. Write `compose-plan.yaml` (engine, duration, aspect, audio, hero image path if any).

## generate

Execute the plan. One clip, legal duration. If the brief is longer than the engine allows, generate 2-3 clips and leave concat to the next step. Download to `clips/compose-001.mp4`.

## audio-policy

Silent destination: strip or never request speech. Published destination: keep native engine audio when present; otherwise synthesize a bed and mux. Write `outputs/composed.mp4`.

## record

ffprobe the file. Write `handoff.json` with engine_used, probe, duration, aspect, audio on/off, file path, cost estimate. A missing file is FAIL, not a prose apology.

## retention-plan

Retention edit pass added by EditAi. Input: `outputs/composed.mp4`. Skip with a one-line `edit-handoff.md` ("edit pass off: <reason>") when the brief turns it off or the destination is a silent website loop. Otherwise the retention-editor picks the template (talking head when there is speech and word timings, text-only for a silent clip), writes the spec with the brief's hook text verbatim, and validates it.

## retention-render

`bun lib/edit-engine/cli.ts render` writes the edited MP4 next to the original as `*-edited.mp4`, with its resolved spec and PNG frame. The unedited master stays on disk.

## retention-qa

`bun lib/edit-engine/cli.ts qa` plus the auditor's look at the frame. A FAIL loops back to retention-plan at most twice.

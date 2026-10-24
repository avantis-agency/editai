---
name: long-form-multi-shot
description: "30s+ narrative: 5+ shots generated in order with last-frame to first-frame conditioning on every continuity join."
version: 3.0.0
steps:
  - id: shot-list
    agent: video-director
    task: build-shot-list
    creates:
      - shot-list
    on_failure: abort
  - id: character-anchors
    agent: character-consistency-keeper
    task: plan-character-lora
    requires:
      - shot-list
    creates:
      - character-anchors
    on_failure: continue
  - id: chained-routing
    agent: tool-router
    task: route-video-tool
    requires:
      - character-anchors
    creates:
      - routing-plan
    on_failure: abort
  - id: chain-prompts
    agent: prompt-architect
    task: write-engine-prompt
    requires:
      - chained-routing
    creates:
      - prompts
    on_failure: abort
  - id: generate-shots
    agent: video-generator
    task: generate-video-clip
    requires:
      - chain-prompts
    creates:
      - clips
    on_failure: abort
  - id: chain-continuity
    agent: shot-stitcher
    task: stitch-shots
    requires:
      - generate-shots
    creates:
      - master
      - continuity-metrics
    on_failure: abort
  - id: continuity-audit
    agent: video-quality-auditor
    task: audit-video-quality
    requires:
      - chain-continuity
    creates:
      - audit-report
    on_failure: retry
  - id: retention-plan
    agent: retention-editor
    task: plan-retention-edit
    requires:
      - continuity-audit
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
  - at least 5 shots, at least one continuity_chain
  - every continuity join was generated with the previous last frame as start image
  - continuity-metrics.json has one row per join
  - outputs/master.mp4 exists
on_failure: abort
---

## shot-list

A 30 s+ brief is a sequence, never one clip. Split into 5 or more shots whose durations are legal for dual-keyframe engines this run: Kling, Veo first-last, Higgsfield Seedance, Luma Ray, Wan FLF2V. Confirm each enum on the live card. Mark scene-internal joins `continuity_chain` and scene cuts `hard_cut`. Write `shot-list.csv` with the same columns as the main pipeline.

## character-anchors

Recurring character in 10+ shots: write a LoRA plan (dataset size 15-30 stills, expected output path) and the immutable anchor. Under 10 shots: anchor only, `lora_required: false`. No character: `characters_required: false`.

## chained-routing

Prefer live engines that accept a start image and an end image. Probe first. A continuity_chain shot whose primary cannot take a start frame is a routing defect: pick Kling, Seedance, Veo first-last, Luma or Wan instead. Fallback must also accept a start frame.

## chain-prompts

Motion-first I2V dialect. Inject the anchor unchanged. Continuity shots include `{anchor} continues from the previous pose, now {action}`. Negative: morphing, identity change, flicker, teleport.

## generate-shots

Story order, never shuffled. Shot 1 is text-to-video or image-to-video from the hero. Every later `continuity_chain` shot is image-to-video with `keyframes/{prev}_last.png` as the start frame. Extract that PNG before the next call. Hard-cut shots may start fresh. Download each MP4 before starting the next.

## chain-continuity

Concat in list order to `outputs/master.mp4` at the brief's aspect. Write `continuity-metrics.json`: for each continuity join, ffmpeg SSIM (or histogram correlation) between last frame of N and first frame of N+1. Target SSIM >= 0.85. Face-embedding < 0.15 only when an insightface binary is already on PATH; otherwise record `face_drift: not_measured` and do not fabricate a number.

## continuity-audit

FAIL a join below the SSIM target. Retry regenerates that shot with a stronger continuity phrase and the same start frame, twice. Then ship CONCERNS if it still misses. Identity across 10+ shots without a LoRA is CONCERNS, not a silent PASS.

## retention-plan

Retention edit pass added by EditAi. Input: `outputs/master.mp4`. Skip with a one-line `edit-handoff.md` ("edit pass off: <reason>") when the brief turns it off or the destination is a silent website loop. Otherwise the retention-editor picks the template (talking head when there is speech and word timings, text-only for a silent clip), writes the spec with the brief's hook text verbatim, and validates it.

## retention-render

`bun lib/edit-engine/cli.ts render` writes the edited MP4 next to the original as `*-edited.mp4`, with its resolved spec and PNG frame. The unedited master stays on disk.

## retention-qa

`bun lib/edit-engine/cli.ts qa` plus the auditor's look at the frame. A FAIL loops back to retention-plan at most twice.

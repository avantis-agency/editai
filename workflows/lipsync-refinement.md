---
name: lipsync-refinement
description: Re-sync lips on existing footage. Does not generate new video.
version: 3.0.0
steps:
  - id: intent
    agent: video-intent-archaeologist
    task: interview-video-intent
    creates:
      - video-intent-brief
    on_failure: abort
  - id: dub-audio
    agent: audio-producer
    task: synthesize-audio
    requires:
      - intent
    creates:
      - audio
    on_failure: continue
  - id: lipsync
    agent: lipsync-specialist
    task: apply-lipsync
    requires:
      - dub-audio
    creates:
      - clips-lipsynced
    on_failure: abort
  - id: lse-audit
    agent: video-quality-auditor
    task: audit-video-quality
    requires:
      - lipsync
    creates:
      - audit-report
    on_failure: retry
  - id: retention-plan
    agent: retention-editor
    task: plan-retention-edit
    requires:
      - lse-audit
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
  - outputs/lipsynced.mp4 exists at the source resolution
  - LSE is at or below the brief's tier threshold
  - audio stream is present
on_failure: abort
---

## intent

The source video path must be in the brief or a labelled premise naming the file that was not attached. Capture target language, quality tier (broadcast / good / acceptable) and whether a new voice track must be synthesized. Do not generate pictures. Do not wait for a human.

## dub-audio

If the brief already points at a voice track, copy it to `audio/dialogue.wav` and skip synthesis. Otherwise synthesize the target-language track (Google Cloud TTS Chirp or ElevenLabs when `ELEVENLABS_API_KEY` is set), loudnorm to -12 LUFS, write `audio/dialogue.wav`.

## lipsync

Pick the live tool by tier: Sync.so live broadcast model this run (vendor API page); Hedra when the language is outside the native set; a local binary only if it is already on PATH. POST video + audio, poll, download to `outputs/lipsynced.mp4`. Confirm width and height equal the source via ffprobe. Do not downscale.

## lse-audit

Compare measured LSE to the tier: broadcast <= 1.5, good <= 3, acceptable <= 5. Prefer the provider's own score when Sync.so returns one. Resolution must match source. FAIL retries lipsync with the live broadcast model if a weaker model was used, twice, then ships CONCERNS.

## retention-plan

Retention edit pass added by EditAi. Input: `outputs/lipsynced.mp4`. Skip with a one-line `edit-handoff.md` ("edit pass off: <reason>") when the brief turns it off or the destination is a silent website loop. Otherwise the retention-editor picks the template (talking head when there is speech and word timings, text-only for a silent clip), writes the spec with the brief's hook text verbatim, and validates it.

## retention-render

`bun lib/edit-engine/cli.ts render` writes the edited MP4 next to the original as `*-edited.mp4`, with its resolved spec and PNG frame. The unedited master stays on disk.

## retention-qa

`bun lib/edit-engine/cli.ts qa` plus the auditor's look at the frame. A FAIL loops back to retention-plan at most twice.

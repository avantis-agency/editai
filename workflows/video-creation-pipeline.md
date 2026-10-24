---
name: video-creation-pipeline
description: "Brief to master MP4: intent, direction, characters, routing, prompts, generate-with-chain, lipsync, concat, audio, audit."
version: 3.0.0
steps:
  - id: intent
    agent: video-intent-archaeologist
    task: interview-video-intent
    creates:
      - video-intent-brief
    on_failure: abort
  - id: direct
    agent: video-director
    task: direct-video
    requires:
      - intent
    creates:
      - script
      - storyboard
      - shot-list
    on_failure: abort
  - id: characters
    agent: character-consistency-keeper
    task: create-character-bible
    requires:
      - direct
    creates:
      - character-anchors
    on_failure: continue
  - id: route
    agent: tool-router
    task: route-video-tool
    requires:
      - direct
      - characters
    creates:
      - routing-plan
    on_failure: abort
  - id: prompts
    agent: prompt-architect
    task: write-engine-prompt
    requires:
      - route
    creates:
      - prompts
    on_failure: abort
  - id: generate
    agent: video-generator
    task: generate-video-clip
    requires:
      - prompts
    creates:
      - clips
    on_failure: abort
  - id: lipsync
    agent: lipsync-specialist
    task: apply-lipsync
    requires:
      - generate
    creates:
      - clips-lipsynced
    on_failure: continue
  - id: stitch
    agent: shot-stitcher
    task: stitch-shots
    requires:
      - lipsync
    creates:
      - master
    on_failure: abort
  - id: audio
    agent: audio-producer
    task: synthesize-audio
    requires:
      - stitch
    creates:
      - audio-mix
    on_failure: continue
  - id: audit
    agent: video-quality-auditor
    task: audit-video-quality
    requires:
      - audio
    creates:
      - audit-report
    on_failure: retry
  - id: retention-plan
    agent: retention-editor
    task: plan-retention-edit
    requires:
      - audit
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
  - outputs/master.mp4 exists and ffprobe reports a video stream
  - every shot duration is legal for its engine
  - continuity_chain shots were generated with the previous last frame
  - audit-report.md has a per-clip table and an overall verdict
on_failure: abort
---

## intent

Read the brief once. Do not interview. Extract duration, platform, aspect, language, dialogue, quality tier. Anything missing becomes a labelled premise in `video-intent-brief.md`. A 30 s reel is never one generation: snap the total into legal clip lengths from the likely engine's live card this run. House snap when the brief is silent and the card still allows it: Veo 8+8+8+6 or Grok 10+10+10. Write the file and stop.

## direct

Consume the intent brief. Write `script.md` (logline, treatment, shot-by-shot action and quoted dialogue), `storyboard.md` (one keyframe description per shot), and `shot-list.csv` with columns `shot_id,scene,duration_sec,action,characters,camera,lens,lighting,location,audio_notes,transition_from_prev,engine_hint`. Sum of `duration_sec` equals the brief duration within 15 percent. `transition_from_prev` is `hard_cut` or `continuity_chain`. First shot is always `hard_cut`.

## characters

If the shot list names a character in 3 or more shots, write `character-anchors.yaml` with an immutable 20-30 token anchor per character. If no recurring character, write `characters_required: false` and continue. Do not wait for reference photos: declare the gap and proceed with the anchor.

## route

Probe live engines (Grok CLI, `GOOGLE_API_KEY`/`GEMINI_API_KEY`, `FAL_KEY`, Higgsfield, `RUNWAY_API_KEY`, `XAI_API_KEY`). Cross the dead ones off. For each shot pick primary + fallback from the live set using `lib/video-fundamentals/ENGINE-MENU.md` and `data/tool-registry.yaml`. Record probe, reason, estimated cost, `audio: on|off` from AUDIO-POLICY. Never assign an engine whose max legal duration is below the shot's `duration_sec`; shorten the shot or split it instead.

## prompts

One entry per shot in `prompts.yaml`, in that engine's dialect from `data/prompt-templates.yaml`. Inject the character anchor unchanged. Continuity shots get the phrase `{anchor} continues from the previous pose, now {action}`. I2V engines get a negative prompt against morphing, flicker and identity change.

## generate

Call the live engine. Download immediately to `clips/{shot_id}.mp4`. For every `continuity_chain` shot after the first, extract the last frame of the previous clip (`ffmpeg -sseof -0.04 -i prev.mp4 -frames:v 1 -update 1 keyframes/{prev}_last.png`) and pass it as the start image / first-frame of this call. On 429 backoff; on non-429 4xx switch to the fallback. Log every call in `generation-log.jsonl`. Legal durations only.

## lipsync

Skip when the clip has no dialogue, or when native A/V (Veo, Kling, Grok Imagine) already holds the tier on a spot-check. Otherwise apply the live Sync.so broadcast model this run, Hedra for a language the native engine does not speak, and write `clips-lipsynced/{shot_id}.mp4`. Preserve resolution.

## stitch

Concat the clips (lipsynced when present) into `outputs/master.mp4` with ffmpeg, scaling to the intent aspect and fps, not the 720x1280 hardcoded in `unir-clipes.sh` unless the brief is 9:16 at 720p. Write `edl.csv`. Measure each continuity join (histogram correlation via ffmpeg `signature` or `ssim`). Do not invent face-embedding scores if insightface is not installed: record `metric: ffmpeg-ssim` and the number.

## audio

If the destination is a silent hero loop, strip dialogue and write `audio: off` in the handoff. If published, ensure three layers at -12 / -18 / -24 LUFS (dialogue / SFX / ambience) and mux onto the master. Prefer native engine audio when it already exists; synthesize only the missing layer.

## audit

Measure, do not eyeball. Flicker via ffmpeg SSIM, LSE from the lipsync log or a SyncNet binary if present, resolution and duration via ffprobe. Verdict is PASS, CONCERNS or FAIL. FAIL names the shot and the remediation from `data/pitfalls-mitigations.yaml`. A FAIL retries `generate` for that shot only, twice, then ships CONCERNS with the gap labelled. Never inflate PASS.

## retention-plan

Retention edit pass added by EditAi. Input: `outputs/master.mp4`. Skip with a one-line `edit-handoff.md` ("edit pass off: <reason>") when the brief turns it off or the destination is a silent website loop. Otherwise the retention-editor picks the template (talking head when there is speech and word timings, text-only for a silent clip), writes the spec with the brief's hook text verbatim, and validates it.

## retention-render

`bun lib/edit-engine/cli.ts render` writes the edited MP4 next to the original as `*-edited.mp4`, with its resolved spec and PNG frame. The unedited master stays on disk.

## retention-qa

`bun lib/edit-engine/cli.ts qa` plus the auditor's look at the frame. A FAIL loops back to retention-plan at most twice.

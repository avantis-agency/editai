# State of the art: snapshot (refresh, do not copy into agents)

This is the **only** dated snapshot of facts that live outside this squad.
Operating prose in `agents/`, `tasks/`, `workflows/`, `lib/`, `data/` and the
README engines section must **resolve** the live value and write it into the
run output. If a number here disagrees with the API or the docs this run, the
API and the docs win.

**Refresh:** once per quarter, or when a run's resolved value differs from
a row below. For each claim: re-run the resolve command, update `verified`,
keep the named source. Do not scatter the new numbers back into agents.

| Claim | Last verified | Resolve this run | Source |
|---|---|---|---|
| Gemini API Veo generate id | 2026-09-03: `veo-3.1-generate-preview` (fast: `veo-3.1-fast-generate-preview`; lite: `veo-3.1-lite-generate-preview`). Vertex GA: `veo-3.1-generate-001` / `veo-3.1-fast-generate-001`. **Never freeze `*-preview` as the only path.** | `GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY` and keep names containing `veo`. Prefer current generate (not lite unless the brief asks cheap; not fast unless the brief asks speed). Fallback: https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/veo. Record the id in `generation-log.jsonl`. | https://ai.google.dev/gemini-api/docs/models · https://ai.google.dev/gemini-api/docs/veo · https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate |
| Video generation default on Gemini | 2026-09-03: Google's video page names Gemini Omni Flash as the default video model and Veo 3.1 for scene extension, last-frame and legacy pipelines. **This squad stays a multi-engine router.** Veo remains the English-broadcast / last-frame family. Do not switch the whole squad to Omni. | https://ai.google.dev/gemini-api/docs/video this run. | Gemini "Video generation" page (last updated 2026-06-30, still the live page on 2026-09-03) |
| Veo duration enum | 2026-09-03: Vertex / Gemini Veo 3.1 lists 4, 6 or 8 seconds. Reference-to-video 8 s only. | Live Veo card this run. House default when the brief is silent and the card allows it: 8 s. | Vertex Veo 3.1 card · Gemini Veo page |
| Grok Imagine durations | 2026-09-03: CLI rail 6 or 10 s; API credit rail 1-15 s. | `grok --help` / doctor this run. House default CLI 6 or 10 s when the brief is silent. | grok CLI help · xAI Imagine docs |
| Kling (fal) | 2026-09-03: current generation routed as family Kling (`kling-3-0` internal id). Previous generation `fal-ai/kling-video/v2.6/pro/image-to-video` still listed as fallback. Duration 3-15 s on the current SKU; 5/10 s on some legacy SKUs. | fal model list this run. Prefer the current Kling I2V/T2V id. Do not freeze `v2.6`. | fal.ai model catalog |
| Runway | 2026-09-03: Gen-4.5 text or image to video 2-10 s; `gen4_turbo` image-to-video 2-10 s. A 60 s SKU is not the one-shot default. | Account dashboard / https://docs.dev.runwayml.com this run. | Runway REST docs |
| Higgsfield CLI catalog | 2026-09-03: ids such as `kling3_0`, `veo3_1`, `seedance_2_0`, `text2image_soul_v2`, `marketing_studio_video` were listed. CLI `1.1.23`. | `higgsfield version` + `model list` + `model get <id>`. If missing: `nrv activate higgsfield-studio-nirvana`. | `higgsfield-cli.md` (resolve, do not freeze) |
| Sora / OpenAI Videos API | 2026-09-03: deprecated. App/web ended 2026-04-26. API (`sora-2`, `sora-2-pro`) announced to shut down **2026-09-24**. This squad never routes Sora as primary. | https://developers.openai.com/api/docs/guides/video-generation and https://openai.com/sora/ this run. If unlisted, drop from the live set. | OpenAI Videos API guide · OpenAI Sora discontinuation help |
| Sync.so models | 2026-09-03: `sync-3` (broadcast default, 4K, obstructions), `lipsync-2-pro` (detail), `lipsync-2` (speed). Internal routing key remains `sync-so-lipsync-2-pro`. | https://docs.sync.so this run. POST `https://api.sync.so/v2/generate`. | Sync.so API docs |
| Grok Imagine price | 2026-09-03 snapshot: about $0.02-0.05/image; $0.05-0.08/s of video with audio. | xAI pricing page / doctor this run. Never memorize a $/sec in operating prose. | xAI pricing |
| Kling legacy price | 2026-09-03: about $0.029/s on some fal Kling 2.6 SKUs. | fal pricing this run. | fal.ai |
| Sync.so price | 2026-09-03: about $0.083/s on lipsync-2-pro. | Sync.so pricing page this run. | Sync.so |
| "85% of social video is watched muted" | Recurring industry claim; do not treat the percentage as a live measurement. | If a run must cite a rate, search a named study this run and date it. Captions stay mandatory on published clips. | Named study this run, or drop the number |
| Hedra language count | 2026-09-03: marketing copy said 140+ languages. | Hedra product page this run. | Hedra |
| Wan / Hunyuan / LTX checkpoints | 2026-09-03: Wan 2.2 5B/14B, HunyuanVideo ~13B, LTX-2.3 2B DiT were the common ComfyUI wrappers. | `/object_info` on the user's ComfyUI (port 8188). Never download. | Installed ComfyUI this run |

## What this squad does **not** snapshot here

- Multi-engine routing itself: identity of this squad. Grok default when live, Higgsfield for Soul ID/UGC, Veo for English broadcast / last-frame, Kling for dual-keyframe.
- House defaults when the brief is silent: Veo 8 s, Grok CLI 6 or 10 s, Kling 5 s, Runway 5 s, Marketing Studio 15 s, 1080p, 9:16 social / 16:9 cinema. Identity of this house, not a claim that the API cannot grow.
* A 30 s reel is never one generation. House snap when cards still allow it: 8+8+8+6 (Veo) or 10+10+10 (Grok).
- LSE bar broadcast 1.5 / good 3 / acceptable 5. Mix -12 / -18 / -24 LUFS. Join SSIM >= 0.85. Method of this house.
* Internal routing keys `veo-3-1`, `kling-3-0`, `runway-gen-4`, `sync-so-lipsync-2-pro`, `wan-2-2`: this entity's ids, not the vendor catalog.
* Keywords and `example_briefs` that say "Veo 3.1", "8s", "Kling": buyer language.
- `protocol: "6.0"` and this squad's own `version: 6.0.0`: this entity.
- ffmpeg CRF 26, `-preset slow`, `+faststart`: technique of this house.

## Install when a tool is missing

`nrv activate editai` installs what `dependencies.yaml` declares
(ffmpeg). Higgsfield CLI: `nrv activate higgsfield-studio-nirvana`. Confirm with
`ffmpeg -version`, `grok --version`, `higgsfield version`. Never `npm install` /
`bun install` / `pip install` inside this directory.

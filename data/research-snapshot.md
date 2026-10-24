# Research Snapshot — method, not live catalog

This file is the **method** this squad already knows: pipeline stages, prompting dialects,
stitching recipe, character protocol. It does **not** replace live lookup.

Dated vendor ids, prices, duration enums and quotas live in **one** place:
`references/state-of-the-art.md`. Operating steps resolve the live value this run
(Gemini/Vertex list, `higgsfield model list`, fal list, Runway dashboard, Sync.so
page, `grok --help`). If a number here disagrees with the live card, the live card wins.

**Source files (method):**
* internal prompting templates, shot chaining, multi-shot coherence
- internal lipsync routing (broadcast vs local vs multilingual)
- ComfyUI custom-node families, LoRA training shape, SUPIR

---

## 1. Landscape Summary

The field is **bifurcated**:

1. **Cloud proprietary families** (Veo, Runway, Kling, Luma Ray, Grok Imagine, Higgsfield) — highest quality, pay-per-second, closed weights. Sora is never primary; confirm the Videos API page this run before fallback.
2. **Open-source self-hosted** (Wan, HunyuanVideo, LTX) — free inference, requires GPU, full control, ComfyUI-native. Use the checkpoint already installed.

**Lipsync is a separate specialization** — even the best T2V models sometimes need post-hoc lipsync via Sync.so (broadcast), LatentSync (OSS), Hedra (multilingual), or MuseTalk (real-time).

**ComfyUI is the orchestration hub** — it unifies local and cloud models via API nodes, enables LoRA stacking, and provides reproducible JSON workflows. Probe port 8188; never download weights.

---

## 2. Tool Selection Decision Tree

Canonical tree: `references/tool-routing-decision-tree.md` plus `lib/video-fundamentals/ENGINE-MENU.md`.
Probe first. Family names below, live ids this run.

```
WHAT KIND OF VIDEO?
├─ NEW content (text→video or image→video)
│   │
│   ├─ Dialogue-heavy, English → VEO or GROK (native audio)
│   ├─ Dialogue-heavy, multilingual → KLING native, else HEDRA, else SYNC.SO post
│   ├─ Motion-heavy / VFX → RUNWAY or KLING
│   ├─ Budget / cheap iteration → KLING via fal, GROK CLI, or LTX (free+local)
│   ├─ Keyframe chaining / shot stitching → HIGGSFIELD Seedance, LUMA RAY, KLING, or WAN FLF2V
│   ├─ Local GPU / open-source → WAN, HUNYUAN, or LTX (via ComfyUI already up)
│   └─ Real-time drafting → LTX if the installed checkpoint is real-time capable
│
└─ EXISTING footage (needs dubbing/lipsync)
    │
    ├─ Broadcast-quality dubbing → SYNC.SO (live model this run; house LSE ≤ 1.5)
    ├─ Multilingual dubbing → HEDRA
    ├─ Local / open-source → LATENTSYNC, MUSETALK, or WAV2LIP if on PATH
    └─ Full-body + gestures → ECHOMIMIC
```

Prices: vendor page / `higgsfield generate cost` / doctor this run. Never a memorized $/sec.

---

## 3. Pipeline Stages (Nirvana-Level)

1. **Script & Storyboarding** — Narrative text → mood board → character bible (4-8 views) → keyframes
2. **Character Consistency** — Train character LoRA (15-30 images) if recurring; lock style spine (20-token descriptor) in every prompt
3. **Shot Planning** — CSV shot list (shot_id, action, lens, duration, characters); detailed 1080p+ keyframe per shot; audio script; transition plan
4. **Video Generation** — Route to model per shot via decision tree
5. **Lipsync Refinement** — Skip if native model holds the house LSE tier; otherwise apply Sync.so (broadcast), LatentSync (local), or Hedra (multilingual)
6. **Shot-to-Shot Stitching** — Extract last frame of Shot N → condition Shot N+1's first frame (dual-keyframe in Kling / FLF2V in Wan / References in Runway / Seedance start/end)
7. **Audio Synthesis & Sync** — Voice, SFX, ambience; verify LSE against the brief's tier
8. **Upscaling & Interpolation** — SUPIR or Topaz when the brief names showpiece
9. **Assembly & Editing** — ffmpeg concat here; DaVinci / Premiere / Final Cut only if the brief names an NLE
10. **Export & Delivery** — Target format (H.264, ProRes, etc.)

---

## 4. Prompting Playbook (Per Family)

Dialect is method. Duration in the prompt equals the CSV row, snapped to the live card.

### Veo — Quoted-Dialogue Inline Prose
- Character setup + action/emotion + **quoted dialogue in ""** + camera + audio + duration
- Rule: quote dialogue, name speaker, describe lip movement, max 15-20 words per block (fits the house 8 s default)

### Sora — Labeled Blocks with Timestamps (never primary)
- `[VISUAL] [DIALOGUE] [AUDIO] [MOTION]` as distinct blocks
- Explicit timing: `at 00:02, at 00:05`
- Distinguish diegetic vs non-diegetic audio
- Use only if the Videos API page this run still lists a callable model

### Kling — Scene + Native Audio Spec
- "Scene: ... / Native audio: {voice timbre, language, diegetic sound} / Camera / Lighting / Motion"
- Specify voice timbre explicitly

### Runway — Reference-Conditioned
- Subject + Action + Camera (movement+speed) + Style + Negative
- Reference-image count from the live card

### I2V (generic) — Motion-First Minimal
- `[PRIMARY MOTION] [CAMERA] [ENVIRONMENTAL] [SPEED] [NEGATIVE]`
- Motion first, negative always included

### Character Anchor (consistency)
- Identical string prepended to every shot: "{name}, {age}, {features}, {clothing}, {mannerisms}"

---

## 5. Technical Setup per Family

Resolve auth, rate limit and max duration **this run**. Do not treat the cells below as a live catalog.

**Cloud APIs (no GPU needed):**
| Family | Auth Env Var | Where to resolve duration / quota |
|------|--------------|-------------|
| Veo | GOOGLE_API_KEY / GEMINI_API_KEY | https://ai.google.dev/gemini-api/docs/veo this run |
| Runway | RUNWAY_API_KEY | dashboard / docs.dev.runwayml.com this run |
| Kling | FAL_KEY | fal model list this run |
| Luma Ray | FAL_KEY or LUMA_API_KEY | fal / Luma card this run |
| Grok Imagine | grok on PATH or XAI_API_KEY | `grok --help` / doctor this run |
| Higgsfield | higgsfield login or HF_KEY | `higgsfield model get` this run |
| Sync.so | SYNC_API_KEY | vendor API page this run |
| Hedra | HEDRA_API_KEY | vendor page this run |

**Self-hosted (GPU required, already installed):**
| Family | Where to resolve | Install |
|------|------------------|---------|
| Wan | ComfyUI object_info this run | already-installed WanVideoWrapper |
| HunyuanVideo | ComfyUI object_info this run | already-installed HunyuanVideoWrapper |
| LTX | ComfyUI object_info this run | already-installed ComfyUI-LTXVideo |
| LatentSync / MuseTalk | binary on PATH | never `pip install` in this squad |

Missing system tool: `nrv activate editai` then `<tool> --version`.

---

## 6. ComfyUI Essential Custom Nodes

Families, not pinned commits. Confirm the node exists in `/object_info` this run. Never download.

- **ComfyUI-Manager** (Comfy-Org) — model + node installer
- **ComfyUI-WanVideoWrapper** (kijai) — Wan
- **ComfyUI-HunyuanVideoWrapper** (kijai) — HunyuanVideo
- **ComfyUI-LTXVideo** (Lightricks) — LTX
- **ComfyUI-SUPIR** (kijai) — photorealistic upscaling
* **ComfyUI-VideoHelperSuite** (Kosinkadink) — video encoding/frames
- **rgthree-comfy** — subgraphs, seed fixes, utilities
- **ComfyUI-Impact-Pack** (ltdrdata) — face detailing, upscaling
- **ComfyUI_IPAdapter_plus** (cubiq) — reference image conditioning
- **ComfyUI-LatentSyncWrapper** (ShmuelRonen) — LatentSync node
- **efficiency-nodes-comfyui** (jags111) — LoRA stacking

---

## 7. Multi-Shot Coherence (Long-Form)

**Shot stitching recipe:**
1. Generate Shot N ending with clear unambiguous pose/position
2. Extract last frame of Shot N (`ffmpeg -sseof -0.04 -i shot_n.mp4 -frames:v 1 -update 1`)
3. Use as first-frame conditioning for Shot N+1 via:
   - **Kling dual-keyframe:** frame0=last_N, frame1=desired_end_N+1 (if the live schema lists first/last)
   * **Wan FLF2V:** first_last_frame_to_video workflow if the installed checkpoint supports it
   - **Runway References:** feed last_N as reference image
   - **Luma Ray keyframes:** interpolate frame0→frame1
   - **Higgsfield Seedance:** start_image / end_image on the id `model list` returns
4. Prompt Shot N+1: "{Character anchor} continues from previous pose, now {new action}"

**Papers for minute-scale coherence** (named works, not a live catalog):
- HoloCine — window cross-attention + sparse inter-shot self-attention
- InfinityStory — background-consistent pipeline with character-aware transitions
- OneStory — autoregressive with adaptive memory
* VideoGen-of-Thought — step-by-step multi-shot generation

**Narrative scale mapping:**
| Duration | Approach | Families |
|----------|----------|-------|
| 30-60s | Direct shot-by-shot + stitch | Veo + Kling |
| 60-180s | Storyboard + I2V per scene | Wan / Hunyuan (ComfyUI already up) + editorial |
| 3-10min | Prompt chaining + scene groups | Veo extend if the live card lists it, or Runway chaining |
| 10-90min | Hybrid: AI shots + human narrative assembly | Multi-family + NLE |

---

## 8. Character Consistency Protocol

1. **Generate character bible** — 4-8 views: portrait front, 3/4, profile, back; diverse poses + expressions
2. **Define character anchor string** — 20-30 tokens: name, age, distinctive features, clothing, mannerisms
3. **For recurring characters → train LoRA** — 15-30 curated images, Flux/SDXL LoRA if a GPU is declared, strength 0.7-0.9
4. **Apply anchor to every shot prompt** — prepend identical string, change only the action verb
5. **Verify via face embedding** — face distance < 0.3 between shots when a measurer exists; never invent the number

---

## 9. Nirvana Quality Standard

House bar, not a vendor claim:

- Native lipsync holds the brief's LSE tier (Veo/Kling/Grok native or Sync.so post-hoc)
- Character consistency across shots (LoRA + anchor + reference)
- Temporal fluidity (frame-to-frame SSIM > 0.85)
- Photorealistic output at the brief's resolution (native or SUPIR)
- Fully synchronized audio (LSE ≤ 1.5 frames for broadcast)
- Narrative coherence at the planned duration (manual chaining; research architectures are optional)

**Hybrid model is mandatory:** AI generates shots; editorial assembly, refine, and calibrate the final narrative.

---

## 10. Portuguese Terminology (PT-BR)

| PT-BR | English | Context |
|-------|---------|---------|
| Dublagem | Dubbing | Multilingual redubbing (Hedra, Sync.so) |
| Redesenhagem / Retake | Redraw / Retake | Re-generating a shot |
| Fluidez | Fluidity | Shot-to-shot temporal consistency |
| Sincronização labial | Lip-sync | LSE metrics |
| Coerência | Coherence | Character/world/scene consistency |
| Fotografia | Cinematography | Visual style spine |
| Áudio diegético | Diegetic audio | In-world sound |
| Áudio não-diegético | Non-diegetic audio | Narration, background music |
| Força de movimento | Motion strength | I2V parameter |
| Marca de tempo | Timestamp | Dialogue timing in labeled-block dialects |

# Long-Form Stitching Protocol

> Used by `shot-stitcher` agent. Goal: chain short AI-generated clips into seamless minute-scale narratives.

## The Core Technique: Last-Frame → First-Frame Chaining

Every shot after the first is conditioned on the **last frame of the previous shot**. This creates a seamless pose/lighting/character bridge.

### Recipe

```
Shot N (generated)  ──►  Extract last frame  ──►  Condition Shot N+1 first frame
```

**Extract last frame (ffmpeg):**
```bash
# Get frame count
FRAMES=$(ffprobe -v quiet -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 shot_n.mp4)
# Extract last frame
ffmpeg -i shot_n.mp4 -vf "select=eq(n\,$((FRAMES-1)))" -vframes 1 last_frame_n.png
```

**Or simpler (last frame at end of stream):**
```bash
ffmpeg -sseof -0.1 -i shot_n.mp4 -update 1 -q:v 1 last_frame_n.png
```

---

## Tool-Specific Stitching Methods

### Method A: Kling — Dual-Keyframe I2V
Supply TWO keyframes: frame0 (start) and frame1 (end).
* `frame0` = `last_frame_n.png`
- `frame1` = desired end pose of Shot N+1
- Kling interpolates between them with prompted motion.

**API call (FAL):** resolve the live Kling I2V Pro path from the fal model list this run. Do not freeze a `v2.6` or `v3` path. Shape:

```bash
# <kling-i2v-id> = the path fal lists this run for Kling image-to-video with first/last
curl -X POST "https://fal.run/<kling-i2v-id>" \
  -H "Authorization: Key $FAL_KEY" \
  -d '{
    "image_url": "...",
    "end_image_url": "...",
    "prompt": "Sarah continues from previous pose, now walks toward the door"
  }'
```

### Method B: Wan FLF2V (First-Last-Frame-to-Video)
Open-source equivalent of Kling dual-keyframe. Runs locally in ComfyUI via `ComfyUI-WanVideoWrapper` if that node is already installed.

**ComfyUI workflow structure:**
* `LoadImage` (first_frame) → `WanVideoFLF2V` node
- `LoadImage` (last_frame) → same node
- Prompt + motion parameters → node input
* Output: MP4 clip

### Method C: Runway References
Feed the `last_frame_n.png` as a reference image (up to 3 refs). Runway conditions generation on visual style.

### Method D: Luma Ray Keyframes
Native keyframe interpolation mode:
- `keyframe_0`: last_frame_n
- `keyframe_1`: target state for Shot N+1
* Luma's 3D-aware motion engine interpolates smoothly.

---

## Shot Prompt Template (for Shot N+1)

```
{Character anchor string}
continues from previous pose, now {new action}.

[CAMERA]
{continuation: same angle / new angle with smooth transition}

[LIGHTING]
{same as Shot N — do not change unless scene transition}

[NEGATIVE]
no identity change, no lighting shift, no teleport, stable features
```

---

## Verification: Stitching Quality

After generating Shot N+1, verify:

1. **Identity continuity** — face embedding distance Shot N end ↔ Shot N+1 start < 0.15
2. **Lighting continuity** — histogram RGB delta < 10%
3. **Pose continuity** — body position not teleported (no cuts mid-frame)
4. **Flicker ratio** — frame-to-frame SSIM at boundary > 0.85

---

## Scene Transitions (Hard Cuts)

When you DO want a scene change (different location/time), do NOT use last-frame chaining. Instead:

1. Generate Shot N normally
2. Generate Shot N+1 with NEW reference (new location keyframe)
3. Apply hard cut OR cross-fade in NLE

Signal explicitly in prompt: `[SCENE CHANGE] cut to ...`

---

## Narrative Scale Patterns

| Duration | Shots needed | Pattern |
|----------|--------------|---------|
| 5-10s | 1 shot | Direct generation, no stitching |
| 10-30s | 2-4 shots | Linear chain: Shot1→Shot2→Shot3 |
| 30-60s | 5-10 shots | Chained + occasional scene cuts |
| 1-3min | 10-30 shots | Hybrid: chains within scenes, cuts between scenes |
| 3-10min | 30-100 shots | Scene groups with internal chains; editorial assembly in NLE |
| 10min+ | 100+ shots | Feature film pipeline; AI shots assembled in DaVinci Resolve |

---

## Multi-Shot Coherence Papers (named works)

- **HoloCine** — window cross-attention + sparse inter-shot self-attention for minute-scale coherence
- **InfinityStory** — background-consistent pipeline, character-aware transitions
- **OneStory** — autoregressive with adaptive memory
- **VideoGen-of-Thought** — step-by-step multi-shot generation

These are research-grade; for production use the manual chaining protocol above.

---

## Anti-Patterns

**NEVER:**
- Stitch shots without verifying identity continuity
- Change lighting between chained shots (unless explicit scene transition)
- Stack multiple camera movements in one chained shot (causes drift)
- Generate Shot N+1 without viewing Shot N's last frame
- Use resolution change mid-chain (keep same throughout narrative)

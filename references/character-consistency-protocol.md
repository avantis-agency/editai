# Character Consistency Protocol

> Used by `character-consistency-keeper` agent. Goal: maintain visual identity of any character across 50+ shots.

## Step 1 — Character Bible Generation

Create 4-8 reference renders per character:
- **Portrait front** — eye-level, neutral expression
- **3/4 angle** — shows facial depth
- **Profile** — shows nose shape, ear position
- **Back** — hair shape, body posture
- **Expression set** (optional) — smile, concerned, surprised, angry
- **Clothing detail** — full-body, key wardrobe items visible

Tools: the live image generator in the environment this run (Flux, Nano Banana Pro, Flux Kontext for edits). Do not freeze a Flux minor.

Output: `character-bible/{character_id}/` with 4-8 PNG + metadata.json.

## Step 2 — Character Anchor String

Define a **20-30 token** immutable descriptor that every shot prompt must include.

**Template:**
```
{Name}, {age}, {hair}, {distinctive features}, {clothing}, {mannerisms}
```

**Example:**
```
Sarah, 32, wavy auburn hair to shoulders, light freckles across nose,
olive linen jacket, silver nose ring, tends to tilt head when listening.
```

**Rules:**
- Anchor is **identical in every shot** — never paraphrase
- Change only the **action verb** between shots
- Include mannerisms (posture, gesture tics) for behavioral consistency

## Step 3 — LoRA Training (for recurring characters)

**When to train a LoRA:**
- Character appears in 10+ shots
- Anchor-only consistency is failing (face drift > 0.3 embedding distance)
- Premium quality required

**Training data requirements:**
- 15-30 curated images (diverse angles, expressions, lighting)
- Consistent character across all training images
- 1024×1024 or 512×512 preferred
- Remove backgrounds or use consistent backgrounds

**Training:**
- Framework: kohya_ss, ai-toolkit, or Flux LoRA trainer
- Base model: Flux dev or SDXL, whichever the trainer on this machine already has
- Training time: on the order of tens of minutes on a consumer GPU when one is declared
- Network dim: 16-32
- Output: `.safetensors` file

**Usage:**
- Load LoRA via `efficiency-nodes-comfyui` or native ComfyUI LoRA loader
- Strength: 0.7-0.9 (higher = more style bleed)
- Combine with anchor string in prompt

## Step 4 — Reference Image Conditioning (per-shot)

For tools supporting reference images:
- **Runway:** feed the reference-image count the live card lists (character + optional style + optional location)
- **Kling:** single reference image for I2V when the live schema lists it
- **ComfyUI + IPAdapter:** reference image with weight 0.6-0.8

Always feed the **most recent consistent render** as the reference for the next shot.

## Step 5 — Consistency Verification

After generation, verify:

1. **Face embedding distance** — extract faces via MTCNN or FaceNet; compute cosine distance
   - Target: < 0.3 between shots (same character)
   - Tool: `insightface` or `face_recognition` Python lib

2. **Visual spot-check** — compare 3-frame grid: first-frame of Shot N vs Shot N+1
   - Hair color/shape, clothing, accessories match
   - No extra features (moles, scars) appearing/disappearing

3. **Mannerism continuity** — if anchor specified gestures (head tilt, hand position), verify present

## Step 6 — Remediation (if drift detected)

| Drift type | Fix |
|-----------|-----|
| Hair color drift | Strengthen anchor + add color hex code to prompt |
| Clothing drift | Add detailed clothing description + reference image |
| Face structure drift | Train or strengthen LoRA |
| Expression drift | Add emotion descriptor to every shot |
| Age drift | Add explicit age marker: "32 years old" |

## Anti-Patterns

**NEVER:**
- Change the anchor between shots
- Skip reference images when tool supports them
- Use LoRA strength > 0.9 (causes style bleed)
- Train LoRA on fewer than 10 images (underfits)
- Train LoRA on > 50 images (overfits)

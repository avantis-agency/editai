# Tool Routing Decision Tree

> Canonical logic used by `tool-router` agent. Every decision branch here has explicit YES/NO paths and falls through to documented fallbacks.

> **Fundamentos transversais primeiro** — `lib/video-fundamentals/`:
> `ENGINE-MENU.md` (seleção canônica, inclui **Higgsfield**), `FUNDAMENTALS.md` (hero-image, chaining, takes),
> `AUDIO-POLICY.md` (**hero/loop = sem áudio; publicar = com áudio + legenda**), `CREDIT-DISCIPLINE.md`.
> A árvore abaixo escolhe o engine; os fundamentos valem para qualquer escolha.

## Primary Branch: What Kind of Video?

### Branch 1: NEW content (text→video or image→video)

**Q1.1 — Is lipsync/dialogue central to this shot?**
- **YES → Go to Q1.2**
- **NO → Go to Q1.3**

**Q1.2 — Dialogue language is English?**
- **YES, Grok CLI live** → `grok-imagine` (native audio; duration from `grok --help` this run)
- **YES, premium OK** → `veo-3-1` (native audio; duration from the live Veo card)
- **YES, budget / dual-keyframe** → `kling-3-0` via fal
- **NO (multilingual)** → `kling-3-0` native audio, else Hedra, else Sync.so live broadcast model post
- **NO, local GPU only and ComfyUI already up** → Wan FLF2V, never download weights
- Sora is not a branch. Never primary. Confirm the Videos API page this run before fallback.

**Q1.3 — Is motion heavy or VFX-intense?**
- **YES, cloud OK** → `kling-3-0` or Runway (live id this run; do not treat a 60 s SKU as the one-shot default)
- **YES, local GPU and ComfyUI already up** → Wan / Hunyuan already installed
- **NO, still photography feel** → Go to Q1.4

**Q1.4 — Need keyframe chaining / shot continuity?**
- **YES, jornada contínua "tomada única"** → `higgsfield` (Seedance start_image/end_image) — o padrão para descidas/corridas/tours que varrem sem emenda
- **YES** → `kling-3-0` first/last, Veo first-last, Luma Ray, Wan FLF2V if ComfyUI is already up
- **NO** → Go to Q1.5

**Q1.4b — Personagem/produto precisa ser IDÊNTICO entre tomadas?**
- **YES** → `higgsfield` (Soul ID trava a identidade) — hero-image âncora reusada em todo clipe
- **NO** → segue

**Q1.5 — Budget constraint / rapid iteration?**
- **YES, cheap cloud** → `kling-3-0` via fal, or Grok CLI if logged in
- **YES, free + local** → `ltx-2-3` or `wan-2-2` if the checkpoint is already installed
- **NO, premium OK** → `veo-3-1` (default premium) or `runway-gen-4`

### Branch 2: EXISTING footage (needs lipsync/dubbing)

**Q2.1 — Broadcast quality required?**
- **YES** → `sync-so-lipsync-2-pro` (house LSE ≤ 1.5; live Sync.so model this run)
- **NO** → Go to Q2.2

**Q2.2 — Multilingual dubbing?**
- **YES, many languages** → `hedra-character-3` or `synthesia` (language count on the vendor page this run)
- **NO** → Go to Q2.3

**Q2.3 — Local / open-source constraint?**
- **YES, real-time** → `musetalk-1-5` if on PATH
- **YES, quality** → `latentsync-1-6` if on PATH
- **YES, baseline** → `wav2lip` (MIT, fast)
- **NO full-body + gestures** → `echomimic-v2`

---

## Secondary: Quality Tier Routing

| User says... | Route |
|--------------|-------|
| "broadcast / cinema / premium" | `veo-3-1` (resolution on the live card) + `sync-so-lipsync-2-pro` + `supir` upscale |
| "social media / Reel / Short" | `veo-3-1` (9:16) or `kling-3-0` |
| "draft / prototype / quick" | `ltx-2-3` or `kling-3-0` |
| "local / offline / private" | `wan-2-2` + `latentsync-1-6` via ComfyUI |

---

## Delegation (existing squads in ecosystem)

When the user request matches one of these patterns, route to an existing squad instead of generating from scratch:

| User Request Pattern | Delegate To |
|---------------------|-------------|
| "Remotion-based programmatic branded video (React→MP4)" | `brandcraft` at `~/squads/brandcraft/` |
| "Instagram Reel with Veo + Remotion overlay" | `instagram-intelligence-nirvana` at `~/squads/instagram-intelligence-nirvana/` |
| "Traditional production pipeline (script→storyboard→distribution, human crew)" | `nirvana-produtora-video` at `~/squads/nirvana-produtora-video/` |

For everything else (multi-tool AI routing, lipsync, ComfyUI, long-form stitching), this squad handles it natively.

---

## Fallback Policy

If primary tool is unavailable (API key missing, rate limit, model deprecated):
1. Document the fallback in generation log
2. Route to first alternative from `data/tool-registry.yaml` `routing_priorities`
3. Notify user if quality tier changes (e.g., premium → mid)

## Auth & Availability Check

Before routing to a cloud tool, verify its env var exists:
- `veo-3-1` → `GOOGLE_API_KEY`
- `runway-gen-4` → `RUNWAY_API_KEY`
- `kling-2-6-pro` / `luma-ray-2` → `FAL_KEY`
- `sync-so-lipsync-2-pro` → `SYNC_API_KEY`
- `hedra-character-3` → `HEDRA_API_KEY`
- `synthesia` → `SYNTHESIA_API_KEY`

If missing, route to the next live family or write the gap. Missing binary: `nrv activate editai` then `<tool> --version`. Never wait for a key.

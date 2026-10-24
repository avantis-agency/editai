# lib/video-fundamentals

Fonte única dos fundamentos de geração de vídeo para TODOS os squads de vídeo do Nirvana-OS. Cada squad de vídeo carrega a sua cópia em `lib/video-fundamentals/` — um squad viaja num pack e
precisa levar o que lê.
Execução do Higgsfield fica centralizada no squad `higgsfield-studio-nirvana`.

## Conteúdo

| Arquivo | O quê |
|---|---|
| `PREFLIGHT.md` | **gate obrigatório antes de gerar** — 9 perguntas, identity kit mínimo, decisão de infográfico |
| `VOICE-DIRECTION.md` | fala nativa no prompt, direção por verbos, voice-seed, ritmo no pós |
| `CONTINUITY-AND-CUT.md` | QA do last-frame na cadeia de takes, prompt anti-degradação, corte de todos os vãos sem fala |
| `FUNDAMENTALS.md` | hero-image anchor, encadeamento de clipes, takes, bíblia de mundo, anti-cara-de-IA |
| `AUDIO-POLICY.md` | sem áudio (hero/loop) vs com áudio + legenda (publicar) |
| `CREDIT-DISCIPLINE.md` | defaults std/1080p/~8s, compress-for-web, 4K só showpiece, cost-check |
| `ENGINE-MENU.md` | qual engine escolher — inclui **Higgsfield** (Soul ID, Seedance, Marketing Studio) |
| `higgsfield-cli.md` | superfície CLI completa do Higgsfield (auth, custo, upload, generate, gotchas) |
| `CAPABILITY.yaml` | a capability canônica `media.video.compose` (consolida os ids antigos) |

A escolha de engine fica em `agents/VEO_VIDEO.md`: Grok CLI por padrão, Veo quando não houver Grok,
setup guiado quando não houver nenhum. O ComfyUI roda só a pedido explícito, sobre instalação e
modelos que o usuário já tem.

> **Conteúdo pago (não no engine livre):** o método de roteiro/fonética PT-BR (`roteiro-method/`) e o
> kit ffmpeg de pós (`post-kit/`) são conteúdo dos **packs de vídeo (pagos)** — vivem na squad
> `higgsfield-studio-nirvana` (`references/roteiro-method/`, `scripts/post-kit/`). O engine livre traz
> só os fundamentos genéricos acima; os packs de vídeo trazem o método de produção.

## Rollout

Neste squad (EditAi) o `inject-capability.js` do original foi retirado de propósito: é um script Node que escreve no `squad.yaml` de outros squads. O rollout continua só no `nirvana-video-creator`.

Origem dos fundamentos genéricos: hero-image, chaining e disciplina de crédito. O método de
roteiro/fonética/pós é conteúdo dos packs de vídeo pagos (ver nota acima).

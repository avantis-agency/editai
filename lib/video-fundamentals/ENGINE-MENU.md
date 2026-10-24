# Menu de engines de vídeo (compartilhado)

Qual engine escolher para cada trabalho. Squads referenciam este arquivo em vez de manter árvores de
decisão copiadas. A execução mora em cada squad/registry; aqui está a *seleção*.

Ids, enums de duração, preços e cotas **não** ficam neste menu. Resolva nesta execução: lista Gemini /
Vertex para Veo, `higgsfield model list` / `model get` para Higgsfield, lista fal para Kling/Luma,
dashboard Runway, `grok --help` / doctor para Grok. Snapshot só se a rede falhar:
`references/state-of-the-art.md`. Não congele um id `*-preview` nem `*-001`.

## A pergunta que decide

| Preciso de… | Engine preferido | Auth |
|---|---|---|
| **Personagem/produto consistente entre tomadas** (Soul ID) | **Higgsfield** (Soul still + Seedance; ids vivos em `model list`) | `higgsfield auth login` |
| **Jornada encadeada** (frame final → inicial, "tomada única") | **Higgsfield Seedance** (`start_image`/`end_image` no id listado); alt: Luma Ray, Kling, Wan FLF2V | `higgsfield` / `FAL_KEY` |
| **Anúncio UGC / product ad falado** | **Higgsfield Marketing Studio** (`marketing_studio_video`); alt: HeyGen (voz PT mais limpa) | `higgsfield` / `HEYGEN_API_KEY` |
| **Diálogo em inglês, broadcast, aderência ao prompt** | **Veo** (id vivo: lista Gemini / `higgsfield model list \| grep -i veo`; não congele um id `*-preview`) | `GOOGLE_API_KEY` |
| **Expressividade emocional, cena cinematográfica** | Veo (Sora nunca é primário; confirme na página Videos API desta execução se ainda está listado; se sim, só fallback) | `GOOGLE_API_KEY` |
| **Controle de câmera / 3D / referências** | Runway (id vivo no dashboard da conta; duração no card vivo, não 60 s de um SKU antigo) | `RUNWAY_API_KEY` |
| **Iteração barata, física de movimento, dual-keyframe** | Kling via fal (id vivo nesta execução) | `FAL_KEY` |
| **Órbita de produto, I2V a partir de still** | Luma Ray / Kling | `FAL_KEY` |
| **Fala com lip-sync nativo no próprio clipe** (áudio incluído no preço) | **Grok Imagine** (`grok-imagine-video`; fala entre aspas no prompt) | `grok login` / `XAI_API_KEY` |
| **Extend/edit nativo de vídeo** (continuar do último frame; editar elemento mantendo o take) | **Grok Imagine** (`/videos/extensions`, `/videos/edits`) | `XAI_API_KEY` (créditos) |
| **Lip-sync / dublagem broadcast** | Sync.so (id vivo na página da API desta execução) | `SYNC_API_KEY` |
| **Loop perfeito / cinemagraph** | Veo (first=last frame; id vivo nesta execução) | `GOOGLE_API_KEY` |
| **Local, sem custo por clipe (GPU própria)** | Wan / HunyuanVideo / LTX (ComfyUI; resolva o checkpoint instalado) | — |
| **Upscale 4K/8K** | Topaz (Higgsfield) / SUPIR | `higgsfield` / — |

## Higgsfield — o que ele adiciona ao menu (novo)

O Higgsfield é o único engine do menu que entrega, no mesmo lugar:

- **Soul ID** — identidade de personagem/produto travada entre gerações (consistência que Veo/Fal não
  garantem na geração; ver `FUNDAMENTALS.md` §1).
- **Seedance** com `start_image`/`end_image` no id que `model list` devolver — o keyframe-chaining nativo para jornadas contínuas
  (`FUNDAMENTALS.md` §2).
- **Marketing Studio** — UGC/product ad falado direto (`marketing_studio_video`), inclusive Click-to-Ad
  por URL do produto.
- CLI shell-out simples (sem GPU local). Detalhe completo: `higgsfield-cli.md`.

Escolha Higgsfield quando o trabalho pede **consistência forte**, **jornada encadeada** ou **UGC ad**.
Para diálogo em inglês broadcast ou loops nativos, Veo segue melhor. Não force um engine só; o menu é
para casar tarefa → engine.

## Grok Imagine — o que ele adiciona ao menu (novo)

O Grok Imagine (xAI) é o único engine do menu com **áudio nativo sempre incluído no preço**: diálogo
com lip-sync, SFX e ambiente saem dentro do próprio clipe (a fala vai entre aspas no prompt) — sem
etapa separada de lipsync nem cobrança extra de áudio.

- **Extend nativo** (`/videos/extensions`) — continua um take do último frame (duração por segmento
  no schema vivo do trilho), sem o extract-frame manual do chaining clássico (`FUNDAMENTALS.md` §2).
- **Edit generativo de vídeo** (`/videos/edits`) — muda elemento/estilo mantendo duração/AR/resolução.
- **Dois trilhos**: Grok Build CLI headless (`grok -p`, assinatura SuperGrok, funciona sem créditos
  de API) e API Imagine (`XAI_API_KEY` + créditos). Duração, resolução e `n` vêm do `grok --help` / doctor nesta execução.
- Custo: leia a página de preços xAI / o doctor do trilho nesta execução. Não memorize um valor por segundo.
- Limites honestos: sem Soul ID/seed (consistência = disciplina de referência via identity kit), sem
  upscale nativo, moderação própria. Execução completa: squad `grok-studio-nirvana`
  (`references/grok-build-cli.md` e `references/grok-imagine-api.md`).

Escolha Grok quando o trabalho pede **fala natural no clipe**, **take contínuo estendido** ou
**custo baixo com áudio incluído**. Para identidade travada por treino (Soul ID), Higgsfield segue único.

## Detecção de disponibilidade (rode ANTES de escolher)

O menu só vale entre engines **vivos** neste ambiente. Antes de escolher, probe (1 comando por engine,
segundos, zero custo) e risque do menu o que não responder:

| Engine | Probe | Vivo quando |
|---|---|---|
| **Grok Imagine** | `grok --version` e, se houver squad instalado, `bun ~/squads/grok-studio-nirvana/scripts/grok-media.ts doctor` | binário ok + trilho A (assinatura logada via `grok login`) OU trilho B (`XAI_API_KEY` com créditos) — o doctor diz qual |
| Higgsfield | `higgsfield account status` | conta autenticada com créditos |
| Veo | `test -n "$GOOGLE_API_KEY"` | key presente |
| Fal/Kling | `test -n "$FAL_KEY"` | key presente |
| Runway | `test -n "$RUNWAY_API_KEY"` | key presente |
| HeyGen | `test -n "$HEYGEN_API_KEY"` | key presente |

Se o binário ou a key faltar: `nrv activate editai` (ffmpeg e o que `dependencies.yaml`
declara) e, para Higgsfield, `nrv activate higgsfield-studio-nirvana`. Depois `<tool> --version`.
Nunca `npm install` / `bun install` / `pip install` neste diretório.

Regra de preferência quando **mais de um** está vivo: case a tarefa pela tabela principal acima.
Empate em tarefa genérica de vídeo: **Grok CLI logado (assinatura) ganha o default** — não consome
créditos de API de terceiros, tem áudio+fala nativos e o custo marginal já está pago na assinatura;
Higgsfield assume quando a tarefa exige Soul ID/Marketing Studio; Veo quando exige diálogo EN
broadcast/loop nativo. Registre no handoff qual probe passou e por que o engine foi escolhido.

## Regra de fallback (honesta)

Registre a cadeia de fallback quando o engine primário falhar (ex.: id Veo vivo → geração anterior
ainda listada → fal/kling → runway). Fallback é mecânico (só em erro de provider), não substitui a
*escolha* semântica acima. Não congele um id `veo-*-generate-*`.

## Ver também

- `higgsfield-cli.md` — superfície CLI completa do Higgsfield.
- Grok Imagine: superfícies verificadas em `~/squads/grok-studio-nirvana/references/` (CLI e API).
- `FUNDAMENTALS.md` — hero-image, chaining, takes (valem para qualquer engine).
- `AUDIO-POLICY.md` / `CREDIT-DISCIPLINE.md` — áudio e custo por engine.
- Inventário de famílias (ids internos deste squad, não catálogo de vendor): `data/tool-registry.yaml`.
- Snapshot datado: `references/state-of-the-art.md`.

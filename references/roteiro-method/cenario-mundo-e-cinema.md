# Cenário-primeiro + gramática de cinema (worldbuilding pra ads de IA)

> Método de roteirista (aprendizado 018) + vocabulário cinematográfico que os modelos de vídeo entendem.
> Aplica-se a qualquer ad gerado por IA (Seedance/Avatar Shots, Higgsfield, Veo, Kling, Runway).

## 🔑 Passo 0: monte o MUNDO antes da narrativa
Não comece escrevendo cena por cena. Primeiro defina **onde a história acontece** — as locações, a hora
do dia, a luz, a paleta, a continuidade. Só DEPOIS encaixe os beats. É o que faz 10 clipes gerados
separados parecerem **o mesmo filme**. As 4 camadas de consistência (de baixo pra cima):

1. **MUNDO/cenário** (locações + luz + paleta + continuidade) ← montar PRIMEIRO
2. **GEAR/look** (figurino/props fixos da campanha)
3. **PERSONAGEM/voz** (avatar/Digital Twin + estilo de fala)
4. **NARRATIVA** (beats/falas) ← encaixar por último, DENTRO do mundo

### Bíblia de mundo (template)
Escreva um `00-CENARIO-MUNDO.md` por campanha:
- **Premissa visual** (a metáfora física da jornada).
- **Regras de continuidade** (o que NÃO muda: hora/luz + direção da luz, paleta, personagem, gear, câmera, áudio).
- **SETs numerados**, cada um com um **bloco colável em inglês** (a "environment string" — reusada VERBATIM).
- **Mapa SET → narrativa** (qual beat acontece em qual locação).
- Prompt final de cada cena = `[shot tag] + SET + GEAR + ação/câmera + fala`.

> Detalhe = **especificidade sensorial + estrutura**, não volume de texto. "Golden hour light from
> camera-left, scattered clouds below" vale mais que um parágrafo vago. Constraints em fraseado POSITIVO.

> Bíblia em branco pra copiar: `assets/cenario-mundo-template.md`. Voz da marca: `definir-voz-da-marca.md`.

## 🎨 ESTILO: o LOOK (defina junto com o mundo)
Cenário é ONDE; estilo é COMO se vê. Decida 5 eixos e mantenha em toda a campanha:

| Eixo | Decida | Tokens (EN) |
|---|---|---|
| **Paleta** | 2-3 cores + 1 acento | "warm golden palette", "muted earth tones, electric-blue accent" |
| **Luz/mood** | aspiracional / dramático / clean / simpático | `golden hour`, `low-key chiaroscuro`, `high-key clean`, `soft diffused` |
| **Lente** | imersão ou isolamento | `wide-angle lens`, `telephoto 85mm, shallow depth of field` |
| **Textura** | cinema real vs render plástico | `film grain`, `natural skin texture`, `clean rendering, artifact-free` |
| **Ritmo** | nada parado | deriva sempre (vento, sway, respiração); corte a cada 2-4s (pós) |

### 🚨 Regra "não parece IA" (aprendizado 028)
O look que denuncia IA: **fundo navy + glow azul + cards com borda + tudo centralizado e parado.**
Fuja: **uma** cor de destaque (não arco-íris) · luz **com direção** (golden/rim) · **textura real**
(grão, pele natural) · **movimento residual sempre** (cena calma ≠ cena estática) · tipografia/legenda
limpa, não tudo centralizado. O estilo é do produto do ALUNO — não herde o golden hour do exemplo.

## Gramática de cinema → tokens de prompt (em inglês — é como o modelo entende)

**Tamanho de plano** (distância emocional): `extreme close-up` (intensidade) · `close-up`/`medium close-up`
(conexão/fala — coração do talking-head) · `medium shot` (neutro) · `wide shot`/`establishing shot` (contexto/escala).
> Em IA-avatar, plano muito aberto perde o rosto — fala/identidade vai em close/médio.

**Ângulo** (psicologia): `low angle` (poder/autoridade) · `high angle` (vulnerabilidade) · `eye-level`
(paridade/confiança — bom p/ CTA) · `dutch angle` (tensão/caos) · `POV shot` (imersão).

**Movimento de câmera** (UM por cena): `slow push-in`/`slow dolly in` (crescendo) · `pull-out`/`camera pulls
back to reveal` (contexto/escala) · `tracking shot` (acompanha energia) · `handheld` (urgência/realismo) ·
`orbit`/`arc` (épico) · `crane up` (grandiosidade) · `whip pan` (energia/transição) · `static shot`.

**Lente/foco:** `wide-angle lens` (velocidade/imersão) · `telephoto`/`85mm` (comprime, isola) ·
`shallow depth of field`/`bokeh` (isola o sujeito) · `deep focus` (contexto) · `rack focus`.

**Luz/mood:** `golden hour` (caloroso/aspiracional) · `rim light`/`backlit` (herói/separação) ·
`low-key`/`chiaroscuro` (drama) · `high-key` (clean/otimista) · `soft diffused` (simpatia) · `volumetric/god rays`.

## Receitas (combos por momento de ad)
- **HOOK de choque:** `[wide→close-up]` · `dutch angle` · `tracking` · `wide-angle` · `golden hour rim`.
- **AUTORIDADE:** `[medium close-up]` · `low angle` · `slow push-in` · `telephoto, shallow DoF` · rim light.
* **VIRADA/revelação:** `[close-up→pull-out]` · `camera pulls back to reveal` ou `dolly zoom` · luz vira high-key.
- **CTA:** `[medium close-up]` · `eye-level` · `static`/gentle push-in · `shallow DoF` · `high-key warm`.

## Ritmo do ad vertical 9:16 (15-22s)
Hook nos **3s** (sem build-up) · corte a cada **2-4s** (~6-9 planos em ~18s) · **legenda sempre** (muita
visualização é muda; não memorize percentual) · rosto/texto no **terço superior/central** (safe zone). Detalhes/regras: ver também o
`cinema-cheatsheet.md` do experimento de ads (vocabulário completo + fontes oficiais por modelo).

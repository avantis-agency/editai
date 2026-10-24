# Cenário + Estilo + Roteiro — o método (worldbuilding pra ads de IA)

> O que pensar ANTES de gastar crédito. Vale pra qualquer modelo (Higgsfield, Seedance/HeyGen, Veo,
> Kling, Runway). Método de roteirista (aprendizado 018) + gramática de cinema que os modelos
> entendem + regras de estilo "não-IA" (aprendizado 028). Os exemplos (paraquedas, climatização) são só
> **exemplos** — você preenche com o SEU produto.

---

## 1. CENÁRIO — monte o MUNDO antes da narrativa

Não comece escrevendo cena por cena. Primeiro defina **onde** a história acontece: locações, hora do
dia, luz, paleta, continuidade. É o que faz N clipes gerados separados parecerem **o mesmo filme**.

### As 4 camadas de consistência (monte de baixo pra cima)
1. **MUNDO/cenário** (locações + luz + paleta + continuidade) ← PRIMEIRO
2. **GEAR/look** (figurino/props fixos da campanha)
3. **PERSONAGEM/voz** (avatar/Digital Twin + estilo de fala)
4. **NARRATIVA** (beats/falas) ← por último, DENTRO do mundo

> Ad simples avulso (1 clipe) pode pular a bíblia — basta uma frase de mundo. **Multi-clipe NÃO
> pula:** travar o cenário num bloco colável reusado VERBATIM, senão a continuidade deriva (céu
> muda, roupa muda, luz muda — aprendizado 019).

### Template — `00-CENARIO-MUNDO.md` (preencha por campanha)

```markdown
# Cenário & Mundo — [NOME DA CAMPANHA]

## Premissa visual (a metáfora física)
[Uma frase: a jornada/imagem central. Ex.: "queda livre = a transição econômica".]

## Regras de continuidade (o que NÃO muda entre clipes)
- Hora/luz: [ex.: golden hour, sol baixo, luz de camera-left]
- Paleta: [2-3 cores + o acento da marca]
- Personagem: [quem, gear fixo]
- Câmera: [ex.: handheld no caos, estável no calmo]
- Áudio ambiente: [ex.: vento forte / sala silenciosa]

## SETs (locações) — cada um com bloco colável em INGLÊS (environment string)
### SET A — [nome]
> `[descrição sensorial concreta em inglês: lugar, luz, paleta, clima]`
### SET B — [nome]
> `[...]`

## Mapa SET → narrativa
| Beat / fala | SET |
|---|---|
| [hook] | SET ? |
| [CTA]  | SET ? |

## Fórmula do prompt
[shot tag] + SET (bloco colável) + GEAR (bloco fixo) + ação/postura + movimento/vento + câmera (1) + fala embutida + Vertical 9:16.
```

### Exemplo preenchido (campanha paraquedas)
Jornada vertical: avião velho → queda livre → paraquedas → chão, tudo num golden hour. SET B (céu):
`high altitude open sky at golden hour, deep blue above and a scattered white cloud layer below, the
low sun flaring as a warm rim light from camera-left, the distant earth far below, powerful rushing
wind, vast and exhilarating`. Resultado: 13 clipes separados, o mesmo filme.

> **Detalhe = especificidade sensorial + estrutura, não volume.** "golden hour light from
> camera-left, scattered clouds below" > um parágrafo vago. Constraints em fraseado POSITIVO.

---

## 2. ESTILO — defina o LOOK (e fuja do "cara de IA")

Estilo = paleta + luz + lente + textura + ritmo. Defina 1 vez, mantenha em tudo.

| Eixo | Decida | Tokens (EN) |
|---|---|---|
| **Paleta** | 2-3 cores + 1 acento | "warm golden palette", "muted earth tones, electric-blue accent" |
| **Luz/mood** | aspiracional / dramático / clean / simpático | `golden hour`, `low-key chiaroscuro`, `high-key clean`, `soft diffused` |
| **Lente** | imersão ou isolamento | `wide-angle lens`, `telephoto 85mm, shallow depth of field` |
| **Textura** | cinema real vs render plástico | `film grain`, `natural skin texture`, `clean rendering, artifact-free` |
| **Ritmo** | nada parado | sempre uma deriva: vento, sway, respiração; corte a cada 2-4s na pós |

### 🚨 Regra "não parece IA" (aprendizado 028 — design premium)
O "look IA padrão" que denuncia: **fundo navy + glow azul + cards com borda + tudo centralizado e
parado.** Fuja dele:
* **UMA** cor de destaque (não arco-íris).
- Luz **com direção** (golden hour / rim light), não chapada.
- **Textura real** (grão de filme, pele natural), não superfície plástica.
- **Movimento residual sempre** — cena calma ≠ cena estática (foto com lip-sync = morte).
- Tipografia/legenda à esquerda ou limpa, não tudo centralizado.

> O estilo é do produto do ALUNO: SaaS sóbrio → `high-key, minimal, soft light`; fitness/energia →
> `dynamic, high contrast, handheld, vibrant`; artesanal → `warm, golden, film grain, cozy`. Escolha
> o que a marca comunica — não herde o golden hour do exemplo.

---

## 3. GRAMÁTICA DE CINEMA → tokens de prompt

Em inglês (é como o modelo entende). **Um movimento de câmera por clipe.** Movimento = frase
separada ("The camera pushes in"), não embutido na ação. Descreva ação/óptica concreta, não humor
("epic/beautiful" são fracos).

**Plano (distância emocional):** `extreme close-up` (intensidade máxima) · `close-up` (fala/empatia)
· `medium close-up` (autoridade calorosa) · `medium shot` (neutro) · `wide`/`establishing shot`
(contexto) · `extreme wide`/`aerial` (escala). *Plano muito aberto perde o rosto — fala vai em close/médio.*

**Ângulo (psicologia):** `low angle` (poder) · `high angle` (vulnerabilidade) · `eye-level`
(paridade/confiança — bom p/ CTA) · `dutch angle` (tensão/caos) · `POV shot` (imersão).

**Movimento (UM por clipe):** `slow push-in`/`dolly in` (crescendo) · `pull-out to reveal`
(contexto) · `tracking shot` (acompanha) · `handheld` (urgência) · `orbit`/`arc` (épico) · `crane
up` (grandiosidade) · `whip pan` (transição) · `dolly zoom` (choque) · `static shot`.

**Lente/foco:** `wide-angle lens`/`24mm` (velocidade/imersão) · `telephoto`/`85mm` (comprime, isola)
· `shallow depth of field`/`bokeh` (isola o sujeito) · `deep focus` (contexto) · `rack focus`.

**Luz/mood:** `golden hour` (aspiracional) · `rim light`/`backlit` (herói) · `low-key`/`chiaroscuro`
(drama) · `high-key` (clean/otimista) · `soft diffused` (simpatia) · `volumetric`/`god rays`.

### Receitas por momento do ad (1 receita = 1 clipe)
- **HOOK de choque:** `[wide → close-up]` · `dutch angle` · `tracking` · `wide-angle` · `golden hour rim light`.
- **AUTORIDADE (a tese):** `[medium close-up]` · `low angle` · `slow push-in` · `telephoto, shallow DoF` · rim light.
- **VIRADA/revelação:** `[close-up → pull-out]` · `camera pulls back to reveal` ou `dolly zoom` · luz vira `high-key`.
- **CTA:** `[medium close-up]` · `eye-level` · `static`/gentle push-in · `shallow DoF` · `high-key warm`.

---

## 4. ROTEIRO — estrutura + fala preparada

```
Hook (0–3s) → Problema → Solução → Prova → CTA      |  total 15–30s (social: 15–22s)
```
- **O hook é 80% do jogo** — gere 3 ângulos distintos e teste.
- **Uma ideia / um benefício / um CTA** por ad.
* Storyboard por cena = **visual + fala + duração + câmera (verbo concreto)**. Soma = alvo.
- **Ritmo 9:16 (15-22s):** hook nos 3s (sem build-up) · corte a cada 2-4s (~6-9 planos) · **legenda
  sempre** (muita visualização é muda; não memorize percentual) · rosto/texto no terço superior/central (safe zone).

### A fala SEMPRE preparada pra TTS (a voz de IA lê sigla/marca errado)
- **Siglas/marca foneticamente:** PMOC→"pemóque", AC→"á-cê", CREA→"crê-a", "IA"→"inteligência
  artificial", R$ 500.000→"quinhentos mil reais". Decida se a sigla é **palavra**
  (pemóque) ou **soletrada** (á-cê) e escreva como soa.
- **Direção de voz CALMA/CLARA** (`calm, clear, well-articulated, unhurried`). NUNCA "rápida" —
  engole sílabas em PT. Velocidade só na pós (`acelerar.sh 1.5×`).
- **Cláusula de enunciação** (grafia normal, sem hífen): `speak the words "X", "Y" clearly and
  fully, every syllable.` — só palavras que ESTÃO na fala daquele clipe (multi-clipe: uma por clipe).
  **Clipe sem palavra difícil → OMITA a cláusula** (nunca invente palavra: vira fala fantasma).
  Info de TELA (CRO, CNPJ, site) não vai na fala — vai como legenda na pós. Nome de marca composto
  ("OdontoVida") → escreva como soa + ponha na cláusula do clipe onde é dito.
- **Trava pós-diálogo** + **cláusula negativa anti-prop** (ver o SKILL.md, Parte 3).
- **Divida por DURAÇÃO falada, não por palavras:** ~12-15s de fala calma por clipe (≈ 35-45 palavras
  PT). Passou disso, 2 clipes (hook+problema+solução | prova+CTA).

> Para roteiro profundo — 10 fórmulas de hook, 10 gatilhos de persuasão, matriz 3×3×3 de variações,
> e o catálogo completo de palavras-risco PT-BR — use a skill **`roteiro-copy-ads`**.

---

## Checklist (antes de montar o prompt)
- [ ] **Cenário** num bloco colável (bíblia se multi-clipe)
- [ ] **Estilo** decidido e passou no teste "não parece IA"
- [ ] **Roteiro** com 1 hook escolhido (de 3), 1 ideia, 1 CTA
- [ ] **Fala** foneticamente preparada + direção calma + cláusulas por clipe
- [ ] Câmera = 1 movimento concreto por cena; soma de durações = alvo

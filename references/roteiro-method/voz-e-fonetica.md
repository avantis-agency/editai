# Preparar a fala para voz de IA (TTS) — fonética, dicção, ritmo

A voz gerada (Higgsfield `generate_audio`, HeyGen, ElevenLabs) lê **siglas, nomes de marca e
palavras técnicas longas** errado. Prepare o texto da fala — não confie na grafia. Lições reais
do estúdio (caso AcmeClima).

## 1. Escreva siglas e marca FONETICAMENTE

| Escrito | A IA fala errado | Escreva na fala |
|---|---|---|
| AC | "âc" | **"á-cê"** (soletrada: as letras A-C) |
| PMOC | soletrado/truncado | **"pemóque"** (lida como PALAVRA, não soletre P-M-O-C) |
| CREA | "creia" | **"crê-a"** |
| ART | "art" | **"á-érre-tê"** |
| R$ 500.000 | confuso | **"quinhentos mil reais"** |

> Decida se a sigla é falada **como palavra** (PMOC→"pemóque") ou **soletrada** (AC→"á-cê") e
> escreva exatamente como soa. Soletrar o que se fala como palavra (ou vice-versa) soa robótico.

## 2. Palavras teimosas → CLÁUSULA EXPLÍCITA de enunciação (técnica nº1, validada)

Algumas palavras resistem mesmo com dicção calma (acento + cluster: síndico, laudo, auditoria,
engenheiro). A técnica **confiável e validada** é uma cláusula no FIM do prompt **nomeando as
palavras difíceis** e mandando articular por inteiro — com **grafia normal**:

```
... speak the words "laudo", "auditoria" and "engenheiro" clearly and fully, every syllable.
```

> 🧪 **Evidência real (caso real de climatização):** o clipe que ficou perfeito tinha essa cláusula. Quando ela foi
> **dropada** numa reescrita, a MESMA fala saiu "laudo→lau", "auditoria→autoria". Recolocá-la
> conserta. **Por isso: prompt validado se reusa VERBATIM — não parafraseie.**

> 🚫 **NÃO use respelling com hífen** ("au-di-to-ri-a"): backfira no Higgsfield — gera gagueira
> ("autoriria") e até alucinação ("EFASC MyTeoria"). Hífen só, no máximo, para UMA sigla curta
> falada como palavra ("sín-di-co" funcionou p/ síndico uma vez), e sempre com QA. A regra geral
> é grafia normal + cláusula explícita de enunciação.

> ⚠️ A voz gerada do Higgsfield tem **variância entre gerações** em PT técnico. Se mesmo com a
> cláusula + dicção calma uma palavra escorregar, **regere o mesmo prompt** (best-of-N) ou roteie
> a fala pro HeyGen (voz PT mais estável). Não empilhe hífens tentando "forçar".

### 2.1 Casos-limite da cláusula (onde o aluno erra)
- ✅ **Clipe SEM palavra difícil → OMITA a cláusula.** Nunca invente uma palavra só pra "cumprir" a
  cláusula — palavra que não está na fala vira **fala fantasma**. Sem palavra difícil, o clipe leva
  só a trava pós-diálogo + a cláusula negativa.
- 📺 **Info que é da TELA, não da voz** (CRO, CNPJ, número de registro/licença, @arroba, site): NÃO
  prepare nem coloque na fala — vai como legenda/rodapé na pós. Só prepare o que vai ser **dito**.
- 🏷️ **Nome de marca composto/inventado** (ex.: "OdontoVida", "TechFlow"): a voz erra muito. Escreva
  como soa ("odôntovida") E ponha a marca na cláusula de enunciação **do clipe onde ela é dita**.

## 3. Ritmo: separe o ritmo do CORTE do ritmo da VOZ (regra crítica)

🚨 **Erro clássico:** pedir voz **"rápida/enérgica"** em texto técnico → a voz **engole sílabas**
(síndico→singta, laudo→lau, engenheiro→engenhetro, auditoria→audiria). A MESMA palavra que sai
limpa num texto calmo quebra no acelerado.

- **Ritmo do CORTE** (edição/jump cuts) → pode/deve ser rápido. Isso é pós-produção.
- **Ritmo da VOZ** (locução) → **calmo, claro, articulado.** Escreva no prompt da geração:
  *"calm, clear, well-articulated, natural unhurried pace, enunciate every word; clear diction over energy."*
- Ficou lento? **Acelere por fora** (script `acelerar.sh` da pós-produção, 1.5×) — preserva todas
  as sílabas. **Nunca** resolva mandando a voz correr na origem.

## 4. QA da fala

Sempre transcreva o vídeo gerado com **whisper `medium`** (nunca `small` — o small inventa erros).
Se o `medium` também trouxer a palavra quebrada, é o áudio mesmo → ajuste fonética/dicção e
regenere. (Ferramenta: `pos-producao-ads/scripts/qa-audio.sh`.)

## 5. Catálogo de palavras de risco (por categoria)

Lista completa de classes de palavras que quebram a TTS em PT-BR (siglas, técnicas longas, -ções,
números/leis, estrangeirismos, abreviações, homógrafos) + a técnica de cada uma e um checklist:
→ **`references/palavras-risco-ptbr.md`**. Varra o roteiro por essas categorias antes do handoff.

## 6. Caso especial: Seedance / HeyGen Avatar Shots (áudio gerado na cena)

No **Avatar Shots** (cena cinematográfica do HeyGen, motor Seedance) o áudio é **gerado junto com o
vídeo** — NÃO é o TTS clássico. Consequências (pesquisa oficial + aprendizado 017):

- 🚫 **Sem controle de pronúncia documentado:** não tem SSML, IPA, dicionário nem a "cláusula de
  enunciação" da §2 (essa vale pro Higgsfield/Video Agent, não pro Seedance). A fala vai **no próprio
  prompt** e não se mistura "script" com "voice-over".
- ⚠️ **PT-BR é zona cinzenta** (o Help Center não lista português como "stable"). Palavras incomuns
  embolam — caso real: **"paraquedas" → "paragudas"/"paraquivos"**.
- **Como escrever palavra difícil pra sair limpa** (ordem de confiança):
  1. **Respelling com ESPAÇOS + MAIÚSCULA na tônica:** `pa ra QUÉ das` (NÃO hífen — vira "traço" falado).
  2. **Isolar com vírgulas** pra dar tempo de articular: `..., pa ra QUÉ das, ...`.
  3. **Acento real** ajudando a tônica: `paraquédas`.
  4. **Trocar por sinônimo / reescrever** a frase pra evitar a palavra.
  5. **Re-roll** (gerar de novo) — faz parte do fluxo; **QA medium** depois (`qa-audio.sh`).
- 🔑 **Quando a dicção é crítica:** NÃO confie no Seedance pra PT técnico. **Gere a FALA no Video Agent/
  Avatar IV** (que tem controle de pronúncia + Brand Glossary) e use o Avatar Shots só pelo visual —
  alinhado com a regra "fala técnica PT → HeyGen TTS". Detalhes do motor: `gerar-video-heygen/references/avatar-shots-seedance.md`.

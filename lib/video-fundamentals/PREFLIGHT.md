# Preflight de vídeo (gate obrigatório — compartilhado)

**Regra:** se qualquer resposta abaixo for "não sei" ou o artefato não existir no disco,
**PARE**. Não chame `image_to_video`, `speak` ou qualquer geração. Gerar sem estas
respostas produz take bonito e inútil — e queima crédito para descobrir isso.

Responda **por escrito**, na seção `## Preflight` do `shot-plan.md` do episódio.

## As 9 perguntas

| # | Pergunta | Artefato que prova a resposta |
|---:|---|---|
| 1 | Quem apresenta? | `character/CHARACTER-BIBLE-*.md` com seção visual e de personalidade |
| 2 | Como é a voz e a fala dela? | `voice-seed.json` + `voice-performance-notes.md` (ver `VOICE-DIRECTION.md`) |
| 3 | A bible da personagem existe, versionada? | O arquivo — não um parágrafo solto no brief |
| 4 | Quantas imagens da pessoa para iniciar os takes? | Pasta `identity/` com os frames listados |
| 5 | Cabe um take de infográfico aqui? | Sim/Não + uma frase de motivo |
| 6 | O infográfico está criado? | PNG/SVG/still em `infographics/` |
| 7 | Como ele é animado? | Método declarado: i2v, Remotion, Hyperframes ou híbrido |
| 8 | Que texto vai na tela? | Lista: legenda, frase de doutrina, badge, CTA |
| 9 | Qual stack de overlay? | Decisão + squad/script que executa |

## Defaults de decisão

**Personagem.** Prefira pessoa realista de fala simples. Não avatar cartoon, não voz off
anônima sem rosto — o rosto é o que sustenta a retenção.

**Identity kit — quantas imagens.**

| Fase | Quantidade | O quê |
|---|---:|---|
| Mínimo para um episódio | **8** | 1 hero + 7 emoções/poses |
| Catálogo ideal | 12–16 | + perfil 3/4, gestos, segurando objeto, olhando para baixo |
| **Nunca** | 1 | Um único still re-rolado do zero a cada take |

Toda variação sai de `image_edit` **a partir da base** ("keep the same face and outfit").
Regenerar o rosto do zero entre takes da mesma sequência quebra a continuidade — é o erro
mais caro e mais comum.

**Infográfico.** Cabe quando a ideia é **um** mecanismo visualizável em ≤8s. Não cabe
quando é lista de cinco bullets — isso é overlay de texto, não take.

**Animação do infográfico.**

| Método | Quando |
|---|---|
| Remotion / Hyperframes | Números, setas, rótulos exatos, legenda, badge |
| Geração i2v | Atmosfera, movimento de câmera no still, partículas (texto já embutido ou ausente) |
| **Híbrido (preferido)** | Host fala → corta para still animado 4–8s → volta ao host |

**Texto na tela.** Quase sempre sim: legenda queimada (acessibilidade e retenção), uma
frase de doutrina, e o CTA. O host **não** substitui a legenda — o lip-sync erra, a
legenda salva. Para texto exato, nunca confie no gerador de vídeo: use código.

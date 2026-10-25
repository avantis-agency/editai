# Perfis de partida por nicho

Pontos de partida genéricos do briefing guiado (`lib/edit-engine/briefing.ts`). Nenhum deles é de um cliente real, e nenhum é o padrão do squad: o briefing usa um destes só quando o pedido bate com as palavras de `match` ou quando a pessoa passa `"niche"` na entrada.

| id | nicho | clima recomendado | legenda | headline |
|---|---|---|---|---|
| `health-wellness-ugc` | UGC de saúde e bem-estar | calmo | palavra que cresce | fixa, Anton |
| `local-business` | negócio local (restaurante, clínica, loja) | divertido | palavra que cresce | fixa, Anton |
| `course-creator` | infoproduto e aulas | sério/premium | clássica | fixa, Inter |
| `ecommerce-product` | e-commerce e produto | energético | palavra que cresce | fixa, Anton |
| `real-estate` | imobiliário | sério/premium | clássica | fixa, Inter |
| `personal-brand` | marca pessoal | energético | palavra que cresce | só na abertura |
| `church-ministry` | igreja, ministração, pregação, culto | sério/premium (sem música) | uma palavra por vez, branca com sombra suave | sem headline |

Campos: `recommend` marca a opção "(Recomendado)" de cada pergunta (a pessoa ainda escolhe); `apply` muda só o visual do texto (o clima escolhido decide ritmo, música e efeitos); `tips` vira até duas sugestões no plano.

O `church-ministry` (2.3.0) é o único que muda mais que o texto: `apply.cut.mode: "none"` deixa o vídeo contínuo (sem cortes, sem zoom, sem reframe), `apply.canvas: "same-as-source"` mantém a proporção gravada, e a música e os efeitos ficam desligados. Sem B-roll: o template do plano é o `talking-head-captions`.

Um perfil de cliente de verdade não mora aqui: ele fica na pasta do projeto da pessoa, em `editai/profiles/<cliente>.json`. Há um exemplo em `examples/profiles/`.

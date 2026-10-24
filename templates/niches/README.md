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

Campos: `recommend` marca a opção "(Recomendado)" de cada pergunta (a pessoa ainda escolhe); `apply` muda só o visual do texto (o clima escolhido decide ritmo, música e efeitos); `tips` vira até duas sugestões no plano.

Um perfil de cliente de verdade não mora aqui: ele fica na pasta do projeto da pessoa, em `editai/profiles/<cliente>.json`. Há um exemplo em `examples/profiles/`.

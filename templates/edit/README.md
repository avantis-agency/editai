# Templates de edição

Cada template é um edit spec parcial com marcadores `$slot:<nome>`. `bun lib/edit-engine/cli.ts from-template <id> slots.json spec.json` preenche os slots e devolve um spec resolvido. Expressões só aritméticas (`"=$slot:b_at - 0.3"`); qualquer outra coisa é recusada. Caminhos `@squad/...` apontam para a raiz do squad. Todos: 1080x1920, 30 fps, H.264, plataformas padrão Instagram Reels e TikTok.

Desde 1.3.0, os efeitos saem da biblioteca CC0 do squad pelo nome (`@sfx:whoosh`, `@sfx:hit`, com `anchor: true` o impacto cai no segundo pedido) e a música pode vir dela por clima (`music_mood`: calm, chill-beat, emotional, groove, hiphop, upbeat; `bun lib/edit-engine/cli.ts library`). Os slots de caminho aceitam `${VAR}` do ambiente e caminho relativo ao arquivo de slots. Cada template tem um exemplo provado em `examples/` (`EDITAI_MEDIA` aponta para a pasta dos seus clipes).

## `text-only` · Só texto na tela

Foto ou clipe + gancho escrito de 1 a 2 linhas. Para família de gancho sem fala.

| Segundo | Gancho | Por quê |
|---|---|---|
| 0,00 | `text_line_stagger` | linha 1 legível no quadro 0; linha 2 entra 0,35 s depois |
| 0,00 | `whoosh` | marca a entrada do texto |
| 0 → fim | `slow_push` 1,00 → 1,08 | foto parada continua viva |
| 2,50 | `impact_zoom` +5% | quebra de padrão na janela de 2 a 3 s |
| 2,50 | `hit` | som e zoom no mesmo quadro |
| 0,00 | `word_highlight` (opcional) | colore o payoff, sem mudar as palavras |

Slots obrigatórios: `id`, `background`, `hook_lines`, `visual_note`, `alignment_text` (o lote preenche). Padrões: 7 s, `text_y` 380, 66 px, `focus` (0,5; 0,45).

## `pov-app-screen` · POV com tela do app

Pessoa ou cena + gravação de tela real do app. Prova na "holding zone" (3 a 10 s).

| Segundo | Gancho | Por quê |
|---|---|---|
| 0,00 | `text_pop_in` | texto POV legível no quadro 0 |
| 0 → fim | `slow_push` 1,00 → 1,06 | |
| `screen_at` (2,5) | `screen_slot` 620x1100 com borda branca | o produto funcionando segura mais que o corpo |
| `screen_at` | `whoosh` (ancorado) | impacto no quadro da troca |
| `screen_at` | `impact_zoom` +4% | a janela "cai" com peso |

Slots obrigatórios: `id`, `background`, `app_screen`, `hook_lines`, `visual_note`, `alignment_text`. Padrão 9 s; ajuste `screen_duration` = `duration` − `screen_at`. Sem a gravação real do app, use `examples/media/app-screen-placeholder.png` (ou `cli.ts placeholder-screen <out.png>`), que traz escrito PLACEHOLDER, e troque quando a tela existir. `music_mood` e `music_gain_db` (padrão −12 dB antes da normalização) são opcionais.

## `this-vs-that` · Isto VS aquilo

Duas mídias em tela dividida com rótulos colados na divisória (os rostos ficam livres).

| Segundo | Gancho | Por quê |
|---|---|---|
| 0,00 | `split_screen` + `text_pop_in` no rótulo A | comparação lida num olhar |
| `b_at` (0,6) | `whoosh` (ancorado) | lado B entra |
| `b_at` | `hit` + selo "VS" | o contraste aterrissa |
| 0 → fim | `slow_push` 1,00 → 1,04 | |

Slots obrigatórios: `id`, `media_a`, `media_b`, `label_a`, `label_b`, `visual_note`, `alignment_text`. Ajuste `b_duration` = `duration` − `b_at`. `a_focus_y` e `b_focus_y` (0 topo, 0,5 centro, 1 base) escolhem que parte de cada mídia fica na metade: com rosto, tire-o de perto dos rótulos da divisória (o exemplo usa 0,25 nas duas).

## `talking-head-captions` · Rosto falando com legenda

Clipe com a voz do apresentador e tempos por palavra vindos de transcrição (`bun lib/edit-engine/cli.ts transcribe <clipe> <saida.json>` usa o transcritor local do editonny quando ele está instalado; sem ele, use outro transcritor). Desde 1.1.0 o padrão é o estilo que venceu o A/B de 19/10/2026.

| Segundo | Gancho | Por quê |
|---|---|---|
| 0 → fim | `text_pop_in` + `headline_fixed` | headline Anton de 86 px (em) e largura máxima de 820 px, fixa; `headline_mode: "intro"` volta ao 0 a 3 s |
| fala inteira | `caption_bold_word` | caixa alta Anton 72 px (em), 1 a 3 palavras, palavra falada cresce para 114%, palavras com `emphasis: true` em amarelo; `caption_preset: "classic"` volta ao estilo 1.0 |
| `punch_at` → `punch_until` | `punch_in_cut` +7% | simula segunda câmera na frase de ênfase |
| 0 → fim | `slow_push` 1,00 → 1,04 | |
| fala inteira | `music_duck` (se `music`) | faixa 22 LU abaixo da voz, ducking até 8 dB, fade de entrada e de saída |

**Vários takes.** Troque `layers` pela lista de cortes (um layer por frase, `framing` igual em todos) e apague o `punch_in` fixo de `camera`: `transitions` (já no template: J-cut de 2 quadros, crossfade de áudio de 60 ms, punch-in alternado de 7%) cuida das trocas. Nunca dissolve de imagem entre takes do mesmo enquadramento; `transition_in: {type: "dissolve"}` só entre `framing` diferentes. Efeitos sonoros nos cortes só com música, baixos (−26 a −32 dB) e com `only_with_music: true`. O `cli.ts th-batch` faz isso sozinho para N vídeos: recebe os takes, a headline e o roteiro de cada um (`examples/talking-head-batch.json`), pega as palavras dadas ou transcreve os clipes, aplica a grafia do roteiro, renderiza, roda o QA e confere a prévia de cada vídeo.

Voz com passa-alta de 80 Hz, mix a −14 LUFS e pico até −1 dBTP medido depois do AAC. Tamanhos com `size_basis: "em"` são em px de CSS: o motor converte pela métrica da fonte (Anton 86 em = 149 no libass). Slots obrigatórios: `id`, `video`, `words`, `hook_lines`, `duration`, `visual_note`, `alignment_text`. Sem `words`, o template não roda: tempos nunca são inventados.

## `talking-head-broll` · Rosto falando com legenda e B-roll automático

Desde a 2.1.0. É o `talking-head-captions` com a seção `broll` ligada (`broll_mode: "auto"`). O `cli.ts broll-suggest` preenche os itens a partir da fala, o `cli.ts broll-render` desenha os cards e o render põe tudo por cima da câmera e por baixo do texto. O `th-batch` com `"template": "talking-head-broll"` faz os dois passos sozinho (`examples/talking-head-broll-batch.json`).

| Quando | Gancho | Por quê |
|---|---|---|
| a fala cita algo que está em `<projeto>/editai/broll/` | `broll_full` | a mídia do próprio cliente, de 1,5 a 3 s, entra 0,25 s antes da palavra |
| a fala diz número, preço, lista, passos, oferta, virada ou convite a comentar | `broll_card` | card do editonny 1.0.0 com o valor lido na fala; um som por card |
| ponto marcado no mini editor ("põe um card aqui") | `broll_card` | o editonny monta o card com a frase dita ali |

Slots novos: `broll_mode` (`auto`, `manual`, `off`), `broll_min_gap_s` (6), `broll_hook_free_s` (3), `broll_cta_free_s` (2,5), `broll_max_items` (6). Nada nos 3 primeiros segundos nem nos 2,5 s finais, um item a cada 6 s, nunca sobre olhos e boca, a headline, a legenda ou a interface das plataformas. Com `broll_mode: "off"` o vídeo sai igual ao do `talking-head-captions`, byte a byte. Sem o editonny, só a mídia do cliente entra.

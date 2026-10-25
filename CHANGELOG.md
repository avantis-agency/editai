# Changelog

## 2.4.0 (2026-10-25)

Legenda sem vícios, que some nas pausas e fica no centro. É o 2º retorno da editora cliente sobre o vídeo da ministração: "a legenda tem uns vícios, tipo: é… oh…" e "ela teria que ser centralizada no meio do vídeo" (trace `editai-igreja-v3-20261025-133547`). Só a legenda muda: o áudio e o vídeo continuam inteiros. Testado só no Windows 10, com o editonny 1.0.0. A gravação não entrou no squad.

### novo

- **`captions.drop_fillers`** (`lib/edit-engine/captions.ts`): os vícios saem da legenda e do SRT. Há listas em PT e EN (`captions.lang`, ou a língua adivinhada pelas palavras).
  - As hesitações puras (ãh, éh, hum, hm / um, uh, er) saem sempre.
  - As palavras que também são da frase (é, ou, o, né, tipo, oh, ah / like, so, well) só saem com `filler: true` na palavra (a decisão de quem ouviu, com `filler_why`) ou quando o transcritor as escreveu como vogal arrastada ("éé").
  - `filler: false` segura qualquer palavra.
  - O que saiu fica em `captions.dropped`, e desligar a opção devolve tudo.
  - QA `caption_fillers`.
- **`captions.hide_in_pauses`** (preset `word`): o render mede a voz no mesmo envelope de 10 ms do `caption_sync`. A palavra que antecede uma pausa de 0,3 s ou mais termina onde a voz para (`pause_after`), com 80 ms de folga, e não emenda na próxima. QA `caption_pauses`: nenhuma palavra na tela dentro de uma pausa medida, com 120 ms de folga nas bordas.
- **`captions.position`:** `"center"` (meio da tela) ou `"lower_third"` (o lugar da 2.3.0). O QA `captions_center` substitui o `captions_lower_third` quando a legenda está no centro. No 16:9, uma palavra que cobriria o rosto naquele instante sobe ou desce o mínimo, só naquele trecho (`captions.face_shifts`, nas notas), e o QA `caption_face` confere palavra por palavra contra as amostras do `track_faces`.
- **Transcrição que mantém as hesitações:** `cli.ts transcribe ... --hesitations` e `cut ... --continuous --hesitations`. Usam um prompt inicial em PT ou EN com hesitações e uma pasta de cache própria, então a primeira transcrição não é sobrescrita.
- **Perfis:** com o preset `word`, o perfil de estilo liga `drop_fillers` e `hide_in_pauses`. Com `position: "center"`, o halo da sombra fica um pouco mais forte (desfoque 7 a 90%, contra 6 a 85%). O nicho `church-ministry` e o exemplo `ministracao` passam a usar `position: "center"`, e o plano do briefing diz isso.
- **Mini editor:** a palavra some na pausa e acompanha o deslocamento pelo rosto, como no render.

### decisões

- **Palavra gramatical nunca sai pela lista.** No vídeo da igreja, nenhuma das duas transcrições escreveu hesitação, e os "vícios" que a cliente viu eram palavras da frase em lugar errado. O "é" aparecia em cima do "s" de "nós", e o "o", 0,6 s antes do "shalom", no fim de "Deus": as duas ficavam sozinhas no silêncio. O EditAi só tira o que é hesitação certa. O resto é decisão de quem ouviu, registrada na palavra.
- **Campos ausentes = 2.3.0.** O spec da v2 da igreja, re-renderizado, dá os mesmos bytes (`71176fcf…`). O padrão "ligado" mora no perfil de estilo, que é quem escreve o preset `word` nos specs novos.
- **A pausa é medida, não lida do transcritor.** O fim que o Whisper dá às palavras não diz onde a voz para. O render mede a voz e encurta a palavra até onde a pausa começa.
- **Sombra mais forte no centro.** No meio do quadro, a palavra fica sobre a camisa. Com a sombra da 2.3.0, três palavras ficavam abaixo de 4,5:1 (WCAG AA). Desfoque 7 a 90% foi o mínimo que deixou todas acima disso (5,5:1 na fonte; 6,7:1 no vídeo).

### corrigido

- `caption_sync` (2.3.0): a regex que lê os eventos do `.ass` tinha perdido as barras (`(d+):(dd)`). A parte "evento no início da palavra" não lia nenhum evento e passava vazia. Agora lê: desvio máximo de 3 ms na igreja v3.
- `caption_background`: a máscara do contraste rodava a 25 fps e o vídeo a 30. Uma palavra mais curta que um quadro era comparada com a palavra seguinte (deu 1,8:1 no "pra" de 20 ms). As duas leituras agora caem no mesmo quadro.
- `th-batch`: a palavra passada de um take para a linha do tempo leva junto `filler` e `filler_why`.

### alterado

- `spec.ts`, `ass.ts`, `ffmpeg.ts`, `canvas.ts`, `qa.ts`, `continuous.ts`, `style.ts`, `th-batch.ts`, `briefing.ts`, `transcribe.ts`, `cli.ts`, `editor.ts`, `preview/editor/model.mjs`; novo `captions.ts`. Também `templates/niches/church-ministry.json`, `examples/profiles/ministracao.example.json`, README (PT e EN) e `squad.yaml` 2.4.0 (só a versão).

### não mudou

- Sem `drop_fillers`, `hide_in_pauses` e `position` no spec, o `.ass` e o filtergraph são os mesmos de antes. Regressões idênticas byte a byte: v2 `3a95058d…`, fumaça `b21e3618…` e `27f556fd…`, `mode off` `3a95058d…`, e a igreja v2 pelo spec antigo `71176fcf…` (piano `0f73ec64…`).
- O editonny e os outros squads não foram tocados.

## 2.3.0 (2026-10-25)

Vídeo deitado (16:9), modo sem cortes, legenda uma palavra por vez e fonte do usuário. Pedido do usuário, repassando o retorno de uma editora cliente sobre o vídeo de uma ministração: manter a proporção horizontal do original, sem cortes, legenda palavra por palavra branca com sombra preta leve em negrito numa fonte dela, sem a headline e sem a faixa (trace `editai-igreja-v2-20261025-115129`). É a parte mínima da onda 5 da auditoria que esse caso pede (`PLANO-ONDAS.md`). Testado só no Windows 10, com o editonny 1.0.0 instalado. A gravação e a fonte da cliente não entraram no squad.

### novo

- **Canvas por nome** (`lib/edit-engine/canvas.ts`): `"canvas": "1920x1080"`, `"1080x1920"` ou `"same-as-source"` (o tamanho e o fps do primeiro take de tela cheia) no spec, no item do `th-batch` ou no estilo. Sem `canvas`, tudo continua 1080x1920: os templates não mudaram.
- **Áreas seguras do 16:9** (`safe-zones.json`): `youtube_16x9` (controles e barra de progresso do player embaixo, título em cima, 5% nas laterais) e `screen_16x9` (telão, projetor ou TV: fora dos 90% da área segura de título). Cada plataforma pode ter a própria base; o QA mede um canvas só contra as plataformas da orientação dele, então o 9:16 vê as mesmas quatro de antes. O spec recusa plataforma 9:16 num canvas 16:9 e vice-versa.
- **QA do 16:9:** `captions_lower_third` (bloqueia: toda caixa de legenda medida no terço de baixo) e o rosto medido pelo `track_faces.py` do editonny vira a área protegida quando o spec não declara nenhuma (`materializeFaces`, cache ao lado do render). O piso de tamanho de fonte usa o lado menor do canvas (no 9:16 é a mesma conta de antes).
- **Modo sem cortes** (`lib/edit-engine/continuous.ts`): `"cut": "none"` no spec ou no item, `cli.ts cut <vídeo> --continuous` (diagnóstico, palavras com início medido, grafia do roteiro, `--fix` e denoise opcional, sem cortar nada; `cut.json` com `mode: "none"`) ou o estilo com `apply.cut.mode: "none"`. Vence a limpeza padrão e o template: `resolveSpec` tira movimento de câmera, zoom alternado, flash e reframe, com uma nota. QA `continuous_take` (fonte inteira, duração igual com 0,1 s de folga) e `no_scene_cut` (o `scdet` do ffmpeg no vídeo e na fonte: nenhum corte a mais). `breaths_remaining` vira informação: as pausas são do original.
- **Legenda uma palavra por vez** (`captions.preset: "word"`, `ass.ts wordEvents`): uma palavra por evento, do início dela até a próxima (no máximo 0,25 s na pausa), sem acumular a frase; branca, em negrito, sombra preta suave em duas camadas desfocadas (halo sem deslocamento e sombra levemente deslocada), sem contorno grosso. QA `caption_sync` (bloqueia: evento no início da palavra; começo de frase a até 0,1 s da voz medida no envelope de 10 ms), `contrast_captions` aceita a sombra suave, `caption_background` (aviso) mede o fundo da fonte atrás de cada palavra.
- **Fonte do usuário** (`spec.fonts`, `fonts.ts`): uma pasta (`<projeto>/fonts`) ou arquivos `.ttf`/`.otf`, sempre fora do squad (o spec recusa uma pasta dentro dele). A família vem da tabela de nomes do arquivo, a licença fica como "fornecida pelo usuário", e o render copia o arquivo só para a pasta de trabalho dele. `font_fallback` declara a substituta enquanto o arquivo não chega; `font_used` diz qual foi usada, e o QA (`caption_font`, `fonts_user`) mostra. A pasta é lida a cada render, então o mesmo comando, de novo, pega a fonte que chegou.
- **`th-batch`:** `"canvas"`, `"cut": "none"` (takes sem `in` e `duration` = a fonte inteira), `"hook_lines": []` (sem headline) e `"fonts"`. Num canvas 16:9 as posições do template são levadas para o quadro deitado, a legenda vai para 83% da altura e as plataformas viram as do 16:9.
- **Briefing:** ministração, pregação, culto, sermão, "sem cortes" e "contínuo" ligam o modo sem cortes (linha **Limpeza** "nenhuma"); "mesma proporção" e "16:9" viram a linha **Proporção**; "palavra por palavra" e "Fonte: X" vão para a legenda; "remove a headline" tira a headline. "YouTube longo" deixou de ser só 9:16. Nicho novo `church-ministry` (contínuo, proporção original, sem headline, palavra por palavra, sem música, sem whoosh, sem B-roll) e o exemplo `examples/profiles/ministracao.example.json` (só gosto de estilo).
- **Mini editor:** desenha o preset `word` e a sombra suave, carrega a fonte do usuário (`/fonts/user/<arquivo>`, só a que o spec achou) e faz a prévia rápida com metade do canvas (960x540 no 16:9; 540x960 no 9:16, como antes).
- Catálogo: `continuous_take` e `caption_single_word`.

### decisões

- **Halo na sombra.** Só a sombra deslocada deixava a palavra branca fraca sobre uma camisa branca, que é o que fica atrás da legenda num púlpito. O halo desfocado sem deslocamento separa a letra do fundo e continua sendo sombra, sem contorno duro.
- **`caption_sync` mede só começo de frase.** Dentro da fala corrida o envelope não separa uma palavra da outra; o início dessas palavras vem do Whisper corrigido pelo `align_words.py`. O check diz quantos inícios mediu.
- **Áreas seguras do 16:9 sem consulta online.** Esta versão foi feita sem internet. Os números saem da área segura de título de 90% (SMPTE ST 2046-1, EBU R 95) e da nossa leitura do player do YouTube, e a fonte de cada número está no `safe-zones.json`.
- **Duração máxima de 180 s mantida.** Um culto inteiro passa disso; não mexi porque o pedido era de 54 s.

### alterado

- `spec.ts`, `ass.ts`, `fonts.ts`, `measure.ts`, `ffmpeg.ts`, `qa.ts`, `safezones.ts`, `safe-zones.json`, `cut.ts`, `cli.ts`, `th-batch.ts`, `style.ts`, `briefing.ts`, `editor.ts`, `preview-server.ts`, `preview/editor/model.mjs` e `overlay.mjs`; novos `canvas.ts` e `continuous.ts`.
- `squad.yaml` 2.3.0: descrição do squad e das capabilities execute e guided, 1 `example_brief` (58 → 59), critérios `editai_edit_continuous` e `editai_edit_landscape`. Agentes `retention-editor` e `edit-briefing-guide`, task `plan-retention-edit` e workflow `retention-edit` com a exceção do modo sem cortes. README PT e EN.

### não mudou

- Sem `canvas` por nome, `cut: "none"`, `fonts` e preset `word`, o filtergraph e o `.ass` são os mesmos de antes. Regressões idênticas byte a byte: v2 `3a95058d…`, fumaça `b21e3618…` e `27f556fd…`, `mode off` `3a95058d…`.
- Corte medido, B-roll, reframe, estilo de referência, biblioteca, Concat e os pipelines de geração. O editonny e os outros squads não foram tocados.

## 2.2.0 (2026-10-25)

Corte medido e limpeza padrão, onda 2 da fusão com o editonny, e uma fatia da onda 5: gravação deitada que vira vertical seguindo o rosto. Pedido do usuário: "pode trabalhar na fusão então", com um vídeo real de 54 s como prova (trace `editai-onda2-corte-20261025-065311`; plano em `editai-fusao-auditoria-20261024-172940`, `PLANO-ONDAS.md` ondas 2 e 5). Testado só no Windows 10, com o editonny 1.0.0 instalado. A gravação de prova é pessoal e não entrou no squad.

### novo

- **`cli.ts cut <pasta | vídeos>`** (`lib/edit-engine/cut.ts`). Da gravação bruta aos takes do spec, com cada passo medido pelo editonny 1.0.0 por subprocesso:
  1. diagnóstico do áudio antes de editar (`noise_check.py`: ruído, clipping, eco e o denoise sugerido);
  2. palavras (`transcribe_batch.py` numa pasta, `transcribe.py` em arquivos) e frases (`pack_transcripts.py`);
  3. rascunho (`assemble_cut.py`), nunca o corte final;
  4. revisão do rascunho pelo EditAi, a limpeza padrão (matriz 3.1 e 12.2): respiração, ruído, hesitação, falso começo e tomada repetida saem; uma frase completa dita de novo logo em seguida, palavra por palavra, é ênfase e fica; palavra que o rascunho deixou entre dois blocos volta para o vizinho; borda dentro de palavra passa para depois dela; `--plan` guarda o que o agente decidiu (`keep`, `drop`, `optional`);
  5. bordas pela forma de onda (`waveform_cut.py`, `precise_edges.py`);
  6. ritmo (`--pace tight|natural|reverent`): só fica a pausa que o ritmo pede (depois de frase, depois de vírgula), esticando o take para dentro do próprio silêncio, nunca para dentro de respiração, ruído ou palavra; toda junção deixa o J-cut livre da última palavra. As pausas são medidas no corte renderizado e corrigidas (até 3 passadas) e viram `holds` do spec;
  7. "caber em N segundos" (`--fit N`): saem primeiro as frases repetidas, depois o que o plano marcou como desvio, depois as pausas; o que saiu fica listado; se ainda não couber, saída 4 com os candidatos para o agente;
  8. prova: `render_cut.py`, `verify_cut.py` (palavra cortada, clique, níveis) com reparo automático, `audit_cut.py` (retranscreve o corte) e a comparação da fala inteira com a esperada (`--script`, ou as palavras mantidas);
  9. palavras da legenda com o início medido (`align_words.py`; correção acima de 0,25 s é recusada), a grafia do roteiro palavra por palavra (`--script`, que nunca acrescenta fala) e `--fix "ouvido=certo"` para o que o Whisper erra;
  10. `--denoise off|auto|light|strong`: a voz de cada fonte limpa pelo `denoise.py` (perfil das pausas da própria fonte, mesma sincronia) num WAV que os takes usam como áudio (`MediaLayer.audio_src`).
  Saída em `<projeto>/editai/cut/<nome>/`: `cut.json`, `CORTE.md` (rascunho e final lado a lado, o que saiu com tempos e por quê, a prova) e `edit/` (arquivos do editonny). Sem editonny: saída 3.
- **`th-batch`**: o item aceita `"cut": "<cut.json>"` (takes, palavras e pausas pedidas) e `"reframe"`; escreve SRT e VTT ao lado de cada MP4.
- **QA `breaths_remaining`** (matriz 3.6): a voz do spec renderizada sozinha, toda pausa de 0,25 s ou mais pela regra do `breaths.py` (janela de 10 ms, limiar pelo próprio envelope), portada em Bun. Com corte medido só as pausas declaradas e o fim parado podem ficar, e o check bloqueia; com takes escolhidos à mão ele só informa.
- **`cli.ts subtitles <spec>`** (matriz 3.13): SRT e VTT das mesmas palavras da legenda queimada, sem retranscrever, e a conferência (numeração, tempos, sobreposição, texto igual às palavras).
- **`cli.ts audio-check <vídeos>`** (matriz 3.15): o diagnóstico do `noise_check.py` sem cortar nada.
- **Reframe 16:9 → 9:16 seguindo o rosto** (`spec.reframe`, `lib/edit-engine/reframe.ts`, matriz 4.2 em parte): o `track_faces.py` mede o rosto 10 vezes por segundo na fonte e uma câmera virtual mais calma decide o corte (zona morta de 15% do corte, alvo onde a pessoa assenta, viagem de 0,8 a 1,6 s com curva suave, no máximo uma a cada 1,2 s); altura inteira da fonte, rosto no centro. `layout: "band"` põe a imagem sob uma faixa no topo (cópia desfocada e escurecida, ou cor lisa) que guarda a headline longe da cabeça. Os olhos e a boca medidos viram `protect_regions` quando o spec não declara. QA `reframe_face` (bloqueia) e `reframe_motion`; sem editonny, corte central e o aviso `reframe_face_measured`. `cli.ts reframe <spec>` mede e mostra o caminho. O B-roll usa o mesmo rosto.
- Briefing: o plano ganha a linha **Limpeza** (padrão em toda edição completa); "mantém as pausas" e "não corta nada" mudam isso; "caber em 45 segundos" vira a linha **Duração**.
- Agente `retention-editor` com a limpeza padrão como contrato, o `cut` antes do lote e o reframe. Catálogo: `reframe_follow_face`. `doctor`: corte medido e reframe.

### decisões em que o código pediu outra coisa que a auditoria

- **Silêncio sem `silencedetect`.** O plano pedia `breaths_remaining` com `silencedetect`. Ele compara amostra por amostra: o ruído da sala passa do limiar e as pausas que o `breaths.py` (e quem ouve) acha somem. O EditAi usa a janela de 10 ms do editonny; no corte de prova deu o mesmo limiar (-29,6 dB) e as mesmas 9 pausas do `breaths.py`.
- **`breaths_remaining` mede a voz antes do denoise.** Com o fundo limpo, o limiar relativo desce e a pausa natural de uma vírgula vira "silêncio". O que o corte deixou é julgado contra a sala de verdade.
- **Pausa pedida medida no corte, não estimada.** Pela fonte, o eco da sala engana a conta. O `cut` renderiza, mede cada junção como o QA mede e corrige.
- **Take depois do primeiro abre a imagem 2 quadros depois do início medido.** Com `transitions.jcut_frames` 2, a voz entra exatamente no início medido, 2 quadros antes do corte, como o `render_cut.py` que foi verificado.
- **`denoise.py` e `track_faces.py` por `python -B -c`.** São bibliotecas, sem linha de comando para o que o EditAi precisa (limpar uma fonte inteira; medir uma fonte sem `cut.mp4`). O código continua no editonny; nada é gravado na instalação.
- **Comparação da fala pelo texto inteiro.** O `audit_cut.py` compara trecho a trecho, e o Whisper adianta o começo da palavra e a joga no trecho anterior. Valem a fala inteira e as bordas do `verify_cut`; o relatório por trecho fica como informação.
- **Prompt do Whisper sem termos.** Na prova, pôr no `--prompt` o termo que o Whisper ouviu errado não mudou a transcrição (veio errado de novo). Fica só para nomes próprios (matriz 12.5); termo mal ouvido é `--fix`.
- **Faixa no topo para fonte deitada.** Num púlpito a cabeça fica perto do alto do quadro: num corte de altura inteira a headline cairia na testa. A faixa resolve e ainda deixa o corte 32% mais largo (804 contra 608 px), com mais margem para os gestos.

### alterado

- `spec.ts` (`cut`, `reframe`, `MediaLayer.audio_src`), `ffmpeg.ts` (corte com x por quadro e faixa no topo; a voz limpa entra como entrada própria), `qa.ts`, `th-batch.ts`, `broll.ts`, `editor.ts` (`baseSig` com o reframe), `cli.ts`, `briefing.ts`, `doctor.ts`; novos `cut.ts`, `silence.ts`, `denoise.ts`, `subtitles.ts`, `reframe.ts`.
- `squad.yaml` 2.2.0: descrição do squad e da capability execute, 3 `example_briefs` novos (2 PT e 1 EN; 55 → 58), critérios `editai_edit_measured_cut` e `editai_edit_reframe_face`. Nenhuma `keyword` nova (a capability execute segue no limite de 60). Workflow `retention-edit` 1.3.0; tasks `plan-retention-edit` e `audit-retention-edit`; `dependencies.yaml`; README.

### não mudou

- Sem `cut`, `reframe` e `audio_src` no spec, o grafo do ffmpeg é o mesmo texto de antes. Regressões idênticas byte a byte: v2 `3a95058d…`, fumaça `b21e3618…` e `27f556fd…`, e o spec da onda 1 com `broll.mode: "off"` (`3a95058d…`).
- B-roll, estilo de referência, mini editor, biblioteca, Concat e os pipelines de geração. Nenhuma mídia do editonny entrou no squad; o editonny e os outros squads não foram tocados (`helpers/__pycache__` continua inexistente).

## 2.1.0 (2026-10-25)

B-roll automático, onda 1 da fusão com o editonny. Pedido do usuário: "Isso é muito importante, cara, dele saber criar esses B-rolls sozinho", e para a Bianca, que edita no Windows com o Codex, "pode trabalhar na fusão então" (trace `editai-onda1-broll-20261024-175913`; plano em `editai-fusao-auditoria-20261024-172940`, `PLANO-ONDAS.md` onda 1 e `BROLL.md`). Testado só no Windows 10, com o editonny 1.0.0 instalado.

### novo

- **`cli.ts broll-suggest <spec> [--project DIR] [--out F]`** (`lib/edit-engine/broll.ts`). Escolhe os itens de B-roll de um talking head e grava `<id>.broll.spec.json`, com o que ficou fora e por quê:
  - **mídia do cliente** em `<projeto>/editai/broll/`, casada por palavra dita: o nome do arquivo é etiqueta, e um `broll.json` opcional (`[{"arquivo": "forno.mp4", "palavras": ["forno", "pizza"]}]`) acrescenta palavras e expressões; acento, maiúscula e plural simples não contam. Entra 0,25 s antes da palavra e dura até o fim da frase, de 1,5 a 3 s, em tela cheia (foto com aproximação lenta, vídeo mudo, whoosh baixo só com música). Mídia real vence o card no mesmo trecho;
  - **cards do editonny 1.0.0**: monta a pasta `<projeto>/editai/broll/<id>/edit/` (`transcripts/cut.json`, `cut_timeline.json`, `edit_data.json` com gancho e CTA, `preview_marks.json` com as marcações) e chama `suggest_visuals.py`; os valores vêm da fala, e um momento sem valor lido não vira card;
  - **rosto** por take com `face_layout.py` (olhos ao lábio, no quadro do take, cache em `<projeto>/editai/cache/broll/faces/`), ou pelas `protect_regions` do spec quando o editonny não está;
  - **colocação** (`BROLL.md` §6.3): nada nos 3 primeiros segundos nem nos 2,5 s finais, um item a cada 6 s, até 6 itens, nunca sobre olhos e boca em qualquer zoom da câmera, sobre a headline, sobre a legenda nem sobre as faixas de cima e de baixo das plataformas do spec;
  - sem editonny, sai com código 3 e grava o spec só com a mídia do cliente.
- **`cli.ts broll-render <spec>`**: `render_visuals.py --format clip` para cada card, um `.mov` QuickTime Animation com alfa em `<projeto>/editai/cache/broll/<chave>/`, pela chave do modelo, dos parâmetros, da região e da duração; não refaz o que já existe. O `render` faz o mesmo sozinho quando falta um card e transforma marcações em cards.
- **Seção `broll` no spec** (`mode` auto, manual ou off, `min_gap_s`, `hook_free_s`, `cta_free_s`, `max_items`, `items`, `marks`, `faces`, `skipped`, `render_cost`, `lang`). O `resolveSpec` transforma cada item em `MediaLayer` com `broll`, `alpha` e `provenance`, desenhada por cima da câmera (o zoom não arrasta o card) e por baixo do texto; também deriva os sons, as janelas da legenda e os ganchos. O `validate` confere a seção.
- **Legenda e card** (`captions.windows`, escritas pelo `resolveSpec`): o card que escreve as mesmas palavras da fala esconde a legenda só enquanto está na tela; contador e preço deixam a legenda onde está, sobem a legenda para logo acima do card ou, sem lugar, também escondem. A prévia do mini editor segue as mesmas janelas.
- **QA** (`BROLL.md` §6.4): `broll_hook_window`, `broll_face`, `broll_caption_overlap`, `broll_safe_zone`, `broll_quote` e `broll_provenance` bloqueiam; `broll_gap` avisa; `broll_items` e `broll_render_cost` informam. O QA grava a folha de contato `<id>.broll-sheet.png`, um quadro no meio de cada item.
- **Template `talking-head-broll`** e `examples/talking-head-broll-batch.json`. O `th-batch` aceita `"template"` e `"broll_marks"` e roda o `broll-suggest` antes do render (`"broll_project"` aponta a pasta do projeto).
- **Mini editor**: faixa B-roll na linha do tempo (5 faixas) e três comandos rápidos, em PT e EN: "tira esse b-roll", "põe um card aqui" (vira marcação que o `suggest_visuals` sempre mantém; o card sai na próxima prévia) e "b-roll mais curto". Operações novas no conjunto fechado: `broll_remove`, `broll_card`, `broll_shorten`. Corte e trim levam o B-roll junto e o mantêm fora do gancho e do CTA.
- **`doctor`**: versão do editonny, cards de B-roll ("B-roll de cards: indisponível" sem editonny), posição do rosto e, no Windows, Modo de Desenvolvedor, `python` x `python3` e `PYTHONUTF8`, cada um com o que fazer.
- **`lib/edit-engine/editonny.ts`**: onde está o editonny, a versão e os helpers. No Windows uma 1.1.x conta como ausente por causa de soumatheusgomes/editonny#7 (`EDITAI_EDITONNY_ANY_VERSION=1` libera). Toda chamada usa o Python da `.venv`, `-B`, `PYTHONDONTWRITEBYTECODE=1`, `HF_HUB_OFFLINE=1` e `PYTHONUTF8=1`.
- Catálogo de ganchos: `broll_card`, `broll_full`, `broll_pip`. Agente `retention-editor` com as regras de não inventar no card (matriz 12.1).
- README (PT e EN): "B-roll automático" e "Windows: editonny para o EditAi" (Modo de Desenvolvedor, `python`, `PYTHONUTF8=1`, versão 1.0.0 fixada e como voltar se o instalador subir para a 1.1.0).

### decisões em que o código pediu outra coisa que a auditoria

- **Cards desenhados e medidos, não só posicionados.** Os cards do editonny não cabem sempre na região pedida: o contador e o preço calculam o próprio tamanho pela largura. O EditAi desenha, lê o retângulo real da tinta (`ink` do `render_visuals.py --format clip`), recoloca com a altura medida e tenta cards mais estreitos antes de desistir. O QA usa a mesma tinta.
- **`--format clip` no lugar de `--format mov`.** O clipe vem com o retângulo da tinta, que o QA de rosto e de legenda precisa.
- **Contador e preço escondem a legenda como último recurso.** A regra da auditoria deixava a legenda e mandava o card para o centro "se o rosto deixar"; num selfie com o rosto no centro o centro nunca está livre e o card caía sempre. O card mostra o número que acabou de ser dito, e a legenda some só durante ele.
- **Palavras fixas dos cards em PT.** O editonny 1.0.0 escreve "only", "What you *receive*:", "You do *not* need:", "Completed" e "GUARANTEE" mesmo com fala em português; com fala em PT o EditAi troca por "apenas", "Você *recebe*:", "Você *não* precisa de:", "Concluído" e "GARANTIA". Valores e itens da fala não mudam.
- **Detectores em PT, não em PT e EN.** A matriz (2.1) diz que os detectores falam as duas línguas; o código do 1.0.0 tem em inglês só preço, porcentagem e contagem com uma lista curta de unidades. Na fala de teste em inglês ele não achou nenhum momento sozinho. Para inglês, o caminho é a marcação ("põe um card aqui").
- **Sem `split_top` nesta onda.** O `broll_split` pede reenquadrar a pessoa na metade de baixo e a regra da costura da legenda; fica para a onda 3, com o template `split-evidence`. Mídia do cliente entra em tela cheia (`broll_full`) ou numa janela pedida (`broll_pip`).
- **Tela cheia não passa pelo QA de rosto.** No corte para a mídia do cliente a pessoa não aparece; o `broll_face` mede cards e janelas.

### alterado

- `spec.ts`, `ffmpeg.ts` (B-roll depois do zoom e antes do texto), `ass.ts` (janelas da legenda, corte por tempo do evento), `qa.ts`, `cli.ts`, `th-batch.ts`, `live-ops.ts`, `quick.ts`, `live.ts`, `editor.ts` (`baseSig` com o B-roll; janelas na prévia), `doctor.ts`, `preview/index.html`, `app.css`, `editor/tracks.mjs`, `editor/model.mjs`.
- `squad.yaml` 2.1.0: descrição do squad e das capabilities execute e live, 3 `example_briefs` novos de B-roll automático (2 PT e 1 EN; 52 → 55), critério `editai_edit_broll_qa`. Nenhuma `keyword` nova: a capability execute já está no limite de 60 do schema, e os 55 briefs voltam ao EditAi em top-1 sem elas. Workflow `retention-edit` 1.2.0; tasks `plan-retention-edit`, `audit-retention-edit`, `review-edit-preview`; workflow `live-edit`; `dependencies.yaml`; `templates/edit/README.md`; `examples/README.md`.

### não mudou

- Sem a seção `broll`, ou com `broll.mode: "off"`, o grafo do ffmpeg é o mesmo texto de antes. Regressões idênticas byte a byte: v2 `3a95058d…` e fumaça `b21e3618…` e `27f556fd…`; o spec da prova com `mode: "off"` também dá `3a95058d…`.
- Briefing, estilo de referência, biblioteca, Concat e os pipelines de geração. Nenhuma mídia do editonny entrou no squad; o editonny e os outros squads não foram tocados, e nada foi gravado na instalação dele (`helpers/__pycache__` continua inexistente).

## 2.0.0 (2026-10-24)

O squad passa a se chamar **EditAi**, de "edita aí" e de "Edit AI". Pedido do usuário: "EditAi o nome do squad rs" (trace `squad-rename-editai-20261024-172118`). Até a 1.8.0 ele era o `retention-video-studio`, com prefixo `rvs`. A versão sobe para 2.0.0 porque o nome, a pasta do squad, a pasta no projeto e o cache mudaram, e quem já usava precisa trocar os comandos. Testado só no Windows 10.

### quebra de compatibilidade

- **Slug e pasta:** `retention-video-studio` → `editai`. O squad mora em `~/squads/editai` (a pasta foi movida, não copiada). Os comandos passam a ser `bun ~/squads/editai/lib/edit-engine/cli.ts ...`, `nrv activate editai` e `nrv validate squad editai`.
- **Prefixo:** `slashPrefix` `rvs` → `editai` (conferido contra os 62 squads de `~/squads`; nenhum usa `editai`).
- **Critérios de aceite:** os ids `rvs_*` viraram `editai_*` (por exemplo `editai_guided_first_use`). Nenhum arquivo do squad citava os ids antigos.
- **Variáveis de ambiente:** `RVS_MEDIA`, `RVS_OUT` e `RVS_PROJECT` viraram `EDITAI_MEDIA`, `EDITAI_OUT` e `EDITAI_PROJECT`. Os nomes antigos continuam valendo (veja abaixo).

### compatibilidade com o que já existe

- **Cache da biblioteca:** passa de `~/.nirvana/cache/retention-video-studio/` para `~/.nirvana/cache/editai/` (`config/library.json`, campo novo `legacy_cache_dirs`). No primeiro uso o motor move o cache antigo para o novo: a pasta inteira quando o novo não existe, senão arquivo por arquivo, e a cópia nova vence quando o arquivo está nos dois. O que não puder ser movido (outro disco, arquivo travado) continua sendo lido do lugar antigo. Nada precisa ser baixado de novo.
- **Pasta no projeto:** o que o squad grava no projeto da pessoa passa de `rvs/` para `editai/` (`briefs/`, `profiles/`, `styles/`, `references/`). A pasta `rvs/` de um projeto antigo é lida e nunca gravada: o histórico conta para o primeiro uso, o perfil do cliente aparece em `profiles` (marcado "pasta antiga rvs/") e no "Mesmo estilo da última vez?", e ao confirmar o perfil é salvo em `editai/profiles/`, somando os usos. Um brief aberto pela 1.8.0 em `rvs/briefs/` é respondido e confirmado no lugar. Os caminhos de estilo escritos à mão num lote (`rvs/styles/...`) continuam valendo.
- **Variáveis:** `${EDITAI_MEDIA}`, `${EDITAI_OUT}` e qualquer `${EDITAI_*}` sem valor caem no `RVS_*` antigo; `RVS_PROJECT` vale quando `EDITAI_PROJECT` não está definido. Lotes e slots antigos com `${RVS_MEDIA}` funcionam como antes.
- **Mini editor:** o rascunho de marcações guardado no navegador (`rvs-preview:marks:`) é lido uma vez e passa para `editai-preview:marks:`.

### alterado

- `squad.yaml` 2.0.0: `name`, `slashPrefix`, descrição do squad e das 10 capabilities com o nome EditAi; `keywords` com `editai` nas capabilities execute, live e guided; 4 `example_briefs` novos que citam o EditAi (2 PT e 2 EN; 48 → 52).
- **IDs de capability mantidos** (`video.retention_edit.*`, `video.reference_style.extract`, `video.text_hook_batch.execute`, os 3 pipelines e `media.video.compose`). Eles descrevem a função, não a marca; o `media.video.compose` é compartilhado com outros squads; e o self-retrieval ficou verde sem mexer neles. Trocar só mudaria o que `nrv run --squad editai:<capability>` aceita, sem ganho de roteamento.
- Motor: `project.ts` (`appDir`, `appRoots`, `findProfile`, `LEGACY_APP_DIRS`), `briefing.ts` (histórico e perfil nas duas pastas; o campo `history.rvs` do `state.json` virou `history.folder`; "nunca usei o EditAi" e "primeira vez usando o EditAi" contam como primeira vez), `cli.ts profiles`, `style.ts`, `template.ts` (variáveis antigas), `library.ts` (cache novo e mudança do antigo), `doctor.ts` (`nrv activate editai`).
- Mini editor: título "EditAi · Mini editor", marca "EditAi" no topo, fonte da prévia registrada como "EditAi <família>", dicas citando o EditAi.
- README (PT e EN): nome, origem do nome, instalação, "Primeiro uso em 3 passos" com o caminho absoluto, pasta `editai/`. Agentes `edit-briefing-guide` e `retention-editor`, tasks, workflows, `dependencies.yaml`, `examples/`, READMEs de `templates/` e `assets/`, `.gitignore`.
- As entradas antigas deste CHANGELOG ficaram como estavam: o nome antigo nelas é histórico.

### não mudou

- Motor de render, QA, legendas, áreas seguras, templates, briefing (perguntas, plano e acolhida), estilo de referência, mini editor e editor com IA, biblioteca e Concat. Regressões idênticas byte a byte: v2 `3a95058d…` e fumaça `b21e3618…` e `27f556fd…`.
- O editonny e os outros squads não foram tocados.

## 1.8.0 (2026-10-24)

Acolhida de primeiro uso no briefing guiado. Pedido do usuário: "para quem inicia uma conversa nova e chama ele, ter essa função seria interessante", e numa conversa em andamento "não precisa ficar me perguntando" (trace `rvs-acolhida-20261024-170329`). Testado só no Windows 10, pelo `brief` em modo não interativo.

### novo

- **Detecção de primeiro uso** (`lib/edit-engine/briefing.ts`). O `brief` grava `first_use` no `state.json` (`status` yes, no ou ask, `reason`, `lang`, `round`, `show_now`, `welcome` e o histórico medido). A ordem da decisão:
  1. o que a pessoa disse (`"first_use": true|false` na entrada, ou frases como "minha primeira vez", "nunca usei o squad", "first time using");
  2. conversa em andamento (`"session": "ongoing"`, posto pelo agente): nada;
  3. histórico no projeto, com perfil salvo ou brief confirmado: nada;
  4. pedido completo, com destino, formato e clima: nada;
  5. só briefs abertos e nunca confirmados: a detecção não tem certeza e pergunta "É a primeira vez usando o squad?" (sim/não, a única pergunta sem "Outro");
  6. sem `rvs/`, ou sem brief nem perfil: primeira vez.
- **Acolhida** em `welcome.md`, de 7 linhas: formatos, pedido por texto, áudio ou opções, vídeo ou link de referência, mini editor com ajuste em texto livre e o final em Downloads. Ela vem antes das perguntas da mesma rodada (ou do plano), sem rodada nova. PT-BR por padrão; `"lang": "en"` dá a versão em inglês, e o agente traduz para outros idiomas.
- Nos dois runtimes: a pergunta sim/não sai no `questions-r<N>.ask.json` (AskUserQuestion, Claude Code) e no `questions-r<N>.md` (lista numerada, Codex e outros). Valem "1=1", "sim", "não" e os rótulos.
- `cli.ts brief` imprime `primeiro uso: <status> (<motivo>)` e a acolhida antes das perguntas ou do plano.
- Critério de aceite `rvs_guided_first_use` na capability `video.retention_edit.guided`.

### alterado

- `briefing.ts`: a lista numerada só mostra a dica de "Outro" quando a última pergunta tem "Outro" (o texto das outras rodadas não mudou).
- `agents/edit-briefing-guide.md`, `tasks/run-edit-briefing.md`, `workflows/guided-edit.md` (1.1.0), `README.md` (PT e EN, "Primeiro uso em 3 passos"), `squad.yaml` 1.8.0.

### não mudou

- Perguntas, plano, perfis, estilo de referência, motor de render, QA, mini editor, editor com IA e biblioteca. Um `state.json` antigo, sem `first_use`, continua funcionando. Regressões idênticas byte a byte: v2 `3a95058d…` e fumaça `b21e3618…` e `27f556fd…`.
- O editonny e os outros squads não foram tocados.

## 1.7.0 (2026-10-24)

Editor com IA no mini editor. Pedido do usuário: "faz o editor com IA (caixa Você pede, agente aplicando, comandos rápidos e faixas)" (trace `rvs-editor-ia-20261024-120351`). O "cérebro" é o agente que a pessoa já usa, Claude Code ou Codex, sem chave de API paga. Testado só no Windows 10, com o Claude Code fazendo o papel do agente.

### novo

- **Você pede / A IA edita** na aba Editor (`preview/editor/ai.mjs`). A caixa envia com Enter o texto, o tempo do cursor e a seleção da linha do tempo. A lista mostra cada pedido com status (na fila, aplicando, feito, precisa de você, não deu, desfeito), a resposta curta, "Ver prévia", "Responder" (para a pergunta do agente) e um Desfazer só dele. O selo "IA editando" acende enquanto algo é aplicado, e a página avisa quando o agente está esperando pedidos.
- **Comandos rápidos** (`lib/edit-engine/quick.ts`), resolvidos pelo motor, sem IA e na hora, em PT e EN, com ou sem acento: tirar a pausa no cursor (silêncio entre palavras pela transcrição, deixando 0,1 s depois da fala e cortando no quadro), tirar as pausas da seleção, cortar a seleção, legenda e headline maior ou menor, subir ou descer a legenda, legenda clássica ou bold, headline fixa ou só no começo, "troca X por Y", destacar ou tirar o destaque de uma palavra, música mais alta, mais baixa, sem ou com, tirar ou pôr o whoosh, zoom aqui (punch-in com seleção) e desfazer. Frase com condição ("quando ela fala…") ou com dois pedidos vai para o agente. A lista está na própria página ("O que eu posso pedir?").
- **Conjunto fechado de operações** (`lib/edit-engine/live-ops.ts`): `cut`, `trim_take`, `zoom`, `punch_in`, `sfx` (da biblioteca), `sfx_remove`, `music` (clima ou faixa, início, liga e desliga, volume), `whoosh`, `headline`, `caption_style`, `caption_word`, `caption_emphasis`, `caption_size`, `caption_move`. Cada uma é conferida contra o vídeo atual antes de salvar, e o spec resultante precisa passar no `validate`. O que já tinha controle na página vai para as seções de antes do `feedback.json` (o painel fica em sincronia); o resto vira `ops`, marcadas com o pedido, aplicadas em ordem depois dos ajustes de corte. O corte no meio de um take divide o take em dois (corte seco, com a mesma regra de J-cut).
- **Ponte com o agente** (`lib/edit-engine/live.ts`, `cli.ts`): `agent-inbox <spec> [--wait] [--timeout s]` entrega o próximo pedido em JSON (texto, cursor, seleção, a pergunta anterior quando é resposta, palavras da transcrição em volta com tempo e índice, resumo do vídeo atual, efeitos e músicas disponíveis, operações com exemplo e as regras); `edit-op <spec> <op.json>` aplica; `agent-reply <spec> <id> --status feito|precisa|nao-deu --message "..."` responde e dispara a prévia. Os comandos falam com o editor aberto por uma caixa de correio em `preview_cache/agent/`; o servidor continua sendo o único que grava a fila e o feedback, e nenhum token vai para arquivo.
- **Prévia rápida automática**: cada pedido que muda o vídeo gera a prévia (um render por vez; o que chega durante um render entra no próximo). O pedido fica *aplicando* até ela sair.
- **Desfazer por pedido**: devolve só o que aquele pedido mudou e que ninguém mudou depois, como um passo novo do Desfazer geral (que também desfaz o desfazer).
- **Linha do tempo em 4 faixas** na aba Editor (`preview/editor/tracks.mjs`): Vídeo (miniaturas do vídeo limpo e takes), Legenda (blocos clicáveis), Edição (headline, títulos, zooms, punch-ins, efeitos) e Áudio (onda e barra da música), no relógio do vídeo atual, com os cortes. Régua arrastável e seleção arrastando numa faixa. A aba Linha do tempo continua para marcações e ajuste de take sobre o MP4 revisado.
- Task `serve-editor-requests`, workflow `live-edit` ("editor ao vivo"), capability `video.retention_edit.live`.

### segurança

- Rotas novas `POST /api/request` e `/api/request/undo` com as proteções de antes (127.0.0.1, token, Host, Origin, outro site, JSON, corpo de no máximo 1 MB).
- Pedido de no máximo 500 letras; até 10 pedidos esperando o agente (429 depois disso); arquivos da caixa de correio de no máximo 64 KB.
- O texto do pedido nunca é executado: os comandos rápidos só comparam padrões, e as operações não aceitam caminho nem comando. Na página, o texto entra só como texto.

### alterado

- `feedback.ts` (seção `ops`, `undo[].req`), `apply-feedback.ts` (aplica `ops`; `rippleTrim` foi para `live-ops.ts` sem mudar), `editor.ts` (`overlayBase` com as operações, `liveSpec`, `onFinish`, versões guardam `ops`), `preview-server.ts` (rotas, estado `live`, faixas do vídeo limpo com `src=base`, caixa de correio, páginas com `Cache-Control: no-store`), `cli.ts`, `preview/index.html`, `app.css`, `app.js`, `editor/panel.mjs`.
- `agents/retention-editor.md` (passo 7b), `tasks/review-edit-preview.md`, `README.md` (PT e EN, "Editor com IA: como ligar o seu agente"), `squad.yaml` 1.7.0.

### não mudou

- Motor de render, QA, legendas, áreas seguras, templates, briefing, estilo de referência, biblioteca e Concat. Sem `ops` no feedback, `applyToSpec` dá o mesmo spec de antes. Regressões idênticas byte a byte: v2 `3a95058d…` e fumaça `b21e3618…` e `27f556fd…`.
- O editonny e os outros squads não foram tocados.

## 1.6.0 (2026-10-24)

Squad leve, genérico e pronto para distribuir pelo GitHub e pelo squads.sh. Pedido do usuário: "deixa o squad leve e genérico, instala a ferramenta squads, sobe num repositório privado no GitHub [...] e depois a gente publica de graça no squads.sh" (trace `rvs-publicacao-20261024-112423`). Esta versão só prepara o squad; repositório e publicação ficam para depois. Testado só no Windows 10.

### novo

- **Compatível com o validador do squads.sh** (`squads validate`: 59 CRITICAL → 100 SAFE), de forma aditiva:
  - `squad.yaml`: bloco `aios` (`minVersion` 2.1.0, `type: squad`);
  - 14 agentes: blocos `agent` (name, id, title, icon, whenToUse), `persona_profile` (archetype, tom) e `greeting_levels`, depois das chaves do Nirvana, que não mudaram;
  - 22 tasks: `task`, `responsavel`, `responsavel_type`, `atomic_layer`, `Entrada`, `Saida` e `Checklist`. O `responsavel` repete o agente que os workflows ligam à task (cada task tem um só); o workflow segue mandando;
  - `config/library.json`, que também satisfaz a pasta `config/` do squads.sh.
- **Kit inicial e `library pull`.** O squad caiu de 181 MB para 25 MB.
  - Música: 11 faixas no squad, a padrão de cada clima e a mais curta das outras, recodificadas em AAC 96 kbps (`.m4a`). O padrão de cada clima não mudou.
  - Efeitos: 15 WAV originais no squad (os papéis `whoosh-4`, `impact-2`, `riser-3`, o `swish-3` e o primeiro item de 11 categorias).
  - `bun lib/edit-engine/cli.ts library pull [--music] [--sfx] [--only id,id] [--dry-run]` baixa o resto (os 23 originais de 320 kbps e 87 efeitos) do repositório público do editonny, fixado no commit `05d3ded` (`config/library.json`), nos caminhos do `catalog.json` e do `effects.json` dele. Cada arquivo é conferido pelo SHA-256 do índice antes de ser gravado em `~/.nirvana/cache/retention-video-studio/`, nunca no squad.
  - O índice resolve cada faixa pelo original no squad, depois pelo original no cache, depois pela versão do kit; efeito, no squad ou no cache. Clima e categoria pegam o primeiro item disponível.
  - `cli.ts library` marca `[kit]`, `[cache]` e `[pull]`.
- `assets/checksums.json` e `scripts/write-checksums.ts`: SHA-256 de cada fonte, áudio e imagem do squad. O `doctor` confere todos ("binary files"), porque o `squads add` 0.3.x grava binário como texto.
- `.gitignore`: segredos, dependências, saídas de execução, biblioteca completa e backups ficam fora do repositório.

### alterado

- `lib/edit-engine/library.ts`: kit, cache e `pullLibrary()`.
- `lib/edit-engine/doctor.ts`: música exige os 6 climas cobertos (não mais as 23 faixas); efeitos exigem os 3 papéis resolvidos; check "binary files".
- `README.md` (PT e EN): seção "Instalar" (requisitos, GitHub, squads.sh, biblioteca completa, Codex) e "Primeiro uso em 3 passos" (`doctor`, `brief`, `preview`).
- Exemplos genéricos: os `example_briefs` com cliente ou pessoa da família viraram nichos variados; exemplos, comentários de código, catálogo de ganchos e as entradas antigas deste CHANGELOG não citam mais cliente nem projeto do autor. O único perfil de cliente é o de exemplo em `examples/profiles/`. Os ids dos exemplos mudaram (`wellness-coffee-text-only`, `fitness-hiit-vs-pilates`, `app-pov-stress-week`, `habits-talking-head-*`).
- `agents/retention-editor.md`: kit e `library pull`, só com o acordo da pessoa.
- `assets/music/` e `assets/sfx/`: `index.json` com o bloco `kit`; `LICENSES.md`, `CREDITS.md` e `README.md` explicam o kit, a recodificação e o pull. Todos os itens seguem listados e creditados.
- `squad.yaml`: 1.6.0, descrição.

### não mudou

- Motor de render, QA, legendas, áreas seguras, templates, mini editor, briefing, estilo de referência e Concat. As regressões com o kit seguem idênticas byte a byte: v2 `3a95058d…` e fumaça `b21e3618…` e `27f556fd…`.
- O editonny, o clone dele e os outros squads não foram tocados.

## 1.5.1 (2026-10-24)

- `lib/edit-engine/qa.ts`: o check `audio_length` passa a ser bloqueante. Ele reprova quando o áudio difere da duração do spec em mais de 50 ms. Na 1.5.0, um talking head que perdia o áudio depois do primeiro take passava só como CONCERNS.

## 1.5.0 (2026-10-24)

Briefing guiado e cópia de estilo de referência, para o squad servir a qualquer nicho. Pedido do usuário: "Depois do mini editor, faz o briefing guiado junto com o copiar estilo de referência, deixando o squad pronto para qualquer nicho" (trace `rvs-briefing-referencia-20261024-015034`). Testado só no Windows 10.

### novo

- **Briefing guiado** (`lib/edit-engine/briefing.ts`, `cli.ts brief`, agente `edit-briefing-guide`, task `run-edit-briefing`, workflow `guided-edit`, capability `video.retention_edit.guided`).
  - Lê a mensagem, a transcrição de um áudio e os arquivos (o `ffprobe` diz se é rosto falando ou foto) e pergunta só o que falta.
  - São no máximo 5 perguntas de múltipla escolha, sempre com "Outro", e no máximo 1 quando a mensagem já disse destino, formato e clima.
  - No Claude Code as perguntas vão no formato do `AskUserQuestion` (4 por chamada, 4 opções cada, o "Other" vem do Claude Code). Nos outros runtimes vão numa lista numerada.
  - Termina num plano curto com "Posso editar?". A confirmação salva `rvs/profiles/<cliente>.json` e `edit.style.json` na pasta do projeto. Na volta do cliente, a primeira pergunta é "Mesmo estilo da última vez?". A headline não entra no perfil: ela é de um vídeo só.
- **Perfis de partida por nicho** em `templates/niches/`: `health-wellness-ugc`, `local-business`, `course-creator`, `ecommerce-product`, `real-estate`, `personal-brand`. Eles marcam a opção recomendada e o visual do texto; o clima escolhido decide ritmo, música e efeitos. O cliente de teste virou só um exemplo, em `examples/profiles/`.
- **Estilo de referência** (`lib/edit-engine/style.ts`, `cli.ts style-extract`, `style-check`, `style-apply`, tasks `extract-reference-style` e `apply-reference-style`, workflow `reference-style`, capability `video.reference_style.extract`).
  - Entrada: arquivo local, link do TikTok ou do YouTube pelo yt-dlp (YouTube com o cliente `mweb`), ou link do Instagram pela Apify, só com `APIFY_TOKEN` no ambiente.
  - A medição chama `measure_reference.py` e `filmstrip.py` do editonny 1.0.0 por subprocesso, offline e sem gravar bytecode na instalação. Sem editonny, o ffmpeg mede só cortes e volume.
  - O perfil JSON guarda o que foi medido, o que o motor aplica (corte, zoom, legenda, headline, música por clima, efeitos) com a origem de cada valor, a lista do que não reproduz e as notas de revisão do agente. O relatório `.style.md` sai em português.
- **Aplicar estilo**: `th-batch` aceita `style` no lote ou no item, com a ordem padrões < estilo < slots do item.
  - O ritmo da referência vira corte de zoom nas pausas da fala, a cada 0,9 s no mínimo.
  - Legenda e headline podem ser desligadas, com fonte Inter ou Anton, caixa e cor de destaque.
  - Texto que cairia nos olhos ou na boca sai do rosto, com a mesma geometria de zoom do QA.
  - `style-apply` gera a prévia rápida 540x960, o final com QA e confere o mini editor; `--review` deixa o mini editor aberto.
- `lib/edit-engine/project.ts`: pasta do projeto do usuário (`--project`, `RVS_PROJECT`), recusando a pasta do squad.
- `cli.ts profiles`: perfis de cliente do projeto e perfis de partida por nicho.
- `cli.ts doctor`: medidor de estilo, perfis por nicho, yt-dlp e `APIFY_TOKEN`; os opcionais não falham.

### corrigido

- **Talking head com vários takes e sem música saía com o áudio parando no fim do primeiro take** (1,59 s de 13,73 s, com o QA só em CONCERNS). Agora a voz é misturada num passe próprio, como no caminho com música. Com música, ou com uma camada de voz só, o grafo não mudou, e as regressões v2 e fumaça seguem idênticas byte a byte.

### alterado

- `th-batch.ts`: `style`, `cut_whoosh_gain_db`, prévia rápida opcional, seção de estilo no relatório.
- `agents/retention-editor.md` (passo 6b), `dependencies.yaml` (medidor, yt-dlp, `RVS_PROJECT`, `APIFY_TOKEN`), `README.md` (PT e EN, começar em 3 passos), `squad.yaml` 1.5.0 (descrição, 2 capabilities, componentes).

### não mudou

- QA (`qa.ts`), legendas (`ass.ts`), áreas seguras, templates de edição, bibliotecas, mini editor, Concat. O editonny instalado, o clone dele, o `instagram-intelligence-nirvana` e o `nirvana-video-creator` não foram tocados.

## 1.4.0 (2026-10-24)

Mini editor de acabamento, pedido pelo usuário: "Pode transformar a prévia no mini editor: ver mudança na hora, botão de prévia rápida e botão de finalizar, tudo pela página" (trace `rvs-mini-editor-20261020-193431`). O adaptador do Concat não mudou. Testado só no Windows 10.

### novo

- **Aba Editor na prévia** (`lib/edit-engine/preview/editor/`: `model.mjs`, `overlay.mjs`, `panel.mjs`). O player toca uma camada limpa do spec (sem headline e sem legenda, 540x960, gerada quando a página abre) e a página desenha a headline e a legenda num `<canvas>` do tamanho do vídeo por cima dele, no tempo do vídeo. Ela usa a fonte do spec (servida de `assets/fonts`), a linha de base do libass (métricas win da fonte), o contorno, a sombra, o ajuste de largura do render e as animações `pop_in`, `slide_up`, `fade` e a palavra que cresce do bold-word. Mudam na hora: texto, modo (`fixed` ou `intro`) e tamanho da headline (80 a 120 %), estilo da legenda, correção de palavra e palavra em amarelo. Medido no talking head de regressão (v2) contra a máscara do QA: centro até 1 px, largura até 6 px (1,2 %).
- **Gerar prévia rápida**: aplica todo o feedback salvo (cortes, música, ganho e whoosh incluídos), renderiza `<id>-draftN` em 540x960 (veryfast, CRF 26) com barra de progresso e põe no player. Se os cortes mudaram, refaz a camada limpa no mesmo pedido.
- **Aprovar e Finalizar**: a aprovação nomeia o vídeo do player (original, prévia ou final) e a chave das mudanças que o geraram. O Finalizar só roda enquanto as mudanças atuais são as aprovadas: gera `<id>-finalN` em 1080x1920 com o QA completo e, se não der FAIL, copia para Downloads com nome claro (`--final-name`, ou um nome tirado do id, como `Loja - vestido - final vN.mp4`), sem sobrescrever. No FAIL, a página mostra o motivo em português e não copia.
- **Desfazer e versões**: cada mudança salva é um passo de desfazer (até 50, no `feedback.json`); `<nome>.versions.json` lista prévias e finais com as mudanças de cada uma, e "Voltar a esta" as restaura (também desfazível).
- `lib/edit-engine/editor.ts` (sessão do editor: chaves, versões, nomes, QA em português, fila) e `lib/edit-engine/editor-job.ts` (cada render roda num processo filho e grava o estágio; o servidor segue respondendo).
- Rotas novas com as proteções de antes (127.0.0.1, token, Host, Origin, cross-site): `POST /api/emphasis`, `/api/undo`, `/api/restore`, `/api/render/base|draft|final` (sem caminho no corpo: só o spec da sessão), `GET /media/base`, `/media/version?id=`, `/fonts/<lista fixa>`. Um render por vez (409 no segundo).
- `cli.ts preview`: `--final-name` e `--downloads`.

### alterado

- `lib/edit-engine/ffmpeg.ts`: `render()` aceita `draft`, `noText`, `progressFile` e `onStage`, só usados pelo mini editor. Sem eles o grafo e os bytes são os mesmos (v2 `3a95058d…` e fumaça `b21e3618…`, `27f556fd…` idênticos à 1.3.0).
- `lib/edit-engine/feedback.ts`: `headline_size_pct`, seção `emphasis`, pilha `undo`, aprovação com `version` e `edit_key`; arquivos antigos seguem válidos (`feedback_version` 1).
- `lib/edit-engine/apply-feedback.ts`: aplica tamanho da headline e palavras em amarelo; `pendingMarkdown` exportado.
- `lib/edit-engine/fonts.ts`: `fontFile()` e `vMetrics()`.
- `lib/edit-engine/preview-server.ts`: rotas acima; salvar marcações reescreve `pending-notes.md` na hora; `--stop` derruba a árvore do processo no Windows (render filho e ffmpeg).
- Página: a aba Editor é a primeira; a aba Estilo saiu (os controles foram para o Editor, `style/panel.mjs` removido); Revisão virou Linha do tempo, sem o botão de aprovar (`review/approval.mjs` ficou só com o aviso).
- `README.md` (PT e EN), `agents/retention-editor.md`, `tasks/review-edit-preview.md`, `tasks/apply-edit-feedback.md`, `workflows/retention-review.md` (1.1.0), `squad.yaml` (1.4.0, descrição, capability de revisão com palavras-chave e um example brief do mini editor), `.nirvana-surface.json` (regenerado por `nrv validate squad --fix`).

### não mudou

- QA (`qa.ts`), legendas (`ass.ts`), áreas seguras, templates, bibliotecas, Concat. O editonny instalado e o clone não foram tocados.


## 1.3.0 (2026-10-20)

Versão estável para uso e para a comunidade do Nirvana, pedida pelo usuário: "o squad pronto, funcionando, [...] e eu consigo usar também naquele projeto do Concat para visualizar localmente" (trace `rvs-v1-final-20261020-165312`). Testado só no Windows 10.

### novo

- **Bibliotecas CC0 de música e de efeitos sonoros**, copiadas da biblioteca do editonny 1.0.0 (Matheus Gomes) depois de ler a licença de cada item; nada baixado. `assets/music/`: 23 faixas em 6 climas, com `index.json`, `LICENSES.md` e `CREDITS.md` por item. `assets/sfx/`: 102 efeitos em 28 categorias, com os mesmos três arquivos; os `*-synth.wav` viraram fallback dos papéis `whoosh`, `hit` e `riser`. A faixa "Biscuit" (lukrembo) não entrou: licença não confirmada.
- `lib/edit-engine/library.ts` e `cli.ts library`: o spec escolhe a música por clima (`audio.music.mood`, `track`, `@music:<id>`, começando no ponto de preenchimento da faixa) e o efeito por nome (`@sfx:<papel|categoria|id>`); `sfx[].anchor: true` põe o impacto do som no segundo `at`.
- `lib/edit-engine/th-batch.ts` e `cli.ts th-batch`: lote de talking heads. Cada item tem takes, headline e roteiro; as palavras vêm dadas, de arquivos por clipe ou do transcritor do editonny; a grafia do roteiro é aplicada quando o número de palavras bate; cada vídeo sai com spec, QA e a prévia conferida (aberta, lida por HTTP e parada). Relatório `th-batch-report.md`.
- `lib/edit-engine/doctor.ts` e `cli.ts doctor`: confere Bun, ffmpeg, ffprobe, libass e os filtros usados, fontes, bibliotecas e licenças, templates; o editonny e a API do Concat como opcionais. Diz como resolver o que falta.
- `lib/edit-engine/placeholder.ts` e `cli.ts placeholder-screen`: tela de app neutra escrita PLACEHOLDER para o template POV enquanto a gravação real não existe.
- `cli.ts concat`: o adaptador do Concat no CLI, com token por arquivo ou `CONCAT_TOKEN`.
- `examples/`: um exemplo provado por template (`text-only`, `pov-app-screen`, `this-vs-that`, `talking-head-batch`), com `${RVS_MEDIA}` e caminhos relativos, e `media/app-screen-placeholder.png`.
- `layers[].crop_focus`: que parte da mídia fica no quadro no `cover` (o VS tira os rostos de perto dos rótulos).

### alterado

- `lib/edit-engine/ffmpeg.ts`: **render determinístico.** O mesmo spec dá o mesmo arquivo byte a byte (3 renders seguidos da regressão v2 com SHA-256 iguais). O áudio é renderizado num passe próprio em WAV float, e as entradas dos filtros de várias entradas passam 0,5 s do fim e são cortadas depois. Cada stem de medição tem passe próprio. Com música sob voz, o leito final é montado a partir dos dois stems já medidos.
- `lib/edit-engine/concat.ts` reescrito: takes cortados no `in` em T1, punch-in alternado como escala, legenda como um título por grupo em T2, headline em T3, música em T4 com o ganho medido e fades, efeitos numa quinta trilha, fonte registrada no projeto, reabertura pela API para conferir e lista do que fica de fora. Verificado de ponta a ponta com o Concat 0.2.7.
- `lib/edit-engine/spec.ts`: `resolveLibrary()`, `sfxStart()`, `crop_focus`; `loadSpec` resolve os nomes da biblioteca antes dos caminhos relativos.
- `lib/edit-engine/template.ts`, `batch.ts`, `cli.ts from-template`: `${VAR}` do ambiente e caminho relativo ao arquivo de slots.
- Templates: `text-only`, `pov-app-screen` e `this-vs-that` usam `@sfx:whoosh` e `@sfx:hit` ancorados e ganharam `music_mood` e `music_gain_db`; `this-vs-that` ganhou `a_focus_y` e `b_focus_y`; `talking-head-captions` ganhou `music_mood`, e `music_offset` deixou de ter padrão.
- `README.md` em português e inglês: requisitos, instalação, os 5 comandos mais usados, bibliotecas, Concat, créditos, sistemas testados.
- `dependencies.yaml`: Bun como dependência de sistema, `winget` no Windows, variáveis `CONCAT_TOKEN`, `CONCAT_PORT`, `RVS_MEDIA`, `RVS_OUT`, Concat como opcional.
- `agents/retention-editor.md`: bibliotecas por nome, placeholder do POV, lote de talking heads, Concat.
- `templates/edit/README.md`, `assets/sfx/README.md`: bibliotecas, exemplos e lote.
- `references/edit-hooks-catalog.md`, `lib/edit-engine/concat-client.ts`: fontes citadas sem caminho de pasta do autor.
- `squad.yaml`: versão 1.3.0 e descrição.

### corrigido

- Áudio terminando no fim do primeiro take quando o grafo final juntava `asplit`, `sidechaincompress` e `amix` (ffmpeg 8.1), visto com música da biblioteca e whooshes de corte.
- Medição do ducking variando ~0,1 dB entre renders: o stem da música abaixada às vezes terminava 54 ms antes.
- Palavra perdida no lote quando o transcritor marca o começo dela antes do corte: a palavra vai para o take que tem o ponto médio dela.

### não mudou

- QA (`qa.ts`), legendas (`ass.ts`), áreas seguras, prévia de revisão e `apply-feedback`. O vídeo da regressão v2 renderizado com o motor novo é idêntico ao aprovado (mesmo MD5 do stream de vídeo).

## 1.2.0 (2026-10-20)

Prévia visual de revisão, pedida pelo usuário depois da v2 de teste: "no editonny a pessoa tem a opção de visualizar, como se fosse uma plataforma local, um editor" (trace `rvs-preview-visual-20261020-001735`). Prova: v2 → v3 do talking head de teste por `apply-feedback`, QA PASS.

**Origem e crédito.** A interface e o servidor são adaptados da prévia do editonny 1.1.0 (https://github.com/soumatheusgomes/editonny), commit `08e86fe`, de Matheus Gomes, licença MIT: `skills/editonny/engine/preview/` e `skills/editonny/engine/helpers/preview_server.py`. Foi cópia e adaptação. O editonny instalado e o clone não foram alterados. Cada arquivo derivado leva o aviso de copyright, e o texto da licença está em `lib/edit-engine/preview/LICENSE-editonny.md`.

### novo

- `lib/edit-engine/preview-server.ts`: servidor da prévia em `Bun.serve`, só em 127.0.0.1, com as proteções do original. São elas: checagem do Host (contra DNS rebinding), recusa de `Sec-Fetch-Site` cross-site e same-site em `/api` e `/media`, token por sessão em toda gravação, Origin igual, JSON de até 1 MB lido inteiro antes de recusar, `Connection: close` depois de POST e erro, e GET com corpo recusado. A única mídia é o MP4 do spec, com Range. A onda (`showwavespic`) e a tira de quadros (`tile`) saem do ffmpeg, no lugar do numpy e do PIL do original, com cache em `preview_cache/` e no máximo 2 jobs. Grava `preview_cache/server.json`. `--stop` para pelo pid.
- `lib/edit-engine/feedback.ts`: formato do `<nome>.feedback.json` (`feedback_version: 1`, `revision`, `history`, `saved_at`) e a validação de marcações, ajustes de corte (limitados ao que o clipe original tem), estilo, correções de legenda e aprovação (presa ao sha256 do vídeo).
- `lib/edit-engine/apply-feedback.ts`: aplica sem IA o preset de legenda, o modo e o texto da headline, a música (liga, desliga, `below_voice_db` ou `gain_db`), o whoosh, as correções de legenda e os ajustes de corte em ripple. No ripple, o que vem depois se desloca, o que está dentro do take segue a imagem e o whoosh dos últimos 0,5 s fica preso ao corte. Atualiza `hooks_applied`, grava o `-vN` seguinte, renderiza, roda o QA e escreve `pending-notes.md`.
- `lib/edit-engine/preview/`: a interface em PT-BR, em HTML e JS puros sem build. Arquivos: `index.html`, `app.css` (cópia do original mais um bloco no fim), `app.js`, `api.mjs`, `dom.mjs`, `toast.mjs`, `review/view.mjs`, `review/playback.mjs`, `review/timeline.mjs`, `review/marks.mjs`, `review/trims.mjs`, `review/approval.mjs`, `review/captions.mjs` (novo, correção de palavra), `style/panel.mjs` (os controles deste squad) e `LICENSE-editonny.md`.
- `tasks/review-edit-preview.md`, `tasks/apply-edit-feedback.md`.
- `workflows/retention-review.md`: prévia, apply-feedback e QA.
- Capability `video.retention_edit.review`. A `video.retention_edit.execute` já tinha 59 das 60 palavras-chave que o validador aceita, então os termos de prévia em PT e EN foram para uma capability própria.

### alterado

- `lib/edit-engine/cli.ts`: comandos `preview` (`--video`, `--port`, `--open`, `--stop`) e `apply-feedback` (`--out-dir`, `--no-render`); leitura de flags.
- `workflows/retention-edit.md` (1.1.0): passos opcionais `review` e `apply-feedback` (`when: input.review == true`), com a explicação de cada um.
- `agents/retention-editor.md`: passos 7 e 8 (abrir a prévia, aplicar o feedback, resolver `pending-notes.md`), saída e limites de segurança (só 127.0.0.1, nunca editar o `feedback.json` à mão).
- `squad.yaml`: versão 1.2.0; tarefas, workflow e capability novos; entrada `review` na capability de edição.
- `README.md`: comandos, seção "Prévia de revisão", origem e crédito.
- `.nirvana-surface.json`: regenerado por `nrv validate squad retention-video-studio --fix`.

### não mudou

- Motor de render e QA (`ffmpeg.ts`, `ass.ts`, `qa.ts`, `spec.ts`, `safezones.ts`, `measure.ts`, `batch.ts`, `template.ts`), templates e catálogo.

## 1.1.0 (2026-10-19)

Melhoria pedida pelo usuário depois do A/B com o editonny (trace `rvs-upgrade-estilo-20261019-231232`). Veredito dele: o nosso ficou melhor no corte, a legenda e a headline da versão A ficaram melhores, e a troca de take da versão B ficou "muito seca".

### novo

- `assets/fonts/Anton-Regular.ttf` e `OFL-Anton.txt`: fonte Anton (SIL OFL 1.1), copiada do editonny 1.0.0, para legenda e headline.
- `lib/edit-engine/fonts.ts`: lê a métrica do TTF para `style.size_basis: "em"`. O libass dimensiona pela caixa de linha (Anton = 1,73 em), então "86 px" de navegador vira 149 no libass.
- `lib/edit-engine/transcribe.ts` e `cli.ts transcribe`: tempos por palavra pelo `helpers/transcribe.py` do editonny, chamado por subprocess, offline, sem gravar nada na instalação dele. Sem editonny, sai com código 3 e diz o que fazer. Dependência opcional documentada em `dependencies.yaml` (`EDITONNY_ENGINE`).
- Catálogo (`references/edit-hooks-catalog.md`): `smooth_take_cut`, `music_duck`, `caption_bold_word`, `headline_fixed`, com fonte.

### alterado

- `lib/edit-engine/spec.ts`: campos `captions.preset` (`classic` | `bold-word`), `pop_scale`, `max_width_px`, `group_font_px`; `texts[].mode` (`fixed` | `intro`), `max_width_px`; `style.size_basis`, `style.line_spacing_px` (já declarado, agora usado); `layers[].framing`, `transition_in`; `transitions` (`jcut_frames`, `audio_xfade_ms`, `punch_alternate`); `audio.music` com `path`, `start`, `offset`, `gain_db`, `below_voice_db`, `duck_db`, fades; `sfx[].only_with_music`. `resolveSpec()` normaliza (música como texto vira `{path}`, música sem caminho sai, headline fixa cobre o vídeo, punch-ins alternados). A validação recusa dissolve de imagem entre takes do mesmo enquadramento.
- `lib/edit-engine/ass.ts`: preset `bold-word` (caixa alta, palavra falada cresce para 114% em 80 ms, palavras-chave em amarelo, grupo sobe 12 px ao entrar e fica até 0,25 s na pausa); headline com `line_spacing_px` sai uma linha por evento.
- `lib/edit-engine/safezones.ts`: `max_width_px` da headline medido no glifo; `fitCaptions` ajusta a fonte de cada grupo que passa da largura.
- `lib/edit-engine/ffmpeg.ts`: J-cut e micro crossfade de áudio em cada corte entre takes; dissolve de imagem (alpha) só entre `framing` diferentes; música com ducking por `sidechaincompress` (nível da voz medido num passe só de voz, ganho da música medido no stem já abaixado, resultado em `audio.music.measured`); loudnorm linear com limitador quando precisa e pico conferido depois do AAC, com uma segunda tentativa 1,2 dB abaixo; áudio cortado na duração do vídeo.
- `lib/edit-engine/qa.ts`: olhos e boca checados contra o zoom real da câmera durante todo o tempo do texto (a headline fixa convive com os punch-ins); grupos de legenda medidos no momento mais largo; checks novos `no_black_frames` (bloqueante), `no_ghost_dissolve` (bloqueante), `jcut_word_tail`, `music_below_voice`, `music_ducking`, `audio_length`, `caption_preset` e `headline_mode_*`; tamanho de fonte comparado em unidade libass.
- `lib/edit-engine/measure.ts`: `probe()` devolve a duração do áudio; `blackFrames()`.
- `lib/edit-engine/cli.ts`: comando `transcribe`.
- `templates/edit/talking-head-captions.json`: padrão novo (bold-word, headline Anton 86 px em fixa, `transitions`, música opcional a 22 LU da voz, passa-alta de 80 Hz, legenda em y 1330, punch-in de 7%, sem whoosh fixo). Slots novos: `headline_mode`, `headline_max_width`, `headline_line_px`, `caption_preset`, `caption_font_px`, `music_start`, `music_offset`, `music_below_voice_db`.
- `templates/edit/README.md`, `agents/retention-editor.md`: o template novo, vários takes, música e o transcritor.
- `squad.yaml`: versão 1.1.0; descrição e palavras-chave da capability de edição com corte suave, legenda bold, headline fixa e música com ducking; um `example_brief` novo.
- `dependencies.yaml`: transcritor do editonny como dependência opcional (`EDITONNY_ENGINE`, não obrigatória) e o fallback.
- `.nirvana-surface.json`: regenerado por `nrv validate squad retention-video-studio --fix` (aviso `surface_stale` depois das mudanças).

### corrigido

- **Quadro preto antes de alguns cortes.** `setpts=PTS-STARTPTS+5.3333/TB` truncava 159,9999 para 159: a camada entrava e saía um quadro cedo e sobrava um quadro preto antes do take seguinte. A versão B de 17/10 tem 4 (quadros 203, 276, 316 e 317). As camadas agora são postas em quadros inteiros (`trim=end_frame`, `settb`, `between(n,...)`).
- **Punch-in no primeiro quadro do take seguinte.** O intervalo do `punch_in` era fechado nos dois lados; agora é por quadro e semiaberto.
- **`apad` sem fim** num passe só de áudio não terminava (o arquivo cresceu até 25 GB antes de ser parado). Agora `apad=whole_dur` e a música em loop tem `-t`.
- O slot `music` dos templates gerava `"music": "<caminho>"`, que o motor não lia; `resolveSpec` aceita as duas formas.

## 1.0.0 (2026-10-17)

Derivado de `nirvana-video-creator` v6.0.0 (Luiz Gustavo Vieira Rodrigues, SUL-1.0), clonado em 17/10/2026 sob white label declarado pelo usuário. O original não foi alterado.

### novo

- `lib/edit-engine/`: motor de edição em Bun sobre ffmpeg e libass (spec, render, QA medido, templates, lote, SFX sintetizados, adaptador opcional do Concat).
- Capabilities `video.retention_edit.execute` e `video.text_hook_batch.execute`.
- Agentes `retention-editor` e `edit-qa-auditor`; tarefas `plan-retention-edit`, `plan-text-hook-batch`, `render-edit-spec`, `audit-retention-edit`; workflows `retention-edit` e `text-hook-batch`.
- `templates/edit/`: text-only, pov-app-screen, this-vs-that, talking-head-captions.
- `references/edit-hooks-catalog.md`, `assets/fonts/` (Inter Bold, OFL), `assets/sfx/` (provisórios).

### alterado em relação ao original

- Os 4 workflows herdados terminam no passe de retenção (`retention-plan`, `retention-render`, `retention-qa`), que pode ser desligado pelo brief.
- Metadados de roteamento das 4 capabilities herdadas reescritos para geração mais edição, com `score_boost` 0.9.
- Nome, prefixo (`rvs`), autor e referências a `nrv activate`.

### retirado

- `lib/video-fundamentals/inject-capability.js` (script Node que escreve em outros squads), `.nirvana-surface.json` e `CHANGES.json` do original (regenerados pelo motor).

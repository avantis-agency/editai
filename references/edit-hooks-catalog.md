# Catálogo de ganchos de edição

Cada gancho tem um id em crase no título. O `edit-qa-auditor` lê esses ids (`lib/edit-engine/qa.ts`, função `catalogHookIds`): um `hooks_applied` com id fora deste arquivo reprova o QA. Pesquisa feita em 17/10/2026. Onde a fonte é blog de fornecedor ou agência, o texto diz isso: quase nada sobre edição de retenção vem de estudo controlado, e os números de frequência discordam entre si.

Coluna "Motor" diz como o `lib/edit-engine/ffmpeg.ts` executa o gancho. "Manual" significa que o motor não automatiza e o editor monta com camadas.

## Princípios que valem para todos

1. **Alinhamento triplo.** Texto, visual e som contam a mesma coisa. Vendo só o quadro, dá para adivinhar o texto, e vice-versa. Desalinhamento é o erro número 1 que Kallaway aponta em donos de negócio. Fonte: `~/squads/kallaway-content-engine/references/kallaway-method/08-spoken-hooks.md` (Triple Hook), consultado em 17/10/2026.
2. **Quebra de padrão a cada poucos segundos, sem ruído.** As fontes discordam no intervalo: 2 a 3 s ([Strategia-X, 01/07/2026](https://www.strategia-x.com/blog/2026-07-01-vertical-video-retention-editing-playbook/)), 3 a 5 s com "40 a 60% mais retenção" medidos em 200+ TikToks próprios ([EdicionVideoPro, 2026](https://edicionvideopro.com/en/editing-for-platforms-video-marketing/pattern-interrupts-tiktok-retention-guide/), dado interno, não auditado), e 10 a 15 s para clipes acima de 30 s ([Shortzly, 2026](https://shortzly.com/blog/short-form-video-retention-strategies)). Padrão desta casa: um gancho visual ou sonoro a cada 2,5 a 4 s nos primeiros 10 s, depois a cada 5 a 8 s.
3. **Os primeiros 3 s decidem.** A mediana de decisão de rolar ou ficar seria 3,1 s, segundo a Strategia-X citando pesquisa interna da Meta que não encontrei publicada. O benchmark da GrowIT (50 mil vídeos, 2026) pede 60% ou mais de retenção aos 3 s ([GrowIT](https://www.grow-it.se/en/resources/short-form-video-retention-benchmarks)).
4. **Menos é mais no som.** Repetir o mesmo whoosh ensina o público a ignorar ([news-journal, 2026, conteúdo patrocinado](https://news-journal.com/sponsored-content/how-editors-use-sound-effects-to-hide-awkward-cuts-in-short-videos/)); bass hit no máximo uma ou duas vezes por vídeo ([Mark Studios, 2026](https://www.markstudios.com/blog/sound-design-music-selection-for-video-2026)).

## Ganchos visuais

### `impact_zoom` · Zoom de impacto
- **O que é:** um soco de escala de 4 a 8% que sobe em ~0,1 s e volta em ~0,4 s.
- **Quando usar:** na palavra ou no quadro que carrega a virada; em imagem parada, entre 2 e 3 s, para quebrar o padrão.
- **Para que serve:** dispara o reflexo de orientação sem trocar de plano.
- **Padrão:** `amount` 0,05, `attack` 0,09 s, `release` 0,4 s. Junte com `hit` no mesmo quadro.
- **Motor:** `camera: {type: "impact"}` (zoompan, superamostragem 2x).
- **Fonte:** categoria "efeito visual ou transição" dos 5 visual hooks, Kallaway (`08-spoken-hooks.md`); "zoom + text + SFX" no segundo 0 a 3 do modelo da EdicionVideoPro (2026).

### `slow_push` · Aproximação lenta (Ken Burns)
- **O que é:** zoom contínuo e lento durante o vídeo ou o plano.
- **Quando usar:** sempre que o plano é foto ou câmera parada.
- **Para que serve:** imagem parada parece pausa; o movimento lento mantém o quadro vivo.
- **Padrão:** 1,00 → 1,08 em 7 s (cerca de 1,1% por segundo). A Strategia-X sugere 1,5 a 2% por segundo para talking head; em foto, mais lento evita perder o enquadramento.
- **Motor:** `camera: {type: "push"}`.
- **Fonte:** [Strategia-X, 01/07/2026](https://www.strategia-x.com/blog/2026-07-01-vertical-video-retention-editing-playbook/).

### `punch_in_cut` · Corte com zoom (jump zoom)
- **O que é:** o quadro salta para 110 a 120% de uma vez e fica, como se a câmera tivesse cortado para um plano mais fechado.
- **Quando usar:** talking head com uma câmera só, na frase de ênfase; esconde jump cut.
- **Para que serve:** simula troca de plano sem segunda câmera.
- **Padrão:** `amount` 0,12, dura até o próximo corte.
- **Motor:** `camera: {type: "punch_in", at, until, amount}`.
- **Fonte:** "jump cut" e "zoom change" como mudanças visuais recomendadas, Strategia-X (01/07/2026) e EdicionVideoPro (2026).

### `hard_cut` · Corte seco
- **O que é:** troca de plano sem transição.
- **Quando usar:** entre ideias, a cada 2,5 a 4 s nos primeiros 10 s; para tirar respiração e silêncio da fala.
- **Para que serve:** ritmo. Cada corte é um mini recomeço da atenção.
- **Padrão:** camadas consecutivas em `layers` sem sobreposição; whoosh opcional com o transiente alinhado ao corte.
- **Motor:** sequência de `layers` com `start` encostado no fim do anterior.
- **Fonte:** princípio 2 acima; alinhamento do transiente do whoosh ao corte, news-journal (2026).

### `smooth_take_cut` · Corte suave entre takes
- **O que é:** troca entre takes do mesmo enquadramento (talking head) sem dissolve de imagem. O áudio do take que entra começa 2 a 4 quadros antes do corte (J-cut), há um micro crossfade só no áudio (40 a 80 ms) e o zoom alterna entre 100% e 106 a 108% a cada take, trocando no quadro do corte.
- **Quando usar:** toda montagem de talking head com vários takes ou jump cuts. Dissolve curto de imagem (0,2 a 0,4 s) só quando os planos são de fato diferentes (outro enquadramento, outra câmera, tela).
- **Para que serve:** o corte seco entre takes iguais soa "seco" (queixa do usuário na versão B de 17/10/2026); o dissolve entre dois rostos no mesmo lugar funde as duas caras num rosto fantasma (versão A do A/B de 19/10/2026, "meio bugado"). A voz que chega antes do corte puxa o olho para a troca, o crossfade tira o clique, e a mudança de escala faz o corte parecer troca de câmera.
- **Padrão:** `transitions: {jcut_frames: 2, audio_xfade_ms: 60, punch_alternate: 0.07}`; `framing` igual nos takes. Use 2 quadros quando a última palavra do take termina a menos de 100 ms do corte (o QA `jcut_word_tail` avisa).
- **Motor:** `transitions` (J-cut e crossfade em `lib/edit-engine/ffmpeg.ts`, punch-ins gerados por `resolveSpec`, trocados por quadro em intervalo semiaberto); `layers[].transition_in: {type: "dissolve"}` só entre `framing` diferentes, senão o spec é inválido e o QA `no_ghost_dissolve` reprova.
- **Fonte:** J-cut de 4 quadros com corte de cauda de 2 quadros e fades de 30 ms no `helpers/render_cut.py` do editonny 1.0.0 (lido em 19/10/2026 na instalação local do editonny); rosto fantasma do dissolve entre takes iguais no comparativo A/B interno do autor (19/10/2026) e no veredito dele no mesmo dia; "jump cut" e "zoom change" como mudança visual, Strategia-X (01/07/2026).

### `reframe_follow_face` · Vertical seguindo o rosto
- **O que é:** uma gravação deitada (16:9) vira 9:16 com um corte que acompanha a pessoa: parado enquanto o rosto fica perto do centro, e uma viagem suave quando ela de fato anda.
- **Quando usar:** palestra, pregação, aula ou entrevista gravada na horizontal que vai para Reels, TikTok ou Shorts.
- **Para que serve:** o rosto nunca sai do quadro nem fica colado na borda; o corte central fixo perde a pessoa quando ela anda para o lado.
- **Padrão:** altura inteira da fonte (o microfone na boca fica), rosto no centro, zona morta de 15% da largura do corte (o alvo é onde a pessoa assenta, mediana de 1 s antes a 3 s depois, então balançar para o lado e voltar não arrasta o quadro), viagem de 0,8 a 1,6 s com curva suave, no máximo uma a cada 1,2 s. `layout: "band"` põe a imagem sob uma faixa no topo (cópia desfocada e escurecida, ou cor lisa) que guarda a headline longe da cabeça.
- **Motor:** `reframe: {mode: "follow-face", layout: "fill" | "band"}` no spec (`lib/edit-engine/reframe.ts`); o rosto vem do `track_faces.py` do editonny 1.0.0 a 10 Hz, por subprocesso; sem editonny, corte central e o QA avisa. QA: `reframe_face` (toda amostra medida do rosto dentro do corte) e `reframe_motion`.
- **Fonte:** `helpers/track_faces.py` do editonny 1.0.0 (MIT, Matheus Gomes: mediana de 5, zona morta de 3%, movimento de 0,5 s), lido em 25/10/2026; a câmera virtual mais calma por cima é do EditAi.

### `pattern_break` · Quebra de padrão
- **O que é:** mudança brusca de cor, layout, enquadramento ou ritmo: flash branco de 2 a 4 quadros, tela que vira dividida, corte para a tela do app.
- **Quando usar:** quando o vídeo repete o mesmo tipo de plano por mais de 4 s; na entrada da "holding zone" (3 a 10 s).
- **Para que serve:** renova a atenção quando o olho se acostumou.
- **Padrão:** flash `opacity` 0,85, 0,1 s. No máximo um flash por vídeo curto.
- **Motor:** `flashes[]` (drawbox) ou troca de `layers`.
- **Fonte:** categoria 2 dos visual hooks (quebra de padrão / troca de sequência), Kallaway (`08-spoken-hooks.md`).

### `text_pop_in` · Texto que entra "pulando"
- **O que é:** o bloco de texto entra a 70%, passa de 108% e assenta em 100% em 0,26 s.
- **Quando usar:** gancho em texto e rótulos de tela dividida.
- **Para que serve:** chama o olho para o texto antes da imagem; o olho busca texto e lê palavra-chave mais rápido do que processa imagem (Kallaway).
- **Padrão:** `animation: "pop_in"`.
- **Motor:** ASS `\t` de escala (`lib/edit-engine/ass.ts`).
- **Fonte:** Text Hook como o gancho mais importante do triplo, Kallaway (`08-spoken-hooks.md`); "pop-in 80→100" do modo word-carousel de [nik-devs/ffmpeg-caption-burn-ass](https://github.com/nik-devs/ffmpeg-caption-burn-ass).

### `text_line_stagger` · Linhas em sequência
- **O que é:** cada linha do gancho entra com pop, 0,35 s depois da anterior.
- **Quando usar:** gancho de 2 linhas cujo sentido se completa na segunda (sujeito → payoff).
- **Para que serve:** cria uma micro expectativa e força a leitura em ordem.
- **Padrão:** `animation: "line_stagger"`, `stagger` 0,35 s. A linha 1 tem de estar legível no quadro 0, que é o que aparece no feed parado.
- **Motor:** ASS, alpha e escala por linha.
- **Fonte:** layout "Sliding in" da taxonomia de text hooks, Kallaway (`02-text-hooks.md`).

### `text_word_reveal` · Palavra por palavra
- **O que é:** as palavras aparecem uma a uma no ritmo de leitura.
- **Quando usar:** frase de impacto curta (até 8 palavras) sem fala.
- **Para que serve:** controla o ritmo de leitura e segura até a última palavra.
- **Padrão:** `animation: "word_reveal"`, `stagger` 0,25 a 0,3 s por palavra (BBC: 160 a 180 palavras por minuto, cerca de 0,3 s por palavra).
- **Motor:** ASS, alpha por palavra.
- **Fonte:** layout "primeiras palavras travadas + resto 1 a 1", Kallaway (`02-text-hooks.md`); ritmo BBC citado em [OpusClip, 2026](https://www.opus.pro/blog/youtube-shorts-caption-subtitle-best-practices).

### `text_slide_up` · Texto que sobe
- **O que é:** o bloco sobe 70 px enquanto aparece, em 0,24 s.
- **Quando usar:** rótulos, CTA final, segunda informação depois do gancho.
- **Para que serve:** movimento suave que não compete com o gancho principal.
- **Padrão:** `animation: "slide_up"`.
- **Motor:** ASS `\move`.
- **Fonte:** layout "Sliding in", Kallaway (`02-text-hooks.md`).

### `speed_ramp` · Rampa de velocidade
- **O que é:** um trecho acelera (1,5 a 3x) e volta ao normal no momento que importa.
- **Quando usar:** movimento repetitivo (preparar comida, exercício, rolar tela) antes do resultado.
- **Para que serve:** comprime o tédio e chega mais rápido ao payoff.
- **Padrão:** dividir o clipe em camadas com `speed` 2 e depois `speed` 1. O áudio da camada acelerada sai do mix.
- **Motor:** `layers[].speed` (setpts). A rampa contínua é aproximada por degraus.
- **Fonte:** "trans rhythm" e "create a hunt" do checkpoint hold attention, Kallaway (`08-spoken-hooks.md`); speed ramp como técnica listada por [Vortex Xcel, 2026](https://vortexxcel.com/retention-editing-techniques-2026/).

### `split_screen` · Tela dividida
- **O que é:** dois quadros ao mesmo tempo, em cima e embaixo, com rótulo em cada metade.
- **Quando usar:** comparação "isto VS aquilo", antes e depois, fase folicular VS lútea.
- **Para que serve:** a comparação é entendida em um olhar; o "A vs B Comparison Labels" é uma das 6 substâncias de text hook.
- **Padrão:** template `this-vs-that`: metade de cima entra em 0 s, a de baixo em 0,6 s com `text_pop_in` no rótulo.
- **Motor:** duas `layers` com `rect` de 1080x960.
- **Fonte:** taxonomia de text hooks (A vs B), Kallaway (`02-text-hooks.md`).

### `broll_overlay` · B-roll sobreposto
- **O que é:** um clipe ou imagem de apoio por cima do plano principal, em tela cheia ou numa janela.
- **Quando usar:** quando a fala cita algo que dá para mostrar; na "holding zone" para provar o gancho.
- **Para que serve:** prova visual e troca de estímulo sem perder a voz.
- **Padrão:** 1,5 a 3 s por inserção; voz continua da camada de baixo.
- **Motor:** `layers[]` com `rect` e `border_px`.
- **Fonte:** "B-roll insert" entre as mudanças visuais, Strategia-X (01/07/2026); prova como alavanca principal da holding zone, Kallaway (`08-spoken-hooks.md`).

### `broll_card` · Card animado da fala (B-roll automático)
- **O que é:** um card animado (contador, preço, lista, passos, palavra de impacto, selo, convite a comentar) desenhado por cima da pessoa no momento em que ela fala aquilo.
- **Quando usar:** número com unidade, preço com contexto, lista, passos, oferta, virada ou convite a comentar ditos na gravação; ou um ponto marcado com "põe um card aqui".
- **Para que serve:** a prova visual do que foi dito, sem cortar a voz; troca de estímulo a cada 6 s no máximo.
- **Padrão:** nada nos 3 primeiros segundos nem nos 2,5 s finais; um item a cada 6 s; o valor sai da fala, nunca do exemplo do modelo (se o detector não leu o valor, o card não entra); fora de olhos e boca, da headline e da legenda. Card que escreve as mesmas palavras esconde a legenda enquanto está na tela; contador e preço deixam a legenda e procuram outro lugar, ou sobem a legenda até logo acima do card. Um som do card por vez, da biblioteca CC0.
- **Motor:** `broll.items[]` com `kind: "card"` (`cli.ts broll-suggest` e `broll-render`); o editonny 1.0.0 instalado acha o momento (`suggest_visuals.py`) e desenha o `.mov` com alfa (`render_visuals.py`), por subprocesso. QA: `broll_hook_window`, `broll_face`, `broll_caption_overlap`, `broll_quote`, `broll_provenance`.
- **Fonte:** regras de `suggest_visuals.py` (MIN_GAP, HOOK_DEFAULT, CTA_DEFAULT, LEAD, READ_AFTER) e "Never invent data" do editonny (MIT, Matheus Gomes); `hidesCaptions` do catálogo de cenas dele.

### `broll_full` · Mídia do cliente em tela cheia
- **O que é:** corte de 1,5 a 3 s para uma foto ou vídeo do próprio cliente, com a voz continuando por baixo.
- **Quando usar:** quando a fala cita algo que o cliente mandou em `<projeto>/editai/broll/` (nome do arquivo ou etiqueta do `broll.json` igual a uma palavra dita).
- **Para que serve:** mostrar o produto, o lugar ou o resultado real no segundo em que ele é citado. Mídia real vence o card no mesmo trecho.
- **Padrão:** entra 0,25 s antes da palavra e dura até o fim da frase (1,5 a 3 s); foto com aproximação lenta, vídeo mudo; whoosh baixo só com música; legenda e headline continuam por cima.
- **Motor:** `broll.items[]` com `kind: "insert"`, `layout: "full"`.
- **Fonte:** padrão do `broll_overlay` deste catálogo; inserts do `compose_final.py` do editonny (MIT).

### `broll_pip` · Mídia do cliente numa janela
- **O que é:** a mesma mídia do `broll_full`, numa janela com borda branca, com a pessoa visível ao lado.
- **Quando usar:** só quando pedido e quando há lugar fora de olhos, boca e legenda (num selfie com o rosto no centro, quase nunca há).
- **Para que serve:** prova sem tirar a pessoa da tela.
- **Padrão:** borda branca de 6 px; o QA confere a janela contra o rosto e a legenda.
- **Motor:** `broll.items[]` com `kind: "insert"`, `layout: "pip"` e `rect`.
- **Fonte:** inserts `pip` do `compose_final.py` do editonny (MIT).

### `screen_slot` · Tela do app no quadro
- **O que é:** gravação de tela do app dentro de uma janela com borda, sobre o rosto ou o cenário.
- **Quando usar:** POV com o app; entre o 3º e o 10º segundo.
- **Para que serve:** nos criativos de app que mais se repetem, a tela do app aparece nessa janela de tempo; a prova que segura é ver o produto funcionando.
- **Padrão:** janela de 640x1140 centrada em y 980, borda branca de 6 px.
- **Motor:** `layers[]` com `rect` e `border_px`.
- **Fonte:** pesquisa interna de padrões do autor, feita com o squad instagram-intelligence-nirvana (padrões A08, A10, A11, T11, T15, T16), 15/10/2026.

## Ganchos sonoros

### `whoosh` · Whoosh
- **O que é:** ruído filtrado que cresce e some em 0,3 a 0,8 s.
- **Quando usar:** em corte, entrada de texto, troca de layout. O efeito mais usado em vídeo curto.
- **Para que serve:** "costura" o corte e marca a mudança.
- **Padrão:** −4 a −6 dB; o pico alinhado ao quadro do corte (comece um pouco antes). Varie o arquivo se houver mais de três no vídeo.
- **Motor:** `audio.sfx[]`; arquivo provisório `assets/sfx/whoosh-synth.wav` (pico em 0,3 s).
- **Fonte:** news-journal (2026, patrocinado); Mark Studios (2026) pede whoosh em pelo menos 50% das transições.

### `hit` · Impacto (bass hit)
- **O que é:** pancada grave curta.
- **Quando usar:** no payoff, no zoom de impacto, na revelação.
- **Para que serve:** marca o momento que importa.
- **Padrão:** −3 dB, no máximo 1 ou 2 por vídeo.
- **Motor:** `audio.sfx[]`; provisório `assets/sfx/hit-synth.wav`.
- **Fonte:** Mark Studios (2026); "bass hit on the payoff", [Vortex Xcel, Shorts editing guide 2026](https://vortexxcel.com/youtube-shorts-editing-guide/).

### `riser` · Riser
- **O que é:** som que sobe de tom e volume por 1 a 2 s.
- **Quando usar:** antes de uma revelação ou de um "VS".
- **Para que serve:** antecipação; o espectador se inclina sem perceber.
- **Padrão:** 1,5 s terminando no quadro da revelação, seguido de `hit` ou de `silence_before_turn`.
- **Motor:** `audio.sfx[]`; provisório `assets/sfx/riser-synth.wav` (termina em 1,5 s).
- **Fonte:** Mark Studios (2026, 1 a 2 s); [creatorsfx, 2026](https://creatorsfx.in/blog/best-sound-effects-for-reels-and-shorts) (2 a 3 s).

### `silence_before_turn` · Silêncio antes da virada
- **O que é:** a música e a voz somem por 0,3 a 0,6 s logo antes da frase ou imagem principal.
- **Quando usar:** uma vez por vídeo, na virada.
- **Para que serve:** contraste. Uma pausa limpa pode fazer mais que outro riser.
- **Padrão:** `audio.mutes: [{start, end}]` de 0,4 s; os SFX não são silenciados.
- **Motor:** `audio.mutes[]` (volume 0 na música e na voz).
- **Fonte:** [Remotion blog, What is sound design (2026)](https://www.remotionvideo.com/blog/what-is-sound-design); Pixabay blog ("precise, not noisy").

### `asmr_detail` · Som de detalhe (ASMR)
- **O que é:** som próximo e limpo de uma ação: tampa de pote, tapete abrindo, xícara na mesa.
- **Quando usar:** rotina, preparo, "dia na vida", quando a imagem mostra a ação de perto.
- **Para que serve:** textura sensorial que segura sem precisar de fala.
- **Padrão:** som gravado no próprio clipe (`layers[].audio: true`) ou SFX de biblioteca a −8 dB; nunca sintetizado.
- **Motor:** áudio da camada ou `audio.sfx[]`.
- **Fonte:** formatos de rotina estética e "dia na vida" dominam as views no TikTok do nicho, `03-padroes.md` (15/10/2026). Não achei dado de retenção específico de ASMR; é aposta de formato.

### `music_drop` · Entrada ou queda da música
- **O que é:** a música entra (ou muda de seção) exatamente no corte ou na revelação.
- **Quando usar:** fim da holding zone, revelação, CTA.
- **Para que serve:** "Words added via music" é um dos layouts de text hook; a mudança de energia renova a atenção.
- **Padrão:** `audio.music.start` no quadro do corte; abaixar a música de 8 a 12 dB sob a fala.
- **Motor:** `audio.music` (`path`, `start`, `offset`, `gain_db` ou `below_voice_db`) + `mutes`.
- **Fonte:** Kallaway (`02-text-hooks.md`, layout "Words added via music"); ducking −8 a −12 dB, Vortex Xcel (2026).

### `music_duck` · Música abaixando sob a voz
- **O que é:** faixa de fundo contínua que abaixa sozinha quando há fala e volta nas pausas, com fade de entrada e de saída.
- **Quando usar:** talking head com música; é o que deixa whoosh e outros efeitos discretos (sem cama de música, o whoosh sobra, como na versão B de 17/10/2026).
- **Para que serve:** energia e continuidade entre os cortes sem competir com a voz.
- **Padrão:** música 22 LU abaixo da voz (`below_voice_db: 22`, medido no stem já abaixado), ducking máximo de 8 dB (`duck_db`), ataque 15 ms, soltura 350 ms; fade de entrada 0,15 s (0,4 s se entra depois do início) e de saída 1,5 s, limitado a um terço do trecho com música. Efeitos com `only_with_music: true` só entram quando há música, e baixos (−26 a −32 dB).
- **Motor:** `audio.music` em `lib/edit-engine/ffmpeg.ts`: o nível da voz sai de um passe só de voz (ebur128), o limiar do sidechain fica 30 dB abaixo dele, o ganho da música sai de um passe com o stem abaixado e o ducking medido vai para `audio.music.measured`. Mix final em −14 LUFS e pico conferido depois do AAC.
- **Fonte:** parâmetros do `helpers/mix_music.py` do editonny 1.0.0 (ratio 20, ataque 15 ms, soltura 350 ms, mix limitado ao ducking pedido, fade final de 1,5 s, lido em 19/10/2026); no A/B de 19/10/2026 a música ficou 22 dB abaixo da voz com ducking medido de 7,7 dB (relatório `.music.json` do editonny no A/B); filtro `sidechaincompress` da documentação do ffmpeg (`ffmpeg -h filter=sidechaincompress`, ffmpeg 8.1.1).

## Ganchos de legenda e texto

### `word_highlight` · Palavra destacada no gancho
- **O que é:** uma ou duas palavras do gancho em cor de destaque.
- **Quando usar:** no subject repeater ou no payoff do text hook. O texto não muda, só a cor.
- **Para que serve:** guia o olho para a palavra que decide.
- **Padrão:** amarelo `#ffd23f`, no máximo 2 trechos.
- **Motor:** `texts[].highlight_words`.
- **Fonte:** layout "frase inteira com 1 palavra em destaque", Kallaway (`02-text-hooks.md`).

### `caption_word_highlight` · Legenda palavra a palavra com destaque
- **O que é:** legenda em grupos curtos com a palavra falada no momento colorida e 10% maior.
- **Quando usar:** todo vídeo com fala (talking head).
- **Para que serve:** grande parte assiste sem som; o destaque acompanha a fala.
- **Padrão:** 3 a 4 palavras por grupo; palavra ativa 110%; tempos vindos de transcrição com timestamps por palavra (nunca inventados).
- **Motor:** `captions` (ASS por palavra, `lib/edit-engine/ass.ts`).
- **Fonte:** [nik-devs/ffmpeg-caption-burn-ass](https://github.com/nik-devs/ffmpeg-caption-burn-ass) (grupos de 3 a 5 palavras, `\fscx110`); [Rendobar, 2026](https://rendobar.com/blog/animated-captions-api/) (karaoke `\k`); AIR Media-Tech recomenda 1 a 4 palavras por legenda em Shorts ([air.io, 2026](https://air.io/en/youtube-hacks/best-practices-for-writing-and-formatting-subtitles)).

### `caption_bold_word` · Legenda bold-word
- **O que é:** legenda em caixa alta com fonte condensada e pesada (Anton), de 1 a 3 palavras curtas por vez. A palavra falada cresce para 114% em 80 ms na entrada, as palavras-chave ficam em amarelo o grupo inteiro, contorno escuro de 6 px e sombra. Cada grupo entra subindo 12 px e fica até 0,25 s na pausa.
- **Quando usar:** padrão do template `talking-head-captions` desde 1.1.0. O estilo anterior continua como `preset: "classic"`.
- **Para que serve:** no A/B de 19/10/2026 o usuário preferiu a legenda da versão A ("a legenda e a headline ficou melhor que o nosso"). Caixa alta condensada lê em um olhar, e o crescimento da palavra marca o ritmo da fala sem mudar a cor de tudo.
- **Padrão:** `captions.preset: "bold-word"`, `font_px` 76, `max_width_px` 820 (o motor mede cada grupo e reduz só o que passa), `emphasis_color` `#ffd84d`, `pop_scale` 114, `max_words` 3, palavras-chave marcadas com `emphasis: true` nas palavras transcritas.
- **Motor:** `lib/edit-engine/ass.ts` (`boldWordEvents`), ajuste por grupo em `safezones.ts` (`fitCaptions`).
- **Fonte:** cena de legenda da versão A do A/B interno do autor (Montserrat 900, 70 px, palavra a 114%, amarelo `#ffd84d`) e o veredito do usuário no mesmo dia; fonte Anton (SIL OFL 1.1, `assets/fonts/OFL-Anton.txt`), copiada do editonny 1.0.0.

### `headline_fixed` · Headline fixa
- **O que é:** o gancho em texto fica na tela o vídeo inteiro, em Anton de cerca de 86 px a 1080x1920, com largura máxima medida.
- **Quando usar:** talking head em que a promessa do vídeo é a headline (padrão do template). Para o comportamento antigo, `mode: "intro"` (0 a 3 s).
- **Para que serve:** quem entra no meio do vídeo lê a promessa; o usuário pediu headline "um pouco maior" e com "opção de ficar fixa" (feedback da versão B, 17/10/2026).
- **Padrão:** `texts[].mode: "fixed"`, `font_px` 86, `max_width_px` 820, `y` entre a faixa de topo do Reels (250) e as sobrancelhas. O QA de área segura e de olhos e boca vale nos dois modos e considera o zoom da câmera durante todo o tempo em que o texto aparece.
- **Motor:** `resolveSpec` (`spec.ts`) estende o texto de 0 ao fim; `fitTexts` (`safezones.ts`) mede e reduz pela largura.
- **Fonte:** cena de headline da versão A (Anton 86 px, largura máxima 790 px, fixa de 0 a 12,96 s), 19/10/2026; Text Hook de ~3 s como mínimo, Kallaway (`08-spoken-hooks.md`).

### `caption_style_outline` · Estilo contorno
- **O que é:** fonte sem serifa em negrito, branca, contorno preto de 4 px e sombra de 2 px.
- **Quando usar:** padrão para texto sobre imagem com variação de luz.
- **Para que serve:** legível sobre qualquer fundo; o QA exige contorno de 3 px ou mais, ou caixa.
- **Padrão:** Inter Bold, `outline_px` 4, `shadow_px` 2.
- **Motor:** `style.outline_px`, `style.shadow_px`.
- **Fonte:** "bold sans-serif with 4.5:1 contrast", resumo das guias em [OpusClip, design de legenda](https://www.opus.pro/blog/video-caption-design-placement) (2026).

### `caption_style_box` · Estilo caixa
- **O que é:** texto sobre caixa sólida.
- **Quando usar:** fundo claro e muito detalhado; layout "Core Topic" (fonte única, fundo sólido).
- **Para que serve:** contraste garantido, aparência de texto nativo da plataforma.
- **Padrão:** `box: true`, caixa preta a ~80%.
- **Motor:** ASS BorderStyle 3.
- **Fonte:** layout "Core Topic", Kallaway (`02-text-hooks.md`).

### `text_safe_position` · Posição segura
- **O que é:** o bloco de texto fica fora das faixas onde a plataforma desenha a interface.
- **Quando usar:** sempre.
- **Para que serve:** texto coberto por botão ou legenda da plataforma é texto que ninguém lê.
- **Padrão:** retângulos por plataforma em `lib/edit-engine/safe-zones.json`. Resumo (1080x1920): Instagram Reels orgânico topo 250, base 430; TikTok topo 130, base 484, trilho direito 140; YouTube Shorts topo 288, base 672, direita 192 (overlay do Google); Facebook Reels topo 269, base 672, laterais 65 (regra 14/35/6% da Meta). O texto do gancho fica entre a faixa de topo e os olhos; Kallaway sugere cerca de 1/3 abaixo do topo ou perto do centro, sem cobrir olhos e boca.
- **Motor:** `fit_width` move ou reduz o bloco antes do render; o QA mede o bbox real e reprova sobreposição nas plataformas-alvo.
- **Fonte:** ver `sources` em `safe-zones.json` (Cadenus, Revid, Somake, 1ClickReport, Xyla, ScreenSnap, AdKit 10/09/2026), consultados em 17/10/2026. Nenhum número é publicado pela Meta ou pelo TikTok para posts orgânicos.

### `text_dwell_time` · Tempo de texto na tela
- **O que é:** o tempo mínimo que um bloco fica visível.
- **Quando usar:** sempre.
- **Para que serve:** texto que some antes de ser lido mata o gancho.
- **Padrão:** gancho no mínimo 3 s (ciclo do olho rosto → texto → visual → texto, Kallaway); outros textos o maior entre 1,5 s e 0,3 s por palavra (BBC 160 a 180 palavras por minuto); linha confortável até 32 caracteres; no máximo 2 linhas no gancho.
- **Motor:** checado pelo QA (`dwell_*`, `line_count_*`, `line_length_*`).
- **Fonte:** Kallaway (`08-spoken-hooks.md`, "~3 segundos"); BBC e Netflix citados em [OpusClip, 2026](https://www.opus.pro/blog/youtube-shorts-caption-subtitle-best-practices) e [legibility.info](https://legibility.info/rules-for-text-in-videos).

### `text_size_floor` · Tamanho mínimo
- **O que é:** piso de tamanho de fonte a 1080x1920: 60 px no gancho, 52 px no CTA, 48 px em legenda e rótulo.
- **Quando usar:** sempre.
- **Para que serve:** legível no celular sem esforço.
- **Padrão:** gancho 66 px por padrão nos templates. As fontes usam unidades diferentes (pontos de editor, % da altura) e discordam; Flare fala em 72 a 90 "pt equivalentes" no CapCut para manchete e 52 a 60 para texto de apoio. O piso desta casa é provisório, calibrado no teste de 17/10/2026 (62 px lidos sem problema), e deve ser revisto quando houver dado de retenção próprio.
- **Motor:** checado pelo QA (`font_size_*`); `fit_width` não reduz abaixo de 52 px.
- **Fonte:** [Flare, UGC text overlay guide](https://joinflare.app/blog/ugc-text-overlay-captions-by-platform) (2026); teste interno do autor com o Concat, 17/10/2026.

## Loudness (aplica a todo vídeo com voz ou música)

Mix final em −14 LUFS integrado, true peak até −1 dBTP, loudnorm em duas passadas. YouTube normaliza para −14 e não sobe áudio baixo; Instagram e TikTok não publicam alvo, e testes informais ficam entre −14 e −15 ([Venia Mastering, 2026](https://veniamastering.studio/blog/how-loud-should-your-master-be-in-2026/); [TrackGleam, jul/2026](https://trackgleam.com/learn/master-for-tiktok-reels-shorts)). Há quem recomende −10 a −12 para Instagram e TikTok ([OpusClip](https://www.opus.pro/blog/best-loudness-normalizers)); esta casa fica em −14 porque ninguém sobe áudio baixo, e o QA aceita ±1 LU. Faixa só de SFX (vídeo que recebe a música no app): o QA mede e exige só o true peak.

# Changelog

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

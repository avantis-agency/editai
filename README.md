# EditAi

[Português](#português) · [English](#english)

---

## Português

**EditAi** (de "edita aí" e de "Edit AI") é um estúdio de edição de retenção para vídeo curto, como squad do Nirvana-OS. Você entra com clipe, foto ou gravação de tela e sai com um MP4 9:16 (1080x1920, H.264, 30 fps) editado com ganchos de catálogo. Junto vêm o edit spec JSON que gerou o vídeo e um relatório de QA medido: áreas seguras das plataformas, tamanho e tempo de texto, -14 LUFS, codec. Ele também mantém os pipelines de geração com IA herdados do `nirvana-video-creator`, todos terminando no mesmo passe de edição. Serve para qualquer nicho: clínica, restaurante, loja, curso, imobiliária, marca pessoal.

Versão 2.1.0. Protocolo de squad 6.0. Prefixo `editai`. Cerca de 25 MB. A 2.1.0 traz o B-roll automático (onda 1 da fusão com o editonny). A 2.0.0 trocou o nome, a pasta do squad, a pasta no seu projeto e o cache; projetos e downloads de antes continuam funcionando (veja a entrada 2.0.0 do CHANGELOG).

### Instalar

**Requisitos.** Bun; ffmpeg e ffprobe com libass (o `doctor` confere); opcional, o [editonny](https://github.com/soumatheusgomes/editonny) **1.0.0** para a transcrição local das legendas, o medidor de estilo e os cards do B-roll automático. No Windows, fique na 1.0.0: a 1.1.0 tem um bug lá (soumatheusgomes/editonny#7); veja "Windows: editonny para o EditAi" logo abaixo. Para editar não precisa de chave de API.

**Pelo GitHub** (funciona com repositório privado, porque usa o seu acesso ao GitHub):

```bash
git clone https://github.com/avantis-agency/editai.git ~/squads/editai
nrv activate editai
```

**Pelo squads.sh:**

```bash
cd ~ && squads add editai -y      # instala em ~/squads/editai
nrv validate squad editai --fix  # recria o .nirvana-surface.json, que a CLI não copia
nrv activate editai
```

Com o repositório público, `squads add avantis-agency/editai -y` faz o mesmo. Dois cuidados com a CLI `squads` 0.3.x: ela grava todo arquivo como texto, o que pode estragar fontes e áudios (o `doctor` acusa em "binary files"; se acusar, instale pelo `git clone`), e ela copia os agentes para `.claude/` da pasta onde você rodou o comando. Ela não tem modo Nirvana: `--aios existing` é para projetos AIOS.

**Biblioteca completa (opcional).** O squad traz um kit inicial: 2 músicas por clima e 15 efeitos. O resto (os originais de 320 kbps das 23 músicas e mais 87 efeitos, cerca de 175 MB, tudo CC0) vem quando você quiser:

```bash
bun lib/edit-engine/cli.ts library pull            # ou --music, --sfx, --only <id>
```

Os arquivos vêm do repositório público do editonny, fixado num commit, cada um conferido pelo SHA-256, e vão para `~/.nirvana/cache/editai/`, nunca para dentro do squad. Sem internet ou sem o `pull`, tudo funciona com o kit.

**No Codex.** O squads.sh marca o Nirvana no Codex como suporte parcial, e este squad só foi testado no Claude Code. O que não depende do runtime funciona igual, porque é Bun com ffmpeg rodando no terminal: `doctor`, `brief`, `render`, `qa`, `th-batch`, `style-extract`, `style-apply`, `preview` (o mini editor abre no navegador) e `library pull`. O briefing guiado sai como lista numerada, que você responde com `--answers "1=2, 2=1"`; as perguntas clicáveis (`AskUserQuestion`) existem só no Claude Code. No chat do Codex, peça pelo Nirvana como de costume ("via nirvana, edita esse vídeo da clínica pro Reels"). Se o pedido não chegar ao squad, peça direto: "leia `~/squads/editai/agents/edit-briefing-guide.md` e siga". Não foram testados no Codex: o despacho pelo harness do Nirvana, o limite de turnos por agente e os pipelines de geração com IA.

### Windows: editonny para o EditAi

O EditAi chama o editonny instalado para três coisas: a transcrição das legendas, o medidor de estilo e os cards do B-roll. No Windows são cinco cuidados, e o `doctor` confere cada um e diz o que fazer.

1. **Modo de Desenvolvedor ligado.** O instalador do editonny registra o skill com links simbólicos em `~/.claude/skills/editonny` (Claude Code) e `~/.agents/skills/editonny` (Codex). Sem administrador, o Windows só deixa criar esses links com o modo ligado: Configurações > Privacidade e segurança > Para desenvolvedores > Modo de Desenvolvedor. Feche e abra o terminal depois.
2. **`python`, não `python3`.** Os comandos do editonny usam `python3`, e no Windows esse nome costuma ser o atalho da Microsoft Store. Troque por `python`: `python ~/.local/share/editonny/scripts/editonny.py doctor`. O EditAi não depende disso, porque chama o Python da `.venv` do editonny.
3. **`PYTHONUTF8=1`.** Sem ele, o Python do Windows lê e grava arquivos na página de código do sistema e quebra os acentos do PT-BR. Rode `setx PYTHONUTF8 1` uma vez e abra outro terminal. As chamadas do EditAi já ligam a variável sozinhas; ela vale para o que você rodar do editonny à mão.
4. **Versão 1.0.0, fixa.** A 1.1.0 tem um bug no Windows (soumatheusgomes/editonny#7). O pedido de instalação do README do editonny clona "a versão mais recente"; no Windows, peça com todas as letras: "instale o editonny na versão 1.0.0, não a mais recente". Enquanto a issue estiver aberta, o EditAi trata uma 1.1.x no Windows como editonny ausente: sem cards, só a mídia do cliente, e o `doctor` avisa. Para testar outra versão por sua conta, defina `EDITAI_EDITONNY_ANY_VERSION=1`.
5. **Se o instalador subir para a 1.1.0.** Ele guarda a cópia anterior inteira (com a `.venv`) em `~/.local/share/editonny-backups/<data-hora>/`. Para voltar, no PowerShell:

   ```powershell
   $s = "$HOME\.local\share"
   Get-Content "$s\editonny\VERSION"                      # mostra 1.1.0
   Get-ChildItem "$s\editonny-backups" | ForEach-Object { "$($_.Name)  $(Get-Content "$($_.FullName)\VERSION")" }
   Rename-Item "$s\editonny" "editonny-1.1.0"              # guarda a nova, não apaga
   Move-Item "$s\editonny-backups\<data-hora da 1.0.0>" "$s\editonny"
   uv sync --locked --directory "$s\editonny\engine"       # com a .venv junto, termina sem baixar nada
   bun ~/squads/editai/lib/edit-engine/cli.ts doctor        # "editonny 1.0.0"
   ```

   Os links em `~/.claude/skills` e `~/.agents/skills` apontam para `~/.local/share/editonny` e continuam valendo. Sem backup, clone o repositório do editonny, faça checkout do commit da 1.0.0 e rode `python install.py`.

No Codex os comandos do EditAi são os mesmos: Bun e ffmpeg no terminal.

### Primeiro uso em 3 passos

Rode de qualquer pasta: o motor fica em `~/squads/editai/lib/edit-engine/cli.ts`.

1. **`doctor`** confere a máquina e diz como resolver o que faltar.

   ```bash
   bun ~/squads/editai/lib/edit-engine/cli.ts doctor
   ```

2. **`brief`** faz o briefing: lê o que a pessoa mandou e pergunta só o que falta (de 0 a 5 perguntas), mostra o plano com "Posso editar?" e, confirmado, salva o perfil do cliente e o estilo da edição na pasta do **seu projeto** (`editai/`), nunca no squad. No chat, o agente `edit-briefing-guide` faz isso por você. Na primeira vez num projeto, ou quando a pessoa diz que é a primeira vez, o briefing abre com uma acolhida de 7 linhas sobre o que o squad faz (`welcome.md`); numa conversa em andamento ou com o pedido completo, vai direto às perguntas.

   ```bash
   bun ~/squads/editai/lib/edit-engine/cli.ts brief entrada.json --project <pasta do projeto>   # entrada.json: {"client": "Clínica Sorriso", "text": "edita pro Reels", "material": ["take1.mp4"]}
   bun ~/squads/editai/lib/edit-engine/cli.ts brief <state.json> --answers "1=1, 2=3"
   bun ~/squads/editai/lib/edit-engine/cli.ts brief <state.json> --confirm                   # imprime o caminho do edit.style.json
   ```

3. **`preview`** abre o mini editor em 127.0.0.1 para ajustar, aprovar e finalizar em Downloads. O `style-apply` renderiza com o estilo do briefing e já abre o mini editor; para um vídeo já renderizado, use `preview` direto.

   ```bash
   bun ~/squads/editai/lib/edit-engine/cli.ts style-apply <edit.style.json> lote.json --review    # lote no formato de examples/talking-head-batch.json
   bun ~/squads/editai/lib/edit-engine/cli.ts preview <id>.spec.json --open
   ```

### O que entrega

| Capability | Entrada | Saída |
|---|---|---|
| `video.retention_edit.guided` | vídeo + o que a pessoa disse (texto, áudio, cliques) + cliente | perguntas que faltam → plano → vídeo com QA; perfil do cliente salvo no projeto |
| `video.reference_style.extract` | vídeo de referência (arquivo, TikTok, YouTube; Instagram com token da Apify) | perfil de estilo JSON no projeto, relatório do que não reproduz, vídeo com o estilo aplicado |
| `video.retention_edit.execute` | material + texto ou roteiro | MP4 editado + `.spec.json` + `.png` + `.qa.md` |
| `video.retention_edit.live` | spec + MP4 renderizado + o seu agente (Claude Code ou Codex) | editor com IA: pedidos escritos, comandos rápidos, 5 faixas, prévia a cada pedido, final com QA |
| `video.retention_edit.review` | spec + MP4 renderizado | mini editor no navegador → prévia rápida → final com QA em Downloads (ou `feedback.json` → próxima versão + QA) |
| `video.text_hook_batch.execute` | lista de ganchos + foto ou clipe por item | um MP4 só com texto por gancho + `batch-report.md` |
| `video.video_creation_pipeline.execute` | brief | geração com IA → master → passe de retenção |
| `video.long_form_multi_shot.execute` | narrativa de 30 s ou mais | shots encadeados → passe de retenção |
| `video.lipsync_refinement.execute` | footage + áudio | lipsync → legenda palavra a palavra |
| `media.video.compose` | brief + imagem | um clipe → passe de retenção |

Cinco templates de edição, cada um provado com material real e com exemplo em `examples/`: só texto, POV com tela do app, isto VS aquilo em tela dividida, rosto falando com legenda e, desde a 2.1.0, rosto falando com legenda e B-roll automático (`talking-head-broll`).

**Sistemas testados: só Windows 10** (ffmpeg 8.1.1, Bun 1.4.2). O código não tem nada específico de Windows, mas macOS e Linux não foram testados. As chaves em `dependencies.yaml` servem só aos pipelines de geração com IA, e todas são opcionais. Opcional também: o Concat 0.2.7 ou mais novo, para abrir um vídeo como projeto e ajustar à mão.

### Os comandos mais usados

```bash
bun lib/edit-engine/cli.ts doctor                                     # confere a máquina
export EDITAI_MEDIA="/caminho/dos/seus/clipes"
bun lib/edit-engine/cli.ts from-template this-vs-that examples/this-vs-that.slots.json vs.plan.spec.json
bun lib/edit-engine/cli.ts render vs.plan.spec.json vs.mp4            # grava vs.spec.json, vs.png e o MP4
bun lib/edit-engine/cli.ts qa vs.spec.json vs.mp4                     # QA medido: PASS, CONCERNS ou FAIL
bun lib/edit-engine/cli.ts th-batch examples/talking-head-batch.json  # N talking heads, cada um com spec, QA e prévia conferida (EDITAI_MEDIA e EDITAI_OUT)
bun lib/edit-engine/cli.ts batch meu-lote.json                        # ganchos só com texto, um MP4 por gancho
bun lib/edit-engine/cli.ts preview vs.spec.json --open --final-name "Cliente - vs - final"
bun lib/edit-engine/cli.ts apply-feedback vs.spec.json vs.feedback.json   # aplica uma revisão sem o mini editor
bun lib/edit-engine/cli.ts agent-inbox vs.spec.json --wait            # editor com IA: o próximo pedido para o seu agente, em JSON
bun lib/edit-engine/cli.ts edit-op vs.spec.json op.json               # o agente aplica operações do conjunto fechado
bun lib/edit-engine/cli.ts agent-reply vs.spec.json p3 --status feito --message "Zoom em 00:03.6"
```

Outros: `broll-suggest` e `broll-render` (B-roll automático, abaixo), `library` (lista músicas e efeitos e marca o que é kit e o que falta baixar), `library pull`, `placeholder-screen`, `concat`, `transcribe`, `validate`, `sfx-synth`, `profiles`, `style-extract`, `style-check`. A lista completa está no topo de `lib/edit-engine/cli.ts`.

### B-roll automático

Num talking head, o EditAi põe B-roll sozinho: a foto ou o vídeo que o cliente mandou, na hora em que a coisa é citada, e cards animados quando a fala diz um número, um preço, uma lista, passos, uma oferta, uma virada ou um convite a comentar.

1. Ponha as fotos e vídeos do cliente em `<projeto>/editai/broll/`. O nome do arquivo já é etiqueta (`forno-a-lenha.mp4` casa com "forno"). Para outras palavras, um `broll.json` opcional na mesma pasta: `[{"arquivo": "forno.mp4", "palavras": ["forno", "pizza"]}]`. Acento e maiúscula não contam.
2. Use o template `talking-head-broll`, ou `"template": "talking-head-broll"` no lote do `th-batch` (que já roda o passo 3; veja `examples/talking-head-broll-batch.json`), ou acrescente `"broll": {"mode": "auto", "items": []}` a um spec.
3. Rode:

   ```bash
   bun lib/edit-engine/cli.ts broll-suggest video.plan.spec.json --project <pasta do projeto>   # grava video.broll.spec.json e lista o que entrou e o que ficou fora, com o motivo
   bun lib/edit-engine/cli.ts broll-render video.broll.spec.json                             # desenha os cards no cache do projeto (o render também faz)
   bun lib/edit-engine/cli.ts render video.broll.spec.json video.mp4
   bun lib/edit-engine/cli.ts qa video.spec.json video.mp4                                    # checks broll_* e a folha de contato video.broll-sheet.png
   ```

**Regras.** Nada nos 3 primeiros segundos nem nos 2,5 s finais. No máximo um item a cada 6 s, o que dá de 4 a 6 num vídeo de 45 a 60 s. Mídia real do cliente vence o card no mesmo trecho. Nunca sobre olhos e boca (medidos pelo `face_layout.py` do editonny, ou pelas `protect_regions` do spec), a headline, a legenda ou a interface das plataformas. O valor do card sai da fala: se o detector não leu o valor, o card não entra. Card que escreve as mesmas palavras da fala esconde a legenda só enquanto está na tela; contador e preço deixam a legenda, sobem ela para cima do card ou, se não houver lugar, também escondem. Um som por card, da biblioteca CC0. O QA bloqueia em `broll_hook_window`, `broll_face`, `broll_caption_overlap`, `broll_safe_zone`, `broll_quote` e `broll_provenance`.

**No mini editor**, a linha do tempo ganha a faixa B-roll e três comandos rápidos: "tira esse b-roll", "põe um card aqui" (vira um ponto marcado, que o editonny transforma em card com a frase dita ali na próxima prévia) e "b-roll mais curto".

**O que vem do editonny 1.0.0**, por subprocesso e sem copiar nada: achar os momentos (`suggest_visuals.py`), desenhar os cards (`render_visuals.py`, `.mov` com transparência no cache `<projeto>/editai/cache/broll/`) e medir o rosto (`face_layout.py`). **O resto é do EditAi:** spec, render, QA, regras, mídia do cliente, mini editor, template e catálogo de ganchos.

**Sem editonny**, ou com a 1.1.x no Windows, o `broll-suggest` sai com código 3, só a mídia da pasta entra e o vídeo renderiza com os ganchos de sempre; o `doctor` mostra "B-roll de cards: indisponível". Sem a pasta de mídia, só cards. Com `"mode": "off"`, o render é o mesmo de antes, byte a byte.

**Limites conhecidos.** Os detectores do editonny 1.0.0 foram escritos para português: em inglês eles quase não acham momentos sozinhos (na fala de teste não acharam nenhum), então peça "põe um card aqui" onde quiser um card. Alguns rótulos fixos dos cards vêm em inglês do editonny ("only", "What you receive"); com fala em português o EditAi troca por "apenas" e "Você recebe". Num selfie com o rosto no centro, uma lista longa pode não caber entre o rosto e a borda de baixo da tela; ela fica fora, com o motivo no relatório.

### Música e efeitos sonoros

O índice tem 23 faixas CC0 em 6 climas (calm, chill-beat, emotional, groove, hiphop, upbeat) e 102 efeitos CC0 em 28 categorias, vindos da biblioteca do editonny com a licença lida item a item. Fonte, autor e licença de cada arquivo estão em `LICENSES.md` e `CREDITS.md` de `assets/music/` e `assets/sfx/`.

O kit inicial traz, em cada clima, a faixa padrão e a mais curta das outras, recodificadas em AAC 96 kbps, e 15 efeitos originais (os papéis `whoosh`, `hit` e `riser` entre eles). Depois do `library pull`, o motor usa o original de 320 kbps no lugar da versão do kit. No spec, a música se escolhe por clima e o efeito por nome:

```json
"audio": {
  "music": { "mood": "calm", "below_voice_db": 22 },
  "sfx": [{ "src": "@sfx:whoosh", "at": 2.5, "gain_db": -7, "hook": "whoosh", "anchor": true }]
}
```

Com voz, a música abaixa sozinha sob a fala (sidechain) e a mix fecha em -14 LUFS. O mesmo spec gera o mesmo arquivo, byte a byte.

### Mini editor

`preview` abre uma página local com duas abas. Na aba **Editor** o vídeo toca sem texto, e a página desenha a headline e a legenda por cima, no tempo do vídeo, com a mesma fonte, posição e animação do render. Por isso o que você muda aparece na hora:

- o texto da headline, se ela fica o vídeo todo ou só nos 3 primeiros segundos, e o tamanho (de 80 a 120 %);
- o estilo da legenda (palavra que cresce ou clássica);
- uma palavra da legenda: clique nela para corrigir ou para deixar em amarelo;
- música ligada ou desligada, o volume dela e o whoosh (o som muda só na prévia rápida).

O texto por cima é uma aproximação. Medido no talking head de regressão contra o render, o centro ficou a até 1 px e a largura a até 6 px (1,2 %). Os quatro botões grandes são estes:

- **Gerar prévia rápida** renderiza um rascunho 540x960 com tudo o que foi salvo (cortes, música, ganho e whoosh incluídos) e põe no player. Cada prévia vira um arquivo `-draftN`, nada é sobrescrito.
- **Aprovar** aprova o vídeo que está no player.
- **Finalizar** só fica ativo quando a versão aprovada tem as mudanças atuais. Ele gera o vídeo em 1080x1920, roda o QA completo e, se o QA não der FAIL, copia para `Downloads` com o nome do `--final-name` (ou um nome tirado do spec: `loja-vestido-v2` vira `Loja - vestido - final vN.mp4`), sem sobrescrever. Se der FAIL, a página diz o motivo em português e não copia.
- **Desfazer** volta a última mudança. A lista **Versões** mostra o original, as prévias e os finais, com "Ver" e "Voltar a esta".

Um render por vez; os botões ficam desligados enquanto ele roda, com barra de progresso. A aba **Linha do tempo** tem a onda, os takes, as marcações com nota livre (essas precisam do agente editor e vão para `pending-notes.md`) e o ajuste de borda de take. Tudo fica em `<nome>.feedback.json` e `<nome>.versions.json`, ao lado do spec.

A página escuta só em 127.0.0.1, exige token por sessão em toda gravação (os pedidos de render também), recusa pedidos de outros sites e serve só os vídeos da sessão. Ela nunca manda caminho: o servidor só renderiza o spec que foi aberto.

### Editor com IA: como ligar o seu agente

Na aba **Editor** tem uma caixa **Você pede** ao lado do vídeo e, embaixo, a linha do tempo em 5 faixas: **Vídeo** (miniaturas e takes), **Legenda** (blocos; clicar leva o cursor até ali), **Edição** (headline, zooms, punch-ins, efeitos), **B-roll** (cards e mídia do cliente, desde a 2.1.0) e **Áudio** (onda e barra da música). Arraste a régua para correr o vídeo e arraste numa faixa para selecionar um trecho. O pedido vai junto com o tempo do cursor e a seleção.

Os **comandos rápidos** saem na hora, feitos pelo próprio motor, sem IA: "tira essa pausa" (com o cursor no silêncio; com seleção, todas as pausas dela), "corta esse trecho", "legenda maior" ou "menor", "sobe a legenda", "headline maior", "legenda clássica" ou "bold", "headline fixa" ou "só no começo", "troca X por Y", "destaca X", "música mais alta", "mais baixa", "sem música", "tira o whoosh", "zoom aqui" e "desfaz". Valem em português ou inglês, com ou sem acento. A lista completa está no botão "O que eu posso pedir?". Cada pedido gera a prévia rápida sozinho e aparece em **A IA edita** com o status (na fila, aplicando, feito, precisa de você, não deu), a resposta curta e um **Desfazer** só dele.

O resto (por exemplo, "dá um zoom quando ela fala water e põe um som de pop") vai para uma fila, em `<nome>.requests.json`, e quem resolve é o agente que você já tem aberto. Não precisa de chave de API paga. O agente lê o pedido, muda o vídeo só por operações conferidas pelo motor (cortar, aparar take, zoom, punch-in, efeito da biblioteca, música, texto e estilo da legenda e da headline) e responde. Pedido ambíguo volta como **precisa de você**, com uma pergunta; você responde pelo botão Responder.

Abra o editor primeiro:

```bash
bun ~/squads/editai/lib/edit-engine/cli.ts preview <id>.spec.json --open
```

**No Claude Code**, peça na conversa:

> Fica de olho nos pedidos do editor deste vídeo: roda `bun ~/squads/editai/lib/edit-engine/cli.ts agent-inbox <id>.spec.json --wait --timeout 600` em segundo plano e, a cada pedido, siga as instruções do JSON.

O Claude Code avisa quando o comando termina, com o pedido em JSON. Ele aplica com `cli.ts edit-op <spec> op.json`, responde com `cli.ts agent-reply <spec> <id> --status feito --message "..."` e volta a esperar. Se passarem 10 minutos sem pedido, o comando sai com código 3 e é só rodar de novo.

**No Codex** (e em outros agentes de terminal), peça:

> Leia `~/squads/editai/tasks/serve-editor-requests.md` e atenda os pedidos do editor de `<id>.spec.json` em loop até eu dizer que acabou.

O Codex roda o mesmo `agent-inbox --wait` em primeiro plano. O comando fica parado até chegar um pedido, e o Codex repete depois de cada resposta. Quando o agente está esperando, a página mostra "Seu agente está ligado".

Segurança: o texto do pedido é só dado. O motor nunca executa nada que venha dele, e o agente é instruído a mudar o vídeo só por `edit-op`, que aceita um conjunto fechado de operações, sem caminho nem comando. O pedido tem no máximo 500 letras, a fila aceita até 10 pedidos esperando o agente, e as proteções da página continuam (127.0.0.1, token, Host, Origin, outro site). Os três comandos do agente falam com o editor aberto por uma pasta em `preview_cache/agent/`, sem token em arquivo.

### Briefing guiado

O agente `edit-briefing-guide` lê o que chegou e pergunta só o que falta, com "Outro" sempre aberto. As perguntas possíveis são destino, formato, clima, referência e legenda com headline. Mensagem completa (destino, formato e clima ditos) recebe no máximo 1 pergunta; um "edita esse vídeo" sozinho recebe até 5. No Claude Code as perguntas são clicáveis (`AskUserQuestion`). Nos outros runtimes viram uma lista numerada, respondida com "1=2, 2=1". Depois vem o plano curto (template, ritmo de corte, legenda, headline, música da biblioteca pelo clima, efeitos) e "Posso editar?".

Tudo fica na pasta do projeto, em `editai/`: `briefs/`, `profiles/<cliente>.json`, `styles/` e `references/`. Nunca dentro do squad, que recusa a própria pasta. Os perfis de partida por nicho estão em `templates/niches/`: saúde e bem-estar, negócio local, infoproduto e aulas, e-commerce, imobiliário e marca pessoal. Nenhum cliente é padrão; há um perfil de exemplo em `examples/profiles/`.

### Copiar estilo de referência

```bash
bun lib/edit-engine/cli.ts style-extract referencia.mp4 --name estilo-x --project <pasta>   # ou link do TikTok/YouTube
bun lib/edit-engine/cli.ts style-apply <pasta>/editai/styles/estilo-x.style.json lote.json    # prévia rápida, final com QA, mini editor
```

O `style-extract` mede a linguagem de edição com o `measure_reference.py` do editonny, chamado por subprocesso e sem copiar nada dele. Ele mede o ritmo dos cortes, o zoom nos cortes, a posição e o tamanho do texto e da legenda, a headline, os efeitos nas viradas, a música e o volume dela, a paleta e o enquadramento. O resultado é um perfil JSON com a origem de cada valor e um relatório `.style.md` do que o motor **não** reproduz: fonte exata, cor e gradação, planos de B-roll, transições e animações especiais, ritmo mais calmo que o material. Fala, música, marca e pessoas da referência nunca entram.

No Windows, o editonny acha onde está o texto mas não lê as letras. Por isso o agente confere o perfil na folha de contato e registra cada correção em `review_notes` (`cli.ts style-check` valida). Links do TikTok e do YouTube passam pelo yt-dlp (opcional). Link do Instagram só passa com `APIFY_TOKEN` no ambiente; sem ele, mande o arquivo.

### Concat (opcional)

```bash
bun lib/edit-engine/cli.ts concat vs.spec.json --project-dir ~/concat-projetos --token-file ~/concat-token.txt
```

Com o Concat aberto e a API ligada (na tela Automação do Concat ou em `settings.json`), o comando monta um projeto. Os takes ficam cortados na trilha T1, a legenda vai como um título por grupo em T2, a headline em T3, a música em T4 e os efeitos numa quinta trilha. Depois ele reabre o projeto pela API para conferir. Para abrir, escolha o projeto na lista de recentes do Concat ou use "Abrir projeto". O comando também lista o que não vai (J-cut, ducking, animação da legenda); a API do Concat 0.2.7 não importa SRT.

Riscos, do teste de 17/10/2026: o instalador do Concat não é assinado; a API grava em qualquer lugar da sua pasta de usuário; a 0.2.7 não tem como desligar a atualização automática, e a página Version consulta o GitHub. O token é lido de arquivo ou de `CONCAT_TOKEN` e nunca é gravado.

### Créditos

- **Matheus Gomes**, autor do [editonny](https://github.com/soumatheusgomes/editonny) (MIT). Do editonny vieram a interface e o servidor da prévia, adaptados (aviso em cada arquivo, licença em `lib/edit-engine/preview/LICENSE-editonny.md`), a fonte Anton (OFL) e a seleção da biblioteca de música e efeitos, que o `library pull` baixa do repositório dele. O transcritor e o medidor de estilo opcionais chamam o editonny instalado, sem copiar nada.
- **Luiz Gustavo Vieira Rodrigues (@gutomec)**, autor do `nirvana-video-creator` 6.0.0, de onde este squad deriva (white label). O original não foi alterado.
- Música: HoliznaCC0, Rafael Krux e Frank Nora (via FreePD), CC0. Efeitos: autores do Freesound listados em `assets/sfx/CREDITS.md`, CC0.
- Fontes: Anton e Inter, SIL OFL 1.1 (`assets/fonts/`).

### O que este squad não faz

Live streaming, avatar em tempo real, escrever os ganchos (isso fica com um squad de copy) e buscar música ou efeitos fora da biblioteca CC0 dele.

---

## English

**EditAi** (from the Portuguese "edita aí", roughly "go ahead, edit it", and from "Edit AI") is a retention-editing studio for short-form video, packaged as a Nirvana-OS squad. Give it a clip, a photo or a screen recording and it returns a 9:16 MP4 (1080x1920, H.264, 30 fps) edited with catalogued hooks. With it come the JSON edit spec that produced the video and a measured QA report: platform safe zones, text size and dwell time, -14 LUFS, codec. It also keeps the AI generation pipelines inherited from `nirvana-video-creator`, all ending in the same edit pass. It fits any niche: clinic, restaurant, shop, course, real estate, personal brand.

Version 2.1.0. Squad protocol 6.0. Prefix `editai`. About 25 MB. Version 2.1.0 adds automatic B-roll (wave 1 of the editonny fusion). Version 2.0.0 changed the name, the squad folder, the folder in your project and the cache; projects and downloads from before keep working (see the 2.0.0 entry in the CHANGELOG).

### Install

**Requirements.** Bun; ffmpeg and ffprobe with libass (`doctor` checks); optionally [editonny](https://github.com/soumatheusgomes/editonny) **1.0.0** for local caption timings, the style meter and the automatic B-roll cards. On Windows stay on 1.0.0: 1.1.0 has a bug there (soumatheusgomes/editonny#7); see "Windows: editonny for EditAi" below. Editing needs no API key.

**From GitHub** (works with a private repository, since it uses your own GitHub access):

```bash
git clone https://github.com/avantis-agency/editai.git ~/squads/editai
nrv activate editai
```

**From squads.sh:**

```bash
cd ~ && squads add editai -y      # installs into ~/squads/editai
nrv validate squad editai --fix  # rebuilds .nirvana-surface.json, which the CLI does not copy
nrv activate editai
```

With a public repository, `squads add avantis-agency/editai -y` does the same. Two caveats with the `squads` CLI 0.3.x: it writes every file as text, which can corrupt fonts and audio (`doctor` reports it under "binary files"; if it does, install with `git clone`), and it copies the agents into `.claude/` of the folder you ran it from. It has no Nirvana mode: `--aios existing` is for AIOS projects.

**Full library (optional).** The squad ships a starter kit: 2 tracks per mood and 15 effects. The rest (the 320 kbps originals of the 23 tracks and 87 more effects, about 175 MB, all CC0) comes on demand with `bun lib/edit-engine/cli.ts library pull` (or `--music`, `--sfx`, `--only <id>`). Files come from editonny's public repository pinned to one commit, each checked by SHA-256, into `~/.nirvana/cache/editai/`, never into the squad. Offline or without `pull`, everything works with the kit.

**On Codex.** squads.sh lists Nirvana on Codex as partial support, and this squad was tested on Claude Code only. What does not depend on the runtime works the same, because it is Bun plus ffmpeg in a terminal: `doctor`, `brief`, `render`, `qa`, `th-batch`, `style-extract`, `style-apply`, `preview` (the mini editor opens in the browser) and `library pull`. The guided briefing comes as a numbered list you answer with `--answers "1=2, 2=1"`; clickable questions (`AskUserQuestion`) exist only on Claude Code. In the Codex chat, ask through Nirvana as usual; if the request does not reach the squad, ask directly: "read `~/squads/editai/agents/edit-briefing-guide.md` and follow it". Not tested on Codex: dispatch through the Nirvana harness, per-agent turn limits and the AI generation pipelines.

### Windows: editonny for EditAi

EditAi calls the installed editonny for caption timings, the style meter and the B-roll cards. On Windows there are five points, and `doctor` checks each one and says what to do.

1. **Developer Mode on.** editonny's installer registers the skill with symbolic links in `~/.claude/skills/editonny` (Claude Code) and `~/.agents/skills/editonny` (Codex); without an admin shell, Windows only allows them with Developer Mode on (Settings > Privacy & security > For developers). Reopen the terminal afterwards.
2. **`python`, not `python3`.** editonny's commands say `python3`, which on Windows is usually the Microsoft Store shortcut. Use `python ~/.local/share/editonny/scripts/editonny.py doctor`. EditAi itself calls the Python of editonny's `.venv`.
3. **`PYTHONUTF8=1`.** Without it Windows Python reads and writes files in the system code page and breaks Portuguese accents. Run `setx PYTHONUTF8 1` once and open a new terminal. EditAi's own calls already set it.
4. **Pinned to 1.0.0.** 1.1.0 has a Windows bug (soumatheusgomes/editonny#7). editonny's install request clones "the latest version"; on Windows ask for 1.0.0 explicitly. While the issue is open EditAi treats a 1.1.x install on Windows as missing (no cards, client media only) and `doctor` says so. `EDITAI_EDITONNY_ANY_VERSION=1` lets you try another version at your own risk.
5. **If the installer moved you to 1.1.0.** It keeps the previous copy, `.venv` included, in `~/.local/share/editonny-backups/<date-time>/`. Rename the current `~/.local/share/editonny` (do not delete it), move the 1.0.0 backup back to `~/.local/share/editonny`, run `uv sync --locked --directory ~/.local/share/editonny/engine` and check with `doctor`; the PowerShell lines are in the Portuguese section. The skill links point to `~/.local/share/editonny` and keep working. Without a backup, clone editonny, check out the 1.0.0 commit and run `python install.py`.

### First use in 3 steps

Run from any folder: the engine is `~/squads/editai/lib/edit-engine/cli.ts`.

1. **`doctor`** checks the machine and says how to fix what is missing: `bun ~/squads/editai/lib/edit-engine/cli.ts doctor`.
2. **`brief`** runs the briefing: `brief entrada.json --project <your project>` (with `{"client": "...", "text": "...", "material": ["take1.mp4"]}`), then `brief <state.json> --answers "1=1, 2=3"` and `brief <state.json> --confirm`. The client profile and the edit style go to your project (`editai/`), never into the squad. In the chat, the `edit-briefing-guide` agent does this for you. The first time in a project, or when the person says it is the first time, the briefing opens with a 7-line welcome on what the squad does (`welcome.md`, English with `"lang": "en"`); in an ongoing conversation or with a complete request it goes straight to the questions.
3. **`preview`** opens the mini editor on 127.0.0.1 to adjust, approve and finalize to Downloads: `style-apply <edit.style.json> batch.json --review` renders with the briefing's style and opens it (batch shaped like `examples/talking-head-batch.json`); for a video already rendered, `preview <id>.spec.json --open`.

### What it delivers

The nine capabilities are in the table above. There are five edit templates, each proven on real material with an example in `examples/`: text only, POV with an app screen, this-vs-that split screen, talking head with captions and, since 2.1.0, talking head with captions and automatic B-roll (`talking-head-broll`). **Tested on Windows 10 only** (ffmpeg 8.1.1, Bun 1.4.2); nothing in the code is Windows-specific, but macOS and Linux are untested.

Main commands: `doctor`, `from-template` → `render` → `qa`, `broll-suggest` → `broll-render` for automatic B-roll, `th-batch examples/talking-head-batch.json` (`EDITAI_MEDIA` and `EDITAI_OUT` set), `batch my-batch.json` for text-only hooks, `preview <spec> --open [--final-name "Name"] [--downloads DIR]`, `apply-feedback <spec> <feedback>`, and for the AI editor `agent-inbox <spec> [--wait]`, `edit-op <spec> <op.json>`, `agent-reply <spec> <id> --status ... --message ...`. Also `library`, `library pull`, `placeholder-screen`, `concat`, `transcribe`, `validate`, `sfx-synth`, `profiles`, `style-extract`, `style-check`.

### Automatic B-roll

On a talking head EditAi adds B-roll by itself: the client's own photo or video when the speech names it, and animated cards when the speech says a number, a price, a list, steps, an offer, a turn or an invitation to comment. Put the client's files in `<project>/editai/broll/` (the file name is the tag; an optional `broll.json` adds words: `[{"arquivo": "forno.mp4", "palavras": ["forno", "pizza"]}]`), use the `talking-head-broll` template (or `"template": "talking-head-broll"` in a `th-batch` file, see `examples/talking-head-broll-batch.json`), then `cli.ts broll-suggest <spec> --project <dir>`, `cli.ts broll-render <spec>`, `render` and `qa` (`broll_*` checks and a contact sheet).

Rules: nothing in the first 3 s or the last 2.5 s; at most one item every 6 s (4 to 6 in a 45 to 60 s video); real client media beats a card on the same stretch; never over eyes and mouth (editonny's `face_layout.py`, or the spec's `protect_regions`), the headline, the captions or the platform UI; a card's value comes from the speech or the card is dropped; a card that writes the spoken words hides the caption only while it is on screen. Blocking QA: `broll_hook_window`, `broll_face`, `broll_caption_overlap`, `broll_safe_zone`, `broll_quote`, `broll_provenance`. The mini editor gets a B-roll track and three quick commands: "tira esse b-roll", "põe um card aqui", "b-roll mais curto" (English forms work too).

From editonny 1.0.0, by subprocess and nothing copied: moment detection (`suggest_visuals.py`), card drawing (`render_visuals.py`, alpha `.mov` cached in `<project>/editai/cache/broll/`) and face position (`face_layout.py`). Without editonny, or with 1.1.x on Windows, `broll-suggest` exits 3, only the client media enters and the video still renders; with `"mode": "off"` the render is the one from before, byte for byte. Known limits: editonny 1.0.0's detectors are written for Portuguese and find almost nothing in English speech on their own (use "põe um card aqui"); a few fixed card words come from editonny in English and are switched to Portuguese for Portuguese speech; on a centred selfie a long list may not fit under the face and stays out with the reason in the report.

### Music and sound effects

The index lists 23 CC0 tracks in 6 moods and 102 CC0 effects in 28 categories from editonny's library, each item's license read and recorded (`LICENSES.md`, `CREDITS.md`). The starter kit holds the default and the shortest other track of each mood as AAC 96 kbps, plus 15 original effects including the `whoosh`, `hit` and `riser` roles; after `library pull` the engine uses the 320 kbps originals instead of the kit versions. A spec picks music by mood (`"music": { "mood": "calm" }`) and effects by name (`"src": "@sfx:whoosh"`, `anchor: true` lands the impact on `at`). Under a voice the music is ducked by a sidechain compressor and the mix ends at -14 LUFS. The same spec renders the same file, byte for byte.

### Mini editor

The Editor tab plays a clean base of the video (no burned text) and the page draws the headline and captions over it, in sync, with the render's font, position and animation, so a new headline text, mode (whole video or first 3 s) or size (80 to 120 %), caption style, corrected word or yellow keyword shows at once. The overlay is an approximation: on the regression talking head its centre was within 1 px of the render and its width within 6 px (1.2 %). "Gerar prévia rápida" renders a 540x960 draft with every saved change (trims, music, gain and whoosh included) as a new `-draftN` file; "Aprovar" approves the video in the player; "Finalizar" renders the 1080x1920 final, runs the full QA and, unless it is FAIL, copies it to Downloads under `--final-name` (default derived from the spec id) without overwriting anything. "Desfazer" undoes the last change and the version list goes back to any draft or final. One render at a time, with progress. The timeline tab keeps the free-text marks (for the retention-editor agent, in `pending-notes.md`) and take trims. 127.0.0.1 only, per-session token on every write including renders, no cross-site requests, no path from the page.

### AI editor: connect your agent

The Editor tab has a **Você pede** box next to the video and a five-track timeline below it: **Vídeo** (thumbnails and takes), **Legenda** (caption blocks; a click moves the cursor there), **Edição** (headline, zooms, punch-ins, sound effects), **B-roll** (cards and client media, since 2.1.0) and **Áudio** (waveform and the music bar). Drag the ruler to scrub and drag on a track to select a stretch; each request carries the cursor time and the selection.

Quick commands are applied by the engine at once, without AI: "tira essa pausa" / "remove this pause", "corta esse trecho", caption or headline bigger and smaller, caption up or down, classic or bold captions, headline fixed or only at the start, "troca X por Y", "destaca X", music louder, lower, off or on, whoosh off or on, "zoom aqui" and "desfaz". The full list is behind "O que eu posso pedir?". Each request renders a quick draft and shows in **A IA edita** with its status (queued, applying, done, needs you, failed), a short answer and its own undo.

Anything else waits in `<name>.requests.json` for the agent you already run, with no paid API key. It changes the video only through a closed, validated set of operations and answers; an ambiguous request comes back as "precisa de você" with one question.

Open the editor (`cli.ts preview <id>.spec.json --open`), then:

- **Claude Code:** ask it to run `bun ~/squads/editai/lib/edit-engine/cli.ts agent-inbox <id>.spec.json --wait --timeout 600` as a background command and follow the JSON for each request (`edit-op` to apply, `agent-reply` to answer, then wait again).
- **Codex and other terminal agents:** ask it to read `~/squads/editai/tasks/serve-editor-requests.md` and serve the requests in a loop; it runs the same command in the foreground, blocking until a request arrives.

The request text is data: the engine never runs anything from it, and `edit-op` takes no path and no command. 500 characters per request, at most 10 waiting for the agent, the page protections unchanged. The agent commands reach the open editor through `preview_cache/agent/`, with no token in any file. Tested with Claude Code playing the agent; not tested with a real Codex session.

### Guided briefing and reference style

The briefing writes everything to your project folder (`editai/briefs`, `editai/profiles/<client>.json`, `editai/styles`), never into the squad. Niche starting profiles live in `templates/niches/`; no client is a default, and there is one example profile in `examples/profiles/`. `cli.ts style-extract <file|link> --name <n> --project <dir>` measures pace, zoom, text and caption placement, headline, sound effects, music level, palette and framing with editonny's `measure_reference.py` (subprocess, nothing copied). `cli.ts style-apply <style.json> <batch.json>` renders a quick draft, the final with QA and checks the mini editor. The `.style.md` report lists what the engine cannot reproduce: exact font, colour grade, B-roll shots, special transitions and text animations, a pace calmer than the material.

### Concat (optional)

With Concat open and its API on, `bun lib/edit-engine/cli.ts concat <spec.json> --project-dir <dir under your home> --token-file <file>` builds a project. The takes are cut on track T1, the captions go in as one title per group on T2, the headline on T3, the music on T4 and the effects on a fifth track. The command then reopens the project through the API to check it, and it lists what does not carry over (J-cut, ducking, caption animation). Concat 0.2.7's API cannot import SRT. Its known risks: the installer is unsigned, the API writes anywhere under your home folder, and 0.2.7 cannot turn auto-update off.

### Credits

- **Matheus Gomes**, author of [editonny](https://github.com/soumatheusgomes/editonny) (MIT). The preview UI and server are adapted from it, and the Anton font and the music and effects selection come from it; `library pull` downloads from his repository. The optional transcriber and style meter call an installed editonny without copying it.
- **Luiz Gustavo Vieira Rodrigues (@gutomec)**, author of `nirvana-video-creator` 6.0.0, from which this squad derives.
- Music by HoliznaCC0, Rafael Krux and Frank Nora (via FreePD), CC0. Effects by the Freesound authors listed in `assets/sfx/CREDITS.md`, CC0. Fonts Anton and Inter, SIL OFL 1.1.

### Out of scope

Live streaming, real-time avatars, writing the hooks, and fetching music or effects from outside its CC0 library.

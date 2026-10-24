# Higgsfield CLI — superfície de referência (compartilhada)

Referência única da CLI do Higgsfield para qualquer squad de vídeo. **Execução** mora no squad `higgsfield-studio-nirvana`. Este arquivo é o que os outros squads leem para saber que o Higgsfield existe, quando escolhê-lo e como ele é chamado.

Binário: `higgsfield` (alias `higgs`). **Nunca use `hf`** para Higgsfield: em muitas máquinas `hf` é a CLI do HuggingFace. Fonte da verdade dos parâmetros = `higgsfield model get <job_set_type>`, nunca spec de blog.

Resolva a versão e o catálogo **nesta execução**: `higgsfield version`, `higgsfield model list`, `higgsfield model get <id>`. Snapshot (só se a rede ou o binário falhar): `references/state-of-the-art.md`. Se o binário faltar ou estiver abaixo do que o help desta run exige: `nrv activate higgsfield-studio-nirvana`, depois o `install:` de `dependencies.yaml`, depois `higgsfield version`.

## Autenticação e conta

```bash
higgsfield account status              # email, plano, créditos
# Não autenticado → higgsfield auth login   (device login)
```

Erros `Session expired` / `Not authenticated` / `Stored credentials use an older auth flow` → `higgsfield auth login`. Auth alternativa não-interativa: env `HF_KEY` no formato `key:secret`.

## Modelos (famílias; ids vivos nesta execução)

Não congele um id. Confirme com `higgsfield model list` e `higgsfield model get <id>`. Famílias que este squad prefere, se ainda listadas:

- **Imagem:** Soul V2 (rosto, `--soul-id`), Soul Cinematic, Nano Banana Pro (fidelidade, texto na imagem), GPT Image, Flux.
- **Vídeo:** Kling (`--start-image`, áudio costuma ser `--sound`), Veo no CLI Higgsfield (não a API Google nativa), Seedance (`--start-image`/`--end-image`, áudio costuma ser `--generate_audio`), Cinematic Studio (`camera_style` / `light_scheme` / `color_grading` quando o schema listar), Marketing Studio (`marketing_studio_video`).
- **Não invente** um job type `dop`. Se não está em `model list`, não existe.
- **Upscale:** Topaz / Bytedance / `video_upscale` se `model list` os devolver. Confirme o id.
- **Reframe:** workflow, não generate-create: `higgsfield generate workflow reframe`.

Paths locais em flags de mídia são auto-upload. UUID (upload id ou job id) também vale.

## Custo (sempre antes de gerar)

```bash
higgsfield generate cost <model> --prompt "..." --duration 15
higgsfield generate cost workflow reframe --duration 7.1 --resolution 1080p
```

O número que vale é a saída deste comando, nunca um crédito memorizado.

## Fotos de referência

```bash
higgsfield upload create ./hero.png      # UMA por vez. Devolve id.
```

A imagem-âncora (FUNDAMENTALS.md) sobe uma vez e o id reentra em `--image` (stills) ou `--start-image` (I2V). Confirme o nome da flag no `model get`.

## Gerar — still

Shape de exemplo. Troque `<still-id>` pelo id que `model list` devolveu para a família escolhida:

```bash
higgsfield generate create <still-id> --prompt "<prompt>" --aspect_ratio 16:9 --wait --json
```

`--image` / `--soul-id` / `--quality` / `--resolution` só entram se `model get` listar. Nano Banana Pro: teto de referências e resolução vêm do schema vivo.

## Gerar — vídeo I2V

Shape de exemplo (substitua ids e flags pelo schema vivo):

```bash
higgsfield generate create <kling-id> \
  --prompt "<prompt>" --start-image ./first.png \
  --duration 5 --wait --json

higgsfield generate create <seedance-id> \
  --prompt "<prompt>" --start-image ./a.png --end-image ./b.png \
  --duration 5 --wait --json
```

Áudio: leia o schema. Kling costuma usar `--sound on|off`. Seedance e Marketing Studio costumam usar `--generate_audio true|false`. Não misture uma flag de uma família na outra. Passe a flag de mute/áudio **sempre**; o default vivo está no `model get`.

## Gerar — Marketing Studio (UGC / product ad)

```bash
higgsfield generate create marketing_studio_video \
  --prompt "$(cat prompt.txt)" \
  --image <upload_id_ou_path> \
  --mode ugc --duration 15 --aspect_ratio 9:16 --resolution 720p \
  --generate_audio true --wait --wait-timeout 25m --json
```

Modos: confirme o enum em `higgsfield model get marketing_studio_video`. Click-to-Ad: `--url`. `higgsfield marketing-studio` lista avatares/produtos; o MP4 sai de `generate create marketing_studio_video`. Shape seguro desta casa: 1 imagem + 15s.

## Soul ID

```bash
higgsfield soul-id create --name alice --soul-2 \
  --image ./a1.jpg --image ./a2.jpg --image ./a3.jpg --image ./a4.jpg --image ./a5.jpg
higgsfield soul-id wait <soul_id>
higgsfield generate create <soul-still-id> --prompt "..." --soul-id <soul_id> --wait
```

`--image` no create: confirme o intervalo em `soul-id create --help` (piso desta casa: no mínimo 5). `--soul-2` vs `--soul-cinematic` são treinos separados; um personagem de um não entra no outro.

## Reframe / dubbing / voice-change

```bash
higgsfield generate workflow reframe --video ./source.mp4 --aspect-ratio 9:16 --resolution 720p --wait --json
higgsfield generate workflow dubbing --video ./source.mp4 --target_language por --wait
higgsfield generate workflow voice-change --video ./source.mp4 --voice_type preset --voice_id <id> --wait
```

Confirme flags em `higgsfield workflow list` / `generate workflow <name> --help`.

## Monitorar

```bash
higgsfield generate list --json
higgsfield generate get <job_id> --json
higgsfield generate wait <job_id>
higgsfield model get <model>
```

## Gotchas

- `@token` no prompt quebra o CLI. Fotos entram por `--image` / `--start-image`.
- Shape seguro no Marketing Studio: 1 imagem + 15s.
- `upload create` aceita 1 arquivo por vez.
- `Invalid values: aspect_ratio=…` → use o enum de `model get`.
- Speak/Lipsync: a GUI pode ter Lipsync Studio. O CLI só tem speak se `model list` / `workflow list` desta execução listar. Se não houver, use I2V com áudio nativo.

## Prompt-craft

Camadas: referências (flags de mídia) → setup visual → ação+diálogo → specs (`Camera:`, `Sound design:`, `Mood:`). Um movimento de câmera por clipe, verbo concreto. Fala: voz calma, cláusula de enunciação (método de roteiro neste squad).

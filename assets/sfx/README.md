# Efeitos sonoros

O índice desta pasta tem 102 efeitos CC0 em 28 categorias (`whoosh/`, `swish/`, `impact/`, `riser/`, `pop-ui/`, `ding/` e outras), vindos da biblioteca do editonny com a licença lida item a item. Fonte, autor e licença de cada som estão em `LICENSES.md` e `CREDITS.md`, e o índice com duração, segundo do impacto (`anchor_s`), pico e SHA-256 está em `index.json`.

Desde 1.6.0, 15 deles vêm no squad como kit inicial (os papéis, `swish-3` e o primeiro item de 11 categorias). Os outros 87 vêm com `bun lib/edit-engine/cli.ts library pull --sfx`, conferidos pelo SHA-256, para `~/.nirvana/cache/editai/sfx/`, fora do squad.

No spec, o efeito é escolhido pelo nome, não pelo caminho:

```json
{ "src": "@sfx:whoosh", "at": 2.5, "gain_db": -7, "hook": "whoosh", "anchor": true }
```

- `@sfx:whoosh`, `@sfx:hit` e `@sfx:riser` são papéis: `whoosh-4`, `impact-2` e `riser-3`.
- `@sfx:<categoria>` pega o primeiro item disponível da categoria (no squad ou no cache); `@sfx:<id>` pega um item, como `@sfx:swish-3`.
- `anchor: true` faz o impacto audível cair no segundo `at`, porque o arquivo começa `anchor_s` antes.
- `bun lib/edit-engine/cli.ts library sfx` lista tudo e marca o que falta baixar com `[pull]`.

## Fallback sintetizado

Os três `*-synth.wav` da raiz foram sintetizados pelo próprio ffmpeg (`bun lib/edit-engine/cli.ts sfx-synth`) e são do squad. Eles entram no lugar dos papéis quando o arquivo da biblioteca falta, por exemplo numa cópia enxuta do squad:

| Arquivo | Papel | Pico | Como é feito |
|---|---|---|---|
| `whoosh-synth.wav` | `whoosh` | 0,3 s | ruído rosa com envelope sin², passa-faixa 350 a 4200 Hz, phaser |
| `hit-synth.wav` | `hit` | 0,0 s | senoide caindo de 62 para ~30 Hz com decaimento rápido mais um clique de ruído |
| `riser-synth.wav` | `riser` | 1,5 s | varredura 200 → 1200 Hz com volume subindo |

## Para acrescentar um som

Só entra som com licença que permita redistribuir (CC0 ou equivalente), registrado em `index.json`, `LICENSES.md` e `CREDITS.md` com fonte, autor, licença e data. Meça o pico antes (`ffmpeg -i x.wav -af ebur128=peak=true -f null -`).

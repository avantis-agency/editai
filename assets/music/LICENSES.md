# Licenças: música

Importada em 2026-10-20 da biblioteca do editonny 1.0.0 (`visuals/library/music/`), sem alterar os arquivos (SHA-256 de cada um em `index.json`). Nada foi baixado da internet.

Base da licença: o `catalog.json` do editonny declara "CC0 1.0 (public domain); attribution is not required." para o catálogo inteiro (não há campo de licença por faixa) e o `visuals/README.md` do editonny diz que a música HoliznaCC0 e FreePD é CC0. As tags ID3 das faixas FreePD trazem "FreePD Music" e "Public Domain". A licença não foi conferida na página de origem de cada faixa (sem internet nesta importação).

CC0 1.0 é dedicação ao domínio público: uso, alteração e redistribuição, inclusive comercial, sem exigir atribuição. Os créditos ficam em `CREDITS.md` por cortesia e rastreabilidade.

Entraram 23 de 23 faixas no índice. Nenhuma faixa do editonny ficou de fora.

Fora do índice por decisão do autor: a faixa "Biscuit" (lukrembo), usada numa prova de teste interna, porque a licença não foi confirmada.

## Kit inicial e `library pull` (desde 1.6.0)

Para o squad ficar leve, só 11 faixas vêm dentro dele, como kit inicial: em cada clima, a faixa padrão (a primeira de `moods` no `index.json`) e a mais curta das outras; hiphop tem uma só. Elas estão recodificadas em AAC 96 kbps (`.m4a`) a partir dos originais de 320 kbps, sem corte e sem outra mudança. A CC0 permite essa obra derivada. O `index.json` guarda, por faixa do kit, o arquivo, o SHA-256 da versão do kit e o SHA-256 do original de onde ela saiu.

As 23 faixas originais vêm com `bun lib/edit-engine/cli.ts library pull --music` do repositório público do editonny (https://github.com/soumatheusgomes/editonny), fixado no commit `05d3dedcddcf6717001b0a3ef91411ec08f614d4` (`config/library.json`), nos caminhos do `music/catalog.json` dele. Cada arquivo baixado é conferido contra o SHA-256 do `index.json` e vai para `~/.nirvana/cache/editai/music/`, nunca para dentro do squad. Quando o original está no cache, o motor usa ele no lugar da versão do kit. Os 23 originais desse commit são iguais byte a byte aos importados em 2026-10-20.

The squad ships 11 tracks as a starter kit (the default plus the shortest other track per mood, transcoded to AAC 96 kbps, which CC0 allows). `library pull --music` downloads the 23 CC0 originals from editonny at commit `05d3ded`, checks each against the SHA-256 in `index.json` and stores them in `~/.nirvana/cache/editai/music/`; a cached original is used instead of its kit version.

| Id | Título | Clima | Autor | Licença | Fonte |
|---|---|---|---|---|---|
| `chill-beat-city-in-the-rearview` | City In The Rearview | chill-beat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `chill-beat-opinions` | Opinions | chill-beat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `chill-beat-old-age` | Old Age | chill-beat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `chill-beat-dream-pop` | Dream Pop | chill-beat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `chill-beat-autumn` | Autumn | chill-beat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `groove-sleep` | Sleep | groove | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `groove-make-money` | Make Money | groove | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `groove-make-love` | Make Love | groove | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `groove-make-funk` | Make Funk | groove | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `upbeat-poor-but-happy` | Poor, But Happy | upbeat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `upbeat-blue-skies` | Blue Skies | upbeat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `upbeat-letting-go-of-the-past` | Letting Go Of The Past | upbeat | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-first-snow` | First Snow | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-laundry-on-the-wire` | Laundry On The Wire | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-windows-down` | Windows Down | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-glad-to-be-stuck-inside` | Glad To Be Stuck Inside | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-vintage` | Vintage | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-morning-coffee` | Morning Coffee | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-ghosts` | Ghosts | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `calm-so-broke` | So Broke | calm | HoliznaCC0 | CC0 1.0 | opengameart.org (HoliznaCC0) |
| `emotional-dreamy-piano-fantasy` | Dreamy Piano Fantasy | emotional | Rafael Krux, CinematicWaves.com | CC0 1.0 | FreePD.com via archive.org/details/freepd |
| `emotional-emotional-piano` | Emotional Piano | emotional | Rafael Krux, CinematicWaves.com | CC0 1.0 | FreePD.com via archive.org/details/freepd |
| `hiphop-hip-hop-driver` | Hip Hop Driver | hiphop | Frank Nora | CC0 1.0 | FreePD.com via archive.org/details/freepd |

---

# Licenses: music (EN)

Imported on 2026-10-20 from the editonny 1.0.0 library, files unchanged (SHA-256 in `index.json`), nothing downloaded. editonny's `catalog.json` declares "CC0 1.0 (public domain); attribution is not required." for the whole catalog and its `visuals/README.md` states that the HoliznaCC0 and FreePD music is CC0. Not re-checked at each track's origin page. "Biscuit" (lukrembo) is deliberately not included: its license was not confirmed.

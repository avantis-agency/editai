# Direção de voz (compartilhado)

A fala é o que segura o espectador. Take bonito com voz morta não retém ninguém, e o
defeito não se conserta na montagem.

## Fala nativa, nunca TTS colado

A fala vai **dentro do prompt de geração**, entre aspas, e o áudio sai nativo com
lip-sync. Nunca gere um take mudo e mux e um TTS de sistema por cima: o lip-sync não
bate, o timbre destoa e a peça inteira parece amadora.

```
SPEAKER: <quem fala, tom>
SPEECH: "linha exata em PT-BR, entre aspas"
```

Cena em inglês, **fala entre aspas no idioma final**. Para PT-BR, peça explicitamente
vogais abertas e R brasileiro, e proíba sotaque PT-PT, espanhol ou inglês — o modelo
escorrega para lá quando a linha é curta.

## Prepare a fala foneticamente antes de gerar

O modelo lê o texto como texto. Sigla, marca, número e unidade saem errados — e o erro só
aparece na peça pronta, quando já custou crédito. Escreva **como soa**, não como se
escreve:

| Escrito | Na fala |
|---|---|
| `IA` | "inteligência artificial" |
| `R$ 500.000` | "quinhentos mil reais" |
| `PMOC` | "pemóque" (sigla que virou palavra) |
| `AC` | "á-cê" (sigla soletrada) |
| `SaaS` | "sés" ou "software como serviço" — decida e fixe |
| `24h` | "vinte e quatro horas" |

A decisão que importa em toda sigla: **é palavra ou é soletrada?** Escolha uma, escreva
como soa, e mantenha igual em todos os episódios — o espectador percebe a troca.

Nomes de marca e estrangeirismos entram do mesmo jeito. E prefira a palavra em português
quando ela existe: "prejuízo" no lugar de "downside" não é purismo, é o ouvido do
espectador não tropeçar.

## Dirija por verbos, não por adjetivos

"Seja mais energética" não muda nada. O modelo responde a **ação**:

| Em vez de | Dirija |
|---|---|
| "mais animada" | "acelera na segunda frase, sobe no fim" |
| "mais séria" | "segura a pausa antes do número, baixa o volume" |
| "mais natural" | "respira antes da frase, engole a última sílaba" |
| "com autoridade" | "afirma sem subir no fim — ponto final, não interrogação" |

Guarde a direção em `voice-performance-notes.md` junto do `voice-seed.json`. O seed
mantém o timbre entre episódios; as notas mantêm a interpretação.

## Ritmo se ajusta no pós, não no pedido

Se a fala saiu lenta, **acelere na edição**. Pedir pressa ao modelo no take bruto
degrada a dicção e a naturalidade — sai atropelado, não ágil.

## Anti-padrões

- Mux de `say` / TTS de sistema em cima de vídeo mudo
- Pedir "fale mais rápido" no prompt em vez de acelerar no pós
- Voz monótona de audiobook, ou o oposto: locução de propaganda
- Trocar o `voice-seed` entre takes do mesmo episódio
- Confiar no lip-sync para o texto ser entendido — legenda queimada sempre

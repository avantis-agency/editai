# Continuidade e corte (compartilhado)

Duas mecânicas decidem se uma sequência de takes vira um vídeo ou vira uma colagem: como
o take seguinte herda o anterior, e onde o silêncio é removido.

## Corte novo é o padrão — plano-sequência é a exceção

Um take gerado é uma peça curta (tipicamente 10–12s). O padrão de montagem é o mesmo do
cinema: **take novo é corte novo**, e corte novo pode — e muitas vezes deve — ser outra
câmera, outro plano, outro ângulo. Isso não é perda de continuidade; é linguagem.

Quem sustenta a identidade entre cortes é a **bíblia do personagem** (o identity kit),
não o frame anterior. Envie sempre as imagens da bíblia na geração de cada take.

### Quando usar last-frame: só para plano-sequência

O encadeamento por last frame existe para **um** caso: quando a cena precisa ler como um
**plano-sequência contínuo** mais longo do que o modelo entrega num clipe único. Aí o
último frame do take N vira entrada do take N+1, e o corte fica invisível.

Fora desse caso, encadear por last frame só acumula degradação sem ganho — o corte para
uma câmera nova resolve melhor e sai mais limpo.

**Quando encadear, o last frame vai JUNTO com as imagens da bíblia, nunca sozinho.**
Sozinho, ele vira a única âncora do rosto — e como ele degrada, a sequência degrada com
ele. Com a bíblia junto, o frame carrega a continuidade de pose e luz enquanto a bíblia
segura a identidade.

### O last frame degrada — trate antes de reusar

Quando for encadear:

1. Extraia o frame **~0,3s antes do fim**, nunca o último pixel — o fim é onde a
   degradação se concentra.
2. **QA de visão** nesse frame: reprove se houver aura, halo, glow, blur sobrenatural ou
   qualquer coisa não fotográfica.
3. Se reprovar, **não insista no encadeamento**: use um still limpo da bíblia como
   keyframe, ou simplesmente corte para uma câmera nova. Continuidade de rosto vale mais
   que continuidade de pose.
4. Guarde o frame reprovado como prova; mantenha o canônico limpo.

**Nunca regenere o rosto do zero** — nem entre cortes, nem dentro de uma sequência. As
variações saem da bíblia via edição de imagem.

### Prompt anti-degradação

Inclua sempre na geração:

```
NO glow, NO orange aura, NO halo around hair or body, NO magical rim light,
clean natural studio lighting, sharp realistic hair edges, photoreal only.
```

### QA de visão após cada take

```bash
ffmpeg -ss 0.2 -i take.mp4 -frames:v 1 qa-t0.jpg
ffmpeg -ss 2.0 -i take.mp4 -frames:v 1 qa-t2.jpg
# leia os dois com visão; se reprovar, regenere com o prompt anti-degradação
```

Sem PASS no frame 0 e no ~2s, o take não entra no master.

## Corte — remover todos os silêncios

O take bruto tem silêncio no meio e na cauda. Concatenar bruto entrega personagem parada
entre falas, e é o que faz um vídeo de 60s parecer de três minutos.

**A regra: remova todos os vãos sem fala**, não só a cauda. O ritmo vem daí.

Cuidados que separam corte bom de fala mutilada:

- **Detecte por ausência de fala, não por volume absoluto.** Vento, ar-condicionado e
  ruído de sala enganam um limiar de dB puro; o corte tem que ser imune a som ambiente.
- **Pad depois da última sílaba** (~0,25–0,30s) antes de fechar cada trecho. Corte justo
  come o fim da palavra, e o ouvido percebe na hora.
- **Não corte no meio de uma palavra.** Pausa curta dentro da frase é respiração, não vão.
- **Nunca use `-ss` cego para "pular o começo".** O início do take é onde a fala começa;
  saltar ali corta a primeira sílaba.

Script canônico: `scripts/post-kit/cortar-mudos.py` (junta na ordem dada e, opcionalmente,
acelera). QA depois: `scripts/post-kit/qa-audio.sh`.

## Emenda

- Corte seco depois do trim, por padrão.
- Crossfade de 4–6 frames só quando o corte "pula" o rosto de forma perceptível.
- Infográfico entra entre blocos de fala, sem pad extra além do que o design pede.

## QA de montagem

- [ ] Nenhum vão sem fala sobrando além do pad
- [ ] Duração total ≈ soma das falas + infográficos, não N × duração bruta
- [ ] Keyframe de cada take = frame aprovado do anterior, ou still do identity kit
- [ ] Áudio nativo presente em todos os trechos (nenhum trecho mudo publicado)

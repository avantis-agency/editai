# Palavras de risco em PT-BR para voz de IA (TTS) — e a técnica por categoria

A TTS (Higgsfield `generate_audio`, e em menor grau HeyGen) erra em **padrões previsíveis**. Antes
de mandar gerar, varra o roteiro procurando estas categorias e aplique a técnica correspondente.

> **As duas técnicas-base:**
> 1. **Escrever foneticamente** na fala (como soa, não como se grafa).
> 2. **Cláusula de enunciação** no fim do prompt nomeando as palavras difíceis, **grafia normal**:
>    `speak the words "X", "Y", "Z" clearly and fully, every syllable.` — **nunca com hífen**.
>    (Hífen backfira no Higgsfield: gagueira/alucinação.)

## 1. Siglas e acrônimos — decida: fala-se como PALAVRA ou SOLETRADO?
A IA erra nas duas direções. Defina e escreva como soa.
- **Como palavra:** PMOC→"pemóque", ABRAVA→"abráva", ANVISA→"anvísa", PIX→"piks", SAC→"saqui", SEBRAE→"sebrái".
- **Soletrada:** AC→"á-cê", CNPJ→"cê-êne-pê-jóta", CPF→"cê-pê-éfi", CEP→"sépi", CRM→"cê-érre-eme", KPI→"kei-pi-ai", ROI→"rô-i" ou "érre-ó-i", S.A.→"sociedade anônima".
- **Mistas/técnicas:** CREA→"crê-a", ART→"á-érre-tê", ICMS→"i-cê-eme-ése", IPTU→"i-pê-tê-u", FGTS, INSS, CLT, MEI→"mei", LTDA→"limitada".
> Regra: na dúvida do que o público fala, escreva a forma falada e teste (QA com whisper medium).

## 2. Nomes de marca / produto
Letras, grafia incomum, mixed-case ou estrangeira quebram. Escreva a pronúncia desejada.
- AC→"á-cê"; nomes com "x/h/w/y"; marcas em inglês (decida PT ou inglês: "Nike"→"náiki").
- Sempre coloque a marca na **cláusula de enunciação**.

## 3. Palavras técnicas longas / proparoxítonas → SÍLABA ENGOLIDA
Multissílabas e proparoxítonas: a voz atropela e come sílaba (pior se pediram ritmo rápido).
- síndico→"singta", auditoria→"autoria", engenheiro→"engenhetro", laudo→"lau", índice, vínculo,
  câmara, ônibus, médico, prático, fôlego.
- **Técnica:** dicção calma + cláusula de enunciação nomeando-as. (Não hifenize.)

## 4. Nasais e plurais em -ões / -ção / -ções
Som nasal complexo some no fim.
- fiscalização(ões), regularização, climatização, manutenção, conformidade, obrigatoriedade,
  habitação, condomínio, instalação, certidão→certidões, condição→condições.
- **Técnica:** cláusula de enunciação; se persistir, regenere (best-of-N) ou HeyGen.

## 5. Números, valores, datas, leis, unidades → ESCREVA POR EXTENSO
A IA confunde dígitos/símbolos.
- R$ 1.500.000 → "um milhão e quinhentos mil reais"; R$45 → "quarenta e cinco reais".
- Lei 13.589 → "lei treze mil quinhentos e oitenta e nove"; 13% → "treze por cento".
- 60.000 BTU → "sessenta mil B-T-Us" (ou "BTUs" como soa); m²→"metros quadrados"; °C→"graus";
  km/h→"quilômetros por hora"; nº→"número"; datas → por extenso ("cinco de maio").
- Telefones/CEP → por grupos falados, não dígito cru.

## 6. Estrangeirismos no meio do PT
A TTS pode anglicizar errado ou ler com fonética PT.
- marketing→"márqueting", design→"dizáin", deploy→"deplói", online→"on-láini", checkout→"tchéc-aut",
  link→"linki", feed→"fíd", stories→"estóris", upgrade, e-mail→"i-meiu", site→"sáiti".
- **Técnica:** escreva a forma falada que você quer; mantenha consistência.

## 7. Abreviações e símbolos
Expanda na fala.
- Dr.→"doutor", Sr./Sra.→"senhor/senhora", Av.→"avenida", R.→"rua", etc.→"etcétera",
  ex.→"por exemplo", & → "e", % → "por cento", + → "mais".

## 8. Homógrafos (acento muda o sentido/som)
Garanta o acento certo na grafia, ou a IA escolhe o errado.
- secretária / secretaria; sábia / sabia / sabiá; fábrica / fabrica; “está/esta”.

## Checklist rápido (Roteirista, antes do handoff)
- [ ] Toda **sigla** decidida (palavra vs soletrada) e escrita foneticamente
- [ ] **Marca/produto** com pronúncia definida e na cláusula de enunciação
- [ ] **Técnicas longas / -ção / -ões** listadas na cláusula de enunciação
- [ ] **Números/valores/leis/unidades** por extenso
- [ ] **Estrangeirismos** com forma falada explícita
- [ ] Direção de voz **calma/clara** (nunca "rápida"); velocidade só na pós

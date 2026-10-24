// Editor com IA (1.7.0): quick commands, resolved by the engine itself, without AI and at once.
// A request that is one of these patterns (PT or EN, with or without accents, a few word orders)
// becomes operations of the closed set in live-ops.ts; anything else goes to the person's agent.
// Pure functions: the request text is only matched, never run. Bun only.
import { styleNow } from "./live-ops.ts";
import type { Feedback } from "./feedback.ts";
import type { EditSpec } from "./spec.ts";

export interface QuickCtx {
  cursor: number;
  selection: { start: number; end: number } | null;
  cur: EditSpec;           // current video (every saved change applied, words with src_index)
  base: EditSpec;          // reviewed spec
  fb: Feedback | null;
}
export type QuickResult =
  | { kind: "ops"; cmd: string; ops: Record<string, unknown>[]; say: string }
  | { kind: "undo"; cmd: string }
  | { kind: "ask"; cmd: string; question: string }
  | { kind: "fail"; cmd: string; message: string };

type W = { word: string; start: number; end: number; emphasis?: boolean; src_index?: number };

/** Lower case, no accents, punctuation as spaces (quotes kept apart), single spaces. */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}
const wordKey = (w: string) => norm(w).replace(/-/g, "");
const has = (n: string, words: string[]) => words.some((w) => new RegExp(`(^| )${w}( |$)`).test(n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const fmtS = (s: number) => `${(Math.round(s * 100) / 100).toLocaleString("pt-BR")} s`;
const fmtDb = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("pt-BR")} dB`;

const REMOVE = ["tira", "tirar", "tire", "tiar", "remove", "remover", "remova", "corta", "cortar", "corte", "apaga", "apagar", "apague", "elimina", "eliminar", "deleta", "deletar", "sem", "delete", "cut", "kill", "drop", "trim", "rip"];
const PAUSE = ["pausa", "pausas", "pausinha", "silencio", "silencios", "respiro", "respirada", "buraco", "vacuo", "vazio", "pause", "pauses", "silence", "gap", "gaps", "dead air"];
const STRETCH = ["trecho", "parte", "pedaco", "isso", "isto", "selecao", "selecionado", "daqui", "aqui ate", "this", "section", "part", "selection", "selected", "bit", "segment"];
const CAPTION = ["legenda", "legendas", "caption", "captions", "subtitle", "subtitles", "sub", "subs"];
const HEADLINE = ["headline", "titulo", "chamada", "manchete", "hook", "texto de cima", "title", "headline text"];
const BIGGER = ["maior", "aumenta", "aumentar", "aumente", "grande", "maiores", "bigger", "larger", "increase", "enlarge", "up size"];
const SMALLER = ["menor", "diminui", "diminuir", "diminua", "reduz", "reduzir", "reduza", "pequena", "pequeno", "menores", "smaller", "decrease", "shrink"];
const UP = ["sobe", "subir", "suba", "mais pra cima", "mais para cima", "pra cima", "para cima", "move up", "higher", "up"];
const DOWN = ["desce", "descer", "desca", "mais pra baixo", "mais para baixo", "pra baixo", "para baixo", "move down", "lower", "down"];
const MUSIC = ["musica", "musicas", "trilha", "som de fundo", "fundo musical", "music", "soundtrack", "bgm", "background music"];
const LOUDER = ["mais alta", "mais alto", "aumenta", "aumentar", "aumente", "sobe", "subir", "suba", "louder", "turn up", "mais forte", "alta", "up"];
const QUIETER = ["mais baixa", "mais baixo", "abaixa", "abaixar", "abaixe", "diminui", "diminuir", "diminua", "baixa", "baixinho", "baixinha", "quieter", "lower", "turn down", "mais fraca", "mais fraco", "softer", "down"];
const OFF = ["sem", "tira", "tirar", "tire", "remove", "remover", "desliga", "desligar", "desligue", "mute", "muta", "no", "off", "corta", "cortar", "kill"];
const ON = ["com", "poe", "por", "coloca", "colocar", "coloque", "liga", "ligar", "ligue", "volta", "voltar", "add", "on", "bota", "botar", "traz", "put"];
const WHOOSH = ["whoosh", "woosh", "swoosh", "vush", "vuch", "whooshes", "uuush", "fiu"];
const ZOOM = ["zoom", "zum", "zoon", "zoomzinho", "aproxima", "aproximar", "punch", "punch in", "punch-in", "close"];
const HERE = ["aqui", "agora", "nesse ponto", "neste ponto", "nesse momento", "neste momento", "nesse trecho", "neste trecho", "here", "now", "this moment", "this point"];
const CONDITION = ["quando", "sempre que", "toda vez", "depois que", "antes de", "enquanto", "assim que", "when", "whenever", "while", "as soon as", "fala", "diz", "falar", "says", "say"];
const MOODS = ["calm", "calma", "calmo", "chill", "groove", "upbeat", "animada", "animado", "emocional", "emotional", "hiphop", "hip hop", "outra", "outro", "another", "different", "diferente"];

/** The help shown in the page ("o que eu posso pedir"), in the order people need it. */
export const QUICK_HELP: { say: string; does: string }[] = [
  { say: "tira essa pausa", does: "com o cursor na pausa: corta o silêncio entre duas palavras (com um trecho selecionado, todas as pausas dele)" },
  { say: "corta esse trecho", does: "corta o trecho selecionado na linha do tempo (arraste numa faixa para selecionar)" },
  { say: "legenda maior · legenda menor", does: "tamanho da legenda, de 10 em 10 %" },
  { say: "sobe a legenda · desce a legenda", does: "posição da legenda" },
  { say: "headline maior · headline menor", does: "tamanho da headline (80 a 120 %)" },
  { say: "legenda clássica · legenda bold", does: "estilo da legenda" },
  { say: "headline fixa · headline só no começo", does: "headline no vídeo todo ou só nos 3 primeiros segundos" },
  { say: "troca X por Y", does: "troca uma palavra da legenda (todas as vezes que ela aparece, ou só na seleção)" },
  { say: "destaca X · tira o destaque de X", does: "palavra da legenda em amarelo, ou sem" },
  { say: "música mais alta · música mais baixa", does: "volume da música, de 3 em 3 dB" },
  { say: "sem música · com música", does: "desliga ou liga a música" },
  { say: "tira o whoosh · põe o whoosh", does: "whoosh nas trocas de take" },
  { say: "zoom aqui", does: "zoom no cursor (com um trecho selecionado: punch-in no trecho)" },
  { say: "desfaz", does: "desfaz o último pedido feito" },
];

const capPct = (fb: Feedback | null) => ([...(fb?.ops ?? [])].reverse().find((o) => o.op === "caption_size") as { pct: number } | undefined)?.pct ?? 100;

/** Caption words whose text matches `w` (case, accents and punctuation ignored), optionally inside the selection. */
function findWords(ctx: QuickCtx, w: string): W[] {
  const key = wordKey(w);
  if (!key) return [];
  const sel = ctx.selection;
  return ((ctx.cur.captions?.words ?? []) as W[]).filter((x) => wordKey(x.word) === key && (!sel || (x.end > sel.start && x.start < sel.end)));
}

/** The silence to cut: the gap between two words at (or nearest to) the cursor, or every gap in the selection. */
function pauses(ctx: QuickCtx): { cuts: [number, number][]; why?: string } {
  const words = (ctx.cur.captions?.words ?? []) as W[];
  if (!words.length) return { cuts: [], why: "Este vídeo não tem a legenda com o tempo das palavras, então não acho a pausa sozinho. Selecione o silêncio na linha do tempo e peça \"corta esse trecho\"." };
  const fps = ctx.cur.canvas.fps, D = ctx.cur.duration;
  const up = (t: number) => Math.ceil(t * fps - 1e-6) / fps, down = (t: number) => Math.floor(t * fps + 1e-6) / fps;
  const gaps: { a: number; b: number; from: number; to: number }[] = [];
  // before the first word, between words, after the last word; keep 0.1 s after a word and 0.05 s before the next
  gaps.push({ from: 0, to: words[0].start, a: 0, b: down(words[0].start - 0.05) });
  for (let k = 0; k + 1 < words.length; k++) gaps.push({ from: words[k].end, to: words[k + 1].start, a: up(words[k].end + 0.1), b: down(words[k + 1].start - 0.05) });
  gaps.push({ from: words[words.length - 1].end, to: D, a: up(words[words.length - 1].end + 0.1), b: down(D) });
  const usable = gaps.filter((g) => g.b - g.a >= 0.08 - 1e-6);
  const sel = ctx.selection;
  if (sel) {
    const inSel = usable.filter((g) => g.from < sel.end && g.to > sel.start && g.to - g.from >= 0.2)
      .map((g) => ({ ...g, a: Math.max(g.a, up(sel.start)), b: Math.min(g.b, down(sel.end)) })).filter((g) => g.b - g.a >= 0.08 - 1e-6);
    if (!inSel.length) return { cuts: [], why: "Não achei pausa de pelo menos 0,2 s no trecho selecionado." };
    return { cuts: inSel.map((g) => [r3(g.a), r3(g.b)] as [number, number]) };
  }
  const t = ctx.cursor;
  const at = usable.find((g) => t >= g.from - 0.06 && t <= g.to + 0.06);
  const near = at ?? usable.map((g) => ({ g, d: Math.min(Math.abs(t - g.from), Math.abs(t - g.to)) })).filter((x) => x.d <= 1).sort((x, y) => x.d - y.d)[0]?.g;
  if (!near) {
    const tiny = gaps.find((g) => t >= g.from - 0.06 && t <= g.to + 0.06);
    return { cuts: [], why: tiny ? `A pausa no cursor (${fmtT(t)}) tem só ${fmtS(tiny.to - tiny.from)}; não dá para cortar sem pegar a fala.` : `Não achei pausa perto do cursor (${fmtT(t)}). Ponha o cursor no silêncio entre duas palavras e peça de novo.` };
  }
  return { cuts: [[r3(near.a), r3(near.b)]] };
}

/** One request text -> a quick command, or null when it is for the agent. */
export function quickCommand(text: string, ctx: QuickCtx): QuickResult | null {
  const n = norm(text);
  if (!n) return null;
  const wordsN = n.split(" ").length;
  if (/^(desfaz|desfazer|desfaca|desfaz isso|desfaz o ultimo|desfaz o ultimo pedido|volta|voltar|volta isso|undo|undo that|undo it|ctrl z|ctrlz)$/.test(n)) return { kind: "undo", cmd: "undo" };
  if (has(n, CONDITION) || wordsN > 14) return null;

  const hits: (() => QuickResult)[] = [];
  const isCaption = has(n, CAPTION), isHeadline = has(n, HEADLINE), isMusic = has(n, MUSIC), isWhoosh = has(n, WHOOSH);

  // pause
  const isPause = has(n, PAUSE) && (has(n, REMOVE) || wordsN <= 3);
  if (isPause) hits.push(() => {
    const p = pauses(ctx);
    if (!p.cuts.length) return { kind: "fail", cmd: "pause", message: p.why! };
    const total = p.cuts.reduce((s, [a, b]) => s + (b - a), 0);
    const ops = [...p.cuts].sort((x, y) => y[0] - x[0]).map(([a, b]) => ({ op: "cut", start: a, end: b }));
    const say = p.cuts.length === 1 ? `Pausa de ${fmtS(total)} tirada em ${fmtT(p.cuts[0][0])}` : `${p.cuts.length} pausas tiradas (${fmtS(total)} no total) entre ${fmtT(p.cuts[0][0])} e ${fmtT(p.cuts[p.cuts.length - 1][1])}`;
    return { kind: "ops", cmd: "pause", ops, say };
  });

  // cut the selected stretch
  if (!isPause && has(n, REMOVE) && has(n, STRETCH) && !isCaption && !isHeadline && !isMusic && !isWhoosh && !has(n, ZOOM)) hits.push(() => {
    const s = ctx.selection;
    if (!s) return { kind: "ask", cmd: "cut", question: "Qual trecho? Arraste numa faixa da linha do tempo para selecionar e peça de novo." };
    return { kind: "ops", cmd: "cut", ops: [{ op: "cut", start: s.start, end: s.end }], say: `Trecho de ${fmtS(s.end - s.start)} cortado em ${fmtT(s.start)}` };
  });

  // caption style (before size: "palavra que cresce" is a style)
  const classic = isCaption && has(n, ["classica", "classico", "classic", "normal", "simples", "tradicional"]);
  const bold = isCaption && (has(n, ["bold", "negrito", "bold word", "bold-word", "boldword", "impacto"]) || n.includes("palavra que cresce"));
  if (classic !== bold) hits.push(() => ({ kind: "ops", cmd: "caption_style", ops: [{ op: "caption_style", preset: classic ? "classic" : "bold-word" }], say: classic ? "Legenda clássica" : "Legenda bold (palavra que cresce)" }));

  // caption size and position
  const bigger = has(n, BIGGER), smaller = has(n, SMALLER);
  if (isCaption && !isHeadline && classic === bold && bigger !== smaller) hits.push(() => {
    const now = capPct(ctx.fb), next = Math.max(70, Math.min(140, now + (bigger ? 10 : -10)));
    if (!ctx.cur.captions) return { kind: "fail", cmd: "caption_size", message: "Este vídeo não tem legenda." };
    if (next === now) return { kind: "fail", cmd: "caption_size", message: `A legenda já está no ${bigger ? "máximo" : "mínimo"} (${now} %).` };
    return { kind: "ops", cmd: "caption_size", ops: [{ op: "caption_size", pct: next }], say: `Legenda ${bigger ? "maior" : "menor"}: ${next} % do tamanho original` };
  });
  const up = has(n, UP), down = has(n, DOWN);
  if (isCaption && !isHeadline && !bigger && !smaller && up !== down) hits.push(() => {
    const c = ctx.cur.captions;
    if (!c) return { kind: "fail", cmd: "caption_move", message: "Este vídeo não tem legenda." };
    const H = ctx.cur.canvas.height, y = Math.max(Math.round(H * 0.45), Math.min(Math.round(H * 0.85), c.y + (up ? -80 : 80)));
    if (y === c.y) return { kind: "fail", cmd: "caption_move", message: `A legenda já está no limite ${up ? "de cima" : "de baixo"} da área segura.` };
    return { kind: "ops", cmd: "caption_move", ops: [{ op: "caption_move", y }], say: `Legenda ${up ? "mais para cima" : "mais para baixo"} (80 px)` };
  });

  // headline size and mode
  if (isHeadline && !isCaption && bigger !== smaller) hits.push(() => {
    const now = styleNow(ctx).headline_size_pct ?? 100, next = Math.max(80, Math.min(120, now + (bigger ? 10 : -10)));
    if (next === now) return { kind: "fail", cmd: "headline_size", message: `A headline já está no ${bigger ? "máximo" : "mínimo"} seguro (${now} %).` };
    return { kind: "ops", cmd: "headline_size", ops: [{ op: "headline", size_pct: next }], say: `Headline ${bigger ? "maior" : "menor"}: ${next} %` };
  });
  const fixed = isHeadline && has(n, ["fixa", "fixo", "o video todo", "video todo", "todo o video", "o tempo todo", "tempo todo", "sempre", "fixed", "whole video", "always", "all the time"]);
  const intro = isHeadline && has(n, ["so no comeco", "so no inicio", "no comeco", "no inicio", "comeco", "inicio", "3 primeiros", "tres primeiros", "primeiros segundos", "intro", "only at the start", "at the start", "first 3", "first three", "beginning"]);
  if (fixed !== intro && !bigger && !smaller) hits.push(() => ({ kind: "ops", cmd: "headline_mode", ops: [{ op: "headline", mode: fixed ? "fixed" : "intro" }], say: fixed ? "Headline no vídeo todo" : "Headline só nos 3 primeiros segundos" }));

  // replace a caption word: "troca X por Y"
  const rep = text.trim().match(/^(?:troca|trocar|troque|substitui|substituir|substitua|muda|mudar|mude|corrige|corrigir|corrija|replace|change|swap|fix)\s+(?:a palavra\s+|o\s+|a\s+|the word\s+|the\s+)?["“'‘]?([^\s"”'’]+)["”'’]?\s+(?:por|pra|para|pelo|pela|to|with|by|into)\s+["“'‘]?([^\s"”'’]+)["”'’]?[.!]?$/i);
  if (rep && findWords(ctx, rep[1]).length) hits.push(() => {
    const found = findWords(ctx, rep[1]);
    const ops = found.filter((w) => w.src_index !== undefined).map((w) => {
      const tail = (w.word.match(/[.,!?;:…]+$/u) ?? [""])[0];
      const head = rep[2].replace(/[.,!?;:…]+$/u, "");
      return { op: "caption_word", index: w.src_index, to: `${head}${tail}` };
    });
    return { kind: "ops", cmd: "caption_word", ops, say: `"${rep[1]}" trocado por "${rep[2]}" na legenda${ops.length > 1 ? ` (${ops.length} vezes)` : ` em ${fmtT(found[0].start)}`}` };
  });

  // keyword highlight: "destaca X", "deixa X em amarelo", "tira o destaque de X"
  const hiOff = text.trim().match(/^(?:tira|tirar|remove|remover|sem)\s+(?:o\s+)?(?:destaque|amarelo|highlight)\s+(?:de|da|do|em|no|na|from|on)\s+(?:a palavra\s+)?["“'‘]?([^\s"”'’]+)["”'’]?[.!]?$/i)
    ?? text.trim().match(/^(?:unhighlight)\s+["“'‘]?([^\s"”'’]+)["”'’]?[.!]?$/i);
  const hiOn = !hiOff && (text.trim().match(/^(?:destaca|destacar|destaque|realca|realça|realce|realçar|highlight|pinta|marca)\s+(?:a palavra\s+|the word\s+)?["“'‘]?([^\s"”'’]+)["”'’]?(?:\s+em amarelo|\s+de amarelo|\s+in yellow)?[.!]?$/i)
    ?? text.trim().match(/^(?:deixa|deixar|poe|põe|coloca|make)\s+["“'‘]?([^\s"”'’]+)["”'’]?\s+(?:em amarelo|de amarelo|em destaque|yellow|highlighted)[.!]?$/i));
  const hi = hiOff ?? hiOn;
  if (hi && findWords(ctx, hi[1]).length) hits.push(() => {
    const found = findWords(ctx, hi[1]).filter((w) => w.src_index !== undefined);
    const on = !hiOff;
    return { kind: "ops", cmd: "caption_emphasis", ops: found.map((w) => ({ op: "caption_emphasis", index: w.src_index, on })),
      say: `"${hi[1]}" ${on ? "em destaque (amarelo)" : "sem destaque"}${found.length > 1 ? ` (${found.length} vezes)` : ` em ${fmtT(found[0].start)}`}` };
  });

  // music
  if (isMusic && !isWhoosh && !has(n, MOODS)) {
    const louder = has(n, LOUDER) && !has(n, QUIETER), quieter = has(n, QUIETER);
    const off = !louder && !quieter && has(n, OFF), on = !louder && !quieter && !off && has(n, ON);
    if (louder || quieter) hits.push(() => {
      const s = styleNow(ctx);
      if (!ctx.base.audio.music) return { kind: "fail", cmd: "music_level", message: "Este vídeo não tem música." };
      if (!s.music_enabled) return { kind: "fail", cmd: "music_level", message: "A música está desligada. Peça \"com música\" antes." };
      const next = Math.max(-12, Math.min(6, s.music_gain_delta_db + (louder ? 3 : -3)));
      if (next === s.music_gain_delta_db) return { kind: "fail", cmd: "music_level", message: `A música já está no ${louder ? "máximo (+6 dB)" : "mínimo (−12 dB)"} do painel.` };
      return { kind: "ops", cmd: "music_level", ops: [{ op: "music", change_db: next - s.music_gain_delta_db }], say: `Música ${louder ? "mais alta" : "mais baixa"}: ${fmtDb(next - s.music_gain_delta_db)} (agora ${fmtDb(next)} do original)` };
    });
    else if (off) hits.push(() => ({ kind: "ops", cmd: "music_off", ops: [{ op: "music", enabled: false }], say: "Música desligada" }));
    else if (on && ctx.base.audio.music) hits.push(() => ({ kind: "ops", cmd: "music_on", ops: [{ op: "music", enabled: true }], say: "Música ligada" }));
  }

  // whoosh
  if (isWhoosh && !isMusic) {
    const off = has(n, OFF), on = !off && has(n, ON);
    if (off || on) hits.push(() => ({ kind: "ops", cmd: off ? "whoosh_off" : "whoosh_on", ops: [{ op: "whoosh", on }], say: off ? "Whoosh tirado das trocas de take" : "Whoosh nas trocas de take" }));
  }

  // zoom here
  if (has(n, ZOOM) && !isCaption && !isHeadline && !isMusic && (has(n, HERE) || wordsN <= 3 || /^(da|de|dar|faz|fazer|coloca|poe|bota|add|put)( um| uma| a)? (zoom|zum|zoon|punch in|punch-in|zoomzinho)( aqui)?$/.test(n))) hits.push(() => {
    const s = ctx.selection;
    if (s && s.end - s.start >= 0.2) {
      const until = Math.min(s.end, s.start + 8);
      return { kind: "ops", cmd: "punch_in", ops: [{ op: "punch_in", at: s.start, until }], say: `Punch-in de ${fmtT(s.start)} a ${fmtT(until)}` };
    }
    return { kind: "ops", cmd: "zoom", ops: [{ op: "zoom", at: ctx.cursor }], say: `Zoom em ${fmtT(ctx.cursor)}` };
  });

  if (hits.length !== 1) return null;   // none, or two things at once: the agent reads it
  return hits[0]();
}

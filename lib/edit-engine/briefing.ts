// Guided briefing: reads what the person already sent (message, audio
// transcript, files, reference), asks only what is missing (0 to 5 multiple
// choice questions, always with "outro"), suggests a plan and ends with
// "Posso editar?". The answers become a profile per client or project, saved
// in the user's project (never in the squad); next time the first question is
// "mesmo estilo da última vez?". Niche starting profiles live in
// templates/niches/. Deterministic, no AI: the edit-briefing-guide agent runs
// the conversation and may override any field it understood better. Bun only.
// First use (1.8.0): a project with no squad history, or a person who says it is
// the first time, gets a short welcome (welcome.md, state.first_use) before the
// questions of the same round; an ongoing session or a complete request gets none.
//
//   bun lib/edit-engine/cli.ts brief <input.json> [--project DIR] [--format ask|list]
//   bun lib/edit-engine/cli.ts brief <state.json> --answers "1=2,2=1" | --answers-json <file>
//   bun lib/edit-engine/cli.ts brief <state.json> --confirm [--adjust "mood=calm,text=captions"]
//
// input.json: { "client": "Clínica Sorriso", "text": "...", "transcript": "...", "material": ["clip.mp4"],
//               "references": ["ref.mp4" | "https://..."], "niche": "local-business",
//               "first_use": true | false, "session": "ongoing", "lang": "pt" | "en" }   (last three optional)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { appDir, appRoots, findProfile, hasProfile, profilePath, slug } from "./project.ts";
import { SQUAD_ROOT } from "./spec.ts";
import { pickTrack } from "./library.ts";
import { extractStyle, loadStyle, pt, type Mood, type StyleProfile } from "./style.ts";
import { probe } from "./measure.ts";

export type Field = "destination" | "format" | "mood" | "reference" | "text";
export interface Option { value: string; label: string; description: string }
export interface Question { id: Field | "same_profile" | "first_use"; header: string; question: string; options: Option[]; recommended: string }
export interface BriefInput { client: string; text?: string; transcript?: string; material?: string[]; references?: string[]; niche?: string; first_use?: boolean; session?: "new" | "ongoing"; lang?: string }
export interface History { folder: boolean; briefs: number; confirmed: number; profiles: number }
export interface FirstUse { status: "yes" | "no" | "ask"; reason: string; lang: "pt" | "en"; round: number; show_now: boolean; welcome: string | null; history: History }
/**
 * cleanup "none" (2.3.0): continuous, no cuts (sermon, service, "sem cortes"); canvas: output size; caption_preset "word":
 * one word at a time; caption_font: a font named in the message (the person supplies the file).
 */
export interface Known { destination?: string; format?: string; mood?: string; reference?: string; captions?: boolean; headline?: boolean; headline_text?: string;
  cleanup?: "standard" | "keep_pauses" | "off" | "none"; fit_s?: number; canvas?: "1080x1920" | "1920x1080" | "same-as-source"; caption_preset?: "word"; caption_font?: string }
export interface Niche { id: string; name: string; match: string[]; recommend: Partial<Record<Field, string>>; apply: Partial<StyleProfile["apply"]>; tips: string[] }
export interface BriefState {
  brief_version: 1; id: string; dir: string; project: string; client: string; created_at: string;
  input: BriefInput; niche: string | null; known: Known; sources: Record<string, string>; other: Record<string, string>;
  round: number; questions: Question[]; answers: Record<string, string>; profile_offered: boolean; profile_used: boolean; profile_known?: Known;
  reference_style: string | null; plan: Plan | null; confirmed: boolean; first_use?: FirstUse;
}
/** cleanup (2.2.0): the standard cleanup of every full edit (cli.ts cut), unless the person asked otherwise; fit_s: "caber em N segundos". */
export interface Plan { template: string; platforms: string[]; apply: StyleProfile["apply"]; headline_text: string | null; music_track: string | null; notes: string[]; markdown: string;
  cleanup?: "standard" | "keep_pauses" | "off" | "none"; fit_s?: number | null }

const OTHER: Option = { value: "other", label: "Outro", description: "escreva do seu jeito" };
const BANK: Record<Field, Omit<Question, "recommended">> = {
  destination: { id: "destination", header: "Destino", question: "Onde esse vídeo vai ser postado?", options: [
    { value: "reels_tiktok", label: "Reels / TikTok", description: "9:16 com as áreas seguras do Instagram e do TikTok" },
    { value: "youtube_shorts", label: "YouTube Shorts", description: "9:16 com a área segura do Shorts" },
    { value: "youtube_long", label: "YouTube longo", description: "16:9 deitado, com a área segura do player" },
    { value: "ad", label: "Anúncio", description: "criativo pago, gancho forte nos 3 primeiros segundos" },
    { value: "lesson", label: "Aula", description: "ritmo mais calmo e legenda clara" }, OTHER] },
  format: { id: "format", header: "Formato", question: "Qual é o formato do vídeo?", options: [
    { value: "talking_head", label: "Pessoa falando", description: "legenda palavra por palavra e headline" },
    { value: "text_only", label: "Só texto", description: "texto na tela sobre foto ou vídeo, sem fala" },
    { value: "app_screen", label: "Tela de app ou produto", description: "pessoa reagindo com a tela do app ou o produto" },
    { value: "comparison", label: "Comparação", description: "isto VS aquilo em tela dividida" },
    { value: "squad_choice", label: "Deixa o squad escolher", description: "o squad escolhe pelo material" }, OTHER] },
  mood: { id: "mood", header: "Clima", question: "Qual é o clima?", options: [
    { value: "calm", label: "Calmo", description: "cortes suaves, música calma baixinha" },
    { value: "energetic", label: "Energético", description: "cortes rápidos com zoom, música animada" },
    { value: "fun", label: "Divertido", description: "ritmo solto, música groove, efeitos leves" },
    { value: "premium", label: "Sério / premium", description: "texto limpo, poucos efeitos, piano" }, OTHER] },
  reference: { id: "reference", header: "Referência", question: "Tem um vídeo de referência para copiar o estilo de edição?", options: [
    { value: "file", label: "Vou mandar o vídeo", description: "o squad mede o ritmo, o texto e o som dele" },
    { value: "link", label: "Vou mandar o link", description: "TikTok ou YouTube; Instagram só com token da Apify" },
    { value: "none", label: "Nenhuma", description: "o squad usa o padrão do nicho" }, OTHER] },
  text: { id: "text", header: "Texto", question: "Quer legenda e headline (o texto de destaque)?", options: [
    { value: "both", label: "Legenda + headline", description: "headline no topo e legenda falada" },
    { value: "captions", label: "Só legenda", description: "sem texto fixo" },
    { value: "headline", label: "Só headline", description: "sem legenda" },
    { value: "none", label: "Sem texto", description: "só corte, zoom e som" },
    { value: "other", label: "Outro", description: "escreva a headline que você quer (vem com legenda)" }] },
};
const SAME: Omit<Question, "recommended"> = { id: "same_profile", header: "Estilo", question: "Mesmo estilo da última vez?", options: [
  { value: "yes", label: "Sim, igual", description: "usa o perfil salvo deste cliente" },
  { value: "adjust", label: "Sim, mas quero mudar algo", description: "o squad pergunta só o que mudar" },
  { value: "no", label: "Não, outro estilo", description: "começa do padrão do nicho" }, OTHER] };
// asked only when the detection is unsure; a plain yes/no, the one question without "outro"
const FIRST: Omit<Question, "recommended"> = { id: "first_use", header: "Primeira vez", question: "É a primeira vez usando o squad?", options: [
  { value: "yes", label: "Sim, primeira vez", description: "explico em poucas linhas o que dá para fazer" },
  { value: "no", label: "Não, já usei", description: "vamos direto ao briefing" }] };

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const any = (t: string, re: RegExp) => re.test(t);

// ------------------------------------------------------------------ first use

const WELCOME: Record<"pt" | "en", { body: string[]; ask: string; plan: string }> = {
  pt: { body: [
    "Boas-vindas! Eu edito vídeos curtos (Reels, TikTok, Shorts) com um ritmo que segura quem assiste.",
    "Formatos: pessoa falando, só texto, tela de app ou produto, e comparação (isto vs aquilo).",
    "Você me diz o que quer do seu jeito: por texto, por áudio ou escolhendo uma das opções.",
    "Tem um vídeo que você gosta? Mande o arquivo ou o link (TikTok, YouTube; Instagram com APIFY_TOKEN ou pelo arquivo) e eu copio o estilo de edição.",
    "Antes de fechar, você assiste no mini editor do navegador e pede ajustes em texto livre, como \"tira essa pausa\".",
    "O vídeo pronto vai para a sua pasta Downloads, com um nome claro.",
  ], ask: "Para começar, só o que falta saber:", plan: "Pelo que você mandou, já dá para montar o plano:" },
  en: { body: [
    "Welcome! I edit short videos (Reels, TikTok, Shorts) paced to keep people watching.",
    "Formats: talking head, text only, app or product screen, and comparison (this vs that).",
    "Tell me what you want your way: in text, in a voice message or by picking the options.",
    "Have a video you like? Send the file or the link (TikTok, YouTube; Instagram with APIFY_TOKEN or as a file) and I copy its editing style.",
    "Before anything is final, you watch it in the mini editor in your browser and ask for changes in plain words, like \"remove this pause\".",
    "The finished video goes to your Downloads folder with a clear name.",
  ], ask: "To start, just what is still missing:", plan: "From what you sent, here is the plan:" },
};

/** The welcome: 6 lines on what the squad does, then one line leading into the questions (or the plan) of the same round. */
export function welcomeText(lang: "pt" | "en", hasQuestions: boolean): string {
  const w = WELCOME[lang];
  return [...w.body, hasQuestions ? w.ask : w.plan].join("\n");
}

/** Squad history in the user's project (editai/ and the legacy rvs/): briefs (and how many were confirmed) and saved client profiles. */
export function projectHistory(project: string): History {
  const list = (d: string) => (existsSync(d) ? readdirSync(d) : []);
  let briefs = 0, confirmed = 0;
  const profiles = new Set<string>();
  for (const root of appRoots(project)) {
    for (const b of list(join(root, "briefs"))) {
      const p = join(root, "briefs", b, "state.json");
      if (!existsSync(p)) continue;
      briefs++;
      try { if (JSON.parse(readFileSync(p, "utf8")).confirmed) confirmed++; } catch { /* a broken state counts as an open brief */ }
    }
    for (const f of list(join(root, "profiles"))) if (f.endsWith(".json")) profiles.add(f);
  }
  return { folder: appRoots(project).some((r) => existsSync(r)), briefs, confirmed, profiles: profiles.size };
}

/** Did the person say it is (or is not) the first time? undefined when the message does not say. */
export function saysFirstUse(text: string): boolean | undefined {
  const t = norm(text);
  if (/(nao e (a )?(minha )?primeira vez|ja usei (o |esse |este )?(squad|editor|editai|antes)|not (my |the )?first time|used (it|this|the squad|editai) before)/.test(t)) return false;
  if (/(minha primeira vez|primeira vez (que )?(eu )?(usando|uso|usar|aqui|com (o|esse|este) (squad|editor|editai))|nunca usei (o |esse |este )?(squad|editor|editai)|first time (using|here|with)|my first time|never used (it|this|the squad|editai))/.test(t)) return true;
  return undefined;
}

/**
 * First use, in this order: what the person said > an ongoing session > squad history
 * (a saved profile or a confirmed brief) > a complete request (destination, format and
 * mood clear: no welcome) > only open, never confirmed briefs (unsure: ask yes/no) > no history.
 */
export function detectFirstUse(input: BriefInput, known: Known, history: History): FirstUse {
  const lang: "pt" | "en" = /^en/i.test(input.lang ?? "") ? "en" : "pt";
  const r = (status: FirstUse["status"], reason: string): FirstUse => ({ status, reason, lang, round: 1, show_now: false, welcome: null, history });
  const said = input.first_use ?? saysFirstUse([input.text, input.transcript].filter(Boolean).join("\n"));
  if (said === true) return r("yes", "a pessoa disse que é a primeira vez");
  if (said === false) return r("no", "a pessoa disse que já usou");
  if (input.session === "ongoing") return r("no", "sessão em andamento");
  if (history.profiles || history.confirmed) return r("no", `histórico no projeto (${history.profiles} perfil(is), ${history.confirmed} brief(s) confirmado(s))`);
  if (known.destination && known.format && (known.mood || input.references?.length)) return r("no", "pedido completo e claro");
  if (history.briefs) return r("ask", `só briefs abertos no projeto (${history.briefs}), nenhum confirmado`);
  return r("yes", history.folder ? "editai/ sem brief nem perfil salvo" : "projeto sem editai/");
}

/** What the message (and the audio transcript) already says. */
export function extract(text: string): { known: Known; sources: Record<string, string> } {
  const t = norm(text), k: Known = {}, src: Record<string, string> = {};
  const set = <K extends keyof Known>(f: K, v: Known[K]) => { if (k[f] === undefined) { k[f] = v; src[f] = "message"; } };
  if (any(t, /\bshorts?\b/)) set("destination", "youtube_shorts");
  if (any(t, /\b(reels?|instagram|insta|tiktok|tik tok)\b/)) set("destination", "reels_tiktok");
  if (any(t, /\b(anuncio|ads?|criativo pago|campanha|trafego pago|patrocinado)\b/)) set("destination", "ad");
  if (any(t, /\b(aula|curso|modulo|lesson|class)\b/)) set("destination", "lesson");
  if (any(t, /youtube/) && any(t, /\b(longo|long|horizontal|deitado)\b/)) set("destination", "youtube_long");
  if (any(t, /(falando|fala pra camera|fala para a camera|talking head|depoimento|ela fala|ele fala|explicando)/)) set("format", "talking_head");
  if (any(t, /(so texto|só texto|text only|sem fala|texto na tela)/)) set("format", "text_only");
  if (any(t, /(tela do app|tela de app|print da tela|gravacao de tela|screen recording|demo do produto)/)) set("format", "app_screen");
  if (any(t, /(\bvs\b|versus|comparacao|antes e depois|this vs that)/)) set("format", "comparison");
  if (any(t, /(escolhe voce|voce escolhe|tanto faz o formato|you choose)/)) set("format", "squad_choice");
  if (any(t, /(sério|serio|premium|elegante|sofisticad|institucional|luxo)/)) set("mood", "premium");
  if (any(t, /\b(calmo|calma|tranquil|suave|leve e calmo|calm)/)) set("mood", "calm");
  if (any(t, /(energetic|energia|animad|dinamic|agitad|hype|acelerad)/)) set("mood", "energetic");
  if (any(t, /(divertid|engracad|bem humorad|fun\b|funny|descontraid)/)) set("mood", "fun");
  if (any(t, /(sem legenda|no captions)/)) set("captions", false);
  else if (any(t, /(legenda|captions?)/)) set("captions", true);
  if (any(t, /(sem headline|sem titulo|sem texto fixo)/) || any(t, /(remov\w*|tir[ae]\w*)\s+(tambem\s+)?((a|aquela|essa|esta|o|esse)\s+)?(headline|titulo)/)) set("headline", false);
  // 2.3.0: one word at a time; a font named in the message ("Fonte: Delight com negrito")
  if (any(t, /(palavra por palavra|uma palavra por vez|word by word|one word at a time)/)) { set("caption_preset", "word"); set("captions", true); }
  const fm = text.match(/\bfonte\s*[:=]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 -]{1,30}?)(?=\s+(?:com|em|e|negrito|bold|na|no)\b|[,.;\n]|$)/i);
  if (fm && !/^(maior|menor|grande|pequena|bonita|legivel|legível|boa|outra|padrao|padrão)$/i.test(fm[1].trim())) set("caption_font", fm[1].trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase()));
  // 2.3.0: output size
  if (any(t, /(mesma proporcao|proporcao original|proporcao do video|same aspect|original aspect|same-as-source)/)) set("canvas", "same-as-source");
  else if (any(t, /(16:9|16x9|16 por 9|horizontal|deitad[oa]|landscape)/)) set("canvas", "1920x1080");
  else if (any(t, /(9:16|9x16|vertical|em pe\b|portrait)/)) set("canvas", "1080x1920");
  const q = text.match(/(?:headline|t[ií]tulo|chamada|texto de destaque)\s*[:=]?\s*["“']([^"”']{3,80})["”']/i) ?? text.match(/["“]([^"”]{3,80})["”]/);
  if (q) { set("headline", true); set("headline_text", q[1].trim()); }
  if (any(t, /(sem referencia|nenhuma referencia|no reference)/)) set("reference", "none");
  // standard cleanup (2.2.0): it is the default; the message can keep the pauses or switch the cleanup off.
  // 2.3.0: a sermon, a service or "sem cortes" is continuous (cleanup "none"): the video plays whole
  if (any(t, /\b(ministracao|pregacao|culto|sermao|sem cortes?|continuo|sem nenhum corte|no cuts at all|continuous|sermon|church service)\b/)) set("cleanup", "none");
  else if (any(t, /(sem limpeza|sem cortar nada|nao corta nada|nao corte nada|nao mexe no corte|nao mexa no corte|deixa como esta|no cleanup|no cuts|keep everything)/)) set("cleanup", "off");
  else if (any(t, /((mantem|mantenha|manter|deixa|deixe|nao tira|nao tire|sem tirar) (as |essas )?pausas|keep (the |my )?pauses)/)) set("cleanup", "keep_pauses");
  const fit = t.match(/(caber em|cabe em|caiba em|caibam em|cabendo em|ate|no maximo|encurta(?:r)? (?:pra|para)|reduz(?:ir)? (?:pra|para)|fit (?:in|into)|under|max(?:imum)?)\s*(\d{1,3})\s*(?:s\b|seg\b|segundos|seconds|secs?\b)/);
  if (fit && Number(fit[2]) >= 5 && Number(fit[2]) <= 180) set("fit_s", Number(fit[2]));
  return { known: k, sources: src };
}

export function loadNiches(): Niche[] {
  const dir = join(SQUAD_ROOT, "templates", "niches");
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))) : [];
}

export function detectNiche(text: string, given?: string): Niche | null {
  const all = loadNiches();
  if (given) return all.find((n) => n.id === given) ?? null;
  const t = norm(text);
  let best: Niche | null = null, hits = 0;
  for (const n of all) {
    const h = n.match.filter((m) => new RegExp(`\\b${norm(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)).length;
    if (h > hits) { best = n; hits = h; }
  }
  return best;
}

function probeKinds(files: string[]): { video_with_audio: number; video: number; image: number } {
  const r = { video_with_audio: 0, video: 0, image: 0 };
  for (const f of files) {
    if (/\.(png|jpe?g|webp)$/i.test(f)) { r.image++; continue; }
    const p = Bun.spawnSync(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", f], { stdout: "pipe", stderr: "ignore" }).stdout.toString();
    if (/video/.test(p)) { r.video++; if (/audio/.test(p)) r.video_with_audio++; }
  }
  return r;
}

function recommendFor(f: Field, s: BriefState, niche: Niche | null): string {
  const fromProfile = s.profile_known?.[f as keyof Known];
  if (typeof fromProfile === "string") return fromProfile;
  if (f === "format") {
    const m = probeKinds(s.input.material ?? []);
    return m.video_with_audio ? "talking_head" : m.image >= 2 ? "comparison" : m.image || m.video ? "text_only" : "squad_choice";
  }
  return niche?.recommend[f] ?? ({ destination: "reels_tiktok", mood: "calm", reference: "none", text: "both" } as Record<string, string>)[f];
}

function question(f: Field, s: BriefState, niche: Niche | null): Question {
  const q = structuredClone(BANK[f]) as Question;
  q.recommended = recommendFor(f, s, niche);
  const sug = f === "text" ? headlineSuggestion(s) : null;
  if (sug) { q.options[0].label = `Legenda + headline "${sug}"`; q.options[0].description = "headline sugerida pela fala; troque em Outro"; }
  return q;
}

/** Which questions to ask: missing core fields first; reference and text only when the message was not rich. Max 5. */
export function pickQuestions(s: BriefState, niche: Niche | null): Question[] {
  if (s.first_use?.status === "ask" && s.answers.first_use === undefined) return [{ ...structuredClone(FIRST), recommended: "" }];
  if (s.round === 1 && s.profile_offered && !s.profile_used && s.answers.same_profile === undefined) return [{ ...structuredClone(SAME), recommended: "yes" }];
  const k = s.known;
  const core = (["destination", "format", "mood"] as Field[]).filter((f) => k[f as keyof Known] === undefined);
  const out: Field[] = [...core];
  const rich = core.length === 0;
  if (!rich && k.reference === undefined && !(s.input.references?.length)) out.push("reference");
  const textOpen = k.captions === undefined || (k.headline !== false && !k.headline_text);
  if (textOpen && (!rich || k.format === "talking_head" || k.format === "text_only")) out.push("text");
  return (rich ? out.slice(0, 1) : out.slice(0, 5)).map((f) => question(f, s, niche));
}

// ------------------------------------------------------------------ rendering

const rec = (q: Question, o: Option) => (o.value === q.recommended ? " (Recomendado)" : "");

/** Claude Code AskUserQuestion payload(s): at most 4 questions per call and 4 options per question; Claude Code adds "Other" itself. */
export function askUserQuestion(qs: Question[]): { questions: { question: string; header: string; multiSelect: false; options: { label: string; description: string }[] }[] }[] {
  const calls = [];
  for (let i = 0; i < qs.length; i += 4) {
    calls.push({ questions: qs.slice(i, i + 4).map((q) => {
      const opts = q.options.filter((o) => o.value !== "other").sort((a, b) => Number(b.value === q.recommended) - Number(a.value === q.recommended));
      const shown = opts.slice(0, 4), hidden = opts.slice(4);
      return { question: q.question + (hidden.length ? ` (também vale: ${hidden.map((o) => o.label).join(", ")}; escolha Other e escreva)` : ""), header: q.header, multiSelect: false as const,
        options: shown.map((o) => ({ label: o.label + rec(q, o), description: o.description })) };
    }) });
  }
  return calls;
}

/** Numbered list for runtimes without a question tool: answer "1=2, 2=1" (question=option). */
export function numberedList(qs: Question[]): string {
  if (!qs.length) return "Nenhuma pergunta: já tenho o que preciso.";
  return [
    `Responda com os números, por exemplo "${qs.map((_, i) => `${i + 1}=1`).join(", ")}".${qs.at(-1)!.options.some((o) => o.value === "other") ? ` Para "Outro", escreva o texto: "${qs.length}=Outro: ...".` : ""}`, "",
    ...qs.flatMap((q, i) => [`**${i + 1}. ${q.question}**`, ...q.options.map((o, j) => `   ${j + 1}) ${o.label}${rec(q, o)} · ${o.description}`), ""]),
  ].join("\n");
}

// ------------------------------------------------------------------ answers, plan, profile

const MOOD_MUSIC: Record<string, Mood> = { calm: "calm", energetic: "upbeat", fun: "groove", premium: "emotional" };
const MOOD_APPLY: Record<string, StyleProfile["apply"]> = {
  calm: { cut: { zoom_cut_every_s: null, punch_amount: 0 }, captions: { enabled: true, preset: "classic", font_px: 64, y: 1330, uppercase: false, emphasis_color: null, box: false }, headline: { mode: "fixed", y: 350, font_px: 76, font_family: "Inter" }, music: { enabled: true, mood: "calm", below_voice_db: 24 }, sfx: { cut_whoosh: false, gain_db: -30 } },
  energetic: { cut: { zoom_cut_every_s: 1.2, punch_amount: 0.07 }, captions: { enabled: true, preset: "bold-word", font_px: 72, y: 1330, uppercase: true, emphasis_color: null, box: false }, headline: { mode: "fixed", y: 350, font_px: 86, font_family: "Anton" }, music: { enabled: true, mood: "upbeat", below_voice_db: 20 }, sfx: { cut_whoosh: true, gain_db: -24 } },
  fun: { cut: { zoom_cut_every_s: 1.6, punch_amount: 0.07 }, captions: { enabled: true, preset: "bold-word", font_px: 72, y: 1330, uppercase: true, emphasis_color: null, box: false }, headline: { mode: "fixed", y: 350, font_px: 86, font_family: "Anton" }, music: { enabled: true, mood: "groove", below_voice_db: 22 }, sfx: { cut_whoosh: true, gain_db: -26 } },
  premium: { cut: { zoom_cut_every_s: null, punch_amount: 0.05 }, captions: { enabled: true, preset: "classic", font_px: 60, y: 1330, uppercase: false, emphasis_color: null, box: false }, headline: { mode: "fixed", y: 350, font_px: 72, font_family: "Inter" }, music: { enabled: true, mood: "emotional", below_voice_db: 24 }, sfx: { cut_whoosh: false, gain_db: -30 } },
};
const TEMPLATE: Record<string, string> = { talking_head: "talking-head-captions", text_only: "text-only", app_screen: "pov-app-screen", comparison: "this-vs-that" };
const PLATFORMS: Record<string, string[]> = { reels_tiktok: ["instagram_reels", "tiktok"], youtube_shorts: ["youtube_shorts"], ad: ["instagram_reels", "tiktok", "facebook_reels"], lesson: ["instagram_reels", "tiktok"], youtube_long: ["youtube_shorts"] };
const label = (f: Field, v?: string) => BANK[f].options.find((o) => o.value === v)?.label ?? v ?? "?";

/** "1=2, 2=Outro: lançamento" (numbered) or {"Destino": "Reels / TikTok"} (AskUserQuestion, by header). */
export function applyAnswers(s: BriefState, numbered?: string, byHeader?: Record<string, string>) {
  const qs = s.questions;
  const take = (q: Question, raw: string) => {
    const r = raw.trim();
    // yes/no: "1", "sim", "Sim, primeira vez" -> yes; "2", "não", "Não, já usei" -> no
    if (q.id === "first_use") { s.answers.first_use = /^(2\b|n\b|nao|no\b|not\b)/.test(norm(r)) ? "no" : "yes"; return; }
    const n = /^\d+$/.test(r) ? Number(r) : NaN;
    const byLabel = q.options.find((o) => norm(r).startsWith(norm(o.label).replace(/ \(recomendado\)$/, "")));
    const opt = !isNaN(n) ? q.options[n - 1] : byLabel;
    const value = opt && opt.value !== "other" ? opt.value : "other";
    const free = value === "other" ? r.replace(/^(\d+|outro|other)\s*[:=-]?\s*/i, "").trim() : "";
    s.answers[q.id] = value === "other" ? `other: ${free}` : value;
    if (q.id === "same_profile") return;
    const f = q.id as Field;
    if (value === "other" && f === "text" && free) { Object.assign(s.known, { captions: true, headline: true, headline_text: free }); s.sources.text = "answer (headline escrita)"; return; }
    if (value === "other") { s.other[f] = free; s.sources[f] = "answer (outro)"; if (f !== "text") (s.known as any)[f] = recommendFor(f, s, s.niche ? detectNiche("", s.niche) : null); return; }
    s.sources[f] = "answer";
    if (f === "text") {
      s.known.captions = value === "both" || value === "captions"; s.known.headline = value === "both" || value === "headline";
      const sug = q.options[0].label.match(/"(.+)"/)?.[1];
      if (s.known.headline && sug && !s.known.headline_text) s.known.headline_text = sug;
    }
    else (s.known as any)[f] = value;
  };
  if (numbered) for (const part of numbered.split(/,(?=\s*\d+\s*=)/)) {
    const m = part.match(/^\s*(\d+)\s*=\s*(.+)$/s);
    if (m && qs[Number(m[1]) - 1]) take(qs[Number(m[1]) - 1], m[2]);
  }
  for (const [h, v] of Object.entries(byHeader ?? {})) { const q = qs.find((x) => x.header === h || x.id === h); if (q) take(q, v); }
}

function headlineSuggestion(s: BriefState): string | null {
  if (s.known.headline_text) return s.known.headline_text;
  // first clause of the speech, up to 7 words: a starting point the person accepts or rewrites
  const tr = (s.input.transcript ?? "").split(/[,.!?;:]/)[0]?.trim();
  return tr ? tr.split(/\s+/).slice(0, 7).join(" ") : null;
}

export function buildPlan(s: BriefState, niche: Niche | null, style: StyleProfile | null): Plan {
  const k = s.known, notes: string[] = [];
  const mood = k.mood ?? "calm";
  // a reference style wins; otherwise the mood sets pace, music and effects and the niche sets the text look
  const apply: StyleProfile["apply"] = structuredClone(style?.apply ?? MOOD_APPLY[mood] ?? MOOD_APPLY.calm);
  if (!style) for (const [key, v] of Object.entries(niche?.apply ?? {})) {
    if (v && typeof v === "object" && (apply as any)[key]) Object.assign((apply as any)[key], v);
    else (apply as any)[key] = v; // canvas (2.3.0) is a plain value
  }
  // 2.3.0: what the message said wins over the niche
  const cleanupAsked = k.cleanup ?? (apply.cut.mode === "none" ? "none" : undefined);
  if (cleanupAsked === "none") { apply.cut = { ...apply.cut, mode: "none", zoom_cut_every_s: null, punch_amount: 0 }; apply.sfx.cut_whoosh = false; }
  if (k.canvas) apply.canvas = k.canvas;
  if (k.caption_preset === "word") apply.captions = { ...apply.captions, preset: "word", uppercase: false, emphasis_color: null, box: false };
  if (k.caption_font) apply.captions = { ...apply.captions, font_family: k.caption_font, font_fallback: "Inter" };
  if (k.destination === "youtube_long" && !apply.canvas) apply.canvas = "1920x1080";
  if (style && k.mood && MOOD_MUSIC[k.mood] && !["profile", "reference"].includes(s.sources.mood)) {
    apply.music = { enabled: true, mood: MOOD_MUSIC[mood] ?? "calm", below_voice_db: style.apply.music.enabled ? style.apply.music.below_voice_db : 22 };
    notes.push(`Música pelo clima que você pediu (${label("mood", mood).toLowerCase()}); o resto vem da referência.`);
  }
  if (k.captions === false) apply.captions.enabled = false;
  if (k.captions === true && !style) apply.captions.enabled = true;
  if (k.headline === false) apply.headline.mode = "none";
  const fmt = k.format === "squad_choice" || !k.format ? recommendFor("format", s, niche) : k.format;
  const template = TEMPLATE[fmt] ?? "talking-head-captions";
  // the canvas decides the family of safe zones (2.3.0): a horizontal one gets the 16:9 platforms
  const wide = apply.canvas === "1920x1080" || (apply.canvas === "same-as-source" && materialIsWide(s.input.material ?? []));
  const platforms = wide ? ["youtube_16x9", "screen_16x9"] : PLATFORMS[k.destination ?? "reels_tiktok"] ?? PLATFORMS.reels_tiktok;
  if (k.destination === "youtube_long" && !wide) notes.push("YouTube longo pedido com proporção em pé: confira se é isso mesmo.");
  if (k.destination === "lesson") { apply.cut.zoom_cut_every_s = null; notes.push("Aula: sem cortes de zoom extras, para a explicação respirar."); }
  for (const [f, v] of Object.entries(s.other)) notes.push(`Você escreveu em "${BANK[f as Field].header}": "${v}". O agente ajusta o plano a isso.`);
  const track = apply.music.enabled && apply.music.mood ? pickTrack(apply.music.mood)?.id ?? null : null;
  const cleanup = cleanupAsked ?? "standard";
  const cleanLine = cleanup === "none" ? "nenhuma: o vídeo passa inteiro e contínuo. Pausas, respirações e repetições ficam, sem punch-in, zoom ou reframe (ministração, pregação ou culto pedem assim)."
    : cleanup === "off" ? "sem limpeza, como você pediu: o material entra como veio." : cleanup === "keep_pauses"
    ? "as pausas ficam, como você pediu; erros, falsos começos e repetições saem, medidos na forma de onda."
    : "pausas longas, respirações, erros, falsos começos e repetições saem sempre, medidos na forma de onda e sem cortar palavra; repetição de propósito (ênfase) fica. Peça para manter, se quiser.";
  const head = headlineSuggestion(s);
  const a = apply;
  const md = [
    "## Plano sugerido", "",
    `- **Formato:** ${label("format", fmt).toLowerCase()} (template \`${template}\`), para ${label("destination", k.destination ?? "reels_tiktok")}.`,
    ...(a.canvas ? [`- **Proporção:** ${a.canvas === "same-as-source" ? "a do vídeo original" : a.canvas === "1920x1080" ? "16:9 deitado (1920x1080)" : "9:16 em pé (1080x1920)"}.`] : []),
    a.cut.mode === "none" ? "- **Cortes:** nenhum." : `- **Cortes:** ${a.cut.zoom_cut_every_s ? `corte de zoom a cada ~${pt(a.cut.zoom_cut_every_s)} s nas pausas da fala` : "só os cortes do material, sem acelerar"}${a.cut.punch_amount ? `, zoom alternando 100/${Math.round(100 + a.cut.punch_amount * 100)} %` : ", sem zoom alternado"}; transição suave entre takes (J-cut).`,
    `- **Limpeza:** ${cleanLine}`,
    ...(k.fit_s ? [`- **Duração:** caber em ${k.fit_s} s: saem primeiro as frases repetidas e os desvios, depois as pausas; a lista do que saiu vem no relatório do corte.`] : []),
    `- **Legenda:** ${a.captions.enabled ? (a.captions.preset === "bold-word" ? "palavra que cresce, caixa alta, palavras-chave em destaque" : a.captions.preset === "word"
      ? `uma palavra por vez, no tempo da fala, branca em negrito com sombra preta suave, fonte ${a.captions.font_family ?? "Inter"}${a.captions.font_fallback ? ` (arquivo seu, na pasta fonts/ do projeto; sem ele, ${a.captions.font_fallback} Bold)` : ""}` : "clássica, palavra ativa colorida") : "sem legenda"}.`,
    `- **Headline:** ${a.headline.mode === "none" ? "sem headline" : `${head ? `"${head}"` : "o texto que você mandar"}, ${a.headline.mode === "fixed" ? "fixa o vídeo todo" : "só nos 3 primeiros segundos"} (${a.headline.font_family})`}.`,
    `- **Música:** ${a.music.enabled ? `clima \`${a.music.mood}\`${track ? `, faixa \`${track}\` (biblioteca CC0 do squad)` : ""}, ${a.music.below_voice_db} LU abaixo da voz` : "sem música"}.`,
    `- **Efeitos:** ${a.sfx.cut_whoosh ? `whoosh baixo (${a.sfx.gain_db} dB) nas trocas de clipe` : "sem efeitos nas viradas"}.`,
    ...(style ? [`- **Estilo de referência:** \`${style.name}\`. O que ele não reproduz está em \`${basename(s.reference_style ?? "").replace(/\.json$/, ".md")}\`.`] : []),
    ...(niche ? [`- **Nicho:** ${niche.name}.`] : []),
    ...(notes.length ? ["", ...notes.map((n) => `> ${n}`)] : []),
    ...(niche?.tips?.length ? ["", "Sugestões:", ...niche.tips.slice(0, 2).map((t) => `- ${t}`)] : []),
    "", "Posso editar?",
  ].join("\n");
  return { template, platforms, apply, headline_text: a.headline.mode === "none" ? null : head, music_track: track, notes, markdown: md, cleanup, fit_s: k.fit_s ?? null };
}

/** First video of the material wider than tall (canvas same-as-source, 2.3.0). */
function materialIsWide(files: string[]): boolean {
  const v = files.find((f) => !/\.(png|jpe?g|webp)$/i.test(f));
  if (!v) return false;
  try { const p = probe(v); return p.width > p.height; } catch { return false; }
}

const save = (s: BriefState) => writeFileSync(join(s.dir, "state.json"), JSON.stringify(s, null, 2));

/** Writes questions (both forms) or, when nothing is missing, the plan. */
async function advance(s: BriefState): Promise<BriefState> {
  const niche = s.niche ? detectNiche("", s.niche) : null;
  if (s.input.references?.length && !s.reference_style) {
    const r = await extractStyle(s.input.references[0], { project: s.project, name: `${slug(s.client)}-ref` });
    s.reference_style = r.path; s.known.reference = "given"; s.sources.reference = "message (style extracted)";
    // pace, music and effects come from the reference: no need to ask the mood
    if (s.known.mood === undefined) { s.known.mood = "from_reference"; s.sources.mood = "reference"; }
  }
  s.questions = pickQuestions(s, niche);
  writeFileSync(join(s.dir, `questions-r${s.round}.ask.json`), JSON.stringify(askUserQuestion(s.questions), null, 2));
  writeFileSync(join(s.dir, `questions-r${s.round}.md`), numberedList(s.questions));
  if (!s.questions.length) {
    s.plan = buildPlan(s, niche, s.reference_style ? loadStyle(s.reference_style) : null);
    writeFileSync(join(s.dir, "plan.md"), s.plan.markdown);
  }
  // first use: the welcome goes before this round's questions (or the plan), never as a round of its own
  const fu = s.first_use;
  if (fu?.status === "yes" && fu.round === s.round && !fu.welcome) {
    fu.welcome = welcomeText(fu.lang, s.questions.length > 0);
    fu.show_now = true;
    writeFileSync(join(s.dir, "welcome.md"), fu.welcome + "\n");
  }
  save(s);
  return s;
}

export async function startBrief(input: BriefInput, project: string): Promise<BriefState> {
  if (!input.client) throw new Error("input.client is required (client or project name: profiles are saved per client)");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const id = `${stamp}-${slug(input.client)}`;
  const history = projectHistory(project); // before this brief's own folder exists
  const dir = appDir(project, "briefs", id);
  const all = [input.text, input.transcript].filter(Boolean).join("\n");
  const { known, sources } = extract(all);
  const niche = detectNiche(all, input.niche);
  const s: BriefState = { brief_version: 1, id, dir, project, client: input.client, created_at: new Date().toISOString(), input: { ...input, material: (input.material ?? []).map((m) => resolve(m)) },
    niche: niche?.id ?? null, known, sources, other: {}, round: 1, questions: [], answers: {}, profile_offered: hasProfile(project, input.client), profile_used: false,
    reference_style: null, plan: null, confirmed: false, first_use: detectFirstUse(input, known, history) };
  return advance(s);
}

export async function answerBrief(statePath: string, numbered?: string, byHeader?: Record<string, string>): Promise<BriefState> {
  const s = JSON.parse(readFileSync(statePath, "utf8")) as BriefState;
  if (s.first_use) s.first_use.show_now = false; // answering means the welcome was already shown
  applyAnswers(s, numbered, byHeader);
  if (s.first_use?.status === "ask" && s.answers.first_use !== undefined) {
    // the yes/no came back: the welcome (on yes) and the normal questions go in the next round
    s.round += 1;
    Object.assign(s.first_use, { status: s.answers.first_use, reason: "resposta da pessoa", round: s.round });
    return advance(s);
  }
  if (s.answers.same_profile !== undefined && !s.profile_used && s.round === 1) {
    const yes = s.answers.same_profile === "yes" || s.answers.same_profile === "adjust";
    const p = JSON.parse(readFileSync(findProfile(s.project, s.client) ?? profilePath(s.project, s.client), "utf8"));
    s.niche ??= p.niche;
    if (s.answers.same_profile === "yes") {
      // the saved profile, with anything the new message says on top
      s.known = { ...p.known, ...s.known };
      for (const f of Object.keys(p.known)) s.sources[f] ??= "profile";
      s.reference_style ??= p.reference_style ?? null;
      s.profile_used = true;
    } else if (yes) s.profile_known = p.known; // "quero mudar algo": the saved answers become the recommended options
    s.round = 2;
    if (s.answers.same_profile === "yes") { s.questions = []; s.plan = buildPlan(s, s.niche ? detectNiche("", s.niche) : null, s.reference_style ? loadStyle(s.reference_style) : null); writeFileSync(join(s.dir, "plan.md"), s.plan.markdown); save(s); return s; }
    return advance(s);
  }
  s.questions = [];
  s.plan = buildPlan(s, s.niche ? detectNiche("", s.niche) : null, s.reference_style ? loadStyle(s.reference_style) : null);
  writeFileSync(join(s.dir, "plan.md"), s.plan.markdown);
  save(s);
  return s;
}

/** "Posso editar?" -> yes. Saves the client profile and the edit style the batch applies. */
export function confirmBrief(statePath: string, adjust?: string): { profile: string; style: string; state: BriefState } {
  const s = JSON.parse(readFileSync(statePath, "utf8")) as BriefState;
  if (s.first_use) s.first_use.show_now = false;
  if (adjust) {
    for (const kv of adjust.split(",")) {
      const [k, v] = kv.split("=").map((x) => x.trim());
      if (k === "text") { s.known.captions = v === "both" || v === "captions"; s.known.headline = v === "both" || v === "headline"; }
      else if (k === "headline_text") { s.known.headline_text = v; s.known.headline = true; }
      else if (k in BANK) (s.known as any)[k] = v;
      s.sources[k] = "adjust";
    }
    s.plan = buildPlan(s, s.niche ? detectNiche("", s.niche) : null, s.reference_style ? loadStyle(s.reference_style) : null);
    writeFileSync(join(s.dir, "plan.md"), s.plan.markdown);
  }
  if (!s.plan) throw new Error("no plan yet: answer the questions first");
  const style: StyleProfile = {
    style_profile_version: 1, name: `${slug(s.client)}-briefing`, created_at: new Date().toISOString(),
    source: { kind: "briefing", input: `briefing ${s.id}`, file: join(s.dir, "state.json"), sha256: "", duration_s: 0, width: 0, height: 0, fps: 0 },
    measured_by: s.reference_style ? `reference style ${basename(s.reference_style)} + briefing answers` : "briefing answers (no reference)",
    measurements_dir: s.reference_style ? dirname(s.reference_style) : s.dir, measured: { briefing: { known: s.known, sources: s.sources, niche: s.niche } }, apply: s.plan.apply,
    origin: {}, 
    not_reproduced: s.reference_style ? loadStyle(s.reference_style).not_reproduced : [], review_notes: s.plan.notes,
  };
  const stylePath = join(s.dir, "edit.style.json");
  writeFileSync(stylePath, JSON.stringify(style, null, 2));
  const pp = profilePath(s.project, s.client);
  const old = findProfile(s.project, s.client); // editai/, else the legacy rvs/
  const prev = old ? JSON.parse(readFileSync(old, "utf8")) : null;
  const { headline_text, reference, ...keep } = s.known; // the headline belongs to one video, not to the client
  const profile = { profile_version: 1, client: s.client, niche: s.niche, known: keep, reference_style: s.reference_style, template: s.plan.template,
    platforms: s.plan.platforms, apply: s.plan.apply, last_brief: s.id, updated_at: new Date().toISOString(), uses: (prev?.uses ?? 0) + 1 };
  writeFileSync(pp, JSON.stringify(profile, null, 2));
  s.confirmed = true;
  save(s);
  return { profile: pp, style: stylePath, state: s };
}

export const isState = (path: string) => { try { return JSON.parse(readFileSync(path, "utf8")).brief_version === 1; } catch { return false; } };

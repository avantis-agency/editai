// Builds the .ass subtitle script that libass burns in. All text animation of
// the engine lives here: pop-in, slide-up, fade, staggered lines, word reveal,
// highlighted words and word-by-word captions. Bun only.
import { assSize } from "./fonts.ts";
import type { Captions, EditSpec, TextLayer, TextStyle } from "./spec.ts";

/** #RRGGBB -> &HAABBGGRR (ASS colour order is blue-green-red). */
export function assColor(hex = "#ffffff", alpha = 0): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  const a = Math.round(alpha).toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

const ts = (sec: number) => {
  const cs = Math.max(0, Math.round(sec * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");

/** mask = white text, white outline, no shadow: same geometry, measurable by the bbox filter. */
function styleLine(name: string, st: TextStyle, mask: boolean): string {
  const primary = mask ? "&H00FFFFFF" : assColor(st.color ?? "#ffffff");
  const outline = mask ? "&H00FFFFFF" : assColor(st.box ? (st.box_color ?? "#000000") : (st.outline_color ?? "#000000"));
  const back = mask ? "&H00FFFFFF" : (st.box ? assColor(st.box_color ?? "#000000", 0x30) : "&H8C000000");
  const borderStyle = st.box ? 3 : 1;
  const outlinePx = st.box ? Math.max(st.outline_px ?? 18, 8) : (st.outline_px ?? 4);
  const shadow = mask ? 0 : (st.shadow_px ?? 2);
  return [
    `Style: ${name}`, st.font_family ?? "Inter", assSize(st.font_px, st), primary, primary, outline, back,
    st.bold === false ? 0 : -1, 0, 0, 0, 100, 100, 0, 0, borderStyle, outlinePx, shadow, 5, 0, 0, 0, 1,
  ].join(",");
}

function highlight(line: string, words: string[] | undefined, st: TextStyle): string {
  let out = esc(st.uppercase ? line.toUpperCase() : line);
  if (!words?.length || !st.highlight_color) return out;
  const on = `{\\c${assColor(st.highlight_color)}}`, off = `{\\c${assColor(st.color ?? "#ffffff")}}`;
  for (const w of words) {
    const target = esc(st.uppercase ? w.toUpperCase() : w);
    const i = out.toLowerCase().indexOf(target.toLowerCase());
    if (i >= 0) out = out.slice(0, i) + on + out.slice(i, i + target.length) + off + out.slice(i + target.length);
  }
  return out;
}

/**
 * Entrance and exit tags. A block that starts on frame 0 must already be readable
 * on frame 0 (it is the frame the feed shows before playback), so it never fades
 * in and never starts transparent. A block that lasts to the end never fades out,
 * so the video loops without a blank frame.
 */
function fades(t: TextLayer, duration: number, inMs: number, outMs: number): string {
  const fin = t.start > 0.001 ? inMs : 0;
  const fout = t.end < duration - 0.001 ? outMs : 0;
  return fin || fout ? `\\fad(${fin},${fout})` : "";
}

function entrance(t: TextLayer, duration: number): string {
  const pos = `\\an5\\pos(${Math.round(t.x)},${Math.round(t.y)})`;
  const first = t.start <= 0.001;
  switch (t.animation) {
    case "pop_in":
      // scale -> 108% -> 100% in 260 ms: the overshoot is what reads as a "pop"
      return `{${pos}${fades(t, duration, 60, 120)}\\fscx${first ? 88 : 70}\\fscy${first ? 88 : 70}\\t(0,150,\\fscx108\\fscy108)\\t(150,260,\\fscx100\\fscy100)}`;
    case "slide_up":
      return first
        ? `{${pos}${fades(t, duration, 120, 120)}}`
        : `{\\an5\\move(${Math.round(t.x)},${Math.round(t.y + 70)},${Math.round(t.x)},${Math.round(t.y)},0,240)${fades(t, duration, 120, 120)}}`;
    case "fade":
      return `{${pos}${fades(t, duration, 250, 200)}}`;
    default:
      return `{${pos}${fades(t, duration, 0, 0)}}`;
  }
}

function textEvents(t: TextLayer, style: string, duration: number): string[] {
  const lines = t.lines.map((l) => highlight(l, t.highlight_words, t.style));
  const stagger = Math.round((t.stagger ?? 0.35) * 1000);
  const first = t.start <= 0.001;
  const head = `{\\an5\\pos(${Math.round(t.x)},${Math.round(t.y)})${fades(t, duration, 0, 120)}}`;
  let body: string;
  if (t.animation === "line_stagger") {
    // each line pops `stagger` ms after the previous; on frame 0 the first line is already visible
    body = head + lines.map((l, i) => {
      const a = i * stagger;
      const lead = i === 0 && first;
      const alpha = lead ? "" : "\\alpha&HFF&";
      const s0 = lead ? 92 : 85;
      return `{${alpha}\\fscx${s0}\\fscy${s0}\\t(${a},${a + 120},\\alpha&H00&\\fscx104\\fscy104)\\t(${a + 120},${a + 220},\\fscx100\\fscy100)}${l}`;
    }).join("\\N");
  } else if (t.animation === "word_reveal") {
    let k = 0;
    body = head + lines.map((l) => l.split(" ").map((w) => {
      const a = k++ * stagger;
      return a === 0 && first ? `{\\alpha&H00&}${w}` : `{\\alpha&HFF&\\t(${a},${a + 90},\\alpha&H00&)}${w}`;
    }).join(" ")).join("\\N");
  } else if (t.style.line_spacing_px && lines.length > 1) {
    // libass spaces lines by the font's line box (1.73 em for Anton): with line_spacing_px each
    // line is its own event, centred line_spacing_px apart around y
    const gap = t.style.line_spacing_px;
    return lines.map((l, i) => {
      const y = t.y + (i - (lines.length - 1) / 2) * gap;
      return `Dialogue: 1,${ts(t.start)},${ts(t.end)},${style},,0,0,0,,${entrance({ ...t, y }, duration)}${l}`;
    });
  } else {
    body = entrance(t, duration) + lines.join("\\N");
  }
  return [`Dialogue: 1,${ts(t.start)},${ts(t.end)},${style},,0,0,0,,${body}`];
}

/**
 * Caption groups: a phrase ends at clause punctuation or a pause of 0.3 s or
 * more (otherwise a group straddles two sentences, or a cut, and stays on screen
 * through the silence); each phrase is split into the fewest groups of at most
 * max_words, sized evenly ("Just ten / slow minutes", not "Just ten slow / minutes").
 */
export function captionGroups(c: Captions): Captions["words"][] {
  const groups: Captions["words"][] = [];
  let phrase: Captions["words"] = [];
  c.words.forEach((w, i) => {
    phrase.push(w);
    const next = c.words[i + 1];
    if (next && !/[,.!?;:]$/.test(w.word) && next.start - w.end < 0.3) return;
    const n = Math.ceil(phrase.length / c.max_words);
    let k = 0;
    for (let g = 0; g < n; g++) {
      const size = Math.ceil((phrase.length - k) / (n - g));
      groups.push(phrase.slice(k, k + size));
      k += size;
    }
    phrase = [];
  });
  return groups;
}

/** Moment a caption group is widest: the longest word is the active (scaled) one. */
export function widestMoment(g: Captions["words"]): number {
  const w = g.reduce((a, b) => (b.word.length > a.word.length ? b : a), g[0]);
  return (w.start + w.end) / 2;
}

/** Default look of the bold-word preset; any field set in captions.style wins. */
export const BOLD_WORD_STYLE: TextStyle = {
  font_family: "Anton", font_px: 72, size_basis: "em", bold: false, color: "#ffffff", highlight_color: "#ffffff",
  outline_px: 6, outline_color: "#14101c", shadow_px: 4, uppercase: true,
};

export function captionStyle(c: Captions): TextStyle {
  return c.preset === "bold-word" ? { ...BOLD_WORD_STYLE, ...c.style } : c.style;
}

const HOLD_S = 0.25; // bold-word: a group stays up to 0.25 s into the pause (never past the next group)

/**
 * bold-word: one event per spoken word. The spoken word grows to pop_scale % in
 * 80 ms on its own entry (no colour change unless highlight_color differs from
 * the base); keywords stay in emphasis_color for the whole group. A new group
 * rises 12 px and fades in over 80 ms.
 */
function boldWordEvents(c: Captions, x: number): string[] {
  const out: string[] = [];
  const st = captionStyle(c);
  const base = assColor(st.color ?? "#ffffff");
  const act = assColor(st.highlight_color ?? st.color ?? "#ffffff");
  const emph = c.emphasis_color ? assColor(c.emphasis_color) : null;
  const pop = Math.round(c.pop_scale ?? 114);
  const groups = captionGroups(c);
  groups.forEach((group, gi) => {
    const nextStart = gi + 1 < groups.length ? groups[gi + 1][0].start : Infinity;
    const fs = c.group_font_px?.[gi];
    const fsTag = fs ? `\\fs${assSize(fs, st)}` : "";
    for (let j = 0; j < group.length; j++) {
      const start = group[j].start;
      const end = j + 1 < group.length ? group[j + 1].start : Math.min(group[group.length - 1].end + HOLD_S, nextStart);
      const text = group.map((w, k) => {
        const word = esc(w.word.toUpperCase().replace(/[.,!?;:…]+$/u, ""));
        const col = w.emphasis && emph ? emph : k === j ? act : base;
        const grow = k === j ? `\\fscx100\\fscy100\\t(0,80,\\fscx${pop}\\fscy${pop})` : "\\fscx100\\fscy100";
        return `{\\c${col}${grow}}${word}`;
      }).join(" ");
      const y = Math.round(c.y);
      const head = j === 0
        ? `{\\an5\\move(${Math.round(x)},${y + 12},${Math.round(x)},${y},0,80)\\fad(80,0)${fsTag}}`
        : `{\\an5\\pos(${Math.round(x)},${y})${fsTag}}`;
      out.push(`Dialogue: 0,${ts(start)},${ts(end)},Captions,,0,0,0,,${head}${text}`);
    }
  });
  return out;
}

/** Word-by-word captions: short groups, active word highlighted, emphasis words in emphasis_color. */
function captionEvents(c: Captions, x: number): string[] {
  if (c.preset === "bold-word") return boldWordEvents(c, x);
  const out: string[] = [];
  const st = c.style;
  const base = assColor(st.color ?? "#ffffff");
  for (const group of captionGroups(c)) {
    for (let j = 0; j < group.length; j++) {
      const start = group[j].start;
      const end = j + 1 < group.length ? group[j + 1].start : group[group.length - 1].end;
      const text = group.map((w, k) => {
        const word = esc(st.uppercase ? w.word.toUpperCase() : w.word);
        const active = k === j && c.highlight_active !== false && !!st.highlight_color;
        const emph = !!w.emphasis && !!c.emphasis_color;
        if (!active && !emph) return word;
        const col = emph ? assColor(c.emphasis_color) : assColor(st.highlight_color);
        return `{\\c${col}\\fscx110\\fscy110}${word}{\\c${base}\\fscx100\\fscy100}`;
      }).join(" ");
      out.push(`Dialogue: 0,${ts(start)},${ts(end)},Captions,,0,0,0,,{\\an5\\pos(${Math.round(x)},${Math.round(c.y)})}${text}`);
    }
  }
  return out;
}

/** Full .ass document. `only` limits it to one text layer (used to measure a block alone). */
export function buildAss(spec: EditSpec, opts: { mask?: boolean; only?: string } = {}): string {
  const { width: W, height: H } = spec.canvas;
  const mask = !!opts.mask;
  const texts = spec.texts.filter((t) => !opts.only || t.id === opts.only);
  const styles = texts.map((t) => styleLine(`T_${t.id}`, t.style, mask));
  const withCaptions = spec.captions && (!opts.only || opts.only === "captions");
  if (withCaptions) styles.push(styleLine("Captions", captionStyle(spec.captions!), mask));
  const events = texts.flatMap((t) => textEvents(t, `T_${t.id}`, spec.duration));
  if (withCaptions) events.push(...captionEvents(spec.captions!, W / 2));
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "ScaledBorderAndShadow: yes", "WrapStyle: 2", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles, "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events, "",
  ].join("\n");
}

// Mini editor (EditAi, since 1.4.0): what the render would draw at time t, without rendering.
// Pure functions, no DOM (bun can import this file to check it against the engine).
// Mirrors lib/edit-engine/ass.ts (caption groups, bold-word and classic events, headline entrance and
// fades), lib/edit-engine/safezones.ts (headline max width, caption group fit) and the text part of
// lib/edit-engine/apply-feedback.ts (headline text, mode and size, caption preset, word fixes, keywords).
// Not mirrored: the safe-zone move of fitTexts and the line_stagger / word_reveal animations (drawn
// without animation); the quick preview shows the real render.

export const HOLD_S = 0.25;                 // ass.ts: a bold-word group stays up to 0.25 s into the pause
export const BOLD_WORD_STYLE = {            // ass.ts BOLD_WORD_STYLE
  font_family: 'Anton', font_px: 72, size_basis: 'em', bold: false, color: '#ffffff', highlight_color: '#ffffff',
  outline_px: 6, outline_color: '#14101c', shadow_px: 4, uppercase: true,
};
export const WORD_STYLE = {                 // ass.ts WORD_STYLE (2.3.0): one word at a time, soft shadow
  font_family: 'Inter', font_px: 72, bold: true, color: '#ffffff', outline_px: 0,
  shadow_px: 3, shadow_blur: 6, shadow_color: '#000000', shadow_alpha: 0.85, uppercase: false,
};
/** ass.ts wordText: trailing , . ; : … dropped (? and ! stay). */
export const wordText = (w, st) => (st.uppercase ? w.toUpperCase() : w).replace(/[,.;:…]+$/u, '');
const r3 = (n) => Math.round(n * 1000) / 1000;

/** ass.ts captionGroups: a phrase ends at , . ! ? ; : or a pause of 0.3 s; each phrase splits evenly by max_words. */
export function captionGroups(words, maxWords) {
  const groups = [];
  let phrase = [];
  words.forEach((w, i) => {
    phrase.push(w);
    const next = words[i + 1];
    if (next && !/[,.!?;:]$/.test(w.word) && next.start - w.end < 0.3) return;
    const n = Math.ceil(phrase.length / maxWords);
    let k = 0;
    for (let g = 0; g < n; g += 1) {
      const size = Math.ceil((phrase.length - k) / (n - g));
      groups.push(phrase.slice(k, k + size));
      k += size;
    }
    phrase = [];
  });
  return groups;
}

/** ass.ts widestMoment: the longest word is the active (grown) one. */
export function widestMoment(g) {
  const w = g.reduce((a, b) => (b.word.length > a.word.length ? b : a), g[0]);
  return (w.start + w.end) / 2;
}

/** Em size in canvas px of a text style (size_basis em = CSS px; line = libass size / line ratio). */
export function emPx(style, fonts) {
  const m = fonts[style.font_family || 'Inter'];
  return style.size_basis === 'em' ? style.font_px : style.font_px / (m ? m.ratio : 1);
}

/** Baseline below the centre of a libass line (\an5 centres on winAscent + winDescent), in em. */
export function baselineEm(family, fonts) {
  const m = fonts[family || 'Inter'];
  return m ? (m.win_asc - m.win_desc) / 2 / m.upm : 0.35;
}

/**
 * The overlay spec from the server (take trims applied) plus the person's choices, the way
 * apply-feedback would write them. picks = { style, words: Map(i -> text), emphasis: Map(i -> bool) }.
 */
export function applyPicks(ov, picks) {
  const st = picks.style;
  let hook = null;
  if (ov.hook) {
    const h = ov.hook;
    hook = { ...h, lines: [...h.lines], style: { ...h.style }, highlight_words: [...(h.highlight_words || [])] };
    if (st) {
      if (st.headline_mode && st.headline_mode !== (h.mode === 'intro' ? 'intro' : 'fixed')) {
        hook.mode = st.headline_mode;
        if (st.headline_mode === 'intro') { hook.start = 0; hook.end = r3(Math.min(3, ov.duration)); }
      }
      if (hook.mode === 'fixed') { hook.start = 0; hook.end = ov.duration; }
      const pct = st.headline_size_pct || 100;
      if (pct !== 100) {
        hook.style.font_px = Math.round(h.style.font_px * pct / 100);
        if (h.style.line_spacing_px) hook.style.line_spacing_px = Math.round(h.style.line_spacing_px * pct / 100);
      }
      const lines = (st.headline_lines || []).map((l) => l.trim()).filter(Boolean);
      if (lines.length && JSON.stringify(lines) !== JSON.stringify(h.lines)) {
        hook.lines = lines;
        hook.highlight_words = hook.highlight_words.filter((w) => lines.join(' ').toLowerCase().includes(w.toLowerCase()));
      }
    }
  }
  let cap = null;
  if (ov.captions) {
    const c = ov.captions;
    const preset = st ? st.caption_preset : c.preset;
    const words = c.words.map((w) => ({
      i: w.i, start: w.start, end: w.end, original: w.word,
      word: picks.words && picks.words.has(w.i) ? picks.words.get(w.i) : w.word,
      emphasis: picks.emphasis && picks.emphasis.has(w.i) ? picks.emphasis.get(w.i) : w.emphasis,
    }));
    const style = preset === 'bold-word' ? { ...BOLD_WORD_STYLE, ...c.style } : preset === 'word' ? { ...WORD_STYLE, ...c.style } : { ...c.style };
    cap = { ...c, preset, words, style, groups: captionGroups(words, preset === 'word' ? 1 : c.max_words) };
  }
  return { W: ov.canvas.width, H: ov.canvas.height, duration: ov.duration, hook, cap };
}

/** Entrance and exit of a text block (ass.ts fades / entrance): { alpha, scale, dy }. */
export function hookMotion(h, t, duration) {
  const ms = (t - h.start) * 1000, left = (h.end - t) * 1000;
  const first = h.start <= 0.001;
  const fade = (fin, fout) => {
    const a = h.start > 0.001 && fin ? Math.min(1, ms / fin) : 1;
    const b = h.end < duration - 0.001 && fout ? Math.min(1, left / fout) : 1;
    return Math.max(0, Math.min(a, b));
  };
  switch (h.animation) {
    case 'pop_in': {
      const s0 = first ? 88 : 70;
      const s = ms < 150 ? s0 + (108 - s0) * ms / 150 : ms < 260 ? 108 - 8 * (ms - 150) / 110 : 100;
      return { alpha: fade(60, 120), scale: s / 100, dy: 0 };
    }
    case 'slide_up':
      return { alpha: fade(120, 120), scale: 1, dy: first ? 0 : 70 * Math.max(0, 1 - ms / 240) };
    case 'fade':
      return { alpha: fade(250, 200), scale: 1, dy: 0 };
    default:
      return { alpha: fade(0, 0), scale: 1, dy: 0 };
  }
}

/** Headline lines with their centre y (line_spacing_px: one event per line; else libass line height). */
export function hookLines(h, fonts) {
  const em = emPx(h.style, fonts);
  const m = fonts[h.style.font_family || 'Inter'];
  const gap = h.style.line_spacing_px && h.lines.length > 1 ? h.style.line_spacing_px : em * (m ? m.ratio : 1.2);
  const text = h.lines.map((l) => (h.style.uppercase ? l.toUpperCase() : l));
  return text.map((line, i) => ({ text: line, y: h.y + (i - (text.length - 1) / 2) * gap }));
}

/** Highlight segments of one headline line (ass.ts highlight: first case-insensitive match of each word). */
export function hookSegments(line, h) {
  const st = h.style;
  const hl = st.highlight_color && h.highlight_words && h.highlight_words.length ? h.highlight_words : [];
  let marks = new Array(line.length).fill(false);
  for (const w of hl) {
    const target = st.uppercase ? w.toUpperCase() : w;
    const i = line.toLowerCase().indexOf(target.toLowerCase());
    if (i >= 0) for (let k = i; k < i + target.length; k += 1) marks[k] = true;
  }
  const segs = [];
  for (let k = 0; k < line.length; k += 1) {
    const on = marks[k];
    if (segs.length && segs[segs.length - 1].on === on) segs[segs.length - 1].text += line[k];
    else segs.push({ text: line[k], on });
  }
  return segs.map((s) => ({ text: s.text, color: s.on ? st.highlight_color : (st.color || '#ffffff'), scale: 1 }));
}

/**
 * Caption line on screen at t: { segs: [{text, color, scale}], y, alpha, groupIndex } or null.
 * groupFont: fitted em size per group (bold-word), or null for the style size.
 */
/** B-roll windows (2.1.0, ass.ts groupWindow / visibleSpan): a card that writes the same words hides the caption; others move it. */
function hiddenAt(cap, t) { return (cap.windows || []).some((w) => w.hide && t >= w.start && t < w.end); }
function movedY(cap, g) {
  const w = (cap.windows || []).find((x) => !x.hide && x.start < g[g.length - 1].end && x.end > g[0].start);
  return w ? w.y : cap.y;
}

export function captionAt(cap, t, groupFont) {
  if (!cap || hiddenAt(cap, t)) return null;
  const st = cap.style;
  const groups = cap.groups;
  for (let gi = 0; gi < groups.length; gi += 1) {
    const g = groups[gi];
    const nextStart = gi + 1 < groups.length ? groups[gi + 1][0].start : Infinity;
    for (let j = 0; j < g.length; j += 1) {
      const start = g[j].start;
      const end = cap.preset === 'bold-word' || cap.preset === 'word'
        ? (j + 1 < g.length ? g[j + 1].start : Math.min(g[g.length - 1].end + HOLD_S, nextStart))
        : (j + 1 < g.length ? g[j + 1].start : g[g.length - 1].end);
      if (t < start || t >= Math.max(end, start + 0.034)) continue;
      const ms = (t - start) * 1000;
      if (cap.preset === 'word') {
        // ass.ts wordEvents: the one word, no growth, no colour change
        return { segs: [{ text: wordText(g[j].word, st), color: st.color || '#ffffff', scale: 1 }], y: movedY(cap, g), alpha: 1, groupIndex: gi, font: null };
      }
      if (cap.preset === 'bold-word') {
        const pop = (cap.pop_scale || 114) / 100;
        const segs = g.map((w, k) => ({
          text: w.word.toUpperCase().replace(/[.,!?;:…]+$/u, '') + (k + 1 < g.length ? ' ' : ''),
          color: w.emphasis && cap.emphasis_color ? cap.emphasis_color : k === j ? (st.highlight_color || st.color || '#ffffff') : (st.color || '#ffffff'),
          scale: k === j ? 1 + (pop - 1) * Math.min(1, ms / 80) : 1,
        }));
        const enter = j === 0 ? Math.min(1, ms / 80) : 1;
        return { segs, y: movedY(cap, g) + 12 * (1 - enter), alpha: enter, groupIndex: gi, font: groupFont ? groupFont[gi] : null };
      }
      const segs = g.map((w, k) => {
        const active = k === j && cap.highlight_active && !!st.highlight_color;
        const emph = !!w.emphasis && !!cap.emphasis_color;
        return {
          text: (st.uppercase ? w.word.toUpperCase() : w.word) + (k + 1 < g.length ? ' ' : ''),
          color: emph ? cap.emphasis_color : active ? st.highlight_color : (st.color || '#ffffff'),
          scale: active || emph ? 1.1 : 1,
        };
      });
      return { segs, y: movedY(cap, g), alpha: 1, groupIndex: gi, font: null };
    }
  }
  return null;
}

/** safezones.ts measureTime: moment a block is fully on screen. */
export function measureTime(h) {
  const s = h.stagger ?? 0.35;
  const lead = h.animation === 'line_stagger' ? s * (h.lines.length - 1) + 0.35
    : h.animation === 'word_reveal' ? s * h.lines.join(' ').split(' ').length + 0.15 : 0.45;
  return Math.min(Math.max(h.start + lead, h.start + 0.3), Math.max(h.start + 0.3, h.end - 0.3));
}

/**
 * The render's width fit, with a text measurer (inkWidth(segs, emPx, style) -> px, outline excluded):
 * the headline shrinks until its widest line fits max_width_px; each bold-word caption group
 * gets its own smaller size when it is wider than max_width_px. Returns the fitted copy.
 */
export function fit(eff, fonts, inkWidth) {
  const out = { ...eff };
  const h = eff.hook;
  if (h && h.max_width_px) {
    const hh = { ...h, style: { ...h.style } };
    for (let i = 0; i < 3; i += 1) {
      const em = emPx(hh.style, fonts);
      const w = Math.max(...hookLines(hh, fonts).map((l) => inkWidth(hookSegments(l.text, hh), em, hh.style))) + 2 * (hh.style.outline_px ?? 4);
      if (w <= hh.max_width_px) break;
      const next = Math.floor(hh.style.font_px * (hh.max_width_px - 4) / w);
      if (hh.style.line_spacing_px) hh.style.line_spacing_px = Math.round(hh.style.line_spacing_px * next / hh.style.font_px);
      hh.style.font_px = next;
    }
    out.hook = hh;
  }
  const c = eff.cap;
  if (c && c.preset === 'bold-word' && c.words.length) {
    const base = emPx(c.style, fonts);
    const sizes = c.groups.map(() => c.style.font_px);
    c.groups.forEach((g, gi) => {
      for (let i = 0; i < 3; i += 1) {
        const at = captionAt(c, widestMoment(g), null);
        if (!at) break;
        const em = base * sizes[gi] / c.style.font_px;
        const w = inkWidth(at.segs, em, c.style) + 2 * (c.style.outline_px ?? 4);
        if (w <= c.max_width_px) break;
        sizes[gi] = Math.floor(sizes[gi] * (c.max_width_px - 4) / w);
      }
    });
    out.groupFont = sizes.map((s) => base * s / c.style.font_px);
  }
  return out;
}

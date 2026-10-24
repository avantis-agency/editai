// Editor com IA (EditAi, since 1.7.0): the Editor tab's timeline, four tracks like a desktop
// editor: Vídeo (frames of the clean base and the takes), Legenda (caption blocks, click = go there),
// Edição (headline, titles, zooms, punch-ins, sound effects) and Áudio (waveform and the music bar).
// Times are the current video (every saved change applied), the same clock as the player.
// The cursor is dragged on the ruler; dragging on a track selects a stretch that goes with the next
// request. Strip patterns (waveform as a CSS mask, filmstrip PNG) from the Linha do tempo tab, adapted
// from editonny 1.1.0 (commit 08e86fe), Copyright (c) 2026 Matheus Gomes, MIT License (LICENSE-editonny.md).
import { clamp, el, fmtTime } from '../dom.mjs';

const KIND_PT = { headline: 'Headline', title: 'Título', zoom: 'Zoom', punch: 'Punch-in', 'punch-auto': 'Punch (alternado)', sfx: 'Efeito' };

export class Tracks {
  /** opts: { seek(t), time() -> t, onSelect(sel | null) } */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    const q = (s) => root.querySelector(s);
    this.els = {
      area: q('[data-trk-area]'), ruler: q('[data-trk-ruler]'), takes: q('[data-trk-takes]'), film: q('[data-trk-film]'), caps: q('[data-trk-caps]'),
      edits: q('[data-trk-edits]'), wave: q('[data-trk-wave]'), waveLane: q('[data-trk-audio]'), music: q('[data-trk-music]'), sel: q('[data-trk-sel]'),
      playhead: q('[data-trk-playhead]'), selInfo: q('[data-trk-selinfo]'), clear: q('[data-trk-clear]'), videoLane: q('[data-trk-video]'),
    };
    this.data = null;
    this.key = '';
    this.duration = 0;
    this.selection = null;
    this.drag = null;
    this.stripKey = '';
    this.bind();
  }

  bind() {
    const a = this.els.area;
    a.addEventListener('pointerdown', (e) => this.down(e));
    a.addEventListener('pointermove', (e) => this.move(e));
    a.addEventListener('pointerup', (e) => this.up(e));
    a.addEventListener('pointercancel', () => { this.drag = null; });
    this.els.clear.addEventListener('click', () => this.setSelection(null));
    new ResizeObserver(() => { this.renderRuler(); this.loadStrips(); }).observe(a);
  }

  timeAt(clientX) {
    const r = this.els.area.getBoundingClientRect();
    return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * this.duration;
  }
  pct(t) { return this.duration ? `${clamp((t / this.duration) * 100, 0, 100)}%` : '0%'; }
  place(node, a, b, minPx = 4) {
    node.style.left = this.pct(a);
    node.style.width = `max(${minPx}px, ${this.duration ? (Math.max(0, b - a) / this.duration) * 100 : 0}%)`;
  }

  down(e) {
    if (e.button !== 0 || !this.duration) return;
    if (e.target.closest('[data-cap]')) return;   // a caption block moves the cursor on click
    e.preventDefault();
    this.els.area.setPointerCapture(e.pointerId);
    const t = this.timeAt(e.clientX);
    const onRuler = !!e.target.closest('[data-trk-ruler]') || !!e.target.closest('[data-trk-playhead]');
    this.drag = { x: e.clientX, t0: t, mode: onRuler ? 'scrub' : 'maybe' };
    if (onRuler) this.opts.seek(t);
  }
  move(e) {
    const d = this.drag;
    if (!d) return;
    const t = this.timeAt(e.clientX);
    if (d.mode === 'scrub') { this.opts.seek(t); return; }
    if (d.mode === 'maybe' && Math.abs(e.clientX - d.x) > 5) d.mode = 'select';
    if (d.mode === 'select') this.setSelection({ start: Math.min(d.t0, t), end: Math.max(d.t0, t) }, true);
  }
  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === 'maybe') { this.setSelection(null); this.opts.seek(this.timeAt(e.clientX)); }
    else if (d.mode === 'select' && this.selection) {
      if (this.selection.end - this.selection.start < 0.05) this.setSelection(null);
      else { this.opts.seek(this.selection.start); this.opts.onSelect(this.selection); }
    }
  }

  setSelection(sel, live = false) {
    this.selection = sel;
    const s = this.els.sel;
    s.hidden = !sel;
    if (sel) this.place(s, sel.start, sel.end, 2);
    this.els.selInfo.textContent = sel ? `Seleção: ${fmtTime(sel.start)} → ${fmtTime(sel.end)} (${(sel.end - sel.start).toFixed(2).replace('.', ',')} s)` : '';
    this.els.clear.hidden = !sel;
    if (!live) this.opts.onSelect(sel);
  }

  /** data: live.tracks from /api/state; strips: { ready, sig } of the clean base. */
  update(data, strips) {
    this.data = data;
    const key = JSON.stringify(data);
    this.strips = strips;
    if (key !== this.key) {
      this.key = key;
      this.duration = data.duration;
      if (this.selection && this.selection.end > this.duration) this.setSelection(null);
      this.render();
    }
    this.loadStrips();
  }

  render() {
    const d = this.data, els = this.els;
    this.renderRuler();
    els.takes.textContent = '';
    d.takes.forEach((t, i) => {
      const b = el('div', { class: 'trk-take', title: `Take ${t.id} · ${fmtTime(t.start)} → ${fmtTime(t.end)}` }, el('span', { text: `${i + 1}` }));
      this.place(b, t.start, t.end, 3);
      els.takes.append(b);
    });
    els.caps.textContent = '';
    if (!d.captions.length) els.caps.append(el('span', { class: 'trk-empty', text: 'sem legenda' }));
    for (const g of d.captions) {
      const b = el('button', { type: 'button', class: `trk-cap${g.emphasis ? ' is-emph' : ''}`, 'data-cap': '1', text: g.text,
        title: `${g.text}\n${fmtTime(g.start)} → ${fmtTime(g.end)}\nClique para levar o cursor até aqui` });
      b.addEventListener('click', () => { this.setSelection(null); this.opts.seek(g.start + 0.02); });
      this.place(b, g.start, g.end, 6);
      els.caps.append(b);
    }
    els.edits.textContent = '';
    const rows = { headline: 0, title: 0, punch: 1, 'punch-auto': 1, zoom: 1, sfx: 2 };
    for (const x of d.edits) {
      const point = x.kind === 'zoom' || x.kind === 'sfx';
      const b = el('div', { class: `trk-edit is-${x.kind}${x.off ? ' is-off' : ''}${point ? ' is-point' : ''}`, text: point ? '' : x.label,
        title: `${KIND_PT[x.kind] || x.kind}: ${x.label}\n${fmtTime(x.start)}${point ? '' : ` → ${fmtTime(x.end)}`}${x.off ? '\n(fica de fora: só toca com música)' : ''}` });
      b.style.top = `${rows[x.kind] * 33.3}%`;
      if (point) { b.style.left = this.pct(x.start); b.append(el('span', { text: x.kind === 'zoom' ? 'Z' : (x.label || '').slice(0, 1).toUpperCase() })); }
      else this.place(b, x.start, x.end, 6);
      els.edits.append(b);
    }
    els.music.textContent = '';
    if (d.music) {
      const m = el('div', { class: 'trk-music', text: `Música: ${d.music.label}`, title: `Música: ${d.music.label}\nentra em ${fmtTime(d.music.start)}` });
      this.place(m, d.music.start, d.music.end);
      els.music.append(m);
    }
    if (this.selection) this.setSelection(this.selection, true);
  }

  renderRuler() {
    const r = this.els.ruler;
    r.textContent = '';
    const w = this.els.area.clientWidth;
    if (!this.duration || !w) return;
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => (s * w) / this.duration >= 70) || 60;
    for (let t = 0; t <= this.duration + 1e-6; t += step) {
      const tick = el('div', { class: 'tick', text: (this.duration - t) * (w / this.duration) > 30 ? fmtTime(t).replace(/\.\d+$/, '') : '' });
      tick.style.left = this.pct(t);
      r.append(tick);
    }
  }

  /** Frames and waveform of the clean base (the current cut), once it is ready. */
  loadStrips() {
    const s = this.strips;
    const w = this.els.area.clientWidth;
    if (!s || !w) return;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const laneH = this.els.videoLane.clientHeight || 44;
    const n = clamp(Math.ceil(w / (laneH * 9 / 16) / 4) * 4, 4, 160);
    const h = clamp(Math.round((laneH * dpr) / 16) * 16, 32, 192);
    const ww = clamp(Math.round((w * dpr) / 250) * 250, 500, 4000);
    const key = s.ready ? `${s.sig}|${n}|${h}|${ww}` : 'none';
    if (key === this.stripKey) return;
    this.stripKey = key;
    const { film, wave, waveLane } = this.els;
    if (!s.ready) { film.removeAttribute('src'); film.hidden = true; wave.style.maskImage = wave.style.webkitMaskImage = ''; waveLane.classList.remove('is-ready'); return; }
    const filmUrl = `/api/filmstrip?src=base&n=${n}&h=${h}&v=${s.sig}`;
    const img = new Image();
    img.onload = () => { if (this.stripKey === key) { film.src = filmUrl; film.hidden = false; } };
    img.src = filmUrl;
    const waveUrl = `/api/waveform?src=base&w=${ww}&h=104&v=${s.sig}`;
    const wimg = new Image();
    wimg.onload = () => { if (this.stripKey === key) { wave.style.webkitMaskImage = `url("${waveUrl}")`; wave.style.maskImage = `url("${waveUrl}")`; waveLane.classList.add('is-ready'); } };
    wimg.src = waveUrl;
  }

  /** Moves the playhead (called on every drawn frame). */
  setTime(t) {
    this.els.playhead.style.left = this.pct(t);
  }
}

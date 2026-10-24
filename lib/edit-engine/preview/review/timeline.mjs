// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/review/timeline.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: segments are the takes of our edit spec; a text-and-sound track (headline, music, whoosh)
// and a captions track (one block per caption group, click to fix a word); strips from our server.
import { clamp, el, fmtRuler, fmtTime, fmtNum } from '../dom.mjs';

export class Timeline {
  constructor(view) { this.view = view; }

  zoomBy(dir, anchorClientX) {
    const steps = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
    const i = steps.findIndex((s) => s >= this.view.zoom - 1e-6);
    const at = i < 0 ? steps.length - 1 : i;
    this.setZoom(steps[clamp(at + dir, 0, steps.length - 1)], anchorClientX);
  }

  setZoom(z, anchorClientX) {
    const next = clamp(z, 1, 32);
    if (Math.abs(next - this.view.zoom) < 1e-6) return;
    const { tlScroll, timeline } = this.view.els;
    const box = tlScroll.getBoundingClientRect();
    let anchorPx;
    let anchorT;
    if (typeof anchorClientX === 'number') {
      anchorPx = clamp(anchorClientX - box.left, 0, box.width);
      anchorT = this.view.duration ? ((tlScroll.scrollLeft + anchorPx) / Math.max(1, timeline.clientWidth)) * this.view.duration : 0;
    } else {
      anchorT = this.view.playback.now();
      const x = this.view.duration ? (anchorT / this.view.duration) * timeline.clientWidth - tlScroll.scrollLeft : 0;
      anchorPx = x >= 0 && x <= box.width ? x : box.width / 2;
    }
    this.view.zoom = next;
    this.applyZoom();
    const full = tlScroll.clientWidth * this.view.zoom;
    tlScroll.scrollLeft = this.view.duration ? clamp((anchorT / this.view.duration) * full - anchorPx, 0, Math.max(0, full - tlScroll.clientWidth)) : 0;
  }

  applyZoom() {
    this.view.els.timeline.style.width = `${this.view.zoom * 100}%`;
    this.view.els.zoomLevel.textContent = this.view.zoom >= 10 || Number.isInteger(this.view.zoom) ? `${Math.round(this.view.zoom)}x` : `${this.view.zoom}x`;
    this.view.section.querySelectorAll('[data-zoom]').forEach((b) => {
      if (b.dataset.zoom === 'in') b.disabled = this.view.zoom >= 32;
      if (b.dataset.zoom === 'out' || b.dataset.zoom === 'fit') b.disabled = this.view.zoom <= 1;
    });
    this.renderRuler();
    this.loadStrips();
  }

  followPlayhead(t) {
    if (this.view.zoom <= 1 || this.view.scrubbing || !this.view.duration) return;
    const { tlScroll, timeline } = this.view.els;
    const full = timeline.clientWidth;
    const view = tlScroll.clientWidth;
    if (full <= view) return;
    const x = (t / this.view.duration) * full;
    const margin = view * 0.15;
    if (x < tlScroll.scrollLeft + margin || x > tlScroll.scrollLeft + view - margin) tlScroll.scrollLeft = clamp(x - view / 2, 0, full - view);
  }

  timeAtX(clientX) {
    const rect = this.view.els.timeline.getBoundingClientRect();
    return clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1) * this.view.duration;
  }

  segmentAt(t) { return this.view.segments.find((s) => t >= s.out_start - 1e-3 && t < s.out_end) || null; }

  onPointerDown(e) {
    if (e.button !== 0 || !this.view.duration) return;
    if (e.target.closest && e.target.closest('.cap-block')) return;   // a caption click opens the editor
    e.preventDefault();
    const stamp = performance.now();
    const isDouble = this.view.lastDown && stamp - this.view.lastDown.t < 400 && Math.abs(e.clientX - this.view.lastDown.x) < 8;
    this.view.lastDown = isDouble ? null : { t: stamp, x: e.clientX };
    if (isDouble) {
      const seg = this.segmentAt(this.timeAtX(e.clientX));
      if (seg) { this.view.markControls.markSegment(seg); return; }
    }
    this.view.els.timeline.setPointerCapture(e.pointerId);
    this.view.scrubbing = true;
    this.view.resumeAfterScrub = !this.view.els.video.paused;
    this.view.els.video.pause();
    this.view.scrubTime = this.timeAtX(e.clientX);
    this.view.playback.seek(this.view.scrubTime);
    this.view.playback.startLoop();
  }

  onPointerMove(e) {
    if (!this.view.scrubbing) return;
    this.view.scrubTime = this.timeAtX(e.clientX);
    this.view.playback.seek(this.view.scrubTime);
  }

  onPointerUp() {
    if (!this.view.scrubbing) return;
    this.view.scrubbing = false;
    this.view.playback.seek(this.view.scrubTime);
    if (this.view.resumeAfterScrub) this.view.els.video.play().catch(() => {});
  }

  pct(t) { return this.view.duration ? `${clamp((t / this.view.duration) * 100, 0, 100)}%` : '0%'; }

  place(node, a, b, minPx = 6) {
    node.style.left = this.pct(a);
    node.style.width = `max(${minPx}px, ${this.view.duration ? ((b - a) / this.view.duration) * 100 : 0}%)`;
  }

  renderRuler() {
    const ruler = this.view.els.ruler;
    ruler.textContent = '';
    const width = this.view.els.timeline.clientWidth;
    if (!this.view.duration || !width) return;
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const pxPerSec = width / this.view.duration;
    const step = steps.find((s) => s * pxPerSec >= 90) || 600;
    const minor = step / (step >= 10 ? 5 : 2);
    const frag = document.createDocumentFragment();
    for (let t = 0; t <= this.view.duration + 1e-6; t += minor) {
      const isMajor = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      const tick = el('div', { class: isMajor ? 'tick' : 'tick minor' });
      tick.style.left = this.pct(t);
      if (isMajor && (this.view.duration - t) * pxPerSec > 28) tick.textContent = fmtRuler(t, step);
      frag.append(tick);
    }
    ruler.append(frag);
  }

  /** Takes of the spec as blocks, with trim handles on both edges. */
  renderSegments() {
    const box = this.view.els.segments;
    box.textContent = '';
    this.view.nowKey = '';
    if (!this.view.duration) return;
    this.view.segments.forEach((s, i) => {
      const title = `Take ${s.id} · ${fmtTime(s.out_start)} → ${fmtTime(s.out_end)}\n${s.src} a partir de ${fmtTime(s.in)}`
        + `${s.quote ? `\n“${s.quote}”` : ''}\nDuplo clique para marcar o take inteiro · arraste a borda para ajustar o corte`;
      const block = el('div', { class: 'seg-block', title },
        el('span', { class: 'seg-beat', text: `${i + 1} · ${s.id}` }), s.quote ? el('span', { class: 'seg-quote', text: s.quote }) : null);
      block.dataset.segId = s.id;
      const tr = this.view.trimControls.trimOf(s.id);
      if (tr.start_delta || tr.end_delta) block.classList.add('is-trimmed');
      this.view.trimControls.placeBlock(block, s, tr.start_delta, tr.end_delta);
      this.view.trimControls.addHandles(block, s);
      box.append(block);
    });
    this.view.playback.renderTime();
  }

  /** Headline, music and sound effects of the spec. */
  renderLayers() {
    const box = this.view.els.layers;
    box.textContent = '';
    const sp = this.view.data && this.view.data.spec;
    if (!sp || !this.view.duration) return;
    for (const t of sp.texts) {
      const mode = t.mode === 'intro' ? ' (intro)' : t.mode === 'fixed' ? ' (fixa)' : '';
      const label = `${t.role === 'hook' ? 'Headline' : t.role}${mode}: ${t.lines.join(' / ')}`;
      const pill = el('div', { class: 'layer-pill is-text', text: label, title: `${label}\n${fmtTime(t.start)} → ${fmtTime(t.end)}` });
      this.place(pill, t.start, t.end);
      box.append(pill);
    }
    if (sp.music) {
      const level = sp.music.below_voice_db !== null ? `${fmtNum(sp.music.below_voice_db, 0)} LU abaixo da voz` : `${fmtNum(sp.music.gain_db ?? -6)} dB`;
      const pill = el('div', { class: 'layer-pill is-music', text: `Música: ${sp.music.name}`, title: `Música: ${sp.music.name}\n${level}, abaixa sob a fala` });
      this.place(pill, sp.music.start, this.view.duration);
      box.append(pill);
    }
    for (const s of sp.sfx) {
      const off = s.only_with_music && !sp.music;
      const dot = el('div', { class: `sfx-marker${off ? ' is-off' : ''}`, title: `${s.hook} em ${fmtTime(s.at)}${off ? ' (fica de fora: só toca com música)' : ''}` },
        el('span', { text: s.hook === 'whoosh' ? 'W' : '♪' }));
      dot.style.left = this.pct(s.at);
      box.append(dot);
    }
  }

  /** One block per caption group, words as the viewer reads them (fixes shown in place). */
  renderCaptions() {
    const box = this.view.els.captionsTrack;
    box.textContent = '';
    const sp = this.view.data && this.view.data.spec;
    if (!sp || !this.view.duration || !sp.caption_groups.length) { box.classList.add('is-empty'); return; }
    box.classList.remove('is-empty');
    for (const g of sp.caption_groups) {
      const text = [];
      let edited = false;
      for (let i = g.first; i < g.first + g.count; i += 1) {
        text.push(this.view.captions.wordText(i));
        if (this.view.captions.edits.has(i)) edited = true;
      }
      const block = el('button', {
        type: 'button', class: `cap-block${edited ? ' is-edited' : ''}`,
        title: `${text.join(' ')}\n${fmtTime(g.start)} → ${fmtTime(g.end)}\nClique para corrigir uma palavra`,
        text: text.join(' '),
      });
      block.dataset.first = String(g.first);
      block.dataset.count = String(g.count);
      block.addEventListener('click', () => this.view.captions.open(g));
      this.place(block, g.start, g.end, 4);
      box.append(block);
    }
  }

  loadStrips() {
    if (!this.view.mediaKey || !this.view.active) return;
    const width = this.view.els.timeline.clientWidth;
    if (!width) return;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const aspect = this.view.aspect || 9 / 16;
    const stripH = this.view.els.strip.clientHeight || 64;
    const n = clamp(Math.ceil(width / (stripH * aspect) / 4) * 4, 4, 160);
    const h = clamp(Math.round((stripH * dpr) / 16) * 16, 32, 192);
    const ver = this.view.mediaKey.slice(0, 12);
    const stripUrl = `/api/filmstrip?n=${n}&h=${h}&v=${ver}`;
    if (stripUrl !== this.view.stripUrl) {
      this.view.stripUrl = stripUrl;
      const { strip, stripImg } = this.view.els;
      strip.classList.add('is-loading');
      const img = new Image();
      img.onload = () => { if (this.view.stripUrl === stripUrl) { stripImg.src = stripUrl; strip.classList.remove('is-loading', 'is-empty'); } };
      img.onerror = () => { if (this.view.stripUrl === stripUrl) { strip.classList.remove('is-loading'); strip.classList.add('is-empty'); } };
      img.src = stripUrl;
    }
    const w = clamp(Math.round((width * dpr) / 250) * 250, 500, 4000);
    const waveUrl = `/api/waveform?w=${w}&h=104&v=${ver}`;
    if (waveUrl !== this.view.waveUrl) {
      this.view.waveUrl = waveUrl;
      const { wave, waveFill } = this.view.els;
      wave.classList.add('is-loading');
      const img = new Image();
      img.onload = () => {
        if (this.view.waveUrl !== waveUrl) return;
        waveFill.style.webkitMaskImage = `url("${waveUrl}")`;
        waveFill.style.maskImage = `url("${waveUrl}")`;
        wave.classList.remove('is-loading');
        wave.classList.add('is-ready');
      };
      img.onerror = () => { if (this.view.waveUrl === waveUrl) wave.classList.remove('is-loading'); };
      img.src = waveUrl;
    }
  }
}

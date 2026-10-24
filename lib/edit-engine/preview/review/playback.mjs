// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/review/playback.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: "now playing" shows the take and the caption under the playhead; pt-BR.
import { clamp, el, fmtTime } from '../dom.mjs';

export class Playback {
  constructor(view) { this.view = view; }

  now() {
    if (this.view.scrubbing) return this.view.scrubTime;
    if (this.view.seekTarget !== null) return this.view.seekTarget;
    return this.view.els.video.currentTime || 0;
  }

  togglePlay() {
    const { video } = this.view.els;
    if (!this.view.mediaKey) return;
    if (video.paused || video.ended) {
      if (video.ended || video.currentTime >= this.view.duration - 0.05) video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  seek(t) {
    const { video } = this.view.els;
    if (!this.view.duration) return;
    const target = clamp(t, 0, Math.max(0, this.view.duration - 0.001));
    this.view.seekTarget = target;
    if (!video.seeking) video.currentTime = target;
    this.renderTime();
  }

  onSeeked() {
    const { video } = this.view.els;
    if (this.view.seekTarget !== null && Math.abs(video.currentTime - this.view.seekTarget) > 0.0005) {
      video.currentTime = this.view.seekTarget;
      return;
    }
    this.view.seekTarget = null;
    this.renderTime();
  }

  stepFrames(dir) {
    const { video } = this.view.els;
    video.pause();
    const f = this.view.fps || 30;
    const idx = Math.round(this.now() * f);
    this.seek((idx + dir) / f + 0.0005);
  }

  jump(dir) { this.seek(this.now() + dir); }

  startLoop() {
    if (this.view.rafOn) return;
    this.view.rafOn = true;
    const loop = () => {
      this.renderTime();
      if (!this.view.els.video.paused || this.view.scrubbing) requestAnimationFrame(loop);
      else this.view.rafOn = false;
    };
    requestAnimationFrame(loop);
  }

  renderTime() {
    const t = this.now();
    const v = this.view;
    v.els.time.textContent = fmtTime(t);
    v.els.playhead.style.left = v.timeline.pct(t);
    v.timeline.followPlayhead(t);
    if (v.pendingIn !== null || v.noteDraft) {
      const a = v.noteDraft ? v.noteDraft.in : Math.min(v.pendingIn, t);
      const b = v.noteDraft ? v.noteDraft.out : Math.max(v.pendingIn, t);
      v.els.selection.hidden = false;
      v.els.selection.style.left = v.timeline.pct(a);
      v.els.selection.style.width = v.duration ? `${((b - a) / v.duration) * 100}%` : '0';
    } else {
      v.els.selection.hidden = true;
    }
    let idx = v.segments.findIndex((s) => t >= s.out_start - 1e-3 && t < s.out_end);
    if (idx === -1 && v.segments.length && t >= v.segments[v.segments.length - 1].out_start) idx = v.segments.length - 1;
    const word = v.words.find((w) => t >= w.start && t < w.end);
    const key = `${idx}|${word ? word.index : -1}`;
    if (key !== v.nowKey) {
      v.nowKey = key;
      v.els.segments.querySelectorAll('.seg-block').forEach((b, i) => b.classList.toggle('is-current', i === idx));
      v.els.captionsTrack.querySelectorAll('.cap-block').forEach((b) => b.classList.toggle('is-current', !!word && Number(b.dataset.first) <= word.index && word.index < Number(b.dataset.first) + Number(b.dataset.count)));
      v.els.now.textContent = '';
      const seg = v.segments[idx];
      if (seg) v.els.now.append(el('b', { text: `Take ${seg.id}` }), `${seg.src} a partir de ${fmtTime(seg.in)}`);
      if (word) v.els.now.append(el('b', { class: 'now-word', text: 'Legenda' }), v.captions.wordText(word.index));
    }
    const items = v.els.marksList.children;
    v.marks.forEach((m, i) => { if (items[i]) items[i].classList.toggle('is-current', t >= m.in && t <= m.out); });
  }
}

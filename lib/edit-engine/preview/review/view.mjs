// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/review/view.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: one review view over the rendered MP4 of our spec (no cut / final phases); takes,
// captions and sound tracks come from /api/state; adds caption fixes; pt-BR.
import { clamp, el, fmtTime } from '../dom.mjs';
import { Playback } from './playback.mjs';
import { Timeline } from './timeline.mjs';
import { Trims } from './trims.mjs';
import { Marks } from './marks.mjs';
import { Captions } from './captions.mjs';
import { Approval } from './approval.mjs';
import { toast } from '../toast.mjs';

export class Review {
  constructor(section) {
    this.section = section;
    const q = (sel) => section.querySelector(sel);
    this.els = {
      review: q('[data-review]'), frame: q('[data-frame]'), video: q('[data-video]'), bigPlay: q('[data-bigplay]'),
      videoMsg: q('[data-video-msg]'), play: q('[data-play]'), time: q('[data-time]'), duration: q('[data-duration]'),
      now: q('[data-now]'), timeline: q('[data-timeline]'), tlScroll: q('[data-tl-scroll]'),
      zoomLevel: q('[data-zoom-level]'), ruler: q('[data-ruler]'), layers: q('[data-layers]'),
      segments: q('[data-segments]'), captionsTrack: q('[data-captions-track]'),
      strip: q('[data-filmstrip]'), stripImg: q('[data-filmstrip-img]'), wave: q('[data-wave]'),
      overlay: q('[data-marks-overlay]'), selection: q('[data-selection]'), playhead: q('[data-playhead]'),
      trimsCard: q('[data-trims-card]'), trimsList: q('[data-trims-list]'), trimCount: q('[data-trim-count]'),
      trimsState: q('[data-trims-state]'), saveTrims: q('[data-save-trims]'), clearTrims: q('[data-clear-trims]'),
      captionsCard: q('[data-captions-card]'), captionEditor: q('[data-caption-editor]'), captionEdits: q('[data-caption-edits]'),
      captionCount: q('[data-caption-count]'), captionsState: q('[data-captions-state]'),
      saveCaptions: q('[data-save-captions]'), clearCaptions: q('[data-clear-captions]'),
      markCount: q('[data-mark-count]'), marksState: q('[data-marks-state]'), setIn: q('[data-set-in]'), setOut: q('[data-set-out]'),
      pending: q('[data-pending]'), noteBox: q('[data-note-box]'), noteRange: q('[data-note-range]'), noteInput: q('[data-note-input]'),
      noteCancel: q('[data-note-cancel]'), marksList: q('[data-marks-list]'), marksEmpty: q('[data-marks-empty]'),
      banner: q('[data-banner]'), saveMarks: q('[data-save-marks]'),
    };
    this.els.waveFill = el('div', { class: 'wave-fill' });
    this.els.wave.append(this.els.waveFill);

    this.data = null;
    this.mediaKey = null;      // sha256 of the MP4 on screen
    this.duration = 0;
    this.fps = 30;
    this.aspect = 9 / 16;
    this.segments = [];
    this.words = [];
    this.trackKey = '';
    this.nowKey = '';
    this.marks = [];
    this.dirty = false;
    this.marksSavedAt = null;
    this.trims = new Map();
    this.trimsDirty = false;
    this.trimsSavedAt = null;
    this.trimsSeen = null;
    this.dragTrim = null;
    this.pendingIn = null;
    this.noteDraft = null;
    this.scrubbing = false;
    this.scrubTime = 0;
    this.seekTarget = null;
    this.rafOn = false;
    this.active = false;
    this.stripUrl = '';
    this.waveUrl = '';
    this.approving = false;
    this.zoom = 1;
    this.playback = new Playback(this);
    this.timeline = new Timeline(this);
    this.trimControls = new Trims(this);
    this.markControls = new Marks(this);
    this.captions = new Captions(this);
    this.approval = new Approval(this);
    this.bind();
  }

  bind() {
    const { video, timeline } = this.els;
    const refresh = () => this.playback.renderTime();
    video.addEventListener('play', () => { this.els.frame.classList.add('is-playing'); this.els.review.classList.add('is-playing'); this.playback.startLoop(); });
    video.addEventListener('pause', () => { this.els.frame.classList.remove('is-playing'); this.els.review.classList.remove('is-playing'); refresh(); });
    video.addEventListener('ended', refresh);
    video.addEventListener('timeupdate', () => { if (!this.rafOn) refresh(); });
    video.addEventListener('seeked', () => this.playback.onSeeked());
    video.addEventListener('loadedmetadata', () => this.onMetadata());
    video.addEventListener('error', () => this.onVideoError());
    video.addEventListener('click', () => this.playback.togglePlay());
    this.els.bigPlay.addEventListener('click', () => this.playback.togglePlay());
    this.els.play.addEventListener('click', () => this.playback.togglePlay());
    this.section.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => this.playback.stepFrames(Number(b.dataset.step))));
    this.section.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => this.playback.jump(Number(b.dataset.jump))));

    timeline.addEventListener('pointerdown', (e) => this.timeline.onPointerDown(e));
    timeline.addEventListener('pointermove', (e) => this.timeline.onPointerMove(e));
    timeline.addEventListener('pointerup', (e) => this.timeline.onPointerUp(e));
    timeline.addEventListener('pointercancel', (e) => this.timeline.onPointerUp(e));
    timeline.addEventListener('lostpointercapture', (e) => this.timeline.onPointerUp(e));

    this.els.setIn.addEventListener('click', () => this.markControls.setIn());
    this.els.setOut.addEventListener('click', () => this.markControls.setOut());
    this.els.noteBox.addEventListener('submit', (e) => { e.preventDefault(); this.markControls.addMark(); });
    this.els.noteCancel.addEventListener('click', () => { this.markControls.closeNote(); this.playback.renderTime(); });
    this.els.noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.markControls.closeNote(); this.playback.renderTime(); }
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.markControls.addMark(); }
    });
    this.els.saveMarks.addEventListener('click', () => this.markControls.saveMarks());
    this.els.saveTrims.addEventListener('click', () => this.trimControls.saveTrims());
    this.els.clearTrims.addEventListener('click', () => {
      if (!this.trims.size) return;
      this.trims.clear();
      this.trimsDirty = true;
      this.timeline.renderSegments();
      this.trimControls.renderTrims();
    });
    this.els.saveCaptions.addEventListener('click', () => this.captions.save());
    this.els.clearCaptions.addEventListener('click', () => this.captions.clear());

    this.section.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
      const kind = b.dataset.zoom;
      if (kind === 'fit') this.timeline.setZoom(1);
      else this.timeline.zoomBy(kind === 'in' ? 1 : -1);
    }));
    this.els.tlScroll.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.timeline.zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX); }
      else if (this.zoom > 1 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); this.els.tlScroll.scrollLeft += e.deltaY; }
    }, { passive: false });

    let resizeTimer = null;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { this.timeline.renderRuler(); this.timeline.loadStrips(); }, 180);
    }).observe(timeline);
    this.timeline.applyZoom();
  }

  setActive(active) {
    this.active = active;
    if (!active && !this.els.video.paused) this.els.video.pause();
    if (active) requestAnimationFrame(() => { this.timeline.renderRuler(); this.timeline.loadStrips(); this.playback.renderTime(); });
  }

  update(data) {
    this.data = data;
    const sp = data.spec;
    this.fps = sp.fps || 30;
    this.aspect = sp.width && sp.height ? sp.width / sp.height : 9 / 16;
    if (data.video.sha256 !== this.mediaKey) this.loadMedia(data);

    const key = JSON.stringify([sp.duration, sp.takes, sp.texts, sp.words, sp.caption_groups, sp.sfx, sp.music]);
    if (key !== this.trackKey) {
      this.trackKey = key;
      this.words = sp.words;
      this.segments = sp.takes.map((t) => ({
        id: t.id, out_start: t.start, out_end: t.end, in: t.in, src: t.src, limits: t.limits,
        quote: sp.words.filter((w) => w.start >= t.start - 1e-3 && w.start < t.end).map((w) => w.word).join(' '),
      }));
      if (!this.duration) this.duration = sp.duration;
      this.timeline.renderSegments();
      this.timeline.renderLayers();
      this.captions.render();
      this.timeline.renderCaptions();
    }
    this.markControls.sync(data.feedback);
    this.trimControls.sync(data.feedback);
    this.captions.sync(data.feedback);
    this.approval.renderBanner();
  }

  loadMedia(data) {
    const { video } = this.els;
    const hadMedia = Boolean(this.mediaKey);
    const resumeAt = hadMedia ? this.playback.now() : 0;
    this.mediaKey = data.video.sha256;
    this.els.videoMsg.hidden = true;
    this.pendingResume = hadMedia ? { time: resumeAt, play: !video.paused } : null;
    video.src = `/media/video?v=${this.mediaKey.slice(0, 12)}`;
    video.load();
    this.stripUrl = '';
    this.waveUrl = '';
    this.marks = [];
    this.dirty = false;
    this.marksSavedAt = null;
    this.pendingIn = null;
    this.markControls.closeNote();
    this.markControls.restore(data.feedback);
    this.markControls.renderMarks();
    if (hadMedia) toast('Vídeo novo carregado.');
    requestAnimationFrame(() => { this.timeline.renderRuler(); this.timeline.loadStrips(); });
  }

  onMetadata() {
    const { video } = this.els;
    const specDur = this.data && this.data.spec ? Number(this.data.spec.duration) : 0;
    this.duration = isFinite(video.duration) && video.duration > 0 ? video.duration : specDur;
    this.els.duration.textContent = fmtTime(this.duration);
    if (video.videoWidth && video.videoHeight) {
      this.aspect = video.videoWidth / video.videoHeight;
      this.els.frame.style.setProperty('--ar', `${video.videoWidth} / ${video.videoHeight}`);
      this.els.review.classList.toggle('is-horizontal', video.videoWidth > video.videoHeight * 1.05);
    }
    if (this.pendingResume) {
      const { time, play } = this.pendingResume;
      this.pendingResume = null;
      video.currentTime = clamp(time, 0, Math.max(0, this.duration - 1 / this.fps));
      if (play) video.play().catch(() => {});
    }
    this.timeline.renderSegments();
    this.timeline.renderLayers();
    this.timeline.renderCaptions();
    this.timeline.renderRuler();
    this.markControls.renderMarks();
    this.timeline.loadStrips();
    this.playback.renderTime();
  }

  onVideoError() {
    if (!this.mediaKey) return;
    this.els.videoMsg.hidden = false;
    this.els.videoMsg.textContent = 'Não foi possível abrir o vídeo. Confira se o MP4 ainda está na pasta do spec.';
  }

  handleKey(e) {
    const key = e.key;
    if (e.code === 'Space' || key === ' ') { if (!e.repeat) this.playback.togglePlay(); return true; }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const dir = key === 'ArrowLeft' ? -1 : 1;
      if (e.shiftKey) this.playback.jump(dir); else this.playback.stepFrames(dir);
      return true;
    }
    if (key === 'i' || key === 'I') { this.markControls.setIn(); return true; }
    if (key === 'o' || key === 'O') { this.markControls.setOut(); return true; }
    if (key === '+' || key === '=') { this.timeline.zoomBy(1); return true; }
    if (key === '-' || key === '_') { this.timeline.zoomBy(-1); return true; }
    if (key === '0') { this.timeline.setZoom(1); return true; }
    if (key === 'Escape') { this.captions.close(); return this.markControls.cancelPending(); }
    return false;
  }
}

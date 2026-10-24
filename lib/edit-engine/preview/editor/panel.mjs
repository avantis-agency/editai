// Mini editor tab (EditAi, since 1.4.0): player with the live text layer, the few controls
// (headline, captions, sound), the four big buttons (Desfazer, Gerar prévia rápida, Aprovar,
// Finalizar), progress and the version list. Every change is saved to feedback.json on its own
// (short debounce) and is one Desfazer step on the server.
// 1.7.0, editor com IA: the "Você pede" / "A IA edita" panel (ai.mjs) and the 4-track timeline (tracks.mjs)
// share this player: the timeline moves its cursor, and the cursor and the selection go with each request.
// Patterns (radio cards, save state, postJson, toasts) from editonny 1.1.0 (commit 08e86fe),
// Copyright (c) 2026 Matheus Gomes, MIT License, full text in LICENSE-editonny.md.
import { clamp, el, fmtClock, fmtTime } from '../dom.mjs';
import { postJson } from '../api.mjs';
import { toast } from '../toast.mjs';
import { applyPicks } from './model.mjs';
import { loadFonts, Overlay } from './overlay.mjs';
import { AiPanel } from './ai.mjs';
import { Tracks } from './tracks.mjs';

const SAVE_MS = { style_text: 700, style: 150, words: 500, emphasis: 150 };

export class EditorPanel {
  constructor(section, app) {
    this.section = section;
    this.app = app;
    const q = (s) => section.querySelector(s);
    this.els = {
      frame: q('[data-ed-frame]'), video: q('[data-ed-video]'), canvas: q('[data-ed-overlay]'), bigPlay: q('[data-ed-bigplay]'),
      msg: q('[data-ed-msg]'), play: q('[data-ed-play]'), time: q('[data-ed-time]'), duration: q('[data-ed-duration]'),
      source: q('[data-ed-source]'), live: q('[data-ed-live]'), seek: q('[data-ed-seek]'), approx: q('[data-ed-approx]'),
      job: q('[data-ed-job]'), jobLabel: q('[data-ed-job-label]'), jobPct: q('[data-ed-job-pct]'), jobBar: q('[data-ed-job-bar]'), jobStage: q('[data-ed-job-stage]'),
      last: q('[data-ed-last]'), undo: q('[data-ed-undo]'), draft: q('[data-ed-draft]'), approve: q('[data-ed-approve]'), final: q('[data-ed-final]'),
      finalWhy: q('[data-ed-final-why]'), controls: q('[data-ed-controls]'),
      headline: q('[data-ed-headline]'), headlineHelp: q('[data-ed-headline-help]'), size: q('[data-ed-size]'), sizeLabel: q('[data-ed-size-label]'),
      words: q('[data-ed-words]'), wordEdit: q('[data-ed-word-edit]'), wordInput: q('[data-ed-word-input]'), wordEmph: q('[data-ed-word-emph]'),
      wordClose: q('[data-ed-word-close]'), wordWhat: q('[data-ed-word-what]'),
      music: q('[data-ed-music]'), gain: q('[data-ed-gain]'), gainLabel: q('[data-ed-gain-label]'), whoosh: q('[data-ed-whoosh]'),
      versions: q('[data-ed-versions]'), notes: q('[data-ed-notes]'), openTimeline: q('[data-ed-open-timeline]'), saved: q('[data-ed-saved]'),
    };
    this.overlay = new Overlay(this.els.canvas);
    this.data = null;
    this.picks = null;          // { style, words: Map, emphasis: Map }
    this.dirty = { style: false, words: false, emphasis: false };
    this.timers = {};
    this.saving = 0;
    this.seenRevision = null;
    this.mode = 'live';         // 'live' or 'version:<id>'
    this.src = '';
    this.fontsReady = false;
    this.baseAsked = false;
    this.lastJobAt = null;
    this.wordOpen = null;       // src index of the word being edited
    this.rafOn = false;
    this.active = true;
    this.tracks = new Tracks(section.querySelector('[data-trk]'), {
      seek: (t) => this.seek(t),
      onSelect: () => this.ai && this.ai.renderContext(),
    });
    this.ai = new AiPanel(section, {
      time: () => this.els.video.currentTime || 0,
      selection: () => this.tracks.selection,
      view: (id) => this.view(id),
      refresh: () => this.app.refresh(),
    });
    this.bind();
  }

  /** Moves the player's cursor (timeline clicks and drags). */
  seek(t) {
    const v = this.els.video;
    const d = v.duration || (this.data ? this.data.live.tracks.duration : 0);
    if (!d) return;
    v.pause();
    v.currentTime = clamp(t, 0, Math.max(0, d - 0.01));
    this.drawNow();
  }

  bind() {
    const { video, els } = { video: this.els.video, els: this.els };
    const redraw = () => this.drawNow();
    video.addEventListener('play', () => { els.frame.classList.add('is-playing'); this.section.classList.add('is-playing'); this.loop(); });
    video.addEventListener('pause', () => { els.frame.classList.remove('is-playing'); this.section.classList.remove('is-playing'); redraw(); });
    video.addEventListener('seeked', redraw);
    video.addEventListener('timeupdate', () => { if (!this.rafOn) redraw(); });
    video.addEventListener('loadedmetadata', () => this.onMetadata());
    video.addEventListener('error', () => { if (this.src) { els.msg.hidden = false; els.msg.textContent = 'Não foi possível abrir este vídeo.'; } });
    video.addEventListener('click', () => this.togglePlay());
    els.bigPlay.addEventListener('click', () => this.togglePlay());
    els.play.addEventListener('click', () => this.togglePlay());
    els.seek.addEventListener('input', () => {
      const d = video.duration || (this.data ? this.data.editor.overlay.duration : 0);
      if (d) { video.currentTime = (Number(els.seek.value) / 1000) * d; redraw(); }
    });

    els.headline.addEventListener('input', () => {
      const lines = this.lines();
      els.headline.classList.toggle('is-invalid', lines.length < 1 || lines.length > 3);
      els.headlineHelp.textContent = lines.length > 3 ? 'No máximo 3 linhas.' : lines.length < 1 ? 'Escreva a headline.' : 'Uma linha por linha da tela, até 3.';
      if (lines.length < 1 || lines.length > 3) return;
      this.change('style', (s) => { s.headline_lines = lines; }, SAVE_MS.style_text);
    });
    this.section.querySelectorAll('[data-ed-mode]').forEach((b) => b.addEventListener('click', () => this.change('style', (s) => { s.headline_mode = b.dataset.edMode; })));
    this.section.querySelectorAll('[data-ed-preset]').forEach((b) => b.addEventListener('click', () => this.change('style', (s) => { s.caption_preset = b.dataset.edPreset; })));
    els.size.addEventListener('input', () => this.change('style', (s) => { s.headline_size_pct = Number(els.size.value); }, 400));
    els.music.addEventListener('change', () => this.change('style', (s) => { s.music_enabled = els.music.checked; }));
    els.gain.addEventListener('input', () => this.change('style', (s) => { s.music_gain_delta_db = Number(els.gain.value); }, 400));
    els.whoosh.addEventListener('change', () => this.change('style', (s) => { s.whoosh_enabled = els.whoosh.checked; }));

    els.wordInput.addEventListener('input', () => {
      const i = this.wordOpen;
      const val = els.wordInput.value.trim();
      const bad = !val || /\s/.test(val);
      els.wordInput.classList.toggle('is-invalid', bad);
      if (bad || i === null) return;
      const w = this.word(i);
      this.change('words', (m) => { if (val === w.word) m.delete(i); else m.set(i, val); }, SAVE_MS.words);
    });
    els.wordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.closeWord(); } });
    els.wordEmph.addEventListener('change', () => {
      const i = this.wordOpen;
      if (i === null) return;
      const w = this.word(i);
      this.change('emphasis', (m) => { if (els.wordEmph.checked === w.emphasis) m.delete(i); else m.set(i, els.wordEmph.checked); });
    });
    els.wordClose.addEventListener('click', () => this.closeWord());

    els.undo.addEventListener('click', () => this.undo());
    els.draft.addEventListener('click', () => this.render('draft'));
    els.final.addEventListener('click', () => this.render('final'));
    els.approve.addEventListener('click', () => this.approve());
    els.openTimeline.addEventListener('click', () => this.app.setTab('review'));
    els.live.addEventListener('click', () => { this.mode = 'live'; this.render_(); });
    new ResizeObserver(() => this.drawNow()).observe(els.frame);
  }

  // ── data ───────────────────────────────────────────────────────────────────

  lines() { return this.els.headline.value.split('\n').map((l) => l.trim()).filter(Boolean); }
  word(i) { return this.data.editor.overlay.captions.words.find((w) => w.i === i); }

  update(data) {
    this.data = data;
    const ed = data.editor;
    if (!this.fontsPromise) this.fontsPromise = loadFonts(ed.overlay.fonts).then(() => { this.fontsReady = true; this.refreshOverlay(); });
    const fb = data.feedback;
    const rev = fb ? fb.revision : 0;
    if (rev !== this.seenRevision || !this.picks) { this.seenRevision = rev; this.syncPicks(); }
    if (ed.base.status === 'missing' && !ed.job && !this.baseAsked) {
      this.baseAsked = true;
      postJson('/api/render/base', {}).catch((err) => toast(err.message, 'error', 5000));
    }
    const lj = ed.last_job;
    if (lj && lj.at !== this.lastJobAt) {
      const first = this.lastJobAt === null;
      this.lastJobAt = lj.at;
      if (!first) {
        toast(lj.message, lj.ok ? 'ok' : 'error', 6000);
        if (lj.version && (lj.kind === 'draft' || lj.kind === 'final')) this.mode = `version:${lj.version}`;
      }
    }
    this.refreshOverlay();
    this.render_();
    if (data.live) {
      const b = ed.base;
      this.tracks.update(data.live.tracks, { ready: b.status === 'ready', sig: b.url ? (b.url.split('v=')[1] || '') : '' });
      this.ai.update(data.live, ed.job);
    }
  }

  /** Server values into the controls, for every section the person is not editing right now. */
  syncPicks() {
    const d = this.data, fb = d.feedback;
    const p = this.picks || { style: null, words: new Map(), emphasis: new Map() };
    if (!this.dirty.style) p.style = { headline_size_pct: 100, ...((fb && fb.style) || d.style_now) };
    if (!this.dirty.words) p.words = new Map(((fb && fb.caption_edits) || []).map((e) => [e.index, e.to]));
    if (!this.dirty.emphasis) p.emphasis = new Map(((fb && fb.emphasis) || []).map((e) => [e.index, e.on]));
    this.picks = p;
    this.fillControls();
  }

  fillControls() {
    const s = this.picks.style, els = this.els;
    if (document.activeElement !== els.headline) els.headline.value = s.headline_lines.join('\n');
    this.section.querySelectorAll('[data-ed-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.edMode === s.headline_mode)));
    this.section.querySelectorAll('[data-ed-preset]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.edPreset === s.caption_preset)));
    const lim = this.data.headline_size || { min: 80, max: 120 };
    els.size.min = String(lim.min); els.size.max = String(lim.max);
    if (document.activeElement !== els.size) els.size.value = String(s.headline_size_pct || 100);
    els.sizeLabel.textContent = `${s.headline_size_pct || 100}%`;
    els.music.checked = s.music_enabled;
    const sp = this.data.spec;
    els.music.disabled = !sp.music && !s.music_enabled;
    if (document.activeElement !== els.gain) els.gain.value = String(s.music_gain_delta_db);
    els.gain.disabled = !s.music_enabled || !sp.music;
    els.gainLabel.textContent = `${s.music_gain_delta_db > 0 ? '+' : s.music_gain_delta_db < 0 ? '−' : ''}${Math.abs(s.music_gain_delta_db)} dB`;
    els.whoosh.checked = s.whoosh_enabled;
    this.renderWords();
  }

  /** One local change: redraw now, save after `ms`. */
  change(section, fn, ms = SAVE_MS[section] || 150) {
    if (!this.picks) return;
    if (section === 'style') { this.picks.style = { ...this.picks.style }; fn(this.picks.style); }
    else fn(this.picks[section]);
    this.dirty[section] = true;
    this.mode = 'live';
    this.fillControls();
    this.refreshOverlay();
    this.render_();
    clearTimeout(this.timers[section]);
    this.timers[section] = setTimeout(() => this.save(section), ms);
  }

  async save(section) {
    clearTimeout(this.timers[section]);
    if (!this.dirty[section]) return;
    const ov = this.data.editor.overlay;
    let path, body;
    if (section === 'style') { path = '/api/style'; body = { ...this.picks.style, headline_lines: this.picks.style.headline_lines }; }
    else if (section === 'words') {
      path = '/api/captions';
      body = { edits: [...this.picks.words.entries()].map(([index, to]) => ({ index, from: ov.captions.words.find((w) => w.i === index).word, to })) };
    } else {
      path = '/api/emphasis';
      body = { edits: [...this.picks.emphasis.entries()].map(([index, on]) => ({ index, word: ov.captions.words.find((w) => w.i === index).word, on })) };
    }
    this.dirty[section] = false;
    this.saving += 1;
    this.render_();
    try {
      const res = await postJson(path, body);
      this.savedAt = res.saved_at;
      this.app.refresh();   // the server's view (finalize, undo) right away, not at the next poll
    } catch (err) {
      this.dirty[section] = true;
      toast(err.message, 'error', 5000);
    } finally {
      this.saving -= 1;
      this.render_();
    }
  }

  /** Sends every pending change now (before a render, an approval or an undo). */
  async flush() { await Promise.all(['style', 'words', 'emphasis'].map((s) => this.save(s))); }

  // ── actions ────────────────────────────────────────────────────────────────

  async undo() {
    if (Object.values(this.dirty).some(Boolean)) {
      // a change still waiting to be saved is the last change: drop it
      Object.keys(this.dirty).forEach((k) => { clearTimeout(this.timers[k]); this.dirty[k] = false; });
      this.syncPicks();
      this.refreshOverlay();
      this.render_();
      toast('Mudança desfeita.');
      return;
    }
    this.busy = true; this.render_();
    try {
      const res = await postJson('/api/undo', {});
      this.mode = 'live';
      toast(`Desfeito: ${res.undone}.`);
      await this.app.refresh();
    } catch (err) { toast(err.message, 'error', 5000); }
    finally { this.busy = false; this.render_(); }
  }

  async render(kind) {
    this.busy = true; this.render_();
    try {
      await this.flush();
      await postJson(`/api/render/${kind}`, {});
      toast(kind === 'draft' ? 'Gerando a prévia rápida…' : 'Gerando o vídeo final com o QA completo…');
      await this.app.refresh();
    } catch (err) { toast(err.message, 'error', 6000); }
    finally { this.busy = false; this.render_(); }
  }

  /** The video the Aprovar button approves: the one in the player, or the newest made from the current edits. */
  approveTarget() {
    const ed = this.data.editor;
    const all = [ed.original, ...ed.versions];
    if (this.mode.startsWith('version:')) return all.find((v) => v.id === this.mode.slice(8)) || null;
    return [...all].reverse().find((v) => v.current) || null;
  }

  async approve() {
    const t = this.approveTarget();
    if (!t) return;
    this.busy = true; this.render_();
    try {
      await this.flush();
      await postJson('/api/approve', { video_sha256: t.sha256, note: '' });
      toast(`${t.label} aprovado.`);
      await this.app.refresh();
    } catch (err) { toast(err.message, 'error', 5000); }
    finally { this.busy = false; this.render_(); }
  }

  async restore(id) {
    this.busy = true; this.render_();
    try {
      await this.flush();
      const res = await postJson('/api/restore', { version: id });
      this.mode = `version:${id}`;
      toast(`Feito: ${res.restored}. Os controles voltaram a essa versão.`);
      await this.app.refresh();
    } catch (err) { toast(err.message, 'error', 5000); }
    finally { this.busy = false; this.render_(); }
  }

  view(id) { this.mode = `version:${id}`; this.render_(); }

  // ── words ──────────────────────────────────────────────────────────────────

  renderWords() {
    const ov = this.data.editor.overlay;
    const box = this.els.words;
    box.textContent = '';
    if (!ov.captions) { box.append(el('p', { class: 'field-help', text: 'Este vídeo não tem legenda.' })); return; }
    for (const w of ov.captions.words) {
      const text = this.picks.words.has(w.i) ? this.picks.words.get(w.i) : w.word;
      const emph = this.picks.emphasis.has(w.i) ? this.picks.emphasis.get(w.i) : w.emphasis;
      const b = el('button', {
        type: 'button', class: `ed-word${emph ? ' is-emph' : ''}${this.picks.words.has(w.i) ? ' is-edited' : ''}${this.wordOpen === w.i ? ' is-open' : ''}`,
        text, title: `${fmtTime(w.start)} · clique para corrigir ou destacar`, 'aria-label': `${text}, ${fmtTime(w.start)}`, 'data-i': String(w.i),
      });
      b.addEventListener('click', () => this.openWord(w.i));
      box.append(b);
    }
  }

  openWord(i) {
    const w = this.word(i);
    this.wordOpen = i;
    const els = this.els;
    els.wordEdit.hidden = false;
    els.wordWhat.textContent = `Palavra em ${fmtTime(w.start)} (original: “${w.word}”)`;
    els.wordInput.value = this.picks.words.has(i) ? this.picks.words.get(i) : w.word;
    els.wordInput.classList.remove('is-invalid');
    els.wordEmph.checked = this.picks.emphasis.has(i) ? this.picks.emphasis.get(i) : w.emphasis;
    els.video.pause();
    els.video.currentTime = Math.min(w.end - 0.01, w.start + 0.12);
    this.mode = 'live';
    this.renderWords();
    this.render_();
    els.wordInput.focus();
  }

  closeWord() { this.wordOpen = null; this.els.wordEdit.hidden = true; this.renderWords(); }

  // ── player ─────────────────────────────────────────────────────────────────

  togglePlay() {
    const v = this.els.video;
    if (!this.src) return;
    if (v.paused || v.ended) { if (v.ended) v.currentTime = 0; v.play().catch(() => {}); } else v.pause();
  }

  loop() {
    if (this.rafOn) return;
    this.rafOn = true;
    const step = () => {
      this.drawNow();
      if (!this.els.video.paused) requestAnimationFrame(step); else this.rafOn = false;
    };
    requestAnimationFrame(step);
  }

  onMetadata() {
    const v = this.els.video;
    if (this.resume) { v.currentTime = Math.min(this.resume.t, Math.max(0, v.duration - 0.05)); if (this.resume.play) v.play().catch(() => {}); this.resume = null; }
    this.els.duration.textContent = fmtTime(v.duration);
    this.drawNow();
  }

  /** What the player shows: { url, overlay, label }. */
  source() {
    const ed = this.data.editor;
    if (this.mode.startsWith('version:')) {
      const id = this.mode.slice(8);
      const v = id === 'original' ? ed.original : ed.versions.find((x) => x.id === id);
      if (v) {
        const res = v.width ? `, ${v.width}x${v.height}` : '';
        return { url: v.url, overlay: false, label: id === 'original' ? 'Vendo: o vídeo original, como foi entregue' : `Vendo: ${v.label} (vídeo de verdade${res})` };
      }
      this.mode = 'live';
    }
    if (ed.base.status === 'ready' && this.fontsReady) return { url: ed.base.url, overlay: true, label: 'Vendo: suas mudanças ao vivo (o texto é desenhado pela página)' };
    const why = ed.base.status === 'stale' ? 'os cortes mudaram; a prévia rápida atualiza o vídeo limpo'
      : ed.job && ed.job.kind === 'base' ? `preparando o vídeo limpo, ${ed.job.percent}%` : 'preparando o vídeo limpo';
    return { url: ed.original.url, overlay: false, label: `Vendo: o original (${why})` };
  }

  refreshOverlay() {
    if (!this.data || !this.picks || !this.fontsReady) return;
    this.overlay.set(applyPicks(this.data.editor.overlay, this.picks), this.data.editor.overlay.fonts);
    this.drawNow();
  }

  drawNow() {
    const v = this.els.video;
    const t = v.currentTime || 0;
    this.overlay.draw(t);
    this.els.time.textContent = fmtTime(t);
    const d = v.duration || 0;
    if (d && document.activeElement !== this.els.seek) this.els.seek.value = String(Math.round((t / d) * 1000));
    if (this.tracks) this.tracks.setTime(t);
    if (this.ai && v.paused) this.ai.renderContext();
  }

  // ── view ───────────────────────────────────────────────────────────────────

  render_() {
    if (!this.data || !this.picks) return;
    const ed = this.data.editor, els = this.els;
    const src = this.source();
    if (src.url !== this.src) {
      const v = els.video;
      this.resume = this.src ? { t: v.currentTime || 0, play: !v.paused } : null;
      this.src = src.url;
      els.msg.hidden = true;
      v.src = src.url;
      v.load();
    }
    this.overlay.visible = src.overlay;
    els.canvas.hidden = !src.overlay;
    els.source.textContent = src.label;
    els.live.hidden = !this.mode.startsWith('version:');
    els.approx.hidden = !src.overlay;
    this.drawNow();

    const job = ed.job;
    const running = !!job;
    const pending = Object.values(this.dirty).some(Boolean) || this.saving > 0;
    els.job.hidden = !running;
    if (job) {
      els.jobLabel.textContent = job.label;
      els.jobPct.textContent = `${job.percent}%`;
      els.jobBar.style.width = `${clamp(job.percent, 0, 100)}%`;
      els.jobStage.textContent = `${job.stage_pt} · ${job.elapsed_s} s`;
    }
    const lj = ed.last_job;
    els.last.hidden = !lj || running;
    if (lj) { els.last.textContent = `${fmtClock(lj.at)} · ${lj.message}`; els.last.classList.toggle('is-error', !lj.ok); }
    els.controls.disabled = running;

    const busy = running || this.busy;
    els.undo.disabled = busy || (!pending && !ed.undo.count);
    els.undo.textContent = pending ? 'Desfazer a última mudança' : ed.undo.count ? `Desfazer (${ed.undo.last})` : 'Desfazer';
    els.draft.disabled = busy;
    const t = this.approveTarget();
    const approvedHere = ed.approved && t && ed.approved.version === t.id && ed.approved.matches;
    els.approve.disabled = busy || !t || approvedHere || pending;
    els.approve.textContent = !t ? 'Aprovar (gere a prévia rápida primeiro)' : approvedHere ? `${t.label}: aprovado` : `Aprovar: ${t.label}`;
    els.approve.classList.toggle('is-done', !!approvedHere);
    const block = pending ? 'Salvando a última mudança…' : ed.finalize_block;
    els.final.disabled = busy || !!block;
    els.finalWhy.textContent = block || `Pronto para finalizar: sai em 1080x1920 com o QA completo e vai para Downloads como “${ed.final_name}”.`;
    els.saved.textContent = pending ? 'Salvando…' : this.data.feedback ? `Tudo salvo · revisão ${this.data.feedback.revision}` : 'Nada mudado ainda';

    this.renderVersions();
    const n = ed.notes_pending;
    els.notes.textContent = n
      ? `${n} nota${n > 1 ? 's' : ''} livre${n > 1 ? 's' : ''} precisa${n > 1 ? 'm' : ''} do agente editor (retention-editor). Elas não entram na prévia nem no final; ficam em pending-notes.md.`
      : 'Nenhuma nota livre. Para pedir algo que os controles não fazem, marque o trecho na linha do tempo e escreva.';
  }

  renderVersions() {
    const ed = this.data.editor;
    const list = this.els.versions;
    const busy = !!ed.job || this.busy;
    const now = this.mode.startsWith('version:') ? this.mode.slice(8) : null;
    // rebuilt only when something in it changed (a rebuild on every poll replaced the buttons under the pointer)
    const key = JSON.stringify([now, busy, ed.approved, ed.original.current, ed.versions.map((v) => [v.id, v.current, v.download, v.download_error, v.qa && v.qa.verdict])]);
    if (key === this.versionsKey) return;
    this.versionsKey = key;
    list.textContent = '';
    for (const v of [ed.original, ...ed.versions].reverse()) {
      const meta = [];
      if (v.created_at) meta.push(fmtClock(v.created_at));
      if (v.width) meta.push(`${v.width}x${v.height}`);
      if (v.qa) meta.push(`QA ${v.qa.verdict}`);
      if (v.download) meta.push(`em Downloads: ${v.download}`);
      if (v.download_error) meta.push(`não copiado: ${v.download_error}`);
      if (v.current) meta.push('igual às mudanças atuais');
      if (ed.approved && ed.approved.version === v.id) meta.push(ed.approved.matches ? 'aprovado' : 'aprovado antes da última mudança');
      const watch = el('button', { type: 'button', class: 'btn small', text: now === v.id ? 'No player' : 'Ver', disabled: now === v.id, 'aria-label': `Ver no player: ${v.label}` });
      watch.addEventListener('click', () => this.view(v.id));
      const back = el('button', { type: 'button', class: 'btn small ghost', text: 'Voltar a esta', disabled: busy || v.current, 'aria-label': `Voltar a esta versão: ${v.label}`, title: 'Os controles voltam ao que esta versão tinha (dá para desfazer)' });
      back.addEventListener('click', () => this.restore(v.id));
      const li = el('li', { class: `ed-version${now === v.id ? ' is-on' : ''}${v.qa && v.qa.verdict === 'FAIL' ? ' is-fail' : ''}` },
        el('div', { class: 'ed-version-text' }, el('strong', { text: v.label }), el('span', { text: meta.join(' · ') })),
        el('div', { class: 'ed-version-actions' }, watch, back));
      if (v.qa && v.qa.problems && v.qa.problems.length) li.append(el('ul', { class: 'ed-qa' }, v.qa.problems.slice(0, 4).map((p) => el('li', { text: p }))));
      list.append(li);
    }
  }

  setActive(active) {
    this.active = active;
    if (!active && !this.els.video.paused) this.els.video.pause();
    if (active) requestAnimationFrame(() => this.drawNow());
  }

  handleKey(e) {
    if (e.code === 'Space' || e.key === ' ') { if (!e.repeat) this.togglePlay(); return true; }
    if (e.key === 'Escape' && this.tracks.selection) { this.tracks.setSelection(null); return true; }
    return false;
  }
}

// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/review/marks.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: saved into feedback.json (marks become pending notes for the retention-editor);
// no motion marks; drafts kept per video sha256; pt-BR.
import { el, fmtClock, fmtSeconds, fmtTime, store, TRASH_SVG } from '../dom.mjs';
import { postJson } from '../api.mjs';
import { toast } from '../toast.mjs';

export class Marks {
  constructor(view) { this.view = view; }

  get draftKey() { return `editai-preview:marks:${this.view.mediaKey}`; }
  /** Draft key before 2.0.0 (retention-video-studio): read once and moved to draftKey. */
  get legacyDraftKey() { return `rvs-preview:marks:${this.view.mediaKey}`; }

  /** Unsent draft first, then what feedback.json has for this video. */
  restore(fb) {
    let draft = store.get(this.draftKey);
    if (!draft && (draft = store.get(this.legacyDraftKey))) { store.set(this.draftKey, draft); store.del(this.legacyDraftKey); }
    if (draft && Array.isArray(draft.marks)) { this.view.marks = draft.marks; this.view.dirty = true; return; }
    if (fb && fb.video_sha256 === this.view.mediaKey && Array.isArray(fb.marks)) {
      this.view.marks = fb.marks.map((m) => ({ in: m.in, out: m.out, note: m.note || '' }));
      this.view.dirty = false;
      this.view.marksSavedAt = fb.saved_at ? fb.saved_at.marks || null : null;
    }
  }

  /** On every poll: picks up marks saved elsewhere (another tab, the API) unless the person is editing. */
  sync(fb) {
    const stamp = `${this.view.mediaKey}|${fb && fb.saved_at ? fb.saved_at.marks || '' : ''}`;
    if (stamp === this.seen) return;
    const first = this.seen === undefined || !this.seen.startsWith(`${this.view.mediaKey}|`);
    this.seen = stamp;
    if (first || this.view.dirty || this.view.noteDraft || this.view.pendingIn !== null) return;
    this.restore(fb);
    this.renderMarks();
    this.view.approval.renderBanner();
  }

  setIn() {
    if (!this.view.mediaKey) return;
    this.closeNote();
    this.view.pendingIn = this.view.playback.now();
    this.view.els.pending.hidden = false;
    this.view.els.pending.textContent = `Início em ${fmtTime(this.view.pendingIn)}. Vá até o fim do trecho e marque.`;
    this.view.playback.renderTime();
  }

  setOut() {
    if (!this.view.mediaKey) return;
    const t = this.view.playback.now();
    let a = this.view.pendingIn;
    let b = t;
    let auto = false;
    if (a === null) { a = Math.max(0, t - 1); auto = true; }
    if (b < a) [a, b] = [b, a];
    if (b - a < 0.1) b = Math.min(this.view.duration, a + 0.5);
    this.view.els.video.pause();
    this.view.pendingIn = null;
    this.view.els.pending.hidden = true;
    this.openNote(a, b, auto ? `${fmtSeconds(b - a)}, o segundo antes deste ponto` : fmtSeconds(b - a));
  }

  markSegment(seg) {
    if (!this.view.mediaKey) return;
    this.view.els.video.pause();
    this.closeNote();
    this.view.pendingIn = null;
    this.view.els.pending.hidden = true;
    const a = seg.out_start, b = Math.min(this.view.duration, seg.out_end);
    this.view.playback.seek(a);
    this.openNote(a, b, `${fmtSeconds(b - a)}, o take ${seg.id} inteiro`);
  }

  openNote(a, b, detail) {
    this.view.noteDraft = { in: Math.round(a * 1000) / 1000, out: Math.round(b * 1000) / 1000 };
    this.view.els.noteRange.textContent = `${fmtTime(a)} → ${fmtTime(b)}`;
    this.view.els.noteRange.append(el('small', { text: detail }));
    this.view.els.noteBox.hidden = false;
    this.view.els.noteInput.value = '';
    this.view.playback.renderTime();
    requestAnimationFrame(() => this.view.els.noteInput.focus());
  }

  closeNote() {
    this.view.noteDraft = null;
    this.view.els.noteBox.hidden = true;
  }

  cancelPending() {
    const had = this.view.pendingIn !== null || !this.view.els.noteBox.hidden;
    this.view.pendingIn = null;
    this.view.els.pending.hidden = true;
    this.closeNote();
    this.view.playback.renderTime();
    return had;
  }

  addMark() {
    if (!this.view.noteDraft) return;
    this.view.marks.push({ ...this.view.noteDraft, note: this.view.els.noteInput.value.trim() });
    this.view.marks.sort((x, y) => x.in - y.in || x.out - y.out);
    this.closeNote();
    this.view.els.noteInput.blur();
    this.markDirty();
  }

  deleteMark(index) {
    this.view.marks.splice(index, 1);
    this.markDirty();
  }

  markDirty() {
    this.view.dirty = true;
    store.set(this.draftKey, { marks: this.view.marks });
    this.renderMarks();
  }

  renderMarks() {
    const v = this.view;
    v.els.marksList.textContent = '';
    v.els.overlay.textContent = '';
    v.marks.forEach((m, i) => {
      const range = el('button', { class: 'mark-range', type: 'button', title: 'Ir para este trecho', text: `${fmtTime(m.in)} → ${fmtTime(m.out)}` });
      range.addEventListener('click', () => { v.els.video.pause(); v.playback.seek(m.in); });
      const note = el('input', { class: 'mark-note', type: 'text', maxlength: '500', placeholder: 'Escreva o que mudar', 'aria-label': `Nota da marcação ${i + 1}` });
      note.value = m.note || '';
      note.addEventListener('input', () => { m.note = note.value; v.dirty = true; store.set(this.draftKey, { marks: v.marks }); this.renderMarksState(); });
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') note.blur(); });
      const del = el('button', { class: 'icon-btn small danger', type: 'button', 'aria-label': `Apagar marcação ${i + 1}`, title: 'Apagar marcação', html: TRASH_SVG });
      del.addEventListener('click', () => this.deleteMark(i));
      v.els.marksList.append(el('li', { class: 'mark-item' }, el('span', { class: 'mark-number', text: String(i + 1) }), range, note, del));
      const region = el('div', { class: 'mark-region' }, el('span', { text: String(i + 1) }));
      region.style.left = v.timeline.pct(m.in);
      region.style.width = v.duration ? `max(2px, ${((m.out - m.in) / v.duration) * 100}%)` : '0';
      v.els.overlay.append(region);
    });
    v.els.marksEmpty.hidden = v.marks.length > 0;
    v.els.markCount.textContent = v.marks.length ? `(${v.marks.length})` : '';
    this.renderMarksState();
    v.playback.renderTime();
  }

  renderMarksState() {
    const v = this.view;
    const st = v.els.marksState;
    st.classList.remove('is-dirty', 'is-saved');
    if (v.dirty) { st.textContent = v.marks.length ? 'Ainda não enviado' : 'Mudança não enviada'; st.classList.add('is-dirty'); }
    else if (v.marksSavedAt) { st.textContent = `Enviado às ${fmtClock(v.marksSavedAt)}`; st.classList.add('is-saved'); }
    else st.textContent = '';
    v.els.saveMarks.disabled = !v.dirty;
    v.els.saveMarks.classList.toggle('attention', v.dirty && v.marks.length > 0);
  }

  async saveMarks() {
    const v = this.view;
    if (!v.dirty) return;
    if (!v.els.noteBox.hidden && v.noteDraft) this.addMark();
    v.els.saveMarks.disabled = true;
    try {
      const res = await postJson('/api/marks', { marks: v.marks });
      v.dirty = false;
      v.marksSavedAt = res.saved_at;
      v.marks = res.saved.map((m) => ({ ...m }));
      store.del(this.draftKey);
      toast(v.marks.length ? 'Marcações salvas. Elas viram notas pendentes para o retention-editor.' : 'Marcações apagadas.');
      this.renderMarks();
      v.approval.renderBanner();
    } catch (err) {
      toast(err.message, 'error', 5000);
      this.renderMarksState();
    }
  }
}

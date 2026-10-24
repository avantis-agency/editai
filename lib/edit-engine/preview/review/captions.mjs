// Caption word fixes for the EditAi preview (new, not in editonny).
// Built on the editonny 1.1.0 review patterns (marks.mjs, trims.mjs), Copyright (c) 2026
// Matheus Gomes, MIT License, full text in LICENSE-editonny.md.
// A fix changes the text of one word; its timing stays (words come from a transcriber, never invented).
import { el, fmtClock, fmtTime, TRASH_SVG } from '../dom.mjs';
import { postJson } from '../api.mjs';
import { toast, SAVED_HINT } from '../toast.mjs';

export class Captions {
  constructor(view) {
    this.view = view;
    this.edits = new Map();       // word index -> new text
    this.dirty = false;
    this.savedAt = null;
    this.seen = null;
    this.openGroup = null;
  }

  word(index) { return this.view.words[index]; }
  wordText(index) { return this.edits.has(index) ? this.edits.get(index) : (this.word(index) ? this.word(index).word : ''); }

  /** Editor for one caption group: one input per word. */
  open(group) {
    const v = this.view;
    this.openGroup = group;
    v.els.video.pause();
    v.playback.seek(group.start);
    const box = v.els.captionEditor;
    box.textContent = '';
    box.hidden = false;
    box.append(el('div', { class: 'note-range', text: `${fmtTime(group.start)} → ${fmtTime(group.end)}` }));
    const row = el('div', { class: 'caption-words' });
    for (let i = group.first; i < group.first + group.count; i += 1) {
      const w = this.word(i);
      const input = el('input', { type: 'text', class: 'caption-word', maxlength: '40', spellcheck: 'true', 'aria-label': `Palavra ${i + 1}: ${w.word}`, title: `Original: ${w.word} (${fmtTime(w.start)})` });
      input.value = this.wordText(i);
      input.addEventListener('input', () => {
        const val = input.value.trim();
        input.classList.toggle('is-invalid', !val || /\s/.test(val));
        if (!val || /\s/.test(val)) return;
        if (val === w.word) this.edits.delete(i); else this.edits.set(i, val);
        this.dirty = true;
        this.render();
        v.timeline.renderCaptions();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.close(); } });
      row.append(input);
    }
    box.append(row, el('p', { class: 'field-help', text: 'Uma palavra por campo, sem espaço. A pontuação faz parte da palavra (o bold-word esconde a do fim).' }));
    const done = el('button', { type: 'button', class: 'btn ghost', text: 'Fechar' });
    done.addEventListener('click', () => this.close());
    box.append(el('div', { class: 'note-actions' }, done));
    requestAnimationFrame(() => { const first = row.querySelector('input'); if (first) first.focus(); });
  }

  close() {
    this.openGroup = null;
    this.view.els.captionEditor.hidden = true;
  }

  render() {
    const v = this.view;
    const list = v.els.captionEdits;
    list.textContent = '';
    [...this.edits.entries()].sort((a, b) => a[0] - b[0]).forEach(([i, to]) => {
      const w = this.word(i);
      const row = el('li', { class: 'trim-row' },
        el('span', { class: 'trim-when', text: fmtTime(w.start) }),
        el('span', { class: 'trim-what', text: `“${w.word}” → “${to}”` }));
      const del = el('button', { class: 'icon-btn small danger', type: 'button', 'aria-label': 'Desfazer esta correção', title: 'Desfazer', html: TRASH_SVG });
      del.addEventListener('click', () => { this.edits.delete(i); this.dirty = true; this.render(); v.timeline.renderCaptions(); });
      row.append(del);
      list.append(row);
    });
    v.els.captionsCard.hidden = !v.words.length;
    v.els.captionCount.textContent = this.edits.size ? String(this.edits.size) : '';
    const st = v.els.captionsState;
    st.classList.remove('is-dirty', 'is-saved');
    if (this.dirty) { st.textContent = this.edits.size ? 'Ainda não enviado' : 'Mudança não enviada'; st.classList.add('is-dirty'); }
    else if (this.savedAt) { st.textContent = `Enviado às ${fmtClock(this.savedAt)}`; st.classList.add('is-saved'); }
    else st.textContent = '';
    v.els.saveCaptions.disabled = !this.dirty;
    v.els.saveCaptions.classList.toggle('attention', this.dirty && this.edits.size > 0);
    v.els.clearCaptions.disabled = this.edits.size === 0;
  }

  clear() {
    if (!this.edits.size) return;
    this.edits.clear();
    this.dirty = true;
    this.render();
    this.view.timeline.renderCaptions();
    if (this.openGroup) this.open(this.openGroup);
  }

  async save() {
    if (!this.dirty) return;
    this.view.els.saveCaptions.disabled = true;
    const edits = [...this.edits.entries()].map(([index, to]) => ({ index, from: this.word(index).word, to }));
    try {
      const res = await postJson('/api/captions', { edits });
      this.dirty = false;
      this.savedAt = res.saved_at;
      toast(edits.length ? `Correções de legenda salvas no feedback. ${SAVED_HINT}` : 'Correções de legenda apagadas.');
    } catch (err) {
      toast(err.message, 'error', 5000);
    }
    this.render();
  }

  /** Loads the saved fixes of this video unless the person is typing. */
  sync(fb) {
    const stamp = `${this.view.mediaKey}|${fb && fb.saved_at ? fb.saved_at.caption_edits || '' : ''}`;
    if (stamp === this.seen) return;
    this.seen = stamp;
    if (this.dirty) return;
    this.edits.clear();
    const fresh = fb && fb.video_sha256 === this.view.mediaKey;
    this.savedAt = fresh && fb.saved_at ? fb.saved_at.caption_edits || null : null;
    if (fresh) for (const e of fb.caption_edits || []) if (this.word(e.index) && this.word(e.index).word === e.from) this.edits.set(e.index, e.to);
    this.render();
    this.view.timeline.renderCaptions();
  }
}

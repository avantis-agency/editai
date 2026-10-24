// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/review/trims.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: segments are takes of our spec; each edge is clamped to what the source clip has
// (limits from the server); saved into feedback.json; pt-BR.
import { clamp, el, fmtClock, fmtTime, fmtNum, TRASH_SVG } from '../dom.mjs';
import { postJson } from '../api.mjs';
import { toast, SAVED_HINT } from '../toast.mjs';

export class Trims {
  constructor(view) { this.view = view; }

  trimOf(id) { return this.view.trims.get(id) || { start_delta: 0, end_delta: 0 }; }

  limit(seg, side, value) {
    const lim = seg.limits;
    return side === 'start' ? clamp(value, lim.start_min, lim.start_max) : clamp(value, lim.end_min, lim.end_max);
  }

  addHandles(block, seg) {
    ['start', 'end'].forEach((side) => {
      const grip = el('button', {
        class: `seg-handle ${side}`, type: 'button', tabindex: '-1',
        'aria-label': side === 'start' ? 'Ajustar o início do take' : 'Ajustar o fim do take',
        title: side === 'start'
          ? 'Arraste para a esquerda para recuperar o começo da fala, para a direita para encurtar (Shift: mais fino; setas: 0,01 s)'
          : 'Arraste para a direita para recuperar o fim da fala, para a esquerda para encurtar (Shift: mais fino; setas: 0,01 s)',
      });
      grip.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        e.stopPropagation();
        this.nudgeTrim(seg, side, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.05 : 0.01));
      });
      grip.addEventListener('pointerdown', (e) => this.onTrimDown(e, seg, side, block, grip));
      grip.addEventListener('pointermove', (e) => this.onTrimMove(e));
      grip.addEventListener('pointerup', (e) => this.onTrimUp(e));
      grip.addEventListener('pointercancel', (e) => this.onTrimUp(e));
      grip.addEventListener('lostpointercapture', (e) => this.onTrimUp(e));
      block.append(grip);
    });
  }

  onTrimDown(e, seg, side, block, grip) {
    if (e.button !== 0 || !this.view.duration) return;
    e.preventDefault();
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    grip.focus({ preventScroll: true });
    grip.classList.add('is-on');
    block.classList.add('is-dragging');
    const cur = this.trimOf(seg.id);
    const base = side === 'start' ? cur.start_delta : cur.end_delta;
    this.view.dragTrim = { seg, side, block, grip, x0: e.clientX, base, delta: base, badge: el('div', { class: 'seg-delta' }) };
    block.append(this.view.dragTrim.badge);
    this.paintDrag();
  }

  trimRate(fine) {
    const perSec = this.view.els.timeline.clientWidth / Math.max(0.001, this.view.duration);
    return Math.min(1 / Math.max(1, perSec), 0.01) / (fine ? 3 : 1);
  }

  onTrimMove(e) {
    const d = this.view.dragTrim;
    if (!d) return;
    e.preventDefault();
    const raw = d.base + (e.clientX - d.x0) * this.trimRate(e.shiftKey);
    d.delta = this.limit(d.seg, d.side, Math.round(raw * 100) / 100);
    this.paintDrag();
  }

  set(seg, cur) {
    if (!cur.start_delta && !cur.end_delta) this.view.trims.delete(seg.id);
    else this.view.trims.set(seg.id, cur);
    this.view.trimsDirty = true;
    this.view.timeline.renderSegments();
    this.renderTrims();
  }

  nudgeTrim(seg, side, step) {
    const cur = { ...this.trimOf(seg.id) };
    const key = side === 'start' ? 'start_delta' : 'end_delta';
    cur[key] = this.limit(seg, side, Math.round((cur[key] + step) * 100) / 100);
    this.set(seg, cur);
    const again = [...this.view.els.segments.children].find((b) => b.dataset.segId === seg.id);
    const grip = again && again.querySelector(`.seg-handle.${side}`);
    if (grip) { grip.classList.add('is-on'); grip.focus({ preventScroll: true }); }
  }

  onTrimUp() {
    const d = this.view.dragTrim;
    if (!d) return;
    this.view.dragTrim = null;
    d.grip.classList.remove('is-on');
    d.block.classList.remove('is-dragging');
    d.badge.remove();
    const cur = { ...this.trimOf(d.seg.id) };
    cur[d.side === 'start' ? 'start_delta' : 'end_delta'] = d.delta;
    this.set(d.seg, cur);
  }

  paintDrag() {
    const d = this.view.dragTrim;
    if (!d) return;
    const cur = this.trimOf(d.seg.id);
    const sd = d.side === 'start' ? d.delta : cur.start_delta;
    const ed = d.side === 'end' ? d.delta : cur.end_delta;
    this.placeBlock(d.block, d.seg, sd, ed);
    d.badge.textContent = d.delta === 0 ? 'sem mudança' : `${d.delta > 0 ? '+' : '−'}${fmtNum(Math.abs(d.delta), 2)} s ${d.side === 'start' ? 'no início' : 'no fim'}`;
  }

  placeBlock(block, seg, sd, ed) {
    const a = seg.out_start + (sd || 0);
    const b = seg.out_end + (ed || 0);
    block.style.left = `calc(${this.view.timeline.pct(a)} + 1px)`;
    block.style.width = `calc(${this.view.duration ? clamp(((b - a) / this.view.duration) * 100, 0, 100) : 0}% - 2px)`;
  }

  describe(t) {
    const bits = [];
    if (t.start_delta) bits.push(`${t.start_delta < 0 ? 'estender' : 'encurtar'} ${fmtNum(Math.abs(t.start_delta), 2)} s no início`);
    if (t.end_delta) bits.push(`${t.end_delta > 0 ? 'estender' : 'encurtar'} ${fmtNum(Math.abs(t.end_delta), 2)} s no fim`);
    return bits.join(' · ');
  }

  renderTrims() {
    const list = this.view.els.trimsList;
    list.textContent = '';
    const rows = [...this.view.trims.entries()].map(([id, t]) => ({ id, ...t, seg: this.view.segments.find((s) => s.id === id) }))
      .sort((a, b) => (a.seg ? a.seg.out_start : 0) - (b.seg ? b.seg.out_start : 0));
    rows.forEach((r) => {
      const row = el('li', { class: 'trim-row' },
        el('span', { class: 'trim-when', text: r.seg ? fmtTime(r.seg.out_start) : r.id }),
        el('span', { class: 'trim-what', text: r.seg && r.seg.quote ? `${r.id} · “${r.seg.quote}”` : r.id, title: r.seg ? r.seg.quote : r.id }),
        el('span', { class: 'trim-delta', text: this.describe(r) }));
      const del = el('button', { class: 'icon-btn small danger', type: 'button', 'aria-label': 'Desfazer este ajuste', title: 'Desfazer', html: TRASH_SVG });
      del.addEventListener('click', () => { this.view.trims.delete(r.id); this.view.trimsDirty = true; this.view.timeline.renderSegments(); this.renderTrims(); });
      row.append(del);
      list.append(row);
    });
    const n = this.view.trims.size;
    const v = this.view;
    v.els.trimsCard.hidden = n === 0 && !v.trimsSavedAt && !v.trimsDirty;
    v.els.trimCount.textContent = n ? String(n) : '';
    const st = v.els.trimsState;
    st.classList.remove('is-dirty', 'is-saved');
    if (v.trimsDirty) { st.textContent = n ? 'Ainda não enviado' : 'Mudança não enviada'; st.classList.add('is-dirty'); }
    else if (v.trimsSavedAt) { st.textContent = `Enviado às ${fmtClock(v.trimsSavedAt)}`; st.classList.add('is-saved'); }
    else st.textContent = '';
    v.els.saveTrims.disabled = !v.trimsDirty;
    v.els.saveTrims.classList.toggle('attention', v.trimsDirty && n > 0);
    v.els.clearTrims.disabled = n === 0;
  }

  async saveTrims() {
    if (!this.view.trimsDirty) return;
    this.view.els.saveTrims.disabled = true;
    const payload = [...this.view.trims.entries()].map(([id, t]) => ({ id, start_delta: t.start_delta, end_delta: t.end_delta }));
    try {
      const res = await postJson('/api/trims', { trims: payload });
      this.view.trimsDirty = false;
      this.view.trimsSavedAt = res.saved_at;
      toast(payload.length ? `Ajustes de corte salvos no feedback. ${SAVED_HINT}` : 'Ajustes de corte apagados.');
    } catch (err) {
      toast(err.message, 'error', 5000);
    }
    this.renderTrims();
  }

  /** Loads the saved trims of this video unless the person is editing. */
  sync(fb) {
    const stamp = `${this.view.mediaKey}|${fb && fb.saved_at ? fb.saved_at.trims || '' : ''}`;
    if (stamp === this.view.trimsSeen) return;
    this.view.trimsSeen = stamp;
    if (this.view.trimsDirty) return;
    this.view.trims.clear();
    const fresh = fb && fb.video_sha256 === this.view.mediaKey;
    this.view.trimsSavedAt = fresh && fb.saved_at ? fb.saved_at.trims || null : null;
    if (fresh) for (const t of fb.trims || []) this.view.trims.set(t.id, { start_delta: Number(t.start_delta) || 0, end_delta: Number(t.end_delta) || 0 });
    this.view.timeline.renderSegments();
    this.renderTrims();
  }
}

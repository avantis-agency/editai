// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/app.js and app-shell.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: two tabs (Editor, Linha do tempo); the Editor tab is the mini editor (1.4.0, editor/*.mjs) that
// replaced the Estilo tab; status from feedback.json; pt-BR.
import { Review } from './review/view.mjs';
import { EditorPanel } from './editor/panel.mjs';
import { fmtClock, isTypingTarget } from './dom.mjs';
import { toast } from './toast.mjs';
import { updateSession } from './api.mjs';

const POLL_MS = 2000;
const TABS = ['editor', 'review'];

const App = {
  data: null,
  tab: null,
  connected: null,
  shownErrors: new Set(),

  init() {
    this.review = new Review(document.getElementById('view-review'));
    this.editor = new EditorPanel(document.getElementById('view-editor'), this);
    document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => this.setTab(btn.dataset.tab)));
    document.getElementById('help-btn').addEventListener('click', () => this.openHelp());
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('keyup', (e) => {
      if ((e.code === 'Space' || e.key === ' ') && e.target && e.target.tagName === 'BUTTON' && this.tab === 'review') e.preventDefault();
    });
    window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.includes(t)) this.setTab(t); });
    const fromHash = location.hash.slice(1);
    this.setTab(TABS.includes(fromHash) ? fromHash : 'editor');
    this.poll();
  },

  setTab(tab) {
    if (!TABS.includes(tab)) return;
    const changed = tab !== this.tab;
    this.tab = tab;
    document.querySelectorAll('.tab').forEach((btn) => btn.setAttribute('aria-selected', String(btn.dataset.tab === tab)));
    TABS.forEach((name) => { document.getElementById(`view-${name}`).hidden = name !== tab; });
    this.review.setActive(tab === 'review');
    this.editor.setActive(tab === 'editor');
    if (changed && location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
    if (changed) window.scrollTo(0, 0);
  },

  openHelp() {
    const dialog = document.getElementById('help-dialog');
    if (!dialog.open) dialog.showModal();
  },

  onKey(e) {
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const typing = isTypingTarget(e.target);
    if (e.key === '?' && !typing) { e.preventDefault(); this.openHelp(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.tab === 'review' && this.review.handleKey(e)) e.preventDefault();
    if (this.tab === 'editor' && this.editor.handleKey(e)) e.preventDefault();
  },

  /** Reads the state now (after an action), outside the 2 s poll. */
  async refresh() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) this.apply(await res.json());
    } catch { /* the poll reports it */ }
  },

  async poll() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      this.setConnected(true);
      this.apply(data);
    } catch {
      this.setConnected(false);
    } finally {
      setTimeout(() => this.poll(), POLL_MS);
    }
  },

  setConnected(ok) {
    if (ok === this.connected) return;
    const was = this.connected;
    this.connected = ok;
    document.getElementById('statusline').classList.toggle('is-offline', !ok);
    if (!ok) {
      document.getElementById('status-text').textContent = 'A prévia desconectou. Confira se ela ainda está rodando. Tentando de novo…';
      document.getElementById('status-meta').textContent = '';
    } else if (was === false) {
      toast('Prévia reconectada.');
    }
  },

  apply(data) {
    this.data = data;
    updateSession(data);
    this.review.update(data);
    this.editor.update(data);
    const name = data.spec ? data.spec.id : '';
    const project = document.getElementById('project-name');
    if (project.textContent !== name) { project.textContent = name; document.title = name ? `${name} · EditAi` : 'EditAi · Mini editor'; }
    const fb = data.feedback;
    const line = document.getElementById('statusline');
    line.classList.add('is-working');
    const ed = data.editor;
    document.getElementById('status-text').textContent = ed && ed.job
      ? `${ed.job.label}: ${ed.job.percent}%`
      : ed && !ed.finalize_block
        ? 'Versão aprovada. Pode finalizar.'
        : 'Peça em “Você pede” ou mude o texto e veja na hora. A prévia rápida mostra o vídeo de verdade. Aprove e finalize.';
    const parts = [`feedback: ${data.feedback_file}`];
    if (fb) parts.push(`revisão ${fb.revision}`, `salvo às ${fmtClock(fb.updated_at)}`);
    document.getElementById('status-meta').textContent = parts.join(' · ');
    for (const msg of data.errors || []) {
      if (!this.shownErrors.has(msg)) { this.shownErrors.add(msg); toast(msg, 'error', 6000); }
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());

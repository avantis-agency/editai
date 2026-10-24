// Editor com IA (EditAi, since 1.7.0): the "Você pede" box and the "A IA edita" list.
// A request goes with its context (cursor time and the timeline selection). Quick commands are applied by
// the engine at once; the rest waits for the person's own agent (Claude Code or Codex), which answers
// through `cli.ts agent-reply`. Each request shows its status and has its own Desfazer.
// The text is shown with textContent only (never as HTML).
import { el, fmtClock, fmtTime } from '../dom.mjs';
import { postJson } from '../api.mjs';
import { toast } from '../toast.mjs';

const STATUS = {
  fila: { label: 'na fila', cls: 'is-queue' },
  aplicando: { label: 'aplicando', cls: 'is-busy' },
  feito: { label: 'feito', cls: 'is-done' },
  precisa: { label: 'precisa de você', cls: 'is-ask' },
  'nao-deu': { label: 'não deu', cls: 'is-fail' },
  desfeito: { label: 'desfeito', cls: 'is-undone' },
};

export class AiPanel {
  /** host: { time() -> cursor seconds, selection() -> {start,end}|null, clearSelection(), view(versionId), refresh() } */
  constructor(section, host) {
    this.host = host;
    const q = (s) => section.querySelector(s);
    this.els = {
      form: q('[data-ai-form]'), input: q('[data-ai-input]'), send: q('[data-ai-send]'), ctx: q('[data-ai-context]'), agent: q('[data-ai-agent]'),
      list: q('[data-ai-list]'), empty: q('[data-ai-empty]'), badge: q('[data-ai-badge]'), helpBtn: q('[data-ai-help]'), counter: q('[data-ai-counter]'),
      reply: q('[data-ai-reply]'), replyText: q('[data-ai-reply-text]'), replyCancel: q('[data-ai-reply-cancel]'),
    };
    this.help = document.getElementById('ai-help-dialog');
    this.data = null;
    this.sending = false;
    this.followUp = null;
    this.listKey = '';
    this.seen = new Map();
    this.bind();
  }

  bind() {
    const els = this.els;
    els.form.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    els.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); }
      if (e.key === 'Escape') { e.preventDefault(); els.input.blur(); }
    });
    els.input.addEventListener('input', () => this.renderContext());
    els.helpBtn.addEventListener('click', () => this.openHelp());
    els.replyCancel.addEventListener('click', () => { this.followUp = null; this.renderContext(); });
  }

  async send() {
    const text = this.els.input.value.trim();
    if (!text || this.sending) return;
    const max = (this.data && this.data.max_text) || 500;
    if (text.length > max) { toast(`Pedido longo demais (máximo ${max} letras).`, 'error'); return; }
    this.sending = true;
    this.renderContext();
    const sel = this.host.selection();
    try {
      const body = { text, cursor: Math.round(this.host.time() * 1000) / 1000, selection: sel, ...(this.followUp ? { follow_up: this.followUp } : {}) };
      const res = await postJson('/api/request', body);
      this.els.input.value = '';
      this.followUp = null;
      const r = res.request;
      if (r.source === 'agente' && r.status === 'fila') toast(this.data && this.data.agent.waiting ? 'Pedido enviado ao seu agente.' : 'Pedido na fila. Ligue o seu agente para ele pegar (veja "O que eu posso pedir?").');
      await this.host.refresh();
    } catch (err) {
      toast(err.message, 'error', 6000);
    } finally {
      this.sending = false;
      this.renderContext();
    }
  }

  async undo(id) {
    try {
      const res = await postJson('/api/request/undo', { id });
      toast(res.message);
      await this.host.refresh();
    } catch (err) { toast(err.message, 'error', 6000); }
  }

  answer(r) {
    this.followUp = r.id;
    this.renderContext();
    this.els.input.focus();
  }

  update(live, job) {
    this.data = live;
    this.job = job || null;
    this.renderContext();
    this.renderList();
  }

  /** The context line under the box: cursor, selection, the request being answered, the agent. */
  renderContext() {
    const els = this.els;
    const sel = this.host.selection();
    els.ctx.textContent = `Vai junto: cursor em ${fmtTime(this.host.time())}${sel ? ` · seleção ${fmtTime(sel.start)} → ${fmtTime(sel.end)}` : ' · sem seleção (arraste numa faixa para selecionar)'}`;
    const max = (this.data && this.data.max_text) || 500;
    const n = els.input.value.length;
    els.counter.textContent = n > max * 0.8 ? `${n}/${max}` : '';
    els.send.disabled = this.sending || !els.input.value.trim();
    const fu = this.followUp && this.data ? this.data.requests.find((r) => r.id === this.followUp) : null;
    els.reply.hidden = !fu;
    if (fu) els.replyText.textContent = `Respondendo: “${fu.reply || fu.text}”`;
    els.input.placeholder = fu ? 'Sua resposta…' : 'Ex.: tira essa pausa';
    if (!this.data) return;
    const a = this.data.agent;
    els.agent.textContent = a.waiting
      ? 'Seu agente está ligado e pega os pedidos livres.'
      : this.data.pending
        ? `${this.data.pending} pedido(s) esperando o seu agente. Ligue o agente (Claude Code ou Codex) com agent-inbox.`
        : 'Comandos rápidos saem na hora. O resto vai para o seu agente (Claude Code ou Codex), se ele estiver ligado.';
    els.agent.classList.toggle('is-on', !!a.waiting);
    els.badge.hidden = !this.data.busy;
  }

  renderList() {
    const reqs = this.data.requests;
    const pct = this.job && this.job.kind === 'draft' ? this.job.percent : null;
    const key = JSON.stringify([pct, reqs.map((r) => [r.id, r.status, r.reply, r.draft, r.draft_error, r.can_undo])]);
    // a request that changed status since the last poll: tell the person (the page may be in another tab)
    for (const r of reqs) {
      const was = this.seen.get(r.id);
      if (was && was !== r.status && (r.status === 'feito' || r.status === 'precisa' || r.status === 'nao-deu')) {
        toast(`${r.id}: ${STATUS[r.status].label}${r.reply ? ` · ${r.reply}` : ''}`, r.status === 'feito' ? 'ok' : r.status === 'nao-deu' ? 'error' : 'info', 6000);
        if (r.status === 'feito' && r.draft) this.host.view(r.draft);
      }
      this.seen.set(r.id, r.status);
    }
    if (key === this.listKey) return;
    this.listKey = key;
    const list = this.els.list;
    list.textContent = '';
    this.els.empty.hidden = reqs.length > 0;
    for (const r of reqs) {
      const st = STATUS[r.status] || { label: r.status, cls: '' };
      const when = r.selection ? `${fmtTime(r.selection.start)} → ${fmtTime(r.selection.end)}` : fmtTime(r.cursor);
      const meta = [fmtClock(r.created_at), when, r.source === 'rapido' ? 'comando rápido' : 'seu agente'];
      if (r.draft) meta.push(`prévia: ${r.draft.replace('draft', 'Prévia ')}`);
      const li = el('li', { class: `ai-item ${st.cls}` },
        el('div', { class: 'ai-item-head' },
          el('span', { class: 'ai-dot', 'aria-hidden': 'true' }),
          el('span', { class: 'ai-status', text: st.label }),
          el('span', { class: 'ai-id', text: r.id })),
        el('p', { class: 'ai-text', text: `“${r.text}”` }),
        r.reply ? el('p', { class: 'ai-reply', text: r.reply }) : null,
        r.status === 'aplicando' ? el('p', { class: 'ai-wait', text: r.source === 'agente' && !r.reply ? 'Seu agente está editando…' : `Gerando a prévia rápida…${pct !== null ? ` ${pct}%` : ''}` }) : null,
        r.draft_error ? el('p', { class: 'ai-err', text: `A prévia não saiu: ${r.draft_error}` }) : null,
        el('p', { class: 'ai-meta', text: meta.join(' · ') }));
      const actions = el('div', { class: 'ai-actions' });
      if (r.status === 'precisa') {
        const b = el('button', { type: 'button', class: 'btn small accent-soft', text: 'Responder' });
        b.addEventListener('click', () => this.answer(r));
        actions.append(b);
      }
      if (r.draft) {
        const b = el('button', { type: 'button', class: 'btn small', text: 'Ver prévia', 'aria-label': `Ver a prévia do pedido ${r.id}` });
        b.addEventListener('click', () => this.host.view(r.draft));
        actions.append(b);
      }
      if (r.can_undo) {
        const b = el('button', { type: 'button', class: 'btn small ghost', text: 'Desfazer', 'aria-label': `Desfazer o pedido ${r.id}`, 'data-ai-undo': r.id });
        b.addEventListener('click', () => this.undo(r.id));
        actions.append(b);
      }
      if (actions.childNodes.length) li.append(actions);
      list.append(li);
    }
  }

  openHelp() {
    const d = this.help;
    const box = d.querySelector('[data-ai-help-list]');
    box.textContent = '';
    for (const h of (this.data && this.data.quick_help) || []) box.append(el('li', {}, el('strong', { text: h.say }), el('span', { text: h.does })));
    if (!d.open) d.showModal();
  }
}

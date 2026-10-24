// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/feedback.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: renamed (feedback.json is our output file); no agent hand-off nudge.
import { el } from './dom.mjs';

export function toast(message, kind = 'ok', ms = 3400) {
  const wrap = document.getElementById('toasts');
  const node = el('div', { class: `toast${kind === 'error' ? ' is-error' : ''}`, role: kind === 'error' ? 'alert' : 'status', text: message });
  wrap.append(node);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 300);
  }, ms);
}

export function confirmBox({ title, text, ok }) {
  const dialog = document.getElementById('confirm-dialog');
  dialog.querySelector('[data-confirm-title]').textContent = title;
  dialog.querySelector('[data-confirm-text]').textContent = text;
  dialog.querySelector('[data-confirm-ok]').textContent = ok;
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
    dialog.querySelector('[data-confirm-ok]').focus();
  });
}

export const SAVED_HINT = 'Para ver no vídeo: Gerar prévia rápida, na aba Editor.';

// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/dom.mjs and constants.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: pt-BR number and clock formats; only the helpers this preview uses.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const TRASH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'style') Object.assign(node.style, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function fmtTime(seconds) {
  if (seconds === null || seconds === undefined || !isFinite(seconds)) return '--:--';
  const s = Math.max(0, seconds);
  let m = Math.floor(s / 60);
  let rest = Math.round((s - m * 60) * 100) / 100;
  if (rest >= 60) { m += 1; rest -= 60; }
  return `${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`;
}

export function fmtRuler(seconds, step) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const secText = step < 1 ? s.toFixed(1).padStart(4, '0') : String(Math.round(s)).padStart(2, '0');
  return `${m}:${secText}`;
}

export function fmtClock(value) {
  const d = typeof value === 'number' ? new Date(value) : new Date(Date.parse(value));
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const fmtNum = (n, digits = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtSeconds = (sec) => `${fmtNum(Math.round(sec * 10) / 10)} s`;
export const fmtDb = (db) => `${db > 0 ? '+' : db < 0 ? '−' : ''}${fmtNum(Math.abs(db))} dB`;

export const isTypingTarget = (target) => {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  return tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(target.type);
};

export const store = {
  get(key) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

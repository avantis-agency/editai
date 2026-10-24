// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/api.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: pt-BR messages; no agent watcher.

const session = { token: '' };
export const getSession = () => ({ ...session });
export function updateSession(data) { if (data && data.token) session.token = data.token; }

async function refreshToken() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    const data = await res.json();
    session.token = data.token || '';
  } catch { /* offline: the save below reports it */ }
}

/** POST JSON with the per-run token; on 403 the token is refreshed once (the server may have restarted). */
export async function postJson(path, body, retried = false) {
  if (!session.token) await refreshToken();
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Preview-Token': session.token },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('A prévia desconectou. Ela ainda está rodando?');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && !retried) { session.token = ''; return postJson(path, body, true); }
  if (!res.ok || !data.ok) throw new Error(data.error ? `Não foi possível salvar: ${data.error}` : `Não foi possível salvar (erro ${res.status}).`);
  return data;
}

// Adapted from editonny 1.1.0 (commit 08e86fe), skills/editonny/engine/preview/review/approval.mjs
// Copyright (c) 2026 Matheus Gomes. MIT License, full text in LICENSE-editonny.md.
// Changed: one phase; pt-BR. 1.4.0: the approve button moved to the Editor tab (it approves a draft,
// a final or the original by sha256); this tab only shows the banner.
import { fmtClock } from '../dom.mjs';

export class Approval {
  constructor(view) { this.view = view; }

  renderBanner() {
    const v = this.view;
    const { banner } = v.els;
    if (!v.mediaKey) return;
    const fb = v.data && v.data.feedback;
    const approval = fb && fb.approval && fb.approval.approved ? fb.approval : null;
    banner.className = 'banner';
    if (approval) {
      banner.hidden = false;
      banner.classList.add('is-approved');
      const which = approval.version && approval.version !== 'original' ? `a versão ${approval.version}` : 'o vídeo original';
      banner.textContent = `Você aprovou ${which} às ${fmtClock(fb.saved_at && fb.saved_at.approval)}. Finalizar fica na aba Editor.`;
    } else if (!v.dirty && v.marks.length && v.marksSavedAt) {
      banner.hidden = false;
      banner.classList.add('is-info');
      banner.textContent = `Marcações enviadas às ${fmtClock(v.marksSavedAt)}. As notas livres precisam do agente editor (retention-editor).`;
    } else {
      banner.hidden = true;
    }
  }
}

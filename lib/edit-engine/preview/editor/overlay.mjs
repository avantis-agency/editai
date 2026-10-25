// Mini editor (EditAi, since 1.4.0): draws the headline and captions over the player, in the
// video's own 1080x1920 coordinates, on a <canvas> layered on the <video>. Same font file (Anton, from
// assets/fonts), the libass baseline (centred on winAscent + winDescent), round-joined outline that does
// not grow with \fscx, shadow at 45 % (libass BackColour &H8C000000). An approximation: the quick preview
// shows the real render.
import { captionAt, emPx, baselineEm, fit, hookLines, hookMotion, hookSegments } from './model.mjs';

const loaded = new Map();   // family -> Promise

/** Loads the spec's fonts from /fonts/ under the name "EditAi <family>". */
export function loadFonts(fonts) {
  const jobs = Object.entries(fonts || {}).map(([family, m]) => {
    if (!loaded.has(family)) {
      const face = new FontFace(`EditAi ${family}`, `url(${m.url})`, { weight: /bold/i.test(m.file) ? '700' : '400' });
      loaded.set(family, face.load().then((f) => { document.fonts.add(f); return true; }).catch(() => false));
    }
    return loaded.get(family);
  });
  return Promise.all(jobs);
}

const fontCss = (style, px) => `${style.bold === true || /inter/i.test(style.font_family || 'Inter') ? '700' : '400'} ${px}px "EditAi ${style.font_family || 'Inter'}", sans-serif`;

export class Overlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.shadow = document.createElement('canvas');
    this.sctx = this.shadow.getContext('2d');
    this.eff = null;
    this.fonts = {};
    this.visible = true;
  }

  /** New effective model (after applyPicks); fits it with real glyph widths. */
  set(eff, fonts) {
    this.fonts = fonts || {};
    if (this.canvas.width !== eff.W || this.canvas.height !== eff.H) {
      this.canvas.width = eff.W; this.canvas.height = eff.H;
      this.shadow.width = eff.W; this.shadow.height = eff.H;
    }
    this.eff = fit(eff, this.fonts, (segs, em, style) => this.layout(segs, em, style).ink);
  }

  /** Advance layout of one line of segments (each at em * scale); ink = first glyph's left ink to last glyph's right ink. */
  layout(segs, em, style) {
    const ctx = this.ctx;
    let adv = 0;
    const parts = segs.map((s) => {
      const px = em * s.scale;
      ctx.font = fontCss(style, px);
      const m = ctx.measureText(s.text);
      const trimmed = s.text.replace(/\s+$/, '');
      const mt = trimmed === s.text ? m : ctx.measureText(trimmed);
      const p = { ...s, px, x: adv, w: m.width, inkL: m.actualBoundingBoxLeft, inkR: mt.actualBoundingBoxRight };
      adv += m.width;
      return p;
    });
    if (!parts.length) return { parts, width: 0, ink: 0 };
    const width = adv;
    const first = parts[0], last = parts[parts.length - 1];
    const ink = (last.x + last.inkR) - (first.x - first.inkL);
    return { parts, width, ink };
  }

  /** Draws one line centred on (x, y) the way libass places \an5 text. */
  drawLine(segs, x, y, em, style, alpha, scale = 1) {
    const { parts, width } = this.layout(segs, em, style);
    if (!parts.length || alpha <= 0) return;
    const maxScale = Math.max(...parts.map((p) => p.scale));
    const base = baselineEm(style.font_family, this.fonts) * em * maxScale;
    const outline = style.outline_px ?? 4, shadow = style.shadow_px ?? 2;
    const paint = (ctx, dx, dy, pass) => {
      ctx.save();
      ctx.translate(x + dx, y + dy);
      ctx.scale(scale, scale);
      for (const p of parts) {
        ctx.font = fontCss(style, p.px);
        const px = -width / 2 + p.x;
        if (pass === 'shadow') {
          ctx.lineWidth = (2 * outline) / scale; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
          if (outline) ctx.strokeText(p.text, px, base);
          ctx.fillText(p.text, px, base);
        } else if (pass === 'stroke') {
          if (!outline) continue;
          ctx.lineWidth = (2 * outline) / scale; ctx.lineJoin = 'round'; ctx.strokeStyle = style.outline_color || '#000000';
          ctx.strokeText(p.text, px, base);
        } else {
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, px, base);
        }
      }
      ctx.restore();
    };
    if (shadow && style.shadow_blur) {
      // soft shadow (2.3.0, ass.ts softShadow): blurred copy, offset (0.6 d, d), at shadow_alpha, no outline
      this.sctx.clearRect(0, 0, this.shadow.width, this.shadow.height);
      this.sctx.save();
      this.sctx.filter = `blur(${style.shadow_blur / 2}px)`;
      paint(this.sctx, shadow * 0.6, shadow, 'shadow');
      this.sctx.restore();
      this.ctx.save();
      this.ctx.globalAlpha = (style.shadow_alpha ?? 0.85) * alpha;
      this.ctx.drawImage(this.shadow, 0, 0);
      this.ctx.restore();
    } else if (shadow) {
      this.sctx.clearRect(0, 0, this.shadow.width, this.shadow.height);
      paint(this.sctx, shadow, shadow, 'shadow');
      this.ctx.save();
      this.ctx.globalAlpha = 0.45 * alpha;
      this.ctx.drawImage(this.shadow, 0, 0);
      this.ctx.restore();
    }
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    paint(this.ctx, 0, 0, 'stroke');
    paint(this.ctx, 0, 0, 'fill');
    this.ctx.restore();
  }

  draw(t) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const e = this.eff;
    if (!e || !this.visible) return;
    const h = e.hook;
    if (h && t >= h.start && t < h.end) {
      const mo = hookMotion(h, t, e.duration);
      const em = emPx(h.style, this.fonts);
      for (const line of hookLines(h, this.fonts)) this.drawLine(hookSegments(line.text, h), h.x, line.y + mo.dy, em, h.style, mo.alpha, mo.scale);
    }
    const c = e.cap;
    if (c) {
      const at = captionAt(c, t, e.groupFont || null);
      if (at) this.drawLine(at.segs, c.x, at.y, at.font || emPx(c.style, this.fonts), c.style, at.alpha);
    }
  }
}

// Rendu Canvas 2D (Retina). Les chemins sont construits en coordonnées monde
// puis tracés en px écran, pour des épaisseurs de trait constantes.
import { TAU, arcInfo, niceStep } from '../core/geom.js';
import { ORIGIN_ID } from '../core/model.js';
import { isDimension } from '../core/solver.js';
import { dimLayout, dimLabel, layoutBadges, REL_GLYPH } from './annotations.js';

const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
export const BADGE_R = 9;
const GRID_MIN_PX = 3;      // lignes les plus fines : au moins 3 px d'écart (très légères, comme du papier millimétré)
const GRID_FULL_PX = 6;     // en dessous de cet écart, les lignes fines s'estompent
const GRID_SNAP_PX = 10;    // aimantation sur les lignes fines dès 10 px d'écart, sinon tous les 5 pas
const GRID_STRONG_PX = 250; // espacement à partir duquel une ligne est au plus marqué

export class Renderer {
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.vp = viewport;
    this.dpr = 1;
  }

  resize(w, h) {
    this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  /** Construit un chemin en coordonnées monde, puis remet la transformation écran. */
  worldPath(fn) {
    const { ctx, vp, dpr } = this;
    const k = vp.scale * dpr;
    ctx.setTransform(k, 0, 0, -k, vp.ox * dpr, vp.oy * dpr);
    ctx.beginPath();
    fn(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  screen() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  /** Pas de grille (mm) adapté au zoom : au moins ~minPx entre deux lignes. */
  gridStep(minPx = 36, unitFactor = 1) {
    return niceStep(this.vp.pxToWorld(minPx) / unitFactor) * unitFactor;
  }

  /**
   * Grille « papier millimétré » : lignes fines tous les 10ⁿ (dans l'unité courante),
   * plus marquées tous les 5 et 10 pas. minor : pas le plus fin (mm), snap : pas d'aimantation (mm),
   * celui des lignes bien visibles.
   */
  gridInfo(unitFactor = 1) {
    const unitPx = this.vp.scale * unitFactor;
    const n = Math.ceil(Math.log10(GRID_MIN_PX / unitPx) - 1e-9);
    const minor = Math.pow(10, n) * unitFactor;
    const minorPx = minor * this.vp.scale;
    return { minor, minorPx, snap: minorPx >= GRID_SNAP_PX ? minor : minor * 5 };
  }

  /** Largeur approximative du texte d'une cote (px), pour le test de toucher. */
  dimTextSize(label) {
    this.ctx.font = `13px ${FONT}`;
    return { w: this.ctx.measureText(label).width + 10, h: 20 };
  }

  draw(st) {
    const { ctx, vp } = this;
    const C = st.colors;
    this.screen();
    ctx.clearRect(0, 0, vp.width, vp.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawContent(st);

    // Rectangle de sélection
    if (st.box) {
      const a = vp.toScreen({ x: st.box.minX, y: st.box.maxY });
      const b = vp.toScreen({ x: st.box.maxX, y: st.box.minY });
      ctx.fillStyle = st.box.crossing ? 'rgba(52,199,89,.12)' : 'rgba(10,132,255,.12)';
      ctx.strokeStyle = st.box.crossing ? C.green : C.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash(st.box.crossing ? [5, 4] : []);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }
    if (st.loupe) this.drawLoupe(st);
  }

  drawContent(st) {
    const { ctx, vp } = this;
    const C = st.colors;
    ctx.fillStyle = C.canvasBg;
    ctx.fillRect(0, 0, vp.width, vp.height);
    if (st.grid.show) this.drawGrid(st.grid.info, C);
    this.drawAxes(C);

    const sk = st.sketch;
    const sel = st.selection;
    const an = st.analysis;
    const hl = st.highlight;
    const err = st.errorIds;

    for (const e of sk.entities.values()) {
      const selected = sel.has(e.id) || (hl && hl.has(e.id));
      const state = err && err.has(e.id) ? 'over' : (an.entities.get(e.id) || 'under');
      ctx.strokeStyle = selected ? C.selected : C[state];
      ctx.lineWidth = selected ? 3 : 2;
      ctx.setLineDash(e.construction ? [6, 5] : []);
      this.traceEntity(sk, e);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Cotes
    for (const k of sk.constraints.values()) {
      if (!isDimension(k)) continue;
      const color = sel.has(k.id) ? C.selected : (an.constraints.get(k.id) === 'over' || (err && err.has(k.id))) ? C.over : k.driven ? C.dimDriven : C.dim;
      this.drawDimension(sk, k, color, st);
    }
    if (st.previewDim) this.drawDimension(sk, st.previewDim, C.preview, st);

    // Points (extrémités, centres)
    for (const p of sk.points.values()) {
      if (p.id === ORIGIN_ID) { if (sel.has(p.id) || (hl && hl.has(p.id))) this.drawPoint(vp.toScreen(p), C.selected, 5, C.canvasBg); continue; }
      const selected = sel.has(p.id) || (hl && hl.has(p.id));
      const state = err && err.has(p.id) ? 'over' : (an.points.get(p.id) || 'under');
      this.drawPoint(vp.toScreen(p), selected ? C.selected : C[state], selected ? 5 : 3.5, C.canvasBg);
    }

    // Icônes de relations
    if (st.showRelations !== false) {
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of layoutBadges(sk, vp)) {
        if (b.x < -20 || b.y < -20 || b.x > vp.width + 20 || b.y > vp.height + 20) continue;
        const selected = sel.has(b.cid);
        const over = an.constraints.get(b.cid) === 'over';
        ctx.fillStyle = selected ? C.selected : over ? C.over : C.badgeBg;
        roundRect(ctx, b.x - BADGE_R, b.y - BADGE_R, 2 * BADGE_R, 2 * BADGE_R, 4);
        ctx.fill();
        ctx.fillStyle = selected || over ? '#ffffff' : C.badgeFg;
        ctx.fillText(REL_GLYPH[b.type] || '?', b.x, b.y + 0.5);
      }
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // Aperçu de l'outil
    if (st.tool) {
      st.tool.preview(this.previewDrawer(C), st);
      if (st.tool.cursor && !st.tool.noMarker) this.drawSnapMarker(st.tool.cursor, C);
    }
    if (st.dragMarker) this.drawSnapMarker(st.dragMarker, C);
  }

  traceEntity(sk, e) {
    this.worldPath((c) => {
      if (e.type === 'line') {
        const a = sk.points.get(e.p1), b = sk.points.get(e.p2);
        c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
      } else if (e.type === 'circle') {
        const o = sk.points.get(e.c);
        c.arc(o.x, o.y, e.r, 0, TAU);
      } else if (e.type === 'arc') {
        const o = sk.points.get(e.c);
        const { r, a1, a2 } = arcInfo(o, sk.points.get(e.s), sk.points.get(e.e), e.ccw);
        c.arc(o.x, o.y, r, a1, a2, !e.ccw);
      }
    });
  }

  drawDimension(sk, k, color, st) {
    const lay = dimLayout(sk, k);
    if (!lay) return;
    const { ctx, vp } = this;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    // lignes d'attache (légèrement prolongées)
    ctx.beginPath();
    for (const [a, b] of lay.ext) {
      const A = vp.toScreen(a), B = vp.toScreen(b);
      const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy);
      if (l < 1) continue;
      const g = Math.min(5, l / 3);
      ctx.moveTo(A.x + dx / l * g, A.y + dy / l * g);
      ctx.lineTo(B.x + dx / l * 6, B.y + dy / l * 6);
    }
    for (const [a, b] of lay.segs) { const A = vp.toScreen(a), B = vp.toScreen(b); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); }
    ctx.stroke();
    if (lay.arc) { this.worldPath((c) => c.arc(lay.arc.c.x, lay.arc.c.y, lay.arc.r, lay.arc.a1, lay.arc.a2, !lay.arc.ccw)); ctx.stroke(); }
    // flèches
    for (const ar of lay.arrows) {
      const p = vp.toScreen(ar.p);
      const dx = ar.dir.x, dy = -ar.dir.y;
      const L = 9, W = 3.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - dx * L - dy * W, p.y - dy * L + dx * W);
      ctx.lineTo(p.x - dx * L + dy * W, p.y - dy * L - dx * W);
      ctx.closePath();
      ctx.fill();
    }
    // texte sur fond
    const label = dimLabel(sk, k, st.settings);
    const t = vp.toScreen(lay.text);
    ctx.font = `13px ${FONT}`;
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = st.colors.canvasBg;
    ctx.fillRect(t.x - w / 2, t.y - 9, w, 18);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, t.x, t.y + 0.5);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  drawPoint(s, color, r, bg) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 1.2, 0, TAU);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /**
   * Papier millimétré : chaque ligne est d'autant plus marquée que son espacement (1, 5, 10, 50, 100… pas)
   * est grand à l'écran. L'intensité varie continûment avec le zoom (pas de saut d'un palier à l'autre).
   */
  drawGrid(info, C) {
    const { ctx, vp } = this;
    const r = vp.visibleWorldRect();
    const { minor, minorPx } = info;
    if ((r.maxX - r.minX) / minor > 2000 || (r.maxY - r.minY) / minor > 2000) return;
    const x0 = Math.floor(r.minX / minor), x1 = Math.ceil(r.maxX / minor);
    const y0 = Math.floor(r.minY / minor), y1 = Math.ceil(r.maxY / minor);
    const LEVELS = 16;
    const buckets = Array.from({ length: LEVELS + 1 }, () => []);
    const weight = (i) => {
      // espacement (en pas fins) de la famille de lignes la plus large qui contient la ligne i
      let m = 1;
      for (;;) {
        const next = String(m)[0] === '1' ? m * 5 : m * 2;
        if (next * minorPx > 4000 || i % next !== 0) break;
        m = next;
      }
      const px = m * minorPx;
      const fade = Math.min(1, Math.max(0, (px - GRID_MIN_PX) / (GRID_FULL_PX - GRID_MIN_PX)));
      const e = Math.min(1, Math.max(0, Math.log(px / GRID_MIN_PX) / Math.log(GRID_STRONG_PX / GRID_MIN_PX)));
      return fade * (0.3 + 0.7 * e);
    };
    const put = (w, line) => { const b = Math.round(w * LEVELS); if (b > 0) buckets[b].push(line); };
    for (let i = x0; i <= x1; i++) put(weight(Math.abs(i)), [Math.round(vp.toScreen({ x: i * minor, y: 0 }).x) + 0.5, true]);
    for (let j = y0; j <= y1; j++) put(weight(Math.abs(j)), [Math.round(vp.toScreen({ x: 0, y: j * minor }).y) + 0.5, false]);
    ctx.strokeStyle = C.gridPaper;
    for (let b = 1; b <= LEVELS; b++) {
      if (!buckets[b].length) continue;
      const w = b / LEVELS;
      ctx.globalAlpha = C.gridAlpha * w;
      ctx.lineWidth = 0.5 + 0.6 * w;
      ctx.beginPath();
      for (const [v, vertical] of buckets[b]) {
        if (vertical) { ctx.moveTo(v, 0); ctx.lineTo(v, vp.height); } else { ctx.moveTo(0, v); ctx.lineTo(vp.width, v); }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawAxes(C) {
    const { ctx, vp } = this;
    const o = vp.toScreen({ x: 0, y: 0 });
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(o.y) + 0.5); ctx.lineTo(vp.width, Math.round(o.y) + 0.5);
    ctx.moveTo(Math.round(o.x) + 0.5, 0); ctx.lineTo(Math.round(o.x) + 0.5, vp.height);
    ctx.stroke();
    ctx.setLineDash([]);
    const L = 26, ah = 6;
    ctx.strokeStyle = C.origin;
    ctx.fillStyle = C.origin;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + L, o.y);
    ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y - L);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(o.x + L + 4, o.y); ctx.lineTo(o.x + L - ah, o.y - ah / 2); ctx.lineTo(o.x + L - ah, o.y + ah / 2); ctx.closePath();
    ctx.moveTo(o.x, o.y - L - 4); ctx.lineTo(o.x - ah / 2, o.y - L + ah); ctx.lineTo(o.x + ah / 2, o.y - L + ah); ctx.closePath();
    ctx.fill();
    this.drawPoint(o, C.origin, 3.5, C.canvasBg);
  }

  /** Symbole d'accrochage en cours. */
  drawSnapMarker(cur, C) {
    const { ctx, vp } = this;
    const s = vp.toScreen(cur);
    ctx.strokeStyle = C.snap;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (cur.kind === 'point' || cur.kind === 'origin') ctx.rect(s.x - 7, s.y - 7, 14, 14);
    else if (cur.kind === 'midpoint') { ctx.moveTo(s.x, s.y - 8); ctx.lineTo(s.x + 8, s.y + 6); ctx.lineTo(s.x - 8, s.y + 6); ctx.closePath(); }
    else if (cur.kind === 'quadrant') { ctx.moveTo(s.x, s.y - 8); ctx.lineTo(s.x + 8, s.y); ctx.lineTo(s.x, s.y + 8); ctx.lineTo(s.x - 8, s.y); ctx.closePath(); }
    else if (cur.kind === 'intersection') { ctx.moveTo(s.x - 7, s.y - 7); ctx.lineTo(s.x + 7, s.y + 7); ctx.moveTo(s.x + 7, s.y - 7); ctx.lineTo(s.x - 7, s.y + 7); }
    else if (cur.kind === 'on') ctx.arc(s.x, s.y, 6.5, 0, TAU);
    else if (cur.kind === 'grid') { ctx.moveTo(s.x - 6, s.y); ctx.lineTo(s.x + 6, s.y); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x, s.y + 6); }
    ctx.stroke();
    ctx.strokeStyle = C.selected;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x - 11, s.y); ctx.lineTo(s.x - 3, s.y); ctx.moveTo(s.x + 3, s.y); ctx.lineTo(s.x + 11, s.y);
    ctx.moveTo(s.x, s.y - 11); ctx.lineTo(s.x, s.y - 3); ctx.moveTo(s.x, s.y + 3); ctx.lineTo(s.x, s.y + 11);
    ctx.stroke();
  }

  /** Loupe de précision : zone agrandie autour du point d'accrochage, au-dessus du doigt. */
  drawLoupe(st) {
    const { ctx, vp } = this;
    const { finger, world } = st.loupe;
    const R = 52, Z = 2.4;
    let cx = finger.x, cy = finger.y - 100;
    if (cy - R < 6) { cy = Math.max(R + 6, finger.y - 20); cx = finger.x + (finger.x > vp.width / 2 ? -1 : 1) * 110; }
    cx = Math.max(R + 6, Math.min(vp.width - R - 6, cx));
    const saved = { scale: vp.scale, ox: vp.ox, oy: vp.oy };
    vp.scale = saved.scale * Z;
    vp.ox = cx - world.x * vp.scale;
    vp.oy = cy + world.y * vp.scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    this.drawContent({ ...st, showRelations: false });
    ctx.restore();
    vp.scale = saved.scale; vp.ox = saved.ox; vp.oy = saved.oy;
    this.screen();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = st.colors.loupeRing;
    ctx.stroke();
  }

  /** Petit traceur passé aux outils pour leur aperçu. */
  previewDrawer(C) {
    const self = this, ctx = this.ctx;
    const style = (dashed) => { ctx.strokeStyle = C.preview; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [6, 5] : []); };
    return {
      line(a, b, dashed = false) { style(dashed); self.worldPath((c) => { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }); ctx.stroke(); ctx.setLineDash([]); },
      polyline(pts, close = false, dashed = false) {
        if (pts.length < 2) return; style(dashed);
        self.worldPath((c) => { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); if (close) c.closePath(); });
        ctx.stroke(); ctx.setLineDash([]);
      },
      circle(o, r, dashed = false) { style(dashed); self.worldPath((c) => c.arc(o.x, o.y, r, 0, TAU)); ctx.stroke(); ctx.setLineDash([]); },
      arc(o, r, a1, a2, ccw, dashed = false) { style(dashed); self.worldPath((c) => c.arc(o.x, o.y, r, a1, a2, !ccw)); ctx.stroke(); ctx.setLineDash([]); },
      point(p) { self.drawPoint(self.vp.toScreen(p), C.preview, 3.5, C.canvasBg); },
      guide(a, b) { ctx.strokeStyle = C.guide; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); self.worldPath((c) => { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }); ctx.stroke(); ctx.setLineDash([]); },
    };
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

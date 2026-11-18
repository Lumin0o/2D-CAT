import { Tool } from './base.js';
import { cross, sub, norm } from '../../core/geom.js';
import { angleSetup, dimMeasure, dimOrientation } from '../../render/annotations.js';

/**
 * Cotation intelligente : on touche une ou deux entités / points, puis un tap dans le vide place la cote.
 *   une ligne → longueur ; deux lignes → angle (ou distance si parallèles) ; deux points → distance ;
 *   ligne inclinée ou deux points : selon l'endroit où on place la cote, elle est parallèle, horizontale ou verticale ;
 *   un point et une ligne → distance perpendiculaire ; un arc ou un cercle → rayon.
 */
export class DimensionTool extends Tool {
  get force() { return null; }
  get usesDrawInput() { return false; }
  /** Point visé (cotes en chaîne et ordinales). */
  pointAt(wp) { return pointAt(this.tc, wp); }
  reset() {
    this.picks = [];
    this.previewDim = null;
    this.highlight = new Set();
    this.noMarker = true;
    this.noLoupe = true;
    super.reset();
  }
  onActivate() {
    super.onActivate();
    // reprend la sélection en cours si elle est cotable
    const picks = (this.tc.takeSelection ? this.tc.takeSelection() : []).map((id) => this.describe(id)).filter(Boolean);
    if (picks.length && (this.classify(picks) || this.isPartial(picks))) this.setPicks(picks);
  }
  describe(id) {
    const sk = this.tc.sketch;
    if (sk.points.has(id)) return { id, kind: 'P' };
    const e = sk.entities.get(id);
    if (!e) return null;
    return { id, kind: e.type === 'line' ? 'L' : 'C' };
  }
  setPicks(picks) { this.picks = picks; this.highlight = new Set(picks.map((p) => p.id)); this.updateHint(); }
  isPartial(picks) { return picks.length === 1 && picks[0].kind === 'P'; }

  /** Type de cote pour une liste de choix (et la position de la cote, si connue), ou null. */
  classify(picks, pos = null) {
    const sk = this.tc.sketch;
    const sig = picks.map((p) => p.kind).join('');
    const ids = picks.map((p) => p.id);
    if (this.force) return forcedDim(sk, sig, ids, this.force);
    switch (sig) {
      case 'L': {
        const e = sk.entities.get(ids[0]);
        const a = sk.points.get(e.p1), b = sk.points.get(e.p2);
        const o = pos ? dimOrientation(a, b, pos) : 'aligned';
        const eps = 1e-9 * Math.max(1, Math.abs(a.x) + Math.abs(a.y));
        if (o === 'h' && Math.abs(a.y - b.y) > eps) return { type: 'dimHorizontal', refs: [e.p1, e.p2] };
        if (o === 'v' && Math.abs(a.x - b.x) > eps) return { type: 'dimVertical', refs: [e.p1, e.p2] };
        return { type: 'dimLength', refs: ids };
      }
      case 'C': return { type: 'dimRadius', refs: ids };
      case 'PP': {
        const o = pos ? dimOrientation(sk.points.get(ids[0]), sk.points.get(ids[1]), pos) : 'aligned';
        return { type: o === 'h' ? 'dimHorizontal' : o === 'v' ? 'dimVertical' : 'dimDistance', refs: ids };
      }
      case 'PL': return withSym(sk, { type: 'dimPointLine', refs: ids }, pos);
      case 'LP': return withSym(sk, { type: 'dimPointLine', refs: [ids[1], ids[0]] }, pos);
      case 'LL': {
        let a = sk.entities.get(ids[0]), b = sk.entities.get(ids[1]);
        const d1 = norm(sub(sk.points.get(a.p2), sk.points.get(a.p1))), d2 = norm(sub(sk.points.get(b.p2), sk.points.get(b.p1)));
        if (Math.abs(cross(d1, d2)) >= 1e-6) return { type: 'dimAngle', refs: ids };
        if (b.construction && !a.construction) [a, b] = [b, a];      // la ligne de construction sert d'axe
        return withSym(sk, { type: 'dimLineLine', refs: [a.id, b.id] }, pos);
      }
      default: return null;
    }
  }
  /** Construit la cote (avec sa valeur mesurée) pour une position de texte. */
  build(pos) {
    const c = this.classify(this.picks, pos);
    if (!c) return null;
    const sk = this.tc.sketch;
    const k = { type: c.type, refs: c.refs, pos: { x: pos.x, y: pos.y } };
    if (c.sym) k.sym = true;
    if (c.type === 'dimAngle') {
      const s = angleSetup(sk, sk.entities.get(c.refs[0]), sk.entities.get(c.refs[1]), pos);
      if (!s || s.value < 1e-6) return null;
      Object.assign(k, s);
    } else k.value = dimMeasure(sk, k);
    return k;
  }
  hint() {
    if (!this.picks || this.picks.length === 0) return 'Touchez une ligne, un cercle ou un point à coter';
    if (this.isPartial(this.picks)) return 'Touchez un autre point ou une ligne';
    return 'Touchez dans le vide pour placer la cote';
  }
  track(wp) {
    this.cursor = { x: wp.x, y: wp.y, kind: null };
    this.previewDim = this.tc.hitGeometry(wp) ? null : this.build(wp);
    this.tc.requestDraw();
  }
  onPress(wp) { this.track(wp); }
  onMove(wp) { this.track(wp); }
  onCancel() { this.cursor = null; this.previewDim = null; this.tc.requestDraw(); }
  onRelease(wp) {
    this.cursor = null; this.previewDim = null;
    const hit = this.tc.hitGeometry(wp);
    if (hit) {
      const d = this.describe(hit.id);
      if (d && !this.picks.some((p) => p.id === d.id)) {
        const more = [...this.picks, d];
        if (this.classify(more) || this.isPartial(more)) this.setPicks(more);
        else if (this.classify([d]) || this.isPartial([d])) this.setPicks([d]);
      }
    } else {
      const k = this.build(wp);
      if (k) { this.tc.createDimension(k); this.setPicks([]); }
      else if (this.picks.length) this.setPicks([]);
    }
    this.tc.requestDraw();
  }
  onToolbarTap() {
    if (this.picks.length) { this.setPicks([]); this.tc.requestDraw(); return true; }
    return false;
  }
}

/**
 * Cote par rapport à une ligne de construction (axe) : placée de l'autre côté de l'axe, elle devient
 * symétrique (comme le diamètre de SOLIDWORKS) et vaut deux fois la distance à l'axe.
 */
function withSym(sk, c, pos) {
  const axis = c.type === 'dimPointLine' ? sk.entities.get(c.refs[1]) : sk.entities.get(c.refs[0]);
  if (!pos || !axis || !axis.construction) return c;
  const p = c.type === 'dimPointLine' ? sk.points.get(c.refs[0]) : sk.points.get(sk.entities.get(c.refs[1]).p1);
  const a = sk.points.get(axis.p1), b = sk.points.get(axis.p2);
  const u = norm(sub(b, a));
  const side = (q) => cross(u, sub(q, a));
  const sp = side(p), sq = side(pos);
  if (Math.abs(sp) > 1e-9 && sp * sq < 0) c.sym = true;
  return c;
}

/** Point visé : un point, l'extrémité la plus proche d'une ligne touchée, ou le centre d'un arc / cercle. */
function pointAt(tc, wp) {
  const hit = tc.hitGeometry(wp);
  if (!hit) return null;
  const sk = tc.sketch;
  if (sk.points.has(hit.id)) return hit.id;
  const e = sk.entities.get(hit.id);
  if (!e) return null;
  if (e.type !== 'line') return e.c || null;
  const a = sk.points.get(e.p1), b = sk.points.get(e.p2);
  return Math.hypot(a.x - wp.x, a.y - wp.y) <= Math.hypot(b.x - wp.x, b.y - wp.y) ? e.p1 : e.p2;
}

/** Cote horizontale ou verticale imposée : une ligne (ses extrémités) ou deux points. */
function forcedDim(sk, sig, ids, force) {
  let refs = null;
  if (sig === 'L') { const e = sk.entities.get(ids[0]); refs = [e.p1, e.p2]; }
  else if (sig === 'PP') refs = ids;
  if (!refs) return null;
  const a = sk.points.get(refs[0]), b = sk.points.get(refs[1]);
  const d = force === 'h' ? Math.abs(a.x - b.x) : Math.abs(a.y - b.y);
  if (d < 1e-9 * Math.max(1, Math.abs(a.x) + Math.abs(a.y) + Math.abs(b.x) + Math.abs(b.y))) return null;
  return { type: force === 'h' ? 'dimHorizontal' : 'dimVertical', refs };
}

/** Cotation horizontale : distance en X entre deux points (ou les extrémités d'une ligne). */
export class DimHorizontalTool extends DimensionTool {
  get force() { return 'h'; }
  hint() {
    if (!this.picks || this.picks.length === 0) return 'Cote horizontale : touchez une ligne ou un point';
    if (this.isPartial(this.picks)) return 'Touchez un deuxième point';
    return 'Touchez dans le vide pour placer la cote';
  }
}
/** Cotation verticale : distance en Y. */
export class DimVerticalTool extends DimensionTool {
  get force() { return 'v'; }
  hint() {
    if (!this.picks || this.picks.length === 0) return 'Cote verticale : touchez une ligne ou un point';
    if (this.isPartial(this.picks)) return 'Touchez un deuxième point';
    return 'Touchez dans le vide pour placer la cote';
  }
}

/**
 * Cotation en chaîne : deux points, puis un tap dans le vide place la première cote
 * (horizontale ou verticale selon l'endroit). Chaque point touché ensuite ajoute une cote
 * depuis le point précédent, alignée sur la même ligne de cote. Tap dans le vide : fin de chaîne.
 */
export class DimChainTool extends DimensionTool {
  reset() { this.chain = null; super.reset(); }
  onActivate() { this.reset(); }
  orient(pos) {
    const sk = this.tc.sketch;
    const [a, b] = this.picks.map((p) => sk.points.get(p.id));
    const o = dimOrientation(a, b, pos);
    if (o !== 'aligned') return o;
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v';
  }
  classify(picks, pos = null) {
    if (picks.length !== 2 || picks.some((p) => p.kind !== 'P')) return null;
    const o = pos ? this.orient(pos) : 'h';
    return forcedDim(this.tc.sketch, 'PP', picks.map((p) => p.id), o);
  }
  isPartial(picks) { return picks.length === 1 && picks[0].kind === 'P'; }
  hint() {
    if (this.chain) return 'Touchez le point suivant · tap dans le vide : fin de chaîne';
    if (!this.picks || this.picks.length === 0) return 'Cote en chaîne : touchez le premier point';
    if (this.picks.length === 1) return 'Touchez le deuxième point';
    return 'Touchez dans le vide pour placer la ligne de cote';
  }
  /** Cote suivante de la chaîne, du dernier point vers pid, sur la même ligne de cote. */
  chainDim(pid) {
    const sk = this.tc.sketch;
    const { last, orient, offset } = this.chain;
    if (pid === last) return null;
    const c = forcedDim(sk, 'PP', [last, pid], orient);
    if (!c) return null;
    const a = sk.points.get(last), b = sk.points.get(pid);
    const pos = orient === 'h' ? { x: (a.x + b.x) / 2, y: offset } : { x: offset, y: (a.y + b.y) / 2 };
    const k = { type: c.type, refs: c.refs, pos };
    k.value = dimMeasure(sk, k);
    return k;
  }
  track(wp) {
    this.cursor = { x: wp.x, y: wp.y, kind: null };
    if (this.chain) {
      const pid = this.pointAt(wp);
      this.previewDim = pid ? this.chainDim(pid) : null;
    } else this.previewDim = this.picks.length === 2 && !this.tc.hitGeometry(wp) ? this.build(wp) : null;
    this.tc.requestDraw();
  }
  onRelease(wp) {
    this.cursor = null; this.previewDim = null;
    const pid = this.pointAt(wp);
    if (this.chain) {
      if (!pid) { this.reset(); this.tc.requestDraw(); return; }
      const k = this.chainDim(pid);
      if (k) { this.chain.last = pid; this.highlight = new Set([pid]); this.tc.createDimension(k); }
      this.updateHint();
    } else if (pid) {
      if (this.picks.length >= 2) this.setPicks([{ id: pid, kind: 'P' }]);
      else if (!this.picks.some((p) => p.id === pid)) this.setPicks([...this.picks, { id: pid, kind: 'P' }]);
    } else if (this.picks.length === 2) {
      const k = this.build(wp);
      if (k) {
        const orient = k.type === 'dimHorizontal' ? 'h' : 'v';
        this.chain = { last: this.picks[1].id, orient, offset: orient === 'h' ? wp.y : wp.x };
        this.picks = [];
        this.highlight = new Set([this.chain.last]);
        this.tc.createDimension(k);
        this.updateHint();
      }
    } else this.setPicks([]);
    this.tc.requestDraw();
  }
  onToolbarTap() {
    if (this.chain || this.picks.length) { this.reset(); this.tc.requestDraw(); return true; }
    return false;
  }
}

/**
 * Cotation ordinale (comme SOLIDWORKS) : on touche l'élément de référence (sommet, ligne, arc…),
 * puis un tap dans le vide place la cote 0 : au-dessus / en dessous → cotes en X alignées
 * horizontalement ; à gauche / à droite → cotes en Y alignées verticalement.
 * Chaque élément touché ensuite reçoit sa cote depuis la référence, alignée sur la cote 0.
 * Tap dans le vide : fin.
 */
export class DimOrdinateTool extends DimensionTool {
  reset() { this.base = null; this.zero = null; super.reset(); }
  onActivate() { this.reset(); }
  hint() {
    if (this.zero) return 'Touchez les éléments à coter · tap dans le vide : fin';
    if (this.base) return 'Touchez dans le vide pour placer la cote 0';
    return 'Cote ordinale : touchez l\'élément de référence (cote 0)';
  }
  zeroAt(pos) {
    const B = this.tc.sketch.points.get(this.base);
    if (!B) return null;
    const axis = Math.abs(pos.y - B.y) >= Math.abs(pos.x - B.x) ? 'h' : 'v';
    return { type: 'ordZero', refs: [this.base], axis, pos: { x: pos.x, y: pos.y } };
  }
  ordDim(pid) {
    const sk = this.tc.sketch;
    const zero = sk.constraints.get(this.zero);
    if (!zero || pid === this.base) return null;
    const c = forcedDim(sk, 'PP', [this.base, pid], zero.axis);
    if (!c) return null;
    const k = { type: c.type, refs: c.refs, ord: this.zero };
    k.value = dimMeasure(sk, k);
    return k;
  }
  setBase(pid) { this.base = pid; this.highlight = new Set([pid]); this.updateHint(); }
  track(wp) {
    this.cursor = { x: wp.x, y: wp.y, kind: null };
    const sk = this.tc.sketch;
    if (this.zero && !sk.constraints.has(this.zero)) { this.zero = null; this.base = null; this.highlight = new Set(); }
    if (this.zero) { const pid = this.pointAt(wp); this.previewDim = pid ? this.ordDim(pid) : null; }
    else if (this.base) this.previewDim = this.tc.hitGeometry(wp) ? null : this.zeroAt(wp);
    else this.previewDim = null;
    this.tc.requestDraw();
  }
  onRelease(wp) {
    this.cursor = null; this.previewDim = null;
    const sk = this.tc.sketch;
    if (this.zero && !sk.constraints.has(this.zero)) this.reset();     // cote 0 annulée ou supprimée
    if (this.base && !sk.points.has(this.base)) this.reset();
    const pid = this.pointAt(wp);
    if (this.zero) {
      if (!pid) { this.reset(); this.tc.requestDraw(); return; }
      const k = this.ordDim(pid);
      if (k) { this.highlight = new Set([this.base, pid]); this.tc.createDimension(k, 'Cote ordinale'); }
      else if (pid !== this.base) this.tc.toast(sk.constraints.get(this.zero).axis === 'h' ? 'Même position en X que la cote 0' : 'Même position en Y que la cote 0');
      this.updateHint();
    } else if (pid) this.setBase(pid);
    else if (this.base) {
      const z = this.zeroAt(wp);
      if (z) {
        const id = this.tc.createDimension(z, 'Cote ordinale 0');
        if (id) { this.zero = id; this.highlight = new Set([this.base]); }
      }
      this.updateHint();
    }
    this.tc.requestDraw();
  }
  onToolbarTap() {
    if (this.base || this.zero) { this.reset(); this.tc.requestDraw(); return true; }
    return false;
  }
}

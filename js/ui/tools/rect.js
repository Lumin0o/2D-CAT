import { Tool } from './base.js';
import { sub, add, mul, norm, perp, dot, dist } from '../../core/geom.js';

/** Crée 4 lignes indépendantes reliées par leurs coins. corners: [{x,y,pointId?}] dans l'ordre. */
function buildQuad(tc, corners, relations) {
  const sk = tc.sketch;
  const pts = corners.map((c) => tc.resolvePoint(c));
  const ids = pts.map((p) => p.id);
  if (new Set(ids).size < 4) return null;
  const lines = [];
  for (let i = 0; i < 4; i++) lines.push(sk.addLine(ids[i], ids[(i + 1) % 4]));
  relations(sk, lines);
  return lines;
}

/**
 * Rectangle par le centre : deux diagonales de construction, et le point centre (celui choisi
 * en premier, par exemple l'origine) au milieu d'une diagonale — le centre reste au centre
 * quand on change les cotes.
 */
function addCenterDiagonals(tc, lines, centerSnap) {
  const sk = tc.sketch;
  const d1 = sk.addLine(lines[0].p1, lines[2].p1, { construction: true });
  sk.addLine(lines[1].p1, lines[3].p1, { construction: true });
  const c = tc.resolvePoint(centerSnap);
  sk.addConstraint('midpoint', [c.id, d1.id]);
}

const axisAligned = (sk, l) => {
  sk.addConstraint('horizontal', [l[0].id]);
  sk.addConstraint('vertical', [l[1].id]);
  sk.addConstraint('horizontal', [l[2].id]);
  sk.addConstraint('vertical', [l[3].id]);
};
const rotatedRect = (sk, l) => {
  sk.addConstraint('parallel', [l[0].id, l[2].id]);
  sk.addConstraint('parallel', [l[1].id, l[3].id]);
  sk.addConstraint('perpendicular', [l[0].id, l[1].id]);
};
const parallelogramRel = (sk, l) => {
  sk.addConstraint('parallel', [l[0].id, l[2].id]);
  sk.addConstraint('parallel', [l[1].id, l[3].id]);
};

function cornersFrom2(a, b) {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

/** Rectangle par deux coins opposés. */
export class Rect2Tool extends Tool {
  hint() { return this.pts.length === 0 ? 'Touchez le premier coin' : 'Touchez le coin opposé'; }
  step() {
    if (this.pts.length < 2) return;
    const [a, b] = this.pts;
    const tol = this.tc.tolWorld();
    if (Math.abs(a.x - b.x) < tol || Math.abs(a.y - b.y) < tol) { this.rejectLast('Rectangle trop petit'); return; }
    if (buildQuad(this.tc, cornersFrom2(a, b), axisAligned)) this.tc.commit('Rectangle');
    this.pts = [];
  }
  preview(d) {
    if (this.pts.length === 1 && this.cursor) { d.polyline(cornersFrom2(this.pts[0], this.cursor), true); d.point(this.pts[0]); }
  }
}

/** Rectangle par le centre et un coin. */
export class RectCenterTool extends Tool {
  hint() { return this.pts.length === 0 ? 'Touchez le centre' : 'Touchez un coin'; }
  corners(c, k) { const a = sub(mul(c, 2), k); return cornersFrom2({ x: a.x, y: a.y }, k); }
  step() {
    if (this.pts.length < 2) return;
    const [c, k] = this.pts;
    const tol = this.tc.tolWorld();
    if (Math.abs(c.x - k.x) < tol / 2 || Math.abs(c.y - k.y) < tol / 2) { this.rejectLast('Rectangle trop petit'); return; }
    const lines = buildQuad(this.tc, this.corners(c, k), axisAligned);
    if (lines) { addCenterDiagonals(this.tc, lines, c); this.tc.commit('Rectangle par le centre'); }
    this.pts = [];
  }
  preview(d) {
    if (this.pts.length === 1 && this.cursor) {
      const cs = this.corners(this.pts[0], this.cursor);
      d.polyline(cs, true);
      d.guide(cs[0], cs[2]); d.guide(cs[1], cs[3]);
      d.point(this.pts[0]);
    }
  }
}

/** Rectangle 3 points coin : deux coins d'un côté, puis la largeur. */
export class Rect3CornerTool extends Tool {
  hint() { return ['Touchez le premier coin', 'Touchez le deuxième coin (premier côté)', 'Touchez un point pour la largeur'][this.pts.length]; }
  corners(a, b, p) {
    const u = norm(sub(b, a)); const n = perp(u);
    const h = dot(sub(p, a), n);
    return [a, b, add(b, mul(n, h)), add(a, mul(n, h))];
  }
  step() {
    const tol = this.tc.tolWorld();
    if (this.pts.length === 2 && this.tooClose(this.pts[0], this.pts[1])) { this.rejectLast(); return; }
    if (this.pts.length < 3) return;
    const [a, b, p] = this.pts;
    const h = dot(sub(p, a), perp(norm(sub(b, a))));
    if (Math.abs(h) < tol) { this.rejectLast('Largeur trop petite'); return; }
    if (buildQuad(this.tc, this.corners(a, b, p), rotatedRect)) this.tc.commit('Rectangle 3 points');
    this.pts = [];
  }
  preview(d) {
    if (!this.cursor) return;
    if (this.pts.length === 1) { d.line(this.pts[0], this.cursor); d.point(this.pts[0]); }
    else if (this.pts.length === 2) { d.polyline(this.corners(this.pts[0], this.pts[1], this.cursor), true); d.point(this.pts[0]); d.point(this.pts[1]); }
  }
}

/** Rectangle 3 points centre : centre, milieu d'un côté (direction et demi-longueur), puis demi-largeur. */
export class Rect3CenterTool extends Tool {
  hint() { return ['Touchez le centre', 'Touchez le milieu d\'un côté', 'Touchez un point pour la largeur'][this.pts.length]; }
  corners(c, a, p) {
    const u = norm(sub(a, c)); const n = perp(u);
    const l1 = dist(a, c);
    const l2 = Math.abs(dot(sub(p, c), n));
    const ux = mul(u, l1), ny = mul(n, l2);
    return [add(add(c, ux), ny), sub(add(c, ux), ny), sub(sub(c, ux), ny), add(sub(c, ux), ny)];
  }
  step() {
    const tol = this.tc.tolWorld();
    if (this.pts.length === 2 && this.tooClose(this.pts[0], this.pts[1])) { this.rejectLast(); return; }
    if (this.pts.length < 3) return;
    const [c, a, p] = this.pts;
    const l2 = Math.abs(dot(sub(p, c), perp(norm(sub(a, c)))));
    if (l2 < tol / 2) { this.rejectLast('Largeur trop petite'); return; }
    const lines = buildQuad(this.tc, this.corners(c, a, p), rotatedRect);
    if (lines) { addCenterDiagonals(this.tc, lines, c); this.tc.commit('Rectangle 3 points centre'); }
    this.pts = [];
  }
  preview(d) {
    if (!this.cursor) return;
    if (this.pts.length === 1) { d.guide(this.pts[0], this.cursor); d.point(this.pts[0]); }
    else if (this.pts.length === 2) {
      const cs = this.corners(this.pts[0], this.pts[1], this.cursor);
      d.polyline(cs, true); d.guide(cs[0], cs[2]); d.guide(cs[1], cs[3]); d.point(this.pts[0]);
    }
  }
}

/** Parallélogramme : deux coins d'un côté puis le coin opposé. */
export class ParallelogramTool extends Tool {
  hint() { return ['Touchez le premier coin', 'Touchez le deuxième coin', 'Touchez le troisième coin'][this.pts.length]; }
  corners(a, b, p) { return [a, b, p, add(a, sub(p, b))]; }
  step() {
    if (this.pts.length === 2 && this.tooClose(this.pts[0], this.pts[1])) { this.rejectLast(); return; }
    if (this.pts.length < 3) return;
    const [a, b, p] = this.pts;
    if (this.tooClose(b, p) || this.tooClose(a, p)) { this.rejectLast(); return; }
    if (buildQuad(this.tc, this.corners(a, b, p), parallelogramRel)) this.tc.commit('Parallélogramme');
    this.pts = [];
  }
  preview(d) {
    if (!this.cursor) return;
    if (this.pts.length === 1) { d.line(this.pts[0], this.cursor); d.point(this.pts[0]); }
    else if (this.pts.length === 2) { d.polyline(this.corners(this.pts[0], this.pts[1], this.cursor), true); d.point(this.pts[0]); d.point(this.pts[1]); }
  }
}

import { Tool } from './base.js';
import { sub, mul, add, angleOf } from '../../core/geom.js';

/** Ligne par deux extrémités, avec enchaînement des segments. */
export class LineTool extends Tool {
  reset() { this.chain = 0; super.reset(); }
  hint() {
    if (this.pts.length === 0) return 'Touchez le premier point';
    return this.chain > 0 ? 'Point suivant · retouchez le dernier point pour terminer' : 'Touchez le deuxième point';
  }
  step() {
    if (this.pts.length < 2) return;
    const [a, b] = this.pts;
    if (this.samePoint(a, b)) {
      // tap sur le dernier point : fin de chaîne (ou ignoré si rien n'a été tracé)
      this.pts = [];
      this.chain = 0;
      return;
    }
    const sk = this.tc.sketch;
    const end = this.tc.autoAlign(a, b);      // redressement H / V (si aimantation)
    const p1 = this.tc.resolvePoint(a);
    const p2 = this.tc.resolvePoint(end);
    if (p1.id === p2.id) { this.pts = [a]; return; }
    const line = sk.addLine(p1.id, p2.id);
    if (end.align === 'h') sk.addConstraint('horizontal', [line.id]);
    if (end.align === 'v') sk.addConstraint('vertical', [line.id]);
    this.tc.commit('Ligne');
    this.chain++;
    this.pts = [{ x: p2.x, y: p2.y, pointId: p2.id, kind: 'point' }];
  }
  onToolbarTap() {
    if (this.pts.length > 0) { this.pts = []; this.chain = 0; this.updateHint(); this.tc.requestDraw(); return true; }
    return false;
  }
  preview(d) {
    if (this.pts.length === 1 && this.cursor) {
      const end = this.tc.autoAlign(this.pts[0], this.cursor);
      d.line(this.pts[0], end);
      d.point(this.pts[0]);
    }
  }
}

/** Ligne par le milieu : premier point = milieu, deuxième = une extrémité. */
export class LineMidTool extends Tool {
  hint() { return this.pts.length === 0 ? 'Touchez le milieu de la ligne' : 'Touchez une extrémité'; }
  step() {
    if (this.pts.length < 2) return;
    const [m, e] = this.pts;
    if (this.tooClose(m, e)) { this.rejectLast(); return; }
    const end = this.tc.autoAlign(m, e);
    const other = sub(mul(m, 2), end);
    const sk = this.tc.sketch;
    const p1 = sk.addPoint(other.x, other.y);
    const p2 = this.tc.resolvePoint(end);
    const line = sk.addLine(p1.id, p2.id);
    if (end.align === 'h') sk.addConstraint('horizontal', [line.id]);
    if (end.align === 'v') sk.addConstraint('vertical', [line.id]);
    if (m.pointId) sk.addConstraint('midpoint', [m.pointId, line.id]);
    this.tc.commit('Ligne par le milieu');
    this.pts = [];
  }
  preview(d) {
    if (this.pts.length === 1 && this.cursor) {
      const m = this.pts[0];
      const end = this.tc.autoAlign(m, this.cursor);
      d.line(sub(mul(m, 2), end), end);
      d.point(m);
    }
  }
}

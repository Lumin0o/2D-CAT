import { Tool } from './base.js';
import { sub, mul, add, angleOf, dist } from '../../core/geom.js';

/** Ligne par deux extrémités, avec enchaînement des segments. */
export class LineTool extends Tool {
  /** Ligne de construction (pointillés, non exportée) : voir ConstructionLineTool. */
  get construction() { return false; }
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
    const line = sk.addLine(p1.id, p2.id, { construction: this.construction });
    if (end.align === 'h') sk.addConstraint('horizontal', [line.id]);
    if (end.align === 'v') sk.addConstraint('vertical', [line.id]);
    this.tc.commit(this.construction ? 'Ligne de construction' : 'Ligne');
    if (this.dragged) { this.pts = []; this.chain = 0; return; }   // glisser-lâcher : un seul segment
    this.chain++;
    this.pts = [{ x: p2.x, y: p2.y, pointId: p2.id, kind: 'point' }];
  }
  onToolbarTap() {
    if (this.pts.length > 0) { this.pts = []; this.chain = 0; this.updateHint(); this.tc.requestDraw(); return true; }
    return false;
  }
  liveValue() {
    if (this.pts.length !== 1 || !this.cursor) return null;
    return this.fmtL(dist(this.pts[0], this.tc.autoAlign(this.pts[0], this.cursor)));
  }
  preview(d) {
    if (this.pts.length === 1 && this.cursor) {
      const end = this.tc.autoAlign(this.pts[0], this.cursor);
      d.line(this.pts[0], end, this.construction);
      d.point(this.pts[0]);
    }
  }
}

/** Ligne de construction : comme la ligne, en pointillés ; elle sert de repère et n'est pas exportée. */
export class ConstructionLineTool extends LineTool {
  get construction() { return true; }
}

/** Ligne par le milieu : premier point = milieu, deuxième = une extrémité. */
export class LineMidTool extends Tool {
  get construction() { return false; }
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
    const line = sk.addLine(p1.id, p2.id, { construction: this.construction });
    if (end.align === 'h') sk.addConstraint('horizontal', [line.id]);
    if (end.align === 'v') sk.addConstraint('vertical', [line.id]);
    if (m.pointId) sk.addConstraint('midpoint', [m.pointId, line.id]);
    this.tc.commit(this.construction ? 'Ligne de construction par le milieu' : 'Ligne par le milieu');
    this.pts = [];
  }
  liveValue() {
    if (this.pts.length !== 1 || !this.cursor) return null;
    return this.fmtL(2 * dist(this.pts[0], this.tc.autoAlign(this.pts[0], this.cursor)));
  }
  preview(d) {
    if (this.pts.length === 1 && this.cursor) {
      const m = this.pts[0];
      const end = this.tc.autoAlign(m, this.cursor);
      d.line(sub(mul(m, 2), end), end, this.construction);
      d.point(m);
    }
  }
}

/** Ligne de construction par le milieu. */
export class ConstructionLineMidTool extends LineMidTool {
  get construction() { return true; }
}

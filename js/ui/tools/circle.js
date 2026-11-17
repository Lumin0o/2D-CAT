import { Tool } from './base.js';
import { dist, circleFrom3 } from '../../core/geom.js';

/** Cercle par le centre et un point du périmètre. */
export class CircleCenterTool extends Tool {
  hint() { return this.pts.length === 0 ? 'Touchez le centre' : 'Touchez un point du périmètre'; }
  step() {
    if (this.pts.length < 2) return;
    const [c, r] = this.pts;
    const rad = dist(c, r);
    if (rad < this.tc.tolWorld()) { this.rejectLast('Cercle trop petit'); return; }
    const sk = this.tc.sketch;
    const cp = this.tc.resolvePoint(c);
    const circle = sk.addCircle(cp.id, rad);
    if (r.pointId && r.pointId !== cp.id) sk.addConstraint('coincident', [r.pointId, circle.id]);
    this.tc.commit('Cercle');
    this.pts = [];
  }
  preview(d) {
    if (this.pts.length === 1 && this.cursor) {
      const c = this.pts[0];
      d.circle(c, dist(c, this.cursor));
      d.guide(c, this.cursor);
      d.point(c);
    }
  }
}

/** Cercle par trois points du périmètre. */
export class Circle3Tool extends Tool {
  hint() { return ['Touchez le premier point', 'Touchez le deuxième point', 'Touchez le troisième point'][this.pts.length]; }
  step() {
    if (this.pts.length === 2 && this.tooClose(this.pts[0], this.pts[1])) { this.rejectLast(); return; }
    if (this.pts.length < 3) return;
    const res = circleFrom3(this.pts[0], this.pts[1], this.pts[2]);
    if (!res || res.r < this.tc.tolWorld()) { this.rejectLast('Points alignés : cercle impossible'); return; }
    const sk = this.tc.sketch;
    const cp = sk.addPoint(res.c.x, res.c.y);
    const circle = sk.addCircle(cp.id, res.r);
    for (const p of this.pts) if (p.pointId) sk.addConstraint('coincident', [p.pointId, circle.id]);
    this.tc.commit('Cercle 3 points');
    this.pts = [];
  }
  preview(d) {
    if (!this.cursor) return;
    if (this.pts.length === 1) { d.guide(this.pts[0], this.cursor); d.point(this.pts[0]); }
    else if (this.pts.length === 2) {
      const res = circleFrom3(this.pts[0], this.pts[1], this.cursor);
      if (res) d.circle(res.c, res.r); else d.line(this.pts[0], this.pts[1]);
      d.point(this.pts[0]); d.point(this.pts[1]);
    }
  }
}

import { Tool } from './base.js';
import { dist, sub, add, mul, dot, perp, angleOf, fromAngle, deltaAngle, circleFrom3, angleInArc } from '../../core/geom.js';

/** Arc par centre, point de départ et point d'arrivée. Le sens suit le doigt. */
export class ArcCenterTool extends Tool {
  reset() { this.sweep = 0; this.lastTheta = null; super.reset(); }
  hint() { return ['Touchez le centre', 'Touchez le point de départ', 'Touchez le point d\'arrivée'][this.pts.length]; }
  onCursor(pressed) {
    if (this.pts.length !== 2 || !this.cursor) return;
    const [c, s] = this.pts;
    const th = angleOf(sub(this.cursor, c));
    if (pressed || this.lastTheta === null) {
      this.sweep = deltaAngle(angleOf(sub(s, c)), th);
    } else {
      this.sweep += deltaAngle(this.lastTheta, th);
    }
    this.lastTheta = th;
  }
  step() {
    if (this.pts.length === 2 && this.tooClose(this.pts[0], this.pts[1])) { this.rejectLast('Rayon trop petit'); return; }
    if (this.pts.length < 3) return;
    const [c, s, e] = this.pts;
    const r = dist(c, s);
    if (Math.abs(this.sweep) < 1e-4) { this.rejectLast(); return; }
    const th = angleOf(sub(e, c));
    const eProj = add(c, fromAngle(th, r));
    const sk = this.tc.sketch;
    const cp = this.tc.resolvePoint(c);
    const sp = this.tc.resolvePoint(s);
    const ep = (e.pointId && dist(e, eProj) < this.tc.tolWorld()) ? this.tc.resolvePoint(e) : sk.addPoint(eProj.x, eProj.y);
    if (new Set([cp.id, sp.id, ep.id]).size < 3) { this.rejectLast(); return; }
    this.autoTangentArc(sk.addArc(cp.id, sp.id, ep.id, this.sweep > 0));
    this.tc.commit('Arc');
    this.pts = []; this.sweep = 0; this.lastTheta = null;
  }
  liveValue() {
    if (!this.cursor) return null;
    if (this.pts.length === 1) return 'R ' + this.fmtL(dist(this.pts[0], this.cursor));
    if (this.pts.length === 2) return `R ${this.fmtL(dist(this.pts[0], this.pts[1]))} · ${this.fmtA(this.sweep)}`;
    return null;
  }
  preview(d) {
    if (!this.cursor) return;
    if (this.pts.length === 1) { d.guide(this.pts[0], this.cursor); d.circle(this.pts[0], dist(this.pts[0], this.cursor), true); d.point(this.pts[0]); }
    else if (this.pts.length === 2) {
      const [c, s] = this.pts;
      const r = dist(c, s);
      const a1 = angleOf(sub(s, c));
      const th = angleOf(sub(this.cursor, c));
      d.circle(c, r, true);
      d.guide(c, s); d.guide(c, add(c, fromAngle(th, r)));
      if (Math.abs(this.sweep) > 1e-4) d.arc(c, r, a1, th, this.sweep > 0);
      d.point(c); d.point(s);
    }
  }
}

/** Arc par trois points : départ, arrivée, puis un point sur l'arc. */
export class Arc3Tool extends Tool {
  hint() { return ['Touchez le point de départ', 'Touchez le point d\'arrivée', 'Touchez un point sur l\'arc'][this.pts.length]; }
  step() {
    if (this.pts.length === 2 && this.tooClose(this.pts[0], this.pts[1])) { this.rejectLast(); return; }
    if (this.pts.length < 3) return;
    const [s, e, m] = this.pts;
    const res = circleFrom3(s, e, m);
    if (!res || res.r < this.tc.tolWorld()) { this.rejectLast('Points alignés : arc impossible'); return; }
    const aS = angleOf(sub(s, res.c)), aE = angleOf(sub(e, res.c)), aM = angleOf(sub(m, res.c));
    const ccw = angleInArc(aM, aS, aE, true);
    const sk = this.tc.sketch;
    const cp = sk.addPoint(res.c.x, res.c.y);
    const sp = this.tc.resolvePoint(s);
    const ep = this.tc.resolvePoint(e);
    if (sp.id === ep.id) { this.rejectLast(); return; }
    this.autoTangentArc(sk.addArc(cp.id, sp.id, ep.id, ccw));
    this.tc.commit('Arc 3 points');
    this.pts = [];
  }
  liveValue() {
    if (!this.cursor) return null;
    if (this.pts.length === 1) return this.fmtL(dist(this.pts[0], this.cursor));
    if (this.pts.length === 2) {
      const res = circleFrom3(this.pts[0], this.pts[1], this.cursor);
      return res ? 'R ' + this.fmtL(res.r) : null;
    }
    return null;
  }
  preview(d) {
    if (!this.cursor) return;
    if (this.pts.length === 1) { d.guide(this.pts[0], this.cursor); d.point(this.pts[0]); }
    else if (this.pts.length === 2) {
      const [s, e] = this.pts;
      const res = circleFrom3(s, e, this.cursor);
      if (res) {
        const aS = angleOf(sub(s, res.c)), aE = angleOf(sub(e, res.c)), aM = angleOf(sub(this.cursor, res.c));
        d.arc(res.c, res.r, aS, aE, angleInArc(aM, aS, aE, true));
      } else d.guide(s, e);
      d.point(s); d.point(e);
    }
  }
}

/** Arc tangent : part de l'extrémité d'une ligne ou d'un arc, dans son prolongement. */
export class ArcTangentTool extends Tool {
  reset() { this.tangent = null; this.fromEntity = null; super.reset(); }
  hint() { return this.pts.length === 0 ? 'Touchez l\'extrémité d\'une ligne ou d\'un arc' : 'Touchez le point d\'arrivée'; }
  place(s) {
    if (this.pts.length === 0) {
      const t = s.pointId ? this.tc.endpointTangent(s.pointId) : null;
      if (!t) { this.tc.toast('Touchez l\'extrémité d\'une ligne ou d\'un arc'); return; }
      this.tangent = t.dir; this.fromEntity = t.entity;
    }
    super.place(s);
  }
  compute(s, e) {
    const d = sub(e, s);
    const n = perp(this.tangent);
    const dn = dot(d, n);
    const l2 = dot(d, d);
    if (l2 < 1e-12 || Math.abs(dn) < 1e-6 * Math.sqrt(l2)) return null;
    const rho = l2 / (2 * dn);
    const c = add(s, mul(n, rho));
    return { c, r: Math.abs(rho), ccw: rho > 0 };
  }
  step() {
    if (this.pts.length < 2) return;
    const [s, e] = this.pts;
    if (this.tooClose(s, e)) { this.rejectLast(); return; }
    const res = this.compute(s, e);
    if (!res) { this.rejectLast('Arc impossible : point aligné avec la tangente'); return; }
    const sk = this.tc.sketch;
    const cp = sk.addPoint(res.c.x, res.c.y);
    const sp = this.tc.resolvePoint(s);
    const ep = this.tc.resolvePoint(e);
    if (sp.id === ep.id) { this.rejectLast(); return; }
    const arc = sk.addArc(cp.id, sp.id, ep.id, res.ccw);
    if (this.fromEntity) sk.addConstraint('tangent', [arc.id, this.fromEntity.id]);
    this.tc.commit('Arc tangent');
    this.pts = []; this.tangent = null; this.fromEntity = null;
  }
  liveValue() {
    if (this.pts.length !== 1 || !this.cursor) return null;
    const res = this.compute(this.pts[0], this.cursor);
    return res ? 'R ' + this.fmtL(res.r) : null;
  }
  preview(d) {
    if (this.pts.length !== 1 || !this.cursor) return;
    const s = this.pts[0];
    const res = this.compute(s, this.cursor);
    if (res) d.arc(res.c, res.r, angleOf(sub(s, res.c)), angleOf(sub(this.cursor, res.c)), res.ccw);
    else d.line(s, this.cursor);
    d.guide(s, add(s, mul(this.tangent, 10)));
    d.point(s);
  }
}

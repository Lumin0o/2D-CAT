// Outil Point : pose un point d'esquisse isolé (comme SOLIDWORKS).
// Il s'accroche comme les autres outils (milieu → point milieu, sur une entité → coïncident, intersection…)
// et peut ensuite être coté, relié par des relations ou servir d'extrémité à une ligne.
import { Tool } from './base.js';

export class PointTool extends Tool {
  /** Un seul toucher par point : le réglage glisser-lâcher ne s'applique pas. */
  get usesDrawInput() { return false; }
  hint() { return 'Touchez pour poser un point'; }
  step() {
    const s = this.pts.pop();
    if (!s) return;
    const sk = this.tc.sketch;
    if (s.pointId && sk.points.has(s.pointId)) { this.tc.toast('Un point existe déjà ici'); return; }
    const p = this.tc.resolvePoint(s);
    p.sketchPoint = true;
    this.tc.commit('Point');
  }
  /** Position du point par rapport à l'origine. */
  liveValue() {
    if (!this.cursor) return null;
    return `X ${this.fmtL(this.cursor.x)} · Y ${this.fmtL(this.cursor.y)}`;
  }
  preview(d) {
    if (this.cursor) d.point(this.cursor);
  }
}

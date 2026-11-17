// Classe de base des outils de tracé.
// Cycle : onPress (doigt posé) → onMove (aperçu qui suit le doigt) → onRelease (le point est posé).
// Le contexte « tc » est fourni par l'application (esquisse, aimantation, historique, messages).
import { dist, sub, perp, norm, dot } from '../../core/geom.js';
import { endpointEntities, outwardTangentAt } from '../../core/query.js';

const TANGENT_TOL = Math.cos(6 * Math.PI / 180);

export class Tool {
  constructor(tc) {
    this.tc = tc;
    this.pts = [];        // points posés (résultats d'aimantation : {x, y, pointId?, kind})
    this.cursor = null;   // position courante du doigt (aimantée), ou null
    this.onActivate();
  }
  onActivate() { this.reset(); }
  reset() { this.pts = []; this.cursor = null; this.updateHint(); }

  onPress(wp) { this.cursor = this.tc.snap(wp); this.onCursor(true); this.tc.requestDraw(); }
  onMove(wp) { this.cursor = this.tc.snap(wp); this.onCursor(false); this.tc.requestDraw(); }
  onRelease(wp) {
    const s = this.tc.snap(wp);
    this.cursor = null;
    this.place(s);
    this.tc.requestDraw();
  }
  onCancel() { this.cursor = null; this.tc.requestDraw(); }
  onCursor(/* pressed */) {}

  place(s) {
    this.pts.push(s);
    this.step();
    this.updateHint();
  }
  step() {}
  preview(/* d, st */) {}
  hint() { return ''; }
  updateHint() { this.tc.setHint(this.hint()); }
  /** Appui sur l'outil déjà actif : renvoie true si l'outil a traité l'appui (fin de chaîne). */
  onToolbarTap() { return false; }

  // ---- Aides ----
  samePoint(a, b) {
    if (a.pointId && b.pointId) return a.pointId === b.pointId;
    return dist(a, b) < this.tc.tolWorld();
  }
  tooClose(a, b) { return dist(a, b) < this.tc.tolWorld(); }
  /**
   * Tangence automatique : si l'arc part (ou arrive) à l'extrémité d'une entité dans son prolongement,
   * ajoute la relation tangente (comme SOLIDWORKS).
   */
  autoTangentArc(arc) {
    if (!this.tc.settings.snap) return;
    const sk = this.tc.sketch;
    const c = sk.points.get(arc.c);
    for (const [pid, leaving] of [[arc.s, true], [arc.e, false]]) {
      const P = sk.points.get(pid);
      let travel = norm(perp(sub(P, c)));              // sens trigo
      if (!arc.ccw) travel = { x: -travel.x, y: -travel.y };
      for (const e of endpointEntities(sk, pid)) {
        if (e.id === arc.id) continue;
        const t = outwardTangentAt(sk, e, pid);
        if (!t) continue;
        const d = dot(travel, t) * (leaving ? 1 : -1);
        if (d > TANGENT_TOL) { sk.addConstraint('tangent', [arc.id, e.id]); break; }
      }
    }
  }
  rejectLast(msg) {
    this.pts.pop();
    if (msg) this.tc.toast(msg);
  }
}

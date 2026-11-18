// Classe de base des outils de tracé.
// Cycle : onPress (doigt posé) → onMove (aperçu qui suit le doigt) → onRelease (le point est posé).
// Réglage « Poser les points » (settings.drawInput) :
//   'tap'  : un toucher par point (glisser avant de lâcher ajuste le point) ;
//   'drag' : premier point là où le doigt se pose, deuxième là où il se lève ; les suivants au toucher ;
//   'both' : glisser dès le premier point trace directement, sinon touchers successifs.
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
  reset() { this.pts = []; this.cursor = null; this.press = null; this.dragged = false; this.updateHint(); }

  /** Les outils de tracé suivent le réglage glisser-lâcher (pas les cotes). */
  get usesDrawInput() { return true; }
  drawInput() { return this.usesDrawInput ? (this.tc.settings.drawInput || 'tap') : 'tap'; }

  onPress(wp) {
    this.cursor = this.tc.snap(wp);
    // glisser-lâcher possible : le premier point sera celui où le doigt s'est posé
    this.press = this.pts.length === 0 && this.drawInput() !== 'tap' ? { raw: { x: wp.x, y: wp.y }, snap: this.cursor } : null;
    this.dragged = false;
    this.onCursor(true);
    this.tc.requestDraw();
  }
  onMove(wp) {
    if (this.press && !this.dragged && dist(this.press.raw, wp) > this.tc.tolWorld()) {
      // le doigt glisse : le premier point est posé là où il s'est posé, l'aperçu suit le doigt
      const n = this.pts.length;
      this.place(this.press.snap);
      if (this.pts.length > n) this.dragged = true; else this.press = null;
    }
    this.cursor = this.tc.snap(wp);
    this.onCursor(false);
    this.tc.requestDraw();
  }
  onRelease(wp) {
    const s = this.tc.snap(wp);
    const mode = this.drawInput();
    const tapOnly = this.press && !this.dragged;    // pas de glissement
    this.cursor = null;
    this.press = null;
    if (mode === 'drag' && tapOnly && this.pts.length === 0) {
      this.tc.toast('Glissez du premier point au deuxième');
      this.tc.requestDraw();
      return;
    }
    this.place(s);
    this.dragged = false;
    this.tc.requestDraw();
  }
  onCancel() {
    // deux doigts pendant un glisser-lâcher : le premier point n'est pas gardé
    if (this.dragged) { this.pts = []; this.dragged = false; this.updateHint(); }
    this.press = null;
    this.cursor = null;
    this.tc.requestDraw();
  }
  onCursor(/* pressed */) {}

  place(s) {
    this.pts.push(s);
    this.step();
    this.updateHint();
  }
  step() {}
  preview(/* d, st */) {}
  hint() { return ''; }
  updateHint() {
    let h = this.hint();
    if (h && this.pts.length === 0 && this.usesDrawInput && this.tc.settings.drawInput === 'drag') h = h.replace(/^Touchez (l['’]|le |la |les |un |une )?/, (m, art) => 'Glissez depuis ' + (art || ''));
    this.tc.setHint(h);
  }
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
    if (!this.tc.settings.snap || (this.tc.settings.snapTypes && this.tc.settings.snapTypes.tangent === false)) return;
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

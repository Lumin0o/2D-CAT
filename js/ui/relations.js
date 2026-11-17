// Relations manuelles : relations compatibles avec la sélection, et barre de choix.
import { REL_GLYPH, REL_LABEL } from '../render/annotations.js';
import { ORIGIN_ID } from '../core/model.js';
import { isDimension } from '../core/solver.js';

/**
 * @returns {Array<{type:string, label:string, glyph:string, items:Array<[string, string[]]>, merge?:[string,string]}>}
 */
export function availableRelations(sk, selection) {
  const P = [], L = [], C = [];
  for (const id of selection) {
    if (sk.points.has(id)) P.push(id);
    else {
      const e = sk.entities.get(id);
      if (!e) return [];                       // une cote ou une relation est sélectionnée
      if (e.type === 'line') L.push(id); else C.push(id);
    }
  }
  const n = P.length + L.length + C.length;
  if (n === 0) return [];
  const out = [];
  const rel = (type, items, extra = {}) => out.push({ type, label: REL_LABEL[type], glyph: REL_GLYPH[type], items, ...extra });
  const chain = (type, ids) => ids.slice(1).map((id) => [type, [ids[0], id]]);

  if (L.length >= 1 && P.length === 0 && C.length === 0) {
    rel('horizontal', L.map((id) => ['horizontal', [id]]));
    rel('vertical', L.map((id) => ['vertical', [id]]));
    if (L.length >= 2) {
      rel('parallel', chain('parallel', L));
      if (L.length === 2) { rel('perpendicular', [['perpendicular', L]]); rel('collinear', [['collinear', L]]); }
      rel('equal', chain('equal', L));
    }
  }
  if (P.length === 2 && L.length === 0 && C.length === 0) {
    rel('horizontal', [['horizontal', P]]);
    rel('vertical', [['vertical', P]]);
    rel('coincident', [], { merge: P });
  }
  if (P.length === 1 && L.length === 1 && C.length === 0) {
    rel('coincident', [['coincident', [P[0], L[0]]]]);
    rel('midpoint', [['midpoint', [P[0], L[0]]]]);
  }
  if (P.length === 1 && C.length === 1 && L.length === 0) rel('coincident', [['coincident', [P[0], C[0]]]]);
  if (L.length === 1 && C.length === 1 && P.length === 0) rel('tangent', [['tangent', [L[0], C[0]]]]);
  if (C.length >= 2 && P.length === 0 && L.length === 0) {
    if (C.length === 2) rel('tangent', [['tangent', C]]);
    rel('concentric', chain('concentric', C));
    rel('equal', chain('equal', C));
  }
  if (P.length === 2 && L.length === 1 && C.length === 0) rel('symmetric', [['symmetric', [P[0], P[1], L[0]]]]);
  const fixable = [...P, ...L, ...C].filter((id) => id !== ORIGIN_ID);
  if (fixable.length) rel('fixed', fixable.map((id) => ['fixed', [id]]));

  // retire les relations déjà présentes
  const exists = (type, refs) => {
    for (const k of sk.constraints.values()) {
      if (k.type === type && k.refs.length === refs.length && refs.every((r) => k.refs.includes(r))) return true;
    }
    return false;
  };
  return out.map((r) => ({ ...r, items: r.items.filter(([t, refs]) => !exists(t, refs)) })).filter((r) => r.merge || r.items.length > 0);
}

export class RelationBar {
  constructor(app, el) { this.app = app; this.el = el; }
  update() {
    const app = this.app;
    this.el.innerHTML = '';
    // une cote seule sélectionnée : bascule pilotée / pilotante, et modification
    const one = !app.tool && app.selection.size === 1 ? app.sketch.constraints.get([...app.selection][0]) : null;
    if (one && isDimension(one)) {
      this.el.hidden = false;
      const chip = (glyph, label, fn, cls = '') => {
        const b = document.createElement('button');
        b.className = 'rel-chip ' + cls;
        b.innerHTML = `<span class="glyph">${glyph}</span>${label}`;
        b.addEventListener('click', (e) => { e.preventDefault(); fn(); });
        this.el.appendChild(b);
      };
      if (one.driven) chip('↦', 'Rendre pilotante', () => app.toggleDriven(one.id), 'dim');
      else {
        chip('( )', 'Rendre pilotée', () => app.toggleDriven(one.id), 'dim');
        chip('✎', 'Modifier la valeur', () => app.editDimension(one.id), 'dim');
      }
      return;
    }
    const rels = app.tool ? [] : availableRelations(app.sketch, app.selection);
    this.el.hidden = rels.length === 0;
    for (const r of rels) {
      const b = document.createElement('button');
      b.className = 'rel-chip';
      b.innerHTML = `<span class="glyph">${r.glyph}</span>${r.label}`;
      b.addEventListener('click', (e) => { e.preventDefault(); app.applyRelation(r); });
      this.el.appendChild(b);
    }
  }
}

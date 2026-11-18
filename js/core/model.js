// Modèle géométrique de l'esquisse.
// - points : { id, x, y, fixed }  (l'origine est un point fixe permanent, id 'origin')
//   Un point posé avec l'outil Point porte sketchPoint: true : il existe sans entité et n'est jamais
//   supprimé comme point orphelin.
// - entités : ligne { p1, p2 }, cercle { c, r }, arc { c, s, e, ccw }
//   Les entités référencent des points par id. Deux entités qui partagent un point
//   sont « coïncidentes » (c'est ainsi que sont reliés les coins d'un rectangle).
// - contraintes : { id, type, refs: [...ids], value? }
//   Les cotes sont des contraintes avec une valeur et une position d'affichage.
//   Cotes ordinales : une cote 0 { type: 'ordZero', refs: [point de référence], axis: 'h'|'v', pos }
//   (sans équation) et des cotes horizontales / verticales { refs: [référence, point], ord: id de la cote 0 },
//   alignées sur la cote 0.
import { dist, arcBBox } from './geom.js';

export const ORIGIN_ID = 'origin';
export const MODEL_VERSION = 1;

export class Sketch {
  constructor() {
    this.points = new Map();
    this.entities = new Map();
    this.constraints = new Map();
    this.seq = 1;
    this.ensureOrigin();
  }

  ensureOrigin() {
    if (!this.points.has(ORIGIN_ID)) {
      this.points.set(ORIGIN_ID, { id: ORIGIN_ID, x: 0, y: 0, fixed: true, origin: true });
    }
  }

  newId(prefix) {
    return prefix + (this.seq++).toString(36);
  }

  // ----- Points -----
  addPoint(x, y) {
    const p = { id: this.newId('p'), x, y, fixed: false };
    this.points.set(p.id, p);
    return p;
  }
  getPoint(id) { return this.points.get(id); }

  // ----- Entités -----
  addLine(p1, p2, opts = {}) {
    const e = { id: this.newId('e'), type: 'line', p1, p2, construction: !!opts.construction };
    if (opts.infinite) e.infinite = true;      // ligne infinie (construction) : droite passant par p1 et p2
    this.entities.set(e.id, e);
    return e;
  }
  addCircle(c, r, opts = {}) {
    const e = { id: this.newId('e'), type: 'circle', c, r, construction: !!opts.construction };
    this.entities.set(e.id, e);
    return e;
  }
  addArc(c, s, e_, ccw, opts = {}) {
    const e = { id: this.newId('e'), type: 'arc', c, s, e: e_, ccw: !!ccw, construction: !!opts.construction };
    this.entities.set(e.id, e);
    return e;
  }
  getEntity(id) { return this.entities.get(id); }

  // ----- Contraintes -----
  addConstraint(type, refs, extra = {}) {
    const k = { id: this.newId('c'), type, refs: [...refs], ...extra };
    this.constraints.set(k.id, k);
    return k;
  }
  removeConstraint(id) { this.constraints.delete(id); }

  // ----- Requêtes -----
  entityPointIds(e) {
    switch (e.type) {
      case 'line': return [e.p1, e.p2];
      case 'circle': return [e.c];
      case 'arc': return [e.c, e.s, e.e];
      default: return [];
    }
  }
  entitiesOfPoint(pid) {
    const out = [];
    for (const e of this.entities.values()) if (this.entityPointIds(e).includes(pid)) out.push(e);
    return out;
  }
  constraintsOf(id) {
    const out = [];
    for (const k of this.constraints.values()) if (k.refs.includes(id)) out.push(k);
    return out;
  }
  isEmpty() {
    if (this.entities.size > 0) return false;
    for (const p of this.points.values()) if (p.sketchPoint) return false;
    return true;
  }

  // ----- Suppression -----
  removeEntity(id) {
    const e = this.entities.get(id);
    if (!e) return;
    this.entities.delete(id);
    this.removeConstraintsReferencing(id);
    for (const pid of this.entityPointIds(e)) this.pruneOrphanPoint(pid);
  }
  pruneOrphanPoint(pid) {
    if (pid === ORIGIN_ID || this.points.get(pid)?.sketchPoint) return;
    if (this.entitiesOfPoint(pid).length === 0) {
      this.points.delete(pid);
      this.removeConstraintsReferencing(pid);
    }
  }
  removePoint(pid) {
    if (pid === ORIGIN_ID) return;
    for (const e of this.entitiesOfPoint(pid)) this.removeEntity(e.id);
    this.points.delete(pid);
    this.removeConstraintsReferencing(pid);
  }
  removeConstraintsReferencing(id) {
    for (const [cid, k] of this.constraints) if (k.refs.includes(id)) this.constraints.delete(cid);
  }

  /** Fusionne deux points (coïncidence) : « drop » est remplacé par « keep » partout. */
  mergePoints(keep, drop) {
    if (keep === drop) return keep;
    if (drop === ORIGIN_ID) [keep, drop] = [drop, keep];
    for (const e of this.entities.values()) {
      for (const key of ['p1', 'p2', 'c', 's', 'e']) if (e[key] === drop) e[key] = keep;
    }
    for (const k of this.constraints.values()) k.refs = k.refs.map((r) => (r === drop ? keep : r));
    const kp = this.points.get(keep), dp = this.points.get(drop);
    if (kp && dp && dp.sketchPoint && !kp.origin) kp.sketchPoint = true;
    this.points.delete(drop);
    return keep;
  }

  /** Supprime les contraintes devenues sans objet (références en double, point sur sa propre entité). */
  cleanupDegenerate() {
    for (const [cid, k] of this.constraints) {
      if (new Set(k.refs).size < k.refs.length) { this.constraints.delete(cid); continue; }
      if (!k.refs.every((r) => this.points.has(r) || this.entities.has(r))) { this.constraints.delete(cid); continue; }
      if (k.ord && !this.constraints.has(k.ord)) { this.constraints.delete(cid); continue; }   // cote 0 supprimée
      if (k.type === 'coincident' || k.type === 'midpoint' || k.type === 'dimPointLine') {
        const e = this.entities.get(k.refs[1]);
        if (e && this.entityPointIds(e).includes(k.refs[0]) && !(e.type !== 'line' && e.c === k.refs[0])) this.constraints.delete(cid);
      }
    }
  }

  /** Boîte englobante de la géométrie (null si vide). */
  bbox() {
    let b = null;
    const grow = (x, y) => {
      if (!b) b = { minX: x, minY: y, maxX: x, maxY: y };
      else { b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y); b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y); }
    };
    for (const e of this.entities.values()) {
      if (e.type === 'line') { const a = this.points.get(e.p1), c = this.points.get(e.p2); grow(a.x, a.y); grow(c.x, c.y); }
      else if (e.type === 'circle') { const c = this.points.get(e.c); grow(c.x - e.r, c.y - e.r); grow(c.x + e.r, c.y + e.r); }
      else if (e.type === 'arc') {
        const bb = arcBBox(this.points.get(e.c), this.points.get(e.s), this.points.get(e.e), e.ccw);
        grow(bb.minX, bb.minY); grow(bb.maxX, bb.maxY);
      }
    }
    for (const p of this.points.values()) if (p.sketchPoint) grow(p.x, p.y);
    return b;
  }

  // ----- Sérialisation -----
  toJSON() {
    return {
      v: MODEL_VERSION,
      seq: this.seq,
      points: [...this.points.values()],
      entities: [...this.entities.values()],
      constraints: [...this.constraints.values()],
    };
  }
  static fromJSON(j) {
    const s = new Sketch();
    if (!j) return s;
    s.seq = j.seq || 1;
    s.points = new Map((j.points || []).map((p) => [p.id, { ...p }]));
    s.entities = new Map((j.entities || []).map((e) => [e.id, { ...e }]));
    s.constraints = new Map((j.constraints || []).map((k) => [k.id, { ...k, refs: [...(k.refs || [])] }]));
    s.ensureOrigin();
    // Nettoyage défensif : entités dont les points manquent
    for (const [id, e] of s.entities) {
      if (!s.entityPointIds(e).every((pid) => s.points.has(pid))) s.entities.delete(id);
    }
    return s;
  }
  serialize() { return JSON.stringify(this.toJSON()); }
  static deserialize(str) { return Sketch.fromJSON(str ? JSON.parse(str) : null); }
}

// Outils de l'étape 3 : construction, Mètre, ajuster, prolonger, décaler, miroir, congé, chanfrein,
// déplacer, copier, pivoter. Les calculs géométriques sont dans core/edit.js ; chaque modification passe
// par tc.applyEdit (annulable, et annulée d'elle-même si le solveur n'y arrive pas).
import { Tool } from './base.js';
import { dist, sub, add, angleOf, arcInfo, niceStep, normAngle } from '../../core/geom.js';
import { entityLength } from '../../core/query.js';
import { fmtLength, fmtAngle } from '../../core/units.js';
import {
  trimAt, extendAt, filletLines, chamferLines, cornerLines, chainFrom, offsetSide, offsetGeometry, offsetChain,
  mirrorEntities, transformSelection, translation, rotation, reflectPoint,
} from '../../core/edit.js';

const HEAVY = 1e6;

/** Outil « à toucher » : pas de tracé point par point, on désigne des éléments. */
class PickTool extends Tool {
  get usesDrawInput() { return false; }
  reset() {
    this.highlight = new Set();
    this.noMarker = true;
    this.noLoupe = true;
    super.reset();
  }
  onPress(wp) { this.cursor = { x: wp.x, y: wp.y, kind: null }; this.hover(wp); this.tc.requestDraw(); }
  onMove(wp) { this.cursor = { x: wp.x, y: wp.y, kind: null }; this.hover(wp); this.tc.requestDraw(); }
  onRelease(wp) {
    this.cursor = null;
    this.tap(wp);
    this.updateHint();
    this.tc.refreshUI();
  }
  onCancel() { this.cursor = null; this.tc.requestDraw(); }
  hover(/* wp */) {}
  tap(/* wp */) {}
  /** Entités et points isolés désignés par un toucher. */
  itemAt(wp) {
    const sk = this.tc.sketch;
    const h = this.tc.hitGeometry(wp);
    if (h && h.type === 'point' && sk.points.get(h.id)?.sketchPoint) return h.id;
    return this.tc.hitEntity(wp);
  }
  /** Entités et points isolés d'une liste d'ids (sélection reprise à l'activation). */
  usable(ids) {
    const sk = this.tc.sketch;
    return ids.filter((id) => sk.entities.has(id) || sk.points.get(id)?.sketchPoint);
  }
  fmtLong(v) { return fmtLength(v, this.tc.settings); }
}

// ---------- Construction ----------
/** Bascule une entité entre trait normal et construction (pointillés). */
export class ToggleConstructionTool extends PickTool {
  onActivate() {
    super.onActivate();
    const ids = this.tc.takeSelection().filter((id) => this.tc.sketch.entities.has(id));
    if (ids.length) this.toggle(ids);
  }
  hint() { return 'Touchez une entité : trait normal ↔ construction'; }
  toggle(ids) {
    const sk = this.tc.sketch;
    const toCons = ids.some((id) => !sk.entities.get(id).construction);
    this.tc.applyEdit(toCons ? 'Construction' : 'Trait normal', (s) => { for (const id of ids) s.entities.get(id).construction = toCons; });
  }
  hover(wp) { const id = this.tc.hitEntity(wp); this.highlight = new Set(id ? [id] : []); }
  tap(wp) {
    this.highlight = new Set();
    const id = this.tc.hitEntity(wp);
    if (id) this.toggle([id]);
  }
}

// ---------- Mètre ----------
const POINT_KINDS = new Set(['point', 'origin', 'midpoint', 'quadrant', 'intersection', 'grid']);
/** Mètre : distance entre deux points, ou dimensions d'une entité. Rien n'est ajouté à l'esquisse. */
export class MeasureTool extends Tool {
  get usesDrawInput() { return false; }
  reset() { this.a = null; this.b = null; this.measured = null; super.reset(); }
  onActivate() { super.onActivate(); this.tc.setMeasure('Mètre', 'Touchez deux points, ou une entité'); }
  hint() { return this.a && !this.b ? 'Touchez le second point' : 'Touchez deux points, ou une entité à mesurer'; }
  onPress(wp) { this.cursor = this.tc.snap(wp); this.tc.requestDraw(); }
  onMove(wp) { this.cursor = this.tc.snap(wp); this.tc.requestDraw(); }
  onCancel() { this.cursor = null; this.tc.requestDraw(); }
  onRelease(wp) {
    const s = this.tc.snap(wp);
    this.cursor = null;
    if (this.b || this.measured) { this.a = null; this.b = null; this.measured = null; }
    if (!this.a) {
      const eid = POINT_KINDS.has(s.kind) ? null : this.tc.hitEntity(wp);
      if (eid) this.measureEntity(eid);
      else { this.a = s; this.tc.setMeasure('Point de départ posé', 'Touchez le second point'); }
    } else {
      this.b = s;
      this.showDistance(this.a, this.b);
    }
    this.updateHint();
    this.tc.requestDraw();
  }
  showDistance(a, b) {
    const S = this.tc.settings;
    const dx = b.x - a.x, dy = b.y - a.y;
    this.tc.setMeasure(`Distance ${fmtLength(Math.hypot(dx, dy), S)}`,
      `ΔX ${fmtLength(Math.abs(dx), S)} · ΔY ${fmtLength(Math.abs(dy), S)} · Angle ${fmtAngle(normAngle(Math.atan2(dy, dx)), S)}`);
  }
  measureEntity(eid) {
    const sk = this.tc.sketch, S = this.tc.settings;
    const e = sk.entities.get(eid);
    this.measured = eid;
    if (e.type === 'line') {
      const a = sk.points.get(e.p1), b = sk.points.get(e.p2);
      this.tc.setMeasure(`Longueur ${fmtLength(entityLength(sk, e), S)}`,
        `ΔX ${fmtLength(Math.abs(b.x - a.x), S)} · ΔY ${fmtLength(Math.abs(b.y - a.y), S)} · Angle ${fmtAngle(normAngle(angleOf(sub(b, a))), S)}`);
    } else if (e.type === 'circle') {
      this.tc.setMeasure(`Rayon ${fmtLength(e.r, S)} · Ø ${fmtLength(2 * e.r, S)}`, `Périmètre ${fmtLength(2 * Math.PI * e.r, S)}`);
    } else {
      const i = arcInfo(sk.points.get(e.c), sk.points.get(e.s), sk.points.get(e.e), e.ccw);
      this.tc.setMeasure(`Rayon ${fmtLength(i.r, S)} · Angle ${fmtAngle(i.sweep, S)}`, `Longueur d'arc ${fmtLength(i.length, S)} · Corde ${fmtLength(dist(sk.points.get(e.s), sk.points.get(e.e)), S)}`);
    }
  }
  get highlight() { return new Set(this.measured ? [this.measured] : []); }
  liveValue() { return this.a && !this.b && this.cursor ? this.fmtL(dist(this.a, this.cursor)) : null; }
  preview(d) {
    const a = this.a, b = this.b || (this.a && this.cursor);
    if (a && b) d.measure(a, b);
    else if (a) d.measurePoint(a);
  }
}

// ---------- Ajuster / prolonger ----------
/**
 * Ajuster intelligent : toucher une portion la supprime jusqu'aux intersections voisines ; glisser le doigt
 * à travers plusieurs entités les ajuste toutes (un seul « annuler »).
 */
export class TrimTool extends PickTool {
  reset() { this.path = []; this.hits = []; super.reset(); }
  hint() { return 'Touchez (ou balayez) les portions à supprimer'; }
  onPress(wp) { this.path = [wp]; this.hits = []; this.collect(wp); super.onPress(wp); }
  onMove(wp) { this.path.push(wp); this.collect(wp); super.onMove(wp); }
  collect(wp) {
    const id = this.tc.hitEntity(wp);
    if (id && !this.hits.some((h) => h.id === id)) { this.hits.push({ id, wp }); this.highlight = new Set(this.hits.map((h) => h.id)); }
  }
  onCancel() { this.path = []; this.hits = []; this.highlight = new Set(); super.onCancel(); }
  tap() {
    const hits = this.hits;
    this.path = []; this.hits = []; this.highlight = new Set();
    if (!hits.length) return;
    this.tc.applyEdit('Ajuster', (sk) => {
      let done = 0, msg = null;
      for (const h of hits) {
        if (!sk.entities.has(h.id)) continue;
        const r = trimAt(sk, h.id, h.wp);
        if (r.ok) done++; else msg = r.msg;
      }
      return done ? { ok: true } : { ok: false, msg: msg || 'Rien à ajuster' };
    });
  }
  preview(d) { if (this.path.length > 1) d.polyline(this.path, false, true); }
}

/** Prolonger : toucher une ligne ou un arc près du bout à prolonger, jusqu'à la première entité rencontrée. */
export class ExtendTool extends PickTool {
  hint() { return 'Touchez une ligne ou un arc près du bout à prolonger'; }
  hover(wp) { const id = this.tc.hitEntity(wp); this.highlight = new Set(id ? [id] : []); }
  tap(wp) {
    this.highlight = new Set();
    const id = this.tc.hitEntity(wp);
    if (id) this.tc.applyEdit('Prolonger', (sk) => extendAt(sk, id, wp));
  }
}

// ---------- Décaler ----------
/** Décaler : touchez le contour (chaîne d'entités reliées), puis le côté ; la distance se saisit au clavier. */
export class OffsetTool extends PickTool {
  static lastD = null;
  reset() { this.chain = null; this.side = 0; this.d = 0; super.reset(); }
  onActivate() {
    super.onActivate();
    const ids = this.tc.takeSelection().filter((id) => this.tc.sketch.entities.has(id));
    if (ids.length) this.setChain(ids[0]);
  }
  /** Options (petite fenêtre sous la barre d'outils), gardées dans les réglages. */
  get opts() { return { chain: true, dim: false, construction: false, ...(this.tc.settings.offsetOpts || {}) }; }
  options() {
    const o = this.opts;
    const set = (key) => (v) => {
      this.tc.setSetting('offsetOpts', { ...this.opts, [key]: v });
      if (key === 'chain' && this.chain) this.setChain(this.chainStart);
    };
    return [
      { label: 'Sélectionner la chaîne', sub: 'Entités reliées bout à bout (hors construction)', value: o.chain, set: set('chain') },
      { label: 'Ajouter une cote', sub: 'Verrouille la distance de décalage', value: o.dim, set: set('dim') },
      { label: 'Construction', sub: 'Le décalage est une ligne de construction', value: o.construction, set: set('construction') },
    ];
  }
  hint() { return this.chain ? 'Touchez le côté où décaler' : (this.opts.chain ? 'Touchez le contour à décaler' : 'Touchez l\'entité à décaler'); }
  setChain(eid) {
    this.chain = chainFrom(this.tc.sketch, eid, { chain: this.opts.chain });
    this.chainStart = eid;
    this.highlight = new Set(this.chain.items.map((i) => i.id));
  }
  hover(wp) {
    if (!this.chain) { const id = this.tc.hitEntity(wp); this.highlight = new Set(id ? [id] : []); return; }
    const s = offsetSide(this.tc.sketch, this.chain, wp);
    if (s) { this.side = s.side; this.d = s.d; }
  }
  tap(wp) {
    if (!this.chain) {
      const id = this.tc.hitEntity(wp);
      if (id) this.setChain(id); else this.highlight = new Set();
      return;
    }
    const s = offsetSide(this.tc.sketch, this.chain, wp);
    if (!s) return;
    this.side = s.side;
    const start = this.chainStart, side = s.side;
    const init = OffsetTool.lastD || niceRound(s.d);
    this.d = init;
    this.tc.lengthKeypad('Distance de décalage', init, (mm) => {
      OffsetTool.lastD = mm;
      const o = this.opts;
      const gap = this.tc.pxToWorld(26);
      this.tc.applyEdit('Décaler', (sk) => offsetChain(sk, chainFrom(sk, start, { chain: o.chain }), mm, side, { construction: o.construction, dim: o.dim, gap }));
      this.reset();
      this.tc.refreshUI();
    });
  }
  onToolbarTap() { if (this.chain) { this.reset(); this.tc.refreshUI(); return true; } return false; }
  liveValue() { return this.chain && this.cursor ? this.fmtL(this.d) : null; }
  get noLoupe() { return !this.chain; }
  set noLoupe(v) { /* la loupe suit le doigt une fois le contour choisi */ }
  preview(d) {
    if (!this.chain || !this.side || !(this.d > 0)) return;
    const geo = offsetGeometry(this.tc.sketch, this.chain, this.d, this.side);
    if (!geo) return;
    const dash = this.opts.construction;
    for (const g of geo) {
      if (g.kind === 'line') d.line(g.S, g.E, dash);
      else if (g.kind === 'circle') d.circle(g.c, g.r, dash);
      else {
        const a1 = angleOf(sub(g.S, g.c)), a2 = angleOf(sub(g.E, g.c));
        const ccwTrav = g.e.ccw !== g.it.rev;
        d.arc(g.c, g.r, a1, a2, ccwTrav, dash);
      }
    }
  }
}
/** Valeur ronde proche (pour proposer une distance au clavier). */
function niceRound(v) {
  if (!(v > 0)) return 1;
  const step = niceStep(v / 20);
  return Math.max(step, Math.round(v / step) * step);
}

// ---------- Sélection puis action (miroir, déplacer, copier, pivoter) ----------
class SelectThenActTool extends PickTool {
  reset() { this.items = []; this.phase = 'pick'; super.reset(); }
  onActivate() {
    super.onActivate();
    const ids = this.usable(this.tc.takeSelection());
    if (ids.length) { this.items = ids; this.highlight = new Set(ids); this.phase = this.firstPhase; this.updateHint(); }
  }
  get firstPhase() { return 'base'; }
  pickHint() { return 'Touchez les éléments, puis Valider'; }
  actions() {
    if (this.phase !== 'pick') return [{ label: 'Changer la sélection', glyph: '↺', run: () => { this.phase = 'pick'; this.updateHint(); } }];
    if (!this.items.length) return [];
    return [{ label: `Valider (${this.items.length})`, count: this.items.length, glyph: '✓', cls: 'primary', run: () => { this.phase = this.firstPhase; this.onPicked(); this.updateHint(); } }];
  }
  onPicked() {}
  tapPick(wp) {
    const id = this.itemAt(wp);
    if (!id) return;
    this.items = this.items.includes(id) ? this.items.filter((x) => x !== id) : [...this.items, id];
    this.highlight = new Set(this.items);
  }
  onToolbarTap() {
    if (this.phase !== 'pick' || this.items.length) { this.reset(); this.tc.refreshUI(); return true; }
    return false;
  }
}

/** Miroir : les éléments à copier, puis la ligne de symétrie. Les copies restent symétriques (relations). */
export class MirrorTool extends SelectThenActTool {
  reset() { this.axis = null; this.axisHover = null; super.reset(); }
  get firstPhase() { return 'axis'; }
  hint() {
    if (this.phase === 'pick') return 'Touchez les éléments à copier en miroir, puis Valider';
    return this.axis ? 'Valider pour créer la symétrie · touchez une autre ligne pour changer d\'axe' : 'Touchez la ligne de symétrie';
  }
  onPicked() { this.axis = null; }
  actions() {
    if (this.phase !== 'axis') return super.actions();
    const acts = [{ label: 'Changer la sélection', glyph: '↺', run: () => { this.phase = 'pick'; this.axis = null; this.updateHint(); } }];
    if (this.axis) acts.push({ label: 'Valider la symétrie', glyph: '✓', cls: 'primary', run: () => this.apply() });
    return acts;
  }
  hover(wp) {
    if (this.phase !== 'axis') return;
    const id = this.tc.hitEntity(wp);
    const e = id && this.tc.sketch.entities.get(id);
    this.axisHover = e && e.type === 'line' ? id : null;
  }
  get highlight() { return new Set([...(this._hl || []), ...(this.axisHover ? [this.axisHover] : []), ...(this.axis ? [this.axis] : [])]); }
  set highlight(v) { this._hl = v; }
  tap(wp) {
    if (this.phase === 'pick') { this.tapPick(wp); return; }
    const id = this.tc.hitEntity(wp);
    const e = id && this.tc.sketch.entities.get(id);
    this.axisHover = null;
    if (!e || e.type !== 'line') { if (!id) return; this.tc.toast('Touchez une ligne (ligne de construction de préférence)'); return; }
    if (id === this.axis) { this.axis = null; return; }
    if (!this.items.some((x) => x !== id)) { this.tc.toast('L\'axe ne peut pas être le seul élément copié'); return; }
    this.axis = id;
  }
  apply() {
    const id = this.axis;
    const items = this.items.filter((x) => x !== id);
    if (!id || !items.length) return;
    const r = this.tc.applyEdit('Miroir', (sk) => mirrorEntities(sk, items, id));
    if (r.ok) this.reset();
    this.updateHint();
  }
  preview(d) {
    if (!this.axis) return;
    const sk = this.tc.sketch, ax = sk.entities.get(this.axis);
    if (!ax) return;
    const a = sk.points.get(ax.p1), b = sk.points.get(ax.p2);
    ghost(d, sk, this.items.filter((x) => x !== this.axis), (p) => reflectPoint(p, a, b), true);
  }
}

/** Aperçu « fantôme » des éléments transformés par f. */
function ghost(d, sk, items, f, flip = false) {
  for (const id of items) {
    const e = sk.entities.get(id);
    if (!e) { const p = sk.points.get(id); if (p) d.point(f(p)); continue; }
    const P = (pid) => f(sk.points.get(pid));
    if (e.type === 'line') d.line(P(e.p1), P(e.p2));
    else if (e.type === 'circle') d.circle(P(e.c), e.r);
    else {
      const c = P(e.c), s = P(e.s), en = P(e.e);
      d.arc(c, dist(c, s), angleOf(sub(s, c)), angleOf(sub(en, c)), flip ? !e.ccw : e.ccw);
    }
  }
}

/** Déplacer : point de départ puis point d'arrivée (aimantés). Les liens avec le reste de l'esquisse sont retirés. */
export class MoveTool extends SelectThenActTool {
  get copy() { return false; }
  get label() { return 'Déplacer'; }
  reset() { this.from = null; super.reset(); }
  hint() {
    if (this.phase === 'pick') return `Touchez les éléments à ${this.copy ? 'copier' : 'déplacer'}, puis Valider`;
    return this.from ? 'Touchez le point d\'arrivée' : 'Touchez le point de départ';
  }
  get noMarker() { return this.phase === 'pick'; }
  set noMarker(v) { /* marqueur d'accrochage pendant le choix des points */ }
  get noLoupe() { return this.phase === 'pick'; }
  set noLoupe(v) { /* idem */ }
  onPress(wp) { if (this.phase === 'pick') return super.onPress(wp); this.cursor = this.tc.snap(wp); this.tc.requestDraw(); }
  onMove(wp) { if (this.phase === 'pick') return super.onMove(wp); this.cursor = this.tc.snap(wp); this.tc.requestDraw(); }
  tap(wp) {
    if (this.phase === 'pick') { this.tapPick(wp); return; }
    const s = this.tc.snap(wp);
    if (!this.from) { this.from = s; return; }
    const delta = sub(s, this.from);
    this.from = null;
    if (Math.hypot(delta.x, delta.y) < 1e-9) return;
    const items = this.items;
    const r = this.tc.applyEdit(this.label, (sk) => {
      const res = transformSelection(sk, items, translation(delta), { copy: this.copy });
      if (res.ok) res.weights = new Map([...res.moved].map((id) => [id, HEAVY]));
      return res;
    });
    if (!r.ok) return;
    if (this.copy) { this.highlight = new Set(this.items); this.phase = 'base'; }    // on peut recopier
    else this.reset();
  }
  liveValue() {
    if (!this.from || !this.cursor) return null;
    return `ΔX ${this.fmtL(this.cursor.x - this.from.x)} · ΔY ${this.fmtL(this.cursor.y - this.from.y)}`;
  }
  preview(d) {
    if (this.from) d.point(this.from);
    if (this.from && this.cursor) { d.guide(this.from, this.cursor); ghost(d, this.tc.sketch, this.items, translation(sub(this.cursor, this.from))); }
  }
}
export class CopyTool extends MoveTool {
  get copy() { return true; }
  get label() { return 'Copier'; }
}

/** Pivoter : centre de rotation (aimanté), puis l'angle au clavier (positif = sens inverse des aiguilles). */
export class RotateTool extends SelectThenActTool {
  static lastAngle = Math.PI / 2;
  hint() { return this.phase === 'pick' ? 'Touchez les éléments à pivoter, puis Valider' : 'Touchez le centre de rotation'; }
  get noMarker() { return this.phase === 'pick'; }
  set noMarker(v) { /* marqueur d'accrochage pour le centre */ }
  get noLoupe() { return this.phase === 'pick'; }
  set noLoupe(v) { /* idem */ }
  onPress(wp) { if (this.phase === 'pick') return super.onPress(wp); this.cursor = this.tc.snap(wp); this.tc.requestDraw(); }
  onMove(wp) { if (this.phase === 'pick') return super.onMove(wp); this.cursor = this.tc.snap(wp); this.tc.requestDraw(); }
  tap(wp) {
    if (this.phase === 'pick') { this.tapPick(wp); return; }
    const c = this.tc.snap(wp);
    this.center = c;
    const items = this.items;
    this.tc.signedAngleKeypad('Angle de rotation', RotateTool.lastAngle, (ang) => {
      RotateTool.lastAngle = ang;
      this.center = null;
      const r = this.tc.applyEdit('Pivoter', (sk) => {
        const res = transformSelection(sk, items, rotation(c, ang), { angle: ang });
        if (res.ok) res.weights = new Map([...res.moved].map((id) => [id, HEAVY]));
        return res;
      });
      if (r.ok) this.reset();
      this.tc.refreshUI();
    });
  }
  preview(d) { if (this.center) d.point(this.center); }
}

// ---------- Congé / chanfrein ----------
/** Coins à traiter : points reliant exactement deux lignes, ou paires de lignes. */
function cornersFrom(sk, ids) {
  const out = [];
  const key = (a, b) => [a, b].sort().join('|');
  const seen = new Set();
  const push = (pair) => { const k = key(...pair); if (!seen.has(k)) { seen.add(k); out.push(pair); } };
  const lines = ids.filter((id) => sk.entities.get(id)?.type === 'line');
  for (const id of ids) if (sk.points.has(id)) { const c = cornerLines(sk, id); if (c) push(c); }
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
    const A = sk.entities.get(lines[i]), B = sk.entities.get(lines[j]);
    const shared = [A.p1, A.p2].find((p) => p === B.p1 || p === B.p2);
    if (shared && cornerLines(sk, shared)) push([A.id, B.id]);
  }
  return out;
}

class CornerTool extends PickTool {
  reset() { this.first = null; super.reset(); }
  onActivate() {
    super.onActivate();
    const corners = cornersFrom(this.tc.sketch, this.tc.takeSelection());
    if (corners.length) setTimeout(() => this.ask(corners), 0);
  }
  hint() { return this.first ? 'Touchez la deuxième ligne' : `Touchez un coin, ou deux lignes (${this.what})`; }
  hover(wp) {
    const h = this.tc.hitGeometry(wp);
    const sk = this.tc.sketch;
    const ids = this.first ? [this.first] : [];
    if (h && h.type === 'point') { const c = cornerLines(sk, h.id); if (c) ids.push(...c); }
    else { const id = this.tc.hitEntity(wp); if (id && sk.entities.get(id).type === 'line') ids.push(id); }
    this.highlight = new Set(ids);
  }
  tap(wp) {
    const sk = this.tc.sketch;
    const h = this.tc.hitGeometry(wp);
    if (!this.first && h && h.type === 'point') {
      const c = cornerLines(sk, h.id);
      if (c) { this.ask([c]); return; }
    }
    const id = this.tc.hitEntity(wp);
    const e = id && sk.entities.get(id);
    if (!e || e.type !== 'line') { this.first = null; this.highlight = new Set(); if (id) this.tc.toast(`Le ${this.what} se fait entre deux lignes`); return; }
    if (!this.first) { this.first = id; this.highlight = new Set([id]); return; }
    if (id === this.first) { this.first = null; this.highlight = new Set(); return; }
    this.ask([[this.first, id]]);
  }
  ask(corners) {
    const sk = this.tc.sketch;
    this.highlight = new Set(corners.flat());
    this.tc.requestDraw();
    let minLen = Infinity;
    for (const [a, b] of corners) for (const id of [a, b]) minLen = Math.min(minLen, entityLength(sk, sk.entities.get(id)));
    const init = this.constructor.last || niceRound(minLen / 5);
    this.tc.lengthKeypad(this.title, init, (mm) => {
      this.constructor.last = mm;
      this.tc.applyEdit(this.label, (s) => {
        for (const [a, b] of corners) { const r = this.apply(s, a, b, mm); if (!r.ok) return r; }
        return { ok: true };
      });
      this.reset();
      this.tc.refreshUI();
    });
  }
  onToolbarTap() { if (this.first) { this.reset(); this.tc.requestDraw(); return true; } return false; }
}
export class FilletTool extends CornerTool {
  static last = null;
  get what() { return 'congé'; }
  get title() { return 'Rayon du congé'; }
  get label() { return 'Congé'; }
  apply(sk, a, b, r) { return filletLines(sk, a, b, r); }
}
export class ChamferTool extends CornerTool {
  static last = null;
  get what() { return 'chanfrein'; }
  get title() { return 'Distance du chanfrein'; }
  get label() { return 'Chanfrein'; }
  apply(sk, a, b, d) { return chamferLines(sk, a, b, d); }
}

// DXF : export (lignes, cercles, arcs en vraie grandeur) et import (lignes, cercles, arcs, polylignes simples).
// Format ASCII R12 (AC1009), lu par tous les logiciels de CAO. La géométrie interne est en mm.
import { arcInfo } from './geom.js';

/** Code $INSUNITS du DXF pour chaque unité de l'app (1 pouce, 2 pied, 4 mm, 5 cm, 6 m, 10 yard). */
const INSUNITS = { mm: 4, cm: 5, m: 6, inch: 1, ft: 2, yd: 10 };
/** Valeur d'un code $INSUNITS en mm (0 : sans unité). */
const UNIT_MM = { 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 25.4e-6, 9: 0.0254, 10: 914.4, 11: 1e-7, 12: 1e-6, 13: 1e-3, 14: 100, 15: 1e4, 16: 1e5 };
const UNIT_FACTOR = { mm: 1, cm: 10, m: 1000, inch: 25.4, ft: 304.8, yd: 914.4 };

const num = (v) => {
  if (!isFinite(v)) return '0';
  let s = (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6);
  s = s.replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};
const deg = (rad) => { let d = rad * 180 / Math.PI; d = ((d % 360) + 360) % 360; return d; };

/**
 * Entités exportées : lignes, cercles et arcs, sauf les éléments de construction (et les lignes infinies).
 * skip(e) : true pour une entité à ne pas exporter (ex. masquée).
 */
export function exportableEntities(sk, skip = null) {
  return [...sk.entities.values()].filter((e) => !e.construction && !e.infinite && !(skip && skip(e)));
}

/**
 * Texte DXF de l'esquisse, en unité `unit` (mm par défaut).
 * @returns {{text:string, count:number}}
 */
export function exportDXF(sk, { unit = 'mm', skip = null } = {}) {
  const f = UNIT_FACTOR[unit] || 1;
  const P = (id) => sk.points.get(id);
  const out = [];
  const g = (code, value) => { out.push(String(code), String(value)); };
  // en-tête : version, unités
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, INSUNITS[unit] || 4);
  g(9, '$MEASUREMENT'); g(70, ['inch', 'ft', 'yd'].includes(unit) ? 0 : 1);
  g(0, 'ENDSEC');
  // tables minimales : un calque « 0 »
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, 1);
  g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  let count = 0;
  for (const e of exportableEntities(sk, skip)) {
    if (e.type === 'line') {
      const a = P(e.p1), b = P(e.p2);
      g(0, 'LINE'); g(8, '0');
      g(10, num(a.x / f)); g(20, num(a.y / f)); g(30, 0);
      g(11, num(b.x / f)); g(21, num(b.y / f)); g(31, 0);
    } else if (e.type === 'circle') {
      const c = P(e.c);
      g(0, 'CIRCLE'); g(8, '0');
      g(10, num(c.x / f)); g(20, num(c.y / f)); g(30, 0); g(40, num(e.r / f));
    } else if (e.type === 'arc') {
      const c = P(e.c);
      const { r, a1, a2 } = arcInfo(c, P(e.s), P(e.e), e.ccw);
      // un arc DXF va toujours dans le sens trigonométrique, de l'angle 50 à l'angle 51
      const [s, t] = e.ccw ? [a1, a2] : [a2, a1];
      g(0, 'ARC'); g(8, '0');
      g(10, num(c.x / f)); g(20, num(c.y / f)); g(30, 0); g(40, num(r / f));
      g(50, num(deg(s))); g(51, num(deg(t)));
    } else continue;
    count++;
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return { text: out.join('\r\n') + '\r\n', count };
}

/** Paires (code, valeur) d'un texte DXF. */
function pairs(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) { i -= 1; continue; }      // ligne parasite : on se recale
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

/**
 * Lit un DXF : lignes, cercles, arcs, polylignes (LWPOLYLINE, POLYLINE, avec arrondis « bulge »).
 * Les entités de l'espace papier et des blocs sont ignorées.
 * defaultUnit : unité supposée si le fichier ne la précise pas.
 * @returns {{items:Array, unitMM:number, skipped:Object<string,number>, unitKnown:boolean}}
 *   items : { type:'line', a, b } | { type:'circle', c, r } | { type:'arc', c, s, e, ccw } en mm
 */
export function parseDXF(text, { defaultUnit = 'mm' } = {}) {
  const P = pairs(text);
  let unitMM = UNIT_FACTOR[defaultUnit] || 1, unitKnown = false;
  // en-tête : $INSUNITS
  for (let i = 0; i < P.length - 1; i++) {
    if (P[i][0] === 9 && P[i][1] === '$INSUNITS') {
      const u = parseInt(P[i + 1][1], 10);
      if (UNIT_MM[u]) { unitMM = UNIT_MM[u]; unitKnown = true; }
      break;
    }
  }
  // section ENTITIES
  let start = -1, end = P.length;
  for (let i = 0; i < P.length - 1; i++) {
    if (P[i][0] === 0 && P[i][1] === 'SECTION' && P[i + 1][0] === 2 && P[i + 1][1] === 'ENTITIES') { start = i + 2; break; }
  }
  if (start < 0) throw new Error('Pas de section ENTITIES : ce n\'est pas un fichier DXF lisible');
  for (let i = start; i < P.length; i++) if (P[i][0] === 0 && (P[i][1] === 'ENDSEC' || P[i][1] === 'EOF')) { end = i; break; }

  // regroupe les entités : [type, [[code, valeur]…]]
  const ents = [];
  for (let i = start; i < end; i++) {
    if (P[i][0] === 0) ents.push([P[i][1], []]);
    else if (ents.length) ents[ents.length - 1][1].push(P[i]);
  }
  const items = [];
  const skipped = {};
  const S = (v) => v * unitMM;
  const get = (props, code, dflt = 0) => { const p = props.find((q) => q[0] === code); return p ? parseFloat(p[1]) : dflt; };
  const paper = (props) => props.some((q) => q[0] === 67 && q[1] === '1');
  // repère de l'objet : extrusion (0, 0, -1) → X inversé (fréquent pour les arcs et cercles)
  const flipOf = (props) => get(props, 230, 1) < 0;
  const addBulgeSeg = (a, b, bulge) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-12) return;
    if (Math.abs(bulge) < 1e-9) { items.push({ type: 'line', a, b }); return; }
    const d = { x: b.x - a.x, y: b.y - a.y };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const k = (1 - bulge * bulge) / (4 * bulge);
    const c = { x: m.x - d.y * k, y: m.y + d.x * k };
    items.push({ type: 'arc', c, s: a, e: b, ccw: bulge > 0 });
  };
  const polyline = (verts, closed, flip) => {
    const V = verts.map((v) => ({ x: S(flip ? -v.x : v.x), y: S(v.y), b: flip ? -v.b : v.b }));
    const n = V.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = V[i], b = V[(i + 1) % n];
      addBulgeSeg({ x: a.x, y: a.y }, { x: b.x, y: b.y }, a.b || 0);
    }
  };
  for (let i = 0; i < ents.length; i++) {
    const [type, props] = ents[i];
    if (paper(props)) continue;
    const flip = flipOf(props);
    const X = (v) => S(flip ? -v : v);
    if (type === 'LINE') {
      const a = { x: S(get(props, 10)), y: S(get(props, 20)) }, b = { x: S(get(props, 11)), y: S(get(props, 21)) };
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-12) items.push({ type: 'line', a, b });
    } else if (type === 'CIRCLE') {
      const r = S(get(props, 40));
      if (r > 1e-12) items.push({ type: 'circle', c: { x: X(get(props, 10)), y: S(get(props, 20)) }, r });
    } else if (type === 'ARC') {
      const r = S(get(props, 40));
      if (!(r > 1e-12)) continue;
      const c = { x: X(get(props, 10)), y: S(get(props, 20)) };
      let a1 = get(props, 50) * Math.PI / 180, a2 = get(props, 51) * Math.PI / 180;
      if (flip) [a1, a2] = [Math.PI - a2, Math.PI - a1];      // miroir en X : le sens trigonométrique est conservé
      const at = (a) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
      items.push({ type: 'arc', c, s: at(a1), e: at(a2), ccw: true });
    } else if (type === 'LWPOLYLINE') {
      const verts = [];
      for (const [code, v] of props) {
        if (code === 10) verts.push({ x: parseFloat(v), y: 0, b: 0 });
        else if (code === 20 && verts.length) verts[verts.length - 1].y = parseFloat(v);
        else if (code === 42 && verts.length) verts[verts.length - 1].b = parseFloat(v);
      }
      polyline(verts, (get(props, 70) & 1) === 1, flip);
    } else if (type === 'POLYLINE') {
      const flags = get(props, 70);
      const verts = [];
      let j = i + 1;
      for (; j < ents.length && ents[j][0] === 'VERTEX'; j++) {
        const vp = ents[j][1];
        verts.push({ x: get(vp, 10), y: get(vp, 20), b: get(vp, 42) });
      }
      if (j < ents.length && ents[j][0] === 'SEQEND') j++;
      i = j - 1;
      if (flags & (16 | 64)) { skipped.POLYLINE = (skipped.POLYLINE || 0) + 1; continue; }   // maillages 3D
      polyline(verts, (flags & 1) === 1, flip);
    } else if (type !== 'VERTEX' && type !== 'SEQEND') {
      skipped[type] = (skipped[type] || 0) + 1;
    }
  }
  return { items, unitMM, unitKnown, skipped };
}

/**
 * Ajoute les éléments lus à l'esquisse : chaque entité est indépendante (ses propres points), sans relation.
 * @returns {string[]} ids des entités créées
 */
export function addImported(sk, items) {
  const ids = [];
  const pt = (p) => sk.addPoint(p.x, p.y).id;
  for (const it of items) {
    if (it.type === 'line') ids.push(sk.addLine(pt(it.a), pt(it.b)).id);
    else if (it.type === 'circle') ids.push(sk.addCircle(pt(it.c), it.r).id);
    else if (it.type === 'arc') ids.push(sk.addArc(pt(it.c), pt(it.s), pt(it.e), it.ccw).id);
  }
  return ids;
}


// DXF : export (lignes, cercles, arcs en vraie grandeur) et import (lignes, cercles, arcs, polylignes simples).
// Format ASCII AutoCAD 2000 (AC1015), complet (tables, blocs, objets), ouvert par AutoCAD et les autres logiciels
// de CAO. La géométrie interne est en mm. Export : construction sur le calque « CONSTRUCTION », textes en TEXT.
// L'esquisse complète (relations, cotes, répétitions…) est aussi rangée dans le fichier, dans un objet XRECORD
// « ESQUISSE2D » du dictionnaire principal (section OBJECTS) : les autres logiciels l'ignorent et lisent les traits,
// l'app la relit à l'import si les traits n'ont pas été modifiés depuis.
import { arcInfo, arcBBox } from './geom.js';
import { DXF_TEMPLATE, MSP_OWNER, FIRST_HANDLE } from './dxfTemplate.js';

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

/** Couleurs AutoCAD (ACI) de base, pour les textes : code → [r, g, b]. */
const ACI = { 1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255], 7: [0, 0, 0], 8: [128, 128, 128], 9: [192, 192, 192], 30: [255, 127, 0], 40: [255, 191, 0], 140: [0, 127, 255], 200: [127, 0, 255], 210: [191, 0, 255] };
const ACI_HEX = { 1: '#ff3b30', 2: '#ffcc00', 3: '#34c759', 4: '#32ade6', 5: '#0a6cff', 6: '#ff2d92', 30: '#ff9500', 40: '#ffb800', 140: '#0a84ff', 200: '#8a3ccf', 210: '#af52de', 8: '#8e8e93', 9: '#c7c7cc' };
/** Code ACI le plus proche d'une couleur #rrggbb (null : couleur du calque). */
function aciOf(hex) {
  if (!hex) return null;
  const h = String(hex).replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (c.some((v) => Number.isNaN(v))) return null;
  let best = 7, bd = Infinity;
  for (const [k, v] of Object.entries(ACI)) {
    const d = (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2 + (v[2] - c[2]) ** 2;
    if (d < bd) { bd = d; best = +k; }
  }
  return best === 7 ? null : best;
}
/** Texte DXF : caractères hors ASCII en \U+XXXX (compris par AutoCAD quelle que soit la page de code). */
function dxfText(str) {
  let out = '';
  for (const ch of String(str).replace(/[\r\n]+/g, ' ')) {
    const c = ch.codePointAt(0);
    out += c >= 32 && c < 127 ? ch : c > 0xffff ? '?' : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0');
  }
  return out;
}
/** Texte lu dans un DXF : \U+XXXX, %%d (°), %%c (Ø), %%p (±), %%% (%). */
function readDxfText(s) {
  return String(s)
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[dD]/g, '°').replace(/%%[cC]/g, 'Ø').replace(/%%[pP]/g, '±').replace(/%%%/g, '%')
    .replace(/%%[uUoOkK]/g, '');
}

/**
 * Entités exportées : lignes, cercles et arcs, construction comprise (calque « CONSTRUCTION », en tirets ;
 * lignes infinies en XLINE). skip(e) : true pour une entité à ne pas exporter (ex. masquée).
 */
export function exportableEntities(sk, skip = null) {
  return [...sk.entities.values()].filter((e) => !(skip && skip(e)));
}

/**
 * Texte DXF de l'esquisse (AutoCAD 2000, AC1015), en unité `unit` (mm par défaut).
 * @returns {{text:string, count:number}}
 */
export function exportDXF(sk, { unit = 'mm', skip = null, skipText = null } = {}) {
  const f = UNIT_FACTOR[unit] || 1;
  const P = (id) => sk.points.get(id);
  const out = [];
  const g = (code, value) => { out.push(String(code).padStart(3, ' '), String(value)); };
  let handle = FIRST_HANDLE;
  let ext = null;
  const grow = (x, y) => {
    if (!ext) ext = { minX: x, minY: y, maxX: x, maxY: y };
    else { ext.minX = Math.min(ext.minX, x); ext.minY = Math.min(ext.minY, y); ext.maxX = Math.max(ext.maxX, x); ext.maxY = Math.max(ext.maxY, y); }
  };
  const head = (type, layer, sub) => {
    g(0, type); g(5, (handle++).toString(16).toUpperCase()); g(330, MSP_OWNER);
    g(100, 'AcDbEntity'); g(8, layer); g(100, sub);
  };
  let count = 0;
  for (const e of exportableEntities(sk, skip)) {
    const layer = e.construction || e.infinite ? 'CONSTRUCTION' : '0';
    if (e.type === 'line' && e.infinite) {
      const a = P(e.p1), b = P(e.p2);
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(l > 0)) continue;
      head('XLINE', layer, 'AcDbXline');
      g(10, num(a.x / f)); g(20, num(a.y / f)); g(30, 0);
      g(11, num((b.x - a.x) / l)); g(21, num((b.y - a.y) / l)); g(31, 0);
      grow(a.x / f, a.y / f); grow(b.x / f, b.y / f);
    } else if (e.type === 'line') {
      const a = P(e.p1), b = P(e.p2);
      head('LINE', layer, 'AcDbLine');
      g(10, num(a.x / f)); g(20, num(a.y / f)); g(30, 0);
      g(11, num(b.x / f)); g(21, num(b.y / f)); g(31, 0);
      grow(a.x / f, a.y / f); grow(b.x / f, b.y / f);
    } else if (e.type === 'circle') {
      const c = P(e.c);
      head('CIRCLE', layer, 'AcDbCircle');
      g(10, num(c.x / f)); g(20, num(c.y / f)); g(30, 0); g(40, num(e.r / f));
      grow((c.x - e.r) / f, (c.y - e.r) / f); grow((c.x + e.r) / f, (c.y + e.r) / f);
    } else if (e.type === 'arc') {
      const c = P(e.c);
      const { r, a1, a2 } = arcInfo(c, P(e.s), P(e.e), e.ccw);
      // un arc DXF va toujours dans le sens trigonométrique, de l'angle 50 à l'angle 51
      const [s0, t0] = e.ccw ? [a1, a2] : [a2, a1];
      head('ARC', layer, 'AcDbCircle');
      g(10, num(c.x / f)); g(20, num(c.y / f)); g(30, 0); g(40, num(r / f));
      g(100, 'AcDbArc'); g(50, num(deg(s0))); g(51, num(deg(t0)));
      const bb = arcBBox(c, P(e.s), P(e.e), e.ccw);
      grow(bb.minX / f, bb.minY / f); grow(bb.maxX / f, bb.maxY / f);
    } else continue;
    count++;
  }
  // textes (outil Texte) : TEXT, hauteur = hauteur des capitales, couleur ACI la plus proche
  if (sk.texts) for (const t of sk.texts.values()) {
    if (skipText && skipText(t)) continue;
    if (!String(t.text).trim()) continue;
    head('TEXT', '0', 'AcDbText');
    const aci = aciOf(t.color);
    if (aci !== null) { const sub = out.splice(out.length - 2, 2); g(62, aci); out.push(...sub); }
    g(10, num(t.x / f)); g(20, num(t.y / f)); g(30, 0); g(40, num(t.size / f));
    g(1, dxfText(t.text)); g(7, 'Standard');
    g(100, 'AcDbText');
    const w = 0.75 * t.size * [...String(t.text)].length;
    grow(t.x / f, t.y / f); grow((t.x + w) / f, (t.y + t.size) / f);
    count++;
  }
  if (!ext) ext = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const w = ext.maxX - ext.minX, h = ext.maxY - ext.minY;
  const text = DXF_TEMPLATE
    .replace('@EXTMINX@', num(ext.minX)).replace('@EXTMINY@', num(ext.minY))
    .replace('@EXTMAXX@', num(ext.maxX)).replace('@EXTMAXY@', num(ext.maxY))
    .replace('@INSUNITS@', String(INSUNITS[unit] || 4))
    .replace('@MEASUREMENT@', ['inch', 'ft', 'yd'].includes(unit) ? '0' : '1')
    .replace('@VCX@', num((ext.minX + ext.maxX) / 2)).replace('@VCY@', num((ext.minY + ext.maxY) / 2))
    .replace('@VH@', num(Math.max(h, w * 0.6, 1e-3) * 1.2))
    .replace('@HANDSEED@', handle.toString(16).toUpperCase())
    .replace('@ENTITIES@', out.length ? out.join('\n') + '\n' : '');
  return { text: embedSketch(text, sk, handle).replace(/\r?\n/g, '\r\n'), count };
}

// ---------- Esquisse complète dans le DXF ----------
export const APP_KEY = 'ESQUISSE2D';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Base64 du texte en UTF-8 (sans dépendre de btoa / TextEncoder). */
function toB64(str) {
  const bin = unescape(encodeURIComponent(str));
  let out = '';
  for (let i = 0; i < bin.length; i += 3) {
    const a = bin.charCodeAt(i), b = bin.charCodeAt(i + 1), c = bin.charCodeAt(i + 2);
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bin.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bin.length ? B64[n & 63] : '=');
  }
  return out;
}
function fromB64(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  let bin = '';
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : -1));
    const n = (v[0] << 18) | (v[1] << 12) | (Math.max(0, v[2]) << 6) | Math.max(0, v[3]);
    bin += String.fromCharCode((n >> 16) & 255);
    if (v[2] >= 0) bin += String.fromCharCode((n >> 8) & 255);
    if (v[3] >= 0) bin += String.fromCharCode(n & 255);
  }
  return decodeURIComponent(escape(bin));
}
/**
 * Empreinte des traits lus dans un DXF (au millième de mm) : si un autre logiciel a modifié le dessin, elle change,
 * et l'esquisse rangée dans le fichier n'est plus utilisée (on ne garde que les traits).
 */
export function geometrySignature(items) {
  const r = (v) => String(Math.round(v * 1000));
  const pt = (p) => r(p.x) + ',' + r(p.y);
  const keys = items.map((it) => {
    if (it.type === 'line') { const [a, b] = [pt(it.a), pt(it.b)].sort(); return 'L' + (it.infinite ? 'i' : '') + a + ';' + b; }
    if (it.type === 'circle') return 'C' + pt(it.c) + ';' + r(it.r);
    if (it.type === 'arc') return 'A' + pt(it.c) + ';' + pt(it.s) + ';' + pt(it.e);
    if (it.type === 'text') return 'T' + r(it.x) + ',' + r(it.y) + ';' + r(it.size) + ';' + it.text;
    return '';
  }).sort();
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const all = keys.join('|');
  for (let i = 0; i < all.length; i++) { const c = all.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
  return keys.length + ':' + h1.toString(16) + h2.toString(16);
}
/** Ajoute l'esquisse complète (XRECORD « ESQUISSE2D », référencé par le dictionnaire principal A). */
function embedSketch(text, sk, handle) {
  const sig = geometrySignature(parseDXF(text).items);
  const data = toB64(JSON.stringify({ app: 'esquisse2d', v: 1, sig, sketch: sk.toJSON() }));
  const h = handle.toString(16).toUpperCase();
  const rec = ['  0', 'XRECORD', '  5', h, '330', 'A', '100', 'AcDbXrecord', '280', '1'];
  for (let i = 0; i < data.length; i += 250) rec.push('  1', data.slice(i, i + 250));
  const entry = '  3\nEZDXF_META\n350\n2D\n';
  const end = text.lastIndexOf('  0\nENDSEC\n  0\nEOF');
  if (!text.includes(entry) || end < 0) return text;
  const seed = (handle + 1).toString(16).toUpperCase();
  return text.slice(0, end).replace(entry, entry + `  3\n${APP_KEY}\n350\n${h}\n`)
    .replace(/(\$HANDSEED\n\s*5\n)[0-9A-F]+/, `$1${seed}`)
    + rec.join('\n') + '\n' + text.slice(end);
}
/** Esquisse rangée dans le DXF par l'app ({ sketch, sig }), ou null. */
function readEmbedded(P) {
  let h = null;
  for (let i = 0; i < P.length - 1; i++) if (P[i][0] === 3 && P[i][1] === APP_KEY && P[i + 1][0] === 350) { h = P[i + 1][1]; break; }
  if (!h) return null;
  for (let i = 0; i < P.length - 1; i++) {
    if (!(P[i][0] === 0 && P[i][1] === 'XRECORD' && P[i + 1][0] === 5 && P[i + 1][1].toUpperCase() === h.toUpperCase())) continue;
    let b64 = '';
    for (let j = i + 2; j < P.length && P[j][0] !== 0; j++) if (P[j][0] === 1) b64 += P[j][1];
    try {
      const j = JSON.parse(fromB64(b64));
      return j && j.app === 'esquisse2d' && j.sketch ? { sketch: j.sketch, sig: j.sig } : null;
    } catch (err) { return null; }
  }
  return null;
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
 * @returns {{items:Array, unitMM:number, skipped:Object<string,number>, unitKnown:boolean, embedded:?{sketch, match}}}
 *   embedded : esquisse complète rangée par l'app ; match : faux si les traits ont été modifiés depuis
 *   items : { type:'line', a, b } | { type:'circle', c, r } | { type:'arc', c, s, e, ccw }
 *           | { type:'text', x, y, text, size, color } en mm
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
    const n0 = items.length;
    const flip = flipOf(props);
    const X = (v) => S(flip ? -v : v);
    if (type === 'XLINE') {
      const a = { x: S(get(props, 10)), y: S(get(props, 20)) };
      const dx = get(props, 11), dy = get(props, 21), l = Math.hypot(dx, dy);
      if (l > 1e-12) items.push({ type: 'line', a, b: { x: a.x + S(dx / l) * 10, y: a.y + S(dy / l) * 10 }, infinite: true, construction: true });
    } else if (type === 'LINE') {
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
    } else if (type === 'TEXT') {
      const str = readDxfText((props.find((q) => q[0] === 1) || [1, ''])[1]);
      const h = S(get(props, 40, 2.5));
      const aci = parseInt((props.find((q) => q[0] === 62) || [62, '256'])[1], 10);
      if (str.trim() && h > 1e-12) items.push({ type: 'text', x: X(get(props, 10)), y: S(get(props, 20)), text: str, size: h, color: ACI_HEX[aci] || null });
    } else if (type !== 'VERTEX' && type !== 'SEQEND') {
      skipped[type] = (skipped[type] || 0) + 1;
    }
    // calque de construction (export de l'app, ou nom approchant) : éléments de construction
    const layer = (props.find((q) => q[0] === 8) || [8, '0'])[1];
    if (/constr/i.test(layer)) for (let j = n0; j < items.length; j++) items[j].construction = true;
  }
  // esquisse complète rangée par l'app : utilisée seulement si les traits sont restés les mêmes
  let embedded = readEmbedded(P);
  if (embedded) embedded = { sketch: embedded.sketch, match: embedded.sig === geometrySignature(items) };
  return { items, unitMM, unitKnown, skipped, embedded };
}

/**
 * Ajoute les éléments lus à l'esquisse, sans relation. Les bouts qui se touchent (extrémités des lignes et des arcs,
 * à tol près) sont reliés : ils partagent le même point, comme un contour tracé dans l'app.
 * @returns {string[]} ids des entités créées
 */
export function addImported(sk, items, { join = true } = {}) {
  const ids = [];
  // tolérance : un millionième de la taille du dessin (au moins 1e-6 mm)
  let span = 0;
  for (const it of items) for (const p of [it.a, it.b, it.c, it.s, it.e, it.type === 'text' ? it : null]) if (p) span = Math.max(span, Math.abs(p.x), Math.abs(p.y));
  const tol = Math.max(1e-6, span * 1e-7);
  const ends = [];              // points d'extrémité déjà créés
  const cell = (v) => Math.round(v / (tol * 4));
  const grid = new Map();
  const endPoint = (p) => {
    if (join) {
      const cx = cell(p.x), cy = cell(p.y);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const q of grid.get(`${cx + dx},${cy + dy}`) || []) if (Math.hypot(q.x - p.x, q.y - p.y) <= tol) return q.id;
      }
    }
    const q = sk.addPoint(p.x, p.y);
    ends.push(q);
    const key = `${cell(p.x)},${cell(p.y)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(q);
    return q.id;
  };
  const free = (p) => sk.addPoint(p.x, p.y).id;
  for (const it of items) {
    const opts = { construction: !!it.construction, infinite: !!it.infinite };
    if (it.type === 'text') { ids.push(sk.addText(it.x, it.y, it.text, { size: it.size, color: it.color }).id); continue; }
    if (it.type === 'line') ids.push(sk.addLine(it.infinite ? free(it.a) : endPoint(it.a), it.infinite ? free(it.b) : endPoint(it.b), opts).id);
    else if (it.type === 'circle') ids.push(sk.addCircle(free(it.c), it.r, opts).id);
    else if (it.type === 'arc') {
      // les extrémités d'un arc sont recalées exactement sur son rayon (le solveur l'exige)
      const r = Math.hypot(it.s.x - it.c.x, it.s.y - it.c.y);
      const on = (p) => { const d = Math.hypot(p.x - it.c.x, p.y - it.c.y) || 1; return { x: it.c.x + (p.x - it.c.x) * r / d, y: it.c.y + (p.y - it.c.y) * r / d }; };
      ids.push(sk.addArc(free(it.c), endPoint(it.s), endPoint(on(it.e)), it.ccw, opts).id);
    }
  }
  return ids;
}

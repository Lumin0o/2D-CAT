// Rendu pour l'export (PNG, PDF) et les miniatures : le même rendu que l'écran, sur fond blanc,
// cadré automatiquement, sans grille, axes, points ni icônes de relations.
import { Renderer } from './renderer.js';
import { Viewport } from './viewport.js';
import { dimLayout } from './annotations.js';
import { isAnnotation } from '../core/solver.js';
import { arcBBox } from '../core/geom.js';

/** Couleurs d'impression : tout en noir sur blanc, cotes pilotées en gris. */
export const PRINT_COLORS = {
  under: '#000000', full: '#000000', over: '#000000', selected: '#000000',
  preview: '#000000', ghost: '#000000', guide: '#888888', snap: '#000000', origin: '#000000',
  dim: '#1a1a1a', dimDriven: '#707070', badgeBg: '#ffffff', badgeFg: '#000000', loupeRing: '#000000',
  canvasBg: '#ffffff', gridPaper: '#cccccc', gridAlpha: 0, axis: '#cccccc', accent: '#000000', green: '#000000',
};

/**
 * Ce qui n'est pas exporté : les points (sauf les points d'esquisse), les relations, et ce que l'utilisateur a masqué
 * (bouton œil). La construction est exportée (en tirets) ; pour l'enlever, on la masque.
 * construction : false pour l'exclure (miniatures).
 */
export function exportHidden(sk, userHidden = null, { dims = true, construction = true } = {}) {
  const ents = new Set(), pts = new Set(), cons = new Set();
  for (const e of sk.entities.values()) if ((!construction && (e.construction || e.infinite)) || (userHidden && userHidden.ents.has(e.id))) ents.add(e.id);
  for (const p of sk.points.values()) if (!p.sketchPoint || (userHidden && userHidden.pts.has(p.id))) pts.add(p.id);
  for (const k of sk.constraints.values()) {
    if (!isAnnotation(k) || !dims || (userHidden && userHidden.cons.has(k.id))) cons.add(k.id);
  }
  return { ents, pts, cons, axes: false };
}

/** Boîte englobante (monde) de ce qui est exporté : entités visibles et cotes. */
export function exportBBox(sk, H) {
  let b = null;
  const grow = (p) => {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
    if (!b) b = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    else { b.minX = Math.min(b.minX, p.x); b.minY = Math.min(b.minY, p.y); b.maxX = Math.max(b.maxX, p.x); b.maxY = Math.max(b.maxY, p.y); }
  };
  const P = (id) => sk.points.get(id);
  for (const e of sk.entities.values()) {
    if (H.ents.has(e.id)) continue;
    if (e.type === 'line') { grow(P(e.p1)); grow(P(e.p2)); }
    else if (e.type === 'circle') { const c = P(e.c); grow({ x: c.x - e.r, y: c.y - e.r }); grow({ x: c.x + e.r, y: c.y + e.r }); }
    else if (e.type === 'arc') { const bb = arcBBox(P(e.c), P(e.s), P(e.e), e.ccw); grow({ x: bb.minX, y: bb.minY }); grow({ x: bb.maxX, y: bb.maxY }); }
  }
  for (const p of sk.points.values()) if (!H.pts.has(p.id)) grow(p);
  for (const k of sk.constraints.values()) {
    if (!isAnnotation(k) || H.cons.has(k.id)) continue;
    const lay = dimLayout(sk, k);
    if (!lay) continue;
    for (const s of [...lay.ext, ...lay.segs]) { grow(s[0]); grow(s[1]); }
    grow(lay.text);
    if (lay.arc) for (const a of [lay.arc.a1, lay.arc.a2, (lay.arc.a1 + lay.arc.a2) / 2]) grow({ x: lay.arc.c.x + lay.arc.r * Math.cos(a), y: lay.arc.c.y + lay.arc.r * Math.sin(a) });
  }
  return b;
}

/**
 * Dessine l'esquisse dans ctx (Canvas 2D ou PdfContext) : vue de width × height px, facteur dpr,
 * cadrée sur bbox avec une marge pad (px).
 */
export function renderSketch(ctx, sk, { width, height, dpr = 1, pad = 40, bbox, hidden, colors = PRINT_COLORS, settings }) {
  const vp = new Viewport();
  vp.width = width; vp.height = height;
  vp.minScale = 1e-9; vp.maxScale = 1e9;
  vp.fit(bbox, pad);
  const r = new Renderer({ getContext: () => ctx }, vp);
  r.dpr = dpr;
  r.screen();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const empty = { entities: new Map(), points: new Map(), constraints: new Map() };
  r.drawContent({
    sketch: sk, vp, selection: new Set(), analysis: empty, colors, settings,
    grid: { show: false }, hidden, tool: null, box: null, highlight: null, previewDim: null,
    errorIds: null, loupe: null, dragMarker: null, showRelations: false,
  });
  return vp;
}

/** Taille (px) d'une image à l'échelle de la boîte : côté long `long`, marges pad comprises. */
export function fitSize(bbox, long, pad, minShort = 360) {
  const w = Math.max(bbox.maxX - bbox.minX, 1e-6), h = Math.max(bbox.maxY - bbox.minY, 1e-6);
  const L = long - 2 * pad;
  let W, Hh;
  if (w >= h) { W = long; Hh = Math.max(minShort, L * h / w + 2 * pad); } else { Hh = long; W = Math.max(minShort, L * w / h + 2 * pad); }
  return { width: Math.round(W), height: Math.round(Hh) };
}

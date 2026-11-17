// Cotes et icônes de relations : mesure, mise en page (monde) et texte.
// Utilisé par le rendu et par le test de toucher.
import { sub, add, mul, dot, cross, norm, perp, dist, angleOf, fromAngle, arcInfo, lineLineIntersection, mid } from '../core/geom.js';
import { fmtLengthShort, fmtAngle } from '../core/units.js';
import { isDimension } from '../core/solver.js';

const P = (sk, id) => sk.points.get(id);
const curveOf = (sk, e) => { const c = P(sk, e.c); return { c, r: e.type === 'circle' ? e.r : dist(c, P(sk, e.s)) }; };

/** Rayons (demi-droites unitaires) et sommet d'une cote d'angle. */
export function angleRays(sk, k) {
  const A = sk.entities.get(k.refs[0]), B = sk.entities.get(k.refs[1]);
  const a1 = P(sk, A.p1), a2 = P(sk, A.p2), b1 = P(sk, B.p1), b2 = P(sk, B.p2);
  const hit = lineLineIntersection(a1, a2, b1, b2);
  const X = hit ? hit.point : a1;
  const r1 = mul(norm(sub(a2, a1)), k.s1 || 1), r2 = mul(norm(sub(b2, b1)), k.s2 || 1);
  return { X, r1, r2 };
}

/** Choisit le secteur d'une cote d'angle d'après la position du texte. */
export function angleSetup(sk, lineA, lineB, pos) {
  const a1 = P(sk, lineA.p1), a2 = P(sk, lineA.p2), b1 = P(sk, lineB.p1), b2 = P(sk, lineB.p2);
  const hit = lineLineIntersection(a1, a2, b1, b2);
  if (!hit) return null;
  const d1 = norm(sub(a2, a1)), d2 = norm(sub(b2, b1));
  const u = sub(pos, hit.point);
  let best = { s1: 1, s2: 1 };
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    const r1 = mul(d1, s1), r2 = mul(d2, s2);
    const c12 = cross(r1, r2);
    if (cross(r1, u) * c12 >= 0 && cross(u, r2) * c12 >= 0) best = { s1, s2 };
  }
  const r1 = mul(d1, best.s1), r2 = mul(d2, best.s2);
  const ang = Math.atan2(cross(r1, r2), dot(r1, r2));
  return { s1: best.s1, s2: best.s2, sgn: ang < 0 ? -1 : 1, value: Math.abs(ang) };
}

/**
 * Orientation d'une cote entre deux points selon l'endroit où on la place (comme SOLIDWORKS) :
 * au-dessus / en dessous des deux points → horizontale ; à gauche / à droite → verticale ;
 * ailleurs (à côté du segment, dans les coins) → parallèle aux deux points.
 */
export function dimOrientation(a, b, pos) {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  const inX = pos.x >= minX && pos.x <= maxX, inY = pos.y >= minY && pos.y <= maxY;
  if (inX && !inY) return 'h';
  if (inY && !inX) return 'v';
  return 'aligned';
}

/** Valeur mesurée sur la géométrie (mm ou radians). */
export function dimMeasure(sk, k) {
  const A = sk.entities.get(k.refs[0]), B = sk.entities.get(k.refs[1]);
  switch (k.type) {
    case 'dimLength': return dist(P(sk, A.p1), P(sk, A.p2));
    case 'dimDistance': return dist(P(sk, k.refs[0]), P(sk, k.refs[1]));
    case 'dimHorizontal': return Math.abs(P(sk, k.refs[1]).x - P(sk, k.refs[0]).x);
    case 'dimVertical': return Math.abs(P(sk, k.refs[1]).y - P(sk, k.refs[0]).y);
    case 'dimPointLine': { const a = P(sk, B.p1), b = P(sk, B.p2); return Math.abs(cross(sub(P(sk, k.refs[0]), a), norm(sub(b, a)))); }
    case 'dimLineLine': { const a = P(sk, A.p1), b = P(sk, A.p2); return Math.abs(cross(sub(P(sk, B.p1), a), norm(sub(b, a)))); }
    case 'dimAngle': { const { r1, r2 } = angleRays(sk, k); return Math.abs(Math.atan2(cross(r1, r2), dot(r1, r2))); }
    case 'dimRadius': return curveOf(sk, A).r;
    default: return 0;
  }
}

export function dimLabel(sk, k, settings) {
  const v = k.driven ? dimMeasure(sk, k) : k.value;
  let t;
  if (k.type === 'dimAngle') t = fmtAngle(v, settings);
  else if (k.type === 'dimRadius') t = 'R' + fmtLengthShort(v, settings);
  else t = fmtLengthShort(v, settings);
  return k.driven ? `(${t})` : t;
}

/**
 * Mise en page d'une cote en coordonnées monde.
 * @returns {{segs:Array, ext:Array, arrows:Array<{p,dir}>, arc:object|null, text:{x,y}}|null}
 */
export function dimLayout(sk, k) {
  const pos = k.pos || { x: 0, y: 0 };
  const A = sk.entities.get(k.refs[0]), B = sk.entities.get(k.refs[1]);
  const out = { segs: [], ext: [], arrows: [], arc: null, text: pos };
  const aligned = (a, b) => {
    const u = norm(sub(b, a));
    if (u.x === 0 && u.y === 0) return null;
    const n = perp(u);
    const off = dot(sub(pos, a), n);
    const a2 = add(a, mul(n, off)), b2 = add(b, mul(n, off));
    out.ext.push([a, a2], [b, b2]);
    const t = dot(sub(pos, a), u), L = dist(a, b);
    const from = t < 0 ? add(a2, mul(u, t)) : a2, to = t > L ? add(a2, mul(u, t)) : b2;
    out.segs.push([from, to]);
    out.arrows.push({ p: a2, dir: mul(u, -1) }, { p: b2, dir: u });
    out.text = add(a2, mul(u, t));
    return out;
  };
  // cote projetée sur une direction fixe u (horizontale ou verticale)
  const projected = (a, b, u) => {
    const n = perp(u);
    const a2 = add(a, mul(n, dot(sub(pos, a), n))), b2 = add(b, mul(n, dot(sub(pos, b), n)));
    out.ext.push([a, a2], [b, b2]);
    let d = sub(b2, a2);
    const L = Math.hypot(d.x, d.y);
    d = L > 1e-12 ? mul(d, 1 / L) : u;
    const t = dot(sub(pos, a2), d);
    const from = t < 0 ? add(a2, mul(d, t)) : a2, to = t > L ? add(a2, mul(d, t)) : b2;
    out.segs.push([from, to]);
    out.arrows.push({ p: a2, dir: mul(d, -1) }, { p: b2, dir: d });
    out.text = add(a2, mul(d, t));
    return out;
  };
  const toLine = (p, a, b) => {
    const u = norm(sub(b, a)), n = perp(u);
    const L = dist(a, b);
    const t = dot(sub(pos, a), u);
    const h = dot(sub(p, a), n);
    const foot = add(a, mul(u, t));
    const top = add(foot, mul(n, h));
    out.segs.push([foot, top]);
    out.ext.push([p, top]);
    if (t < 0) out.ext.push([a, foot]); else if (t > L) out.ext.push([b, foot]);
    const dir = mul(n, h >= 0 ? 1 : -1);
    out.arrows.push({ p: foot, dir: mul(dir, -1) }, { p: top, dir });
    const s = dot(sub(pos, a), n);
    out.text = add(foot, mul(n, s));
    if ((s - h) * (h >= 0 ? 1 : -1) > 0 || s * (h >= 0 ? 1 : -1) < 0) out.segs.push([s * (h >= 0 ? 1 : -1) < 0 ? foot : top, out.text]);
    return out;
  };
  switch (k.type) {
    case 'dimLength': return A ? aligned(P(sk, A.p1), P(sk, A.p2)) : null;
    case 'dimDistance': return aligned(P(sk, k.refs[0]), P(sk, k.refs[1]));
    case 'dimHorizontal': return projected(P(sk, k.refs[0]), P(sk, k.refs[1]), { x: 1, y: 0 });
    case 'dimVertical': return projected(P(sk, k.refs[0]), P(sk, k.refs[1]), { x: 0, y: 1 });
    case 'dimPointLine': return B ? toLine(P(sk, k.refs[0]), P(sk, B.p1), P(sk, B.p2)) : null;
    case 'dimLineLine': return A && B ? toLine(P(sk, B.p1), P(sk, A.p1), P(sk, A.p2)) : null;
    case 'dimAngle': {
      if (!A || !B) return null;
      const { X, r1, r2 } = angleRays(sk, k);
      const R = Math.max(dist(pos, X), 1e-6);
      const a1 = angleOf(r1), a2 = angleOf(r2);
      const ccw = cross(r1, r2) > 0;
      out.arc = { c: X, r: R, a1, a2, ccw };
      const e1 = add(X, mul(r1, R)), e2 = add(X, mul(r2, R));
      const t1 = mul(perp(r1), ccw ? -1 : 1), t2 = mul(perp(r2), ccw ? 1 : -1);
      out.arrows.push({ p: e1, dir: t1 }, { p: e2, dir: t2 });
      // lignes d'attache si le segment n'atteint pas l'arc
      for (const [L, r, e] of [[A, r1, e1], [B, r2, e2]]) {
        const p1 = P(sk, L.p1), p2 = P(sk, L.p2);
        const t = [dot(sub(p1, X), r), dot(sub(p2, X), r)];
        const lo = Math.min(...t), hi = Math.max(...t);
        if (R > hi) out.ext.push([add(X, mul(r, Math.max(hi, 0))), e]);
        else if (R < lo) out.ext.push([e, add(X, mul(r, lo))]);
      }
      out.text = pos;
      return out;
    }
    case 'dimRadius': {
      if (!A) return null;
      const { c, r } = curveOf(sk, A);
      let dir = norm(sub(pos, c));
      if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
      const edge = add(c, mul(dir, r));
      const inside = dist(pos, c) < r;
      out.segs.push([edge, pos]);
      out.arrows.push({ p: edge, dir: inside ? dir : mul(dir, -1) });
      out.text = pos;
      return out;
    }
    default: return null;
  }
}

// ---------- Icônes de relations ----------
export const REL_GLYPH = {
  horizontal: 'H', vertical: 'V', parallel: '//', perpendicular: '⊥', tangent: 'T', concentric: '◎',
  equal: '=', collinear: '≡', symmetric: 'S', midpoint: 'M', coincident: '•', fixed: 'F',
};
export const REL_LABEL = {
  horizontal: 'Horizontale', vertical: 'Verticale', coincident: 'Coïncidente', collinear: 'Colinéaire',
  parallel: 'Parallèle', perpendicular: 'Perpendiculaire', tangent: 'Tangente', concentric: 'Concentrique',
  equal: 'Égale', symmetric: 'Symétrique', midpoint: 'Point milieu', fixed: 'Fixe',
};

/** Positions écran des icônes de relations : [{cid, x, y, type}]. */
export function layoutBadges(sk, vp) {
  const out = [];
  const count = new Map();
  const slot = (key) => { const i = count.get(key) || 0; count.set(key, i + 1); return i; };
  const atPoint = (cid, type, pid) => {
    const p = P(sk, pid); if (!p) return;
    const s = vp.toScreen(p);
    const i = slot(pid);
    out.push({ cid, type, x: s.x + 14 + i * 19, y: s.y - 14 });
  };
  const atEntity = (cid, type, e) => {
    let m, u;
    if (e.type === 'line') { const a = P(sk, e.p1), b = P(sk, e.p2); m = mid(a, b); u = norm(sub(b, a)); }
    else if (e.type === 'circle') { const c = P(sk, e.c); const d = fromAngle(Math.PI / 4); m = add(c, mul(d, e.r)); u = perp(d); }
    else { const c = P(sk, e.c); const inf = arcInfo(c, P(sk, e.s), P(sk, e.e), e.ccw); const am = e.ccw ? inf.a1 + inf.sweep / 2 : inf.a1 - inf.sweep / 2; const d = fromAngle(am); m = add(c, mul(d, inf.r)); u = perp(d); }
    const s = vp.toScreen(m);
    // en écran, Y est inversé
    let ux = u.x, uy = -u.y;
    if (ux < 0 || (ux === 0 && uy < 0)) { ux = -ux; uy = -uy; }
    const nx = uy, ny = -ux;       // normale écran (vers le haut pour une ligne horizontale)
    const i = slot(e.id);
    out.push({ cid, type, x: s.x + nx * 19 + ux * 20 * i, y: s.y + ny * 19 + uy * 20 * i });
  };
  for (const k of sk.constraints.values()) {
    if (isDimension(k)) continue;
    if (k.type === 'coincident' || k.type === 'midpoint') { atPoint(k.id, k.type, k.refs[0]); continue; }
    if (k.type === 'symmetric') { atPoint(k.id, k.type, k.refs[0]); atPoint(k.id, k.type, k.refs[1]); continue; }
    for (const r of k.refs) {
      const e = sk.entities.get(r);
      if (e) atEntity(k.id, k.type, e); else atPoint(k.id, k.type, r);
    }
  }
  return out;
}

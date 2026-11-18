// Requêtes sur l'esquisse : test de toucher, infos d'entité, points caractéristiques.
import { dist, distToSegment, distToArc, arcInfo, sub, angleOf, TAU, mid, add, fromAngle } from './geom.js';

/** Distance d'un point à la droite (a, b) prise en entier (ligne infinie). */
function distToLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
  if (l < 1e-12) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l;
}

/** Distance d'un point du monde à une entité. */
export function entityDistance(sk, e, wp) {
  if (e.type === 'line') return (e.infinite ? distToLine : distToSegment)(wp, sk.points.get(e.p1), sk.points.get(e.p2));
  if (e.type === 'circle') return Math.abs(dist(wp, sk.points.get(e.c)) - e.r);
  if (e.type === 'arc') return distToArc(wp, sk.points.get(e.c), sk.points.get(e.s), sk.points.get(e.e), e.ccw);
  return Infinity;
}

/**
 * Test de toucher. Les points ont la priorité sur les entités.
 * @returns {{type:'point'|'entity', id:string, d:number}|null}
 */
export function hitTest(sk, wp, tolPoint, tolEntity = tolPoint) {
  let best = null;
  for (const p of sk.points.values()) {
    const d = dist(p, wp);
    if (d <= tolPoint && (!best || d < best.d)) best = { type: 'point', id: p.id, d };
  }
  if (best) return best;
  for (const e of sk.entities.values()) {
    const d = entityDistance(sk, e, wp);
    if (d <= tolEntity && (!best || d < best.d)) best = { type: 'entity', id: e.id, d };
  }
  return best;
}

/** Longueur d'une entité (ligne, arc) ou périmètre (cercle). Ligne infinie : distance entre ses deux points. */
export function entityLength(sk, e) {
  if (e.type === 'line') return dist(sk.points.get(e.p1), sk.points.get(e.p2));
  if (e.type === 'circle') return TAU * e.r;
  if (e.type === 'arc') return arcInfo(sk.points.get(e.c), sk.points.get(e.s), sk.points.get(e.e), e.ccw).length;
  return 0;
}

/** Points caractéristiques (milieux, quadrants) : utilisés pour l'aimantation (étape 2). */
export function keyPoints(sk, e) {
  const out = [];
  if (e.type === 'line') {
    if (!e.infinite) out.push({ kind: 'midpoint', ...mid(sk.points.get(e.p1), sk.points.get(e.p2)) });
  } else if (e.type === 'circle') {
    const c = sk.points.get(e.c);
    for (let k = 0; k < 4; k++) out.push({ kind: 'quadrant', ...add(c, fromAngle(k * Math.PI / 2, e.r)) });
  } else if (e.type === 'arc') {
    const c = sk.points.get(e.c);
    const { r, a1, sweep } = arcInfo(c, sk.points.get(e.s), sk.points.get(e.e), e.ccw);
    const am = e.ccw ? a1 + sweep / 2 : a1 - sweep / 2;
    out.push({ kind: 'midpoint', ...add(c, fromAngle(am, r)) });
  }
  return out;
}

/** Point de l'entité le plus proche de wp. */
export function closestOnEntity(sk, e, wp) {
  if (e.type === 'line') {
    const a = sk.points.get(e.p1), b = sk.points.get(e.p2);
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((wp.x - a.x) * dx + (wp.y - a.y) * dy) / l2 : 0;
    if (!e.infinite) t = Math.max(0, Math.min(1, t));
    return { x: a.x + dx * t, y: a.y + dy * t };
  }
  const c = sk.points.get(e.c);
  const r = e.type === 'circle' ? e.r : dist(c, sk.points.get(e.s));
  const d = dist(wp, c) || 1;
  return { x: c.x + (wp.x - c.x) / d * r, y: c.y + (wp.y - c.y) / d * r };
}

function onEntity(sk, e, p, eps) {
  if (e.type === 'line') return entityDistance(sk, e, p) <= eps;
  if (e.type === 'circle') return true;
  return distToArc(p, sk.points.get(e.c), sk.points.get(e.s), sk.points.get(e.e), e.ccw) <= eps;
}
const circleOf = (sk, e) => { const c = sk.points.get(e.c); return { c, r: e.type === 'circle' ? e.r : dist(c, sk.points.get(e.s)) }; };

/** Points d'intersection de deux entités (lignes, cercles, arcs). */
export function entityIntersections(sk, e1, e2) {
  const out = [];
  const eps = 1e-6;
  if (e1.type === 'line' && e2.type === 'line') {
    const a = sk.points.get(e1.p1), b = sk.points.get(e1.p2), c = sk.points.get(e2.p1), d = sk.points.get(e2.p2);
    const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) > 1e-12) {
      const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
      const inT = e1.infinite || (t >= -1e-9 && t <= 1 + 1e-9), inU = e2.infinite || (u >= -1e-9 && u <= 1 + 1e-9);
      if (inT && inU) out.push({ x: a.x + rx * t, y: a.y + ry * t });
    }
    return out;
  }
  if (e1.type !== 'line' && e2.type === 'line') return entityIntersections(sk, e2, e1);
  if (e1.type === 'line') {
    const a = sk.points.get(e1.p1), b = sk.points.get(e1.p2);
    const { c, r } = circleOf(sk, e2);
    const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - c.x, fy = a.y - c.y;
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (A < 1e-18 || disc < 0) return out;
    for (const sgn of [-1, 1]) {
      const t = (-B + sgn * Math.sqrt(disc)) / (2 * A);
      if (!e1.infinite && (t < -1e-9 || t > 1 + 1e-9)) continue;
      const p = { x: a.x + dx * t, y: a.y + dy * t };
      if (onEntity(sk, e2, p, eps * Math.max(1, r))) out.push(p);
    }
    return out;
  }
  const c1 = circleOf(sk, e1), c2 = circleOf(sk, e2);
  const d = dist(c1.c, c2.c);
  if (d < 1e-9 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return out;
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const mx = c1.c.x + (c2.c.x - c1.c.x) * a / d, my = c1.c.y + (c2.c.y - c1.c.y) * a / d;
  for (const sgn of [-1, 1]) {
    const p = { x: mx + sgn * h * (c2.c.y - c1.c.y) / d, y: my - sgn * h * (c2.c.x - c1.c.x) / d };
    if (onEntity(sk, e1, p, eps * Math.max(1, c1.r)) && onEntity(sk, e2, p, eps * Math.max(1, c2.r))) out.push(p);
  }
  return out;
}

/** Vrai si tous les points de l'entité sont dans le rectangle (monde). */
export function entityInsideRect(sk, e, r) {
  const inside = (p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
  if (e.type === 'circle') {
    const c = sk.points.get(e.c);
    return inside({ x: c.x - e.r, y: c.y - e.r }) && inside({ x: c.x + e.r, y: c.y + e.r });
  }
  if (e.infinite) return false;          // une ligne infinie ne tient jamais dans un cadre
  return sk.entityPointIds(e).every((pid) => inside(sk.points.get(pid)));
}
export function entityTouchesRect(sk, e, r) {
  const inside = (p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
  if (e.type === 'circle') {
    const c = sk.points.get(e.c);
    return inside(c) || inside({ x: c.x + e.r, y: c.y }) || inside({ x: c.x - e.r, y: c.y }) || inside({ x: c.x, y: c.y + e.r }) || inside({ x: c.x, y: c.y - e.r });
  }
  if (e.type === 'line') {
    const a = sk.points.get(e.p1), b = sk.points.get(e.p2);
    if (e.infinite) {
      // la droite traverse le cadre si ses coins ne sont pas tous du même côté
      const side = (p) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
      const s = [side({ x: r.minX, y: r.minY }), side({ x: r.maxX, y: r.minY }), side({ x: r.maxX, y: r.maxY }), side({ x: r.minX, y: r.maxY })];
      return s.some((v) => v >= 0) && s.some((v) => v <= 0);
    }
    if (inside(a) || inside(b)) return true;
    // segment traversant le rectangle sans extrémité dedans
    const corners = [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }];
    for (let i = 0; i < 4; i++) {
      const c1 = corners[i], c2 = corners[(i + 1) % 4];
      if (segmentsIntersect(a, b, c1, c2)) return true;
    }
    return false;
  }
  return sk.entityPointIds(e).some((pid) => inside(sk.points.get(pid)));
}
function segmentsIntersect(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Direction tangente « sortante » d'une entité à l'un de ses points d'extrémité. */
export function outwardTangentAt(sk, e, pid) {
  const P = sk.points.get(pid);
  if (e.type === 'line') {
    const other = sk.points.get(e.p1 === pid ? e.p2 : e.p1);
    const v = sub(P, other);
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  }
  if (e.type === 'arc') {
    const c = sk.points.get(e.c);
    const rad = sub(P, c);
    const l = Math.hypot(rad.x, rad.y) || 1;
    // direction de parcours ccw au point
    let t = { x: -rad.y / l, y: rad.x / l };
    if (!e.ccw) t = { x: -t.x, y: -t.y };
    // à l'extrémité de départ, on sort « à reculons »
    if (pid === e.s) t = { x: -t.x, y: -t.y };
    return t;
  }
  return null;
}

/** Entités dont pid est une extrémité (lignes et arcs, pas les centres). */
export function endpointEntities(sk, pid) {
  return [...sk.entities.values()].filter((e) =>
    (e.type === 'line' && (e.p1 === pid || e.p2 === pid)) ||
    (e.type === 'arc' && (e.s === pid || e.e === pid)));
}

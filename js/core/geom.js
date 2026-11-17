// Géométrie 2D de base. Toutes les coordonnées sont en millimètres, Y vers le haut.
export const TAU = Math.PI * 2;
export const EPS = 1e-9;

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const perp = (a) => ({ x: -a.y, y: a.x });
export const angleOf = (a) => Math.atan2(a.y, a.x);
export const fromAngle = (t, r = 1) => ({ x: Math.cos(t) * r, y: Math.sin(t) * r });
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function norm(a) {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Angle ramené dans [0, 2π). */
export function normAngle(a) {
  a %= TAU;
  if (a < 0) a += TAU;
  return a;
}

/** Différence d'angle ramenée dans (-π, π]. */
export function deltaAngle(from, to) {
  let d = normAngle(to - from);
  if (d > Math.PI) d -= TAU;
  return d;
}

/** Angle balayé (positif) en allant de a1 à a2 dans le sens donné. */
export function sweepAngle(a1, a2, ccw) {
  return ccw ? normAngle(a2 - a1) : normAngle(a1 - a2);
}

/** Vrai si l'angle theta est sur l'arc (a1 → a2, sens ccw). */
export function angleInArc(theta, a1, a2, ccw) {
  const sw = sweepAngle(a1, a2, ccw);
  const t = ccw ? normAngle(theta - a1) : normAngle(a1 - theta);
  return t <= sw + 1e-9;
}

export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  let t = l2 > 0 ? dot(sub(p, a), ab) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { t, point: add(a, mul(ab, t)) };
}

export function distToSegment(p, a, b) {
  return dist(p, closestOnSegment(p, a, b).point);
}

/** Cercle passant par 3 points, ou null si alignés. */
export function circleFrom3(p1, p2, p3) {
  const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { c: { x: ux, y: uy }, r: Math.hypot(ax - ux, ay - uy) };
}

/** Infos d'un arc défini par centre, point de départ, point d'arrivée et sens. */
export function arcInfo(c, s, e, ccw) {
  const r = dist(c, s);
  const a1 = angleOf(sub(s, c));
  const a2 = angleOf(sub(e, c));
  const sweep = sweepAngle(a1, a2, ccw);
  return { r, a1, a2, sweep, length: r * sweep };
}

export function distToArc(p, c, s, e, ccw) {
  const { r, a1, a2 } = arcInfo(c, s, e, ccw);
  const th = angleOf(sub(p, c));
  if (angleInArc(th, a1, a2, ccw)) return Math.abs(dist(p, c) - r);
  return Math.min(dist(p, s), dist(p, e));
}

export function arcBBox(c, s, e, ccw) {
  const { r, a1, a2 } = arcInfo(c, s, e, ccw);
  let minX = Math.min(s.x, e.x), maxX = Math.max(s.x, e.x);
  let minY = Math.min(s.y, e.y), maxY = Math.max(s.y, e.y);
  const quads = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
  for (const q of quads) {
    if (angleInArc(q, a1, a2, ccw)) {
      const p = add(c, fromAngle(q, r));
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Pas « propre » (1, 2, 5 × 10^k) supérieur ou égal à raw. */
export function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw - 1e-12) return m * p;
  return 10 * p;
}

/** Intersection de deux droites (points a1,a2 et b1,b2), ou null si parallèles. */
export function lineLineIntersection(a1, a2, b1, b2) {
  const r = sub(a2, a1), s = sub(b2, b1);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(b1, a1), s) / den;
  const u = cross(sub(b1, a1), r) / den;
  return { point: add(a1, mul(r, t)), t, u };
}

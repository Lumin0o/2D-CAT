// Opérations d'édition de l'étape 3, indépendantes de l'interface :
// ajuster, prolonger, congé, chanfrein, décaler, miroir, déplacer / copier / pivoter.
// Toutes modifient l'esquisse en place et renvoient { ok, msg? , ... }. La résolution
// (solveur) et l'historique sont faits ensuite par l'application.
import { sub, add, mul, dot, cross, dist, norm, perp, angleOf, fromAngle, normAngle, arcInfo, lineLineIntersection, mid } from './geom.js';
import { ORIGIN_ID } from './model.js';
import { entityIntersections, entityDistance, endpointEntities } from './query.js';

const P = (sk, id) => sk.points.get(id);
const EPS_T = 1e-7;
/** Tolérance de position, relative à la taille de la géométrie. */
const tolOf = (...pts) => 1e-7 * Math.max(1, ...pts.map((p) => Math.abs(p.x) + Math.abs(p.y)));

const circleOf = (sk, e) => { const c = P(sk, e.c); return { c, r: e.type === 'circle' ? e.r : dist(c, P(sk, e.s)) }; };

// ---------- Paramètres le long d'une entité ----------
/** Ligne : t dans [0, 1] de p1 à p2 ; arc : angle parcouru depuis s (0 … balayage) ; cercle : angle [0, 2π). */
export function paramOf(sk, e, p) {
  if (e.type === 'line') {
    const a = P(sk, e.p1), b = P(sk, e.p2), ab = sub(b, a), l2 = dot(ab, ab);
    return l2 > 0 ? dot(sub(p, a), ab) / l2 : 0;
  }
  const c = P(sk, e.c);
  const th = angleOf(sub(p, c));
  if (e.type === 'circle') return normAngle(th);
  const a1 = angleOf(sub(P(sk, e.s), c));
  return e.ccw ? normAngle(th - a1) : normAngle(a1 - th);
}
function arcSweep(sk, e) { return arcInfo(P(sk, e.c), P(sk, e.s), P(sk, e.e), e.ccw).sweep; }
function pointOnArcAt(sk, e, u) {
  const c = P(sk, e.c), s = P(sk, e.s);
  const r = dist(c, s), a1 = angleOf(sub(s, c));
  return add(c, fromAngle(e.ccw ? a1 + u : a1 - u, r));
}

/** Un point de l'entité o se trouve-t-il en p ? (pour réutiliser une extrémité au lieu d'en créer une) */
function pointOfEntityAt(sk, o, p) {
  for (const pid of sk.entityPointIds(o)) {
    if (o.type !== 'line' && pid === o.c) continue;
    if (dist(P(sk, pid), p) < tolOf(p) * 10) return pid;
  }
  // point isolé (outil Point) posé à cet endroit
  return null;
}

/** Lignes de coupe de e : intersections avec toutes les autres entités. */
function cutsOf(sk, e) {
  const out = [];
  for (const o of sk.entities.values()) {
    if (o.id === e.id) continue;
    for (const p of entityIntersections(sk, e, o)) out.push({ p, t: paramOf(sk, e, p), by: o.id, pid: pointOfEntityAt(sk, o, p) });
  }
  return out;
}

/** Point de coupe : l'extrémité existante de l'entité qui coupe, sinon un nouveau point coïncident avec elle. */
function cutPoint(sk, cut) {
  if (cut.pid && sk.points.has(cut.pid)) return cut.pid;
  const q = sk.addPoint(cut.p.x, cut.p.y);
  if (sk.entities.has(cut.by)) sk.addConstraint('coincident', [q.id, cut.by]);
  return q.id;
}

/** Contraintes qui dépendent de la longueur d'une ligne (à retirer quand on la raccourcit / l'allonge). */
function dropLengthConstraints(sk, e, oldEnds) {
  for (const [cid, k] of sk.constraints) {
    if (k.refs.includes(e.id) && (k.type === 'dimLength' || k.type === 'midpoint' || (k.type === 'equal' && e.type === 'line'))) sk.constraints.delete(cid);
    else if (oldEnds && ['dimDistance', 'dimHorizontal', 'dimVertical'].includes(k.type) && k.refs.length === 2 && oldEnds.includes(k.refs[0]) && oldEnds.includes(k.refs[1])) sk.constraints.delete(cid);
  }
}
/** Remplace une extrémité d'entité (key : 'p1' | 'p2' | 's' | 'e') et supprime l'ancien point s'il ne sert plus. */
function setEnd(sk, e, key, pid) {
  const old = e[key];
  if (old === pid) return;
  e[key] = pid;
  sk.pruneOrphanPoint(old);
}

// ---------- Ajuster (couper au plus proche) ----------
/**
 * Supprime la portion de l'entité comprise entre les deux intersections qui encadrent wp
 * (ou toute l'entité si elle n'en a pas).
 */
export function trimAt(sk, eid, wp) {
  const e = sk.entities.get(eid);
  if (!e) return { ok: false };
  const cuts = cutsOf(sk, e);
  if (e.type === 'circle') return trimCircle(sk, e, wp, cuts);
  const total = e.type === 'line' ? 1 : arcSweep(sk, e);
  const tp = Math.min(total, Math.max(0, paramOf(sk, e, wp)));
  const inner = cuts.filter((c) => c.t > EPS_T * total && c.t < total - EPS_T * total);
  let lo = null, hi = null;
  for (const c of inner) {
    if (c.t <= tp && (!lo || c.t > lo.t)) lo = c;
    if (c.t > tp && (!hi || c.t < hi.t)) hi = c;
  }
  const [kS, kE] = e.type === 'line' ? ['p1', 'p2'] : ['s', 'e'];
  const ends = [e[kS], e[kE]];
  if (!lo && !hi) { sk.removeEntity(e.id); return { ok: true, deleted: true }; }
  dropLengthConstraints(sk, e, ends);
  if (!lo) { setEnd(sk, e, kS, cutPoint(sk, hi)); return { ok: true }; }
  if (!hi) { setEnd(sk, e, kE, cutPoint(sk, lo)); return { ok: true }; }
  // coupe au milieu : deux morceaux
  const a = cutPoint(sk, lo), b = cutPoint(sk, hi);
  const oldEnd = e[kE];
  let piece;
  if (e.type === 'line') {
    piece = sk.addLine(b, oldEnd, { construction: e.construction });
    e.p2 = a;
    sk.addConstraint('collinear', [e.id, piece.id]);
  } else {
    piece = sk.addArc(e.c, b, oldEnd, e.ccw, { construction: e.construction });
    e.e = a;
    sk.addConstraint('equal', [e.id, piece.id]);
  }
  moveEndConstraints(sk, e.id, piece.id, oldEnd);
  return { ok: true, piece: piece.id };
}
/** Les relations attachées à l'ancienne extrémité (tangence au bout, etc.) suivent le morceau qui la garde. */
function moveEndConstraints(sk, fromId, toId, endPid) {
  for (const k of sk.constraints.values()) {
    if (k.type === 'tangent' && k.refs.includes(fromId)) {
      const other = sk.entities.get(k.refs[0] === fromId ? k.refs[1] : k.refs[0]);
      if (other && sk.entityPointIds(other).includes(endPid)) k.refs = k.refs.map((r) => (r === fromId ? toId : r));
    }
  }
}
function trimCircle(sk, e, wp, cuts) {
  const angs = [];
  for (const c of cuts) if (!angs.some((a) => Math.abs(normAngle(a.t - c.t + Math.PI) - Math.PI) < 1e-7)) angs.push(c);
  if (angs.length === 0) { sk.removeEntity(e.id); return { ok: true, deleted: true }; }
  if (angs.length === 1) return { ok: false, msg: 'Il faut au moins deux intersections pour ajuster un cercle' };
  angs.sort((a, b) => a.t - b.t);
  const th = paramOf(sk, e, wp);
  // portion enlevée : de angs[i] à angs[i+1] (sens trigo) qui contient th
  let i = angs.length - 1;
  for (let j = 0; j < angs.length; j++) if (angs[j].t <= th) i = j;
  const from = angs[i], to = angs[(i + 1) % angs.length];
  // reste : arc de « to » à « from » dans le sens trigo
  const s = cutPoint(sk, to), en = cutPoint(sk, from);
  e.type = 'arc'; e.s = s; e.e = en; e.ccw = true; delete e.r;
  return { ok: true };
}

// ---------- Prolonger ----------
/** Prolonge l'extrémité de la ligne / de l'arc la plus proche de wp jusqu'à la première entité rencontrée. */
export function extendAt(sk, eid, wp) {
  const e = sk.entities.get(eid);
  if (!e || e.type === 'circle') return { ok: false, msg: 'Touchez une ligne ou un arc, près du bout à prolonger' };
  const [kS, kE] = e.type === 'line' ? ['p1', 'p2'] : ['s', 'e'];
  const S = P(sk, e[kS]), E = P(sk, e[kE]);
  const atStart = dist(wp, S) < dist(wp, E);
  const key = atStart ? kS : kE;
  const endPid = e[key];
  if (sk.entitiesOfPoint(endPid).length > 1 || endPid === ORIGIN_ID) return { ok: false, msg: 'Ce bout est relié à une autre entité' };
  let best = null;
  if (e.type === 'line') {
    const from = atStart ? E : S, end = atStart ? S : E;
    const d = norm(sub(end, from));
    const L = dist(from, end);
    for (const o of sk.entities.values()) {
      if (o.id === e.id) continue;
      for (const q of rayHits(sk, o, from, d)) {
        const s = dot(sub(q, from), d);
        if (s > L * (1 + EPS_T) + 1e-9 && (!best || s < best.s)) best = { s, p: q, by: o.id };
      }
    }
  } else {
    const c = P(sk, e.c), r = dist(c, P(sk, e.s));
    const sweep = arcSweep(sk, e);
    const a0 = angleOf(sub(atStart ? P(sk, e.s) : P(sk, e.e), c));
    const dirCcw = atStart ? !e.ccw : e.ccw;          // sens du prolongement
    for (const o of sk.entities.values()) {
      if (o.id === e.id) continue;
      for (const q of circleHits(sk, o, c, r)) {
        const th = angleOf(sub(q, c));
        const g = dirCcw ? normAngle(th - a0) : normAngle(a0 - th);
        if (g > 1e-7 && g < 2 * Math.PI - sweep - 1e-7 && (!best || g < best.s)) best = { s: g, p: q, by: o.id };
      }
    }
  }
  if (!best) return { ok: false, msg: 'Aucune entité à atteindre dans ce sens' };
  const target = sk.entities.get(best.by);
  const reuse = pointOfEntityAt(sk, target, best.p);
  dropLengthConstraints(sk, e, [e[kS], e[kE]]);
  setEnd(sk, e, key, cutPoint(sk, { p: best.p, by: best.by, pid: reuse }));
  return { ok: true };
}
/** Intersections de la droite (from + d·s) avec l'entité o (sur o, et dans les deux sens de la droite). */
function rayHits(sk, o, from, d) {
  const out = [];
  if (o.type === 'line') {
    const a = P(sk, o.p1), b = P(sk, o.p2);
    const h = lineLineIntersection(from, add(from, d), a, b);
    if (h && h.u >= -1e-9 && h.u <= 1 + 1e-9) out.push(h.point);
    return out;
  }
  const { c, r } = circleOf(sk, o);
  const f = sub(from, c);
  const B = 2 * dot(f, d), C = dot(f, f) - r * r, disc = B * B - 4 * C;
  if (disc < 0) return out;
  for (const sg of [-1, 1]) {
    const q = add(from, mul(d, (-B + sg * Math.sqrt(disc)) / 2));
    if (o.type === 'circle' || onArc(sk, o, q)) out.push(q);
  }
  return out;
}
/** Intersections du cercle complet (c, r) avec l'entité o. */
function circleHits(sk, o, c, r) {
  const out = [];
  if (o.type === 'line') {
    const a = P(sk, o.p1), b = P(sk, o.p2);
    const d = sub(b, a), f = sub(a, c);
    const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r, disc = B * B - 4 * A * C;
    if (A < 1e-18 || disc < 0) return out;
    for (const sg of [-1, 1]) {
      const t = (-B + sg * Math.sqrt(disc)) / (2 * A);
      if (t >= -1e-9 && t <= 1 + 1e-9) out.push(add(a, mul(d, t)));
    }
    return out;
  }
  const o2 = circleOf(sk, o);
  for (const q of circleCircle(c, r, o2.c, o2.r)) if (o.type === 'circle' || onArc(sk, o, q)) out.push(q);
  return out;
}
function circleCircle(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < 1e-12 || d > r1 + r2 + 1e-12 || d < Math.abs(r1 - r2) - 1e-12) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const m = add(c1, mul(sub(c2, c1), a / d));
  const n = perp(mul(sub(c2, c1), 1 / d));
  return h < 1e-12 ? [m] : [add(m, mul(n, h)), sub(m, mul(n, h))];
}
function onArc(sk, o, q) {
  const u = paramOf(sk, o, q);
  return u <= arcSweep(sk, o) + 1e-9;
}

// ---------- Congé / chanfrein ----------
/** Deux lignes du coin : celles dont pid est une extrémité (exactement deux lignes). */
export function cornerLines(sk, pid) {
  const es = endpointEntities(sk, pid);
  if (es.length !== 2 || es.some((e) => e.type !== 'line')) return null;
  return [es[0].id, es[1].id];
}
function cornerSetup(sk, A, B) {
  const shared = [A.p1, A.p2].find((p) => p === B.p1 || p === B.p2);
  let X;
  if (shared) X = P(sk, shared);
  else {
    const h = lineLineIntersection(P(sk, A.p1), P(sk, A.p2), P(sk, B.p1), P(sk, B.p2));
    if (!h) return null;
    X = h.point;
  }
  const side = (L) => {
    let nearKey;
    if (shared) nearKey = L.p1 === shared ? 'p1' : 'p2';
    else nearKey = dist(P(sk, L.p1), X) <= dist(P(sk, L.p2), X) ? 'p1' : 'p2';
    const far = P(sk, L[nearKey === 'p1' ? 'p2' : 'p1']);
    return { L, nearKey, far, u: norm(sub(far, X)), len: dist(far, X) };
  };
  return { X, a: side(A), b: side(B) };
}
/**
 * Congé de rayon r entre deux lignes (qui se rejoignent ou dont les prolongements se coupent).
 * @returns {{ok:boolean, msg?:string, arc?:string}}
 */
export function filletLines(sk, idA, idB, r) {
  const A = sk.entities.get(idA), B = sk.entities.get(idB);
  if (!A || !B || A.type !== 'line' || B.type !== 'line' || idA === idB) return { ok: false, msg: 'Le congé se fait entre deux lignes' };
  const cs = cornerSetup(sk, A, B);
  if (!cs) return { ok: false, msg: 'Lignes parallèles : congé impossible' };
  const { X, a, b } = cs;
  const th = Math.acos(Math.max(-1, Math.min(1, dot(a.u, b.u))));
  if (th < 1e-4 || th > Math.PI - 1e-4) return { ok: false, msg: 'Lignes alignées : congé impossible' };
  const t = r / Math.tan(th / 2);
  if (!(r > 0) || t >= a.len - 1e-9 || t >= b.len - 1e-9) return { ok: false, msg: 'Rayon trop grand pour ces lignes' };
  const T1 = add(X, mul(a.u, t)), T2 = add(X, mul(b.u, t));
  const C = add(X, mul(norm(add(a.u, b.u)), r / Math.sin(th / 2)));
  const ccw = cross(sub(T1, C), sub(T2, C)) > 0;
  const old = [[A, A.p1, A.p2], [B, B.p1, B.p2]];
  for (const [L, e1, e2] of old) dropLengthConstraints(sk, L, [e1, e2]);
  const p1 = sk.addPoint(T1.x, T1.y), p2 = sk.addPoint(T2.x, T2.y), pc = sk.addPoint(C.x, C.y);
  setEnd(sk, A, a.nearKey, p1.id);
  setEnd(sk, B, b.nearKey, p2.id);
  const arc = sk.addArc(pc.id, p1.id, p2.id, ccw, { construction: A.construction && B.construction });
  sk.addConstraint('tangent', [arc.id, A.id]);
  sk.addConstraint('tangent', [arc.id, B.id]);
  return { ok: true, arc: arc.id };
}
/** Chanfrein à distances égales d entre deux lignes. */
export function chamferLines(sk, idA, idB, d) {
  const A = sk.entities.get(idA), B = sk.entities.get(idB);
  if (!A || !B || A.type !== 'line' || B.type !== 'line' || idA === idB) return { ok: false, msg: 'Le chanfrein se fait entre deux lignes' };
  const cs = cornerSetup(sk, A, B);
  if (!cs) return { ok: false, msg: 'Lignes parallèles : chanfrein impossible' };
  const { X, a, b } = cs;
  const th = Math.acos(Math.max(-1, Math.min(1, dot(a.u, b.u))));
  if (th < 1e-4 || th > Math.PI - 1e-4) return { ok: false, msg: 'Lignes alignées : chanfrein impossible' };
  if (!(d > 0) || d >= a.len - 1e-9 || d >= b.len - 1e-9) return { ok: false, msg: 'Distance trop grande pour ces lignes' };
  const T1 = add(X, mul(a.u, d)), T2 = add(X, mul(b.u, d));
  for (const L of [A, B]) dropLengthConstraints(sk, L, [L.p1, L.p2]);
  const p1 = sk.addPoint(T1.x, T1.y), p2 = sk.addPoint(T2.x, T2.y);
  setEnd(sk, A, a.nearKey, p1.id);
  setEnd(sk, B, b.nearKey, p2.id);
  const line = sk.addLine(p1.id, p2.id, { construction: A.construction && B.construction });
  return { ok: true, line: line.id };
}

// ---------- Contour (chaîne d'entités reliées) ----------
const ends = (e) => (e.type === 'line' ? [e.p1, e.p2] : e.type === 'arc' ? [e.s, e.e] : null);
/**
 * Chaîne d'entités reliées bout à bout à partir de eid (lignes et arcs ; on s'arrête aux embranchements).
 * @returns {{items:Array<{id:string, rev:boolean}>, closed:boolean}}
 */
export function chainFrom(sk, eid, { chain = true } = {}) {
  const e0 = sk.entities.get(eid);
  if (!e0) return { items: [], closed: false };
  if (e0.type === 'circle') return { items: [{ id: eid, rev: false }], closed: true };
  if (!chain) return { items: [{ id: eid, rev: false }], closed: false };
  // les lignes de construction ne font pas partie d'un contour (et inversement)
  const nextAt = (pid, fromId) => {
    const es = endpointEntities(sk, pid).filter((e) => e.id !== fromId && !!e.construction === !!e0.construction);
    return es.length === 1 ? es[0] : null;
  };
  const items = [{ id: eid, rev: false }];
  const used = new Set([eid]);
  // vers l'avant depuis la fin
  let cur = e0, endPid = ends(e0)[1], closed = false;
  for (;;) {
    const n = nextAt(endPid, cur.id);
    if (!n) break;
    if (n.id === eid) { closed = true; break; }
    if (used.has(n.id)) break;
    const [a, b] = ends(n);
    const rev = b === endPid;
    items.push({ id: n.id, rev });
    used.add(n.id);
    cur = n; endPid = rev ? a : b;
  }
  if (!closed) {
    // vers l'arrière depuis le début
    cur = e0; let startPid = ends(e0)[0];
    for (;;) {
      const n = nextAt(startPid, cur.id);
      if (!n || used.has(n.id)) break;
      const [a, b] = ends(n);
      const rev = a === startPid;       // on doit finir sur startPid
      items.unshift({ id: n.id, rev });
      used.add(n.id);
      cur = n; startPid = rev ? b : a;
    }
  }
  return { items, closed };
}

// ---------- Décaler ----------
/** Côté (+1 : à gauche du sens de parcours, -1 : à droite) où se trouve wp, et distance à la chaîne. */
export function offsetSide(sk, chain, wp) {
  let best = null;
  for (const it of chain.items) {
    const e = sk.entities.get(it.id);
    const d = entityDistance(sk, e, wp);
    if (!best || d < best.d) best = { d, it, e };
  }
  if (!best) return null;
  const { e, it } = best;
  let side;
  if (e.type === 'line') {
    const [S, E] = it.rev ? [P(sk, e.p2), P(sk, e.p1)] : [P(sk, e.p1), P(sk, e.p2)];
    side = cross(sub(E, S), sub(wp, S)) >= 0 ? 1 : -1;
  } else {
    const { c, r } = circleOf(sk, e);
    const inside = dist(wp, c) < r;
    const ccwTrav = e.type === 'circle' ? true : e.ccw !== it.rev;
    side = (inside === ccwTrav) ? 1 : -1;
  }
  return { side, d: best.d };
}
/** Géométrie décalée (sans rien créer) : [{e, it, S, E, c?, r?}] dans l'ordre de la chaîne. */
export function offsetGeometry(sk, chain, d, side) {
  const out = [];
  for (const it of chain.items) {
    const e = sk.entities.get(it.id);
    if (e.type === 'line') {
      const [S, E] = it.rev ? [P(sk, e.p2), P(sk, e.p1)] : [P(sk, e.p1), P(sk, e.p2)];
      const n = mul(perp(norm(sub(E, S))), d * side);
      out.push({ e, it, kind: 'line', S: add(S, n), E: add(E, n) });
    } else {
      const { c, r } = circleOf(sk, e);
      const ccwTrav = e.type === 'circle' ? true : e.ccw !== it.rev;
      const r2 = ccwTrav ? r - side * d : r + side * d;
      if (!(r2 > 1e-9)) return null;
      if (e.type === 'circle') { out.push({ e, it, kind: 'circle', c, r: r2 }); continue; }
      const [S, E] = it.rev ? [P(sk, e.e), P(sk, e.s)] : [P(sk, e.s), P(sk, e.e)];
      out.push({ e, it, kind: 'arc', c, r: r2, S: add(c, mul(sub(S, c), r2 / r)), E: add(c, mul(sub(E, c), r2 / r)) });
    }
  }
  if (out.some((g) => g.kind === 'circle')) return out;     // cercle seul : pas de raccord
  // raccords : intersection des deux géométries décalées la plus proche du sommet d'origine
  const n = out.length;
  const joints = [];
  const last = chain.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const g1 = out[i], g2 = out[(i + 1) % n];
    const q1 = g1.E, q2 = g2.S;
    let j = q1;
    if (dist(q1, q2) > tolOf(q1, q2) * 100) {
      const cand = geomIntersections(g1, g2);
      const V = endPointOf(sk, g1);
      j = cand.length ? cand.reduce((b, p) => (dist(p, V) < dist(b, V) ? p : b)) : mid(q1, q2);
    }
    joints.push(j);
  }
  for (let i = 0; i < joints.length; i++) { out[i].E = joints[i]; out[(i + 1) % n].S = joints[i]; }
  return out;
}
function endPointOf(sk, g) {
  const e = g.e;
  const ids = e.type === 'line' ? [e.p1, e.p2] : [e.s, e.e];
  return P(sk, g.it.rev ? ids[0] : ids[1]);
}
function geomIntersections(g1, g2) {
  if (g1.kind === 'line' && g2.kind === 'line') {
    const h = lineLineIntersection(g1.S, g1.E, g2.S, g2.E);
    return h ? [h.point] : [];
  }
  if (g1.kind === 'line' || g2.kind === 'line') {
    const L = g1.kind === 'line' ? g1 : g2, C = g1.kind === 'line' ? g2 : g1;
    const d = norm(sub(L.E, L.S)), f = sub(L.S, C.c);
    const B = 2 * dot(f, d), Cc = dot(f, f) - C.r * C.r, disc = B * B - 4 * Cc;
    if (disc < 0) return [];
    return [-1, 1].map((sg) => add(L.S, mul(d, (-B + sg * Math.sqrt(disc)) / 2)));
  }
  return circleCircle(g1.c, g1.r, g2.c, g2.r);
}
/** Crée les entités décalées. Raccords partagés ; lignes parallèles et arcs concentriques à l'original. */
/**
 * Crée le contour décalé.
 * opts.construction : les nouvelles entités sont des lignes de construction (sinon trait normal) ;
 * opts.dim : ajoute une cote (valeur d) et des relations « décalage identique » qui verrouillent tout le contour ;
 * opts.gap : écart (monde) entre le contour décalé et le texte de la cote.
 */
export function offsetChain(sk, chain, d, side, opts = {}) {
  const geo = offsetGeometry(sk, chain, d, side);
  if (!geo) return { ok: false, msg: 'Distance trop grande : un arc disparaîtrait' };
  const n = geo.length;
  const made = [];
  const cons = { construction: !!opts.construction };
  if (n === 1 && geo[0].kind === 'circle') {
    const g = geo[0];
    const c = sk.addCircle(g.e.c, g.r, cons);
    if (opts.dim) lockOffset(sk, [{ o: g.e.id, n: c.id }], d, opts.gap || 0);
    return { ok: true, ids: [c.id] };
  }
  // raccords partagés J[i] entre l'élément i et le suivant ; bouts libres pour une chaîne ouverte
  const nJ = chain.closed ? n : n - 1;
  const J = [];
  for (let i = 0; i < nJ; i++) J.push(sk.addPoint(geo[i].E.x, geo[i].E.y).id);
  const startPts = [], endPts = [];
  for (let i = 0; i < n; i++) {
    startPts.push(i > 0 ? J[i - 1] : chain.closed ? J[n - 1] : sk.addPoint(geo[0].S.x, geo[0].S.y).id);
    endPts.push(i < n - 1 ? J[i] : chain.closed ? J[n - 1] : sk.addPoint(geo[i].E.x, geo[i].E.y).id);
  }
  for (let i = 0; i < n; i++) {
    const g = geo[i], e = g.e;
    const [a, b] = g.it.rev ? [endPts[i], startPts[i]] : [startPts[i], endPts[i]];
    let ne;
    if (g.kind === 'line') {
      ne = sk.addLine(a, b, cons);
      sk.addConstraint('parallel', [e.id, ne.id]);
    } else {
      ne = sk.addArc(e.c, a, b, e.ccw, cons);
    }
    made.push(ne.id);
  }
  if (opts.dim) lockOffset(sk, chain.items.map((it, i) => ({ o: it.id, n: made[i] })), d, opts.gap || 0);
  return { ok: true, ids: made };
}

/**
 * Verrouille un décalage : une cote sur la première ligne (distance entre l'original et la copie), ou le rayon
 * de la copie s'il n'y a que des arcs / cercles, puis « décalage identique » pour les autres paires.
 */
function lockOffset(sk, pairs, d, gap) {
  const P = (id) => sk.points.get(id);
  const ref = pairs.find((q) => sk.entities.get(q.o).type === 'line') || pairs[0];
  const o = sk.entities.get(ref.o), ne = sk.entities.get(ref.n);
  if (o.type === 'line') {
    const m = mid(P(ne.p1), P(ne.p2));
    const a = P(o.p1), u = norm(sub(P(o.p2), a));
    const h = cross(u, sub(m, a)) >= 0 ? 1 : -1;               // côté de la copie
    const pos = add(m, mul(perp(u), h * gap));
    sk.addConstraint('dimLineLine', [o.id, ne.id], { value: d, pos });
  } else {
    const c = P(ne.c);
    const r = ne.type === 'circle' ? ne.r : dist(c, P(ne.s));
    const dir = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    sk.addConstraint('dimRadius', [ne.id], { value: r, pos: add(c, mul(dir, r + gap)) });
  }
  for (const q of pairs) if (q !== ref) sk.addConstraint('offsetEq', [ref.o, ref.n, q.o, q.n]);
}

// ---------- Miroir ----------
/** Symétrique de p par rapport à la droite (a, b). */
export function reflectPoint(p, a, b) {
  const u = norm(sub(b, a));
  const v = sub(p, a);
  const along = mul(u, dot(v, u));
  return add(a, sub(mul(along, 2), v));
}
/**
 * Copie symétrique des entités (et points isolés) ids par rapport à la ligne axisId.
 * Les points situés sur l'axe sont partagés ; les autres reçoivent une relation de symétrie.
 */
export function mirrorEntities(sk, ids, axisId) {
  const axis = sk.entities.get(axisId);
  if (!axis || axis.type !== 'line') return { ok: false, msg: 'L\'axe doit être une ligne' };
  const A = P(sk, axis.p1), B = P(sk, axis.p2);
  const map = new Map();
  // relate = false : point placé par symétrie mais sans relation (centre d'arc, déterminé par ses extrémités et le rayon)
  const mapPoint = (pid, relate = true) => {
    if (map.has(pid)) return map.get(pid);
    const p = P(sk, pid);
    const q = reflectPoint(p, A, B);
    let out;
    if (pid === axis.p1 || pid === axis.p2 || dist(p, q) < tolOf(p, A, B) * 100) out = pid;
    else {
      const np = sk.addPoint(q.x, q.y);
      if (p.sketchPoint) np.sketchPoint = true;
      if (relate) sk.addConstraint('symmetric', [pid, np.id, axisId]);
      out = np.id;
    }
    map.set(pid, out);
    return out;
  };
  const made = [];
  for (const id of ids) {
    if (id === axisId) continue;
    const e = sk.entities.get(id);
    if (!e) { if (sk.points.has(id) && P(sk, id).sketchPoint) mapPoint(id); continue; }
    const opt = { construction: e.construction };
    if (e.type === 'line') made.push(sk.addLine(mapPoint(e.p1), mapPoint(e.p2), opt).id);
    else if (e.type === 'circle') { const c = sk.addCircle(mapPoint(e.c), e.r, opt); sk.addConstraint('equal', [e.id, c.id]); made.push(c.id); }
    else {
      const s = mapPoint(e.s), en = mapPoint(e.e);
      const centerFree = !map.has(e.c) && s !== e.s && en !== e.e;
      const a = sk.addArc(mapPoint(e.c, !centerFree), s, en, !e.ccw, opt);
      if (centerFree) sk.addConstraint('equal', [e.id, a.id]);
      made.push(a.id);
    }
  }
  if (!made.length && !map.size) return { ok: false, msg: 'Rien à copier' };
  return { ok: true, ids: made };
}

// ---------- Déplacer / copier / pivoter ----------
/** Points des éléments sélectionnés (entités et points isolés). */
function selectionParts(sk, ids) {
  const ents = new Set(), pts = new Set();
  for (const id of ids) {
    const e = sk.entities.get(id);
    if (e) { ents.add(id); for (const pid of sk.entityPointIds(e)) pts.add(pid); }
    else if (sk.points.has(id)) pts.add(id);
  }
  return { ents, pts };
}
const rotateAbout = (c, ang) => {
  const co = Math.cos(ang), si = Math.sin(ang);
  return (p) => { const v = sub(p, c); return { x: c.x + v.x * co - v.y * si, y: c.y + v.x * si + v.y * co }; };
};
export const translation = (delta) => (p) => add(p, delta);
export const rotation = rotateAbout;

/** Relations H / V après une rotation : gardées (½ tour), échangées (¼ de tour) ou retirées. */
function fixOrientation(sk, k, ang) {
  const q = ang / (Math.PI / 2);
  const nearInt = Math.abs(q - Math.round(q)) < 1e-9;
  const swap = { horizontal: 'vertical', vertical: 'horizontal', dimHorizontal: 'dimVertical', dimVertical: 'dimHorizontal' };
  if (!(k.type in swap)) return true;
  if (!nearInt) return false;
  if (Math.abs(Math.round(q)) % 2 === 1) k.type = swap[k.type];
  return true;
}

/**
 * Applique la transformation f aux éléments ids.
 * copy : crée des copies (avec leurs relations internes) au lieu de déplacer.
 * Déplacement : les points partagés avec des éléments non sélectionnés sont dédoublés, et les relations
 * entre la sélection et le reste sont retirées (comme SOLIDWORKS sans « garder les relations »).
 * @returns {{ok:boolean, msg?:string, moved:Set<string>, ids:string[]}}
 */
export function transformSelection(sk, ids, f, { copy = false, angle = 0 } = {}) {
  const { ents, pts } = selectionParts(sk, ids);
  if (!ents.size && !pts.size) return { ok: false, msg: 'Sélection vide' };
  const map = new Map();       // ancien point → point déplacé / copié
  const inSel = (r) => ents.has(r) || pts.has(r);
  if (copy) {
    for (const pid of pts) {
      const p = P(sk, pid);
      const np = sk.addPoint(p.x, p.y);
      if (p.sketchPoint) np.sketchPoint = true;
      map.set(pid, np.id);
    }
    const emap = new Map();
    for (const eid of ents) {
      const e = sk.entities.get(eid);
      const ne = { ...e, id: sk.newId('e') };
      for (const key of ['p1', 'p2', 'c', 's', 'e']) if (key in ne && map.has(ne[key])) ne[key] = map.get(ne[key]);
      sk.entities.set(ne.id, ne);
      emap.set(eid, ne.id);
    }
    const mapRef = (r) => emap.get(r) || map.get(r) || null;
    for (const k of [...sk.constraints.values()]) {
      if (k.ord || k.type === 'ordZero' || k.type === 'fixed') continue;
      if (!k.refs.every(inSel)) continue;
      const refs = k.refs.map(mapRef);
      if (refs.some((r) => !r)) continue;
      const { id: _id, type, refs: _refs, broken: _b, ...rest } = k;
      const nk = sk.addConstraint(type, refs, rest);
      if (nk.pos) nk.pos = f(nk.pos);
      if (angle && !fixOrientation(sk, nk, angle)) sk.constraints.delete(nk.id);
    }
    for (const nid of map.values()) Object.assign(P(sk, nid), f(P(sk, nid)));
    return { ok: true, moved: new Set(map.values()), ids: [...emap.values()] };
  }
  // déplacement : dédoublement des points partagés avec le reste (ou de l'origine)
  for (const pid of pts) {
    const shared = pid === ORIGIN_ID || sk.entitiesOfPoint(pid).some((e) => !ents.has(e.id));
    if (shared && !ids.includes(pid)) {
      const p = P(sk, pid);
      const np = sk.addPoint(p.x, p.y);
      map.set(pid, np.id);
      for (const eid of ents) { const e = sk.entities.get(eid); for (const key of ['p1', 'p2', 'c', 's', 'e']) if (e[key] === pid) e[key] = np.id; }
    } else if (pid !== ORIGIN_ID) map.set(pid, pid);
  }
  const moved = new Set(map.values());
  const inMoved = (r) => ents.has(r) || moved.has(r);
  for (const [cid, k] of sk.constraints) {
    // la référence d'une cote ordinale n'est pas déplacée avec elle
    if (k.ord || k.type === 'ordZero') { if (k.refs.some(inMoved)) sk.constraints.delete(cid); continue; }
    const some = k.refs.some(inMoved), all = k.refs.every(inMoved);
    if (some && !all) { sk.constraints.delete(cid); continue; }
    if (all) {
      if (k.pos) k.pos = f(k.pos);
      if (angle && !fixOrientation(sk, k, angle)) sk.constraints.delete(cid);
    }
  }
  for (const pid of moved) Object.assign(P(sk, pid), f(P(sk, pid)));
  return { ok: true, moved, ids: [...ents] };
}

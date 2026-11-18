// Solveur de contraintes géométriques 2D — couche indépendante de l'interface.
// Méthode : Gauss-Newton amorti, pas de norme minimale pondérée (la géométrie bouge
// le moins possible), jacobienne par différences finies sur les seules variables utiles.
// L'analyse (degrés de liberté, redondances) se fait par orthogonalisation des lignes
// de la jacobienne.

const DIM_TYPES = new Set(['dimLength', 'dimDistance', 'dimHorizontal', 'dimVertical', 'dimPointLine', 'dimLineLine', 'dimAngle', 'dimRadius']);
export const isDimension = (k) => DIM_TYPES.has(k.type);
/** Cotes affichées sur le dessin : les cotes, plus la cote 0 des cotes ordinales (sans équation). */
export const isAnnotation = (k) => DIM_TYPES.has(k.type) || k.type === 'ordZero';

const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

/** Construit le système : variables (coordonnées des points libres, rayons) et équations. */
export function buildSystem(sk) {
  const fixedPts = new Set();
  const fixedR = new Set();
  for (const p of sk.points.values()) if (p.fixed) fixedPts.add(p.id);
  for (const k of sk.constraints.values()) {
    if (k.type !== 'fixed') continue;
    for (const r of k.refs) {
      const e = sk.entities.get(r);
      if (e) { for (const pid of sk.entityPointIds(e)) fixedPts.add(pid); if (e.type === 'circle') fixedR.add(e.id); }
      else if (sk.points.has(r)) fixedPts.add(r);
    }
  }
  const pIndex = new Map();
  const rIndex = new Map();
  let n = 0;
  for (const p of sk.points.values()) if (!fixedPts.has(p.id)) { pIndex.set(p.id, n); n += 2; }
  for (const e of sk.entities.values()) if (e.type === 'circle' && !fixedR.has(e.id)) rIndex.set(e.id, n++);
  const x = new Float64Array(n);
  const read = () => {
    for (const [pid, i] of pIndex) { const p = sk.points.get(pid); x[i] = p.x; x[i + 1] = p.y; }
    for (const [eid, i] of rIndex) x[i] = sk.entities.get(eid).r;
  };
  const write = () => {
    for (const [pid, i] of pIndex) { const p = sk.points.get(pid); p.x = x[i]; p.y = x[i + 1]; }
    for (const [eid, i] of rIndex) sk.entities.get(eid).r = Math.abs(x[i]);
  };
  read();

  const X = (pid) => { const i = pIndex.get(pid); return i === undefined ? sk.points.get(pid).x : x[i]; };
  const Y = (pid) => { const i = pIndex.get(pid); return i === undefined ? sk.points.get(pid).y : x[i + 1]; };
  const eqs = [];
  const add = (cid, pids, rids, f) => {
    const vs = new Set();
    for (const pid of pids) { const i = pIndex.get(pid); if (i !== undefined) { vs.add(i); vs.add(i + 1); } }
    for (const rid of rids) { const j = rIndex.get(rid); if (j !== undefined) vs.add(j); }
    eqs.push({ cid, vars: [...vs], f });
  };
  const ent = (id) => sk.entities.get(id);
  const isLine = (e) => e && e.type === 'line';
  const isCurve = (e) => e && (e.type === 'circle' || e.type === 'arc');
  const dist = (a, b) => Math.hypot(X(a) - X(b), Y(a) - Y(b));
  // distance signée du point p à la droite (a, b)
  const sdist = (p, a, b) => {
    const ux = X(b) - X(a), uy = Y(b) - Y(a);
    const l = Math.hypot(ux, uy) || 1;
    return ((X(p) - X(a)) * uy - (Y(p) - Y(a)) * ux) / l;
  };
  const curve = (e) => (e.type === 'circle'
    ? { c: e.c, pids: [e.c], rids: [e.id], r: () => { const j = rIndex.get(e.id); return j === undefined ? e.r : x[j]; } }
    : { c: e.c, pids: [e.c, e.s], rids: [], r: () => dist(e.s, e.c) });
  const sinAng = (l1, l2) => {
    const ax = X(l1.p2) - X(l1.p1), ay = Y(l1.p2) - Y(l1.p1), bx = X(l2.p2) - X(l2.p1), by = Y(l2.p2) - Y(l2.p1);
    return (ax * by - ay * bx) / ((Math.hypot(ax, ay) || 1) * (Math.hypot(bx, by) || 1));
  };
  const cosAng = (l1, l2) => {
    const ax = X(l1.p2) - X(l1.p1), ay = Y(l1.p2) - Y(l1.p1), bx = X(l2.p2) - X(l2.p1), by = Y(l2.p2) - Y(l2.p1);
    return (ax * bx + ay * by) / ((Math.hypot(ax, ay) || 1) * (Math.hypot(bx, by) || 1));
  };

  // Contrainte interne des arcs : les deux extrémités sont au même rayon.
  for (const e of sk.entities.values()) {
    if (e.type === 'arc') add(null, [e.c, e.s, e.e], [], () => dist(e.e, e.c) - dist(e.s, e.c));
  }

  for (const k of sk.constraints.values()) {
    // pilotée : mesure seule ; en conflit (broken) : valeur impossible, gardée en rouge mais hors calcul
    if (k.driven || k.broken) continue;
    const r = k.refs;
    const A = ent(r[0]), B = ent(r[1]);
    const P0 = sk.points.has(r[0]), P1 = sk.points.has(r[1]);
    switch (k.type) {
      case 'horizontal':
      case 'vertical': {
        const h = k.type === 'horizontal';
        let a, b;
        if (isLine(A)) { a = A.p1; b = A.p2; } else if (P0 && P1) { a = r[0]; b = r[1]; } else break;
        add(k.id, [a, b], [], h ? () => Y(b) - Y(a) : () => X(b) - X(a));
        break;
      }
      case 'coincident': {
        if (P0 && P1) { add(k.id, [r[0], r[1]], [], () => X(r[0]) - X(r[1])); add(k.id, [r[0], r[1]], [], () => Y(r[0]) - Y(r[1])); }
        else if (P0 && isLine(B)) add(k.id, [r[0], B.p1, B.p2], [], () => sdist(r[0], B.p1, B.p2));
        else if (P0 && isCurve(B)) { const c = curve(B); add(k.id, [r[0], ...c.pids], c.rids, () => dist(r[0], c.c) - c.r()); }
        break;
      }
      case 'midpoint': {
        if (!(P0 && isLine(B))) break;
        add(k.id, [r[0], B.p1, B.p2], [], () => X(r[0]) - (X(B.p1) + X(B.p2)) / 2);
        add(k.id, [r[0], B.p1, B.p2], [], () => Y(r[0]) - (Y(B.p1) + Y(B.p2)) / 2);
        break;
      }
      case 'collinear': {
        if (!(isLine(A) && isLine(B))) break;
        add(k.id, [A.p1, A.p2, B.p1], [], () => sdist(B.p1, A.p1, A.p2));
        add(k.id, [A.p1, A.p2, B.p2], [], () => sdist(B.p2, A.p1, A.p2));
        break;
      }
      case 'parallel': if (isLine(A) && isLine(B)) add(k.id, [A.p1, A.p2, B.p1, B.p2], [], () => sinAng(A, B)); break;
      case 'perpendicular': if (isLine(A) && isLine(B)) add(k.id, [A.p1, A.p2, B.p1, B.p2], [], () => cosAng(A, B)); break;
      case 'tangent': {
        const L = isLine(A) ? A : isLine(B) ? B : null;
        if (L) {
          const Cv = isCurve(A) ? A : isCurve(B) ? B : null;
          if (!Cv) break;
          const c = curve(Cv);
          add(k.id, [L.p1, L.p2, ...c.pids], c.rids, () => Math.abs(sdist(c.c, L.p1, L.p2)) - c.r());
        } else if (isCurve(A) && isCurve(B)) {
          const c1 = curve(A), c2 = curve(B);
          const d0 = dist(c1.c, c2.c), r1 = c1.r(), r2 = c2.r();
          const external = Math.abs(d0 - (r1 + r2)) <= Math.abs(d0 - Math.abs(r1 - r2));
          add(k.id, [...c1.pids, ...c2.pids], [...c1.rids, ...c2.rids],
            external ? () => dist(c1.c, c2.c) - (c1.r() + c2.r()) : () => dist(c1.c, c2.c) - Math.abs(c1.r() - c2.r()));
        }
        break;
      }
      case 'concentric': {
        if (!(isCurve(A) && isCurve(B)) || A.c === B.c) break;
        add(k.id, [A.c, B.c], [], () => X(A.c) - X(B.c));
        add(k.id, [A.c, B.c], [], () => Y(A.c) - Y(B.c));
        break;
      }
      case 'equal': {
        if (isLine(A) && isLine(B)) add(k.id, [A.p1, A.p2, B.p1, B.p2], [], () => dist(A.p1, A.p2) - dist(B.p1, B.p2));
        else if (isCurve(A) && isCurve(B)) { const c1 = curve(A), c2 = curve(B); add(k.id, [...c1.pids, ...c2.pids], [...c1.rids, ...c2.rids], () => c1.r() - c2.r()); }
        break;
      }
      case 'symmetric': {
        const L = ent(r[2]);
        if (!(P0 && P1 && isLine(L))) break;
        const pids = [r[0], r[1], L.p1, L.p2];
        add(k.id, pids, [], () => {
          const ux = X(L.p2) - X(L.p1), uy = Y(L.p2) - Y(L.p1), l = Math.hypot(ux, uy) || 1;
          const mx = (X(r[0]) + X(r[1])) / 2 - X(L.p1), my = (Y(r[0]) + Y(r[1])) / 2 - Y(L.p1);
          return (mx * uy - my * ux) / l;
        });
        add(k.id, pids, [], () => {
          const ux = X(L.p2) - X(L.p1), uy = Y(L.p2) - Y(L.p1), l = Math.hypot(ux, uy) || 1;
          return ((X(r[1]) - X(r[0])) * ux + (Y(r[1]) - Y(r[0])) * uy) / l;
        });
        break;
      }
      case 'dimLength': if (isLine(A)) add(k.id, [A.p1, A.p2], [], () => dist(A.p1, A.p2) - k.value); break;
      case 'dimDistance': if (P0 && P1) add(k.id, [r[0], r[1]], [], () => dist(r[0], r[1]) - k.value); break;
      case 'dimHorizontal':
      case 'dimVertical': {
        if (!(P0 && P1)) break;
        const C = k.type === 'dimHorizontal' ? X : Y;
        const sgn = C(r[1]) - C(r[0]) < 0 ? -1 : 1;     // sens actuel (inversable)
        add(k.id, [r[0], r[1]], [], () => sgn * (C(r[1]) - C(r[0])) - k.value);
        break;
      }
      case 'dimPointLine':
      case 'dimLineLine': {
        const L = k.type === 'dimPointLine' ? B : A;
        const p = k.type === 'dimPointLine' ? r[0] : (isLine(B) ? B.p1 : null);
        if (!isLine(L) || !p || !sk.points.has(p)) break;
        const sgn = sdist(p, L.p1, L.p2) < 0 ? -1 : 1;
        add(k.id, [p, L.p1, L.p2], [], () => sgn * sdist(p, L.p1, L.p2) - k.value);
        break;
      }
      case 'dimAngle': {
        if (!(isLine(A) && isLine(B))) break;
        const s1 = k.s1 || 1, s2 = k.s2 || 1, sgn = k.sgn || 1;
        add(k.id, [A.p1, A.p2, B.p1, B.p2], [], () => {
          const ax = s1 * (X(A.p2) - X(A.p1)), ay = s1 * (Y(A.p2) - Y(A.p1)), bx = s2 * (X(B.p2) - X(B.p1)), by = s2 * (Y(B.p2) - Y(B.p1));
          return wrapPi(sgn * Math.atan2(ax * by - ay * bx, ax * bx + ay * by) - k.value);
        });
        break;
      }
      case 'dimRadius': if (isCurve(A)) { const c = curve(A); add(k.id, c.pids, c.rids, () => c.r() - k.value); } break;
      default: break;
    }
  }
  return { n, x, eqs, pIndex, rIndex, read, write };
}

function residuals(sys) {
  const F = new Float64Array(sys.eqs.length);
  for (let i = 0; i < F.length; i++) F[i] = sys.eqs[i].f();
  return F;
}
function norm2(F) { let s = 0; for (let i = 0; i < F.length; i++) s += F[i] * F[i]; return s; }
function maxAbs(F) { let s = 0; for (let i = 0; i < F.length; i++) s = Math.max(s, Math.abs(F[i])); return s; }

/** Jacobienne creuse : pour chaque équation, dérivées par rapport à ses seules variables. */
function jacobian(sys) {
  const { x, eqs } = sys;
  const rows = new Array(eqs.length);
  for (let i = 0; i < eqs.length; i++) {
    const e = eqs[i];
    const d = new Float64Array(e.vars.length);
    for (let j = 0; j < e.vars.length; j++) {
      const v = e.vars[j], x0 = x[v];
      const h = 1e-6 * Math.max(1, Math.abs(x0));
      x[v] = x0 + h; const f1 = e.f();
      x[v] = x0 - h; const f0 = e.f();
      x[v] = x0;
      d[j] = (f1 - f0) / (2 * h);
    }
    rows[i] = d;
  }
  return rows;
}

/** Résout A y = b (A symétrique, m×m, tableau de Float64Array) par élimination avec pivot. */
function solveLinear(A, b) {
  const m = b.length;
  for (let c = 0; c < m; c++) {
    let piv = c, best = Math.abs(A[c][c]);
    for (let r = c + 1; r < m; r++) { const v = Math.abs(A[r][c]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-300) return null;
    if (piv !== c) { const t = A[c]; A[c] = A[piv]; A[piv] = t; const tb = b[c]; b[c] = b[piv]; b[piv] = tb; }
    const Ac = A[c], d = Ac[c];
    for (let r = c + 1; r < m; r++) {
      const Ar = A[r], f = Ar[c] / d;
      if (f === 0) continue;
      for (let k = c; k < m; k++) Ar[k] -= f * Ac[k];
      b[r] -= f * b[c];
    }
  }
  const y = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = b[r];
    const Ar = A[r];
    for (let k = r + 1; k < m; k++) s -= Ar[k] * y[k];
    y[r] = s / Ar[r];
  }
  return y;
}

/**
 * Résout les contraintes (modifie les points en place si succès).
 * @param {object} [options] weights : Map<idPoint|idCercle, coût> — plus le coût est grand, moins l'élément bouge.
 * @returns {{ok:boolean, residual:number, iterations:number}}
 */
export function solve(sk, options = {}) {
  const tol = options.tol ?? 1e-8;
  const maxIter = options.maxIter ?? 80;
  const sys = buildSystem(sk);
  const { x, eqs, n } = sys;
  const m = eqs.length;
  if (m === 0) return { ok: true, residual: 0, iterations: 0 };
  let F = residuals(sys);
  if (n === 0) return { ok: maxAbs(F) < 1e-6, residual: maxAbs(F), iterations: 0 };
  const winv = new Float64Array(n).fill(1);
  if (options.weights) {
    for (const [id, w] of options.weights) {
      const i = sys.pIndex.get(id);
      if (i !== undefined) { winv[i] = 1 / w; winv[i + 1] = 1 / w; }
      const j = sys.rIndex.get(id);
      if (j !== undefined) winv[j] = 1 / w;
    }
  }
  let it = 0, stall = 0;
  let cost = norm2(F);
  for (; it < maxIter; it++) {
    if (maxAbs(F) < tol) break;
    const J = jacobian(sys);
    // A = J W⁻¹ Jᵀ
    const dense = new Array(m);
    for (let i = 0; i < m; i++) { const row = new Float64Array(n); const e = eqs[i]; for (let j = 0; j < e.vars.length; j++) row[e.vars[j]] = J[i][j]; dense[i] = row; }
    const A = new Array(m);
    let maxDiag = 0;
    for (let i = 0; i < m; i++) A[i] = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const ei = eqs[i], Ji = J[i];
      for (let k = i; k < m; k++) {
        const dk = dense[k];
        let s = 0;
        for (let j = 0; j < ei.vars.length; j++) { const v = ei.vars[j]; s += Ji[j] * winv[v] * dk[v]; }
        A[i][k] = s; A[k][i] = s;
      }
      maxDiag = Math.max(maxDiag, A[i][i]);
    }
    // amortissement relatif à chaque équation (sinon les équations d'angle, de petite
    // échelle, sont « écrasées » quand seules des variables lourdes peuvent les satisfaire)
    for (let i = 0; i < m; i++) A[i][i] += 1e-10 * A[i][i] + 1e-14 * maxDiag + 1e-30;
    const b = new Float64Array(m);
    for (let i = 0; i < m; i++) b[i] = -F[i];
    const y = solveLinear(A, b);
    if (!y) break;
    const dx = new Float64Array(n);
    for (let i = 0; i < m; i++) { const e = eqs[i]; for (let j = 0; j < e.vars.length; j++) dx[e.vars[j]] += J[i][j] * y[i]; }
    for (let v = 0; v < n; v++) dx[v] *= winv[v];
    // recherche linéaire
    const x0 = Float64Array.from(x);
    let alpha = 1, improved = false, F1 = F, c1 = cost;
    for (let ls = 0; ls < 8; ls++) {
      for (let v = 0; v < n; v++) x[v] = x0[v] + alpha * dx[v];
      F1 = residuals(sys); c1 = norm2(F1);
      if (c1 < cost || c1 < tol * tol) { improved = true; break; }
      alpha /= 2;
    }
    if (!improved) { x.set(x0); break; }
    if (cost - c1 < 1e-14 * Math.max(1, cost)) stall++; else stall = 0;
    F = F1; cost = c1;
    if (stall >= 3) break;
  }
  const residual = maxAbs(F);
  const ok = residual < Math.max(tol, 1e-6) && Array.prototype.every.call(x, Number.isFinite);
  if (ok) sys.write();
  return { ok, residual, iterations: it };
}

/**
 * Analyse : état de chaque point, entité et contrainte, degrés de liberté restants.
 * - 'under' : peut encore bouger ; 'full' : entièrement contraint ; 'over' : sur-contraint.
 * Une ligne est 'full' dès que sa direction et sa position sont bloquées (même si sa longueur est libre).
 */
export function analyze(sk) {
  const points = new Map();
  const entities = new Map();
  const constraints = new Map();
  const sys = buildSystem(sk);
  const { n, eqs } = sys;
  const J = jacobian(sys);
  const F = residuals(sys);
  const Q = [];               // base orthonormale de l'espace des lignes
  const over = new Set();
  for (let i = 0; i < eqs.length; i++) {
    const e = eqs[i];
    if (Math.abs(F[i]) > 1e-5) { if (e.cid) over.add(e.cid); }
    const row = new Float64Array(n);
    let nr = 0;
    for (let j = 0; j < e.vars.length; j++) { row[e.vars[j]] = J[i][j]; nr += J[i][j] * J[i][j]; }
    nr = Math.sqrt(nr);
    if (nr < 1e-12) { if (e.cid) over.add(e.cid); continue; }   // équation sans effet : redondante
    for (let v = 0; v < n; v++) row[v] /= nr;
    for (let pass = 0; pass < 2; pass++) {
      for (const q of Q) {
        let d = 0;
        for (let v = 0; v < n; v++) d += q[v] * row[v];
        if (d !== 0) for (let v = 0; v < n; v++) row[v] -= d * q[v];
      }
    }
    let rr = 0;
    for (let v = 0; v < n; v++) rr += row[v] * row[v];
    rr = Math.sqrt(rr);
    if (rr < 1e-6) { if (e.cid) over.add(e.cid); continue; }     // dépend des précédentes : redondante
    for (let v = 0; v < n; v++) row[v] /= rr;
    Q.push(row);
  }
  // contraintes en conflit (valeur impossible gardée) : sur-contraintes jusqu'à résolution
  for (const k of sk.constraints.values()) if (k.broken && !k.driven) over.add(k.id);
  for (const cid of over) constraints.set(cid, 'over');

  /** Vrai si la combinaison linéaire (liste [indice, coeff]) est entièrement bloquée. */
  const locked = (terms) => {
    let a2 = 0;
    for (const [, c] of terms) a2 += c * c;
    if (a2 < 1e-18) return true;
    let q2 = 0;
    for (const q of Q) { let d = 0; for (const [i, c] of terms) d += q[i] * c; q2 += d * d; }
    return a2 - q2 < 1e-6 * a2;
  };
  const pointLocked = (pid) => {
    const i = sys.pIndex.get(pid);
    if (i === undefined) return true;
    return locked([[i, 1]]) && locked([[i + 1, 1]]);
  };
  const overRefs = new Set();
  for (const cid of over) { const k = sk.constraints.get(cid); if (k) for (const r of k.refs) overRefs.add(r); }

  for (const p of sk.points.values()) points.set(p.id, overRefs.has(p.id) ? 'over' : pointLocked(p.id) ? 'full' : 'under');
  for (const e of sk.entities.values()) {
    let full;
    if (e.type === 'line') {
      const a = sk.points.get(e.p1), b = sk.points.get(e.p2);
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l < 1e-9) full = pointLocked(e.p1) && pointLocked(e.p2);
      else {
        const nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;   // normale : mouvement qui change direction ou position
        full = [e.p1, e.p2].every((pid) => { const i = sys.pIndex.get(pid); return i === undefined || locked([[i, nx], [i + 1, ny]]); });
      }
    } else if (e.type === 'circle') {
      const j = sys.rIndex.get(e.id);
      full = pointLocked(e.c) && (j === undefined || locked([[j, 1]]));
    } else {
      full = pointLocked(e.c) && pointLocked(e.s) && pointLocked(e.e);
    }
    // rouge si l'entité est concernée par un conflit (directement, ou par ses deux extrémités pour une ligne)
    const inConflict = overRefs.has(e.id) || (e.type === 'line' && overRefs.has(e.p1) && overRefs.has(e.p2));
    entities.set(e.id, inConflict ? 'over' : full ? 'full' : 'under');
  }
  let state = 'empty';
  if (!sk.isEmpty()) {
    if (over.size > 0) state = 'over';
    else state = [...entities.values()].every((s) => s === 'full') && [...points.values()].every((s) => s === 'full') ? 'full' : 'under';
  }
  return { points, entities, constraints, state, dof: n - Q.length, over };
}

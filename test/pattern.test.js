// Répétitions linéaire et circulaire.
import { Sketch, ORIGIN_ID } from '../js/core/model.js';
import { solve, analyze, solveHeld } from '../js/core/solver.js';
import { patternEntities, setPatternCount } from '../js/core/edit.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; print('FAIL: ' + m); } else print('ok: ' + m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/** Rectangle 10 × 5 à l'origine, coté, avec un congé (arc) dans un coin remplacé par un arc simple. */
function rect(sk, x0 = 0, y0 = 0) {
  const a = x0 === 0 && y0 === 0 ? ORIGIN_ID : sk.addPoint(x0, y0).id;
  const b = sk.addPoint(x0 + 10, y0).id, c = sk.addPoint(x0 + 10, y0 + 5).id, d = sk.addPoint(x0, y0 + 5).id;
  const L = [sk.addLine(a, b), sk.addLine(b, c), sk.addLine(c, d), sk.addLine(d, a)];
  sk.addConstraint('horizontal', [L[0].id]); sk.addConstraint('horizontal', [L[2].id]);
  sk.addConstraint('vertical', [L[1].id]); sk.addConstraint('vertical', [L[3].id]);
  const w = sk.addConstraint('dimLength', [L[0].id], { value: 10 });
  sk.addConstraint('dimLength', [L[1].id], { value: 5 });
  return { L, w };
}

// linéaire, liée, avec cote : tout est contraint ; les occurrences suivent l'original et la cote
{
  const sk = new Sketch();
  const { L, w } = rect(sk);
  const ci = sk.addCircle(sk.addPoint(5, 2.5).id, 1.5);
  sk.addConstraint('dimRadius', [ci.id], { value: 1.5 });
  sk.addConstraint('coincident', [ci.c, L[0].id]);
  // centre du cercle : cote horizontale et verticale depuis l'origine
  sk.constraints.delete([...sk.constraints.values()].pop().id);
  sk.addConstraint('dimHorizontal', [ORIGIN_ID, ci.c], { value: 5 });
  sk.addConstraint('dimVertical', [ORIGIN_ID, ci.c], { value: 2.5 });
  const axis = sk.addLine(sk.addPoint(0, -10).id, sk.addPoint(40, -10).id, { construction: true });
  sk.addConstraint('horizontal', [axis.id]);
  const ids = [...L.map((l) => l.id), ci.id];
  const r = patternEntities(sk, ids, { kind: 'lin', dir: { x: 1, y: 0 }, axis: axis.id, step: 15, count: 3, link: true, dim: true });
  ok(r.ok && r.ids.length === 10, 'linéaire : 2 occurrences de plus (10 entités) ' + (r.msg || ''));
  ok(solve(sk).ok, 'résolu');
  let an = analyze(sk);
  ok(an.over.size === 0, 'pas de sur-contrainte (' + [...an.over].map((id) => sk.constraints.get(id)?.type).join(',') + ')');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  ok(pat && pat.n === 3, 'relation de répétition');
  const sp = [...sk.constraints.values()].find((k) => k.type === 'dimDistance');
  ok(sp && near(sp.value, 15), 'cote d\'espacement 15');
  // toutes les occurrences sont entièrement contraintes (l'axe horizontal donne la direction ; sa hauteur est libre)
  an = analyze(sk);
  const copies = r.ids.map((id) => an.entities.get(id));
  ok(copies.every((s) => s === 'full'), 'occurrences entièrement contraintes (' + copies.join(',') + ')');
  // l'espacement change : toutes les occurrences suivent
  sp.value = 20;
  ok(solve(sk).ok, 'espacement 20 résolu');
  const c2 = sk.entities.get(r.ids[9]);
  ok(near(sk.points.get(c2.c).x, 45) && near(c2.r, 1.5), 'dernier cercle à x = 45, R1,5');
  // la largeur de l'original change : les occurrences suivent
  w.value = 12;
  ok(solve(sk).ok, 'largeur 12 résolue');
  const l2 = sk.entities.get(r.ids[5]);    // 1re ligne de la 2e copie
  const a2 = sk.points.get(l2.p1), b2 = sk.points.get(l2.p2);
  ok(near(Math.abs(b2.x - a2.x), 12) && near(a2.x, 40), 'les copies suivent la largeur (12) et le pas (20)');
  { const an2 = analyze(sk); ok(an2.over.size === 0, 'toujours sans sur-contrainte (' + [...an2.over].map((id) => sk.constraints.get(id)?.type).join(',') + ')'); }
}

// circulaire, liée, avec cote d'angle, sélection avec un arc
{
  const sk = new Sketch();
  const C = ORIGIN_ID;
  const p1 = sk.addPoint(20, 0), p2 = sk.addPoint(30, 0), p3 = sk.addPoint(30, 5);
  const l1 = sk.addLine(p1.id, p2.id);
  const arc = sk.addArc(p2.id, sk.addPoint(35, 0).id, p3.id, true);    // quart d'arc de rayon 5 autour de p2
  sk.addConstraint('fixed', [l1.id]); sk.addConstraint('fixed', [arc.id]);
  const r = patternEntities(sk, [l1.id, arc.id], { kind: 'circ', center: C, step: Math.PI / 3, count: 6, link: true, dim: true });
  ok(r.ok && r.ids.length === 10, 'circulaire : 5 occurrences de plus ' + (r.msg || ''));
  ok(solve(sk).ok, 'résolu');
  let an = analyze(sk);
  ok(an.over.size === 0, 'pas de sur-contrainte avec les arcs (' + [...an.over].map((id) => sk.constraints.get(id)?.type).join(',') + ')');
  const dimA = [...sk.constraints.values()].find((k) => k.type === 'dimAngle');
  ok(dimA && near(dimA.value, Math.PI / 3), 'cote d\'angle 60°');
  // 3e occurrence (i = 3) : rotation de 180°
  const l3 = sk.entities.get(r.ids[4]);
  ok(near(sk.points.get(l3.p1).x, -20) && near(sk.points.get(l3.p1).y, 0, 1e-6), 'occurrence à 180° : (-20, 0)');
  dimA.value = Math.PI / 4;
  { const s4 = solve(sk); ok(s4.ok, 'angle 45° résolu ' + JSON.stringify(s4)); }
  const l5 = sk.entities.get(r.ids[6]);
  const q = sk.points.get(l5.p1);
  ok(near(Math.abs(Math.atan2(q.y, q.x)), Math.PI), 'occurrence 4 à 4 × 45° = 180°');
  ok(analyze(sk).over.size === 0, 'toujours sans sur-contrainte');
  // supprimer une copie : la relation disparaît, le reste est intact
  sk.removeEntity(r.ids[2]);
  sk.cleanupDegenerate();
  ok(![...sk.constraints.values()].some((k) => k.type === 'pattern') && solve(sk).ok, 'copie supprimée : relation retirée');
}

// sans espacement constant : simples copies avec leurs relations internes, sans cotes
{
  const sk = new Sketch();
  const { L } = rect(sk);
  const r = patternEntities(sk, L.map((l) => l.id), { kind: 'lin', dir: { x: 0, y: 1 }, step: 8, count: 2, link: false });
  ok(r.ok && r.ids.length === 4, 'copies libres');
  const types = [...sk.constraints.values()].map((k) => k.type);
  ok(types.filter((t) => t === 'horizontal').length === 4 && types.filter((t) => t === 'dimLength').length === 2 && !types.includes('pattern'), 'relations copiées, cotes non copiées, pas de relation de répétition');
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'pas de sur-contrainte');
}

// espacement constant linéaire : 1600 mm, 8 occurrences → pas de 1600 / 7 ; cote du total ; le nombre change
{
  const sk = new Sketch();
  const { L } = rect(sk);
  const total = 1600, n = 8;
  const r = patternEntities(sk, L.map((l) => l.id), { kind: 'lin', dir: { x: 1, y: 0 }, step: total / (n - 1), count: n, link: true, dim: true, even: true });
  ok(r.ok, 'espacement constant créé');
  ok(solve(sk).ok, 'résolu');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  const dim = sk.constraints.get(pat.dim);
  ok(pat.even && pat.dimTotal && dim && near(dim.value, 1600), 'cote du total 1600 (' + (dim && dim.value) + ')');
  const lastX = () => sk.points.get(pat.refs[(pat.n - 1) * pat.m + (pat.r || 0)]).x;
  ok(near(lastX(), 1600), 'dernière occurrence à 1600');
  ok(analyze(sk).over.size === 0, 'pas de sur-contrainte');
  // 8 → 5 occurrences : la longueur totale est gardée, pas de 400
  let s = setPatternCount(sk, pat.id, 5);
  ok(s.ok && solve(sk).ok, '5 occurrences ' + (s.msg || ''));
  ok(pat.n === 5 && near(lastX(), 1600), 'toujours 1600 au bout (' + lastX() + ')');
  ok(sk.entities.size === 4 * 5, '20 lignes (' + sk.entities.size + ')');
  ok(near(sk.points.get(pat.refs[1 * pat.m + (pat.r || 0)]).x, 400), 'pas de 400');
  ok(analyze(sk).over.size === 0, 'pas de sur-contrainte après réduction');
  // 5 → 11
  s = setPatternCount(sk, pat.id, 11);
  ok(s.ok && solve(sk).ok && near(lastX(), 1600) && sk.entities.size === 44, '11 occurrences, 1600 au bout');
  ok(near(sk.points.get(pat.refs[1 * pat.m + (pat.r || 0)]).x, 160), 'pas de 160');
  ok(analyze(sk).over.size === 0 && [...analyze(sk).entities.values()].every((v) => v !== 'over'), 'sans sur-contrainte après ajout');
  // la cote du total change : tout suit
  sk.constraints.get(pat.dim).value = 2000;
  ok(solve(sk).ok && near(lastX(), 2000), 'total 2000');
}

// espacement fixe : changer le nombre garde le pas
{
  const sk = new Sketch();
  const { L } = rect(sk);
  const ci = sk.addCircle(sk.addPoint(5, 2.5).id, 1);
  const ids = [...L.map((l) => l.id), ci.id];
  const r = patternEntities(sk, ids, { kind: 'lin', dir: { x: 0, y: 1 }, step: 12, count: 3, link: true, dim: false });
  ok(r.ok && solve(sk).ok, 'répétition verticale');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  ok(setPatternCount(sk, pat.id, 6).ok && solve(sk).ok, '6 occurrences');
  const circles = [...sk.entities.values()].filter((e) => e.type === 'circle');
  ok(circles.length === 6 && near(Math.max(...circles.map((c) => sk.points.get(c.c).y)), 2.5 + 5 * 12), 'cercles jusqu\'à y = 62,5');
  sk.addConstraint('dimRadius', [ci.id], { value: 2 });
  ok(solve(sk).ok && circles.every((c) => near(c.r, 2, 1e-5)), 'les nouveaux cercles suivent le rayon');
  ok(setPatternCount(sk, pat.id, 2).ok && solve(sk).ok && sk.entities.size === 10, 'retour à 2 occurrences (' + sk.entities.size + ')');
  ok(analyze(sk).over.size === 0, 'pas de sur-contrainte');
}

// circulaire, tour complet : 360° / n ; le nombre change, l'angle suit
{
  const sk = new Sketch();
  const p1 = sk.addPoint(20, 0), p2 = sk.addPoint(30, 0);
  const l1 = sk.addLine(p1.id, p2.id);
  sk.addConstraint('fixed', [l1.id]);
  const r = patternEntities(sk, [l1.id], { kind: 'circ', center: ORIGIN_ID, step: 2 * Math.PI / 9, count: 9, link: true, dim: true, even: true, full: true });
  ok(r.ok && solve(sk).ok, 'tour complet, 9 occurrences');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  const dim = sk.constraints.get(pat.dim);
  ok(pat.full && !pat.dimTotal && near(dim.value, 2 * Math.PI / 9), 'cote de 40°');
  ok(setPatternCount(sk, pat.id, 6).ok && solve(sk).ok, '6 occurrences');
  ok(near(sk.constraints.get(pat.dim).value, Math.PI / 3), 'cote à 60°');
  const q = sk.points.get(pat.refs[3 * pat.m]);
  ok(near(q.x, -20, 1e-6) && near(q.y, 0, 1e-6), 'occurrence 3 à 180°');
  ok(analyze(sk).over.size === 0, 'pas de sur-contrainte');
  ok(setPatternCount(sk, pat.id, 12).ok && solve(sk).ok && near(sk.constraints.get(pat.dim).value, Math.PI / 6), '12 occurrences, 30°');
  ok(analyze(sk).over.size === 0, 'pas de sur-contrainte (12)');
}

// circulaire, angle total 90° sur 4 occurrences : cote du total, pas de 30°
{
  const sk = new Sketch();
  const p1 = sk.addPoint(20, 0), p2 = sk.addPoint(30, 0);
  const l1 = sk.addLine(p1.id, p2.id);
  sk.addConstraint('fixed', [l1.id]);
  const r = patternEntities(sk, [l1.id], { kind: 'circ', center: ORIGIN_ID, step: Math.PI / 6, count: 4, link: true, dim: true, even: true });
  ok(r.ok && solve(sk).ok, 'angle total 90°');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  ok(pat.dimTotal && near(sk.constraints.get(pat.dim).value, Math.PI / 2), 'cote 90°');
  ok(setPatternCount(sk, pat.id, 7).ok && solve(sk).ok, '7 occurrences');
  const last = sk.points.get(pat.refs[6 * pat.m + (pat.r || 0)]);
  ok(near(Math.atan2(last.y, last.x), Math.PI / 2, 1e-6), 'dernière toujours à 90°');
  ok(near(Math.atan2(sk.points.get(pat.refs[1 * pat.m + (pat.r || 0)]).y, sk.points.get(pat.refs[1 * pat.m + (pat.r || 0)]).x), Math.PI / 12, 1e-6), 'pas de 15°');
  ok(analyze(sk).over.size === 0, 'pas de sur-contrainte');
  ok(setPatternCount(sk, pat.id, 3).ok && solve(sk).ok, '3 occurrences');
  const last3 = sk.points.get(pat.refs[2 * pat.m + (pat.r || 0)]);
  ok(near(Math.atan2(last3.y, last3.x), Math.PI / 2, 1e-6) && analyze(sk).over.size === 0, 'dernière à 90°, sans sur-contrainte');
}

// linéaire liée, espacement constant, sans cote : on tient la 4ᵉ occurrence au doigt, le pas suit
{
  const sk = new Sketch();
  const { L } = rect(sk);
  sk.addConstraint('fixed', [ORIGIN_ID]);
  const r = patternEntities(sk, L.map((l) => l.id), { kind: 'lin', dir: { x: 1, y: 0 }, step: 20, count: 5, link: true, dim: false, even: true });
  ok(r.ok && solve(sk).ok, 'linéaire espacement constant sans cote');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  for (const [i, j] of [[3, 1], [1, 2], [4, 3]]) {
    const pid = pat.refs[i * pat.m + j];
    const q = sk.points.get(pid);
    const o = sk.points.get(pat.refs[j]);
    const tx = q.x + 6 * i, ty = q.y;
    q.x = tx; q.y = ty;
    const res = solve(sk, { weights: new Map([[pid, 1e6]]), keep: new Set([pid]), maxIter: 40 });
    const st = (sk.points.get(pat.refs[pat.m + j]).x - o.x);
    ok(res.ok && near(q.x, tx, 1e-4) && near(sk.points.get(pat.refs[2 * pat.m + j]).x - o.x, 2 * st, 1e-6), `occurrence ${i} tenue au doigt : pas ${st.toFixed(3)}`);
  }
}

// circulaire en tour complet sans cote : l'angle reste libre (occurrences sous-contraintes) ; tirer une occurrence
// change l'angle entre occurrences, l'original reste en place
{
  const sk = new Sketch();
  const p1 = sk.addPoint(20, 0), p2 = sk.addPoint(30, 0);
  const l1 = sk.addLine(p1.id, p2.id);
  sk.addConstraint('fixed', [l1.id]);
  const r = patternEntities(sk, [l1.id], { kind: 'circ', center: ORIGIN_ID, step: 2 * Math.PI / 6, count: 6, link: true, dim: false, even: true, full: true });
  ok(r.ok && solve(sk).ok, 'tour complet sans cote');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  const an = analyze(sk);
  ok(an.state === 'under' && an.entities.get(r.ids[0]) === 'under', 'occurrences sous-contraintes (bleues) : ' + an.state);
  const pid = pat.refs[3 * pat.m + 0];
  const q = sk.points.get(pid);
  const a0 = Math.atan2(q.y, q.x);
  const R = Math.hypot(q.x, q.y);
  q.x = R * Math.cos(a0 + 0.3); q.y = R * Math.sin(a0 + 0.3);
  // comme au doigt : tenue ferme, sinon (original bloqué, grand pas) tenue souple
  const res = solveHeld(sk, { weights: new Map([[pid, 1e6]]), keep: new Set([pid]), maxIter: 40 });
  ok(res.ok, 'occurrence 3 tournée de 0,3 rad');
  const o = sk.points.get(pat.refs[0]), c1 = sk.points.get(pat.refs[pat.m]);
  const step = Math.atan2(o.x * c1.y - o.y * c1.x, o.x * c1.x + o.y * c1.y);
  ok(near(step, Math.PI / 3 + 0.1, 1e-6), 'angle entre occurrences : 60° + 0,1 rad (' + step + ')');
  ok(near(o.x, 20) && near(o.y, 0), 'l\'original reste en place');
}

// circulaire en copies libres : les relations H / V suivent la rotation (copies non déformées), cote possible
{
  const sk = new Sketch();
  const a = sk.addPoint(20, 0).id, b = sk.addPoint(30, 0).id, c = sk.addPoint(30, 5).id, d = sk.addPoint(20, 5).id;
  const L = [sk.addLine(a, b), sk.addLine(b, c), sk.addLine(c, d), sk.addLine(d, a)];
  sk.addConstraint('horizontal', [L[0].id]); sk.addConstraint('horizontal', [L[2].id]);
  sk.addConstraint('vertical', [L[1].id]); sk.addConstraint('vertical', [L[3].id]);
  const before = new Map([...sk.points.values()].map((p) => [p.id, [p.x, p.y]]));
  const r = patternEntities(sk, L.map((l) => l.id), { kind: 'circ', center: ORIGIN_ID, step: Math.PI / 4, count: 8, link: false, dim: true });
  ok(r.ok && r.ids.length === 28, 'copies libres : 7 rectangles');
  const pos = new Map([...sk.points.values()].map((p) => [p.id, [p.x, p.y]]));
  ok(solve(sk).ok, 'résolu');
  let moved = 0;
  for (const p of sk.points.values()) { const v = pos.get(p.id); if (Math.hypot(p.x - v[0], p.y - v[1]) > 1e-6) moved++; }
  ok(moved === 0, 'aucune copie redressée (' + moved + ' points ont bougé)');
  const types = [...sk.constraints.values()].map((k) => k.type);
  ok(types.filter((t) => t === 'parallel').length === 4 && types.filter((t) => t === 'perpendicular').length === 8, 'H / V remplacées par parallèles et perpendiculaires (sauf ½ tour et ¼ de tour)');
  ok(types.filter((t) => t === 'horizontal').length === 8 && types.filter((t) => t === 'vertical').length === 8, 'H / V gardées ou échangées à 90°, 180°, 270°');
  const dim = [...sk.constraints.values()].find((k) => k.type === 'dimAngle');
  ok(dim && near(dim.value, Math.PI / 4), 'cote d\'angle de 45° sur la copie libre');
  ok(analyze(sk).over.size === 0, 'pas de sur-contrainte');
  void before;
}

// direction tirée (bout d'une ligne à angle coté, doigt hors de la ligne) : avec le pas gardé (hold),
// les occurrences d'une répétition sans cote ne bougent pas ; sans, le pas dérivait
{
  const sk = new Sketch();
  const b = sk.addPoint(50, 0).id, e = sk.addPoint(100, 8).id;
  const l1 = sk.addLine(ORIGIN_ID, b), l2 = sk.addLine(b, e);
  sk.addConstraint('horizontal', [l1.id]);
  sk.addConstraint('dimLength', [l1.id], { value: 50 });
  sk.addConstraint('dimAngle', [l1.id, l2.id], { value: Math.atan2(8, 50) });
  const q = [[10, 10], [16, 10], [16, 18], [10, 18]].map(([x, y]) => sk.addPoint(x, y).id);
  const L = [0, 1, 2, 3].map((i) => sk.addLine(q[i], q[(i + 1) % 4]));
  const h = Math.hypot(50, 8);
  const r = patternEntities(sk, L.map((l) => l.id), { kind: 'lin', dir: { x: 50 / h, y: 8 / h }, axis: l2.id, step: 9, count: 4, link: true, dim: false });
  ok(r.ok && solve(sk).ok, 'répétition le long d\'une ligne à 9°');
  const pat = [...sk.constraints.values()].find((k) => k.type === 'pattern');
  const copies = pat.refs.slice(pat.m, pat.m * pat.n);
  const before = copies.map((id) => ({ ...sk.points.get(id) }));
  const moved = () => Math.max(...copies.map((id, i) => Math.hypot(sk.points.get(id).x - before[i].x, sk.points.get(id).y - before[i].y)));
  const p = sk.points.get(e);
  for (let t = 0; t < 20; t++) {
    p.x = 90 + t; p.y = 20 - t * 0.3;
    ok(solve(sk, { weights: new Map([[e, 0.01]]), maxIter: 40, hold: new Set([pat.id]) }).ok || t > 0, '');
  }
  ok(moved() < 1e-6, 'pas gardé : occurrences immobiles (' + moved().toExponential(2) + ')');
  ok(near(Math.atan2(p.y, p.x - 50), Math.atan2(8, 50), 1e-9), 'le bout reste sur la ligne à 9°');
  // la ligne pivote (angle coté changé) : les occurrences tournent avec, même espacement
  const k = [...sk.constraints.values()].find((c) => c.type === 'dimAngle');
  const o0 = sk.points.get(pat.refs[0]), c1 = sk.points.get(pat.refs[pat.m]);
  const len = Math.hypot(c1.x - o0.x, c1.y - o0.y);
  k.value = 20 * Math.PI / 180;
  ok(solve(sk, { hold: new Set([pat.id]) }).ok, 'angle 20° résolu');
  ok(near(Math.hypot(c1.x - o0.x, c1.y - o0.y), len, 1e-6) && near(Math.atan2(c1.y - o0.y, c1.x - o0.x), k.value, 1e-6), 'occurrences tournées, même espacement');
}

print(fails ? `${fails} ÉCHEC(S)` : 'TOUS LES TESTS PASSENT');
if (fails) throw new Error('tests');

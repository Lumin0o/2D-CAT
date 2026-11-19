// Répétitions linéaire et circulaire.
import { Sketch, ORIGIN_ID } from '../js/core/model.js';
import { solve, analyze } from '../js/core/solver.js';
import { patternEntities } from '../js/core/edit.js';

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

print(fails ? `${fails} ÉCHEC(S)` : 'TOUS LES TESTS PASSENT');
if (fails) throw new Error('tests');

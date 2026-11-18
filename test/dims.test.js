// Cotes horizontales / verticales, orientation, rectangle par le centre, pilotée / pilotante.
import { Sketch, ORIGIN_ID } from '../js/core/model.js';
import { solve, analyze } from '../js/core/solver.js';
import { dimOrientation, dimMeasure, dimLayout } from '../js/render/annotations.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; print('FAIL: ' + m); } else print('ok: ' + m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// orientation selon la position
{
  const a = { x: 0, y: 0 }, b = { x: 10, y: 10 };
  ok(dimOrientation(a, b, { x: 5, y: 20 }) === 'h', 'au-dessus → horizontale');
  ok(dimOrientation(a, b, { x: -8, y: 5 }) === 'v', 'à gauche → verticale');
  ok(dimOrientation(a, b, { x: -5, y: 15 }) === 'aligned', 'dans le coin → parallèle');
  ok(dimOrientation(a, b, { x: 3, y: 6 }) === 'aligned', 'à côté du segment → parallèle');
}

// cote horizontale / verticale dans le solveur
{
  const sk = new Sketch();
  const p = sk.addPoint(10, 10);
  const l = sk.addLine(ORIGIN_ID, p.id);
  const h = sk.addConstraint('dimHorizontal', [ORIGIN_ID, p.id], { value: 10, pos: { x: 5, y: 20 } });
  const v = sk.addConstraint('dimVertical', [ORIGIN_ID, p.id], { value: 10, pos: { x: -5, y: 5 } });
  let an = analyze(sk);
  ok(an.state === 'full' && an.dof === 0, 'ligne cotée en horizontal + vertical : entièrement contrainte');
  h.value = 30; v.value = 5;
  ok(solve(sk).ok && near(p.x, 30) && near(p.y, 5), 'cotes H=30, V=5 appliquées');
  ok(near(dimMeasure(sk, h), 30) && near(dimMeasure(sk, v), 5), 'mesure des cotes H/V');
  const lay = dimLayout(sk, h);
  ok(lay && near(lay.segs[0][0].y, 20) && near(lay.segs[0][1].y, 20) && near(lay.ext[1][1].x, 30), 'mise en page de la cote horizontale');
  // inversion : le point passe de l'autre côté, la cote reste satisfaite
  p.x = -30;
  ok(solve(sk).ok && near(p.x, -30), 'cote H inversée : x = -30 conservé');
  const d = sk.addConstraint('dimLength', [l.id], { value: 1 });
  ok(analyze(sk).over.has(d.id), 'longueur en plus de H et V : redondante');
}

// rectangle par le centre à l'origine : le centre reste au centre quand on change les cotes
{
  const sk = new Sketch();
  const c = [[-20, -10], [20, -10], [20, 10], [-20, 10]].map(([x, y]) => sk.addPoint(x, y));
  const L = [0, 1, 2, 3].map((i) => sk.addLine(c[i].id, c[(i + 1) % 4].id));
  sk.addConstraint('horizontal', [L[0].id]); sk.addConstraint('vertical', [L[1].id]);
  sk.addConstraint('horizontal', [L[2].id]); sk.addConstraint('vertical', [L[3].id]);
  const d1 = sk.addLine(c[0].id, c[2].id, { construction: true });
  sk.addLine(c[1].id, c[3].id, { construction: true });
  sk.addConstraint('midpoint', [ORIGIN_ID, d1.id]);
  const w = sk.addConstraint('dimLength', [L[0].id], { value: 40 });
  const hgt = sk.addConstraint('dimLength', [L[1].id], { value: 20 });
  let an = analyze(sk);
  ok(an.state === 'full' && an.over.size === 0, 'rectangle centré coté : entièrement contraint, sans redondance');
  w.value = 100; hgt.value = 50;
  ok(solve(sk, { weights: new Map([[c[0].id, 1e6]]) }).ok, 'nouvelles cotes 100 × 50');
  ok(near(c[0].x, -50) && near(c[2].x, 50) && near(c[0].y, -25) && near(c[2].y, 25), 'le centre reste à l\'origine (' + c[0].x.toFixed(2) + ',' + c[0].y.toFixed(2) + ')');
}

// pilotée → pilotante : redondante, signalée
{
  const sk = new Sketch();
  const p = sk.addPoint(30, 0);
  const l = sk.addLine(ORIGIN_ID, p.id);
  sk.addConstraint('horizontal', [l.id]);
  sk.addConstraint('dimLength', [l.id], { value: 30 });
  const d2 = sk.addConstraint('dimHorizontal', [ORIGIN_ID, p.id], { value: 30, driven: true });
  ok(analyze(sk).state === 'full', 'cote pilotée : pas de sur-contrainte');
  delete d2.driven;
  const an = analyze(sk);
  ok(an.state === 'over' && an.over.has(d2.id), 'rendue pilotante : esquisse sur-contrainte, cote en rouge');
}

// régression : cote entre deux parallèles modifiée alors que le point lourd doit bouger (iPhone, 17/11)
{
  const sk = new Sketch();
  const P3 = sk.addPoint(800, 0), P2 = sk.addPoint(800, 1000), P1 = sk.addPoint(-631, 1822), P4 = sk.addPoint(-631, 779), P5 = sk.addPoint(0, 415);
  const L = [[ORIGIN_ID, P3.id], [P3.id, P2.id], [P2.id, P1.id], [P1.id, P4.id], [P4.id, P5.id], [P5.id, ORIGIN_ID]].map(([a, b]) => sk.addLine(a, b));
  sk.addConstraint('horizontal', [L[0].id]); sk.addConstraint('vertical', [L[1].id]); sk.addConstraint('vertical', [L[3].id]); sk.addConstraint('vertical', [L[5].id]);
  sk.addConstraint('parallel', [L[2].id, L[4].id]);
  solve(sk);
  sk.addConstraint('dimLength', [L[0].id], { value: 800 }); sk.addConstraint('dimLength', [L[1].id], { value: 1000 }); sk.addConstraint('dimLength', [L[2].id], { value: 1650 });
  const ax = P1.x - P2.x, ay = P1.y - P2.y, by = P3.y - P2.y;
  sk.addConstraint('dimAngle', [L[2].id, L[1].id], { value: 2 * Math.PI / 3, s1: 1, s2: -1, sgn: Math.atan2(ax * by, ay * by) < 0 ? -1 : 1 });
  solve(sk);
  const d = sk.addConstraint('dimLineLine', [L[4].id, L[2].id], { value: 907.64 });
  solve(sk);
  ok(analyze(sk).state === 'full', 'esquisse de l\'iPhone : entièrement contrainte, pas sur-contrainte');
  let all = true;
  for (const v of [300, 500, 1000, 1200]) { d.value = v; all = all && solve(sk, { weights: new Map([[L[4].p1, 1e6]]) }).ok; }
  ok(all, 'cote entre parallèles modifiable (300, 500, 1000, 1200)');
}

// cote en conflit (valeur impossible gardée) : hors calcul, en rouge avec ce qu'elle cote
{
  const sk = new Sketch();
  const p = sk.addPoint(20, 30);
  const l = sk.addLine(ORIGIN_ID, p.id);
  sk.addConstraint('dimHorizontal', [ORIGIN_ID, p.id], { value: 20 });
  const len = sk.addConstraint('dimLength', [l.id], { value: 10, broken: true });   // 10 < 20 : impossible
  ok(solve(sk).ok, 'la cote en conflit ne bloque pas le calcul du reste');
  const an = analyze(sk);
  ok(an.state === 'over' && an.constraints.get(len.id) === 'over' && an.entities.get(l.id) === 'over', 'cote en conflit et ligne en rouge, esquisse sur-contrainte');
  const h = sk.addConstraint('dimHorizontal', [ORIGIN_ID, p.id], { value: 1, driven: true });
  ok(analyze(sk).constraints.get(h.id) !== 'over', 'une cote pilotée n\'est pas en conflit');
}

// cote par deux points en conflit : la ligne entre ces points passe aussi en rouge
{
  const sk = new Sketch();
  const p = sk.addPoint(20, 30);
  const l = sk.addLine(ORIGIN_ID, p.id);
  sk.addConstraint('dimLength', [l.id], { value: 10 });
  sk.addConstraint('dimHorizontal', [ORIGIN_ID, p.id], { value: 20, broken: true });
  ok(analyze(sk).entities.get(l.id) === 'over', 'cote horizontale en conflit : la ligne est rouge');
}

// cote ordinale parallèle à une ligne inclinée (dimAlong) : mesure, solveur, inversion, mise en page
{
  const sk = new Sketch();
  const a = sk.addPoint(0, 0), b = sk.addPoint(40, 30);        // ligne à 36,87° (direction 0,8 ; 0,6)
  const L = sk.addLine(a.id, b.id);
  a.fixed = true; b.fixed = true;                                // la ligne ne bouge pas
  const q = sk.addPoint(10, 20);
  const z = sk.addConstraint('ordZero', [a.id, L.id], { axis: 'a', pos: { x: 3, y: -4 } });
  const k = sk.addConstraint('dimAlong', [a.id, q.id, L.id], { ord: z.id, pos: null });
  k.value = dimMeasure(sk, k);
  ok(near(k.value, 20), 'mesure le long de la ligne : 10×0,8 + 20×0,6 = 20');
  k.value = 30;
  ok(solve(sk).ok && near(dimMeasure(sk, k), 30), 'cote parallèle modifiée à 30');
  const lay = dimLayout(sk, k);
  // ligne de cote : parallèle à la ligne, passant par la position de la cote 0 (côté opposé à q)
  const u = { x: 0.8, y: 0.6 };
  const foot = lay.ext[0][1];
  ok(lay && near((foot.x - 3) * u.y - (foot.y + 4) * u.x, 0, 1e-6), 'pied de la ligne d\'attache sur la ligne de la cote 0');
  ok(near(lay.textOut.x * u.x + lay.textOut.y * u.y, 0) && lay.rot !== 0, 'texte le long de la ligne d\'attache (tourné)');
  const zl = dimLayout(sk, z);
  ok(zl && near(zl.ext[0][1].x, 3) && near(zl.ext[0][1].y, -4), 'cote 0 au pied de la référence');
  // inversion (comme l'app) : le point passe de l'autre côté de la référence, la valeur est gardée
  const pq = sk.points.get(q.id);
  const t = pq.x * u.x + pq.y * u.y;
  pq.x -= 2 * t * u.x; pq.y -= 2 * t * u.y;
  ok(solve(sk).ok && near(dimMeasure(sk, k), 30) && pq.x * u.x + pq.y * u.y < 0, 'cote parallèle inversée');
  // cotes ordinales horizontales : rendu inchangé (texte vertical)
  const z2 = sk.addConstraint('ordZero', [a.id], { axis: 'h', pos: { x: 0, y: 50 } });
  const lh = dimLayout(sk, z2);
  ok(near(lh.rot, -Math.PI / 2) && near(lh.textOut.y, 1), 'cote 0 horizontale : texte vertical, vers le haut');
  const z3 = sk.addConstraint('ordZero', [a.id], { axis: 'v', pos: { x: -20, y: 0 } });
  const lv = dimLayout(sk, z3);
  ok(lv.rot === 0 && near(lv.textOut.x, -1), 'cote 0 verticale : texte horizontal, vers la gauche');
  sk.removeEntity(L.id);
  sk.cleanupDegenerate();
  ok(!sk.constraints.has(z.id) && !sk.constraints.has(k.id), 'ligne supprimée : cote 0 parallèle et ses cotes supprimées');
}

print(fails ? `${fails} ÉCHEC(S)` : 'TOUS LES TESTS PASSENT');
if (fails) throw new Error('tests');

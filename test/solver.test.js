import { Sketch, ORIGIN_ID } from '../js/core/model.js';
import { solve, analyze } from '../js/core/solver.js';
import { evaluate } from '../js/core/calc.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; print('FAIL: ' + m); } else print('ok: ' + m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const len = (sk, l) => { const a = sk.points.get(l.p1), b = sk.points.get(l.p2); return Math.hypot(a.x - b.x, a.y - b.y); };

function rect(sk, x0, y0, x1, y1, originCorner = false) {
  const p = [originCorner ? sk.points.get(ORIGIN_ID) : sk.addPoint(x0, y0), sk.addPoint(x1, y0), sk.addPoint(x1, y1), sk.addPoint(x0, y1)];
  const l = [0, 1, 2, 3].map((i) => sk.addLine(p[i].id, p[(i + 1) % 4].id));
  sk.addConstraint('horizontal', [l[0].id]); sk.addConstraint('vertical', [l[1].id]);
  sk.addConstraint('horizontal', [l[2].id]); sk.addConstraint('vertical', [l[3].id]);
  return { p, l };
}

// --- Exemple du cahier des charges : ligne verticale, point bas fixe ---
{
  const sk = new Sketch();
  const a = sk.addPoint(10, 10), b = sk.addPoint(10, 40);
  const l = sk.addLine(a.id, b.id);
  sk.addConstraint('vertical', [l.id]);
  sk.addConstraint('fixed', [a.id]);
  let an = analyze(sk);
  ok(an.points.get(a.id) === 'full' && an.entities.get(l.id) === 'full' && an.points.get(b.id) === 'under', 'ligne verticale, bas fixe : bas noir, ligne noire, haut bleu');
  ok(an.state === 'under' && an.dof === 1, 'esquisse sous-contrainte, 1 degré de liberté');
  sk.addConstraint('dimLength', [l.id], { value: 30 });
  an = analyze(sk);
  ok(an.state === 'full' && an.points.get(b.id) === 'full', 'longueur cotée : tout passe en noir');
}

// --- Rectangle : cotation → entièrement contraint ---
{
  const sk = new Sketch();
  const { l } = rect(sk, 0, 0, 40, 20, true);
  let an = analyze(sk);
  ok(an.state === 'under' && an.dof === 2 && an.over.size === 0, 'rectangle à l\'origine : 2 degrés de liberté (' + an.dof + ')');
  ok(an.entities.get(l[0].id) === 'full' && an.entities.get(l[3].id) === 'full' && an.entities.get(l[1].id) === 'under', 'côtés sur les axes noirs, côté droit bleu');
  const d1 = sk.addConstraint('dimLength', [l[0].id], { value: 40 });
  sk.addConstraint('dimLength', [l[1].id], { value: 20 });
  an = analyze(sk);
  ok(an.state === 'full' && an.dof === 0, 'rectangle coté : entièrement contraint');
  // modification par un calcul : 120/2+5
  d1.value = evaluate('120/2+5').value;
  const r = solve(sk, { weights: new Map([[l[0].p1, 1e6]]) });
  ok(r.ok && near(len(sk, l[0]), 65) && near(len(sk, l[2]), 65) && near(len(sk, l[1]), 20), 'longueur 120/2+5 = 65 : la forme se met à jour ensemble');
  // cote redondante
  const d3 = sk.addConstraint('dimLength', [l[2].id], { value: 65 });
  an = analyze(sk);
  ok(an.constraints.get(d3.id) === 'over', 'cote redondante détectée (→ cote pilotée)');
  d3.driven = true;
  ok(analyze(sk).state === 'full', 'cote pilotée : plus de sur-contrainte');
}

// --- Modification impossible ---
{
  const sk = new Sketch();
  const a = sk.addPoint(0, 10), b = sk.addPoint(30, 10);
  const l = sk.addLine(a.id, b.id);
  sk.addConstraint('fixed', [a.id]); sk.addConstraint('fixed', [b.id]);
  const tmp = sk.addConstraint('dimLength', [l.id], { value: 50 });
  const r = solve(sk);
  ok(!r.ok && near(len(sk, l), 30), 'deux extrémités fixes : modification refusée, géométrie intacte');
  ok(analyze(sk).constraints.get(tmp.id) === 'over', 'contrainte en conflit marquée sur-contrainte');
}

// --- Ligne libre : l'origine (premier point) reste fixe ---
{
  const sk = new Sketch();
  const a = sk.addPoint(5, 5), b = sk.addPoint(35, 45);
  const l = sk.addLine(a.id, b.id);
  sk.addConstraint('dimLength', [l.id], { value: 100 });
  const r = solve(sk, { weights: new Map([[a.id, 1e6]]) });
  ok(r.ok && near(len(sk, l), 100) && near(a.x, 5, 1e-3) && near(a.y, 5, 1e-3) && near(b.x, 65, 1e-2) && near(b.y, 85, 1e-2), 'ligne libre : premier point fixe, même direction (' + b.x.toFixed(3) + ', ' + b.y.toFixed(3) + ')');
}

// --- Relations diverses ---
{
  const sk = new Sketch();
  const l1 = sk.addLine(sk.addPoint(0, 0).id, sk.addPoint(50, 5).id);
  const l2 = sk.addLine(sk.addPoint(10, 20).id, sk.addPoint(60, 40).id);
  sk.addConstraint('parallel', [l1.id, l2.id]);
  ok(solve(sk).ok, 'parallèle : résolu');
  const d = (l) => { const a = sk.points.get(l.p1), b = sk.points.get(l.p2); return [b.x - a.x, b.y - a.y]; };
  let [ax, ay] = d(l1), [bx, by] = d(l2);
  ok(near(ax * by - ay * bx, 0, 1e-4), 'parallèle : produit vectoriel nul');
  sk.addConstraint('equal', [l1.id, l2.id]);
  ok(solve(sk).ok && near(len(sk, l1), len(sk, l2)), 'égale : mêmes longueurs');
  const l3 = sk.addLine(sk.addPoint(80, 0).id, sk.addPoint(90, 30).id);
  sk.addConstraint('perpendicular', [l1.id, l3.id]);
  ok(solve(sk).ok, 'perpendiculaire : résolu');
  [ax, ay] = d(l1); [bx, by] = d(l3);
  ok(near(ax * bx + ay * by, 0, 1e-4), 'perpendiculaire : produit scalaire nul');
  // conflit : parallèle + perpendiculaire sur la même paire
  const bad = sk.addConstraint('perpendicular', [l1.id, l2.id]);
  ok(!solve(sk).ok && analyze(sk).state === 'over', 'parallèle + perpendiculaire : sur-contraint');
  sk.removeConstraint(bad.id);
  ok(analyze(sk).state === 'under', 'relation supprimée : retour à la normale');
}
{
  const sk = new Sketch();
  const c = sk.addPoint(50, 50);
  const circle = sk.addCircle(c.id, 20);
  const l = sk.addLine(sk.addPoint(0, 10).id, sk.addPoint(100, 15).id);
  sk.addConstraint('tangent', [l.id, circle.id]);
  ok(solve(sk).ok, 'tangente ligne-cercle : résolu');
  const a = sk.points.get(l.p1), b = sk.points.get(l.p2);
  const dist = Math.abs((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
  ok(near(dist, circle.r, 1e-5), 'tangente : distance centre-droite = rayon');
  sk.addConstraint('dimRadius', [circle.id], { value: 12.5 });
  ok(solve(sk, { weights: new Map([[c.id, 1e6]]) }).ok && near(circle.r, 12.5), 'rayon coté 12,5');
  const p = sk.addPoint(40, 80);
  const l2 = sk.addLine(p.id, sk.addPoint(90, 90).id);
  sk.addConstraint('coincident', [p.id, circle.id]);
  ok(solve(sk).ok && near(Math.hypot(p.x - c.x, p.y - c.y), circle.r, 1e-6), 'point sur cercle');
  const m = sk.addPoint(1, 1); sk.addLine(m.id, sk.addPoint(-20, -30).id);
  sk.addConstraint('midpoint', [m.id, l2.id]);
  ok(solve(sk).ok && near(m.x, (sk.points.get(l2.p1).x + sk.points.get(l2.p2).x) / 2) , 'point milieu');
  const c2 = sk.addPoint(120, 50); const circle2 = sk.addCircle(c2.id, 8);
  sk.addConstraint('concentric', [circle.id, circle2.id]);
  ok(solve(sk).ok && near(c2.x, c.x) && near(c2.y, c.y), 'concentrique');
}
{
  // arc : contrainte interne + rayon + tangence à une ligne partagée
  const sk = new Sketch();
  const a = sk.addPoint(0, 0), b = sk.addPoint(40, 0);
  const l = sk.addLine(a.id, b.id);
  const c = sk.addPoint(40, 20), e = sk.addPoint(60, 20);
  const arc = sk.addArc(c.id, b.id, e.id, true);
  sk.addConstraint('tangent', [arc.id, l.id]);
  sk.addConstraint('dimRadius', [arc.id], { value: 30 });
  const r = solve(sk, { weights: new Map([[a.id, 1e6], [b.id, 1e6]]) });
  const rs = Math.hypot(b.x - c.x, b.y - c.y), re = Math.hypot(e.x - c.x, e.y - c.y);
  ok(r.ok && near(rs, 30, 1e-5) && near(re, 30, 1e-5), 'arc tangent : rayon 30 aux deux extrémités');
  // angle
  const sk2 = new Sketch();
  const o = sk2.points.get(ORIGIN_ID);
  const l1 = sk2.addLine(o.id, sk2.addPoint(50, 0).id); sk2.addConstraint('horizontal', [l1.id]);
  const l2 = sk2.addLine(o.id, sk2.addPoint(40, 30).id);
  sk2.addConstraint('dimAngle', [l1.id, l2.id], { value: Math.PI / 3, s1: 1, s2: 1, sgn: 1 });
  ok(solve(sk2).ok, 'angle : résolu');
  const q = sk2.points.get(l2.p2);
  ok(near(Math.atan2(q.y, q.x), Math.PI / 3, 1e-6), 'angle de 60° entre deux lignes');
  // symétrie
  const sk3 = new Sketch();
  const ax = sk3.addLine(sk3.points.get(ORIGIN_ID).id, sk3.addPoint(0, 50).id); sk3.addConstraint('vertical', [ax.id]);
  const p1 = sk3.addPoint(-20, 10), p2 = sk3.addPoint(25, 14);
  sk3.addLine(p1.id, p2.id);
  sk3.addConstraint('symmetric', [p1.id, p2.id, ax.id]);
  ok(solve(sk3).ok && near(p1.x, -p2.x, 1e-6) && near(p1.y, p2.y, 1e-6), 'symétrique par rapport à une ligne');
}

// --- Glissement : le point glissé suit le doigt, le reste s'adapte ---
{
  const sk = new Sketch();
  const { p, l } = rect(sk, 0, 0, 40, 20, true);
  p[2].x = 70; p[2].y = 45;
  const r = solve(sk, { weights: new Map([[p[2].id, 1e6]]) });
  ok(r.ok && near(p[2].x, 70, 1e-3) && near(p[2].y, 45, 1e-3) && near(p[1].x, 70, 1e-3) && near(p[1].y, 0) && near(p[3].x, 0) && near(p[3].y, 45, 1e-3), 'glisser un coin : rectangle redimensionné');
  sk.addConstraint('dimLength', [l[0].id], { value: 70 }); sk.addConstraint('dimLength', [l[1].id], { value: 45 });
  p[2].x = 100; p[2].y = 100;
  const r2 = solve(sk, { weights: new Map([[p[2].id, 1e6]]) });
  ok(r2.ok && near(p[2].x, 70, 1e-4) && near(p[2].y, 45, 1e-4), 'rectangle entièrement contraint : le coin revient à sa place');
}

// --- Performance ---
{
  const sk = new Sketch();
  for (let i = 0; i < 25; i++) rect(sk, i * 10, i * 7, i * 10 + 30, i * 7 + 20);
  const t0 = Date.now();
  for (let k = 0; k < 20; k++) { const p = [...sk.points.values()][5]; p.x += 1; solve(sk, { weights: new Map([[p.id, 1e6]]) }); }
  const dt = (Date.now() - t0) / 20;
  const t1 = Date.now(); analyze(sk); const da = Date.now() - t1;
  ok(dt < 30, `100 lignes / 100 relations : ${dt.toFixed(1)} ms par résolution, analyse ${da} ms`);
}

// --- Calculatrice ---
{
  const ev = (s, c) => evaluate(s, c);
  ok(ev('120/2+5').value === 65, '120/2+5 = 65');
  ok(ev('120÷2+5').value === 65 && ev('3×(2+4)').value === 18 && ev('2−5').value === -3, 'symboles × ÷ −');
  ok(ev('12,5+0,5').value === 13, 'virgule décimale');
  ok(!ev('5+').ok && !ev('').ok && !ev('(2+3').ok && !ev('2 3').ok && !ev('1/0').ok && !ev('2,,3').ok, 'formules invalides refusées');
  ok(near(ev('2π').value, 2 * Math.PI) && ev('√16').value === 4 && ev('3²').value === 9 && ev('50%').value === 0.5 && ev('-(3+2)').value === -5, 'π √ ² % et signe');
  ok(ev('Ans+1', { ans: 41 }).value === 42 && !ev('Ans').ok, 'Ans');
  ok(ev('3/16').value === 0.1875 && ev('1 3/16').value === 1.1875, 'fractions et nombres mixtes');
  ok(ev('5\' 3 1/2"', { footFactor: 12, inchFactor: 1 }).value === 63.5, '5\' 3 1/2" = 63,5 pouces');
  ok(ev('2√9').value === 6 && ev('2(3+1)').value === 8, 'multiplication implicite');
}

print(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
if (fails) throw new Error('tests en échec');

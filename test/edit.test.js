// Opérations d'édition de l'étape 3 (js/core/edit.js), vérifiées avec le solveur.
import { Sketch, ORIGIN_ID } from '../js/core/model.js';
import { solve, analyze } from '../js/core/solver.js';
import { dist } from '../js/core/geom.js';
import { trimAt, extendAt, filletLines, chamferLines, cornerLines, chainFrom, offsetSide, offsetChain, mirrorEntities, transformSelection, translation, rotation } from '../js/core/edit.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; print('FAIL: ' + m); } else print('ok: ' + m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const P = (sk, id) => sk.points.get(id);

/** Rectangle (x0,y0)-(x1,y1) : 4 lignes reliées, 2 H + 2 V. */
function rect(sk, x0, y0, x1, y1, origin = false) {
  const a = origin ? ORIGIN_ID : sk.addPoint(x0, y0).id;
  const b = sk.addPoint(x1, y0).id, c = sk.addPoint(x1, y1).id, d = sk.addPoint(x0, y1).id;
  const l = [sk.addLine(a, b), sk.addLine(b, c), sk.addLine(c, d), sk.addLine(d, a)];
  sk.addConstraint('horizontal', [l[0].id]); sk.addConstraint('vertical', [l[1].id]);
  sk.addConstraint('horizontal', [l[2].id]); sk.addConstraint('vertical', [l[3].id]);
  return { l, pts: [a, b, c, d] };
}
const lines = (sk) => [...sk.entities.values()].filter((e) => e.type === 'line');
const bboxOf = (sk, ids) => {
  const xs = [], ys = [];
  for (const id of ids) { const e = sk.entities.get(id); for (const pid of sk.entityPointIds(e)) { xs.push(P(sk, pid).x); ys.push(P(sk, pid).y); } }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

// ---- Contour et décalage ----
{
  const sk = new Sketch();
  const { l } = rect(sk, 0, 0, 40, 20);
  const ch = chainFrom(sk, l[1].id);
  ok(ch.closed && ch.items.length === 4, 'rectangle : contour fermé de 4 lignes');
  const side = offsetSide(sk, ch, { x: 45, y: 10 });
  ok(side && near(side.d, 5), 'côté extérieur, distance 5');
  const sideIn = offsetSide(sk, ch, { x: 20, y: 10 });
  ok(sideIn.side === -side.side, 'côté intérieur opposé');
  const res = offsetChain(sk, ch, 3, side.side);
  ok(res.ok && res.ids.length === 4, 'décalage : 4 nouvelles lignes');
  const b = bboxOf(sk, res.ids);
  ok(near(b.minX, -3) && near(b.maxX, 43) && near(b.minY, -3) && near(b.maxY, 23), 'décalage extérieur de 3 : -3…43 × -3…23');
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'décalage : solveur ok, pas de sur-contrainte');
  const sk2 = new Sketch();
  const r2 = rect(sk2, 0, 0, 40, 20);
  const ch2 = chainFrom(sk2, r2.l[0].id);
  const res2 = offsetChain(sk2, ch2, 2, offsetSide(sk2, ch2, { x: 20, y: 10 }).side);
  const b2 = bboxOf(sk2, res2.ids);
  ok(near(b2.minX, 2) && near(b2.maxX, 38) && near(b2.minY, 2) && near(b2.maxY, 18), 'décalage intérieur de 2');
  // cercle
  const sk3 = new Sketch();
  const c = sk3.addCircle(sk3.addPoint(5, 5).id, 10);
  const ch3 = chainFrom(sk3, c.id);
  const s3 = offsetSide(sk3, ch3, { x: 5, y: 5 + 13 });
  const r3 = offsetChain(sk3, ch3, 3, s3.side);
  ok(r3.ok && near(sk3.entities.get(r3.ids[0]).r, 13), 'cercle décalé vers l\'extérieur : R13');
  // chaîne ouverte ligne + arc tangent
  const sk4 = new Sketch();
  const p0 = sk4.addPoint(0, 0), p1 = sk4.addPoint(10, 0), pc = sk4.addPoint(10, 5), p2 = sk4.addPoint(15, 5);
  const L = sk4.addLine(p0.id, p1.id);
  const A = sk4.addArc(pc.id, p1.id, p2.id, true);
  const ch4 = chainFrom(sk4, A.id);
  ok(!ch4.closed && ch4.items.length === 2 && ch4.items[0].id === L.id, 'chaîne ouverte ligne → arc');
  const r4 = offsetChain(sk4, ch4, 1, -1);    // à droite du parcours (dessous) : rayon 6
  const na = [...sk4.entities.values()].find((e) => e.type === 'arc' && e.id !== A.id);
  ok(r4.ok && na && near(dist(P(sk4, na.c), P(sk4, na.s)), 6) && near(P(sk4, na.s).y, -1), 'ligne + arc décalés de 1 : raccord tangent conservé');
}

// ---- Congé et chanfrein ----
{
  const sk = new Sketch();
  const { l, pts } = rect(sk, 0, 0, 40, 20);
  const cl = cornerLines(sk, pts[2]);
  ok(cl && cl.includes(l[1].id) && cl.includes(l[2].id), 'coin : les deux lignes');
  const r = filletLines(sk, cl[0], cl[1], 5);
  ok(r.ok, 'congé R5');
  ok(r.corner === pts[2] && sk.points.has(pts[2]), 'coin d\'origine gardé');
  const consAtCorner = [...sk.entities.values()].filter((e) => e.construction && (e.p1 === pts[2] || e.p2 === pts[2]));
  ok(consAtCorner.length === 2, 'deux lignes de construction jusqu\'au coin');
  ok([...sk.constraints.values()].filter((k) => k.type === 'collinear').length === 2, 'lignes de construction colinéaires');
  ok([...sk.constraints.values()].some((k) => k.type === 'dimRadius' && k.refs[0] === r.arc && k.value === 5), 'cote R5 ajoutée');
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'congé : solveur ok, pas de sur-contrainte');
  ok(near(P(sk, pts[2]).x, 40) && near(P(sk, pts[2]).y, 20), 'le coin reste au sommet');
  const arc = sk.entities.get(r.arc);
  const c = P(sk, arc.c);
  ok(near(c.x, 35) && near(c.y, 15) && near(dist(c, P(sk, arc.s)), 5), 'centre (35, 15), rayon 5');
  ok(!filletLines(sk, l[0].id, l[1].id, 50).ok, 'rayon trop grand refusé');
  const ch = chamferLines(sk, ...cornerLines(sk, pts[0]), 4);
  ok(ch.ok && near(dist(P(sk, sk.entities.get(ch.line).p1), P(sk, sk.entities.get(ch.line).p2)), Math.hypot(4, 4)), 'chanfrein 4 × 4');
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'chanfrein : solveur ok');
  // deux lignes qui ne se touchent pas
  const sk2 = new Sketch();
  const a = sk2.addLine(sk2.addPoint(0, 0).id, sk2.addPoint(8, 0).id);
  const b = sk2.addLine(sk2.addPoint(10, 2).id, sk2.addPoint(10, 12).id);
  const r2 = filletLines(sk2, a.id, b.id, 1);
  ok(r2.ok && near(P(sk2, a.p2).x, 9) && near(P(sk2, b.p1).y, 1), 'congé entre deux lignes séparées : prolongées jusqu\'au congé');
  ok(near(P(sk2, r2.corner).x, 10) && near(P(sk2, r2.corner).y, 0), 'lignes séparées : coin virtuel à l\'intersection');
}

// ---- Congé / chanfrein : ce qui était attaché au coin reste en place ----
{
  const sk = new Sketch();
  const { l, pts } = rect(sk, 0, 0, 40, 20, true);
  sk.addConstraint('dimLength', [l[0].id], { value: 40, pos: { x: 20, y: -5 } });
  sk.addConstraint('dimLength', [l[1].id], { value: 20, pos: { x: 45, y: 10 } });
  // diagonale de construction de l'origine au coin opposé (point partagé)
  const diag = sk.addLine(pts[0], pts[2], { construction: true });
  ok(solve(sk).ok && analyze(sk).state === 'full', 'rectangle coté : entièrement contraint');
  const r = filletLines(sk, ...cornerLines(sk, pts[2]), 6);
  ok(r.ok && sk.entities.get(diag.id).p2 === pts[2], 'la diagonale reste sur le coin');
  ok([...sk.constraints.values()].filter((k) => k.type === 'dimDistance').length === 1, 'cote de longueur → cote jusqu\'au coin');
  const ch = chamferLines(sk, ...cornerLines(sk, pts[1]), 4);
  ok(ch.ok && [...sk.constraints.values()].filter((k) => k.type === 'dimLength' && k.value === 4).length === 2, 'chanfrein : deux cotes de 4');
  ok([...sk.constraints.values()].filter((k) => k.type === 'dimDistance').length === 2, 'les deux cotes de longueur vont de coin à coin');
  ok(solve(sk).ok, 'solveur ok');
  const an = analyze(sk);
  ok(an.over.size === 0 && an.state === 'full', 'congé + chanfrein cotés : toujours entièrement contraint');
  ok(near(P(sk, pts[2]).x, 40) && near(P(sk, pts[2]).y, 20) && near(P(sk, pts[1]).x, 40) && near(P(sk, pts[1]).y, 0), 'coins à leur place');
  // la cote de largeur pilote toujours le contour
  for (const k of sk.constraints.values()) if (k.type === 'dimDistance' && k.value === 40) k.value = 50;
  ok(solve(sk).ok && near(P(sk, pts[2]).x, 50) && near(P(sk, pts[1]).x, 50), 'largeur changée : coins et congé suivent');
  const arc = sk.entities.get(r.arc);
  ok(near(P(sk, arc.c).x, 44) && near(P(sk, arc.c).y, 14), 'centre du congé suit (44, 14)');
}

// ---- Colinéaire entre deux lignes bout à bout ----
{
  const sk = new Sketch();
  const a = sk.addPoint(0, 0).id, b = sk.addPoint(10, 1).id, c = sk.addPoint(20, 0).id;
  const L1 = sk.addLine(a, b), L2 = sk.addLine(b, c, { construction: true });
  sk.addConstraint('collinear', [L1.id, L2.id]);
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'colinéaire avec point partagé : pas de sur-contrainte');
  const A = P(sk, a), B = P(sk, b), C = P(sk, c);
  ok(Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) < 1e-6, 'les trois points sont alignés');
}

// ---- Ajuster ----
{
  const sk = new Sketch();
  const h = sk.addLine(sk.addPoint(-10, 0).id, sk.addPoint(10, 0).id);
  const v = sk.addLine(sk.addPoint(0, -10).id, sk.addPoint(0, 10).id);
  let r = trimAt(sk, h.id, { x: 6, y: 0.2 });
  ok(r.ok && near(P(sk, h.p2).x, 0) && near(P(sk, h.p1).x, -10), 'croix : bras droit coupé');
  ok([...sk.constraints.values()].some((k) => k.type === 'coincident' && k.refs[0] === h.p2 && k.refs[1] === v.id), 'nouvelle extrémité coïncidente avec la ligne de coupe');
  // coupe au milieu
  const sk2 = new Sketch();
  const base = sk2.addLine(sk2.addPoint(0, 0).id, sk2.addPoint(30, 0).id);
  sk2.addLine(sk2.addPoint(10, -5).id, sk2.addPoint(10, 5).id);
  sk2.addLine(sk2.addPoint(20, -5).id, sk2.addPoint(20, 5).id);
  r = trimAt(sk2, base.id, { x: 15, y: 0 });
  ok(r.ok && r.piece && near(P(sk2, base.p2).x, 10) && near(P(sk2, sk2.entities.get(r.piece).p1).x, 20), 'coupe entre deux lignes : deux morceaux');
  ok(solve(sk2).ok && analyze(sk2).over.size === 0, 'morceaux colinéaires, pas de sur-contrainte');
  // sans intersection : supprimée
  const sk3 = new Sketch();
  const lone = sk3.addLine(sk3.addPoint(0, 0).id, sk3.addPoint(5, 0).id);
  ok(trimAt(sk3, lone.id, { x: 2, y: 0 }).deleted && !sk3.entities.has(lone.id), 'ligne isolée : supprimée');
  // cercle coupé par une ligne
  const sk4 = new Sketch();
  const c = sk4.addCircle(sk4.addPoint(0, 0).id, 10);
  sk4.addLine(sk4.addPoint(-20, 0).id, sk4.addPoint(20, 0).id);
  r = trimAt(sk4, c.id, { x: 0, y: 10 });
  const e = sk4.entities.get(c.id);
  ok(r.ok && e.type === 'arc' && near(P(sk4, e.s).x, -10) && near(P(sk4, e.e).x, 10) && e.ccw, 'cercle coupé : demi-cercle du bas restant');
  ok(solve(sk4).ok, 'arc obtenu : solveur ok');
  // rectangle : ajuster un côté qui dépasse (forme en T)
  const sk5 = new Sketch();
  const t1 = sk5.addLine(sk5.addPoint(0, 0).id, sk5.addPoint(20, 0).id);
  const mid = sk5.addPoint(10, 0);
  const t2 = sk5.addLine(mid.id, sk5.addPoint(10, 10).id);
  sk5.addConstraint('coincident', [mid.id, t1.id]);
  r = trimAt(sk5, t1.id, { x: 15, y: 0 });
  ok(r.ok && t1.p2 === mid.id, 'T : la ligne s\'arrête sur l\'extrémité existante (point partagé)');
  sk5.cleanupDegenerate();
  ok(![...sk5.constraints.values()].some((k) => k.type === 'coincident' && k.refs[0] === mid.id), 'coïncidence devenue inutile retirée');
  void t2;
}

// ---- Prolonger ----
{
  const sk = new Sketch();
  const h = sk.addLine(sk.addPoint(0, 0).id, sk.addPoint(5, 0).id);
  const v = sk.addLine(sk.addPoint(12, -5).id, sk.addPoint(12, 5).id);
  let r = extendAt(sk, h.id, { x: 4, y: 0 });
  ok(r.ok && near(P(sk, h.p2).x, 12), 'ligne prolongée jusqu\'à la verticale');
  ok([...sk.constraints.values()].some((k) => k.type === 'coincident' && k.refs[1] === v.id), 'extrémité coïncidente avec la cible');
  r = extendAt(sk, h.id, { x: 0.5, y: 0 });
  ok(!r.ok, 'rien à atteindre de l\'autre côté');
  // arc prolongé jusqu'à une ligne
  const sk2 = new Sketch();
  const c = sk2.addPoint(0, 0);
  const a = sk2.addArc(c.id, sk2.addPoint(10, 0).id, sk2.addPoint(0, 10).id, true);
  sk2.addLine(sk2.addPoint(-20, 0).id, sk2.addPoint(-5, 0).id);
  r = extendAt(sk2, a.id, { x: 0, y: 10 });
  ok(r.ok && near(P(sk2, a.e).x, -10) && near(P(sk2, a.e).y, 0), 'arc prolongé jusqu\'à la ligne (-10, 0)');
}

// ---- Miroir ----
{
  const sk = new Sketch();
  const ax = sk.addLine(sk.addPoint(0, -10).id, sk.addPoint(0, 10).id);
  sk.addConstraint('fixed', [ax.id]);
  const p0 = sk.addPoint(0, 0);
  const L = sk.addLine(p0.id, sk.addPoint(10, 5).id);
  const C = sk.addCircle(sk.addPoint(6, -4).id, 2);
  const A = sk.addArc(sk.addPoint(5, 0).id, sk.addPoint(8, 0).id, sk.addPoint(5, 3).id, true);
  const r = mirrorEntities(sk, [L.id, C.id, A.id], ax.id);
  ok(r.ok && r.ids.length === 3, 'miroir : 3 copies');
  const L2 = sk.entities.get(r.ids[0]);
  ok(L2.p1 === p0.id && near(P(sk, L2.p2).x, -10) && near(P(sk, L2.p2).y, 5), 'ligne : point sur l\'axe partagé, l\'autre symétrique');
  const A2 = sk.entities.get(r.ids[2]);
  ok(A2.ccw === false && near(P(sk, A2.s).x, -8), 'arc retourné');
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'relations de symétrie : solveur ok');
  P(sk, L.p2).y = 7;
  ok(solve(sk, { weights: new Map([[L.p2, 1e6]]) }).ok && near(P(sk, L2.p2).y, 7, 1e-4), 'la copie suit l\'original');
}

// ---- Déplacer / copier / pivoter ----
{
  const sk = new Sketch();
  const { l } = rect(sk, 0, 0, 40, 20, true);   // un coin sur l'origine
  sk.addConstraint('dimLength', [l[0].id], { value: 40, pos: { x: 20, y: -8 } });
  const ids = l.map((e) => e.id);
  let r = transformSelection(sk, ids, translation({ x: 10, y: 5 }));
  ok(r.ok && P(sk, ORIGIN_ID).x === 0, 'déplacement : l\'origine ne bouge pas');
  ok(l[0].p1 !== ORIGIN_ID && near(P(sk, l[0].p1).x, 10) && near(P(sk, l[0].p1).y, 5), 'coin dédoublé et déplacé');
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'déplacement : solveur ok');
  const dim = [...sk.constraints.values()].find((k) => k.type === 'dimLength');
  ok(dim && near(dim.pos.x, 30), 'cote déplacée avec la géométrie');
  // copie
  const n0 = sk.entities.size, k0 = sk.constraints.size;
  r = transformSelection(sk, ids, translation({ x: 0, y: 30 }), { copy: true });
  ok(r.ok && sk.entities.size === n0 + 4 && sk.constraints.size === k0 + 5, 'copie : 4 lignes et 5 relations / cotes copiées');
  ok(solve(sk).ok && analyze(sk).over.size === 0, 'copie : solveur ok');
  // rotation de 90° : H ↔ V
  r = transformSelection(sk, ids, rotation({ x: 10, y: 5 }, Math.PI / 2), { angle: Math.PI / 2 });
  ok(r.ok && solve(sk).ok && analyze(sk).over.size === 0, 'rotation 90° : relations H/V échangées, solveur ok');
  ok(near(P(sk, l[0].p2).x, 10) && near(P(sk, l[0].p2).y, 45), 'coin tourné à (10, 45)');
  // rotation de 30° : H / V retirées
  r = transformSelection(sk, ids, rotation({ x: 10, y: 5 }, Math.PI / 6), { angle: Math.PI / 6 });
  ok(r.ok && solve(sk).ok && ![...sk.constraints.values()].some((k) => (k.type === 'horizontal' || k.type === 'vertical') && ids.includes(k.refs[0])), 'rotation 30° : H/V retirées');
}

// ---- Décalage : options (chaîne, cote de verrouillage, construction) ----
{
  const sk = new Sketch();
  const { l, pts } = rect(sk, 0, 0, 40, 20);
  sk.addConstraint('fixed', [pts[0]]); sk.addConstraint('fixed', [pts[2]]);   // original entièrement défini
  // une ligne de construction partant d'un coin ne coupe pas le contour
  const cons = sk.addLine(pts[1], sk.addPoint(60, -10).id, { construction: true });
  const ch = chainFrom(sk, l[0].id);
  ok(ch.closed && ch.items.length === 4 && !ch.items.some((i) => i.id === cons.id), 'chaîne : la ligne de construction est ignorée');
  ok(chainFrom(sk, l[0].id, { chain: false }).items.length === 1, 'sans chaîne : une seule entité');
  const res = offsetChain(sk, ch, 3, offsetSide(sk, ch, { x: 45, y: 10 }).side, { dim: true, construction: true, gap: 2 });
  ok(res.ok && res.ids.every((id) => sk.entities.get(id).construction), 'décalage en construction');
  const dims = [...sk.constraints.values()].filter((k) => k.type === 'dimLineLine');
  const eqs = [...sk.constraints.values()].filter((k) => k.type === 'offsetEq');
  ok(dims.length === 1 && near(dims[0].value, 3) && eqs.length === 3, 'cote 3 + 3 relations « décalage identique »');
  ok(solve(sk).ok, 'décalage verrouillé : solveur ok');
  const an = analyze(sk);
  ok(an.over.size === 0, 'décalage verrouillé : pas de sur-contrainte');
  const newPts = new Set(res.ids.flatMap((id) => sk.entityPointIds(sk.entities.get(id))));
  ok([...newPts].every((pid) => an.points.get(pid) === 'full'), 'décalage verrouillé : contour entièrement contraint');
  dims[0].value = 5;
  ok(solve(sk).ok, 'cote passée à 5 : solveur ok');
  const b = bboxOf(sk, res.ids);
  ok(near(b.minX, -5, 1e-5) && near(b.maxX, 45, 1e-5) && near(b.minY, -5, 1e-5) && near(b.maxY, 25, 1e-5), 'tout le contour suit la cote : -5…45 × -5…25');
  // cercle seul : rayon de la copie
  const sk2 = new Sketch();
  const c0 = sk2.addPoint(0, 0);
  const c = sk2.addCircle(c0.id, 10);
  const ch2 = chainFrom(sk2, c.id);
  const r2 = offsetChain(sk2, ch2, 2, offsetSide(sk2, ch2, { x: 0, y: 13 }).side, { dim: true });
  const dr = [...sk2.constraints.values()].find((k) => k.type === 'dimRadius');
  ok(r2.ok && dr && dr.refs[0] === r2.ids[0] && near(dr.value, 12), 'cercle : cote de rayon R12 sur la copie');
}

// ---- Cote symétrique par rapport à un axe (ligne de construction) ----
{
  const sk = new Sketch();
  const a = sk.addPoint(0, 0), b = sk.addPoint(0, 10);
  const axis = sk.addLine(a.id, b.id, { construction: true });
  sk.addConstraint('fixed', [a.id]); sk.addConstraint('fixed', [b.id]);
  const p = sk.addPoint(3, 5);
  sk.addConstraint('dimPointLine', [p.id, axis.id], { value: 10, sym: true });
  ok(solve(sk).ok && near(Math.abs(p.x), 5, 1e-6), 'point : cote symétrique 10 → 5 de l\'axe');
  const q1 = sk.addPoint(4, 0), q2 = sk.addPoint(4, 10);
  const L = sk.addLine(q1.id, q2.id);
  sk.addConstraint('parallel', [axis.id, L.id]);
  sk.addConstraint('dimLineLine', [axis.id, L.id], { value: 12, sym: true });
  ok(solve(sk).ok && near(Math.abs(q1.x), 6, 1e-6) && near(Math.abs(q2.x), 6, 1e-6), 'ligne : cote symétrique 12 → 6 de l\'axe');
}

print(fails ? `${fails} ÉCHEC(S)` : 'TOUS LES TESTS PASSENT');
if (fails) throw new Error('tests en échec');

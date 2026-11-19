import { Sketch, ORIGIN_ID } from '../js/core/model.js';
import { hitTest, entityLength, entityInsideRect, entityTouchesRect, outwardTangentAt, endpointEntities } from '../js/core/query.js';
import { analyze } from '../js/core/solver.js';
import { History } from '../js/core/history.js';
import { arcInfo, circleFrom3, niceStep, angleInArc, dist } from '../js/core/geom.js';
import { fmtLength, fmtFraction, fmtNumber } from '../js/core/units.js';
import { Viewport } from '../js/render/viewport.js';
import { TOOL_CLASSES, GROUPS, describeFavorite } from '../js/ui/tools/registry.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; print('FAIL: ' + msg); } else print('ok: ' + msg); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---- Contexte d'outil factice ----
function makeCtx(sketch) {
  const hints = [];
  const commits = [];
  const vp = new Viewport(); vp.resize(400, 800); vp.scale = 4;
  const ctx = {
    get sketch() { return sketch; },
    get settings() { return { snap: true, grid: false }; },
    tolWorld: () => 12 / vp.scale,
    snap(wp) {
      const tol = 14 / vp.scale; let best = null;
      for (const p of sketch.points.values()) { const d = dist(p, wp); if (d <= tol && (!best || d < best.d)) best = { d, p }; }
      if (best) return { x: best.p.x, y: best.p.y, pointId: best.p.id, kind: 'point' };
      return { x: wp.x, y: wp.y, kind: null };
    },
    autoAlign(a, b) {
      const out = { ...b, align: null }; if (b.pointId) return out;
      const dx = b.x - a.x, dy = b.y - a.y; const ang = Math.abs(Math.atan2(dy, dx)); const t = 3 * Math.PI / 180;
      if (ang < t || Math.PI - ang < t) { out.y = a.y; out.align = 'h'; } else if (Math.abs(ang - Math.PI / 2) < t) { out.x = a.x; out.align = 'v'; }
      return out;
    },
    resolvePoint(s) { if (s.pointId && sketch.points.has(s.pointId)) return sketch.points.get(s.pointId); return sketch.addPoint(s.x, s.y); },
    commit(label) { commits.push(label); },
    setHint(t) { hints.push(t); },
    requestDraw() {},
    toast(m) { hints.push('TOAST:' + m); },
    deactivate() {},
    endpointTangent(pid) { const es = endpointEntities(sketch, pid); if (!es.length) return null; return { dir: outwardTangentAt(sketch, es[0], pid), entity: es[0] }; },
    commits, hints,
  };
  return ctx;
}
const tap = (tool, x, y) => { tool.onPress({ x, y }); tool.onMove({ x, y }); tool.onRelease({ x, y }); };

// ---- Géométrie ----
ok(niceStep(0.3) === 0.5 && niceStep(3) === 5 && niceStep(12) === 20 && niceStep(60) === 100 && niceStep(1) === 1, 'niceStep');
const c3 = circleFrom3({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
ok(c3 && near(c3.r, 1) && near(c3.c.x, 0) && near(c3.c.y, 0), 'circleFrom3');
ok(angleInArc(Math.PI / 2, 0, Math.PI, true) && !angleInArc(-Math.PI / 2, 0, Math.PI, true), 'angleInArc');
const ai = arcInfo({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, true);
ok(near(ai.r, 10) && near(ai.sweep, Math.PI / 2) && near(ai.length, 10 * Math.PI / 2), 'arcInfo ccw quart');
const ai2 = arcInfo({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, false);
ok(near(ai2.sweep, 3 * Math.PI / 2), 'arcInfo cw 3/4');

// ---- Unités ----
ok(fmtNumber(12.5) === '12,5' && fmtNumber(3) === '3' && fmtNumber(0.123, 2) === '0,12', 'fmtNumber virgule ' + fmtNumber(12.5));
ok(fmtLength(125, { unit: 'mm' }) === '125 mm', 'fmtLength mm: ' + fmtLength(125, { unit: 'mm' }));
ok(fmtFraction(3.1875, 16) === '3 3/16' && fmtFraction(0.1875, 16) === '3/16' && fmtFraction(2, 16) === '2', 'fractions ' + fmtFraction(3.1875, 16));
ok(fmtLength(25.4 * 63.5, { unit: 'ft' }) === "5' 3 1/2\"", 'pieds: ' + fmtLength(25.4 * 63.5, { unit: 'ft' }));

// ---- Rectangle par 2 coins ----
{
  const sk = new Sketch(); const tc = makeCtx(sk);
  const t = new TOOL_CLASSES.rect2(tc);
  tap(t, 0, 0); tap(t, 40, 20);
  ok(sk.entities.size === 4, 'rect2 : 4 lignes');
  ok(sk.points.size === 4, 'rect2 : 3 nouveaux points + origine partagée (' + sk.points.size + ')');
  ok(sk.points.has(ORIGIN_ID) && [...sk.entities.values()].filter(e => e.p1 === ORIGIN_ID || e.p2 === ORIGIN_ID).length === 2, 'rect2 : coin accroché à l\'origine');
  const types = [...sk.constraints.values()].map(k => k.type).sort().join(',');
  ok(types === 'horizontal,horizontal,vertical,vertical', 'rect2 : 2H + 2V (' + types + ')');
  ok(tc.commits.length === 1, 'rect2 : 1 commit');
  // sélection d'un côté et suppression
  const hit = hitTest(sk, { x: 20, y: 0.5 }, 3);
  ok(hit && hit.type === 'entity', 'hitTest côté bas');
  const hitP = hitTest(sk, { x: 40.5, y: 20.2 }, 3);
  ok(hitP && hitP.type === 'point', 'hitTest coin → point');
  const before = sk.serialize();
  sk.removeEntity(hit.id);
  ok(sk.entities.size === 3 && sk.points.size === 4, 'suppression côté : points conservés (partagés)');
  const h = new History(); h.init(before); h.push(sk.serialize(), 'Suppression');
  const back = Sketch.deserialize(h.undo());
  ok(back.entities.size === 4 && h.canRedo(), 'undo restaure 4 lignes');
  // analyse
  const an = analyze(sk);
  ok(an.state === 'under' && an.points.get(ORIGIN_ID) === 'full', 'analyse sous-contrainte, origine pleine');
  // sélection rectangle
  const box = { minX: -1, maxX: 41, minY: -1, maxY: 21 };
  ok([...sk.entities.values()].every(e => entityInsideRect(sk, e, box)), 'inside rect');
  const top = [...sk.entities.values()].find(e => sk.points.get(e.p1).y === 20 && sk.points.get(e.p2).y === 20);
  ok(top && entityTouchesRect(sk, top, { minX: 10, maxX: 12, minY: -5, maxY: 25 }) && !entityInsideRect(sk, top, { minX: 10, maxX: 12, minY: -5, maxY: 25 }), 'crossing rect');
}

// ---- Ligne enchaînée + redressement ----
{
  const sk = new Sketch(); const tc = makeCtx(sk);
  const t = new TOOL_CLASSES.line2(tc);
  tap(t, 10, 10); tap(t, 50, 10.5); tap(t, 50.3, 40); tap(t, 50.3, 40); // dernier tap sur le dernier point : fin
  ok(sk.entities.size === 2, 'chaîne : 2 lignes');
  const ls = [...sk.entities.values()];
  ok(ls[0].p2 === ls[1].p1, 'chaîne : point partagé');
  const p2 = sk.points.get(ls[0].p2); const p3 = sk.points.get(ls[1].p2);
  ok(near(p2.y, 10) && near(p3.x, 50), 'redressement H puis V');
  ok([...sk.constraints.values()].map(k => k.type).sort().join(',') === 'horizontal,vertical', 'relations H et V');
  ok(t.pts.length === 0, 'chaîne terminée');
  tap(t, 100, 100); ok(t.onToolbarTap() === true && t.pts.length === 0, 'appui sur l\'outil annule le point en attente');
  ok(t.onToolbarTap() === false, 'second appui : rien à annuler');
}

// ---- Cercle, arcs ----
{
  const sk = new Sketch(); const tc = makeCtx(sk);
  let t = new TOOL_CLASSES.circleCenter(tc);
  tap(t, 0, 0); tap(t, 30, 0);
  const c = [...sk.entities.values()][0];
  ok(c.type === 'circle' && near(c.r, 30) && c.c === ORIGIN_ID, 'cercle centre origine r=30');
  t = new TOOL_CLASSES.circle3(tc);
  tap(t, 100, 0); tap(t, 110, 10); tap(t, 100, 20);
  const c2 = [...sk.entities.values()][1];
  ok(c2.type === 'circle' && near(c2.r, 10) && near(sk.points.get(c2.c).x, 100) && near(sk.points.get(c2.c).y, 10), 'cercle 3 points');
  t = new TOOL_CLASSES.arcCenter(tc);
  t.onPress({ x: 200, y: 0 }); t.onRelease({ x: 200, y: 0 });
  t.onPress({ x: 220, y: 0 }); t.onRelease({ x: 220, y: 0 });
  // doigt qui balaie dans le sens ccw : 0° → 90° → 180°
  t.onPress({ x: 220, y: 1 }); t.onMove({ x: 200, y: 20 }); t.onMove({ x: 180, y: 0 }); t.onRelease({ x: 180, y: 0 });
  const a = [...sk.entities.values()][2];
  ok(a && a.type === 'arc' && a.ccw === true, 'arc centre ccw');
  const inf = arcInfo(sk.points.get(a.c), sk.points.get(a.s), sk.points.get(a.e), a.ccw);
  ok(near(inf.r, 20) && near(inf.sweep, Math.PI), 'arc centre : r=20, 180°');
  // arc 3 points
  t = new TOOL_CLASSES.arc3(tc);
  tap(t, 300, 0); tap(t, 320, 0); tap(t, 310, 10);
  const a3 = [...sk.entities.values()][3];
  const inf3 = arcInfo(sk.points.get(a3.c), sk.points.get(a3.s), sk.points.get(a3.e), a3.ccw);
  ok(a3.type === 'arc' && near(inf3.r, 10) && near(inf3.sweep, Math.PI), 'arc 3 points : demi-cercle par le haut (ccw=' + a3.ccw + ')');
  ok(a3.ccw === false, 'arc 3 points : sens horaire de gauche à droite en passant par le haut');
}

// ---- Arc tangent depuis une ligne ----
{
  const sk = new Sketch(); const tc = makeCtx(sk);
  let t = new TOOL_CLASSES.line2(tc);
  tap(t, 0, 0); tap(t, 40, 0); t.onToolbarTap();
  t = new TOOL_CLASSES.arcTangent(tc);
  tap(t, 10, 10); // pas une extrémité → refus
  ok(t.pts.length === 0 && tc.hints.some(h => h.startsWith('TOAST')), 'arc tangent refuse un point libre');
  tap(t, 40, 0); tap(t, 60, 20);
  const arc = [...sk.entities.values()].find(e => e.type === 'arc');
  ok(!!arc, 'arc tangent créé');
  const inf = arcInfo(sk.points.get(arc.c), sk.points.get(arc.s), sk.points.get(arc.e), arc.ccw);
  ok(near(inf.r, 20) && near(sk.points.get(arc.c).x, 40) && near(sk.points.get(arc.c).y, 20) && arc.ccw, 'arc tangent : centre (40,20), r=20, ccw');
  ok([...sk.constraints.values()].some(k => k.type === 'tangent'), 'relation tangente ajoutée');
  const line = [...sk.entities.values()].find(e => e.type === 'line');
  ok(arc.s === line.p2, 'arc partage l\'extrémité de la ligne');
}

// ---- Tangence automatique des arcs ----
{
  const sk = new Sketch(); const tc = makeCtx(sk);
  let t = new TOOL_CLASSES.line2(tc);
  tap(t, 0, 0); tap(t, 40, 0); t.onToolbarTap();
  t = new TOOL_CLASSES.arc3(tc);
  tap(t, 40, 0); tap(t, 60, 20); tap(t, 54.142, 5.858);   // quart de cercle de centre (40,20), dans le prolongement
  ok([...sk.constraints.values()].some(k => k.type === 'tangent'), 'arc 3 points dans le prolongement : tangence automatique');
  const n = [...sk.constraints.values()].filter(k => k.type === 'tangent').length;
  tap(t, 0, 0); tap(t, -20, 20); tap(t, -10, 25);           // part à angle vif : pas de tangence
  ok([...sk.constraints.values()].filter(k => k.type === 'tangent').length === n, 'arc à angle vif : pas de tangence');
}

// ---- Rectangles 3 points, parallélogramme, centre ----
{
  const sk = new Sketch(); const tc = makeCtx(sk);
  let t = new TOOL_CLASSES.rect3corner(tc);
  tap(t, 0, 0); tap(t, 30, 30); tap(t, 0, 20);
  ok(sk.entities.size === 4, 'rect 3 points : 4 lignes');
  let types = [...sk.constraints.values()].map(k => k.type).sort().join(',');
  ok(types === 'parallel,parallel,perpendicular', 'rect 3 points : 2 parallèles + 1 perpendiculaire (' + types + ')');
  const ls = [...sk.entities.values()];
  ok(near(entityLength(sk, ls[0]), Math.hypot(30, 30)) && near(entityLength(sk, ls[1]), Math.abs((-30 * 0 + 30 * 20) / Math.hypot(30, 30))), 'rect 3 points : dimensions');
  sk.entities.clear(); sk.constraints.clear();
  t = new TOOL_CLASSES.parallelogram(tc);
  tap(t, 100, 100); tap(t, 140, 100); tap(t, 150, 120);
  ok(sk.entities.size === 4 && [...sk.constraints.values()].length === 2, 'parallélogramme : 4 lignes, 2 parallèles');
  const l4 = [...sk.entities.values()][3];
  ok(near(sk.points.get(l4.p1).x, 110) && near(sk.points.get(l4.p1).y, 120), 'parallélogramme : 4e coin (110,120)');
  t = new TOOL_CLASSES.rectCenter(tc);
  tap(t, 300, 300); tap(t, 320, 310);
  const lastLines = [...sk.entities.values()].filter(e => !e.construction).slice(-4);
  const diags = [...sk.entities.values()].filter(e => e.construction);
  ok(diags.length === 2, 'rect centre : 2 diagonales de construction');
  const mk = [...sk.constraints.values()].find(k => k.type === 'midpoint');
  ok(mk && near(sk.points.get(mk.refs[0]).x, 300) && near(sk.points.get(mk.refs[0]).y, 300) && mk.refs[1] === diags[0].id, 'rect centre : centre au milieu d\'une diagonale');
  const xs = lastLines.flatMap(l => [sk.points.get(l.p1).x, sk.points.get(l.p2).x]);
  ok(Math.min(...xs) === 280 && Math.max(...xs) === 320, 'rect centre : de 280 à 320');
  t = new TOOL_CLASSES.rect3center(tc);
  tap(t, 500, 500); tap(t, 520, 500); tap(t, 500, 505);
  const rl = [...sk.entities.values()].filter(e => !e.construction).slice(-4);
  ok([...sk.entities.values()].filter(e => e.construction).length === 4, 'rect 3 points centre : diagonales de construction');
  const ys = rl.flatMap(l => [sk.points.get(l.p1).y, sk.points.get(l.p2).y]);
  ok(near(Math.min(...ys), 495) && near(Math.max(...ys), 505), 'rect 3 points centre : hauteur 10');
}

// ---- Fusion de points, sérialisation ----
{
  const sk = new Sketch();
  const a = sk.addPoint(0, 0), b = sk.addPoint(10, 0), c = sk.addPoint(10, 0);
  sk.addLine(a.id, b.id); sk.addLine(c.id, a.id);
  sk.mergePoints(b.id, c.id);
  ok(sk.points.size === 3 && [...sk.entities.values()][1].p1 === b.id, 'mergePoints');
  const json = JSON.parse(JSON.stringify(sk.toJSON()));
  const sk2 = Sketch.fromJSON(json);
  ok(sk2.entities.size === 2 && sk2.points.size === 3 && sk2.seq === sk.seq, 'sérialisation aller-retour');
  sk2.removePoint(a.id);
  ok(sk2.entities.size === 0 && sk2.points.size === 1, 'removePoint supprime les lignes et les orphelins');
}

// ---- Viewport ----
{
  const vp = new Viewport(); vp.resize(400, 800);
  const w = vp.toWorld({ x: 200, y: 400 });
  ok(near(w.x, 0) && near(w.y, 0), 'origine centrée');
  vp.zoomAt({ x: 200, y: 400 }, 2);
  ok(near(vp.scale, 8) && near(vp.toScreen({ x: 10, y: 10 }).x, 280) && near(vp.toScreen({ x: 10, y: 10 }).y, 320), 'zoom centré, Y vers le haut');
  vp.fit({ minX: 0, maxX: 100, minY: 0, maxY: 50 }, 50);
  const s1 = vp.toScreen({ x: 0, y: 0 }), s2 = vp.toScreen({ x: 100, y: 50 });
  ok(near(s1.x, 50) && near(s2.x, 350) && near((s1.y + s2.y) / 2, 400), 'fit');
  const saved = vp.toJSON();
  const vp2 = new Viewport(); vp2.resize(800, 400); vp2.fromJSON(saved);
  const c2 = vp2.toWorld({ x: 400, y: 200 });
  ok(near(c2.x, 50) && near(c2.y, 25), 'restauration du centre monde après rotation');
}

// ---- Registre ----
ok(GROUPS.length === 15 && describeFavorite('line').kind === 'group' && describeFavorite('tool:line2').kind === 'tool' && describeFavorite('xxx') === null, 'registre des groupes');

print(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`);
if (fails) throw new Error('tests en échec');

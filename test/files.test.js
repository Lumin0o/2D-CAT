// Fichiers : export / import DXF, PDF vectoriel.
import { Sketch, ORIGIN_ID } from '../js/core/model.js';
import { exportDXF, parseDXF, addImported } from '../js/core/dxf.js';
import { PdfContext, buildPDF, textWidth } from '../js/core/pdf.js';
import { arcInfo } from '../js/core/geom.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; print('FAIL: ' + m); } else print('ok: ' + m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const nearP = (p, q, e = 1e-6) => near(p.x, q.x, e) && near(p.y, q.y, e);

// esquisse : rectangle 40 × 20, cercle R5, arc (sens horaire), une ligne de construction, une ligne infinie
function scene() {
  const sk = new Sketch();
  const a = sk.addPoint(0, 0), b = sk.addPoint(40, 0), c = sk.addPoint(40, 20), d = sk.addPoint(0, 20);
  sk.addLine(a.id, b.id); sk.addLine(b.id, c.id); sk.addLine(c.id, d.id); sk.addLine(d.id, a.id);
  sk.addCircle(sk.addPoint(60, 10).id, 5);
  const ac = sk.addPoint(20, 40);
  sk.addArc(ac.id, sk.addPoint(30, 40).id, sk.addPoint(10, 40).id, false);   // demi-cercle du bas (horaire de 0° à 180°)
  sk.addLine(a.id, c.id, { construction: true });
  sk.addLine(sk.addPoint(-5, -5).id, sk.addPoint(5, 5).id, { construction: true, infinite: true });
  return sk;
}

// export DXF (AutoCAD 2000) : construction comprise, sur son calque ; relecture identique
{
  const sk = scene();
  const { text, count } = exportDXF(sk);
  ok(count === 8, 'export : 4 lignes + cercle + arc + ligne de construction + ligne infinie (' + count + ')');
  ok(/\$ACADVER\r\n  1\r\nAC1015\r\n/.test(text) && /\$INSUNITS\r\n 70\r\n4\r\n/.test(text) && text.trim().endsWith('EOF'), 'en-tête AutoCAD 2000, unité mm, fin EOF');
  ok(!/@[A-Z]+@/.test(text), 'tous les champs du modèle remplis');
  ok(/\$EXTMAX\r\n 10\r\n65\r\n 20\r\n40\r\n/.test(text), 'étendue du dessin (zoom à l\'ouverture)');
  const all = text.slice(text.indexOf('ENDSEC'));      // après l'en-tête ($HANDSEED)
  const handles = [...all.matchAll(/\r\n  5\r\n([0-9A-F]+)\r\n/g)].map((m) => parseInt(m[1], 16));
  const seed = parseInt(/\$HANDSEED\r\n  5\r\n([0-9A-F]+)/.exec(text)[1], 16);
  ok(new Set(handles).size === handles.length && Math.max(...handles) < seed, 'handles uniques, inférieurs à $HANDSEED');
  ok((text.match(/\r\n  8\r\nCONSTRUCTION\r\n/g) || []).length === 2 && /\r\nXLINE\r\n/.test(text), 'construction sur le calque CONSTRUCTION, ligne infinie en XLINE');
  const r = parseDXF(text);
  ok(r.items.length === 8 && r.unitKnown && r.unitMM === 1, 'relecture : 8 éléments en mm');
  ok(r.items.filter((i) => i.construction).length === 2 && r.items.some((i) => i.infinite), 'relecture : construction et ligne infinie retrouvées');
  const arc = r.items.find((i) => i.type === 'arc');
  // l'arc horaire de (30,40) à (10,40) autour de (20,40) passe par le bas : relu comme arc trigonométrique de (10,40) à (30,40)
  ok(arc && nearP(arc.c, { x: 20, y: 40 }) && nearP(arc.s, { x: 10, y: 40 }) && nearP(arc.e, { x: 30, y: 40 }) && arc.ccw, 'arc : sens conservé (passe par le bas)');
  const mid = arcInfo(arc.c, arc.s, arc.e, arc.ccw);
  ok(near(mid.sweep, Math.PI), 'arc : demi-cercle');
  const circ = r.items.find((i) => i.type === 'circle');
  ok(circ && near(circ.r, 5) && nearP(circ.c, { x: 60, y: 10 }), 'cercle relu');
  // import : sans relation, bouts reliés
  const sk2 = new Sketch();
  const ids = addImported(sk2, r.items.filter((i) => !i.construction));
  ok(ids.length === 6 && sk2.constraints.size === 0, 'import : 6 entités, aucune relation');
  ok(sk2.points.size === 1 + 4 + 1 + 3, 'import : bouts reliés (rectangle : 4 points partagés) (' + sk2.points.size + ')');
  const sk3 = new Sketch();
  addImported(sk3, r.items);
  ok([...sk3.entities.values()].filter((e) => e.construction).length === 2, 'import : construction gardée');
  // contour d'une polyligne arrondie : arc et lignes reliés
}

// unités : export en pouces, relu en mm
{
  const sk = new Sketch();
  sk.addLine(sk.addPoint(0, 0).id, sk.addPoint(25.4, 50.8).id);
  const { text } = exportDXF(sk, { unit: 'inch' });
  ok(/\r\n 11\r\n1\r\n 21\r\n2\r\n/.test(text) && /\$INSUNITS\r\n 70\r\n1\r\n/.test(text), 'export en pouces : 1" et 2"');
  const r = parseDXF(text);
  ok(near(r.items[0].b.x, 25.4) && near(r.items[0].b.y, 50.8), 'relu en mm');
  // sans $INSUNITS : unité par défaut demandée
  const bare = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n2\n21\n0\n0\nENDSEC\n0\nEOF\n';
  const r2 = parseDXF(bare, { defaultUnit: 'cm' });
  ok(!r2.unitKnown && near(r2.items[0].b.x, 20), 'sans unité : unité de l\'app (2 cm = 20 mm)');
}

// polylignes : LWPOLYLINE fermée avec un arrondi (bulge = 1 : demi-cercle), POLYLINE / VERTEX, OCS inversé
{
  const lw = ['0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '8', '0', '90', '3', '70', '1',
    '10', '0', '20', '0', '42', '0',
    '10', '10', '20', '0', '42', '1',
    '10', '10', '20', '10',
    '0', 'POLYLINE', '8', '0', '66', '1', '70', '0',
    '0', 'VERTEX', '8', '0', '10', '100', '20', '0',
    '0', 'VERTEX', '8', '0', '10', '110', '20', '0',
    '0', 'VERTEX', '8', '0', '10', '110', '20', '10',
    '0', 'SEQEND',
    '0', 'CIRCLE', '8', '0', '10', '5', '20', '0', '40', '2', '210', '0', '220', '0', '230', '-1',
    '0', 'TEXT', '8', '0', '1', 'Bonjour',
    '0', 'ENDSEC', '0', 'EOF'].join('\n');
  const r = parseDXF(lw);
  const types = r.items.map((i) => i.type).join(',');
  ok(types === 'line,arc,line,line,line,circle', 'polylignes + cercle : ' + types);
  const arc = r.items[1];
  // de (10,0) à (10,10), bulge 1 → demi-cercle de centre (10,5), sens trigonométrique (par la droite)
  ok(nearP(arc.c, { x: 10, y: 5 }) && arc.ccw && near(arcInfo(arc.c, arc.s, arc.e, arc.ccw).sweep, Math.PI), 'bulge → demi-cercle centré (10,5)');
  const ang = Math.atan2(0, 1);
  ok(near(arcInfo(arc.c, arc.s, arc.e, true).a1 + Math.PI / 2, ang + 0), 'l\'arc part vers le bas du centre');
  ok(nearP(r.items[5].c, { x: -5, y: 0 }), 'OCS (0,0,-1) : X inversé');
  ok(r.skipped.TEXT === 1, 'texte ignoré et compté');
}

// fichier qui n'est pas un DXF
{
  let threw = false;
  try { parseDXF('bonjour'); } catch (e) { threw = true; }
  ok(threw, 'fichier non DXF : erreur claire');
}

// PDF : structure, table xref juste, texte et arcs
{
  const ctx = new PdfContext(595.28, 841.89);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(100, 10); ctx.stroke();
  ctx.beginPath(); ctx.arc(200, 200, 50, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '13px Helvetica'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('R12,5 (45°)', 300, 300);
  const bytes = buildPDF(ctx, { title: 'Essai' });
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  ok(s.startsWith('%PDF-1.4') && s.trim().endsWith('%%EOF'), 'en-tête et fin PDF');
  const xref = parseInt(/startxref\n(\d+)/.exec(s)[1], 10);
  ok(s.slice(xref, xref + 4) === 'xref', 'startxref pointe sur la table xref');
  const offs = [...s.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => parseInt(m[1], 10));
  ok(offs.length === 7 && offs.every((o, i) => s.slice(o).startsWith(`${i + 1} 0 obj`)), 'chaque objet à son décalage');
  ok(/1 0 0 RG 2 w/.test(s) && /10 831\.89 m\n100 831\.89 l\nS/.test(s), 'trait rouge, Y retourné');
  ok((s.match(/ c\n/g) || []).length + (s.match(/ c$/gm) || []).length >= 4, 'cercle en 4 courbes de Bézier');
  ok(/\(R12,5 \\\(45\\260\\\)\) Tj/.test(s), 'texte avec parenthèses échappées et « ° » en WinAnsi');
  ok(near(textWidth('0', 10), 5.56), 'largeur Helvetica');
}

print(fails ? `${fails} ÉCHEC(S)` : 'TOUS LES TESTS PASSENT');
if (fails) throw new Error('tests');

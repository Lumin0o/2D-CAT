// Aide (Réglages › Aide) : description des outils, des relations, des cotes et des gestes, à la manière de
// l'aide en ligne de SOLIDWORKS. Les titres des outils viennent du registre (mêmes noms que la barre).
import { GROUPS } from './tools/registry.js';
import { icon } from './icons.js';
import { REL_GLYPH, REL_LABEL } from '../render/annotations.js';

/** Description de chaque outil (par identifiant du registre). */
const TOOL_HELP = {
  line2: 'Trace une ligne par ses deux extrémités. Les lignes s\'enchaînent : chaque fin devient le début de la suivante ; touchez deux fois le même point (ou un outil) pour arrêter. Près de l\'horizontale ou de la verticale, la relation H ou V est ajoutée automatiquement.',
  lineMid: 'Trace une ligne depuis son milieu : le premier point est le milieu, le second une extrémité.',
  rect2: 'Rectangle par deux coins opposés, avec ses relations horizontales et verticales.',
  rectCenter: 'Rectangle par son centre puis un coin. Les diagonales de construction et le point central (relation Point milieu) sont créés ; le point central se sélectionne et se supprime comme un point d\'esquisse.',
  rect3corner: 'Rectangle incliné : deux coins donnent le premier côté (et l\'angle), le troisième point la largeur.',
  rect3center: 'Rectangle incliné par son centre : le centre, le milieu d\'un côté, puis un point pour la largeur.',
  parallelogram: 'Parallélogramme par trois coins ; les côtés opposés restent parallèles.',
  circleCenter: 'Cercle par son centre et un point du cercle (le rayon).',
  circle3: 'Cercle passant par trois points.',
  arcCenter: 'Arc par son centre, puis le point de départ (qui donne le rayon) et le point d\'arrivée.',
  arcTangent: 'Arc qui part tangent à l\'extrémité d\'une ligne ou d\'un arc : touchez l\'extrémité, puis le point d\'arrivée.',
  arc3: 'Arc par trois points : départ, arrivée, puis un point sur l\'arc qui règle la courbure.',
  point: 'Point d\'esquisse isolé, utile comme repère ou centre (répétition circulaire, cotes).',
  constructionLine: 'Ligne de construction (en tirets) : sert de repère, d\'axe de symétrie ou de direction ; elle ne fait pas partie du contour.',
  constructionMid: 'Ligne de construction tracée depuis son milieu.',
  infiniteLine: 'Ligne de construction infinie passant par deux points.',
  toggleConstruction: 'Touchez des entités pour les passer en construction, ou les rendre normales.',
  smartDimension: 'Cotation intelligente : touchez un ou deux éléments, puis glissez le doigt pour choisir le type (longueur, horizontale, verticale, distance, angle, rayon…) et placer la cote, et tapez la valeur. La géométrie s\'ajuste à la valeur.',
  dimHorizontal: 'Cote horizontale entre deux points (ou d\'une ligne).',
  dimVertical: 'Cote verticale entre deux points (ou d\'une ligne).',
  dimChain: 'Cotes alignées à la suite, de point en point, sur une même ligne de cote.',
  dimOrdinate: 'Cotation ordinale : un point de référence (0), puis chaque point coté depuis cette référence. Glisser le doigt choisit l\'orientation (horizontale, verticale, parallèle ou perpendiculaire à une ligne).',
  measure: 'Mètre : mesure une longueur, une distance ou un angle sans créer de cote.',
  trim: 'Ajuster intelligent : touchez la partie d\'une entité à supprimer, jusqu\'aux intersections les plus proches.',
  extend: 'Prolonger : touchez une ligne ou un arc près du bout à prolonger jusqu\'à la prochaine entité.',
  offset: 'Décaler les entités : touchez le contour (ou l\'entité), puis le côté, et tapez la distance. Options : toute la chaîne d\'entités reliées, des deux côtés, cote de la distance, décalage en construction. Avec la cote, la distance est verrouillée : la copie ne se glisse plus de côté (supprimez la cote, ou décochez l\'option avant de décaler, pour la placer à la main).',
  mirror: 'Symétrie : choisissez les éléments, puis la ligne d\'axe ; les copies sont reliées par la relation Symétrique.',
  fillet: 'Congé d\'esquisse : touchez un coin (ou deux lignes, ou un cadre) et tapez le rayon. Le coin d\'origine reste en lignes de construction ; option : ajouter la cote du rayon.',
  chamfer: 'Chanfrein d\'esquisse : touchez un coin (ou deux lignes, ou un cadre) et tapez la distance ; option : ajouter les deux cotes.',
  move: 'Déplacer les éléments choisis : touchez un point de départ, puis le point d\'arrivée.',
  copy: 'Copier les éléments choisis (avec leurs relations internes), d\'un point de départ à un point d\'arrivée ; on peut recopier plusieurs fois.',
  rotate: 'Pivoter les éléments choisis : touchez le centre de rotation, puis tapez l\'angle.',
  linearPattern: 'Répétition linéaire : choisissez les éléments, puis une ligne ou une cote pour la direction. Réglez l\'espacement (ou, en espacement constant, la longueur totale de l\'original à la dernière occurrence) et le nombre d\'occurrences. « Garder les pièces identiques » lie les occurrences à l\'original ; la case ×N, touchée deux fois, change le nombre.',
  circularPattern: 'Répétition circulaire autour d\'un point (ou du centre d\'un cercle) : angle entre occurrences, ou angle total (360° = tour complet) en espacement constant, et nombre d\'occurrences.',
  text: 'Texte libre : touchez l\'endroit, tapez le texte. Hauteur et couleur réglables ; touchez un texte pour le modifier. Il n\'a pas d\'effet sur les contraintes.',
};

const REL_HELP = {
  horizontal: 'Ligne (ou deux points) à l\'horizontale.',
  vertical: 'Ligne (ou deux points) à la verticale.',
  coincident: 'Point sur une ligne, un cercle ou un arc ; entre deux points, ils sont fusionnés.',
  midpoint: 'Point au milieu d\'une ligne.',
  collinear: 'Deux lignes sur une même droite.',
  parallel: 'Lignes parallèles.',
  perpendicular: 'Deux lignes à angle droit.',
  tangent: 'Ligne et cercle / arc (ou deux courbes) tangents.',
  concentric: 'Cercles ou arcs de même centre.',
  equal: 'Lignes de même longueur, ou cercles / arcs de même rayon.',
  symmetric: 'Deux points symétriques par rapport à une ligne.',
  fixed: 'Élément bloqué à sa place.',
  offsetEq: 'Décalage gardé à la même distance que le reste du contour décalé.',
  pattern: 'Occurrences d\'une répétition identiques à l\'original (case ×N).',
};

const GESTURES = [
  ['Toucher', 'Sélectionne un élément (ligne, point, cote, relation, texte). Toucher le vide désélectionne.'],
  ['Glisser un élément', 'Déplace un point, une ligne ou un cercle (le rayon) en respectant les contraintes ; un point lâché sur un autre point ou une entité devient coïncident.'],
  ['Deux doigts', 'Déplacer la vue et zoomer.'],
  ['Double toucher', 'Sur une cote : modifier sa valeur. Sur la case ×N d\'une répétition : changer le nombre. Sur un texte : modifier le texte.'],
  ['Appui long sur une case', 'Ouvre les variantes du groupe d\'outils (durée réglable dans Réglages).'],
  ['Bouton cadre', 'Sélection par cadre : de gauche à droite, les éléments entièrement dedans ; de droite à gauche, ceux qu\'il touche.'],
  ['Bouton sélection multiple', 'Les touchers s\'ajoutent à la sélection.'],
  ['Œil', 'Masquer ou afficher des types d\'éléments (construction, cotes, relations, textes…).'],
  ['Corbeille', 'Supprime la sélection. Une relation ou une cote sélectionnée se supprime de la même façon.'],
];

const STATES = [
  ['Bleu', 'Sous-contraint : l\'élément peut encore bouger.'],
  ['Blanc / noir', 'Entièrement contraint.'],
  ['Rouge', 'Sur-contraint : une relation ou une cote de trop (supprimez-la ou rendez la cote pilotée).'],
  ['Gris', 'Cote pilotée : mesure seulement, sans imposer de valeur.'],
];

/** Remplit el avec l'aide. */
export function buildHelp(el) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sec = (t) => { const d = document.createElement('div'); d.className = 'section-title'; d.textContent = t; el.appendChild(d); };
  const card = (items) => {
    const c = document.createElement('div');
    c.className = 'card help-card';
    for (const it of items) {
      const r = document.createElement('div');
      r.className = 'help-item';
      r.innerHTML = `${it.icon ? `<span class="help-icon">${it.icon}</span>` : ''}<div class="help-text"><div class="help-name">${esc(it.name)}</div><div class="help-desc">${esc(it.desc)}</div></div>`;
      c.appendChild(r);
    }
    el.appendChild(c);
  };
  const intro = document.createElement('div');
  intro.className = 'row-note help-intro';
  intro.textContent = 'Esquisse 2D fonctionne comme l\'esquisse de SOLIDWORKS : on trace d\'abord la forme à peu près, puis les relations et les cotes la rendent exacte. Choisissez un outil dans la barre du haut ; l\'indication sous la barre dit quoi toucher.';
  el.appendChild(intro);
  sec('Gestes et boutons');
  card(GESTURES.map(([name, desc]) => ({ name, desc })));
  sec('Couleurs d\'état');
  card(STATES.map(([name, desc]) => ({ name, desc })));
  for (const g of GROUPS) {
    sec('Outils · ' + g.label);
    card(g.tools.map((t) => ({ icon: icon(t.icon), name: t.label, desc: TOOL_HELP[t.id] || t.sub || '' })));
  }
  sec('Relations');
  const relNote = document.createElement('div');
  relNote.className = 'row-note help-intro';
  relNote.textContent = 'Sélectionnez un ou plusieurs éléments : les relations possibles s\'affichent ; touchez-en une pour l\'ajouter. Les relations sont représentées par une petite case à côté de l\'élément ; touchez-la puis la corbeille pour la retirer.';
  el.appendChild(relNote);
  card(Object.keys(REL_HELP).map((k) => ({ icon: `<span class="help-glyph">${esc(k === 'pattern' ? '×N' : REL_GLYPH[k])}</span>`, name: REL_LABEL[k], desc: REL_HELP[k] })));
  sec('Cotes');
  card([
    { name: 'Cote pilotante', desc: 'Impose sa valeur : la géométrie s\'ajuste. Double toucher pour la modifier.' },
    { name: 'Cote pilotée', desc: 'Sélectionnez une cote puis « Rendre pilotée » : elle mesure sans imposer (en gris). Utile quand une cote serait de trop.' },
    { name: 'Première cote', desc: 'La première cote met tout le dessin à l\'échelle, pour garder les proportions tracées à main levée.' },
  ]);
  sec('Fichiers');
  card([
    { name: 'Enregistrer / Ouvrir', desc: 'Les esquisses sont gardées sur l\'appareil (fonctionne sans réseau), avec une miniature.' },
    { name: 'Importer un DXF', desc: 'Ajoute les lignes, cercles, arcs et textes d\'un fichier DXF à l\'esquisse en cours.' },
    { name: 'Exporter', desc: 'DXF (AutoCAD 2000), PDF vectoriel ou image PNG, à partager.' },
  ]);
}

// Bandeau d'infos : ligne 1 = élément sélectionné, ligne 2 = état de l'esquisse.
import { icon } from './icons.js';
import { fmtLength, fmtAngle } from '../core/units.js';
import { entityLength } from '../core/query.js';
import { sub, angleOf, arcInfo, normAngle } from '../core/geom.js';
import { ORIGIN_ID } from '../core/model.js';
import { isDimension } from '../core/solver.js';
import { REL_LABEL, dimMeasure } from '../render/annotations.js';

const STATE_TEXT = { empty: 'Esquisse vide', under: 'Sous-contrainte', full: 'Entièrement contrainte', over: 'Sur-contrainte' };

export class InfoBar {
  constructor(app, els) {
    this.app = app;
    this.els = els;
    els.del.innerHTML = icon('trash');
    els.del.addEventListener('click', (e) => { e.preventDefault(); app.deleteSelection(); });
    els.main.addEventListener('click', (e) => { e.preventDefault(); app.editSelectedValue(); });
  }

  update() {
    const { sketch, selection, analysis, settings } = this.app;
    const els = this.els;
    const colors = this.app.colors();
    const S = settings.data;
    let main = '', extra = '', editable = false, muted = false;
    if (this.app.measureText) { main = this.app.measureText; extra = this.app.measureExtra || ''; }
    else if (selection.size === 0) { main = 'Aucune sélection'; muted = true; }
    else if (selection.size > 1) { main = describeMany(sketch, selection); }
    else {
      const id = [...selection][0];
      const e = sketch.entities.get(id);
      const p = sketch.points.get(id);
      const k = sketch.constraints.get(id);
      const t = sketch.texts.get(id);
      if (t) {
        main = `Texte « ${t.text.length > 40 ? t.text.slice(0, 39) + '…' : t.text} »`;
        extra = `Hauteur ${fmtLength(t.size, S)} · double tap : modifier`;
      } else if (e && e.type === 'line' && e.infinite) {
        const a = sketch.points.get(e.p1), b = sketch.points.get(e.p2);
        main = 'Ligne infinie';
        extra = `Angle ${fmtAngle(normAngle(angleOf(sub(b, a))), S)}`;
      } else if (e && e.type === 'line') {
        const a = sketch.points.get(e.p1), b = sketch.points.get(e.p2);
        main = `${entityName(e)} · ${fmtLength(entityLength(sketch, e), S)}`;
        extra = `Angle ${fmtAngle(normAngle(angleOf(sub(b, a))), S)}`;
        editable = true;
      } else if (e && e.type === 'circle') {
        main = `${entityName(e)} · R ${fmtLength(e.r, S)}`;
        extra = `Ø ${fmtLength(2 * e.r, S)}`;
        editable = true;
      } else if (e && e.type === 'arc') {
        const info = arcInfo(sketch.points.get(e.c), sketch.points.get(e.s), sketch.points.get(e.e), e.ccw);
        main = `${entityName(e)} · R ${fmtLength(info.r, S)}`;
        extra = `Angle ${fmtAngle(info.sweep, S)} · Longueur ${fmtLength(info.length, S)}`;
        editable = true;
      } else if (p) {
        main = pointName(sketch, p);
        extra = `X ${fmtLength(p.x, S)} · Y ${fmtLength(p.y, S)}`;
      } else if (k && k.type === 'ordZero') {
        main = 'Cote ordinale 0';
        extra = 'Référence des cotes ordinales · la supprimer supprime aussi ses cotes';
      } else if (k && isDimension(k)) {
        const v = k.driven ? dimMeasure(sketch, k) : k.value;
        main = `${dimName(k)} ${k.type === 'dimAngle' ? fmtAngle(v, S) : fmtLength(v, S)}`;
        const over = analysis.constraints.get(k.id) === 'over';
        extra = (k.sym ? 'Symétrique par rapport à l\'axe · ' : '') + (k.driven ? 'Cote pilotée (mesure seule)'
          : k.broken ? 'Valeur impossible : modifiez-la, rendez-la pilotée ou supprimez une relation'
          : over ? 'Sur-contraint : rendez une cote pilotée ou supprimez une relation' : 'Cote pilotante · double tap pour modifier');
        editable = !k.driven;
      } else if (k && k.type === 'pattern') {
        main = `Répétition ${k.kind === 'lin' ? 'linéaire' : 'circulaire'} · ${k.n} occurrences`;
        extra = (k.even ? (k.full ? 'Tour complet · ' : 'Espacement constant · ') : '') + 'double tap sur la case pour changer le nombre · corbeille pour délier les pièces';
      } else if (k) {
        main = `Relation : ${REL_LABEL[k.type] || k.type}`;
        extra = 'Corbeille pour la supprimer';
      }
    }
    els.main.textContent = main;
    els.main.classList.toggle('editable', editable);
    els.main.classList.toggle('muted', muted);
    els.extra.textContent = extra;
    els.del.hidden = selection.size === 0 || (selection.size === 1 && selection.has(ORIGIN_ID));
    els.state.textContent = this.app.message || STATE_TEXT[analysis.state] || '';
    els.state.style.color = this.app.message ? colors.over : (analysis.state === 'empty' ? '' : colors[analysis.state]);
  }
}

// ---------- Noms des éléments sélectionnés ----------
const ENTITY_NAMES = { line: ['Ligne', 'Lignes'], circle: ['Cercle', 'Cercles'], arc: ['Arc', 'Arcs'] };
const CONSTR_NAMES = { line: ['Ligne de construction', 'Lignes de construction'], circle: ['Cercle de construction', 'Cercles de construction'], arc: ['Arc de construction', 'Arcs de construction'] };

function entityName(e, plural = false) {
  if (e.type === 'line' && e.infinite) return plural ? 'Lignes infinies' : 'Ligne infinie';
  return (e.construction ? CONSTR_NAMES : ENTITY_NAMES)[e.type][plural ? 1 : 0];
}
/** Point : origine, point d'esquisse (outil Point), centre d'un arc / cercle, ou extrémité. */
function pointName(sk, p, plural = false) {
  if (p.id === ORIGIN_ID) return 'Origine';
  if (p.sketchPoint) return plural ? 'Points d\'esquisse' : 'Point d\'esquisse';
  const ents = sk.entitiesOfPoint(p.id);
  if (ents.length && ents.every((e) => e.type !== 'line' && e.c === p.id)) return plural ? 'Centres' : 'Centre';
  return plural ? 'Points' : 'Point';
}
function dimName(k) {
  if (k.ord) return 'Cote ordinale';
  return { dimRadius: 'Rayon', dimAngle: 'Angle', dimHorizontal: 'Cote horizontale', dimVertical: 'Cote verticale' }[k.type] || 'Cote';
}
/** Plusieurs éléments : « 2 Lignes · 1 Cercle · 3 Points ». */
function describeMany(sk, selection) {
  const counts = new Map();
  const add = (sing, plur) => { const c = counts.get(sing) || { n: 0, plur }; c.n++; counts.set(sing, c); };
  for (const id of selection) {
    const e = sk.entities.get(id), p = sk.points.get(id), k = sk.constraints.get(id);
    if (sk.texts.has(id)) add('Texte', 'Textes');
    else if (e) add(entityName(e), entityName(e, true));
    else if (p) add(pointName(sk, p), pointName(sk, p, true));
    else if (k && (isDimension(k) || k.type === 'ordZero')) add('Cote', 'Cotes');
    else if (k) add('Relation', 'Relations');
  }
  return [...counts].map(([sing, c]) => `${c.n} ${(c.n > 1 ? c.plur : sing).toLowerCase()}`).join(' · ');
}

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
    else if (selection.size > 1) { main = `${selection.size} éléments`; extra = 'Choisissez une relation ci-dessus'; }
    else {
      const id = [...selection][0];
      const e = sketch.entities.get(id);
      const p = sketch.points.get(id);
      const k = sketch.constraints.get(id);
      if (e && e.type === 'line') {
        const a = sketch.points.get(e.p1), b = sketch.points.get(e.p2);
        main = `Longueur ${fmtLength(entityLength(sketch, e), S)}`;
        extra = `Angle ${fmtAngle(normAngle(angleOf(sub(b, a))), S)}`;
        editable = true;
      } else if (e && e.type === 'circle') {
        main = `Rayon ${fmtLength(e.r, S)}`;
        extra = `Ø ${fmtLength(2 * e.r, S)}`;
        editable = true;
      } else if (e && e.type === 'arc') {
        const info = arcInfo(sketch.points.get(e.c), sketch.points.get(e.s), sketch.points.get(e.e), e.ccw);
        main = `Rayon ${fmtLength(info.r, S)}`;
        extra = `Angle ${fmtAngle(info.sweep, S)} · Longueur ${fmtLength(info.length, S)}`;
        editable = true;
      } else if (p) {
        main = p.id === ORIGIN_ID ? 'Origine' : 'Point';
        extra = `X ${fmtLength(p.x, S)} · Y ${fmtLength(p.y, S)}`;
      } else if (k && k.type === 'ordZero') {
        main = 'Cote ordinale 0';
        extra = 'Référence des cotes ordinales · la supprimer supprime aussi ses cotes';
      } else if (k && isDimension(k)) {
        const v = k.driven ? dimMeasure(sketch, k) : k.value;
        main = `Cote ${k.type === 'dimAngle' ? fmtAngle(v, S) : fmtLength(v, S)}`;
        const over = analysis.constraints.get(k.id) === 'over';
        extra = k.driven ? 'Cote pilotée (mesure seule)'
          : k.broken ? 'Valeur impossible : modifiez-la, rendez-la pilotée ou supprimez une relation'
          : over ? 'Sur-contraint : rendez une cote pilotée ou supprimez une relation' : 'Cote pilotante · double tap pour modifier';
        editable = !k.driven;
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

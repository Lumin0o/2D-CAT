// Fenêtres « Aimantation et grille », « Affichage » et « Fichiers ».
import { popoverItem, popoverTitle, switchRow } from './popover.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';
import { VIS_TYPES, DEFAULT_VISIBILITY } from '../core/visibility.js';

/** Types d'aimantation, dans l'ordre de la fenêtre (clé de settings.snapTypes, libellé). */
export const SNAP_TYPES = [
  ['points', 'Extrémités et centres'],
  ['midpoints', 'Milieux'],
  ['quadrants', 'Quadrants'],
  ['intersections', 'Intersections'],
  ['onEntity', 'Sur les entités'],
  ['horizontal', 'Horizontale'],
  ['vertical', 'Verticale'],
  ['tangent', 'Tangence des arcs'],
];

export function openSnapPopover(app, anchor) {
  app.popovers.toggle({
    anchor, side: 'above', width: 250,
    build: (el) => {
      const S = app.settings;
      const rows = [];      // [ligne, actif ?]
      const refresh = () => {
        const master = !!S.get('snap');
        for (const [row, extra] of rows) {
          const off = !master || (!!extra && !extra());
          row.classList.toggle('disabled', off);
          row.querySelector('.switch').disabled = off;
        }
      };
      const sub = (label, value, onChange, extra) => {
        const row = switchRow(label, value, onChange);
        row.classList.add('sub');
        rows.push([row, extra]);
        el.appendChild(row);
        return row;
      };
      el.appendChild(popoverTitle('Aimantation'));
      el.appendChild(switchRow('Aimant', S.get('snap'), (on) => { S.set('snap', on); refresh(); }));
      for (const [key, label] of SNAP_TYPES) {
        sub(label, app.snapTypes()[key], (on) => S.set('snapTypes', { ...app.snapTypes(), [key]: on }));
      }
      // la grille s'affiche avec le bouton voisin ; l'interrupteur reste réglable même grille masquée
      sub('Grille', S.get('gridSnap'), (on) => S.set('gridSnap', on));
      refresh();
    },
  });
}

/**
 * Fenêtre « Affichage » (bouton œil) : un interrupteur par type d'élément, plus « Tout afficher » et
 * « Tout masquer » (actif quand tout est affiché, ou tout masqué ; le couper fait l'inverse).
 */
export function openVisibilityPopover(app, anchor) {
  app.popovers.toggle({
    anchor, side: 'below', width: 250,
    build: (el) => {
      const S = app.settings;
      const cur = () => ({ ...DEFAULT_VISIBILITY, ...(S.get('visibility') || {}) });
      const setAll = (on) => S.set('visibility', Object.fromEntries(VIS_TYPES.map(([k]) => [k, on])));
      const render = () => {
        el.innerHTML = '';
        const v = cur();
        const all = VIS_TYPES.every(([k]) => v[k]), none = VIS_TYPES.every(([k]) => !v[k]);
        el.appendChild(popoverTitle('Affichage'));
        el.appendChild(switchRow('Tout afficher', all, (on) => { setAll(on); render(); }));
        el.appendChild(switchRow('Tout masquer', none, (on) => { setAll(!on); render(); }));
        el.appendChild(document.createElement('div')).className = 'popover-sep';
        for (const [key, label] of VIS_TYPES) {
          const row = switchRow(label, v[key], (on) => { S.set('visibility', { ...cur(), [key]: on }); render(); });
          row.classList.add('sub');
          el.appendChild(row);
        }
        app.popovers.position();
      };
      render();
    },
  });
}

export function openFilesPopover(app, anchor) {
  const later = (n) => () => showToast(`Disponible à l'étape ${n}`);
  app.popovers.toggle({
    anchor, side: 'above', width: 240,
    build: (el) => {
      el.appendChild(popoverTitle('Fichiers'));
      el.appendChild(popoverItem({ icon: icon('select'), label: 'Nouvelle esquisse', onTap: () => { app.popovers.close(); app.newSketch(); } }));
      el.appendChild(document.createElement('div')).className = 'popover-sep';
      el.appendChild(popoverItem({ icon: icon('save'), label: 'Enregistrer', disabled: true, onTap: later(4) }));
      el.appendChild(popoverItem({ icon: icon('open'), label: 'Charger', disabled: true, onTap: later(4) }));
      el.appendChild(popoverItem({ icon: icon('import'), label: 'Importer DXF', disabled: true, onTap: later(4) }));
      el.appendChild(popoverItem({ icon: icon('export'), label: 'Exporter DXF', disabled: true, onTap: later(4) }));
      el.appendChild(popoverItem({ icon: icon('pdf'), label: 'Exporter PDF', disabled: true, onTap: later(4) }));
      el.appendChild(popoverItem({ icon: icon('image'), label: 'Exporter image', disabled: true, onTap: later(4) }));
    },
  });
}

// Fenêtres « Aimantation et grille » et « Fichiers ».
import { popoverItem, popoverTitle, switchRow } from './popover.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

export function openSnapPopover(app, anchor) {
  app.popovers.toggle({
    anchor, side: 'above', width: 240,
    build: (el) => {
      el.appendChild(popoverTitle('Aimantation'));
      el.appendChild(switchRow('Aimant', app.settings.get('snap'), (on) => app.settings.set('snap', on)));
      // la grille s'affiche avec le bouton voisin ; l'aimantation à la grille n'agit que si elle est affichée
      const sub = switchRow('Aimanter à la grille', app.settings.get('gridSnap'), (on) => app.settings.set('gridSnap', on));
      const gridOn = !!app.settings.get('grid');
      sub.classList.toggle('disabled', !gridOn);
      sub.querySelector('.switch').disabled = !gridOn;
      el.appendChild(sub);
      if (!gridOn) {
        const note = document.createElement('div');
        note.className = 'popover-note';
        note.textContent = 'Affichez la grille (bouton à droite) pour aimanter dessus.';
        el.appendChild(note);
      }
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

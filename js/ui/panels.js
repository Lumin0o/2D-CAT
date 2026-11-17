// Fenêtres « Aimantation et grille » et « Fichiers ».
import { popoverItem, popoverTitle, switchRow } from './popover.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

export function openSnapPopover(app, anchor) {
  app.popovers.toggle({
    anchor, side: 'above', width: 240,
    build: (el) => {
      el.appendChild(popoverTitle('Aimantation et grille'));
      el.appendChild(switchRow('Aimant', app.settings.get('snap'), (on) => app.settings.set('snap', on)));
      const sub = switchRow('Aimanter à la grille', app.settings.get('gridSnap'), (on) => app.settings.set('gridSnap', on));
      sub.classList.add('sub');
      const sw = sub.querySelector('.switch');
      const setEnabled = (on) => { sub.classList.toggle('disabled', !on); sw.disabled = !on; };
      el.appendChild(switchRow('Grille', app.settings.get('grid'), (on) => { app.settings.set('grid', on); setEnabled(on); }));
      setEnabled(app.settings.get('grid'));
      el.appendChild(sub);
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

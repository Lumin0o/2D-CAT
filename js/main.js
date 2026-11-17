import { App } from './app.js';
import { showToast } from './ui/toast.js';

// Service worker : cache de tous les fichiers pour un fonctionnement 100 % hors ligne.
if ('serviceWorker' in navigator) {
  // Quand une nouvelle version prend la main, on recharge une fois pour l'utiliser tout de suite.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
}
window.__modulesLoaded = true;

/** Enregistre le service worker une fois l'app lancée (sans ralentir le premier chargement). */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const first = !navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.update().catch(() => {});
    if (!first) return;
    const w = reg.installing || reg.waiting;
    if (!w) return;
    showToast('Préparation du mode hors ligne… gardez l\'app ouverte', { ms: 3500 });
    w.addEventListener('statechange', () => {
      if (w.state === 'activated') showToast('Prête : l\'app fonctionne maintenant sans réseau', { ms: 3000 });
      else if (w.state === 'redundant') showToast('Mode hors ligne pas encore prêt : réseau instable, il sera réessayé', { error: true, ms: 3500 });
    });
  }).catch((err) => console.warn('SW', err));
}

// Bloque les gestes parasites de Safari (zoom, double tap, loupe).
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });

const app = new App();
window.app = app;
app.init().then(() => {
  window.__booted = true;
  for (const id of ['boot-fail', 'boot-loading']) { const f = document.getElementById(id); if (f) f.remove(); }
  registerSW();
}).catch((err) => { console.error(err); (window.__bootErrors || []).push('init : ' + (err && err.message)); if (window.__showBootFail) window.__showBootFail(); });

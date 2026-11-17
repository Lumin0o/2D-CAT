// Appui court / appui long sur un bouton, tolérant à un léger mouvement du doigt.
// Robuste aux relâchements perdus (iOS) : un nouvel appui remplace toujours l'appui précédent,
// sinon le bouton pouvait rester « bloqué » et ignorer tous les appuis suivants.
export function pressable(el, { onTap, onLongPress, longMs = () => 500, moveTol = 12 } = {}) {
  let st = null;
  let timer = null;
  const clear = () => { clearTimeout(timer); timer = null; el.classList.remove('pressed'); };

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clear();   // un doigt ne peut pas se poser deux fois : un appui encore « en cours » est un relâchement perdu
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), long: false, cancelled: false };
    el.classList.add('pressed');
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (onLongPress) {
      const cur = st;
      timer = setTimeout(() => {
        if (st !== cur || cur.cancelled) return;
        cur.long = true;
        el.classList.remove('pressed');
        onLongPress(e);
      }, longMs());
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id || st.long) return;
    if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > moveTol) { st.cancelled = true; clear(); }
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null; clear();
    if (e.type === 'pointerup' && !s.long && !s.cancelled && onTap) onTap(e);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // capture perdue sans relâchement (élément recouvert, geste système) : on oublie l'appui
  el.addEventListener('lostpointercapture', (e) => { if (st && e.pointerId === st.id) setTimeout(() => { if (st && st.id === e.pointerId) { st = null; clear(); } }, 0); });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('click', (e) => e.preventDefault());
}

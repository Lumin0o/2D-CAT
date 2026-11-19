// Petite fenêtre modale : message, champ de texte éventuel (nom d'esquisse), boutons.
// Placée en haut de l'écran, pour rester visible au-dessus du clavier de l'iPhone.

/**
 * @param {{title:string, message?:string, input?:{value?:string, placeholder?:string},
 *          buttons:Array<{label:string, value:string, style?:'primary'|'danger'|'cancel'}>,
 *          extra?:HTMLElement, onInput?:(input:HTMLInputElement)=>void}} opts   extra : contenu affiché sous le champ
 * @returns {Promise<{button:string, value:string}>}  button : value du bouton (« cancel » si on touche le fond)
 */
export function showDialog(opts) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'dialog-layer';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');
    const h = document.createElement('div');
    h.className = 'dialog-title';
    h.textContent = opts.title;
    box.appendChild(h);
    if (opts.message) {
      const m = document.createElement('div');
      m.className = 'dialog-msg';
      m.textContent = opts.message;
      box.appendChild(m);
    }
    let input = null;
    if (opts.input) {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'dialog-input';
      input.value = opts.input.value || '';
      input.placeholder = opts.input.placeholder || '';
      input.maxLength = 80;
      input.autocomplete = 'off';
      input.setAttribute('autocapitalize', 'sentences');
      input.enterKeyHint = 'done';
      box.appendChild(input);
      if (opts.onInput) opts.onInput(input);
    }
    const row = document.createElement('div');
    row.className = 'dialog-buttons' + (opts.buttons.length > 2 ? ' stacked' : '');
    let done = false;
    const finish = (button) => {
      if (done) return;
      done = true;
      const value = input ? input.value.trim() : '';
      layer.remove();
      resolve({ button, value });
    };
    for (const b of opts.buttons) {
      const btn = document.createElement('button');
      btn.className = 'dialog-btn ' + (b.style || '');
      btn.textContent = b.label;
      btn.dataset.value = b.value;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (input && b.style === 'primary' && !input.value.trim()) { input.classList.add('invalid'); input.focus(); return; }
        finish(b.value);
      });
      row.appendChild(btn);
    }
    box.appendChild(row);
    if (opts.extra) box.appendChild(opts.extra);       // sous les boutons (le clavier cache le bas de l'écran)
    layer.appendChild(box);
    layer.addEventListener('pointerdown', (e) => { if (e.target === layer) { e.preventDefault(); finish('cancel'); } });
    if (input) {
      input.addEventListener('input', () => input.classList.remove('invalid'));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const p = opts.buttons.find((b) => b.style === 'primary'); if (p && input.value.trim()) finish(p.value); }
        else if (e.key === 'Escape') finish('cancel');
      });
    }
    (document.getElementById('app') || document.body).appendChild(layer);
    if (input) setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

/** Nom proposé pour une nouvelle esquisse : « Esquisse 19/11 ». */
export function defaultName(d = new Date()) {
  const p = (v) => String(v).padStart(2, '0');
  return `Esquisse ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

/** Date courte : « 18/11/2026 19:04 ». */
export function fmtDate(t) {
  const d = new Date(t);
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

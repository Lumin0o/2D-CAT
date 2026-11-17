// Petites fenêtres contextuelles ancrées à un bouton, qui ne débordent jamais de l'écran.
export class PopoverManager {
  constructor(layer, appEl) {
    this.layer = layer;
    this.appEl = appEl;
    this.current = null;
    layer.addEventListener('pointerdown', (e) => { if (e.target === layer) { e.preventDefault(); this.close(); } });
  }
  isOpen() { return !!this.current; }
  close() {
    if (!this.current) return;
    const { el, onClose, anchor } = this.current;
    this.closed = { anchor, t: performance.now() };
    this.current = null;
    el.remove();
    this.layer.classList.remove('open');
    if (onClose) onClose();
  }
  /**
   * Bouton qui ouvre / ferme sa fenêtre. Le toucher quand elle est ouverte la ferme : le toucher
   * ferme d'abord la fenêtre (toucher hors fenêtre), puis le clic qui suit ne doit pas la rouvrir.
   */
  toggle(opts) {
    if (this.current && this.current.anchor === opts.anchor) { this.close(); return null; }
    if (this.closed && this.closed.anchor === opts.anchor && performance.now() - this.closed.t < 700) { this.closed = null; return null; }
    return this.open(opts);
  }
  /**
   * @param {{anchor:Element, side?:'below'|'above'|'right'|'left', build:(el:HTMLElement)=>void, onClose?:()=>void, width?:number}} opts
   */
  open(opts) {
    this.close();
    const el = document.createElement('div');
    el.className = 'popover';
    if (opts.width) el.style.minWidth = opts.width + 'px';
    opts.build(el);
    this.layer.appendChild(el);
    this.layer.classList.add('open');
    this.current = { el, onClose: opts.onClose, anchor: opts.anchor, side: opts.side || 'below' };
    this.position();
    return el;
  }
  position() {
    if (!this.current) return;
    const { el, anchor, side } = this.current;
    const L = this.layer.getBoundingClientRect();
    const A = anchor.getBoundingClientRect();
    const cs = getComputedStyle(this.appEl);
    const safe = {
      top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0,
    };
    const m = 8, gap = 6;
    const minX = safe.left + m, maxX = L.width - safe.right - m;
    const minY = safe.top + m, maxY = L.height - safe.bottom - m;
    el.style.maxHeight = Math.max(120, maxY - minY) + 'px';
    el.style.maxWidth = Math.max(160, maxX - minX) + 'px';
    const w = el.offsetWidth, h = el.offsetHeight;
    const ax = A.left - L.left, ay = A.top - L.top, aw = A.width, ah = A.height;
    let x, y;
    let s = side;
    if (s === 'below' && ay + ah + gap + h > maxY && ay - gap - h >= minY) s = 'above';
    else if (s === 'above' && ay - gap - h < minY && ay + ah + gap + h <= maxY) s = 'below';
    else if (s === 'right' && ax + aw + gap + w > maxX && ax - gap - w >= minX) s = 'left';
    else if (s === 'left' && ax - gap - w < minX && ax + aw + gap + w <= maxX) s = 'right';
    if (s === 'below') { x = ax; y = ay + ah + gap; }
    else if (s === 'above') { x = ax; y = ay - gap - h; }
    else if (s === 'right') { x = ax + aw + gap; y = ay; }
    else { x = ax - gap - w; y = ay; }
    // Adaptation aux bords : s'étend vers la gauche si collé à droite, etc.
    x = Math.max(minX, Math.min(x, maxX - w));
    y = Math.max(minY, Math.min(y, maxY - h));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }
}

/** Élément de liste standard. */
export function popoverItem({ icon, label, sub, active, disabled, indent, onTap }) {
  const b = document.createElement('button');
  b.className = 'popover-item' + (active ? ' active' : '') + (disabled ? ' disabled' : '') + (indent ? ' indent' : '');
  b.innerHTML = `${icon || ''}<span class="txt"><span class="lbl">${label}</span>${sub ? `<br><span class="sub">${sub}</span>` : ''}</span>`;
  b.addEventListener('pointerdown', () => b.classList.add('pressed'));
  const up = () => b.classList.remove('pressed');
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  b.addEventListener('click', (e) => { e.preventDefault(); onTap && onTap(); });
  return b;
}

export function popoverTitle(text) {
  const d = document.createElement('div');
  d.className = 'popover-title';
  d.textContent = text;
  return d;
}

export function switchRow(label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'switch-row';
  const span = document.createElement('span');
  span.textContent = label;
  const sw = document.createElement('button');
  sw.className = 'switch' + (value ? ' on' : '');
  sw.setAttribute('role', 'switch');
  sw.setAttribute('aria-checked', String(!!value));
  sw.addEventListener('click', (e) => {
    e.preventDefault();
    const on = !sw.classList.contains('on');
    sw.classList.toggle('on', on);
    sw.setAttribute('aria-checked', String(on));
    onChange(on);
  });
  row.append(span, sw);
  return row;
}

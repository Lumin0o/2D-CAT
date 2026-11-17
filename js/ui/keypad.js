// Clavier calculatrice intégré (jamais le clavier iOS). Monte du bas de l'écran.
import { evaluate } from '../core/calc.js';
import { fmtNumber } from '../core/units.js';

const PAGE1 = [['2nd', '2nd', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['⌫', 'back', 'fn'],
  ['C', 'clear', 'fn'], ['+/−', 'neg', 'fn'], ['%', '%', 'fn'], ['÷', '÷', 'op']];
const PAGE2 = [['2nd', '2nd', 'fn on'], ['π', 'π', 'fn'], ['√', '√', 'fn'], ['⌫', 'back', 'fn'],
  ['Ans', 'Ans', 'fn'], ['x²', '²', 'fn'], ['′ pi', "'", 'fn'], ['″ po', '"', 'fn']];
const COMMON = [['7', '7'], ['8', '8'], ['9', '9'], ['×', '×', 'op'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['−', '−', 'op'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op']];
const LAST = [[',', ','], ['0', '0'], ['OK', 'ok', 'ok wide']];
const LAST_FLIP = [[',', ','], ['0', '0'], ['⇅', 'flip', 'fn flip'], ['OK', 'ok', 'ok']];
// Après fermeture, le « clic fantôme » iOS (émis quand le doigt se lève) ne doit pas toucher ce qui est dessous :
// on l'ignore jusqu'à 350 ms après le lever du doigt (au plus 1,5 s si le doigt reste posé).
const GUARD_AFTER_UP_MS = 350;
const GUARD_MAX_MS = 1500;

export class Keypad {
  constructor(root) {
    this.root = root;
    this.ans = null;
    root.innerHTML = `<div class="kp-backdrop"></div>
      <div class="kp-sheet">
        <div class="kp-display">
          <div class="kp-top"><span class="kp-title"></span><button class="kp-cancel" aria-label="Annuler">Annuler</button></div>
          <div class="kp-formula"></div>
          <div class="kp-result"></div>
        </div>
        <div class="kp-keys"></div>
      </div>`;
    this.els = {
      title: root.querySelector('.kp-title'), formula: root.querySelector('.kp-formula'),
      result: root.querySelector('.kp-result'), keys: root.querySelector('.kp-keys'),
    };
    root.querySelector('.kp-backdrop').addEventListener('pointerdown', (e) => { e.preventDefault(); this.cancel(); });
    root.querySelector('.kp-cancel').addEventListener('click', (e) => { e.preventDefault(); this.cancel(); });
    this.page = 1;
    this.opts = null;
    this.guardUntil = 0;
    this.guardWaitUp = false;
    document.addEventListener('pointerup', () => {
      if (this.guardWaitUp) { this.guardWaitUp = false; this.guardUntil = performance.now() + GUARD_AFTER_UP_MS; }
    }, true);
    const guard = (e) => { if (performance.now() < this.guardUntil && !root.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
    document.addEventListener('click', guard, true);
  }
  isOpen() { return !!this.opts; }

  /**
   * @param {{title:string, initial?:string, unit?:string, ctx?:object, flip?:boolean, validate?:(v:number)=>string|null, onSubmit:(v:number, o:{flip:boolean})=>void, onCancel?:()=>void}} opts
   *   flip : affiche le bouton ⇅ « Inverser le sens ».
   */
  open(opts) {
    this.opts = opts;
    this.expr = opts.initial || '';
    this.fresh = !!opts.initial;   // la première touche chiffre remplace la valeur proposée
    this.page = 1;
    this.flipped = false;
    this.els.title.textContent = opts.title || '';
    this.renderKeys();
    this.update();
    this.root.hidden = false;
  }
  close() { this.opts = null; this.root.hidden = true; this.guardUntil = performance.now() + GUARD_MAX_MS; this.guardWaitUp = true; }
  cancel() { const o = this.opts; this.close(); if (o && o.onCancel) o.onCancel(); }

  renderKeys() {
    const keys = [...(this.page === 1 ? PAGE1 : PAGE2), ...COMMON, ...(this.opts && this.opts.flip ? LAST_FLIP : LAST)];
    this.els.keys.innerHTML = '';
    for (const [label, action, cls] of keys) {
      const b = document.createElement('button');
      b.className = 'kp-key ' + (cls || '');
      b.textContent = label;
      b.dataset.action = action;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('pressed'); this.press(action); });
      const up = () => b.classList.remove('pressed');
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      this.els.keys.appendChild(b);
    }
  }

  press(a) {
    if (!this.opts) return;
    if (a === '2nd') { this.page = this.page === 1 ? 2 : 1; this.renderKeys(); this.update(); return; }
    if (a === 'ok') { this.submit(); return; }
    if (a === 'flip') { this.flipped = !this.flipped; this.update(); return; }
    if (a === 'clear') { this.expr = ''; this.fresh = false; }
    else if (a === 'back') { this.fresh = false; this.expr = this.expr.endsWith('Ans') ? this.expr.slice(0, -3) : this.expr.slice(0, -1); }
    else if (a === 'neg') {
      this.fresh = false;
      const m = this.expr.match(/^−\((.*)\)$/);
      if (m) this.expr = m[1];
      else if (/^−[\d,]+$/.test(this.expr)) this.expr = this.expr.slice(1);
      else if (/^[\d,]*$/.test(this.expr)) this.expr = '−' + this.expr;
      else this.expr = `−(${this.expr})`;
    } else {
      const startsNew = /^[\d,π√(]$/.test(a) || a === 'Ans';
      if (this.fresh && startsNew) this.expr = '';
      this.fresh = false;
      this.expr += a === '√' ? '√(' : a;
      if (this.page === 2 && a !== "'" ) { this.page = 1; this.renderKeys(); }
    }
    this.update();
  }

  current() {
    const r = evaluate(this.expr, { ...(this.opts.ctx || {}), ans: this.ans });
    if (!r.ok) return { ok: false };
    const msg = this.opts.validate ? this.opts.validate(r.value) : null;
    return msg ? { ok: false, value: r.value, msg } : { ok: true, value: r.value };
  }

  update() {
    const unit = this.opts.unit ? ' ' + this.opts.unit : '';
    const r = this.current();
    this.els.formula.textContent = this.expr || ' ';
    this.els.formula.classList.toggle('invalid', !r.ok && this.expr !== '');
    this.els.formula.classList.toggle('fresh', this.fresh);
    if (r.ok) this.els.result.textContent = `= ${fmtNumber(r.value, 4)}${unit}` + ((r.value < 0) !== this.flipped ? ' · sens inversé' : '');
    else if (r.msg) this.els.result.textContent = r.msg;
    else this.els.result.textContent = this.expr === '' ? `Valeur${unit ? ' en' + unit : ''}` : `Formule incomplète${unit ? ' ·' + unit : ''}`;
    this.els.result.classList.toggle('invalid', !r.ok && this.expr !== '');
    const okBtn = this.els.keys.querySelector('[data-action="ok"]');
    if (okBtn) okBtn.disabled = !r.ok;
    const fl = this.els.keys.querySelector('[data-action="flip"]');
    if (fl) { fl.classList.toggle('on', this.flipped); fl.setAttribute('aria-label', 'Inverser le sens'); }
  }

  submit() {
    const r = this.current();
    if (!r.ok) return;
    const o = this.opts;
    const flip = this.flipped;
    this.ans = r.value;
    this.close();
    o.onSubmit(r.value, { flip });
  }
}

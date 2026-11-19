// Outil Texte : touchez pour poser un texte (saisi dans une petite fenêtre) ; la fenêtre d'options règle la hauteur
// et la couleur des prochains textes. Touchez un texte existant pour le modifier (texte, hauteur, couleur).
// Les textes sont des annotations libres (sk.texts) : hors solveur, ils ne changent pas l'état de l'esquisse.
import { Tool } from './base.js';
import { showDialog } from '../dialog.js';
import { niceStep } from '../../core/geom.js';
import { fmtLengthShort } from '../../core/units.js';

/** Couleurs proposées (null : automatique, la couleur « Textes » du thème). */
export const TEXT_COLORS = [null, '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#8a3ccf', '#8e8e93'];

/** Saisie du contenu d'un texte. @returns {Promise<string|null>} */
export function askText(title, value = '') {
  return showDialog({
    title, input: { value, placeholder: 'Votre texte', maxLength: 200 },
    buttons: [{ label: 'Annuler', value: 'cancel', style: 'cancel' }, { label: 'OK', value: 'ok', style: 'primary' }],
  }).then(({ button, value: v }) => (button === 'ok' && v ? v : null));
}

/**
 * Lignes de la fenêtre d'options pour un texte : contenu (withText), hauteur, couleur.
 * apply(patch) applique { text?, size?, color? }.
 */
export function textRows(tc, t, apply, { withText = true } = {}) {
  const rows = [];
  if (withText) {
    const short = t.text.length > 28 ? t.text.slice(0, 27) + '…' : t.text;
    rows.push({ label: 'Texte', sub: escapeHtml(short), text: 'Modifier', onTap: () => askText('Modifier le texte', t.text).then((v) => { if (v !== null && v !== t.text) apply({ text: v }); }) });
  }
  rows.push({
    label: 'Hauteur', sub: 'Hauteur des lettres', text: fmtLengthShort(t.size, tc.settings),
    onTap: () => tc.lengthKeypad('Hauteur du texte', t.size, (mm) => apply({ size: mm })),
  });
  rows.push({ label: 'Couleur', colors: TEXT_COLORS, value: t.color || null, set: (c) => apply({ color: c }) });
  return rows;
}
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class TextTool extends Tool {
  get usesDrawInput() { return false; }
  reset() { this.edit = null; this.highlight = new Set(); super.reset(); }
  /** Réglages des prochains textes : hauteur (par défaut, lisible au zoom actuel) et couleur. */
  get opts() {
    const o = this.tc.settings.textOpts || {};
    return { size: o.size > 0 ? o.size : defaultSize(this.tc), color: o.color || null };
  }
  setOpts(patch) { this.tc.setSetting('textOpts', { ...this.opts, ...patch }); }
  get editing() { const t = this.edit && this.tc.sketch.texts.get(this.edit); return t || null; }
  hint() {
    if (this.editing) return 'Réglez le texte dans la fenêtre · touchez ailleurs pour en poser un autre';
    return 'Touchez l\'endroit du texte · touchez un texte pour le modifier';
  }
  options() {
    const t = this.editing;
    if (t) {
      return textRows(this.tc, t, (patch) => {
        Object.assign(t, patch);
        if (patch.size || 'color' in patch) this.setOpts({ ...(patch.size ? { size: patch.size } : {}), ...('color' in patch ? { color: patch.color } : {}) });
        this.tc.commit('Texte modifié');
        this.after();
      });
    }
    const o = this.opts;
    return textRows(this.tc, { text: '', size: o.size, color: o.color }, (patch) => { this.setOpts(patch); this.after(); }, { withText: false });
  }
  actions() {
    if (!this.editing) return [];
    return [
      { label: 'Modifier le texte', glyph: 'T', run: () => this.editContent() },
      { label: 'Supprimer', glyph: '✕', run: () => { this.tc.sketch.texts.delete(this.edit); this.edit = null; this.highlight = new Set(); this.tc.commit('Suppression du texte'); this.after(); } },
    ];
  }
  after() { this.tc.updateToolOptions(); this.updateHint(); this.tc.refreshUI(); }
  editContent() {
    const t = this.editing;
    if (!t) return;
    askText('Modifier le texte', t.text).then((v) => {
      if (v === null || !this.tc.sketch.texts.has(t.id)) return;
      t.text = v;
      this.tc.commit('Texte modifié');
      this.after();
    });
  }
  onRelease(wp) {
    const s = this.tc.snap(wp);
    this.cursor = null;
    this.press = null;
    const hit = this.tc.hitText(wp);
    if (hit) {
      this.edit = hit === this.edit ? null : hit;
      this.highlight = new Set(this.edit ? [this.edit] : []);
      this.after();
      return;
    }
    this.edit = null;
    this.highlight = new Set();
    this.after();
    const pos = { x: s.x, y: s.y };
    this.pending = pos;
    this.tc.requestDraw();
    askText('Nouveau texte').then((v) => {
      this.pending = null;
      if (v === null) { this.tc.requestDraw(); return; }
      const o = this.opts;
      const t = this.tc.sketch.addText(pos.x, pos.y, v, { size: o.size, color: o.color });
      this.tc.commit('Texte');
      this.edit = t.id;
      this.highlight = new Set([t.id]);
      this.after();
    });
  }
  onToolbarTap() { if (this.edit) { this.edit = null; this.highlight = new Set(); this.after(); return true; } return false; }
  liveValue() { return this.cursor ? `X ${this.fmtL(this.cursor.x)} · Y ${this.fmtL(this.cursor.y)}` : null; }
  preview(d) {
    const p = this.pending || this.cursor;
    if (p) d.point(p);
  }
}

/** Hauteur proposée : environ 14 px à l'écran, arrondie. */
function defaultSize(tc) {
  const v = tc.pxToWorld(14);
  const st = niceStep(v / 2);
  return Math.max(st, Math.round(v / st) * st);
}

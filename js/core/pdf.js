// PDF vectoriel sans bibliothèque : un contexte qui imite le Canvas 2D (le sous-ensemble utilisé par le rendu)
// et enregistre les tracés en opérateurs PDF. Le même code de rendu sert donc pour l'écran et pour le PDF.
// Texte en Helvetica (police standard des lecteurs PDF, rien à embarquer).

/** Largeurs Helvetica (1/1000 em) des caractères 32 à 126. */
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
/** Caractères hors ASCII utiles (WinAnsi) : code et largeur. */
const EXTRA = { '°': [0xB0, 400], 'Ø': [0xD8, 778], 'ø': [0xF8, 611], '×': [0xD7, 584], '½': [0xBD, 834], '¼': [0xBC, 834], '¾': [0xBE, 834], '·': [0xB7, 278], '’': [0x92, 222], '‘': [0x91, 222], '«': [0xAB, 556], '»': [0xBB, 556], '€': [0x80, 556], '±': [0xB1, 584], '²': [0xB2, 333], '³': [0xB3, 333], 'µ': [0xB5, 556], '–': [0x96, 556], '—': [0x97, 1000], '…': [0x85, 1000], ' ': [0x20, 278], ' ': [0x20, 278], 'œ': [0x9C, 944], 'Œ': [0x8C, 1000] };
// lettres accentuées latines (WinAnsi = Latin-1 pour ces codes) : largeur de la lettre de base
for (const [chars, w] of [['àáâãäå', 556], ['èéêë', 556], ['ìíîï', 278], ['òóôõö', 556], ['ùúûü', 556], ['ç', 500], ['ñ', 556], ['ýÿ', 500],
  ['ÀÁÂÃÄÅ', 667], ['ÈÉÊË', 667], ['ÌÍÎÏ', 278], ['ÒÓÔÕÖ', 778], ['ÙÚÛÜ', 722], ['Ç', 722], ['Ñ', 722], ['Ý', 667]]) {
  for (const ch of chars) EXTRA[ch] = [ch.charCodeAt(0), w];
}

export function textWidth(str, size, bold = false) {
  const T = bold ? HELV_BOLD : HELV;
  let w = 0;
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) w += T[c - 32];
    else if (EXTRA[ch]) w += EXTRA[ch][1];
    else w += 556;
  }
  return w * size / 1000;
}
/** Chaîne PDF (WinAnsi), avec échappements. */
function pdfString(str) {
  let out = '(';
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    let code = c >= 32 && c <= 126 ? c : EXTRA[ch] ? EXTRA[ch][0] : 63;
    if (code === 40 || code === 41 || code === 92) out += '\\' + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return out + ')';
}

const n = (v) => { const s = (Math.abs(v) < 1e-9 ? 0 : v).toFixed(3); return s.replace(/\.?0+$/, '') || '0'; };

/** Couleur CSS (#rgb, #rrggbb, rgb(), rgba()) → [r, g, b] entre 0 et 1, ou null (transparent). */
function parseColor(c) {
  if (typeof c !== 'string') return [0, 0, 0];
  c = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16) / 255);
  m = /^#([0-9a-f]{6})/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = /^rgba?\(([^)]+)\)/i.exec(c);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length > 3 && p[3] === 0) return null;
    return [p[0] / 255, p[1] / 255, p[2] / 255];
  }
  if (c === 'transparent') return null;
  if (c === 'white') return [1, 1, 1];
  return [0, 0, 0];
}

const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];

/**
 * Contexte de dessin façon Canvas 2D. Les coordonnées (px, Y vers le bas) sont converties en points PDF
 * (Y vers le haut) sur une page de hauteur pageH.
 */
export class PdfContext {
  constructor(pageW, pageH) {
    this.pageW = pageW; this.pageH = pageH;
    this.ops = ['1 J 1 j'];
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.path = [];          // ['m'|'l'|'c'|'h', ...coords device]
    this.cur = null;         // point courant (espace utilisateur)
    this.strokeStyle = '#000'; this.fillStyle = '#000';
    this.lineWidth = 1; this.lineCap = 'round'; this.lineJoin = 'round';
    this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this.dash = [];
    this.canvas = { width: pageW, height: pageH };
  }
  // ---- état ----
  save() { this.stack.push({ m: [...this.m], strokeStyle: this.strokeStyle, fillStyle: this.fillStyle, lineWidth: this.lineWidth, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, dash: [...this.dash], globalAlpha: this.globalAlpha }); }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
  transform(a, b, c, d, e, f) { this.m = mul(this.m, [a, b, c, d, e, f]); }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  rotate(t) { const c = Math.cos(t), s = Math.sin(t); this.transform(c, s, -s, c, 0, 0); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  setLineDash(d) { this.dash = [...(d || [])]; }
  getLineDash() { return [...this.dash]; }
  clip() { /* non utilisé à l'export */ }
  clearRect() {}
  // ---- chemins ----
  dev(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], this.pageH - (m[1] * x + m[3] * y + m[5])]; }
  beginPath() { this.path = []; this.cur = null; }
  moveTo(x, y) { this.path.push(['m', ...this.dev(x, y)]); this.cur = [x, y]; this.start = [x, y]; }
  lineTo(x, y) { if (!this.cur) { this.moveTo(x, y); return; } this.path.push(['l', ...this.dev(x, y)]); this.cur = [x, y]; }
  closePath() { this.path.push(['h']); if (this.start) this.cur = this.start; }
  bezierCurveTo(x1, y1, x2, y2, x, y) {
    if (!this.cur) this.moveTo(x1, y1);
    this.path.push(['c', ...this.dev(x1, y1), ...this.dev(x2, y2), ...this.dev(x, y)]); this.cur = [x, y];
  }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  /** Arc façon Canvas (angles dans l'espace utilisateur), en courbes de Bézier de 90° au plus. */
  arc(x, y, r, a1, a2, anticlockwise = false) {
    const TAU = Math.PI * 2;
    let sweep;
    if (!anticlockwise) sweep = a2 - a1 >= TAU ? TAU : (((a2 - a1) % TAU) + TAU) % TAU;
    else sweep = a1 - a2 >= TAU ? -TAU : -((((a1 - a2) % TAU) + TAU) % TAU);
    const p0 = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
    if (this.cur) this.lineTo(...p0); else this.moveTo(...p0);
    const segs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const d = sweep / segs, k = 4 / 3 * Math.tan(d / 4);
    let a = a1;
    for (let i = 0; i < segs; i++) {
      const b = a + d;
      const c0 = Math.cos(a), s0 = Math.sin(a), c1 = Math.cos(b), s1 = Math.sin(b);
      this.bezierCurveTo(x + r * (c0 - k * s0), y + r * (s0 + k * c0), x + r * (c1 + k * s1), y + r * (s1 - k * c1), x + r * c1, y + r * s1);
      a = b;
    }
  }
  arcTo(x1, y1, x2, y2) { this.lineTo(x1, y1); this.lineTo(x2, y2); }
  scaleFactor() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }
  emitPath() {
    const out = [];
    for (const p of this.path) {
      if (p[0] === 'h') out.push('h');
      else out.push(p.slice(1).map(n).join(' ') + ' ' + p[0]);
    }
    return out.join('\n');
  }
  stroke() {
    const col = parseColor(this.strokeStyle);
    if (!col || !this.path.length || this.globalAlpha <= 0.02) return;
    const k = this.scaleFactor();
    const dash = this.dash.length ? `[${this.dash.map((v) => n(v * k)).join(' ')}] 0 d` : '[] 0 d';
    this.ops.push(`${col.map(n).join(' ')} RG ${n(this.lineWidth * k)} w ${dash}\n${this.emitPath()}\nS`);
  }
  fill() {
    const col = parseColor(this.fillStyle);
    if (!col || !this.path.length || this.globalAlpha <= 0.02) return;
    this.ops.push(`${col.map(n).join(' ')} rg\n${this.emitPath()}\nf`);
  }
  fillRect(x, y, w, h) { const saved = this.path, cur = this.cur; this.beginPath(); this.rect(x, y, w, h); this.fill(); this.path = saved; this.cur = cur; }
  strokeRect(x, y, w, h) { const saved = this.path, cur = this.cur; this.beginPath(); this.rect(x, y, w, h); this.stroke(); this.path = saved; this.cur = cur; }
  // ---- texte ----
  fontInfo() {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return { size: m ? parseFloat(m[1]) : 10, bold: /bold|[6-9]00/.test(this.font) };
  }
  measureText(t) { const f = this.fontInfo(); return { width: textWidth(String(t), f.size, f.bold) }; }
  fillText(t, x, y) {
    t = String(t);
    const col = parseColor(this.fillStyle);
    if (!col) return;
    const { size, bold } = this.fontInfo();
    const w = textWidth(t, size, bold);
    let dx = 0, dy = 0;
    if (this.textAlign === 'center') dx = -w / 2; else if (this.textAlign === 'right' || this.textAlign === 'end') dx = -w;
    if (this.textBaseline === 'middle') dy = 0.35 * size; else if (this.textBaseline === 'top') dy = 0.75 * size; else if (this.textBaseline === 'bottom') dy = -0.2 * size;
    // repère du texte : axe X le long de la transformation, axe Y vers le haut (l'écran a Y vers le bas)
    const m = this.m;
    const [px, py] = this.dev(x + dx, y + dy);
    const ux = m[0], uy = -m[1], vx = -m[2], vy = m[3];
    const tm = [ux * size, uy * size, vx * size, vy * size, px, py].map(n).join(' ');
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} 1 Tf ${col.map(n).join(' ')} rg ${tm} Tm ${pdfString(t)} Tj ET`);
  }
}

/**
 * Assemble un PDF d'une page. title : titre du document (métadonnées).
 * @returns {Uint8Array}
 */
export function buildPDF(ctx, { title = 'Esquisse' } = {}) {
  const content = ctx.ops.join('\n');
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(ctx.pageW)} ${n(ctx.pageH)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`);
  objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  objs.push(`<< /Title ${pdfString(title)} /Producer (Esquisse 2D) >>`);
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += String(o).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

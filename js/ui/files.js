// Fichiers : esquisses enregistrées (enregistrer, charger, renommer, supprimer), import / export DXF,
// export PDF et image. Les exports passent par la feuille de partage iOS, sinon par un téléchargement.
import { db } from '../store/db.js';
import { Sketch } from '../core/model.js';
import { exportDXF, parseDXF, addImported } from '../core/dxf.js';
import { PdfContext, buildPDF } from '../core/pdf.js';
import { exportHidden, exportBBox, renderSketch, fitSize, PRINT_COLORS } from '../render/exporter.js';
import { showDialog, defaultName, fmtDate } from './dialog.js';
import { showToast } from './toast.js';
import { icon } from './icons.js';
import { UNITS } from '../core/units.js';

/** Empreinte d'une esquisse sérialisée (détection des modifications non enregistrées). */
export function sketchHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + str.length;
}

/** Nom de fichier sûr, à partir du nom de l'esquisse. */
export function fileBase(name) {
  const s = (name || 'Esquisse').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.-]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^[-.]+|[-.]+$/g, '');
  return s || 'Esquisse';
}

// ---------- Partage / téléchargement ----------
/**
 * Feuille de partage iOS (Enregistrer dans Fichiers, AirDrop, mail…), sinon téléchargement.
 * À appeler directement depuis le toucher (Safari exige un geste de l'utilisateur).
 */
export function shareFile(bytesOrBlob, filename, types) {
  const list = Array.isArray(types) ? types : [types];
  if (navigator.canShare && navigator.share && typeof File === 'function') {
    for (const type of list) {
      const file = new File([bytesOrBlob], filename, { type });
      let ok = false;
      try { ok = navigator.canShare({ files: [file] }); } catch (err) { ok = false; }
      if (!ok) continue;
      // sans titre ni texte : iOS ajouterait sinon un fichier texte au partage
      return navigator.share({ files: [file] }).then(() => true, (err) => {
        if (err && err.name === 'AbortError') return false;      // partage annulé
        download(bytesOrBlob, filename, list[0]);
        return true;
      });
    }
  }
  download(bytesOrBlob, filename, list[0]);
  return Promise.resolve(true);
}
function download(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function dataURLBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- Exports ----------
function exportName(app) { return fileBase(app.project ? app.project.name : 'Esquisse'); }
function exportView(app) {
  const sk = app.sketch;
  const H = exportHidden(sk, app.hidden());
  const bbox = exportBBox(sk, H);
  return { sk, H, bbox };
}
const nothing = () => showToast('Rien à exporter : l\'esquisse est vide (ou tout est masqué)', { error: true, ms: 3000 });

export function exportDXFFile(app) {
  const unit = app.settings.get('unit');
  const H = app.hidden();
  const { text, count } = exportDXF(app.sketch, { unit, skip: (e) => !!(H && H.ents.has(e.id)), skipText: (t) => !!(H && H.texts && H.texts.has(t.id)) });
  if (!count) { nothing(); return; }
  shareFile(new TextEncoder().encode(text), exportName(app) + '.dxf', ['application/dxf', 'image/vnd.dxf', 'application/octet-stream', 'text/plain'])
    .then((shown) => { if (shown) showToast(`DXF : ${count} entité${count > 1 ? 's' : ''}, en ${(UNITS[unit] || UNITS.mm).label}`); });
}

/** Image PNG : fond blanc, côté long 3200 px (vue de 800 px rendue 4 fois plus fine : textes et traits lisibles). */
export function renderPNG(app, { long = 800, dpr = 4 } = {}) {
  const { sk, H, bbox } = exportView(app);
  if (!bbox) return null;
  const pad = 36;
  const { width, height } = fitSize(bbox, long, pad, 240);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  renderSketch(ctx, sk, { width, height, dpr, pad, bbox, hidden: H, settings: app.settings.data });
  return canvas;
}
export function exportPNGFile(app) {
  const canvas = renderPNG(app);
  if (!canvas) { nothing(); return; }
  const bytes = dataURLBytes(canvas.toDataURL('image/png'));
  shareFile(bytes, exportName(app) + '.png', 'image/png');
}

/** PDF A4 vectoriel, orienté selon l'esquisse, avec un cartouche (nom, date, unité). */
export function renderPDF(app) {
  const { sk, H, bbox } = exportView(app);
  if (!bbox) return null;
  const landscape = (bbox.maxX - bbox.minX) >= (bbox.maxY - bbox.minY);
  const A4 = [595.28, 841.89];
  const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
  const dpr = 0.7;                      // px du rendu → points PDF : traits et textes à une taille lisible
  const ctx = new PdfContext(pw, ph);
  const width = pw / dpr, height = ph / dpr;
  const margin = 36 / dpr, foot = 26 / dpr;
  // zone de dessin : la page moins les marges et le cartouche
  renderSketch(ctx, sk, { width, height: height - foot, dpr, pad: margin + 20, bbox, hidden: H, settings: app.settings.data });
  // cartouche
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = '#999999'; ctx.lineWidth = 0.8; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(margin, height - foot - 4); ctx.lineTo(width - margin, height - foot - 4); ctx.stroke();
  ctx.fillStyle = '#333333';
  ctx.font = '11px Helvetica'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const unit = (UNITS[app.settings.get('unit')] || UNITS.mm).label;
  ctx.fillText(`${app.project ? app.project.name : 'Esquisse'}`, margin, height - foot / 2 - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`Cotes en ${unit} · ${fmtDate(Date.now())} · Esquisse 2D`, width - margin, height - foot / 2 - 4);
  return buildPDF(ctx, { title: app.project ? app.project.name : 'Esquisse' });
}
export function exportPDFFile(app) {
  const bytes = renderPDF(app);
  if (!bytes) { nothing(); return; }
  shareFile(bytes, exportName(app) + '.pdf', 'application/pdf');
}

// ---------- Import DXF ----------
export function importDXFFile(app) {
  const input = document.createElement('input');
  input.type = 'file';
  // types « document » seulement : l'iPhone ouvre directement Fichiers (sans Photothèque ni appareil photo)
  input.accept = '.dxf,application/dxf,application/octet-stream,text/plain';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    try {
      const text = await f.text();
      importDXFText(app, text, f.name);
    } catch (err) {
      console.warn(err);
      showToast('Fichier illisible : ' + (err && err.message ? err.message : 'format inconnu'), { error: true, ms: 3500 });
    }
  });
  input.click();
}
/** Ajoute le contenu d'un DXF à l'esquisse en cours (annulable). */
export function importDXFText(app, text, name = 'DXF') {
  const r = parseDXF(text, { defaultUnit: app.settings.get('unit') });
  if (!r.items.length) { showToast('Aucune ligne, cercle, arc ou texte dans ce fichier', { error: true, ms: 3000 }); return 0; }
  if (app.tool) app.setTool(null);
  const ids = addImported(app.sketch, r.items);
  app.selection.clear();
  app.commit('Import DXF');
  app.fitAll();
  const ignored = Object.values(r.skipped).reduce((n, c) => n + c, 0);
  showToast(`${name} : ${ids.length} élément${ids.length > 1 ? 's' : ''} importé${ids.length > 1 ? 's' : ''}` + (ignored ? ` · ${ignored} ignoré${ignored > 1 ? 's' : ''} (hachures, cotes, blocs…)` : '') + (r.unitKnown ? '' : ' · unité non précisée : ' + (UNITS[app.settings.get('unit')] || UNITS.mm).label), { ms: 3500 });
  return ids.length;
}

// ---------- Esquisses enregistrées ----------
/** Nom libre : « Esquisse 19/11 », sinon « Esquisse 19/11 (2) », (3)… */
function uniqueName(base, list) {
  const taken = new Set(list.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} (${i})`.toLowerCase())) return `${base} (${i})`;
}
/** Liste des esquisses enregistrées, dans la fenêtre Enregistrer : toucher un nom le reprend (pour la remplacer). */
function savedList(list, currentId, onPick) {
  const box = document.createElement('div');
  box.className = 'save-list';
  const t = document.createElement('div');
  t.className = 'save-list-title';
  t.textContent = list.length ? `Esquisses enregistrées (${list.length})` : 'Aucune esquisse enregistrée';
  box.appendChild(t);
  if (!list.length) return box;
  const ul = document.createElement('div');
  ul.className = 'save-list-items';
  for (const p of list) {
    const b = document.createElement('button');
    b.className = 'save-list-item' + (p.id === currentId ? ' current' : '');
    b.innerHTML = `<span class="project-thumb small">${p.thumb ? `<img alt="" src="${p.thumb}">` : ''}</span><span class="project-txt"><span class="project-name"></span><span class="project-date">${fmtDate(p.updatedAt)}${p.id === currentId ? ' · ouverte' : ''}</span></span>`;
    b.querySelector('.project-name').textContent = p.name;
    b.addEventListener('click', (e) => { e.preventDefault(); onPick(p.name); });
    ul.appendChild(b);
  }
  box.appendChild(ul);
  return box;
}

/** Miniature (PNG, fond transparent, traits gris lisibles en clair comme en sombre). */
export function thumbnail(app, sk = app.sketch) {
  try {
    const H = exportHidden(sk, null, { dims: false, construction: false });
    const bbox = exportBBox(sk, H);
    const w = 120, h = 84, dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * dpr; canvas.height = h * dpr;
    if (!bbox) return null;
    const colors = { ...PRINT_COLORS, under: '#7d8796', full: '#7d8796', over: '#7d8796', canvasBg: 'rgba(0,0,0,0)' };
    renderSketch(canvas.getContext('2d'), sk, { width: w, height: h, dpr, pad: 8, bbox, hidden: H, colors, settings: app.settings.data });
    return canvas.toDataURL('image/png');
  } catch (err) { console.warn(err); return null; }
}

/** Enregistre l'esquisse en cours sous le nom donné (copy : nouvelle esquisse enregistrée). */
export async function saveProject(app, name, { copy = false, replaceId = null } = {}) {
  const now = Date.now();
  let id = !copy && app.project ? app.project.id : null;
  if (replaceId) id = replaceId;
  const prev = id ? await db.getProject(id) : null;
  if (!id) id = 'pr' + now.toString(36) + Math.random().toString(36).slice(2, 6);
  const rec = {
    id, name, createdAt: prev ? prev.createdAt : now, updatedAt: now,
    sketch: app.sketch.toJSON(), viewport: app.vp.toJSON(), thumb: thumbnail(app),
  };
  await db.putProject(rec);
  if (db.ok === false) { showToast('Enregistrement impossible : stockage indisponible', { error: true, ms: 3500 }); return false; }
  app.setProject({ id, name }, app.sketch.serialize());
  showToast(`Enregistrée : ${name}`);
  return true;
}

/** Fenêtre « Enregistrer » : nom de l'esquisse ; si elle est déjà enregistrée, « Enregistrer une copie ». */
export async function saveDialog(app) {
  const linked = !!app.project;
  const buttons = [{ label: 'Enregistrer', value: 'save', style: 'primary' }];
  if (linked) buttons.push({ label: 'Enregistrer une copie', value: 'copy' });
  buttons.push({ label: 'Annuler', value: 'cancel', style: 'cancel' });
  const saved = await db.listProjects();
  let input = null;
  const r = await showDialog({
    title: linked ? 'Enregistrer l\'esquisse' : 'Enregistrer sous',
    message: linked ? 'Modifiez le nom pour la renommer.' : 'Nom de l\'esquisse :',
    input: { value: linked ? app.project.name : uniqueName(defaultName(), saved), placeholder: 'Nom de l\'esquisse' },
    buttons,
    extra: savedList(saved, app.project ? app.project.id : null, (name) => { if (input) { input.value = name; input.dispatchEvent(new Event('input')); } }),
    onInput: (el) => { input = el; },
  });
  if (r.button === 'cancel' || !r.value) return false;
  const copy = r.button === 'copy';
  // même nom qu'une autre esquisse enregistrée : la remplacer ?
  const same = saved.find((p) => p.name.toLowerCase() === r.value.toLowerCase() && !(app.project && !copy && p.id === app.project.id));
  let replaceId = null;
  if (same) {
    const c = await showDialog({
      title: 'Ce nom existe déjà',
      message: `Une esquisse « ${same.name} » est déjà enregistrée (${fmtDate(same.updatedAt)}). La remplacer ?`,
      buttons: [{ label: 'Remplacer', value: 'replace', style: 'danger' }, { label: 'Annuler', value: 'cancel', style: 'cancel' }],
    });
    if (c.button !== 'replace') return false;
    replaceId = same.id;
    if (app.project && !copy && app.project.id !== same.id) await db.deleteProject(app.project.id);   // renommée par-dessus l'autre
  }
  return saveProject(app, r.value, { copy, replaceId });
}

/**
 * Avant de quitter l'esquisse en cours (ouvrir, nouvelle) : propose de l'enregistrer si elle a des modifications.
 * @returns {Promise<boolean>} true : on peut continuer
 */
export async function confirmLeave(app, action = 'continuer') {
  if (!app.isDirty()) return true;
  const named = app.project ? `« ${app.project.name} »` : 'L\'esquisse en cours';
  const r = await showDialog({
    title: 'Modifications non enregistrées',
    message: `${named} a des modifications non enregistrées.`,
    buttons: [
      { label: 'Enregistrer', value: 'save', style: 'primary' },
      { label: `Ne pas enregistrer et ${action}`, value: 'discard', style: 'danger' },
      { label: 'Annuler', value: 'cancel', style: 'cancel' },
    ],
  });
  if (r.button === 'cancel') return false;
  if (r.button === 'discard') return true;
  if (app.project) return saveProject(app, app.project.name);
  return saveDialog(app);
}

export async function openProject(app, id) {
  const p = await db.getProject(id);
  if (!p) { showToast('Esquisse introuvable', { error: true }); return false; }
  let sk;
  try { sk = Sketch.fromJSON(p.sketch); } catch (err) { showToast('Esquisse illisible', { error: true }); return false; }
  app.loadSketch(sk, { viewport: p.viewport, project: { id: p.id, name: p.name } });
  showToast(`Ouverte : ${p.name}`);
  return true;
}

export async function newSketch(app) {
  if (!(await confirmLeave(app, 'créer une nouvelle'))) return;
  app.loadSketch(new Sketch(), { project: null });
  showToast('Nouvelle esquisse');
}

// ---------- Panneau « Charger » ----------
export class ProjectsPanel {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.className = 'panel projects-panel';
    this.el.hidden = true;
    (document.getElementById('app') || document.body).appendChild(this.el);
  }
  get isOpen() { return !this.el.hidden; }
  async open() { this.el.hidden = false; await this.render(); }
  close() { this.el.hidden = true; }
  async render() {
    const app = this.app;
    const el = this.el;
    const list = await db.listProjects();
    el.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<h2>Esquisses enregistrées</h2>';
    const close = document.createElement('button');
    close.textContent = 'Fermer';
    close.addEventListener('click', (e) => { e.preventDefault(); this.close(); });
    header.appendChild(close);
    el.appendChild(header);
    const body = document.createElement('div');
    body.className = 'panel-body';
    el.appendChild(body);
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'projects-empty';
      empty.textContent = 'Aucune esquisse enregistrée. Utilisez Fichiers › Enregistrer pour en garder une.';
      body.appendChild(empty);
      return;
    }
    const card = document.createElement('div');
    card.className = 'card';
    for (const p of list) {
      const row = document.createElement('div');
      row.className = 'project-row' + (app.project && app.project.id === p.id ? ' current' : '');
      const main = document.createElement('button');
      main.className = 'project-main';
      main.innerHTML = `<span class="project-thumb">${p.thumb ? `<img alt="" src="${p.thumb}">` : ''}</span><span class="project-txt"><span class="project-name"></span><span class="project-date">${fmtDate(p.updatedAt)}${app.project && app.project.id === p.id ? ' · ouverte' : ''}</span></span>`;
      main.querySelector('.project-name').textContent = p.name;
      main.addEventListener('click', async (e) => {
        e.preventDefault();
        if (app.project && app.project.id === p.id && !app.isDirty()) { this.close(); return; }
        if (!(await confirmLeave(app, 'ouvrir'))) return;
        if (await openProject(app, p.id)) this.close();
      });
      const ren = document.createElement('button');
      ren.className = 'project-act'; ren.setAttribute('aria-label', 'Renommer'); ren.innerHTML = icon('rename');
      ren.addEventListener('click', async (e) => {
        e.preventDefault();
        const r = await showDialog({ title: 'Renommer', input: { value: p.name }, buttons: [{ label: 'Renommer', value: 'ok', style: 'primary' }, { label: 'Annuler', value: 'cancel', style: 'cancel' }] });
        if (r.button !== 'ok' || !r.value || r.value === p.name) return;
        const rec = await db.getProject(p.id);
        if (!rec) return;
        rec.name = r.value;
        await db.putProject(rec);
        if (app.project && app.project.id === p.id) app.setProject({ id: p.id, name: r.value });
        this.render();
      });
      const del = document.createElement('button');
      del.className = 'project-act danger'; del.setAttribute('aria-label', 'Supprimer'); del.innerHTML = icon('trash');
      del.addEventListener('click', async (e) => {
        e.preventDefault();
        const r = await showDialog({ title: 'Supprimer l\'esquisse ?', message: `« ${p.name} » sera supprimée définitivement.`, buttons: [{ label: 'Supprimer', value: 'del', style: 'danger' }, { label: 'Annuler', value: 'cancel', style: 'cancel' }] });
        if (r.button !== 'del') return;
        await db.deleteProject(p.id);
        if (app.project && app.project.id === p.id) app.setProject(null);   // l'esquisse reste à l'écran, non enregistrée
        this.render();
      });
      row.append(main, ren, del);
      card.appendChild(row);
    }
    body.appendChild(card);
  }
}

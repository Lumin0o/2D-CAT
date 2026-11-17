// Contrôleur principal : relie modèle, solveur, rendu et interface.
import { Sketch, ORIGIN_ID } from './core/model.js';
import { solve, analyze, isDimension, isAnnotation } from './core/solver.js';
import { History } from './core/history.js';
import { hitTest, entityDistance, entityInsideRect, entityTouchesRect, outwardTangentAt, endpointEntities, keyPoints, closestOnEntity, entityIntersections, entityLength } from './core/query.js';
import { dist, sub, add, mul, norm, perp, dot } from './core/geom.js';
import { UNITS, toDisplay, fromDisplay, fmtNumber } from './core/units.js';
import { Viewport } from './render/viewport.js';
import { Renderer, BADGE_R } from './render/renderer.js';
import { dimLayout, dimLabel, dimMeasure, layoutBadges } from './render/annotations.js';
import { db } from './store/db.js';
import { Settings, applyTheme } from './store/settings.js';
import { Gestures } from './ui/gestures.js';
import { Toolbar } from './ui/toolbar.js';
import { InfoBar } from './ui/infobar.js';
import { PopoverManager } from './ui/popover.js';
import { showToast } from './ui/toast.js';
import { openSnapPopover, openFilesPopover } from './ui/panels.js';
import { SettingsPanel } from './ui/settingsPanel.js';
import { Keypad } from './ui/keypad.js';
import { RelationBar } from './ui/relations.js';
import { TOOL_CLASSES, getTool, groupOf } from './ui/tools/registry.js';
import { icon } from './ui/icons.js';

const HIT_PX = 12;      // zone de toucher élargie autour des traits et points
const SNAP_PX = 14;     // rayon d'aimantation
const DRAG_PX = 6;      // seuil de glissement
const ALIGN_DEG = 3;    // tolérance de redressement horizontal / vertical
const HEAVY = 1e6;      // coût de déplacement des éléments qui doivent rester en place

const seqOf = (id) => parseInt(String(id).slice(1), 36);

export class App {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      app: $('app'), canvasWrap: $('canvas-wrap'), canvas: $('canvas'), hint: $('hint'),
      undo: $('btn-undo'), redo: $('btn-redo'), fit: $('btn-fit'), multi: $('btn-multi'),
      snap: $('btn-snap'), grid: $('btn-grid'), files: $('btn-files'), settings: $('btn-settings'),
      popoverLayer: $('popover-layer'), settingsPanel: $('settings-panel'),
    };
    this.settings = new Settings();
    this.sketch = new Sketch();
    this.vp = new Viewport();
    this.renderer = new Renderer(this.els.canvas, this.vp);
    this.history = new History(200);
    this.selection = new Set();
    this.analysis = analyze(this.sketch);
    this.tool = null;
    this.toolId = null;
    this.drag = null;
    this.box = null;
    this.message = null;
    this.errorIds = null;
    this.multi = false;
    this.touch = false;
    this.finger = null;
    this._pendingSel = [];
    this._seqMark = this.sketch.seq;
    this._colors = null;
    this._drawPending = false;
    this._saveTimer = null;
    this._errTimer = null;
    this.popovers = new PopoverManager(this.els.popoverLayer, this.els.app);
    this.tc = this.makeToolContext();
  }

  async init() {
    await this.settings.load();
    applyTheme(this.settings);

    // Restauration de l'esquisse en cours
    const cur = await db.get('current');
    this._loadFailed = db.ok === false;
    if (cur && cur.sketch) {
      try { this.sketch = Sketch.fromJSON(cur.sketch); } catch (err) { console.warn('Esquisse illisible', err); this.sketch = new Sketch(); }
    }
    this.sketch.cleanupDegenerate();
    solve(this.sketch);
    this._seqMark = this.sketch.seq;
    this.history.init(this.sketch.serialize());
    this.analysis = analyze(this.sketch);

    // Interface
    const $ = (id) => document.getElementById(id);
    this.keypad = new Keypad($('keypad'));
    this.toolbar = new Toolbar(this, {
      bar: $('toolbar'), cells: $('toolbar-cells'), toggle: $('toolbar-toggle'),
      expanded: $('toolbar-expanded'), groups: $('toolbar-groups'), collapse: $('toolbar-collapse'),
    });
    this.infobar = new InfoBar(this, { main: $('info-main'), extra: $('info-extra'), del: $('btn-delete'), state: $('info-state') });
    this.relbar = new RelationBar(this, $('relbar'));
    this.settingsPanel = new SettingsPanel(this, this.els.settingsPanel);

    this.els.undo.innerHTML = icon('undo');
    this.els.redo.innerHTML = icon('redo');
    this.els.fit.innerHTML = icon('fit');
    this.els.multi.innerHTML = icon('multi');
    this.els.snap.querySelector('.bb-icon').innerHTML = icon('magnet');
    this.els.grid.querySelector('.bb-icon').innerHTML = icon('grid');
    this.els.files.querySelector('.bb-icon').innerHTML = icon('folder');
    this.els.settings.querySelector('.bb-icon').innerHTML = icon('gear');
    const click = (el, fn) => el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
    click(this.els.undo, () => this.undo());
    click(this.els.redo, () => this.redo());
    click(this.els.fit, () => this.fitAll());
    click(this.els.multi, () => this.setMulti(!this.multi));
    click(this.els.snap, () => openSnapPopover(this, this.els.snap));
    click(this.els.grid, () => { const on = !this.settings.get('grid'); this.settings.set('grid', on); showToast(on ? 'Grille affichée' : 'Grille masquée'); });
    this.updateGridButton();
    click(this.els.files, () => openFilesPopover(this, this.els.files));
    click(this.els.settings, () => this.settingsPanel.open());

    // Gestes sur le dessin
    this.gestures = new Gestures(this.els.canvas, {
      start: (s, g) => this.onStart(s, g),
      move: (s) => this.onMove(s),
      end: (s, info) => this.onEnd(s, info),
      cancel: () => this.onCancel(),
      pinch: (pc, nc, f) => { this.vp.pan(nc.x - pc.x, nc.y - pc.y); this.vp.zoomAt(nc, f); this.requestDraw(); },
      pinchEnd: () => this.scheduleSave(),
      wheel: (p, f) => { this.vp.zoomAt(p, f); this.requestDraw(); this.scheduleSave(); },
    });

    // Taille / orientation
    this.onResize(cur && cur.viewport);
    if ('ResizeObserver' in window) new ResizeObserver(() => this.onResize()).observe(this.els.canvasWrap);
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 50));
    window.matchMedia('(orientation: landscape)').addEventListener('change', () => { this.popovers.close(); setTimeout(() => { this.onResize(); if (this.toolbar.expanded) this.toolbar.fitExpanded(); }, 50); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(this.settings); this._colors = null; this.requestDraw(); this.infobar.update(); });

    // Réglages → interface
    this.settings.onChange((key) => {
      if (key === 'theme' || key === 'colors' || key === '*') { applyTheme(this.settings); this._colors = null; }
      if (['toolbarRows', 'toolbarCells', 'favorites', 'lastTools', '*'].includes(key)) this.toolbar.render();
      if (key === 'grid' || key === '*') this.updateGridButton();
      if ((key === 'drawInput' || key === '*') && this.tool) this.tool.updateHint();
      this.infobar.update();
      this.requestDraw();
    });

    window.addEventListener('keydown', (e) => this.onKey(e));

    if (cur && cur.toolId && TOOL_CLASSES[cur.toolId]) this.setTool(cur.toolId);
    this.updateUndoButtons();
    this.refreshUI();
    if (this._loadFailed) this.retryLoad();
  }
  /** Le stockage ne répondait pas au démarrage : on réessaie et on restaure l'esquisse si rien n'a été dessiné. */
  async retryLoad(attempt = 0) {
    const cur = await db.get('current');
    if (db.ok === false) { if (attempt < 5) setTimeout(() => this.retryLoad(attempt + 1), 2000); return; }
    this._loadFailed = false;
    if (cur && cur.sketch && !this.history.canUndo() && this.sketch.isEmpty()) {
      try { this.sketch = Sketch.fromJSON(cur.sketch); } catch (err) { return; }
      this.sketch.cleanupDegenerate();
      solve(this.sketch);
      this._seqMark = this.sketch.seq;
      this.history.init(this.sketch.serialize());
      if (cur.viewport) this.vp.fromJSON(cur.viewport);
      this.afterChange();
    }
  }

  // ---------- Contexte fourni aux outils ----------
  makeToolContext() {
    const self = this;
    return {
      get sketch() { return self.sketch; },
      get settings() { return self.settings.data; },
      tolWorld: () => self.vp.pxToWorld(HIT_PX),
      snap: (wp) => self.snap(wp),
      autoAlign: (a, b) => self.autoAlign(a, b),
      resolvePoint: (s) => self.resolvePoint(s),
      commit: (label) => self.commit(label, { auto: true }),
      setHint: (t) => self.setHint(t),
      requestDraw: () => self.requestDraw(),
      toast: (m) => showToast(m),
      deactivate: () => self.setTool(null),
      hitGeometry: (wp) => hitTest(self.sketch, wp, self.vp.pxToWorld(HIT_PX)),
      createDimension: (k, label) => self.createDimension(k, label),
      takeSelection: () => { const ids = self._pendingSel; self._pendingSel = []; return ids; },
      endpointTangent: (pid) => {
        const es = endpointEntities(self.sketch, pid);
        if (!es.length) return null;
        return { dir: outwardTangentAt(self.sketch, es[0], pid), entity: es[0] };
      },
    };
  }

  /**
   * Aimantation : extrémités / centres / origine, intersections, milieux, quadrants, sur entité, puis grille.
   * @param {{excludePoints?:Set<string>, excludeEntities?:Set<string>, pointsOnly?:boolean}} [opt]
   */
  snap(wp, opt = {}) {
    const sk = this.sketch;
    const tol = this.vp.pxToWorld(SNAP_PX);
    if (this.settings.get('snap')) {
      let best = null;
      for (const p of sk.points.values()) {
        if (opt.excludePoints && opt.excludePoints.has(p.id)) continue;
        const d = dist(p, wp);
        if (d <= tol && (!best || d < best.d)) best = { d, p };
      }
      if (best) return { x: best.p.x, y: best.p.y, pointId: best.p.id, kind: best.p.origin ? 'origin' : 'point' };
      if (!opt.pointsOnly) {
        const near = [];
        for (const e of sk.entities.values()) {
          if (opt.excludeEntities && opt.excludeEntities.has(e.id)) continue;
          const d = entityDistance(sk, e, wp);
          if (d <= tol) near.push({ e, d });
        }
        near.sort((a, b) => a.d - b.d);
        near.length = Math.min(near.length, 6);
        let bi = null;
        for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
          for (const p of entityIntersections(sk, near[i].e, near[j].e)) {
            const d = dist(p, wp);
            if (d <= tol && (!bi || d < bi.d)) bi = { d, p, ids: [near[i].e.id, near[j].e.id] };
          }
        }
        if (bi) return { x: bi.p.x, y: bi.p.y, kind: 'intersection', entityIds: bi.ids };
        let bk = null;
        for (const { e } of near) for (const kp of keyPoints(sk, e)) {
          const d = dist(kp, wp);
          if (d <= tol * 0.8 && (!bk || d < bk.d)) bk = { d, kp, e };
        }
        if (bk) return { x: bk.kp.x, y: bk.kp.y, kind: bk.kp.kind, entityId: bk.e.id };
        if (near.length) { const c = closestOnEntity(sk, near[0].e, wp); return { x: c.x, y: c.y, kind: 'on', entityId: near[0].e.id }; }
      }
    }
    if (this.gridSnapOn()) {
      const st = this.gridStep();
      return { x: Math.round(wp.x / st) * st, y: Math.round(wp.y / st) * st, kind: 'grid' };
    }
    return { x: wp.x, y: wp.y, kind: null };
  }

  /** Redresse une ligne presque horizontale ou verticale (si aimantation active et point libre). */
  autoAlign(a, b) {
    const out = { ...b, align: null };
    if (!this.settings.get('snap') || b.pointId || (b.kind && b.kind !== 'grid')) return out;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) < this.vp.pxToWorld(HIT_PX)) return out;
    const tolRad = ALIGN_DEG * Math.PI / 180;
    const ang = Math.abs(Math.atan2(dy, dx));
    if (ang < tolRad || Math.PI - ang < tolRad) { out.y = a.y; out.align = 'h'; }
    else if (Math.abs(ang - Math.PI / 2) < tolRad) { out.x = a.x; out.align = 'v'; }
    return out;
  }

  /** Point existant (accrochage) ou nouveau point, avec la relation automatique correspondante. */
  resolvePoint(s) {
    const sk = this.sketch;
    if (s.pointId && sk.points.has(s.pointId)) return sk.points.get(s.pointId);
    const p = sk.addPoint(s.x, s.y);
    if (s.align) return p;
    const e = s.entityId && sk.entities.get(s.entityId);
    if (s.kind === 'midpoint' && e && e.type === 'line') sk.addConstraint('midpoint', [p.id, e.id]);
    else if ((s.kind === 'on' || s.kind === 'quadrant' || s.kind === 'midpoint') && e) sk.addConstraint('coincident', [p.id, e.id]);
    else if (s.kind === 'intersection' && s.entityIds) for (const id of s.entityIds) if (sk.entities.has(id)) sk.addConstraint('coincident', [p.id, id]);
    return p;
  }

  gridInfo() { return this.renderer.gridInfo((UNITS[this.settings.get('unit')] || UNITS.mm).factor); }
  /** Pas d'aimantation de la grille (mm) : celui des lignes bien visibles. */
  gridStep() { return this.gridInfo().snap; }
  /** Aimantation à la grille : seulement si la grille est affichée et son interrupteur actif. */
  gridSnapOn() { return !!(this.settings.get('grid') && this.settings.get('gridSnap')); }

  // ---------- Couleurs ----------
  colors() {
    if (this._colors) return this._colors;
    const theme = this.settings.resolvedTheme();
    const dark = theme === 'dark';
    const c = this.settings.get('colors')[theme];
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    this._colors = {
      under: c.under, full: c.full, over: c.over,
      selected: dark ? '#ffb340' : '#ff8a00',
      preview: dark ? '#9ad0ff' : '#1f6fe5',
      guide: dark ? '#8a8a90' : '#9a9aa0',
      snap: dark ? '#ffd60a' : '#c98a00',
      origin: dark ? '#ff6b5e' : '#d8392b',
      dim: dark ? '#c9c9ce' : '#3c3c43',
      dimDriven: '#8e8e93',
      badgeBg: dark ? '#1f3d29' : '#d6f2dd',
      badgeFg: dark ? '#7ee29a' : '#1c7a35',
      loupeRing: dark ? '#f2f2f0' : '#3c3c43',
      canvasBg: v('--canvas-bg') || (dark ? '#121214' : '#ffffff'),
      gridPaper: v('--grid-paper') || '#c8763a',
      gridAlpha: parseFloat(v('--grid-alpha')) || 0.8,
      axis: v('--axis') || '#a8a8ae',
      accent: v('--accent') || '#0a84ff',
      green: v('--green') || '#30b14e',
    };
    return this._colors;
  }

  // ---------- Rendu ----------
  requestDraw() {
    if (this._drawPending) return;
    this._drawPending = true;
    requestAnimationFrame(() => { this._drawPending = false; this.draw(); });
  }
  draw() {
    if (!(this.vp.width > 0)) return;
    const t = this.tool;
    let loupe = null, dragMarker = null;
    if (this.touch && this.finger) {
      if (t && t.cursor && !t.noLoupe) loupe = { finger: this.finger, world: t.cursor };
      else if (this.drag && this.drag.active && this.drag.single) { const p = this.sketch.points.get(this.drag.single); if (p) loupe = { finger: this.finger, world: { x: p.x, y: p.y } }; }
    }
    if (this.drag && this.drag.active && this.drag.mergeWith) { const p = this.sketch.points.get(this.drag.mergeWith); if (p) dragMarker = { x: p.x, y: p.y, kind: 'point' }; }
    this.renderer.draw({
      sketch: this.sketch, vp: this.vp, selection: this.selection, analysis: this.analysis,
      colors: this.colors(), settings: this.settings.data,
      grid: { show: this.settings.get('grid'), info: this.gridInfo() },
      tool: t, box: this.box, highlight: t && t.highlight, previewDim: t && t.previewDim,
      errorIds: this.errorIds, loupe, dragMarker,
    });
  }
  onResize(savedViewport) {
    const r = this.els.canvasWrap.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!(w > 0 && h > 0)) return;
    this.renderer.resize(w, h);
    this.vp.resize(w, h);
    if (savedViewport) this.vp.fromJSON(savedViewport);
    this.popovers.position();
    this.requestDraw();
  }
  refreshUI() {
    this.infobar.update();
    this.relbar.update();
    this.requestDraw();
  }

  // ---------- Historique / sauvegarde ----------
  /** Valide une modification : résolution, nettoyage, historique. auto : retire les relations automatiques redondantes. */
  commit(label, { auto = false } = {}) {
    const sk = this.sketch;
    sk.cleanupDegenerate();
    solve(sk);
    if (auto) {
      const an = analyze(sk);
      let removed = false;
      for (const cid of an.over) if (seqOf(cid) >= this._seqMark && !sk.constraints.get(cid)?.broken) { sk.removeConstraint(cid); removed = true; }
      if (removed) solve(sk);
    }
    this.healBroken();
    this._seqMark = sk.seq;
    this.history.push(sk.serialize(), label);
    this.afterChange();
  }
  /** Contraintes en conflit : dès qu'elles redeviennent possibles (valeur, relation supprimée…), elles s'appliquent. */
  healBroken() {
    const sk = this.sketch;
    for (const k of sk.constraints.values()) {
      if (!k.broken) continue;
      if (k.driven) { delete k.broken; continue; }
      const start = this.capturePositions();
      delete k.broken;
      const res = solve(sk);
      if (res.ok && !analyze(sk).over.has(k.id)) continue;
      this.restorePositions(start);
      k.broken = true;
    }
  }
  /** Le sketch a-t-il des conflits non résolus ? */
  hasBroken() { for (const k of this.sketch.constraints.values()) if (k.broken && !k.driven) return true; return false; }
  afterChange() {
    this.message = null;
    this.errorIds = null;
    this.analysis = analyze(this.sketch);
    const sk = this.sketch;
    for (const id of [...this.selection]) if (!sk.entities.has(id) && !sk.points.has(id) && !sk.constraints.has(id)) this.selection.delete(id);
    this.updateUndoButtons();
    this.scheduleSave();
    this.refreshUI();
  }
  undo() { const snap = this.history.undo(); if (snap !== null) this.restore(snap); }
  redo() { const snap = this.history.redo(); if (snap !== null) this.restore(snap); }
  restore(snap) {
    if (this.tool) this.tool.reset();
    this.drag = null; this.box = null;
    this.sketch = Sketch.deserialize(snap);
    this._seqMark = this.sketch.seq;
    this.selection.clear();
    this.afterChange();
  }
  updateUndoButtons() {
    this.els.undo.disabled = !this.history.canUndo();
    this.els.redo.disabled = !this.history.canRedo();
  }
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 400);
  }
  saveNow() {
    if (this._loadFailed && this.sketch.isEmpty()) return Promise.resolve();   // ne pas écraser l'esquisse non relue
    return db.set('current', { sketch: this.sketch.toJSON(), viewport: this.vp.toJSON(), toolId: this.toolId, savedAt: Date.now() });
  }
  newSketch() {
    if (this.sketch.isEmpty()) return;
    this.sketch = new Sketch();
    this.selection.clear();
    if (this.tool) this.tool.reset();
    this.commit('Nouvelle esquisse');
    showToast('Nouvelle esquisse (annulable)');
  }

  // ---------- Outils ----------
  setTool(id) {
    if (this.tool) this.tool.onCancel();
    this.tool = null; this.toolId = null;
    if (id) {
      const Cls = TOOL_CLASSES[id];
      if (!Cls) { this.toolbar.setActive(null); this.setHint(''); return; }
      this._pendingSel = [...this.selection];
      this.selection.clear();
      this.tool = new Cls(this.tc);
      this._pendingSel = [];
      this.toolId = id;
      const g = groupOf(id);
      if (g) this.settings.set('lastTools', { ...this.settings.get('lastTools'), [g.id]: id }, true);
    } else this.setHint('');
    this.toolbar.setActive(this.toolId);
    this.scheduleSave();
    this.refreshUI();
  }
  /** Appui sur une case de la barre (fromVariants : choisi dans la liste des variantes). */
  toolbarTap(toolId, fromVariants = false) {
    if (!TOOL_CLASSES[toolId]) {
      const t = getTool(toolId);
      showToast(t ? `${t.label} : disponible à l'étape ${t.stage}` : 'Outil inconnu');
      return;
    }
    if (this.toolId === toolId && !fromVariants) {
      if (!this.tool.onToolbarTap()) this.setTool(null);
      return;
    }
    this.setTool(toolId);
    if (this.toolbar.expanded) this.toolbar.setExpanded(false);
  }
  updateGridButton() {
    const on = !!this.settings.get('grid');
    this.els.grid.classList.toggle('on', on);
    this.els.grid.setAttribute('aria-pressed', String(on));
  }
  setHint(text) {
    this.els.hint.textContent = text || '';
    this.els.hint.hidden = !text;
  }
  setMulti(on) {
    this.multi = on;
    this.els.multi.classList.toggle('on', on);
    showToast(on ? 'Sélection multiple activée' : 'Sélection simple');
  }

  // ---------- Test de toucher (mode sélection) ----------
  /** Cotes, puis icônes de relations, puis points et entités. */
  hitAt(s, wp) {
    const sk = this.sketch;
    for (const k of sk.constraints.values()) {
      if (!isAnnotation(k)) continue;
      const lay = dimLayout(sk, k);
      if (!lay) continue;
      const t = this.vp.toScreen(lay.text);
      const size = this.renderer.dimTextSize(dimLabel(sk, k, this.settings.data));
      const [hw, hh] = lay.rot ? [size.h / 2, size.w / 2] : [size.w / 2, size.h / 2];
      if (Math.abs(s.x - t.x) <= hw + 5 && Math.abs(s.y - t.y) <= hh + 5) return { type: 'dim', id: k.id };
    }
    let bb = null;
    for (const b of layoutBadges(sk, this.vp)) {
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      if (d <= BADGE_R + 2 && (!bb || d < bb.d)) bb = { d, id: b.cid };
    }
    if (bb) return { type: 'badge', id: bb.id };
    return hitTest(sk, wp, this.vp.pxToWorld(HIT_PX));
  }

  // ---------- Gestes un doigt ----------
  onStart(s, g) {
    this.popovers.close();
    this.touch = !!g && g.type !== 'mouse';
    this.finger = s;
    const wp = this.vp.toWorld(s);
    if (this.tool) { this.tool.onPress(wp); return; }
    this.drag = { hit: this.hitAt(s, wp), startS: s, startW: wp, active: false };
  }
  onMove(s) {
    this.finger = s;
    const wp = this.vp.toWorld(s);
    if (this.tool) { this.tool.onMove(wp); return; }
    const d = this.drag;
    if (!d) return;
    if (!d.active) {
      if (dist(s, d.startS) < DRAG_PX) return;
      d.active = true;
      if (d.hit && (d.hit.id === ORIGIN_ID || d.hit.type === 'badge')) d.hit = null;
      if (d.hit) this.beginDrag(d);
    }
    if (d.hit) this.applyDrag(d, wp);
    else {
      this.box = {
        minX: Math.min(d.startW.x, wp.x), maxX: Math.max(d.startW.x, wp.x),
        minY: Math.min(d.startW.y, wp.y), maxY: Math.max(d.startW.y, wp.y),
        crossing: s.x < d.startS.x,
      };
    }
    this.requestDraw();
  }
  onEnd(s, info) {
    const wp = this.vp.toWorld(s);
    this.finger = null;
    if (this.tool) {
      if (info.cancelled) this.tool.onCancel(); else this.tool.onRelease(wp);
      return;
    }
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.active) {
      if (d.hit) this.endDrag(d);
      else if (this.box) this.finishBox(this.box);
    } else if (!info.cancelled) this.tapSelect(d.hit, info);
    this.box = null;
    this.refreshUI();
  }
  onCancel() {
    this.finger = null;
    if (this.tool) { this.tool.onCancel(); return; }
    const d = this.drag; this.drag = null;
    if (d && d.active && d.start) this.restorePositions(d.start);
    this.box = null;
    this.requestDraw();
  }

  // ---------- Glissement (par le solveur) ----------
  capturePositions() {
    const pts = new Map(), radii = new Map(), dims = new Map();
    for (const p of this.sketch.points.values()) pts.set(p.id, [p.x, p.y]);
    for (const e of this.sketch.entities.values()) if (e.type === 'circle') radii.set(e.id, e.r);
    for (const k of this.sketch.constraints.values()) if (k.pos) dims.set(k.id, { ...k.pos });
    return { pts, radii, dims };
  }
  restorePositions(snap) {
    const sk = this.sketch;
    for (const [id, [x, y]] of snap.pts) { const p = sk.points.get(id); if (p) { p.x = x; p.y = y; } }
    for (const [id, r] of snap.radii) { const e = sk.entities.get(id); if (e) e.r = r; }
    for (const [id, pos] of snap.dims) { const k = sk.constraints.get(id); if (k) k.pos = { ...pos }; }
  }
  beginDrag(d) {
    const sk = this.sketch;
    d.start = this.capturePositions();
    d.good = d.start;
    d.last = d.startW;
    if (d.hit.type === 'dim') { d.mode = 'dim'; return; }
    const items = this.selection.has(d.hit.id) && this.selection.size > 1 ? [...this.selection] : [d.hit.id];
    if (items.length === 1 && d.hit.type === 'point') { d.mode = 'point'; d.single = d.hit.id; return; }
    const e = items.length === 1 ? sk.entities.get(d.hit.id) : null;
    if (e && e.type === 'circle') { d.mode = 'radius'; d.circle = e; return; }
    d.mode = 'translate';
    d.ids = new Set();
    for (const id of items) {
      const en = sk.entities.get(id);
      if (en) for (const pid of sk.entityPointIds(en)) d.ids.add(pid);
      else if (sk.points.has(id)) d.ids.add(id);
    }
    d.ids.delete(ORIGIN_ID);
  }
  applyDrag(d, wp) {
    const sk = this.sketch;
    if (d.mode === 'dim') {
      let k = sk.constraints.get(d.hit.id);
      if (k && k.ord) k = sk.constraints.get(k.ord);     // cote ordinale : on déplace toute la ligne de cotes
      if (k) k.pos = { x: wp.x, y: wp.y };
      return;
    }
    const weights = new Map();
    const grid = this.gridSnapOn() ? this.gridStep() : 0;
    const snapG = (v) => (grid ? { x: Math.round(v.x / grid) * grid, y: Math.round(v.y / grid) * grid } : v);
    if (d.mode === 'point') {
      const p = sk.points.get(d.single);
      if (!p) return;
      let target = snapG(wp);
      d.mergeWith = null;
      if (this.settings.get('snap')) {
        const exclude = new Set([d.single]);
        for (const e of sk.entitiesOfPoint(d.single)) for (const pid of sk.entityPointIds(e)) exclude.add(pid);
        const s = this.snap(wp, { excludePoints: exclude, pointsOnly: true });
        if (s.pointId) { target = { x: s.x, y: s.y }; d.mergeWith = s.pointId; }
      }
      p.x = target.x; p.y = target.y;
      weights.set(d.single, HEAVY);
    } else if (d.mode === 'radius') {
      const c = sk.points.get(d.circle.c);
      d.circle.r = Math.max(this.vp.pxToWorld(2), dist(c, wp));
      weights.set(d.circle.id, HEAVY);
    } else {
      const delta = snapG(sub(wp, d.last));
      if (delta.x === 0 && delta.y === 0) return;
      for (const pid of d.ids) { const p = sk.points.get(pid); if (p) { p.x += delta.x; p.y += delta.y; weights.set(pid, HEAVY); } }
      d.pendingLast = add(d.last, delta);
    }
    const res = solve(sk, { weights, maxIter: 40 });
    if (!res.ok) { this.restorePositions(d.good); return; }
    d.good = this.capturePositions();
    if (d.pendingLast) d.last = d.pendingLast;
  }
  endDrag(d) {
    const sk = this.sketch;
    if (d.mode === 'dim') { this.commit('Déplacement de cote'); return; }
    if (d.mode === 'point' && d.mergeWith && sk.points.has(d.mergeWith) && sk.points.has(d.single)) {
      const before = sk.serialize();
      const keep = sk.mergePoints(d.mergeWith, d.single);
      sk.cleanupDegenerate();
      if (!solve(sk).ok) { this.sketch = Sketch.deserialize(before); showToast('Coïncidence impossible ici'); }
      else { this.selection.delete(d.single); void keep; }
    }
    this.commit('Déplacement');
  }

  // ---------- Sélection ----------
  tapSelect(hit, info = {}) {
    if (!hit) { this.selection.clear(); return; }
    if (info.double && hit.type === 'dim') { this.selection.clear(); this.selection.add(hit.id); this.editDimension(hit.id); return; }
    if (this.multi) { if (this.selection.has(hit.id)) this.selection.delete(hit.id); else this.selection.add(hit.id); return; }
    if (this.selection.has(hit.id) && this.selection.size === 1) { this.selection.clear(); return; }
    this.selection.clear();
    this.selection.add(hit.id);
  }
  finishBox(box) {
    this.selection.clear();
    for (const e of this.sketch.entities.values()) {
      const ok = box.crossing ? entityTouchesRect(this.sketch, e, box) : entityInsideRect(this.sketch, e, box);
      if (ok) this.selection.add(e.id);
    }
  }
  deleteSelection() {
    if (this.selection.size === 0) return;
    const sk = this.sketch;
    for (const id of this.selection) if (sk.constraints.has(id)) sk.removeConstraint(id);
    for (const id of this.selection) {
      if (sk.entities.has(id)) sk.removeEntity(id);
      else if (sk.points.has(id) && id !== ORIGIN_ID) sk.removePoint(id);
    }
    this.selection.clear();
    this.commit('Suppression');
  }

  // ---------- Relations ----------
  applyRelation(r) {
    const sk = this.sketch;
    const before = sk.serialize();
    if (r.merge) {
      const [a, b] = r.merge;
      const shared = sk.entitiesOfPoint(a).some((e) => sk.entityPointIds(e).includes(b));
      if (shared) { showToast('Ces deux points appartiennent à la même entité', { error: true }); return; }
      sk.mergePoints(a, b);
      sk.cleanupDegenerate();
      if (!solve(sk).ok) { this.sketch = Sketch.deserialize(before); showToast('Coïncidence impossible : trop de contraintes', { error: true }); this.refreshUI(); return; }
    }
    const added = r.items.map(([type, refs]) => sk.addConstraint(type, refs));
    const start = this.capturePositions();
    const res = solve(sk);
    if (!res.ok) { this.restorePositions(start); for (const k of added) k.broken = true; }   // en conflit : gardée en rouge
    this.selection.clear();
    this.commit(`Relation ${r.label}`);
    if (!res.ok || this.analysis.state === 'over') showToast('Sur-contrainte : supprimez une relation (icône rouge) ou rendez une cote pilotée', { error: true, ms: 3000 });
  }

  // ---------- Cotes et valeurs ----------
  createDimension(k, label = 'Cote') {
    const sk = this.sketch;
    const { type, refs, ...extra } = k;
    const c = sk.addConstraint(type, refs, extra);
    if (isDimension(c) && analyze(sk).constraints.get(c.id) === 'over') {
      c.driven = true;
      showToast('Cote pilotée : sinon l\'esquisse serait sur-contrainte', { ms: 2600 });
    }
    this.commit(label);
    // saisie directe de la valeur (Annuler garde la valeur mesurée)
    if (isDimension(c) && !c.driven && this.sketch.constraints.has(c.id)) this.editDimension(c.id);
    return this.sketch.constraints.has(c.id) ? c.id : null;
  }
  /** Bascule une cote entre pilotée (mesure) et pilotante (impose sa valeur). */
  toggleDriven(cid) {
    const sk = this.sketch;
    const k = sk.constraints.get(cid);
    if (!k || !isDimension(k)) return;
    if (k.driven) {
      k.value = dimMeasure(sk, k);
      delete k.driven;
      // placée en dernier : c'est elle qui apparaît en rouge si elle sur-contraint l'esquisse
      sk.constraints.delete(cid); sk.constraints.set(cid, k);
    } else { k.driven = true; delete k.broken; }
    this.commit(k.driven ? 'Cote pilotée' : 'Cote pilotante');
    if (!k.driven && this.analysis.constraints.get(cid) === 'over') {
      showToast('Esquisse sur-contrainte : rendez une autre cote pilotée ou supprimez une relation', { error: true, ms: 3800 });
    }
  }
  /** Clavier pour une longueur. flippable : bouton « Inverser » et valeurs négatives acceptées (= sens inverse). */
  lengthKeypad(title, mm, onValue, { flippable = false } = {}) {
    const unit = this.settings.get('unit');
    const U = UNITS[unit] || UNITS.mm;
    this.keypad.open({
      title, unit: U.label, initial: fmtNumber(toDisplay(mm, unit), 4),
      ctx: { footFactor: 304.8 / U.factor, inchFactor: 25.4 / U.factor },
      flip: flippable,
      validate: (v) => (flippable ? (Math.abs(v) > 1e-12 ? null : 'La valeur ne peut pas être nulle') : (v > 0 ? null : 'La valeur doit être positive')),
      onSubmit: (v, o = {}) => onValue(fromDisplay(Math.abs(v), unit), !!o.flip !== (v < 0)),
    });
  }
  angleKeypad(title, rad, onValue) {
    const deg = this.settings.get('angleUnit') !== 'rad';
    this.keypad.open({
      title, unit: deg ? '°' : 'rad', initial: fmtNumber(deg ? rad * 180 / Math.PI : rad, 4),
      validate: (v) => { const r = deg ? v * Math.PI / 180 : v; return r > 0 && r < Math.PI ? null : (deg ? 'Entre 0 et 180°' : 'Entre 0 et π'); },
      onSubmit: (v) => onValue(deg ? v * Math.PI / 180 : v),
    });
  }
  /** Toucher la valeur du bandeau : longueur d'une ligne, rayon d'un arc ou d'un cercle, ou cote sélectionnée. */
  editSelectedValue() {
    if (this.selection.size !== 1) return;
    const id = [...this.selection][0];
    const sk = this.sketch;
    const k = sk.constraints.get(id);
    if (k && isDimension(k)) { this.editDimension(id); return; }
    const e = sk.entities.get(id);
    if (!e) return;
    if (e.type === 'line') this.lengthKeypad('Longueur de la ligne', entityLength(sk, e), (mm, flip) => this.setEntityValue(id, mm, flip), { flippable: true });
    else {
      const r = e.type === 'circle' ? e.r : dist(sk.points.get(e.c), sk.points.get(e.s));
      this.lengthKeypad(e.type === 'circle' ? 'Rayon du cercle' : 'Rayon de l\'arc', r, (mm) => this.setEntityValue(id, mm));
    }
  }
  editDimension(cid) {
    const k = this.sketch.constraints.get(cid);
    if (!k || !isDimension(k)) return;
    if (k.driven) { showToast('Cote pilotée : touchez « Rendre pilotante » pour la modifier', { ms: 2600 }); return; }
    const title = k.ord ? 'Cote ordinale' : { dimRadius: 'Rayon', dimHorizontal: 'Cote horizontale', dimVertical: 'Cote verticale' }[k.type] || 'Cote';
    if (k.type === 'dimAngle') this.angleKeypad('Angle', k.value, (v) => this.setDimValue(cid, v));
    else this.lengthKeypad(title, k.value, (v, flip) => this.setDimValue(cid, v, flip), { flippable: k.type !== 'dimRadius' });
  }
  /** Cote pilotante existante pour une entité, ou null. */
  drivingDim(e) {
    for (const k of this.sketch.constraints.values()) {
      if (k.driven) continue;
      if (e.type === 'line') {
        if (k.type === 'dimLength' && k.refs[0] === e.id) return k;
        if (k.type === 'dimDistance' && k.refs.includes(e.p1) && k.refs.includes(e.p2)) return k;
      } else if (k.type === 'dimRadius' && k.refs[0] === e.id) return k;
    }
    return null;
  }
  setEntityValue(eid, value, flip = false) {
    const sk = this.sketch;
    const e = sk.entities.get(eid);
    if (!e) return;
    const before = sk.serialize();
    let dim = this.drivingDim(e);
    let temp = null;
    if (!dim) dim = temp = sk.addConstraint(e.type === 'line' ? 'dimLength' : 'dimRadius', [eid], { value });
    dim.value = value;
    // l'origine de l'entité (premier point tracé, ou centre) reste en place
    const weights = flip && e.type === 'line' ? this.flipDimension(dim) : new Map([[e.type === 'line' ? e.p1 : e.c, HEAVY]]);
    const res = this.solveWithFallback(weights);
    if (temp) sk.removeConstraint(temp.id);
    if (!res.ok) { this.failEdit(before, [eid]); return; }
    this.commit(flip ? 'Inversion' : 'Modification de valeur');
  }
  setDimValue(cid, value, flip = false) {
    const sk = this.sketch;
    const k = sk.constraints.get(cid);
    if (!k) return;
    const before = sk.serialize();
    const scaled = this.scaleForFirstDim(k, value);
    k.value = value;
    delete k.broken;
    let weights;
    if (flip) weights = this.flipDimension(k);
    else {
      const first = sk.entities.get(k.refs[0]);
      weights = new Map([[first ? sk.entityPointIds(first)[0] : k.refs[0], HEAVY]]);
    }
    const res = this.solveWithFallback(weights);
    if (!res.ok) {
      // valeur impossible : gardée, la cote et ce qu'elle cote restent en rouge jusqu'à résolution
      const keep = Sketch.deserialize(before);
      const k2 = keep.constraints.get(cid);
      k2.value = value; k2.broken = true;
      this.sketch = keep;
      this.commit('Cote en conflit');
      showToast('Valeur impossible : la cote reste en rouge. Modifiez-la, rendez-la pilotée ou supprimez une relation.', { error: true, ms: 4000 });
      return;
    }
    this.commit(flip ? 'Inversion de cote' : scaled ? 'Mise à l\'échelle' : 'Modification de cote');
    if (scaled) {
      this.fitIfOutOfView();
      showToast('Première cote : toute l\'esquisse est mise à l\'échelle', { ms: 2600 });
    }
  }
  /**
   * Comme SOLIDWORKS : tant qu'aucune autre cote pilotante n'existe, la valeur de la cote
   * met toute l'esquisse à l'échelle (autour de l'origine), au lieu de déformer une seule entité.
   * @returns {boolean} true si l'esquisse a été mise à l'échelle.
   */
  scaleForFirstDim(k, value) {
    const sk = this.sketch;
    if (!isDimension(k) || k.type === 'dimAngle' || k.driven) return false;
    for (const o of sk.constraints.values()) if (o !== k && isDimension(o) && !o.driven) return false;
    const cur = dimMeasure(sk, k);
    if (!(cur > 1e-9) || !(value > 0)) return false;
    const f = value / cur;
    if (Math.abs(f - 1) < 1e-9) return false;
    for (const p of sk.points.values()) if (!p.origin) { p.x *= f; p.y *= f; }
    for (const e of sk.entities.values()) if (e.type === 'circle') e.r *= f;
    for (const c of sk.constraints.values()) if (c.pos) c.pos = { x: c.pos.x * f, y: c.pos.y * f };
    return true;
  }
  /** Recadre si l'esquisse sort de l'écran ou y devient minuscule. */
  fitIfOutOfView() {
    const b = this.sketch.bbox();
    if (!b) return;
    const r = this.vp.visibleWorldRect();
    const out = b.minX < r.minX || b.maxX > r.maxX || b.minY < r.minY || b.maxY > r.maxY;
    const tiny = Math.max(b.maxX - b.minX, b.maxY - b.minY) < 0.08 * Math.min(r.maxX - r.minX, r.maxY - r.minY);
    if (out || tiny) this.fitAll();
  }
  /** Résout en gardant certains éléments en place ; si ça échoue, réessaie sans préférence. */
  solveWithFallback(weights) {
    const start = this.capturePositions();
    let res = solve(this.sketch, { weights });
    if (!res.ok) { this.restorePositions(start); res = solve(this.sketch); }
    return res;
  }
  /** Point le plus « ancré » d'une paire : celui qui est bloqué par d'autres contraintes, sinon le premier. */
  anchorOf(a, b) {
    const st = this.analysis.points;
    if (a === ORIGIN_ID || st.get(a) === 'full') return [a, b];
    if (b === ORIGIN_ID || st.get(b) === 'full') return [b, a];
    return [a, b];
  }
  /**
   * Inverse le sens d'une cote (la géométrie passe de l'autre côté), avant résolution.
   * @returns {Map} poids : éléments à garder en place pendant la résolution.
   */
  flipDimension(k) {
    const sk = this.sketch;
    const P = (id) => sk.points.get(id);
    const w = new Map();
    const pair = (a, b) => this.anchorOf(a, b);
    switch (k.type) {
      case 'dimLength':
      case 'dimDistance':
      case 'dimHorizontal':
      case 'dimVertical': {
        const L = k.type === 'dimLength' ? sk.entities.get(k.refs[0]) : null;
        const [ia, ib] = L ? pair(L.p1, L.p2) : pair(k.refs[0], k.refs[1]);
        const a = P(ia), b = P(ib);
        if (k.type !== 'dimVertical') b.x = 2 * a.x - b.x;
        if (k.type !== 'dimHorizontal') b.y = 2 * a.y - b.y;
        w.set(ia, HEAVY); w.set(ib, HEAVY);
        break;
      }
      case 'dimPointLine': {
        const L = sk.entities.get(k.refs[1]);
        const p = P(k.refs[0]), a = P(L.p1), b = P(L.p2);
        const n = perp(norm(sub(b, a)));
        const h = dot(sub(p, a), n);
        Object.assign(p, add(p, mul(n, -2 * h)));
        for (const id of [k.refs[0], L.p1, L.p2]) w.set(id, HEAVY);
        break;
      }
      case 'dimLineLine': {
        const A = sk.entities.get(k.refs[0]), B = sk.entities.get(k.refs[1]);
        const a = P(A.p1), b = P(A.p2);
        const n = perp(norm(sub(b, a)));
        const h = dot(sub(P(B.p1), a), n);
        for (const id of new Set([B.p1, B.p2])) { if (id === A.p1 || id === A.p2) continue; const q = P(id); Object.assign(q, add(q, mul(n, -2 * h))); w.set(id, HEAVY); }
        w.set(A.p1, HEAVY); w.set(A.p2, HEAVY);
        break;
      }
      default: break;
    }
    for (const id of [...w.keys()]) { const pt = P(id); if (pt && pt.origin) w.delete(id); }
    return w;
  }
  /** Modification impossible : rien n'est appliqué, l'élément passe en rouge avec un message. */
  failEdit(before, ids) {
    this.sketch = Sketch.deserialize(before);
    this.analysis = analyze(this.sketch);
    this.message = 'Trop de contraintes : modification impossible';
    this.errorIds = new Set(ids);
    showToast(this.message, { error: true, ms: 2800 });
    this.refreshUI();   // reste affiché jusqu'à la prochaine modification
  }

  fitAll() {
    this.vp.fit(this.sketch.bbox(), 56);
    this.requestDraw();
    this.scheduleSave();
  }

  onKey(e) {
    if (this.settingsPanel.open_ || this.keypad.isOpen()) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelection(); }
    else if (e.key === 'Escape') { if (this.tool) { if (!this.tool.onToolbarTap()) this.setTool(null); } else { this.selection.clear(); this.refreshUI(); } }
  }
}

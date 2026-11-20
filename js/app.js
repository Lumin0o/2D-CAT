// Contrôleur principal : relie modèle, solveur, rendu et interface.
import { Sketch, ORIGIN_ID, textBox } from './core/model.js';
import { setPatternCount } from './core/edit.js';
import { solve, analyze, isDimension, isAnnotation, solveHeld } from './core/solver.js';
import { History } from './core/history.js';
import { hitTest, entityDistance, entityInsideRect, entityTouchesRect, outwardTangentAt, endpointEntities, keyPoints, closestOnEntity, entityIntersections, entityLength } from './core/query.js';
import { dist, sub, add, mul, norm, perp, dot } from './core/geom.js';
import { UNITS, toDisplay, fromDisplay, fmtNumber } from './core/units.js';
import { Viewport } from './render/viewport.js';
import { Renderer, BADGE_R } from './render/renderer.js';
import { dimLayout, dimLabel, dimMeasure, layoutBadges } from './render/annotations.js';
import { db } from './store/db.js';
import { Settings, applyTheme, DEFAULT_SETTINGS } from './store/settings.js';
import { Gestures } from './ui/gestures.js';
import { Toolbar } from './ui/toolbar.js';
import { InfoBar } from './ui/infobar.js';
import { PopoverManager } from './ui/popover.js';
import { showToast } from './ui/toast.js';
import { openSnapPopover, openFilesPopover, openVisibilityPopover } from './ui/panels.js';
import { hiddenItems, hiddenCount } from './core/visibility.js';
import { ProjectsPanel, sketchHash } from './ui/files.js';
import { SettingsPanel } from './ui/settingsPanel.js';
import { Keypad } from './ui/keypad.js';
import { RelationBar } from './ui/relations.js';
import { TOOL_CLASSES, getTool, groupOf } from './ui/tools/registry.js';
import { icon } from './ui/icons.js';
import { textRows, askText } from './ui/tools/text.js';

const HIT_PX = 12;      // zone de toucher élargie autour des traits et points
const SNAP_PX = 14;     // rayon d'aimantation
const DRAG_PX = 6;      // seuil de glissement
const ALIGN_DEG = 3;    // tolérance de redressement horizontal / vertical
const ENTITY_SNAPS = new Set(['on', 'midpoint', 'quadrant', 'intersection']);
const HEAVY = 1e6;      // coût de déplacement des éléments qui doivent rester en place

const seqOf = (id) => parseInt(String(id).slice(1), 36);

/** Mélange de deux couleurs #rrggbb : t de a, 1 - t de b. */
function mixColor(a, b, t) {
  const p = (c) => { const h = String(c).replace('#', ''); const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0); };
  const A = p(a), B = p(b);
  return '#' + A.map((x, i) => Math.round(x * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

export class App {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      app: $('app'), canvasWrap: $('canvas-wrap'), canvas: $('canvas'), hint: $('hint'),
      undo: $('btn-undo'), redo: $('btn-redo'), fit: $('btn-fit'), multi: $('btn-multi'), box: $('btn-box'),
      full: $('btn-full'), vis: $('btn-vis'), toolacts: $('toolacts'), okacts: $('okacts'), toolopts: $('toolopts'), ok: $('btn-ok'), del: $('btn-delete'),
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
    this.selMode = null;      // null : sélection simple + déplacement à un doigt ; 'multi' : taps cumulés ; 'box' : cadre
    this.measureText = null;  // résultat de l'outil Mètre (bandeau d'infos)
    this.measureExtra = '';
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
    // esquisse enregistrée en cours (Fichiers › Enregistrer) et empreinte de sa dernière version enregistrée
    this.project = cur && cur.project && cur.project.id ? { id: cur.project.id, name: cur.project.name } : null;
    this.savedHash = cur && cur.savedHash ? cur.savedHash : null;
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
    this.projectsPanel = new ProjectsPanel(this);

    this.els.undo.innerHTML = icon('undo');
    this.els.redo.innerHTML = icon('redo');
    this.els.fit.innerHTML = icon('fit');
    this.els.multi.innerHTML = icon('multi');
    this.els.box.innerHTML = icon('boxSelect');
    this.els.full.innerHTML = icon('fullscreen');
    // bouton qui réduit / rouvre la petite fenêtre d'options (comme la barre d'outils)
    const tog = document.createElement('button');
    tog.id = 'toolopts-toggle';
    tog.className = 'round-btn small toolopts-toggle';
    tog.hidden = true;
    this.els.canvasWrap.appendChild(tog);
    this.els.optsToggle = tog;
    this.els.toolopts.addEventListener('scroll', () => this.updateOptsFade(), { passive: true });
    tog.addEventListener('click', (e) => { e.preventDefault(); this.settings.set('optsCollapsed', !this.settings.get('optsCollapsed'), true); this.updateToolOptions(); this.updateToolActions(); });
    this.updateVisButton();
    this.els.snap.querySelector('.bb-icon').innerHTML = icon('magnet');
    this.els.grid.querySelector('.bb-icon').innerHTML = icon('grid');
    this.els.files.querySelector('.bb-icon').innerHTML = icon('folder');
    this.els.settings.querySelector('.bb-icon').innerHTML = icon('gear');
    const click = (el, fn) => el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
    click(this.els.undo, () => this.undo());
    click(this.els.redo, () => this.redo());
    click(this.els.fit, () => this.fitAll());
    click(this.els.multi, () => this.setSelMode(this.selMode === 'multi' ? null : 'multi'));
    click(this.els.box, () => this.setSelMode(this.selMode === 'box' ? null : 'box'));
    click(this.els.full, () => this.setFullscreen(!this.fullscreen));
    click(this.els.vis, () => openVisibilityPopover(this, this.els.vis));
    click(this.els.ok, () => { const run = this._okRun; if (run) { run(); this.refreshUI(); } });
    click(this.els.snap, () => openSnapPopover(this, this.els.snap));
    click(this.els.grid, () => { const on = !this.settings.get('grid'); this.settings.set('grid', on); showToast(on ? 'Grille affichée' : 'Grille masquée'); });
    this.updateGridButton();
    click(this.els.files, () => openFilesPopover(this, this.els.files));
    click(this.els.settings, () => this.settingsPanel.open());

    // Bandeau d'infos sur deux lignes ou plus : il grandit par-dessus le dessin, les boutons remontent avec lui
    const info = $('infobar');
    const syncInfo = () => {
      const base = parseFloat(getComputedStyle(this.els.app).getPropertyValue('--info-h')) || 48;
      const grow = Math.max(0, Math.round(info.offsetHeight - base));
      this.els.app.style.setProperty('--info-grow', grow + 'px');
    };
    if (window.ResizeObserver) new ResizeObserver(syncInfo).observe(info);
    this._syncInfo = syncInfo;

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
      if (['toolbarRows', 'toolbarCells', 'favorites', 'lastTools', 'recentGroup', '*'].includes(key)) this.toolbar.render();
      if (key === 'grid' || key === '*') this.updateGridButton();
      if (key === 'visibility' || key === '*') this.onVisibilityChange();
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
      this.project = cur.project && cur.project.id ? { id: cur.project.id, name: cur.project.name } : null;
      this.savedHash = cur.savedHash || null;
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
      hitGeometry: (wp) => { const t = self.vp.pxToWorld(HIT_PX); return hitTest(self.sketch, wp, t, t, self.hidden()); },
      /** Entité la plus proche (sans priorité aux points), ou null. */
      hitEntity: (wp) => {
        const tol = self.vp.pxToWorld(HIT_PX);
        let best = null;
        const H = self.hidden();
        for (const e of self.sketch.entities.values()) { if (H && H.ents.has(e.id)) continue; const d = entityDistance(self.sketch, e, wp); if (d <= tol && (!best || d < best.d)) best = { d, id: e.id }; }
        return best ? best.id : null;
      },
      createDimension: (k, label) => self.createDimension(k, label),
      takeSelection: () => { const ids = self._pendingSel; self._pendingSel = []; return ids; },
      // ---- étape 3 ----
      refreshUI: () => self.refreshUI(),
      applyEdit: (label, fn) => self.applyEdit(label, fn),
      setMeasure: (text, extra = '') => { self.measureText = text; self.measureExtra = extra; self.infobar.update(); },
      lengthKeypad: (title, mm, cb, opts) => self.lengthKeypad(title, mm, cb, opts),
      signedAngleKeypad: (title, rad, cb) => self.signedAngleKeypad(title, rad, cb),
      pxToWorld: (px) => self.vp.pxToWorld(px),
      keypadOpen: () => self.keypad.isOpen(),
      numberKeypad: (opts) => self.keypad.open(opts),
      updateToolOptions: () => self.updateToolOptions(),
      /** Texte touché (outil Texte), ou null. */
      hitText: (wp) => self.hitText(wp),
      /** Cote touchée (par son texte), ou null. */
      hitDimension: (wp) => { const h = self.hitAt(self.vp.toScreen(wp), wp); return h && h.type === 'dim' ? h.id : null; },
      setSetting: (key, value) => self.settings.set(key, value, true),
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
    const T = this.snapTypes();
    if (this.settings.get('snap')) {
      let best = null;
      const H = this.hidden();          // éléments masqués : pas d'aimantation dessus
      if (T.points) for (const p of sk.points.values()) {
        if (opt.excludePoints && opt.excludePoints.has(p.id)) continue;
        if (H && H.pts.has(p.id)) continue;
        const d = dist(p, wp);
        if (d <= tol && (!best || d < best.d)) best = { d, p };
      }
      if (best) return { x: best.p.x, y: best.p.y, pointId: best.p.id, kind: best.p.origin ? 'origin' : 'point' };
      if (!opt.pointsOnly && (T.intersections || T.midpoints || T.quadrants || T.onEntity)) {
        const near = [];
        for (const e of sk.entities.values()) {
          if (opt.excludeEntities && opt.excludeEntities.has(e.id)) continue;
          if (H && H.ents.has(e.id)) continue;
          const d = entityDistance(sk, e, wp);
          if (d <= tol) near.push({ e, d });
        }
        near.sort((a, b) => a.d - b.d);
        near.length = Math.min(near.length, 6);
        let bi = null;
        if (T.intersections) for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
          for (const p of entityIntersections(sk, near[i].e, near[j].e)) {
            const d = dist(p, wp);
            if (d <= tol && (!bi || d < bi.d)) bi = { d, p, ids: [near[i].e.id, near[j].e.id] };
          }
        }
        if (bi) return { x: bi.p.x, y: bi.p.y, kind: 'intersection', entityIds: bi.ids };
        let bk = null;
        for (const { e } of near) for (const kp of keyPoints(sk, e)) {
          if (!(kp.kind === 'midpoint' ? T.midpoints : T.quadrants)) continue;
          const d = dist(kp, wp);
          if (d <= tol * 0.8 && (!bk || d < bk.d)) bk = { d, kp, e };
        }
        if (bk) return { x: bk.kp.x, y: bk.kp.y, kind: bk.kp.kind, entityId: bk.e.id };
        if (near.length && T.onEntity) { const c = closestOnEntity(sk, near[0].e, wp); return { x: c.x, y: c.y, kind: 'on', entityId: near[0].e.id }; }
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
    const T = this.snapTypes();
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) < this.vp.pxToWorld(HIT_PX)) return out;
    const tolRad = ALIGN_DEG * Math.PI / 180;
    const ang = Math.abs(Math.atan2(dy, dx));
    if (T.horizontal && (ang < tolRad || Math.PI - ang < tolRad)) { out.y = a.y; out.align = 'h'; }
    else if (T.vertical && Math.abs(ang - Math.PI / 2) < tolRad) { out.x = a.x; out.align = 'v'; }
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
  /** Aimantation à la grille : seulement si l'aimant est actif, la grille affichée et son interrupteur actif. */
  gridSnapOn() { return !!(this.settings.get('snap') && this.settings.get('grid') && this.settings.get('gridSnap')); }
  /** Types d'aimantation actifs (chacun a son interrupteur dans la fenêtre Aimantation). */
  snapTypes() { return { ...DEFAULT_SETTINGS.snapTypes, ...(this.settings.get('snapTypes') || {}) }; }

  // ---------- Couleurs ----------
  colors() {
    if (this._colors) return this._colors;
    const theme = this.settings.resolvedTheme();
    const dark = theme === 'dark';
    const c = { ...DEFAULT_SETTINGS.colors[theme], ...(this.settings.get('colors')[theme] || {}) };
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    const canvasBg = v('--canvas-bg') || (dark ? '#121214' : '#d8d8e2');
    // fond des icônes : leur couleur, très atténuée (sur le fond sombre, ou vers le blanc en thème clair)
    const soft = (col) => mixColor(col, dark ? canvasBg : '#ffffff', dark ? 0.25 : 0.17);
    this._colors = {
      under: c.under, full: c.full, over: c.over,
      selected: c.selected,
      preview: c.preview,
      ghost: c.ghost,                           // aperçu jaune des modifications (symétrie, décaler, copier…)
      guide: dark ? '#8a8a90' : '#9a9aa0',
      snap: c.snap,
      origin: c.origin,
      dim: c.dim,
      dimDriven: c.dimDriven,
      badgeBg: soft(c.badge),
      badgeFg: c.badge,
      patternBg: soft(c.pattern),
      patternFg: c.pattern,
      text: c.text,
      loupeRing: dark ? '#f2f2f0' : '#3c3c43',
      canvasBg,
      gridPaper: c.grid || v('--grid-paper') || '#a2a6b2',
      gridAlpha: parseFloat(v('--grid-alpha')) || 0.8,
      axis: c.axis || v('--axis') || '#a8a8ae',
      accent: v('--accent') || '#0a84ff',
      green: c.measure || v('--green') || '#30b14e',
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
      if (t && t.cursor && !t.noLoupe) loupe = { finger: this.finger, world: t.cursor, label: t.liveValue ? t.liveValue() : null };
      else if (this.drag && this.drag.active && this.drag.single) { const p = this.sketch.points.get(this.drag.single); if (p) loupe = { finger: this.finger, world: { x: p.x, y: p.y } }; }
    }
    if (this.drag && this.drag.active && this.drag.mergeWith) { const p = this.sketch.points.get(this.drag.mergeWith); if (p) dragMarker = { x: p.x, y: p.y, kind: 'point' }; }
    else if (this.drag && this.drag.active && this.drag.snapOn) dragMarker = this.drag.snapOn;
    this.renderer.draw({
      sketch: this.sketch, vp: this.vp, selection: this.selection, analysis: this.analysis,
      colors: this.colors(), settings: this.settings.data,
      grid: { show: this.settings.get('grid'), info: this.gridInfo() }, hidden: this.hidden(),
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
  /** Éléments masqués (bouton œil), ou null si tout est visible. */
  hidden() { return hiddenItems(this.sketch, this.settings.get('visibility')); }
  /** Bouton œil : barré et en couleur quand quelque chose est masqué. */
  updateVisButton() {
    const n = hiddenCount(this.settings.get('visibility'));
    this.els.vis.innerHTML = icon(n ? 'eyeOff' : 'eye');
    this.els.vis.classList.toggle('on', n > 0);
    this.els.vis.setAttribute('aria-label', n ? 'Affichage (éléments masqués)' : 'Affichage');
  }
  /** Affichage modifié : la sélection perd ce qui vient d'être masqué. */
  onVisibilityChange() {
    const H = this.hidden();
    if (H) for (const id of [...this.selection]) if (H.ents.has(id) || H.pts.has(id) || H.cons.has(id) || H.texts.has(id)) this.selection.delete(id);
    this.updateVisButton();
    this.refreshUI();
  }
  refreshUI() {
    this.infobar.update();
    this.relbar.update();
    if (!this.tool) this.updateToolOptions();      // texte sélectionné : sa fenêtre d'options
    this.updateToolActions();
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
    for (const id of [...this.selection]) if (!sk.entities.has(id) && !sk.points.has(id) && !sk.constraints.has(id) && !sk.texts.has(id)) this.selection.delete(id);
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
    return db.set('current', {
      sketch: this.sketch.toJSON(), viewport: this.vp.toJSON(), toolId: this.toolId, savedAt: Date.now(),
      project: this.project, savedHash: this.savedHash,
    });
  }
  /** Esquisse enregistrée liée (ou null) ; serial : version qui vient d'être enregistrée ou ouverte. */
  setProject(project, serial = null) {
    this.project = project ? { id: project.id, name: project.name } : null;
    if (serial !== null) this.savedHash = sketchHash(serial);
    if (!project) this.savedHash = null;
    this.saveNow();
    this.refreshUI();
  }
  /** Modifications non enregistrées : depuis le dernier enregistrement, ou une esquisse jamais enregistrée et non vide. */
  isDirty() {
    if (!this.project) return !this.sketch.isEmpty();
    return sketchHash(this.sketch.serialize()) !== this.savedHash;
  }
  /** Remplace l'esquisse (ouverture, nouvelle) : historique remis à zéro, vue cadrée ou restaurée. */
  loadSketch(sk, { viewport = null, project = null } = {}) {
    if (this.tool) this.setTool(null);
    this.drag = null; this.box = null;
    sk.cleanupDegenerate();
    solve(sk);
    this.sketch = sk;
    this._seqMark = sk.seq;
    const serial = sk.serialize();
    this.history.init(serial);
    this.selection.clear();
    this.project = project ? { id: project.id, name: project.name } : null;
    this.savedHash = project ? sketchHash(serial) : null;
    if (viewport) this.vp.fromJSON(viewport); else if (!sk.isEmpty()) this.vp.fit(sk.bbox(), 56); else this.vp.fit(null);
    this.afterChange();
    this.saveNow();
  }

  // ---------- Outils ----------
  setTool(id) {
    if (this.tool) this.tool.onCancel();
    this.tool = null; this.toolId = null;
    this.measureText = null; this.measureExtra = '';
    if (id) {
      const Cls = TOOL_CLASSES[id];
      if (!Cls) { this.toolbar.setActive(null); this.setHint(''); return; }
      this._pendingSel = [...this.selection];
      this.selection.clear();
      this.tool = new Cls(this.tc);
      this._pendingSel = [];
      this.toolId = id;
      const g = groupOf(id);
      if (g) {
        this.settings.set('lastTools', { ...this.settings.get('lastTools'), [g.id]: id }, true);
        this.toolbar.noteGroupUsed(g.id);
      }
    } else this.setHint('');
    this.toolbar.setActive(this.toolId);
    this.updateToolOptions();
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
  /**
   * Modes de sélection (exclusifs) : 'multi' (chaque tap ajoute ou retire), 'box' (glisser dans le vide trace
   * un cadre : vers la droite = fenêtre bleue, éléments entièrement dedans ; vers la gauche = capture verte
   * pointillée, éléments touchés), ou aucun : sélection simple, et glisser dans le vide déplace la vue.
   */
  setSelMode(mode) {
    // passer en sélection quitte l'outil en cours, sauf le cadre pour les outils qui s'en servent
    // (symétrie, décaler, congé…, pendant le choix des éléments)
    if (mode && this.tool && !(mode === 'box' && this.tool.acceptsBox)) this.setTool(null);
    this.selMode = mode;
    this.els.multi.classList.toggle('on', mode === 'multi');
    this.els.box.classList.toggle('on', mode === 'box');
    this.els.multi.setAttribute('aria-pressed', String(mode === 'multi'));
    this.els.box.setAttribute('aria-pressed', String(mode === 'box'));
    showToast(mode === 'multi' ? 'Sélection multiple : chaque toucher ajoute ou retire'
      : mode === 'box' ? (this.tool ? 'Cadre : glissez pour désigner les éléments de l\'outil' : 'Sélection par cadre : glissez vers la droite (fenêtre) ou vers la gauche (capture)')
      : 'Sélection simple · glisser dans le vide déplace la vue', { ms: 2400 });
  }
  get multi() { return this.selMode !== null; }
  setMulti(on) { this.setSelMode(on ? 'multi' : null); }
  /** Plein écran : barre d'outils, bandeau et boutons masqués ; le petit bouton du coin en sort. */
  setFullscreen(on) {
    this.fullscreen = on;
    this.els.app.classList.toggle('fullscreen', on);
    this.els.full.innerHTML = icon(on ? 'fullscreenExit' : 'fullscreen');
    this.els.full.setAttribute('aria-label', on ? 'Quitter le plein écran' : 'Plein écran');
    this.popovers.close();
    if (on && this.toolbar.expanded) this.toolbar.setExpanded(false);
    this.updateToolActions();
    setTimeout(() => this.onResize(), 30);
  }
  /**
   * Boutons d'action de l'outil en cours : « Valider » prend la place de la corbeille (jamais visibles ensemble :
   * la sélection est reprise par l'outil) ; les autres actions sont sous l'indication. En plein écran, les
   * boutons du bas sont masqués : Valider rejoint alors les autres actions.
   */
  updateToolActions() {
    const el = this.els.toolacts;
    const acts = this.tool && this.tool.actions ? this.tool.actions() : [];
    const primary = this.fullscreen ? null : acts.find((a) => a.cls === 'primary');
    // « Changer la sélection » (stack) : au-dessus de Valider ; les autres actions sous l'indication
    const stacked = acts.filter((a) => a !== primary && a.stack);
    const chips = acts.filter((a) => a !== primary && !a.stack);
    const ok = this.els.ok;
    ok.hidden = !primary;
    this._okRun = primary ? primary.run : null;
    if (primary) {
      ok.innerHTML = icon('check') + `<span>Valider${primary.count ? ` (${primary.count})` : ''}</span>`;
      ok.setAttribute('aria-label', primary.label);
      this.els.del.hidden = true;
    }
    el.innerHTML = '';
    el.hidden = !chips.length;
    const side = this.els.okacts;
    side.innerHTML = '';
    side.hidden = !stacked.length;
    // juste sous l'indication, quelle que soit sa hauteur (une ou deux lignes)
    const hint = this.els.hint;
    if (chips.length && !hint.hidden && hint.offsetHeight) el.style.top = `${hint.offsetTop + hint.offsetHeight + 6}px`;
    for (const a of [...chips, ...stacked]) {
      const b = document.createElement('button');
      b.className = 'rel-chip ' + (a.cls || '');
      b.innerHTML = (a.glyph ? `<span class="glyph">${a.glyph}</span>` : '') + a.label;
      b.addEventListener('click', (e) => { e.preventDefault(); a.run(); this.refreshUI(); });
      (a.stack ? side : el).appendChild(b);
    }
  }
  /**
   * Options de l'outil en cours (petite fenêtre sous la barre d'outils, ex. Décaler), ou du texte sélectionné.
   * Le bouton à sa droite la réduit (et la rouvre), comme la barre d'outils.
   */
  updateToolOptions() {
    const el = this.els.toolopts;
    const opts = this.tool ? (this.tool.options ? this.tool.options() : []) : this.selectionOptions();
    const collapsed = !!this.settings.get('optsCollapsed');
    const tog = this.els.optsToggle;
    const scroll = el.scrollTop;      // la fenêtre est reconstruite à chaque réglage : on garde le défilement
    el.innerHTML = '';
    el.style.maxHeight = '';
    el.hidden = !opts.length || collapsed;
    if (tog) {
      tog.hidden = !opts.length;
      tog.innerHTML = icon(collapsed ? 'chevron' : 'chevronUp');
      tog.classList.toggle('on', collapsed);
      tog.setAttribute('aria-label', collapsed ? 'Afficher les options' : 'Réduire les options');
    }
    const refresh = () => { this.updateToolOptions(); if (this.tool) this.tool.updateHint(); this.refreshUI(); };
    for (const o of opts) {
      if (o.colors) { el.appendChild(this.colorRow(o, refresh)); continue; }
      const r = document.createElement('button');
      r.className = 'topt-row' + (o.disabled ? ' disabled' : '');
      const right = o.text !== undefined
        ? `<span class="topt-value">${o.text}<span class="chev">${icon('chevronRight')}</span></span>`
        : `<span class="switch small${o.value ? ' on' : ''}"></span>`;
      r.innerHTML = `<span class="topt-label">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</span>${right}`;
      r.addEventListener('click', (e) => {
        e.preventDefault();
        if (o.disabled) return;
        if (o.onTap) { o.onTap(); return; }      // valeur : clavier (l'outil rafraîchit la fenêtre ensuite)
        o.set(!o.value);
        refresh();
      });
      el.appendChild(r);
    }
    // 3 cases au plus : le reste défile
    const rows = el.children;
    if (!el.hidden && rows.length > 3) el.style.maxHeight = `min(${rows[3].offsetTop + 2}px, calc(100% - 70px))`;
    el.scrollTop = scroll;
    this.updateOptsFade();
    // l'indication et les actions passent sous la fenêtre (ou sous son bouton, fenêtre réduite)
    const h = opts.length ? (collapsed ? 36 : el.offsetHeight) : 0;
    this.els.hint.style.top = h ? `${h + 16}px` : '';
    this.els.toolacts.style.top = h ? `${h + 54}px` : '';
  }
  /** Fondu en bas de la fenêtre d'options tant qu'il reste des cases plus bas. */
  updateOptsFade() {
    const el = this.els.toolopts;
    el.classList.toggle('more', el.scrollHeight - el.clientHeight - el.scrollTop > 2);
  }
  /** Ligne « Couleur » : pastilles (A = automatique) et couleur au choix. */
  colorRow(o, refresh) {
    const r = document.createElement('div');
    r.className = 'topt-row topt-colors';
    r.innerHTML = `<span class="topt-label">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</span>`;
    const box = document.createElement('div');
    box.className = 'topt-swatches';
    const pick = (c) => { o.set(c); refresh(); };
    let known = false;
    for (const c of o.colors) {
      const b = document.createElement('button');
      const on = (c || null) === (o.value || null);
      if (on) known = true;
      b.className = 'topt-swatch' + (on ? ' on' : '') + (c ? '' : ' auto');
      if (c) b.style.background = c; else { b.textContent = 'A'; b.style.color = this.colors().text; }
      b.setAttribute('aria-label', c ? `Couleur ${c}` : 'Couleur automatique');
      b.addEventListener('click', (e) => { e.preventDefault(); pick(c); });
      box.appendChild(b);
    }
    const lab = document.createElement('label');
    lab.className = 'topt-swatch custom' + (!known && o.value ? ' on' : '');
    if (!known && o.value) lab.style.background = o.value;
    lab.setAttribute('aria-label', 'Autre couleur');
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = o.value || '#000000';
    inp.addEventListener('change', () => pick(inp.value));
    lab.appendChild(inp);
    box.appendChild(lab);
    r.appendChild(box);
    return r;
  }
  /** Fenêtre d'options sans outil : un texte sélectionné seul (texte, hauteur, couleur). */
  selectionOptions() {
    if (this.selection.size !== 1) return [];
    const t = this.sketch.texts.get([...this.selection][0]);
    if (!t) return [];
    return textRows(this.tc, t, (patch) => {
      const cur = this.sketch.texts.get(t.id);
      if (!cur) return;
      Object.assign(cur, patch);
      this.commit('Texte modifié');
    });
  }

  // ---------- Test de toucher (mode sélection) ----------
  /** Cotes, puis icônes de relations, puis points et entités. */
  hitAt(s, wp) {
    const sk = this.sketch;
    const H = this.hidden();
    for (const k of sk.constraints.values()) {
      if (!isAnnotation(k) || (H && H.cons.has(k.id))) continue;
      const lay = dimLayout(sk, k);
      if (!lay) continue;
      const label = dimLabel(sk, k, this.settings.data);
      const t = this.renderer.dimTextCenter(lay, label);
      const size = this.renderer.dimTextSize(label);
      // texte éventuellement tourné (cotes ordinales) : test dans le repère du texte
      const r = lay.rot || 0, dx = s.x - t.x, dy = s.y - t.y;
      const lx = dx * Math.cos(r) + dy * Math.sin(r), ly = -dx * Math.sin(r) + dy * Math.cos(r);
      if (Math.abs(lx) <= size.w / 2 + 5 && Math.abs(ly) <= size.h / 2 + 5) return { type: 'dim', id: k.id };
    }
    let bb = null;
    for (const b of layoutBadges(sk, this.vp, H)) {
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      if (d <= BADGE_R + 2 && (!bb || d < bb.d)) bb = { d, id: b.cid };
    }
    if (bb) return { type: 'badge', id: bb.id };
    const tol = this.vp.pxToWorld(HIT_PX);
    const tx = this.hitText(wp, 0);            // en plein dans un texte : le texte d'abord
    if (tx) return { type: 'text', id: tx };
    const g = hitTest(sk, wp, tol, tol, H);
    if (g) return g;
    const tx2 = this.hitText(wp);
    return tx2 ? { type: 'text', id: tx2 } : null;
  }
  /** Texte sous le doigt (boîte élargie de padPx), le dernier posé d'abord ; ou null. */
  hitText(wp, padPx = 6) {
    const H = this.hidden();
    const pad = this.vp.pxToWorld(padPx);
    let found = null;
    for (const t of this.sketch.texts.values()) {
      if (H && H.texts.has(t.id)) continue;
      const b = textBox(t);
      if (wp.x >= b.minX - pad && wp.x <= b.maxX + pad && wp.y >= b.minY - pad && wp.y <= b.maxY + pad) found = t.id;
    }
    return found;
  }

  // ---------- Gestes un doigt ----------
  onStart(s, g) {
    this.popovers.close();
    this.touch = !!g && g.type !== 'mouse';
    this.finger = s;
    const wp = this.vp.toWorld(s);
    if (this.tool) {
      // outil qui accepte le cadre : un glissement trace un cadre au lieu d'aller à l'outil
      this.toolBox = this.selMode === 'box' && this.tool.acceptsBox ? { startS: s, startW: wp, active: false } : null;
      this.tool.onPress(wp);
      return;
    }
    this.drag = { hit: this.hitAt(s, wp), startS: s, startW: wp, lastS: s, active: false };
  }
  onMove(s) {
    this.finger = s;
    const wp = this.vp.toWorld(s);
    if (this.tool) {
      const tb = this.toolBox;
      if (tb && !tb.active && dist(s, tb.startS) >= DRAG_PX) { tb.active = true; this.tool.onCancel(); }
      if (tb && tb.active) { this.box = this.makeBox(tb.startS, tb.startW, s, wp); this.requestDraw(); return; }
      this.tool.onMove(wp);
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.active) {
      if (dist(s, d.startS) < DRAG_PX) return;
      d.active = true;
      if (d.hit && (d.hit.id === ORIGIN_ID || d.hit.type === 'badge')) d.hit = null;
      if (d.hit) this.beginDrag(d);
    }
    if (d.hit) this.applyDrag(d, wp);
    else if (this.selMode !== 'box') {
      // déplacement de la vue à un doigt
      this.vp.pan(s.x - d.lastS.x, s.y - d.lastS.y);
      d.panned = true;
    } else {
      this.box = this.makeBox(d.startS, d.startW, s, wp);
    }
    d.lastS = s;
    this.requestDraw();
  }
  onEnd(s, info) {
    const wp = this.vp.toWorld(s);
    this.finger = null;
    if (this.tool) {
      const tb = this.toolBox; this.toolBox = null;
      if (tb && tb.active) {
        const box = this.box; this.box = null;
        if (!info.cancelled && box && this.tool.onBox) {
          const ids = [...this.boxHits(box, false)];
          const inBox = (p) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
          const H = this.hidden();
          const points = [...this.sketch.points.values()].filter((p) => p.id !== ORIGIN_ID && inBox(p) && !(H && H.pts.has(p.id))).map((p) => p.id);
          this.tool.onBox({ ids, points });
          if (this.tool) this.tool.updateHint();
        }
        this.refreshUI();
        return;
      }
      if (info.cancelled) this.tool.onCancel(); else this.tool.onRelease(wp);
      return;
    }
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.active) {
      if (d.hit) this.endDrag(d);
      else if (this.box) this.finishBox(this.box);
      else if (d.panned) this.scheduleSave();
    } else if (!info.cancelled) this.tapSelect(d.hit, info);
    this.box = null;
    this.refreshUI();
  }
  onCancel() {
    this.finger = null;
    if (this.tool) { this.toolBox = null; this.box = null; this.tool.onCancel(); return; }
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
    const texts = new Map();
    for (const t of this.sketch.texts.values()) texts.set(t.id, [t.x, t.y]);
    return { pts, radii, dims, texts };
  }
  restorePositions(snap) {
    const sk = this.sketch;
    for (const [id, [x, y]] of snap.pts) { const p = sk.points.get(id); if (p) { p.x = x; p.y = y; } }
    for (const [id, r] of snap.radii) { const e = sk.entities.get(id); if (e) e.r = r; }
    for (const [id, pos] of snap.dims) { const k = sk.constraints.get(id); if (k) k.pos = { ...pos }; }
    if (snap.texts) for (const [id, [x, y]] of snap.texts) { const t = sk.texts.get(id); if (t) { t.x = x; t.y = y; } }
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
    d.texts = new Set();
    for (const id of items) {
      const en = sk.entities.get(id);
      if (en) for (const pid of sk.entityPointIds(en)) d.ids.add(pid);
      else if (sk.points.has(id)) d.ids.add(id);
      else if (sk.texts.has(id)) d.texts.add(id);
    }
    d.ids.delete(ORIGIN_ID);
    // une occurrence de répétition seule : tenue par le point le plus proche du doigt, le reste suit le pas
    d.anchor = null;
    if (d.ids.size && [...d.ids].every((pid) => this.isPatternCopy(pid))) {
      let bd = Infinity;
      for (const pid of d.ids) { const q = dist(sk.points.get(pid), d.startW); if (q < bd) { bd = q; d.anchor = pid; } }
    }
  }
  /** Relations de répétition qui utilisent le point pid. */
  patternsOf(pid) { return [...this.sketch.constraints.values()].filter((k) => k.type === 'pattern' && k.refs.includes(pid)); }
  /** Répétition liée dont pid est un point d'une copie (occurrence 1 et suivantes), ou undefined. */
  patternOfCopy(pid) { return this.patternsOf(pid).find((k) => { const i = k.refs.indexOf(pid); return i >= k.m && i < k.m * k.n; }); }
  isPatternCopy(pid) { return !!this.patternOfCopy(pid); }
  /**
   * Position la plus proche de want que le point pid d'une copie de répétition (parti de p) atteint en ne changeant
   * que l'espacement : même distance au centre (circulaire), ou déplacement le long de la direction (linéaire).
   */
  patternReach(pid, p, want) {
    const sk = this.sketch;
    const k = this.patternOfCopy(pid);
    if (!k) return null;
    if (k.kind === 'lin') {
      let u = k.dir;
      const ax = k.axis && sk.entities.get(k.axis);
      if (ax && ax.type === 'line') u = norm(sub(sk.points.get(ax.p2), sk.points.get(ax.p1)));
      if (!u) return null;
      const t = dot(sub(want, p), u);
      return { x: p.x + u.x * t, y: p.y + u.y * t };
    }
    const c = sk.points.get(k.center);
    if (!c) return null;
    const r = dist(p, c), v = sub(want, c), l = Math.hypot(v.x, v.y);
    if (l < 1e-12) return null;
    return { x: c.x + v.x * r / l, y: c.y + v.y * r / l };
  }
  /** Vrai si a et b appartiennent à la même répétition : les fusionner défairait la répétition. */
  samePattern(a, b) { return this.patternsOf(a).some((k) => k.refs.includes(b)); }
  applyDrag(d, wp) {
    const sk = this.sketch;
    if (d.mode === 'dim') {
      let k = sk.constraints.get(d.hit.id);
      if (k && k.ord) k = sk.constraints.get(k.ord);     // cote ordinale : on déplace toute la ligne de cotes
      if (k) k.pos = { x: wp.x, y: wp.y };
      return;
    }
    const weights = new Map();
    let keep = null;
    const grid = this.gridSnapOn() ? this.gridStep() : 0;
    const snapG = (v) => (grid ? { x: Math.round(v.x / grid) * grid, y: Math.round(v.y / grid) * grid } : v);
    if (d.mode === 'point') {
      const p = sk.points.get(d.single);
      if (!p) return;
      let target = snapG(wp);
      d.mergeWith = null; d.snapOn = null;
      if (this.settings.get('snap')) {
        // aimantation sur les points, puis sur les entités (sauf celles du point lui-même) :
        // au lâcher, le point devient coïncident (ou milieu) comme pendant le tracé
        const exclude = new Set([d.single]);
        const own = new Set();
        for (const e of sk.entitiesOfPoint(d.single)) { own.add(e.id); for (const pid of sk.entityPointIds(e)) exclude.add(pid); }
        // pas d'accroche sur un point de la même répétition : les occurrences restent identiques à l'original
        for (const k of this.patternsOf(d.single)) for (const r of k.refs) if (sk.points.has(r)) exclude.add(r);
        const s = this.snap(wp, { excludePoints: exclude, excludeEntities: own });
        if (s.pointId) { target = { x: s.x, y: s.y }; d.mergeWith = s.pointId; }
        else if (ENTITY_SNAPS.has(s.kind)) { target = { x: s.x, y: s.y }; d.snapOn = s; }
      }
      p.x = target.x; p.y = target.y;
      weights.set(d.single, HEAVY);
      if (this.isPatternCopy(d.single)) keep = new Set([d.single]);
    } else if (d.mode === 'radius') {
      const c = sk.points.get(d.circle.c);
      d.circle.r = Math.max(this.vp.pxToWorld(2), dist(c, wp));
      weights.set(d.circle.id, HEAVY);
    } else {
      const delta = snapG(sub(wp, d.last));
      if (delta.x === 0 && delta.y === 0) return;
      for (const pid of d.ids) {
        const p = sk.points.get(pid);
        if (!p) continue;
        p.x += delta.x; p.y += delta.y;
        if (!d.anchor || pid === d.anchor) weights.set(pid, HEAVY);
      }
      if (d.anchor) keep = new Set([d.anchor]);
      for (const tid of d.texts || []) { const t = sk.texts.get(tid); if (t) { t.x += delta.x; t.y += delta.y; } }
      d.pendingLast = add(d.last, delta);
      if (!d.ids.size) { d.last = d.pendingLast; d.good = this.capturePositions(); return; }    // textes seuls
    }
    if (keep) {
      // occurrence tenue au doigt : elle suit le doigt sur sa trajectoire (même rayon autour du centre en
      // circulaire, le long de la direction en linéaire) ; seul l'espacement change, l'original reste en place
      const pid = [...keep][0];
      const q = sk.points.get(pid), from = d.good.pts.get(pid);
      const k = this.patternOfCopy(pid);
      const c = k && k.kind !== 'lin' && sk.points.get(k.center);
      let t = null;
      if (from && c && d.mode === 'translate') {
        // occurrence entière tirée en circulaire : elle tourne autour du centre comme le doigt
        const ang = (v) => Math.atan2(v.y - c.y, v.x - c.x);
        const da = ang(d.pendingLast) - ang(d.last), co = Math.cos(da), si = Math.sin(da);
        const vx = from[0] - c.x, vy = from[1] - c.y;
        t = { x: c.x + vx * co - vy * si, y: c.y + vx * si + vy * co };
      } else if (from) t = this.patternReach(pid, { x: from[0], y: from[1] }, { x: q.x, y: q.y });
      if (t) Object.assign(q, t);
    }
    const res = solveHeld(sk, { weights, maxIter: 40, keep });
    if (!res.ok) { this.restorePositions(d.good); return; }
    d.good = this.capturePositions();
    if (d.pendingLast) d.last = d.pendingLast;
  }
  endDrag(d) {
    const sk = this.sketch;
    if (d.mode === 'dim') { this.commit('Déplacement de cote'); return; }
    if (d.mode === 'point' && d.mergeWith && this.samePattern(d.mergeWith, d.single)) d.mergeWith = null;
    if (d.mode === 'point' && d.mergeWith && sk.points.has(d.mergeWith) && sk.points.has(d.single)) {
      const before = sk.serialize();
      const keep = sk.mergePoints(d.mergeWith, d.single);
      sk.cleanupDegenerate();
      if (!solve(sk).ok) { this.sketch = Sketch.deserialize(before); showToast('Coïncidence impossible ici'); }
      else { this.selection.delete(d.single); void keep; }
    } else if (d.mode === 'point' && d.snapOn && sk.points.has(d.single)) {
      // point lâché sur une entité : relation coïncidente (ou point milieu), annulée si impossible
      const before = sk.serialize();
      const s = d.snapOn;
      const ids = s.kind === 'intersection' ? (s.entityIds || []) : [s.entityId];
      const type = s.kind === 'midpoint' && sk.entities.get(s.entityId)?.type === 'line' ? 'midpoint' : 'coincident';
      for (const id of ids) if (sk.entities.has(id)) sk.addConstraint(type, [d.single, id]);
      if (!solve(sk).ok) { this.sketch = Sketch.deserialize(before); showToast('Coïncidence impossible ici', { error: true }); }
      else { this.commit(type === 'midpoint' ? 'Point milieu' : 'Coïncidente', { auto: true }); return; }
    }
    this.commit('Déplacement');
  }

  // ---------- Sélection ----------
  tapSelect(hit, info = {}) {
    if (!hit) { this.selection.clear(); return; }
    if (info.double && hit.type === 'dim') { this.selection.clear(); this.selection.add(hit.id); this.editDimension(hit.id); return; }
    if (info.double && hit.type === 'badge' && this.sketch.constraints.get(hit.id)?.type === 'pattern') {
      this.selection.clear(); this.selection.add(hit.id); this.editPatternCount(hit.id); return;
    }
    if (info.double && hit.type === 'text') { this.selection.clear(); this.selection.add(hit.id); this.editTextContent(hit.id); return; }
    if (this.multi) { if (this.selection.has(hit.id)) this.selection.delete(hit.id); else this.selection.add(hit.id); return; }
    if (this.selection.has(hit.id) && this.selection.size === 1) { this.selection.clear(); return; }
    this.selection.clear();
    this.selection.add(hit.id);
  }
  /**
   * Cadre : les entités, points isolés et cotes pris dans le cadre (fenêtre : entièrement dedans ; capture : touchés)
   * sont ajoutés à la sélection ; ceux qui y étaient déjà en sont retirés.
   */
  finishBox(box) {
    for (const id of this.boxHits(box)) { if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id); }
  }
  /** Cadre (monde) entre le point de départ et le doigt : vers la gauche = capture. */
  makeBox(startS, startW, s, wp) {
    return {
      minX: Math.min(startW.x, wp.x), maxX: Math.max(startW.x, wp.x),
      minY: Math.min(startW.y, wp.y), maxY: Math.max(startW.y, wp.y),
      crossing: s.x < startS.x,
    };
  }
  /** Éléments pris dans le cadre : entités, points isolés et (withDims) cotes. */
  boxHits(box, withDims = true) {
    const sk = this.sketch;
    const hit = new Set();
    const H = this.hidden();          // éléments masqués : jamais pris
    const inBox = (p) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
    for (const e of sk.entities.values()) {
      if (H && H.ents.has(e.id)) continue;
      const ok = box.crossing ? entityTouchesRect(sk, e, box) : entityInsideRect(sk, e, box);
      if (ok) hit.add(e.id);
    }
    for (const p of sk.points.values()) if (p.sketchPoint && inBox(p) && !(H && H.pts.has(p.id))) hit.add(p.id);
    if (!withDims) return hit;
    for (const t of sk.texts.values()) {
      if (H && H.texts.has(t.id)) continue;
      const b = textBox(t);
      const inside = b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY;
      const touch = b.maxX >= box.minX && b.minX <= box.maxX && b.maxY >= box.minY && b.minY <= box.maxY;
      if (box.crossing ? touch : inside) hit.add(t.id);
    }
    // cotes : par leur texte (rectangle écran ramené en monde)
    const a = this.vp.toScreen({ x: box.minX, y: box.maxY }), b = this.vp.toScreen({ x: box.maxX, y: box.minY });
    for (const k of sk.constraints.values()) {
      if (!isAnnotation(k) || (H && H.cons.has(k.id))) continue;
      const lay = dimLayout(sk, k);
      if (!lay) continue;
      const label = dimLabel(sk, k, this.settings.data);
      const t = this.renderer.dimTextCenter(lay, label);
      const size = this.renderer.dimTextSize(label);
      const r = lay.rot || 0, co = Math.abs(Math.cos(r)), si = Math.abs(Math.sin(r));
      const hw = co * size.w / 2 + si * size.h / 2, hh = si * size.w / 2 + co * size.h / 2;
      const inside = t.x - hw >= a.x && t.x + hw <= b.x && t.y - hh >= a.y && t.y + hh <= b.y;
      const touch = t.x + hw >= a.x && t.x - hw <= b.x && t.y + hh >= a.y && t.y - hh <= b.y;
      if (box.crossing ? touch : inside) hit.add(k.id);
    }
    return hit;
  }
  deleteSelection() {
    if (this.selection.size === 0) return;
    const sk = this.sketch;
    for (const id of this.selection) if (sk.constraints.has(id)) sk.removeConstraint(id);
    for (const id of this.selection) {
      if (sk.texts.has(id)) sk.texts.delete(id);
      else if (sk.entities.has(id)) sk.removeEntity(id);
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
      if (this.samePattern(a, b)) { showToast('Impossible : les occurrences d\'une répétition restent identiques à l\'original', { error: true, ms: 3000 }); return; }
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
  /** Angle signé (rotation) : positif = sens trigonométrique, non nul. */
  signedAngleKeypad(title, rad, onValue) {
    const deg = this.settings.get('angleUnit') !== 'rad';
    this.keypad.open({
      title, unit: deg ? '°' : 'rad', initial: fmtNumber(deg ? rad * 180 / Math.PI : rad, 4),
      validate: (v) => (Math.abs(v) > 1e-9 ? null : 'L\'angle ne peut pas être nul'),
      onSubmit: (v) => onValue(deg ? v * Math.PI / 180 : v),
    });
  }
  /**
   * Opération d'édition (outils de l'étape 3) : fn modifie l'esquisse et renvoie { ok, msg?, weights? }.
   * En cas d'échec (ou si le solveur n'y arrive pas), l'esquisse revient à l'état d'avant.
   */
  applyEdit(label, fn) {
    const before = this.sketch.serialize();
    let res;
    try { res = fn(this.sketch) || { ok: true }; } catch (err) { console.warn(err); res = { ok: false, msg: 'Opération impossible' }; }
    const revert = (msg) => {
      this.sketch = Sketch.deserialize(before);
      this.afterChange();
      if (msg) showToast(msg, { error: true, ms: 2600 });
    };
    if (!res.ok) { revert(res.msg); return res; }
    const sk = this.sketch;
    sk.cleanupDegenerate();
    const start = this.capturePositions();
    let s = solve(sk, { weights: res.weights || new Map() });
    if (!s.ok) { this.restorePositions(start); s = solve(sk); }
    if (!s.ok) { revert('Opération impossible : trop de contraintes'); return { ok: false }; }
    this.selection.clear();
    this.commit(label, { auto: true });
    return res;
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
    if (!e || e.infinite) return;
    if (e.type === 'line') this.lengthKeypad('Longueur de la ligne', entityLength(sk, e), (mm, flip) => this.setEntityValue(id, mm, flip), { flippable: true });
    else {
      const r = e.type === 'circle' ? e.r : dist(sk.points.get(e.c), sk.points.get(e.s));
      this.lengthKeypad(e.type === 'circle' ? 'Rayon du cercle' : 'Rayon de l\'arc', r, (mm) => this.setEntityValue(id, mm));
    }
  }
  /** Case d'une répétition (double tap) : nombre d'occurrences au clavier. */
  editPatternCount(cid) {
    const k = this.sketch.constraints.get(cid);
    if (!k || k.type !== 'pattern') return;
    this.keypad.open({
      title: 'Nombre d\'occurrences (original compris)', unit: '', initial: String(k.n),
      validate: (v) => (Number.isInteger(v) && v >= 2 && v <= 500 ? null : 'Un nombre entier, de 2 à 500'),
      onSubmit: (v) => {
        if (v === k.n) return;
        const r = this.applyEdit('Nombre d\'occurrences', (sk) => setPatternCount(sk, cid, v));
        if (r.ok && this.sketch.constraints.has(cid)) { this.selection.add(cid); this.refreshUI(); }
      },
    });
  }
  /** Double tap sur un texte : modifier son contenu. */
  editTextContent(id) {
    const t = this.sketch.texts.get(id);
    if (!t) return;
    askText('Modifier le texte', t.text).then((v) => {
      const cur = this.sketch.texts.get(id);
      if (v === null || !cur || v === cur.text) return;
      cur.text = v;
      this.commit('Texte modifié');
    });
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
      case 'dimAlong': {
        // le point passe de l'autre côté de la référence, le long de la ligne
        const L = sk.entities.get(k.refs[2]);
        const [o, p] = [P(k.refs[0]), P(k.refs[1])];
        let u = norm(sub(P(L.p2), P(L.p1)));
        if (k.perp) u = perp(u);
        Object.assign(p, add(p, mul(u, -2 * dot(sub(p, o), u))));
        for (const id of [k.refs[0], k.refs[1], L.p1, L.p2]) w.set(id, HEAVY);
        break;
      }
      case 'dimLineLine': {
        if (this.flipOffsetGroup(k, w)) break;
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
  /**
   * Cote d'un décalage verrouillé (outil Décaler, « Ajouter une cote ») : tout le contour décalé passe de l'autre
   * côté de l'original, pas seulement la ligne cotée. Chaque point de la copie est renvoyé de l'autre côté du
   * point d'origine qui lui correspond (exact pour les lignes et les arcs concentriques), puis le solveur ajuste.
   * @returns {boolean} true si la cote verrouille un décalage (poids remplis dans w).
   */
  flipOffsetGroup(k, w) {
    const sk = this.sketch;
    const pairs = [[k.refs[0], k.refs[1]]];
    for (const q of sk.constraints.values()) {
      if (q.type === 'offsetEq' && q.refs[0] === k.refs[0] && q.refs[1] === k.refs[1]) pairs.push([q.refs[2], q.refs[3]]);
    }
    if (pairs.length < 2) return false;
    const map = new Map();            // point de la copie → point d'origine
    const orig = new Set();
    for (const [oid, nid] of pairs) {
      const o = sk.entities.get(oid), n = sk.entities.get(nid);
      if (!o || !n || o.type !== n.type) continue;
      const keys = o.type === 'line' ? ['p1', 'p2'] : o.type === 'arc' ? ['s', 'e'] : [];
      for (const key of keys) { if (!map.has(n[key])) map.set(n[key], o[key]); orig.add(o[key]); }
      if (o.type === 'circle') n.r = Math.max(2 * o.r - n.r, 1e-6);
      for (const pid of sk.entityPointIds(o)) w.set(pid, HEAVY);
    }
    for (const [nid, oid] of map) {
      if (orig.has(nid)) continue;    // point commun à l'original et à la copie : il reste en place
      const q = sk.points.get(nid), o = sk.points.get(oid);
      if (!q || !o) continue;
      q.x = 2 * o.x - q.x; q.y = 2 * o.y - q.y;
      w.set(nid, HEAVY);
    }
    return true;
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
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;   // saisie d'un nom
    if (document.querySelector('.dialog-layer') || (this.projectsPanel && this.projectsPanel.isOpen)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelection(); }
    else if (e.key === 'Escape') { if (this.tool) { if (!this.tool.onToolbarTap()) this.setTool(null); } else { this.selection.clear(); this.refreshUI(); } }
  }
}

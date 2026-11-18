// Barre d'outils réduite (favoris) et développée (tous les groupes), avec appui long → variantes.
import { GROUPS, getTool, getGroup, describeFavorite, isAvailable } from './tools/registry.js';
import { icon } from './icons.js';
import { pressable } from './pressable.js';
import { popoverItem, popoverTitle } from './popover.js';

export class Toolbar {
  constructor(app, els) {
    this.app = app;
    this.els = els;
    this.expanded = false;
    this.activeToolId = null;
    els.toggle.innerHTML = icon('chevron');
    els.collapse.innerHTML = icon('chevron');
    els.toggle.addEventListener('click', (e) => { e.preventDefault(); this.setExpanded(true); });
    els.collapse.addEventListener('click', (e) => { e.preventDefault(); this.setExpanded(false); });
    this.render();
  }

  cellsPerRow() { const n = Math.round(this.app.settings.get('toolbarCells')); return n >= 5 && n <= 8 ? n : 6; }
  isLandscape() { return window.matchMedia('(orientation: landscape)').matches; }
  variantSide() { return this.isLandscape() ? 'right' : 'below'; }

  lastToolOf(group) {
    const last = this.app.settings.get('lastTools')[group.id];
    return (last && group.tools.find((t) => t.id === last)) || group.tools[0];
  }

  render() {
    const s = this.app.settings;
    const rows = s.get('toolbarRows') === 2 ? 2 : 1;
    this.els.bar.style.setProperty('--tb-rows', rows);
    this.els.bar.classList.toggle('rows-2', rows === 2);
    const cols = this.cellsPerRow();
    this.els.bar.style.setProperty('--tb-cols', cols);
    const n = rows * cols;
    const favs = s.get('favorites').slice(0, n);
    // dernière case : le dernier groupe utilisé qui n'est pas déjà dans les autres cases
    const recent = this.recentGroup();
    if (recent) favs[n - 1] = recent;
    this.els.cells.innerHTML = '';
    favs.forEach((item) => {
      const d = describeFavorite(item);
      const cell = document.createElement('button');
      cell.className = 'tb-cell';
      if (!d) { cell.innerHTML = icon('select'); cell.classList.add('disabled'); this.els.cells.appendChild(cell); return; }
      this.fillCell(cell, d, false);
      this.els.cells.appendChild(cell);
    });
    this.renderExpanded();
    this.setActive(this.activeToolId);
  }

  slotCount() { return (this.app.settings.get('toolbarRows') === 2 ? 2 : 1) * this.cellsPerRow(); }
  /** Groupes déjà présents dans les cases fixes (toutes sauf la dernière). */
  fixedGroups() {
    const ids = new Set();
    for (const item of this.app.settings.get('favorites').slice(0, this.slotCount() - 1)) {
      const d = describeFavorite(item);
      if (d) ids.add(d.group.id);
    }
    return ids;
  }
  recentGroup() {
    const r = this.app.settings.get('recentGroup');
    return r && getGroup(r) && !this.fixedGroups().has(r) ? r : null;
  }
  /** Un outil de ce groupe vient d'être choisi : il devient le « dernier groupe utilisé » s'il n'a pas sa case. */
  noteGroupUsed(gid) {
    if (this.fixedGroups().has(gid) || this.app.settings.get('recentGroup') === gid) return;
    this.app.settings.set('recentGroup', gid);
  }

  renderExpanded() {
    this.els.groups.innerHTML = '';
    for (const g of GROUPS) {
      const cell = document.createElement('button');
      cell.className = 'tb-cell';
      this.fillCell(cell, { kind: 'group', group: g }, true);
      this.els.groups.appendChild(cell);
    }
  }

  fillCell(cell, d, withLabel) {
    const tool = d.kind === 'tool' ? d.tool : this.lastToolOf(d.group);
    cell.dataset.group = d.group.id;
    cell.dataset.tool = tool.id;
    cell.dataset.kind = d.kind;
    cell.innerHTML = icon(tool.icon) + (withLabel ? `<span class="tb-label">${d.kind === 'tool' ? tool.label : d.group.label}</span>` : '');
    cell.setAttribute('aria-label', d.kind === 'tool' ? tool.label : d.group.label);
    if (d.kind === 'group' && d.group.tools.length > 1) cell.classList.add('group');
    if (!isAvailable(tool.id)) cell.classList.add('disabled');
    pressable(cell, {
      longMs: () => this.app.settings.get('longPressMs'),
      onTap: () => this.app.toolbarTap(cell.dataset.tool),
      onLongPress: d.kind === 'group' && d.group.tools.length > 1 ? () => this.openVariants(cell, d.group) : null,
    });
  }

  openVariants(anchor, group) {
    this.app.popovers.open({
      anchor,
      side: this.variantSide(),
      build: (el) => {
        el.appendChild(popoverTitle(group.label));
        for (const t of group.tools) {
          el.appendChild(popoverItem({
            icon: icon(t.icon), label: t.label, sub: t.sub || (!isAvailable(t.id) ? `Étape ${t.stage}` : ''),
            active: t.id === this.activeToolId, disabled: !isAvailable(t.id),
            onTap: () => { this.app.popovers.close(); this.app.toolbarTap(t.id, true); },
          }));
        }
      },
    });
  }

  setActive(toolId) {
    this.activeToolId = toolId;
    const all = [...this.els.cells.querySelectorAll('.tb-cell'), ...this.els.groups.querySelectorAll('.tb-cell')];
    for (const c of all) {
      const d = describeFavorite(c.dataset.kind === 'tool' ? 'tool:' + c.dataset.tool : c.dataset.group);
      if (!d) continue;
      const shown = d.kind === 'tool' ? d.tool : this.lastToolOf(d.group);
      c.dataset.tool = shown.id;
      const lbl = c.querySelector('.tb-label');
      c.innerHTML = icon(shown.icon) + (lbl ? `<span class="tb-label">${d.kind === 'tool' ? shown.label : d.group.label}</span>` : '');
      c.classList.toggle('disabled', !isAvailable(shown.id));
      c.classList.toggle('active', !!toolId && shown.id === toolId);
    }
  }

  setExpanded(on) {
    this.expanded = on;
    this.els.expanded.hidden = !on;
    if (on) this.fitExpanded();
    this.app.popovers.close();
  }
  /** Barre développée à la taille de son contenu : en paysage, juste assez de colonnes pour tous les groupes. */
  fitExpanded() {
    const el = this.els.expanded;
    if (!this.isLandscape()) { el.style.removeProperty('--xg-cols'); return; }
    const avail = window.innerHeight - 16 - 36;            // marges et flèche
    const perCol = Math.max(1, Math.floor((avail + 6) / (72 + 6)));
    el.style.setProperty('--xg-cols', Math.ceil(GROUPS.length / perCol));
  }
}

// Panneau Réglages (plein écran) : thème, barre d'outils, tracé, favoris, appui long, unités, couleurs, réinitialisation.
import { GROUPS, describeFavorite } from './tools/registry.js';
import { icon } from './icons.js';
import { popoverItem, popoverTitle } from './popover.js';
import { fmtNumber, fmtLength, fmtAngle, UNITS } from '../core/units.js';
import { DEFAULT_SETTINGS, COLOR_KEYS } from '../store/settings.js';

const UNIT_NAMES = { mm: 'Millimètre (mm)', cm: 'Centimètre (cm)', m: 'Mètre (m)', inch: 'Pouce (")', ft: 'Pied (\')', yd: 'Yard (vg)' };
import { APP_VERSION } from '../version.js';
import { showDialog } from './dialog.js';
import { buildHelp } from './help.js';

/** L'app est-elle entièrement en cache pour fonctionner sans réseau ? */
async function offlineStatus() {
  try {
    if (!('serviceWorker' in navigator) || !('caches' in window)) return 'Non disponible sur ce navigateur';
    const keys = await caches.keys();
    const ready = keys.includes(`esquisse2d-v${APP_VERSION}`);
    if (ready && navigator.serviceWorker.controller) return 'Prête (fonctionne sans réseau)';
    if (ready) return 'Prête au prochain lancement';
    return 'En préparation… (gardez le réseau quelques secondes)';
  } catch (err) { return 'Inconnu'; }
}

export class SettingsPanel {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    this.open_ = false;
  }
  open() { this.open_ = true; this.view = 'settings'; this.scroll = 0; this.render(); this.el.hidden = false; }
  close() { this.open_ = false; this.el.hidden = true; this.app.popovers.close(); }

  /** Demande confirmation, puis lance run. */
  confirm(title, message, label, run) {
    showDialog({
      title, message,
      buttons: [{ label: 'Annuler', value: 'cancel', style: 'cancel' }, { label, value: 'ok', style: 'danger' }],
    }).then(({ button }) => { if (button === 'ok') run(); });
  }

  render() {
    const s = this.app.settings;
    const el = this.el;
    // un réglage reconstruit le panneau : on garde l'endroit où l'on était
    const old = el.querySelector('.panel-body');
    if (old && this.view === this.renderedView) this.scroll = old.scrollTop;
    el.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'panel-header';
    if (this.view === 'help') {
      const back = document.createElement('button');
      back.className = 'panel-back';
      back.innerHTML = `<span class="chev back">${icon('chevronRight')}</span>Réglages`;
      back.addEventListener('click', (e) => { e.preventDefault(); this.view = 'settings'; this.scroll = this.settingsScroll || 0; this.render(); });
      header.appendChild(back);
    }
    const h2 = document.createElement('h2');
    h2.textContent = this.view === 'help' ? 'Aide' : 'Réglages';
    header.appendChild(h2);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Fermer';
    closeBtn.addEventListener('click', (e) => { e.preventDefault(); this.close(); });
    header.appendChild(closeBtn);
    el.appendChild(header);
    const body = document.createElement('div');
    body.className = 'panel-body';
    el.appendChild(body);
    this.renderedView = this.view;
    if (this.view === 'help') buildHelp(body);
    else this.renderSettings(body);
    body.scrollTop = this.scroll || 0;
  }

  /** Catégorie réductible : titre (touchez pour réduire / rouvrir) et sa carte. */
  section(body, key, label) {
    const s = this.app.settings;
    const collapsed = new Set(s.get('settingsCollapsed') || []);
    const t = document.createElement('button');
    t.className = 'section-title section-toggle' + (collapsed.has(key) ? ' collapsed' : '');
    t.innerHTML = `<span>${label}</span><span class="chev">${icon('chevronRight')}</span>`;
    t.setAttribute('aria-expanded', String(!collapsed.has(key)));
    t.addEventListener('click', (e) => {
      e.preventDefault();
      const c = new Set(s.get('settingsCollapsed') || []);
      if (c.has(key)) c.delete(key); else c.add(key);
      s.set('settingsCollapsed', [...c]);
      this.render();
    });
    body.appendChild(t);
    const card = document.createElement('div');
    card.className = 'card';
    card.hidden = collapsed.has(key);
    body.appendChild(card);
    return card;
  }

  renderSettings(body) {
    const s = this.app.settings;
    // --- Apparence ---
    let card = this.section(body, 'appearance', 'Apparence');
    card.appendChild(row('Thème', segmented([['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Automatique']], s.get('theme'), (v) => s.set('theme', v))));

    // --- Barre d'outils ---
    card = this.section(body, 'toolbar', 'Barre d\'outils');
    card.appendChild(row('Cases par ligne', segmented([[5, '5'], [6, '6'], [7, '7'], [8, '8']], this.app.toolbar.cellsPerRow(), (v) => { s.set('toolbarCells', v); this.render(); })));
    card.appendChild(row('Lignes', segmented([[1, '1 ligne'], [2, '2 lignes']], s.get('toolbarRows'), (v) => { s.set('toolbarRows', v); this.render(); })));
    const lp = document.createElement('button');
    lp.className = 'row';
    lp.innerHTML = `<span class="row-label">Durée de l'appui long</span><span class="row-value">${fmtNumber(s.get('longPressMs') / 1000, 2)} s<span class="chev">${icon('chevronRight')}</span></span>`;
    lp.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.keypad.open({
        title: 'Durée de l\'appui long', unit: 's', initial: fmtNumber(s.get('longPressMs') / 1000, 2),
        validate: (v) => (v >= 0.2 && v <= 3 ? null : 'Entre 0,2 et 3 s'),
        onSubmit: (v) => { s.set('longPressMs', Math.round(v * 1000)); this.render(); },
      });
    });
    card.appendChild(lp);

    // --- Tracé ---
    card = this.section(body, 'drawing', 'Tracé');
    card.appendChild(row('Poser les points', segmented([['tap', 'Touchers'], ['drag', 'Glisser'], ['both', 'Les deux']], s.get('drawInput'), (v) => { s.set('drawInput', v); this.render(); })));
    const how = {
      tap: 'Un toucher par point : 2 touchers (3 pour certains outils). Glisser avant de lâcher ajuste le point.',
      drag: 'Posez le doigt sur le premier point, glissez et lâchez sur le deuxième. Le troisième point éventuel se pose d\u2019un toucher.',
      both: 'Touchers successifs, ou glisser-lâcher : un doigt qui glisse dès le premier point trace directement.',
    }[s.get('drawInput')] || '';
    const note = document.createElement('div'); note.className = 'row-note'; note.textContent = how;
    card.appendChild(note);

    // --- Favoris ---
    card = this.section(body, 'favorites', 'Favoris de la barre réduite');
    const n = (s.get('toolbarRows') === 2 ? 2 : 1) * this.app.toolbar.cellsPerRow();
    const favs = s.get('favorites');
    for (let i = 0; i < n; i++) {
      if (i === n - 1) {
        // dernière case : automatique
        const g = this.app.toolbar.recentGroup();
        const d = describeFavorite(g || favs[i]);
        const r = document.createElement('div');
        r.className = 'row';
        const ic = d ? icon(d.kind === 'tool' ? d.tool.icon : d.group.tools[0].icon) : '';
        r.innerHTML = `<span class="row-label">Case ${i + 1}<br><small class="row-sub">Dernier groupe utilisé</small></span><span class="row-value"><span class="fav-icon">${ic}</span>${d ? (d.kind === 'tool' ? d.tool.label : d.group.label) : '—'}</span>`;
        card.appendChild(r);
        continue;
      }
      const d = describeFavorite(favs[i]);
      const r = document.createElement('button');
      r.className = 'row';
      const lbl = d ? (d.kind === 'tool' ? `${d.tool.label} (outil)` : `${d.group.label} (groupe)`) : '—';
      const ic = d ? icon(d.kind === 'tool' ? d.tool.icon : (d.group.tools[0].icon)) : '';
      r.innerHTML = `<span class="row-label">Case ${i + 1}</span><span class="row-value"><span class="fav-icon">${ic}</span>${lbl}<span class="chev">${icon('chevronRight')}</span></span>`;
      r.addEventListener('click', (e) => { e.preventDefault(); this.chooseFavorite(r, i); });
      card.appendChild(r);
    }

    // --- Unités ---
    card = this.section(body, 'units', 'Unités');
    const unitBtn = document.createElement('button');
    unitBtn.className = 'row';
    const U = UNITS[s.get('unit')] || UNITS.mm;
    unitBtn.innerHTML = `<span class="row-label">Unité de longueur</span><span class="row-value">${UNIT_NAMES[s.get('unit')] || 'mm'}<span class="chev">${icon('chevronRight')}</span></span>`;
    unitBtn.addEventListener('click', (e) => { e.preventDefault(); this.chooseUnit(unitBtn); });
    card.appendChild(unitBtn);
    const frac = row('Précision des fractions', segmented([[8, '1/8'], [16, '1/16'], [32, '1/32'], [64, '1/64']], s.get('fractionDenominator'), (v) => { s.set('fractionDenominator', v); this.render(); }));
    if (!U.imperial) frac.classList.add('dim-row');
    card.appendChild(frac);
    card.appendChild(row('Unité d\'angle', segmented([['deg', 'Degrés'], ['rad', 'Radians']], s.get('angleUnit'), (v) => { s.set('angleUnit', v); this.render(); })));
    const ex = document.createElement('div'); ex.className = 'row-note';
    const sample = 133.35;     // 5 1/4 pouces
    ex.textContent = `Exemple : ${fmtLength(sample, s.data)} · ${fmtAngle(Math.PI / 6, s.data)}` + (U.imperial ? ' · les fractions s\'arrondissent au 1/' + s.get('fractionDenominator') : ' · la géométrie ne change pas, seul l\'affichage change');
    card.appendChild(ex);

    // --- Couleurs ---
    card = this.section(body, 'colors', 'Couleurs');
    const themeKey = s.resolvedTheme();      // couleurs du thème affiché
    const cols = { ...DEFAULT_SETTINGS.colors[themeKey], ...(s.get('colors')[themeKey] || {}) };
    const tn = document.createElement('div'); tn.className = 'row-note';
    tn.textContent = `Couleurs du thème ${themeKey === 'dark' ? 'sombre' : 'clair'} (celui qui est affiché).`;
    card.appendChild(tn);
    for (const [key, label, sub] of COLOR_KEYS) {
      const r = document.createElement('label');
      r.className = 'row color-row';
      r.innerHTML = `<span class="row-label">${label}${sub ? `<br><small class="row-sub">${sub}</small>` : ''}</span><span class="color-swatch" style="background:${cols[key]}"></span>`;
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = cols[key];
      inp.className = 'color-input';
      inp.addEventListener('input', () => {
        const all = JSON.parse(JSON.stringify(s.get('colors')));
        all[themeKey] = { ...DEFAULT_SETTINGS.colors[themeKey], ...all[themeKey], [key]: inp.value };
        s.set('colors', all);
        r.querySelector('.color-swatch').style.background = inp.value;
      });
      r.appendChild(inp);
      card.appendChild(r);
    }
    const resetC = document.createElement('button');
    resetC.className = 'row button';
    resetC.textContent = 'Couleurs par défaut';
    resetC.addEventListener('click', (e) => {
      e.preventDefault();
      this.confirm('Couleurs par défaut', `Les couleurs du thème ${themeKey === 'dark' ? 'sombre' : 'clair'} reprennent leurs valeurs d'origine.`, 'Rétablir', () => {
        const all = JSON.parse(JSON.stringify(s.get('colors')));
        all[themeKey] = { ...DEFAULT_SETTINGS.colors[themeKey] };
        s.set('colors', all);
        this.render();
      });
    });
    card.appendChild(resetC);

    // --- Réinitialiser ---
    body.appendChild(title(' '));
    card = document.createElement('div'); card.className = 'card';
    const reset = document.createElement('button');
    reset.className = 'row button danger';
    reset.textContent = 'Réinitialiser les réglages';
    reset.addEventListener('click', (e) => {
      e.preventDefault();
      this.confirm('Réinitialiser les réglages', 'Tous les réglages reprennent leurs valeurs d\'origine. Les esquisses ne sont pas touchées.', 'Réinitialiser', () => { s.reset(); this.render(); });
    });
    card.appendChild(reset);
    body.appendChild(card);

    card = this.section(body, 'about', 'À propos');
    card.appendChild(row('Esquisse 2D', textValue(`Version ${APP_VERSION} · étape 4`)));
    const off = textValue('Vérification…');
    card.appendChild(row('Hors ligne', off));
    offlineStatus().then((t) => { off.textContent = t; });

    // --- Aide ---
    body.appendChild(title(' '));
    card = document.createElement('div'); card.className = 'card';
    const help = document.createElement('button');
    help.className = 'row button';
    help.textContent = 'Aide : outils, relations, cotes, gestes';
    help.addEventListener('click', (e) => { e.preventDefault(); this.settingsScroll = body.scrollTop; this.view = 'help'; this.scroll = 0; this.render(); });
    card.appendChild(help);
    body.appendChild(card);
  }

  chooseUnit(anchor) {
    const s = this.app.settings;
    this.app.popovers.open({
      anchor, side: 'below', width: 240,
      build: (el) => {
        el.appendChild(popoverTitle('Unité de longueur'));
        for (const [k, label] of Object.entries(UNIT_NAMES)) {
          el.appendChild(popoverItem({
            label, sub: UNITS[k].imperial ? 'Affichage en fractions' : 'Affichage décimal', active: s.get('unit') === k,
            onTap: () => { s.set('unit', k); this.app.popovers.close(); this.render(); },
          }));
        }
      },
    });
  }
  chooseFavorite(anchor, index) {
    const s = this.app.settings;
    const current = s.get('favorites')[index];
    this.app.popovers.open({
      anchor, side: 'below', width: 260,
      build: (el) => {
        el.appendChild(popoverTitle(`Case ${index + 1}`));
        for (const g of GROUPS) {
          el.appendChild(popoverItem({
            icon: icon(g.tools[0].icon), label: g.label, sub: 'Groupe entier', active: current === g.id,
            onTap: () => this.setFavorite(index, g.id),
          }));
          if (g.tools.length > 1) {
            for (const t of g.tools) {
              el.appendChild(popoverItem({
                icon: icon(t.icon), label: t.label, indent: true, active: current === 'tool:' + t.id,
                onTap: () => this.setFavorite(index, 'tool:' + t.id),
              }));
            }
          }
        }
      },
    });
  }
  setFavorite(index, value) {
    const favs = [...this.app.settings.get('favorites')];
    favs[index] = value;
    this.app.settings.set('favorites', favs);
    this.app.popovers.close();
    this.render();
  }
}

function title(t) { const d = document.createElement('div'); d.className = 'section-title'; d.textContent = t; return d; }
function row(label, valueEl) {
  const r = document.createElement('div'); r.className = 'row';
  const l = document.createElement('span'); l.className = 'row-label'; l.textContent = label;
  r.append(l, valueEl);
  return r;
}
function textValue(t) { const sp = document.createElement('span'); sp.className = 'row-value'; sp.textContent = t; return sp; }
function segmented(options, value, onChange) {
  const d = document.createElement('div'); d.className = 'segmented';
  for (const [v, label] of options) {
    const b = document.createElement('button');
    b.textContent = label;
    if (v === value) b.classList.add('active');
    b.addEventListener('click', (e) => { e.preventDefault(); d.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); onChange(v); });
    d.appendChild(b);
  }
  return d;
}
function stepper(value, min, max, step, onChange, fmt) {
  const d = document.createElement('div'); d.className = 'stepper';
  const minus = document.createElement('button'); minus.textContent = '−';
  const plus = document.createElement('button'); plus.textContent = '+';
  const val = document.createElement('span'); val.className = 'val'; val.textContent = fmt(value);
  let v = value;
  const upd = (nv) => { v = Math.min(max, Math.max(min, Math.round(nv * 1000) / 1000)); val.textContent = fmt(v); onChange(v); };
  minus.addEventListener('click', (e) => { e.preventDefault(); upd(v - step); });
  plus.addEventListener('click', (e) => { e.preventDefault(); upd(v + step); });
  d.append(minus, val, plus);
  return d;
}

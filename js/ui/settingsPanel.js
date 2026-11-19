// Panneau Réglages (plein écran) : thème, barre d'outils, tracé, favoris, appui long, unités, couleurs, réinitialisation.
import { GROUPS, describeFavorite } from './tools/registry.js';
import { icon } from './icons.js';
import { popoverItem, popoverTitle } from './popover.js';
import { fmtNumber, fmtLength, fmtAngle, UNITS } from '../core/units.js';
import { DEFAULT_SETTINGS, COLOR_KEYS } from '../store/settings.js';

const UNIT_NAMES = { mm: 'Millimètre (mm)', cm: 'Centimètre (cm)', m: 'Mètre (m)', inch: 'Pouce (")', ft: 'Pied (\')', yd: 'Yard (vg)' };
import { APP_VERSION } from '../version.js';

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
  open() { this.open_ = true; this.render(); this.el.hidden = false; }
  close() { this.open_ = false; this.el.hidden = true; this.app.popovers.close(); }

  render() {
    const s = this.app.settings;
    const el = this.el;
    el.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = '<h2>Réglages</h2>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Fermer';
    closeBtn.addEventListener('click', (e) => { e.preventDefault(); this.close(); });
    header.appendChild(closeBtn);
    el.appendChild(header);
    const body = document.createElement('div');
    body.className = 'panel-body';
    el.appendChild(body);

    // --- Apparence ---
    body.appendChild(title('Apparence'));
    let card = document.createElement('div'); card.className = 'card';
    card.appendChild(row('Thème', segmented([['light', 'Clair'], ['dark', 'Sombre'], ['auto', 'Automatique']], s.get('theme'), (v) => s.set('theme', v))));
    body.appendChild(card);

    // --- Barre d'outils ---
    body.appendChild(title('Barre d\'outils'));
    card = document.createElement('div'); card.className = 'card';
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
    body.appendChild(card);

    // --- Tracé ---
    body.appendChild(title('Tracé'));
    card = document.createElement('div'); card.className = 'card';
    card.appendChild(row('Poser les points', segmented([['tap', 'Touchers'], ['drag', 'Glisser'], ['both', 'Les deux']], s.get('drawInput'), (v) => { s.set('drawInput', v); this.render(); })));
    const how = {
      tap: 'Un toucher par point : 2 touchers (3 pour certains outils). Glisser avant de lâcher ajuste le point.',
      drag: 'Posez le doigt sur le premier point, glissez et lâchez sur le deuxième. Le troisième point éventuel se pose d\u2019un toucher.',
      both: 'Touchers successifs, ou glisser-lâcher : un doigt qui glisse dès le premier point trace directement.',
    }[s.get('drawInput')] || '';
    const note = document.createElement('div'); note.className = 'row-note'; note.textContent = how;
    card.appendChild(note);
    body.appendChild(card);

    // --- Favoris ---
    body.appendChild(title('Favoris de la barre réduite'));
    card = document.createElement('div'); card.className = 'card';
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
    body.appendChild(card);

    // --- Unités ---
    body.appendChild(title('Unités'));
    card = document.createElement('div'); card.className = 'card';
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
    body.appendChild(card);

    // --- Couleurs ---
    body.appendChild(title('Couleurs'));
    card = document.createElement('div'); card.className = 'card';
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
      const all = JSON.parse(JSON.stringify(s.get('colors')));
      all[themeKey] = { ...DEFAULT_SETTINGS.colors[themeKey] };
      s.set('colors', all);
      this.render();
    });
    card.appendChild(resetC);
    body.appendChild(card);

    // --- Réinitialiser ---
    body.appendChild(title(' '));
    card = document.createElement('div'); card.className = 'card';
    const reset = document.createElement('button');
    reset.className = 'row button danger';
    reset.textContent = 'Réinitialiser les réglages';
    reset.addEventListener('click', (e) => { e.preventDefault(); s.reset(); this.render(); });
    card.appendChild(reset);
    body.appendChild(card);

    body.appendChild(title('À propos'));
    card = document.createElement('div'); card.className = 'card';
    card.appendChild(row('Esquisse 2D', textValue(`Version ${APP_VERSION} · étape 4`)));
    const off = textValue('Vérification…');
    card.appendChild(row('Hors ligne', off));
    offlineStatus().then((t) => { off.textContent = t; });
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

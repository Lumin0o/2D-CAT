// Réglages : valeurs par défaut, persistance, notification des changements.
import { db } from './db.js';
import { DEFAULT_VISIBILITY } from '../core/visibility.js';

export const DEFAULT_FAVORITES = [
  'line', 'rect', 'circle', 'arc', 'construction', 'dimension',
  'measure', 'trim', 'offset', 'mirror', 'fillet', 'move',
  'tool:rectCenter', 'tool:circle3', 'tool:arc3', 'tool:dimOrdinate',
];
export const MAX_CELLS = 8;         // cases par ligne : 5 à 8

/** Couleurs réglables (Réglages › Couleurs), dans l'ordre de la liste : clé, libellé, précision. */
export const COLOR_KEYS = [
  ['under', 'Sous-contrainte', 'Encore libre'],
  ['full', 'Entièrement contrainte', ''],
  ['over', 'Sur-contrainte', 'Et erreurs'],
  ['selected', 'Sélection', 'Éléments sélectionnés ou désignés'],
  ['preview', 'Tracé en cours', 'Aperçu de ce qu\'on dessine, cote en cours'],
  ['ghost', 'Aperçu des modifications', 'Décaler, symétrie, copier, répétition…'],
  ['snap', 'Accrochage', 'Symbole d\'aimantation'],
  ['origin', 'Origine', 'Flèches des axes'],
  ['axis', 'Axes', 'Pointillés passant par l\'origine'],
  ['grid', 'Grille', ''],
  ['dim', 'Cotes', ''],
  ['dimDriven', 'Cotes pilotées', ''],
  ['badge', 'Relations', 'Icônes des relations'],
  ['pattern', 'Répétitions', 'Case du nombre d\'occurrences'],
  ['measure', 'Mètre', 'Mesure et cadre de capture'],
  ['text', 'Textes', 'Couleur « automatique » de l\'outil Texte'],
];

export const DEFAULT_SETTINGS = {
  theme: 'auto',              // 'light' | 'dark' | 'auto'
  unit: 'mm',                 // mm cm m inch ft yd
  fractionDenominator: 16,    // 8 16 32 64
  angleUnit: 'deg',           // 'deg' | 'rad'
  longPressMs: 500,
  toolbarRows: 1,             // 1 | 2
  toolbarCells: 6,            // cases par ligne (5 à 8)
  drawInput: 'tap',           // tracé : 'tap' (touchers successifs) | 'drag' (glisser-lâcher) | 'both'
  favorites: [...DEFAULT_FAVORITES],   // id de groupe, ou 'tool:<id>'
  colors: {                   // couleurs du dessin, par thème (voir COLOR_KEYS)
    light: {
      under: '#1f6fe5', full: '#111111', over: '#e0241c', selected: '#ff8a00', preview: '#1f6fe5', ghost: '#ffff00',
      snap: '#c98a00', origin: '#d8392b', dim: '#3c3c43', dimDriven: '#8e8e93', badge: '#1c7a35', pattern: '#8a3ccf',
      measure: '#30b14e', text: '#111111', grid: '#a2a6b2', axis: '#95959f',
    },
    dark: {
      under: '#6db3ff', full: '#f2f2f0', over: '#ff453a', selected: '#ffb340', preview: '#9ad0ff', ghost: '#ffff00',
      snap: '#ffd60a', origin: '#ff6b5e', dim: '#c9c9ce', dimDriven: '#8e8e93', badge: '#7ee29a', pattern: '#c79bff',
      measure: '#32d158', text: '#f2f2f0', grid: '#4a4d55', axis: '#6b6b72',
    },
  },
  snap: true,                 // interrupteur général « Aimant » : sans lui, aucun des types ci-dessous n'agit
  snapTypes: {                // types d'aimantation et relations automatiques correspondantes
    points: true,             // extrémités, centres, origine → coïncidence (point partagé)
    midpoints: true,          // milieux → point milieu
    quadrants: true,          // quadrants des cercles → coïncidente
    intersections: true,      // intersections → coïncidentes
    onEntity: true,           // sur une entité → coïncidente
    horizontal: true,         // ligne presque horizontale → redressée + horizontale
    vertical: true,           // ligne presque verticale → redressée + verticale
    tangent: true,            // arc dans le prolongement → tangente
  },
  grid: false,
  gridSnap: true,             // aimantation à la grille (si l'aimant est actif et la grille affichée)
  lastTools: {},              // groupId -> toolId (dernier outil utilisé du groupe)
  recentGroup: null,          // dernier groupe utilisé hors des cases fixes : affiché dans la dernière case
  offsetOpts: { chain: true, dim: true, construction: false },    // options de l'outil Décaler
  patternOpts: { link: true, dim: true, even: false },             // options des répétitions
  settingsCollapsed: [],                                           // Réglages : catégories réduites
  cornerOpts: { filletDim: true, chamferDim: true },               // congé / chanfrein : ajouter les cotes
  textOpts: { size: null, color: null },                           // outil Texte : dernière taille (mm) et couleur
  optsCollapsed: false,                                            // petite fenêtre d'options réduite
  visibility: { ...DEFAULT_VISIBILITY },  // affichage (bouton œil) : types d'éléments visibles sur le dessin
  rev: 1,                     // révision des réglages enregistrés (migrations)
};

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? [...over] : [...base];
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (over && typeof over === 'object') {
      for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
    }
    return out;
  }
  return over === undefined ? base : over;
}

export class Settings {
  constructor() {
    this.data = deepMerge(DEFAULT_SETTINGS, {});
    this.listeners = new Set();
    this._saveTimer = null;
  }
  async load() {
    const saved = await db.get('settings');
    if (saved) {
      this.data = deepMerge(DEFAULT_SETTINGS, saved);
      // 0.3.3 : « Ajouter une cote » de l'outil Décaler devient actif par défaut
      if (!(saved.rev >= 1)) this.data.offsetOpts = { ...this.data.offsetOpts, dim: true };
      this.data.rev = DEFAULT_SETTINGS.rev;
    }
    // Garantit 2 × 8 favoris
    const fav = this.data.favorites.slice(0, 2 * MAX_CELLS);
    while (fav.length < 2 * MAX_CELLS) fav.push(DEFAULT_FAVORITES[fav.length]);
    this.data.favorites = fav;
    return this.data;
  }
  get(key) { return this.data[key]; }
  set(key, value, silent = false) {
    this.data[key] = value;
    this.scheduleSave();
    if (!silent) this.emit(key);
  }
  update(patch) {
    Object.assign(this.data, patch);
    this.scheduleSave();
    for (const k of Object.keys(patch)) this.emit(k);
  }
  reset() {
    const keepLast = this.data.lastTools;
    this.data = deepMerge(DEFAULT_SETTINGS, { lastTools: keepLast });
    this.scheduleSave();
    this.emit('*');
  }
  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => db.set('settings', JSON.parse(JSON.stringify(this.data))), 150);
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(key) { for (const fn of this.listeners) fn(key, this.data); }

  /** Thème effectif ('light' | 'dark'). */
  resolvedTheme() {
    if (this.data.theme === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return this.data.theme;
  }
}

export function applyTheme(settings) {
  const t = settings.get('theme');
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = settings.resolvedTheme() === 'dark' ? '#000000' : '#cbcbd7';
}

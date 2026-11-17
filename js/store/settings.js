// Réglages : valeurs par défaut, persistance, notification des changements.
import { db } from './db.js';

export const DEFAULT_FAVORITES = [
  'line', 'rect', 'circle', 'arc', 'construction', 'dimension',
  'measure', 'trim', 'offset', 'mirror', 'fillet', 'move',
];

export const DEFAULT_SETTINGS = {
  theme: 'auto',              // 'light' | 'dark' | 'auto'
  unit: 'mm',                 // mm cm m inch ft yd
  fractionDenominator: 16,    // 8 16 32 64
  angleUnit: 'deg',           // 'deg' | 'rad'
  longPressMs: 500,
  toolbarRows: 1,             // 1 | 2
  favorites: [...DEFAULT_FAVORITES],   // id de groupe, ou 'tool:<id>'
  colors: {
    light: { under: '#1f6fe5', full: '#111111', over: '#e0241c' },
    dark:  { under: '#6db3ff', full: '#f2f2f0', over: '#ff453a' },
  },
  snap: true,
  grid: false,
  gridSnap: true,             // aimantation à la grille (active seulement si la grille est affichée)
  lastTools: {},              // groupId -> toolId (dernier outil utilisé du groupe)
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
    if (saved) this.data = deepMerge(DEFAULT_SETTINGS, saved);
    // Garantit 12 favoris
    const fav = this.data.favorites.slice(0, 12);
    while (fav.length < 12) fav.push(DEFAULT_FAVORITES[fav.length]);
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
  if (meta) meta.content = settings.resolvedTheme() === 'dark' ? '#000000' : '#f2f2f7';
}

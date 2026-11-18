// Affichage : ce qu'on masque sur la zone de dessin (bouton œil). Un élément masqué n'est ni dessiné,
// ni sélectionnable, ni aimanté ; il reste dans l'esquisse et ses relations agissent toujours.
import { ORIGIN_ID } from './model.js';
import { isAnnotation } from './solver.js';

/** Types d'éléments, dans l'ordre de la fenêtre (clé de settings.visibility, libellé). */
export const VIS_TYPES = [
  ['lines', 'Lignes'],
  ['circles', 'Cercles'],
  ['arcs', 'Arcs'],
  ['construction', 'Construction'],
  ['points', 'Points'],
  ['dims', 'Cotes'],
  ['relations', 'Relations'],
  ['axes', 'Axes et origine'],
];
export const DEFAULT_VISIBILITY = Object.fromEntries(VIS_TYPES.map(([k]) => [k, true]));

/** Catégorie d'une entité (la construction l'emporte : lignes, lignes infinies, cercles et arcs de construction). */
export function entityVisKey(e) {
  if (e.construction || e.infinite) return 'construction';
  return e.type === 'line' ? 'lines' : e.type === 'circle' ? 'circles' : 'arcs';
}

/**
 * Éléments masqués de l'esquisse, ou null si tout est visible. Seul ce que l'interrupteur désigne est masqué :
 * une ligne masquée garde ses points, ses cotes et ses relations à l'écran.
 * - entités : selon leur catégorie ;
 * - points : « Points » (origine : « Axes et origine ») ;
 * - cotes (et cotes 0 des ordinales) : « Cotes » ; relations : « Relations ».
 * @returns {{ents:Set<string>, pts:Set<string>, cons:Set<string>, axes:boolean}|null}
 */
export function hiddenItems(sk, vis) {
  const v = { ...DEFAULT_VISIBILITY, ...(vis || {}) };
  if (VIS_TYPES.every(([k]) => v[k])) return null;
  const ents = new Set(), pts = new Set(), cons = new Set();
  for (const e of sk.entities.values()) if (!v[entityVisKey(e)]) ents.add(e.id);
  for (const p of sk.points.values()) if (!(p.id === ORIGIN_ID ? v.axes : v.points)) pts.add(p.id);
  for (const k of sk.constraints.values()) if (!(isAnnotation(k) ? v.dims : v.relations)) cons.add(k.id);
  return { ents, pts, cons, axes: v.axes };
}

/** Nombre de types masqués (0 : tout est visible). */
export function hiddenCount(vis) {
  const v = { ...DEFAULT_VISIBILITY, ...(vis || {}) };
  return VIS_TYPES.filter(([k]) => !v[k]).length;
}

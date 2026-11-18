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
 * Éléments masqués de l'esquisse, ou null si tout est visible.
 * - entités : selon leur catégorie ;
 * - points : « Points » coupé, ou toutes leurs entités masquées (origine : « Axes et origine ») ;
 * - cotes / relations : leur interrupteur, ou un élément coté masqué avec son entité (pas l'origine).
 * @returns {{ents:Set<string>, pts:Set<string>, cons:Set<string>, axes:boolean}|null}
 */
export function hiddenItems(sk, vis) {
  const v = { ...DEFAULT_VISIBILITY, ...(vis || {}) };
  if (VIS_TYPES.every(([k]) => v[k])) return null;
  const ents = new Set(), pts = new Set(), cons = new Set();
  const shown = new Set();          // points d'au moins une entité visible
  for (const e of sk.entities.values()) {
    if (!v[entityVisKey(e)]) ents.add(e.id);
    else for (const pid of sk.entityPointIds(e)) shown.add(pid);
  }
  const gone = new Set(ents);       // éléments qui emportent leurs cotes et relations
  for (const p of sk.points.values()) {
    if (p.id === ORIGIN_ID) { if (!v.axes) pts.add(p.id); continue; }
    const orphan = !p.sketchPoint && !shown.has(p.id);
    if (orphan) gone.add(p.id);
    if (orphan || !v.points) pts.add(p.id);
  }
  for (const k of sk.constraints.values()) {
    if (!(isAnnotation(k) ? v.dims : v.relations) || k.refs.some((r) => gone.has(r))) cons.add(k.id);
  }
  // cotes ordinales : masquées avec leur cote 0
  for (const k of sk.constraints.values()) if (k.ord && cons.has(k.ord)) cons.add(k.id);
  return { ents, pts, cons, axes: v.axes };
}

/** Nombre de types masqués (0 : tout est visible). */
export function hiddenCount(vis) {
  const v = { ...DEFAULT_VISIBILITY, ...(vis || {}) };
  return VIS_TYPES.filter(([k]) => !v[k]).length;
}

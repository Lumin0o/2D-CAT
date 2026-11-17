// Registre des groupes d'outils (comme SOLIDWORKS) et des classes d'outils.
import { LineTool, LineMidTool } from './line.js';
import { Rect2Tool, RectCenterTool, Rect3CornerTool, Rect3CenterTool, ParallelogramTool } from './rect.js';
import { CircleCenterTool, Circle3Tool } from './circle.js';
import { ArcCenterTool, Arc3Tool, ArcTangentTool } from './arc.js';
import { DimensionTool, DimHorizontalTool, DimVerticalTool, DimChainTool } from './dimension.js';

export const GROUPS = [
  { id: 'line', label: 'Ligne', tools: [
    { id: 'line2', label: 'Ligne', sub: 'Par deux extrémités', icon: 'line' },
    { id: 'lineMid', label: 'Ligne par le milieu', icon: 'lineMid' },
  ] },
  { id: 'rect', label: 'Rectangle', tools: [
    { id: 'rect2', label: 'Rectangle', sub: 'Par deux coins', icon: 'rect' },
    { id: 'rectCenter', label: 'Rectangle par le centre', icon: 'rectCenter' },
    { id: 'rect3corner', label: 'Rectangle 3 points coin', icon: 'rect3' },
    { id: 'rect3center', label: 'Rectangle 3 points centre', icon: 'rect3c' },
    { id: 'parallelogram', label: 'Parallélogramme', icon: 'para' },
  ] },
  { id: 'circle', label: 'Cercle', tools: [
    { id: 'circleCenter', label: 'Cercle', sub: 'Par le centre', icon: 'circle' },
    { id: 'circle3', label: 'Cercle par 3 points', icon: 'circle3' },
  ] },
  { id: 'arc', label: 'Arc', tools: [
    { id: 'arcCenter', label: 'Arc centre et extrémités', icon: 'arcCenter' },
    { id: 'arcTangent', label: 'Arc tangent', icon: 'arcTangent' },
    { id: 'arc3', label: 'Arc par 3 points', icon: 'arc3' },
  ] },
  { id: 'construction', label: 'Construction', tools: [
    { id: 'constructionLine', label: 'Ligne de construction', icon: 'construction', stage: 3 },
    { id: 'toggleConstruction', label: 'Basculer en construction', icon: 'constructionToggle', stage: 3 },
  ] },
  { id: 'dimension', label: 'Cotation', tools: [
    { id: 'smartDimension', label: 'Cotation intelligente', icon: 'dimension' },
    { id: 'dimHorizontal', label: 'Cote horizontale', icon: 'dimH' },
    { id: 'dimVertical', label: 'Cote verticale', icon: 'dimV' },
    { id: 'dimChain', label: 'Cotation en chaîne', sub: 'Cotes alignées, de point en point', icon: 'dimChain' },
  ] },
  { id: 'measure', label: 'Mètre', tools: [
    { id: 'measure', label: 'Mètre', sub: 'Mesure sans créer de cote', icon: 'measure', stage: 3 },
  ] },
  { id: 'trim', label: 'Ajuster', tools: [
    { id: 'trim', label: 'Ajuster intelligent', icon: 'trim', stage: 3 },
    { id: 'extend', label: 'Prolonger', icon: 'extend', stage: 3 },
  ] },
  { id: 'offset', label: 'Décaler', tools: [
    { id: 'offset', label: 'Décaler les entités', icon: 'offset', stage: 3 },
  ] },
  { id: 'mirror', label: 'Miroir', tools: [
    { id: 'mirror', label: 'Miroir', sub: 'Par rapport à une ligne', icon: 'mirror', stage: 3 },
  ] },
  { id: 'fillet', label: 'Congé', tools: [
    { id: 'fillet', label: 'Congé d\'esquisse', icon: 'fillet', stage: 3 },
    { id: 'chamfer', label: 'Chanfrein d\'esquisse', icon: 'chamfer', stage: 3 },
  ] },
  { id: 'move', label: 'Déplacer', tools: [
    { id: 'move', label: 'Déplacer', icon: 'move', stage: 3 },
    { id: 'copy', label: 'Copier', icon: 'copy', stage: 3 },
    { id: 'rotate', label: 'Pivoter', icon: 'rotate', stage: 3 },
  ] },
];

export const TOOL_CLASSES = {
  line2: LineTool,
  lineMid: LineMidTool,
  rect2: Rect2Tool,
  rectCenter: RectCenterTool,
  rect3corner: Rect3CornerTool,
  rect3center: Rect3CenterTool,
  parallelogram: ParallelogramTool,
  circleCenter: CircleCenterTool,
  circle3: Circle3Tool,
  arcCenter: ArcCenterTool,
  arcTangent: ArcTangentTool,
  arc3: Arc3Tool,
  smartDimension: DimensionTool,
  dimHorizontal: DimHorizontalTool,
  dimVertical: DimVerticalTool,
  dimChain: DimChainTool,
};

const toolIndex = new Map();
const groupOfTool = new Map();
for (const g of GROUPS) for (const t of g.tools) { toolIndex.set(t.id, t); groupOfTool.set(t.id, g); }

export function getGroup(id) { return GROUPS.find((g) => g.id === id) || null; }
export function getTool(id) { return toolIndex.get(id) || null; }
export function groupOf(toolId) { return groupOfTool.get(toolId) || null; }
export function isAvailable(toolId) { return !!TOOL_CLASSES[toolId]; }

/** Décrit une case de favoris : 'line' (groupe) ou 'tool:line2' (outil précis). */
export function describeFavorite(item) {
  if (typeof item === 'string' && item.startsWith('tool:')) {
    const t = getTool(item.slice(5));
    return t ? { kind: 'tool', tool: t, group: groupOf(t.id) } : null;
  }
  const g = getGroup(item);
  return g ? { kind: 'group', group: g } : null;
}

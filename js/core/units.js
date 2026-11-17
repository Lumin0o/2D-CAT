// Unités : la géométrie est en millimètres ; l'affichage et la saisie sont convertis.
export const UNITS = {
  mm:   { label: 'mm',    factor: 1,       decimals: 2, imperial: false },
  cm:   { label: 'cm',    factor: 10,      decimals: 3, imperial: false },
  m:    { label: 'm',     factor: 1000,    decimals: 4, imperial: false },
  inch: { label: 'po',    factor: 25.4,    decimals: 3, imperial: true },
  ft:   { label: 'pi',    factor: 304.8,   decimals: 4, imperial: true },
  yd:   { label: 'vg',    factor: 914.4,   decimals: 4, imperial: true },
};

export function toDisplay(mm, unit = 'mm') { return mm / (UNITS[unit] || UNITS.mm).factor; }
export function fromDisplay(val, unit = 'mm') { return val * (UNITS[unit] || UNITS.mm).factor; }

/** Nombre décimal avec virgule. */
export function fmtNumber(v, decimals = 2) {
  if (!isFinite(v)) return '—';
  let s = v.toFixed(decimals);
  if (decimals > 0) s = s.replace(/\.?0+$/, '');
  if (s === '-0') s = '0';
  return s.replace('.', ',');
}

/** Longueur en mm → texte dans l'unité des réglages. (Fractions impériales : étape 4.) */
export function fmtLength(mm, settings) {
  const unit = settings?.unit || 'mm';
  const u = UNITS[unit] || UNITS.mm;
  if (u.imperial) return fmtImperial(mm, unit, settings?.fractionDenominator || 16);
  return `${fmtNumber(toDisplay(mm, unit), u.decimals)} ${u.label}`;
}

function fmtImperial(mm, unit, denom) {
  const inches = mm / 25.4;
  if (unit === 'inch') return `${fmtFraction(inches, denom)}"`;
  const unitIn = unit === 'ft' ? 12 : 36;
  const whole = Math.floor(inches / unitIn);
  const rest = inches - whole * unitIn;
  const restStr = rest > 1 / (2 * denom) ? ` ${fmtFraction(rest, denom)}"` : '';
  return `${whole}${unit === 'ft' ? "'" : ' vg'}${restStr}`;
}

/** Comme fmtLength, mais sans le nom d'unité en métrique (texte des cotes). */
export function fmtLengthShort(mm, settings) {
  const unit = settings?.unit || 'mm';
  const u = UNITS[unit] || UNITS.mm;
  if (u.imperial) return fmtLength(mm, settings);
  return fmtNumber(toDisplay(mm, unit), u.decimals);
}

export function fmtFraction(inches, denom = 16) {
  const neg = inches < 0;
  inches = Math.abs(inches);
  let whole = Math.floor(inches);
  let num = Math.round((inches - whole) * denom);
  let d = denom;
  if (num === denom) { whole += 1; num = 0; }
  while (num > 0 && num % 2 === 0 && d % 2 === 0) { num /= 2; d /= 2; }
  let s = '';
  if (whole > 0 || num === 0) s += whole;
  if (num > 0) s += (whole > 0 ? ' ' : '') + `${num}/${d}`;
  return (neg ? '-' : '') + s;
}

export function fmtAngle(rad, settings) {
  if (settings?.angleUnit === 'rad') return `${fmtNumber(rad, 3)} rad`;
  return `${fmtNumber(rad * 180 / Math.PI, 1)}°`;
}

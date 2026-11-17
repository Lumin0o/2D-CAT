// Calculatrice : évalue une formule saisie au clavier intégré.
// Accepte : nombres (virgule ou point), + − × ÷ * /, parenthèses, moins unaire, %, π, √, ², Ans,
// fractions (3/16), nombres mixtes (1 3/16), pieds (') et pouces (").

/**
 * @param {string} expr
 * @param {{ans?:number, footFactor?:number, inchFactor?:number}} ctx  facteurs : valeur d'un pied / d'un pouce dans l'unité courante
 * @returns {{ok:boolean, value?:number, error?:string}}
 */
export function evaluate(expr, ctx = {}) {
  try {
    let s = String(expr).replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
    s = s.replace(/(\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)/g, '($1+$2/$3)');   // nombre mixte
    s = s.replace(/'\s*(?=[\d(])/g, "'+");                                    // 5' 3" → 5' + 3"
    const tokens = tokenize(s);
    if (tokens.length === 0) return { ok: false, error: 'vide' };
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const startsValue = (t) => t && (t.t === 'num' || t.t === '(' || t.t === 'pi' || t.t === 'sqrt' || t.t === 'ans');

    const parseExpr = () => {
      let v = parseTerm();
      while (peek() && (peek().t === '+' || peek().t === '-')) { const op = next().t; const r = parseTerm(); v = op === '+' ? v + r : v - r; }
      return v;
    };
    const parseTerm = () => {
      let v = parseFactor();
      for (;;) {
        const t = peek();
        if (t && (t.t === '*' || t.t === '/')) { next(); const r = parseFactor(); v = t.t === '*' ? v * r : v / r; }
        else if (t && (t.t === '(' || t.t === 'pi' || t.t === 'sqrt' || t.t === 'ans')) v *= parseFactor();   // multiplication implicite
        else break;
      }
      return v;
    };
    const parseFactor = () => {
      const t = peek();
      if (t && t.t === '-') { next(); return -parseFactor(); }
      if (t && t.t === '+') { next(); return parseFactor(); }
      return parsePostfix();
    };
    const parsePostfix = () => {
      let v = parsePrimary();
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.t === 'sq') { next(); v *= v; }
        else if (t.t === '%') { next(); v /= 100; }
        else if (t.t === 'ft') { next(); v *= ctx.footFactor ?? 1; }
        else if (t.t === 'in') { next(); v *= ctx.inchFactor ?? 1; }
        else break;
      }
      return v;
    };
    const parsePrimary = () => {
      const t = next();
      if (!t) throw new Error('incomplet');
      if (t.t === 'num') return t.v;
      if (t.t === 'pi') return Math.PI;
      if (t.t === 'ans') { if (ctx.ans === undefined || ctx.ans === null) throw new Error('Ans vide'); return ctx.ans; }
      if (t.t === 'sqrt') { const v = parseFactor(); if (v < 0) throw new Error('racine négative'); return Math.sqrt(v); }
      if (t.t === '(') { const v = parseExpr(); if (!peek() || next().t !== ')') throw new Error('parenthèse'); return v; }
      throw new Error('syntaxe');
    };
    const value = parseExpr();
    if (pos < tokens.length) {
      if (startsValue(peek())) throw new Error('opérateur manquant');
      throw new Error('syntaxe');
    }
    if (!Number.isFinite(value)) return { ok: false, error: 'non défini' };
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err.message || 'erreur' };
  }
}

function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const txt = s.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(txt)) throw new Error('nombre');
      out.push({ t: 'num', v: parseFloat(txt) });
      i = j; continue;
    }
    if ('+-*/()%'.includes(ch)) { out.push({ t: ch }); i++; continue; }
    if (ch === '²') { out.push({ t: 'sq' }); i++; continue; }
    if (ch === '√') { out.push({ t: 'sqrt' }); i++; continue; }
    if (ch === 'π') { out.push({ t: 'pi' }); i++; continue; }
    if (ch === "'") { out.push({ t: 'ft' }); i++; continue; }
    if (ch === '"') { out.push({ t: 'in' }); i++; continue; }
    if (s.startsWith('Ans', i)) { out.push({ t: 'ans' }); i += 3; continue; }
    throw new Error('caractère');
  }
  return out;
}

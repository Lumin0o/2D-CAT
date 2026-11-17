// Transformation monde (mm, Y vers le haut) ↔ écran (px CSS, Y vers le bas).
export class Viewport {
  constructor() {
    this.scale = 4;   // px par mm
    this.ox = 0;      // position écran de l'origine monde
    this.oy = 0;
    this.width = 0;
    this.height = 0;
    this.minScale = 0.02;
    this.maxScale = 4000;
  }
  toScreen(p) { return { x: this.ox + p.x * this.scale, y: this.oy - p.y * this.scale }; }
  toWorld(s) { return { x: (s.x - this.ox) / this.scale, y: (this.oy - s.y) / this.scale }; }
  pxToWorld(px) { return px / this.scale; }

  zoomAt(s, factor) {
    const ns = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const f = ns / this.scale;
    this.ox = s.x + (this.ox - s.x) * f;
    this.oy = s.y + (this.oy - s.y) * f;
    this.scale = ns;
  }
  pan(dx, dy) { this.ox += dx; this.oy += dy; }

  /** Cadre une boîte englobante monde ; sans boîte, centre l'origine. */
  fit(bbox, pad = 48) {
    if (!bbox || !(this.width > 0) || !(this.height > 0)) {
      this.scale = 4;
      this.ox = this.width / 2; this.oy = this.height / 2;
      return;
    }
    const w = Math.max(bbox.maxX - bbox.minX, 1e-6);
    const h = Math.max(bbox.maxY - bbox.minY, 1e-6);
    const availW = Math.max(this.width - 2 * pad, 20);
    const availH = Math.max(this.height - 2 * pad, 20);
    let s = Math.min(availW / w, availH / h);
    s = Math.min(this.maxScale, Math.max(this.minScale, s));
    this.scale = s;
    const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
    this.ox = this.width / 2 - cx * s;
    this.oy = this.height / 2 + cy * s;
  }

  /** Redimensionne en gardant le centre de la vue au même endroit du monde. */
  resize(w, h) {
    if (this.width > 0 && this.height > 0) {
      const c = this.toWorld({ x: this.width / 2, y: this.height / 2 });
      this.width = w; this.height = h;
      this.ox = w / 2 - c.x * this.scale;
      this.oy = h / 2 + c.y * this.scale;
    } else {
      this.width = w; this.height = h;
      this.ox = w / 2; this.oy = h / 2;
    }
  }
  visibleWorldRect() {
    const a = this.toWorld({ x: 0, y: 0 }), b = this.toWorld({ x: this.width, y: this.height });
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
  }
  toJSON() { return { scale: this.scale, ox: this.ox, oy: this.oy, width: this.width, height: this.height }; }
  fromJSON(j) {
    if (!j || !(j.scale > 0)) return;
    // On restaure le centre monde, et non les px absolus (l'écran peut avoir changé de taille).
    const vp = new Viewport(); Object.assign(vp, j);
    const c = vp.width > 0 ? vp.toWorld({ x: vp.width / 2, y: vp.height / 2 }) : { x: 0, y: 0 };
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, j.scale));
    this.ox = this.width / 2 - c.x * this.scale;
    this.oy = this.height / 2 + c.y * this.scale;
  }
}

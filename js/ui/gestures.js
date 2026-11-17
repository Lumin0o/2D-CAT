// Gestes sur la zone de dessin (Pointer Events) :
// - un doigt : dessin / sélection / glissement
// - deux doigts : zoom au pincement centré entre les doigts + déplacement
export class Gestures {
  constructor(el, handlers, opts = {}) {
    this.el = el;
    this.h = handlers;
    this.tapTol = opts.tapTol ?? 8;
    this.pointers = new Map();
    this.single = null;
    this.pinch = null;
    this.locked = false;      // après un pincement, on ignore le doigt restant jusqu'au relâchement complet
    this.rect = null;
    this.lastTap = null;
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e));
    // Empêche Safari de prendre la main (zoom, défilement, loupe)
    const block = (e) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener('touchstart', block, { passive: false });
    el.addEventListener('touchmove', block, { passive: false });
    el.addEventListener('touchend', block, { passive: false });
    el.addEventListener('contextmenu', block);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.pos(e);
      if (this.h.wheel) this.h.wheel(p, Math.exp(-e.deltaY * 0.0015), e);
    }, { passive: false });
  }
  pos(e) {
    const r = this.rect || this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.rect = this.el.getBoundingClientRect();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      if (this.locked) return;
      this.single = { id: e.pointerId, start: p, t: performance.now(), moved: false, type: e.pointerType };
      this.h.start(p, this.single);
    } else if (this.pointers.size === 2) {
      if (this.single) { this.h.cancel(); this.single = null; }
      this.locked = true;
      const ids = [...this.pointers.keys()];
      const a = this.pointers.get(ids[0]), b = this.pointers.get(ids[1]);
      this.pinch = { ids, prevC: mid(a, b), prevD: dist(a, b) };
      if (this.h.pinchStart) this.h.pinchStart();
    }
  }
  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.single && this.single.id === e.pointerId) {
      if (!this.single.moved && dist(p, this.single.start) > this.tapTol) this.single.moved = true;
      this.h.move(p, this.single);
    } else if (this.pinch && this.pinch.ids.includes(e.pointerId)) {
      const a = this.pointers.get(this.pinch.ids[0]), b = this.pointers.get(this.pinch.ids[1]);
      if (!a || !b) return;
      const c = mid(a, b), d = dist(a, b);
      const f = this.pinch.prevD > 1 ? d / this.pinch.prevD : 1;
      this.h.pinch(this.pinch.prevC, c, f);
      this.pinch.prevC = c; this.pinch.prevD = d;
    }
  }
  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pos(e);
    this.pointers.delete(e.pointerId);
    if (this.single && this.single.id === e.pointerId) {
      const s = this.single; this.single = null;
      const now = performance.now();
      const cancelled = e.type === 'pointercancel';
      const tap = !cancelled && !s.moved && now - s.t < 600;
      let double = false;
      if (tap) {
        if (this.lastTap && now - this.lastTap.t < 320 && dist(p, this.lastTap.p) < 24) { double = true; this.lastTap = null; }
        else this.lastTap = { t: now, p };
      }
      this.h.end(p, { tap, double, moved: s.moved, cancelled });
    }
    if (this.pinch && this.pinch.ids.includes(e.pointerId)) {
      this.pinch = null;
      if (this.h.pinchEnd) this.h.pinchEnd();
    }
    if (this.pointers.size === 0) this.locked = false;
  }
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

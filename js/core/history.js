// Historique annuler / rétablir, par instantanés (l'esquisse est petite : c'est simple et sûr).
export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.current = null;
  }
  init(snapshot) {
    this.current = snapshot;
    this.undoStack = [];
    this.redoStack = [];
  }
  push(snapshot, label = '') {
    if (snapshot === this.current) return false;
    if (this.current !== null) this.undoStack.push({ snap: this.current, label });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.current = snapshot;
    this.redoStack = [];
    return true;
  }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo() {
    if (!this.canUndo()) return null;
    const prev = this.undoStack.pop();
    this.redoStack.push({ snap: this.current, label: prev.label });
    this.current = prev.snap;
    return this.current;
  }
  redo() {
    if (!this.canRedo()) return null;
    const next = this.redoStack.pop();
    this.undoStack.push({ snap: this.current, label: next.label });
    this.current = next.snap;
    return this.current;
  }
}

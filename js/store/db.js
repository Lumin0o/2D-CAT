// Stockage local IndexedDB : clés/valeurs (esquisse courante, réglages) et projets enregistrés.
const DB_NAME = 'esquisse2d';
const DB_VERSION = 1;

let dbPromise = null;
const TIMEOUT_MS = 2500;   // sur iPhone, l'ouverture peut rester bloquée : on ne fait jamais attendre l'app

const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} : délai dépassé`)), ms))]);

function open() {
  if (dbPromise) return dbPromise;
  let poll = null;
  const raw = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB indisponible')); return; }
    // contournement WebKit : indexedDB.open peut ne jamais répondre tant que databases() n'est pas appelé
    if (typeof indexedDB.databases === 'function') poll = setInterval(() => { indexedDB.databases().catch(() => {}); }, 100);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('projects')) {
        const st = db.createObjectStore('projects', { keyPath: 'id' });
        st.createIndex('updatedAt', 'updatedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise = withTimeout(raw, TIMEOUT_MS, 'IndexedDB')
    .finally(() => clearInterval(poll))
    .catch((err) => { dbPromise = null; throw err; });   // nouvel essai à la prochaine opération
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => withTimeout(new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try { result = fn(s); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }), TIMEOUT_MS, 'IndexedDB'));
}

// Repli mémoire si IndexedDB échoue (mode privé, etc.)
const memory = new Map();
const safe = (p, fallback) => p.then((v) => { db.ok = true; return v; }, (err) => { console.warn('[db]', err); db.ok = false; return fallback(); });

export const db = {
  ok: null,   // false : la dernière opération a échoué (repli en mémoire)
  get(key) {
    return safe(tx('kv', 'readonly', (s) => s.get(key)), () => memory.get(key));
  },
  set(key, value) {
    memory.set(key, value);
    return safe(tx('kv', 'readwrite', (s) => s.put(value, key)), () => undefined);
  },
  del(key) {
    memory.delete(key);
    return safe(tx('kv', 'readwrite', (s) => s.delete(key)), () => undefined);
  },
  listProjects() {
    return safe(tx('projects', 'readonly', (s) => s.getAll()), () => []).then((arr) => (arr || []).sort((a, b) => b.updatedAt - a.updatedAt));
  },
  getProject(id) { return safe(tx('projects', 'readonly', (s) => s.get(id)), () => undefined); },
  putProject(p) { return safe(tx('projects', 'readwrite', (s) => s.put(p)), () => undefined); },
  deleteProject(id) { return safe(tx('projects', 'readwrite', (s) => s.delete(id)), () => undefined); },
};

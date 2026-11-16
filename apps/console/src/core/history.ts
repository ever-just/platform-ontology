import type { Rec } from "./types";

// Reading history kept in this browser (IndexedDB), scoped to this visitor so a returning visitor
// sees their earlier readings. The visitor id lives in localStorage; Clear forgets it all.

const DB = "po-console";
const STORE = "readings";
const KEEP = 3000; // per scope per visitor
const EVERY = 1000; // at most one stored reading per scope per second

export type Stored = { tab: string; scope: string; t: number; seq: number; data: Record<string, unknown> };

// The `tab` field keeps its old name so the existing index still works; it now holds the visitor id.
let tabId = "";
try {
  tabId = localStorage.getItem("po.visitor") || "";
  if (!tabId) { tabId = Math.random().toString(36).slice(2, 12); localStorage.setItem("po.visitor", tabId); }
} catch {
  try {
    tabId = sessionStorage.getItem("po.tab") || "";
    if (!tabId) { tabId = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("po.tab", tabId); }
  } catch {
    tabId = Math.random().toString(36).slice(2, 10);
  }
}
export const TAB_ID = tabId;
export const VISITOR_ID = tabId;

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const s = r.result.createObjectStore(STORE, { autoIncrement: true });
        s.createIndex("tabScope", ["tab", "scope"]);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbp;
}

const lastWrite = new Map<string, number>();
const counts = new Map<string, number>();

/** Only plain numbers, booleans and short strings are kept, so stored rows stay small. */
function slim(data: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!data || typeof data !== "object") return out;
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && v.length <= 80) out[k] = v;
  }
  return out;
}

export function persist(scope: string, rec: Rec) {
  const now = rec.t;
  if (now - (lastWrite.get(scope) || 0) < EVERY) return;
  lastWrite.set(scope, now);
  const data = slim(rec.data);
  if (!Object.keys(data).length) return;
  void db().then((d) => {
    if (!d) return;
    try {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add({ tab: TAB_ID, scope, t: rec.t, seq: rec.seq, data } satisfies Stored);
      const n = (counts.get(scope) || 0) + 1;
      counts.set(scope, n);
      if (n % 200 === 0) trim(d, scope);
    } catch {
      /* storage full or blocked: history is a convenience */
    }
  });
}

function trim(d: IDBDatabase, scope: string) {
  try {
    const tx = d.transaction(STORE, "readwrite");
    const idx = tx.objectStore(STORE).index("tabScope");
    const range = IDBKeyRange.only([TAB_ID, scope]);
    const c = idx.count(range);
    c.onsuccess = () => {
      let extra = c.result - KEEP;
      if (extra <= 0) return;
      idx.openCursor(range).onsuccess = (e) => {
        const cur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cur || extra-- <= 0) return;
        cur.delete();
        cur.continue();
      };
    };
  } catch {
    /* ignore */
  }
}

/** Stored readings for one scope for this visitor, oldest first. */
export async function loadHistory(scope: string): Promise<Stored[]> {
  const d = await db();
  if (!d) return [];
  return new Promise((res) => {
    try {
      const r = d.transaction(STORE).objectStore(STORE).index("tabScope").getAll(IDBKeyRange.only([TAB_ID, scope]));
      r.onsuccess = () => res((r.result as Stored[]).sort((a, b) => a.t - b.t));
      r.onerror = () => res([]);
    } catch {
      res([]);
    }
  });
}

/** Forget every stored reading for this visitor (or for one scope). */
export async function clearHistory(scope?: string): Promise<void> {
  const d = await db();
  if (!d) return;
  await new Promise<void>((res) => {
    try {
      const tx = d.transaction(STORE, "readwrite");
      const idx = tx.objectStore(STORE).index("tabScope");
      const req = scope ? idx.openCursor(IDBKeyRange.only([TAB_ID, scope])) : tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (scope || (cur.value as Stored).tab === TAB_ID) cur.delete();
        cur.continue();
      };
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch {
      res();
    }
  });
  if (scope) counts.delete(scope);
  else counts.clear();
}

/** Every stored reading for this visitor, grouped by scope, oldest first. Used to restore a returning visitor. */
export async function loadAll(): Promise<Map<string, Stored[]>> {
  const out = new Map<string, Stored[]>();
  const d = await db();
  if (!d) return out;
  return new Promise((res) => {
    try {
      const r = d.transaction(STORE).objectStore(STORE).openCursor();
      r.onsuccess = () => {
        const cur = r.result;
        if (!cur) {
          out.forEach((rows) => rows.sort((a, b) => a.t - b.t));
          res(out);
          return;
        }
        const v = cur.value as Stored;
        if (v.tab === TAB_ID) {
          const list = out.get(v.scope);
          if (list) list.push(v); else out.set(v.scope, [v]);
        }
        cur.continue();
      };
      r.onerror = () => res(out);
    } catch {
      res(out);
    }
  });
}

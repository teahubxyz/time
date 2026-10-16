// media.js: the photos, voice notes and clips in your conversations, kept in this browser (IndexedDB). Where the
// browser won't keep them (some private windows), they last until the tab closes.

const DB = "havre-media", STORE = "media";
const GRACE = 15 * 60000;              // something made lately is kept before any conversation points at it
const mem = new Map();                 // what this tab holds: every blob it made or read, with when it was made
const urls = new Map();                // and the object URLs handed out for them
let dbp = null;

function db() {
  if (!dbp) {
    dbp = new Promise((ok, no) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => no(r.error);
        r.onblocked = () => no(new Error("blocked"));
      } catch (e) { no(e); }
    }).catch(() => null);
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((ok) => {
    if (!d) return ok(null);
    try {
      const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
      t.oncomplete = () => ok(req ? req.result : true);
      t.onerror = t.onabort = () => ok(null);
    } catch { ok(null); }
  }));
}

export function newId() {
  try { return crypto.randomUUID(); } catch { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}

/** keep a blob; returns its id */
export async function put(blob, id = newId()) {
  const rec = { blob, at: Date.now() };
  mem.set(id, rec);
  await tx("readwrite", (s) => s.put(rec, id));
  return id;
}

/** the blob, or null if this browser no longer has it */
export async function get(id) {
  if (!id) return null;
  if (mem.has(id)) return mem.get(id).blob;
  const rec = await tx("readonly", (s) => s.get(id));
  const blob = rec instanceof Blob ? rec : rec && rec.blob instanceof Blob ? rec.blob : null;
  if (blob) mem.set(id, { blob, at: rec.at || 0 });
  return blob;
}

/** an object URL for the blob, made once per tab; "" if it's gone */
export async function url(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await get(id);
  if (!b) return "";
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}

/**
 * Forget everything except these ids. Anything made in the last quarter hour stays too, in this tab or another,
 * since the conversation it belongs to may not be saved yet.
 */
export async function keepOnly(ids) {
  const keep = new Set(ids), now = Date.now(), young = (at) => typeof at === "number" && now - at < GRACE;
  for (const [id, rec] of [...mem]) {
    if (keep.has(id) || young(rec.at)) continue;
    mem.delete(id);
    const u = urls.get(id);
    if (u) { URL.revokeObjectURL(u); urls.delete(id); }
  }
  await tx("readwrite", (s) => {
    const req = s.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      if (!keep.has(cur.key) && !young(cur.value && cur.value.at)) cur.delete();
      cur.continue();
    };
    return null;
  });
}

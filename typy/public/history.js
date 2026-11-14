// History: the runs and jams finished on this device, newest first. These are
// the pure parts; features/history-ui.js keeps them in local storage and shows them.

/** At most this many entries, in at most this many characters of storage. */
export const KEEP = 60;
export const BUDGET = 1500000;
/** A run bigger than this keeps its score and notes, but not its replay. */
export const BIG_RUN = 200000;

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** A finished run as history keeps it: the whole result, so it can be opened
 *  and replayed again, unless its replay is too big to keep. */
export function runEntry(result, at = Date.now()) {
  const entry = {kind: 'run', id: newId(), at, result: {...result, local: true}};
  if (JSON.stringify(entry).length > BIG_RUN) {
    entry.result = {...entry.result, run: {...result.run, events: [], wordTimings: []}, ghostRun: null, replayDropped: true};
  }
  return entry;
}

/** A jam is only its keys, so history keeps them all, and its link if it has one. */
export function jamEntry(jam, at = Date.now()) {
  return {kind: 'jam', id: newId(), at, keys: jam.keys, name: jam.name || '', shareId: jam.id || null};
}

/** Local storage holds whatever an older version, or a curious person, left there. */
export function readHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(entry => entry && typeof entry.id === 'string' && Number.isFinite(entry.at) &&
    ((entry.kind === 'run' && entry.result?.run?.stats && Array.isArray(entry.result.run.words)) ||
     (entry.kind === 'jam' && Array.isArray(entry.keys) && entry.keys.length > 0))).slice(0, KEEP);
}

/** Newest first, at most KEEP entries, never more than BUDGET characters. */
export function addEntry(entries, entry) {
  const next = [entry, ...readHistory(entries)].slice(0, KEEP);
  while (next.length > 1 && JSON.stringify(next).length > BUDGET) next.pop();
  return next;
}

/** When it happened, the way a person says it: today 9:41 pm, yesterday 8:02 am, nov 12. */
export function whenLabel(at, now = Date.now()) {
  const date = new Date(at), today = new Date(now);
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(today) - day(date)) / 86400000);
  const time = date.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'}).toLowerCase();
  if (days === 0) return 'today ' + time;
  if (days === 1) return 'yesterday ' + time;
  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}).toLowerCase();
}

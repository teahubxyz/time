// The bus: features hear what happens without the game knowing they exist. A run
// finishes, a jam finishes, a result goes up: it is said once, and the coach, the
// history and whatever comes next each listen for it.
const listeners = new Map();

export function on(type, listener) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(listener);
  return () => listeners.set(type, listeners.get(type).filter(item => item !== listener));
}

export function emit(type, detail) {
  for (const listener of listeners.get(type) || []) {
    // One listener's mistake never stops the others, or the game.
    try { listener(detail); } catch (error) { console.error(error); }
  }
}

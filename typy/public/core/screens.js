// Screens: what the page is showing. Each screen names its panel and can own the
// keyboard, typed input and the frame loop while it is up, so a new mode adds a
// screen here instead of a check in every function that switches panels or keys.
import { $ } from '/core/dom.js';
import { S } from '/core/state.js';

const screens = {};

export function screen(name, spec) {
  screens[name] = {panel: null, keydown: null, press: null, frame: null, leave: null, ...spec};
}

/** Puts a screen up: its panel shows and every other panel hides. */
export function go(name) {
  const next = screens[name];
  if (!next) throw new Error('typy has no screen called ' + name);
  const previous = screens[S.view];
  S.view = name;
  if (previous && previous !== next) previous.leave?.(name);
  for (const panel of new Set(Object.values(screens).map(item => item.panel))) if (panel) $(panel).hidden = panel !== next.panel;
}

export const current = () => screens[S.view] || null;

// Themes: the picker, auto and random.
import { $, setText, writeLocal } from '/core/dom.js';
import { S } from '/core/state.js';
import { focusTyping } from '/play/run.js';

// themes.js is a classic <head> script (it paints before the first render), so it is read from window.
export const { THEMES, MODES: THEME_MODES, AUTO, DEFAULT: THEME_DEFAULT, resolveTheme, findTheme, paint: paintThemeVars, start: themeStart } = window.typyThemes;

// Themes paint CSS variables on <html>. themes.js paints the first one in <head>,
// before the page renders; this block owns the picker and the auto and random modes.
export const darkQuery = matchMedia('(prefers-color-scheme: dark)');
let themeChoice = themeStart?.choice || THEME_DEFAULT;
// Until someone keeps a theme, the default applies and is not saved as their choice.
let themeExplicit = Boolean(themeStart?.explicit);
let randomPick = themeChoice === 'random' ? themeStart?.shown || null : null;
let paintedTheme = themeStart?.shown || '';
let themeKept = false;
let themeShuffleReady = false;
let themeTiles = [];

export function themeFor(choice) {
  if (choice === 'auto') return resolveTheme(darkQuery.matches ? AUTO.dark : AUTO.light);
  if (choice === 'random') return resolveTheme(randomPick || 'typy');
  return resolveTheme(choice) || resolveTheme('typy');
}

export function paintTheme(theme) {
  if (theme.id === paintedTheme) return;
  paintThemeVars(theme);
  paintedTheme = theme.id;
}

export function showThemeName() {
  const shown = themeFor(themeChoice);
  const label = themeChoice === 'auto' || themeChoice === 'random' ? themeChoice + ' · ' + shown.name : shown.name;
  setText('theme-name', label);
  $('theme-footer').setAttribute('aria-label', 'Theme: ' + label + '. Change theme');
}

// Storage keeps the kept choice and the last random deal, never colours, so the
// next visit deals something new and palette changes show up straight away.
export function saveTheme() {
  writeLocal('theme', themeExplicit ? {id: themeChoice, pick: randomPick} : {pick: randomPick});
}

export function otherTheme() {
  const pool = THEMES.filter(theme => theme.id !== paintedTheme);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function keepTheme(choice) {
  themeKept = true;
  themeExplicit = true;
  themeChoice = choice;
  if (choice === 'random') randomPick = otherTheme();
  paintTheme(themeFor(choice));
  saveTheme();
  showThemeName();
  for (const tile of themeTiles) tile.setAttribute('aria-checked', String(tile.dataset.theme === themeChoice));
}

// Random deals a new theme on every visit (themes.js) and as each run begins,
// except the first run after load, which keeps the visit's deal.
export function shuffleTheme() {
  if (themeChoice !== 'random') return;
  if (!themeShuffleReady) { themeShuffleReady = true; return; }
  randomPick = otherTheme();
  paintTheme(themeFor('random'));
  saveTheme();
  showThemeName();
}

export function initThemes() {
  paintTheme(themeFor(themeChoice));
  saveTheme();
  showThemeName();
  darkQuery.addEventListener('change', () => {
    if (themeChoice !== 'auto' || $('theme-dialog').open) return;
    paintTheme(themeFor('auto'));
    showThemeName();
  });
}

export function buildThemeGrid() {
  if (themeTiles.length) return;
  const grid = $('theme-grid');
  for (const entry of [...THEME_MODES, ...THEMES]) {
    const theme = findTheme(entry.id) && resolveTheme(entry.id);
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'theme-tile';
    tile.tabIndex = -1;
    tile.dataset.theme = entry.id;
    tile.dataset.search = [entry.name, entry.id, theme ? theme.scheme : 'mode', entry.note || ''].join(' ').toLowerCase();
    tile.setAttribute('role', 'radio');
    tile.setAttribute('aria-label', entry.name + ', ' + (entry.note || theme.scheme + ' theme'));
    const sample = document.createElement('span');
    sample.className = 'theme-sample';
    sample.setAttribute('aria-hidden', 'true');
    if (entry.id === 'random') {
      sample.classList.add('confetti');
      ['dracula', 'gruvbox', 'riso', 'matcha'].forEach((id, i) => {
        const letter = document.createElement('b');
        letter.textContent = 'typy'[i];
        letter.style.setProperty('--c', resolveTheme(id).vars.accent);
        sample.append(letter);
      });
    } else {
      const typed = document.createElement('b'), next = document.createElement('u'), rest = document.createElement('i');
      typed.textContent = 'ty'; next.textContent = 'p'; rest.textContent = 'y';
      sample.append(typed, next, rest);
    }
    const label = document.createElement('span'), note = document.createElement('small');
    label.className = 'theme-label';
    label.textContent = entry.name;
    note.textContent = entry.note || theme.scheme;
    label.append(note);
    tile.append(sample, label);
    grid.append(tile);
    themeTiles.push(tile);
  }
  const empty = document.createElement('p');
  empty.className = 'theme-empty';
  empty.id = 'theme-empty';
  empty.hidden = true;
  empty.textContent = 'no theme by that name yet.';
  grid.append(empty);
}

export function previewTheme(id) {
  paintTheme(id === 'random' ? themeFor(themeChoice) : themeFor(id));
}

export function visibleTiles() {
  return themeTiles.filter(tile => !tile.hidden);
}

export function focusTile(tile) {
  for (const other of themeTiles) other.tabIndex = other === tile ? 0 : -1;
  tile.focus({preventScroll: true});
  tile.scrollIntoView({block: 'nearest'});
}

export function filterThemes(query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const tile of themeTiles) tile.hidden = !words.every(word => tile.dataset.search.includes(word));
  const shown = visibleTiles();
  $('theme-empty').hidden = shown.length > 0;
  if (shown[0]) for (const tile of themeTiles) tile.tabIndex = tile === shown[0] ? 0 : -1;
  return shown;
}

export function openThemes() {
  if (document.querySelector('dialog[open]')) return;
  buildThemeGrid();
  // Mode tiles wear what they would show right now; theme tiles wear their own colours.
  for (const tile of themeTiles) {
    const theme = tile.dataset.theme === 'random' ? themeFor(themeChoice) : themeFor(tile.dataset.theme);
    for (const key of ['paper', 'ink', 'word', 'faint', 'muted', 'accent']) tile.style.setProperty('--t-' + key, theme.vars[key]);
    tile.setAttribute('aria-checked', String(tile.dataset.theme === themeChoice));
  }
  $('theme-search').value = '';
  filterThemes('');
  themeKept = false;
  $('theme-dialog').showModal();
  focusTile(themeTiles.find(tile => tile.dataset.theme === themeChoice) || themeTiles[0]);
}

// Esc puts the kept theme back at once; close covers the × button and navigation too.
$('theme-dialog').addEventListener('cancel', () => { if (!themeKept) previewTheme(themeChoice); });
$('theme-dialog').addEventListener('close', () => {
  if (!themeKept) previewTheme(themeChoice);
  showThemeName();
  if (S.view === 'play' && innerWidth > 700) focusTyping();
});
$('theme-grid').addEventListener('focusin', event => {
  const tile = event.target.closest('.theme-tile');
  if (!tile) return;
  for (const other of themeTiles) other.tabIndex = other === tile ? 0 : -1;
  previewTheme(tile.dataset.theme);
});
$('theme-grid').addEventListener('mouseover', event => {
  const tile = event.target.closest('.theme-tile');
  if (tile && $('theme-dialog').open) previewTheme(tile.dataset.theme);
});
$('theme-grid').addEventListener('mouseleave', () => {
  if (!$('theme-dialog').open) return;
  const focused = document.activeElement?.closest?.('.theme-tile');
  previewTheme(focused ? focused.dataset.theme : themeChoice);
});
$('theme-grid').addEventListener('click', event => {
  const tile = event.target.closest('.theme-tile');
  if (!tile) return;
  keepTheme(tile.dataset.theme);
  $('theme-dialog').close();
});
$('theme-grid').addEventListener('keydown', event => {
  const tile = event.target.closest('.theme-tile');
  if (!tile || event.ctrlKey || event.metaKey || event.altKey) return;
  const tiles = visibleTiles(), i = tiles.indexOf(tile);
  let next = null;
  if (event.key === 'ArrowRight') next = tiles[(i + 1) % tiles.length];
  else if (event.key === 'ArrowLeft') next = tiles[(i - 1 + tiles.length) % tiles.length];
  else if (event.key === 'Home') next = tiles[0];
  else if (event.key === 'End') next = tiles[tiles.length - 1];
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const columns = tiles.filter(other => other.offsetTop === tiles[0].offsetTop).length || 1;
    // On a phone the tiles are one sideways row: up goes to the search, down stays put.
    const j = columns >= tiles.length ? (event.key === 'ArrowDown' ? i : -1) : i + (event.key === 'ArrowDown' ? columns : -columns);
    if (j < 0) { event.preventDefault(); $('theme-search').focus(); return; }
    next = tiles[Math.min(j, tiles.length - 1)];
  } else if (Array.from(event.key).length === 1 && event.key.trim()) {
    // Typing anywhere in the grid searches.
    event.preventDefault();
    $('theme-search').focus();
    $('theme-search').value += event.key;
    $('theme-search').dispatchEvent(new Event('input'));
    return;
  }
  if (next) { event.preventDefault(); focusTile(next); }
});
$('theme-search').addEventListener('input', () => {
  const shown = filterThemes($('theme-search').value);
  previewTheme(shown[0] ? shown[0].dataset.theme : themeChoice);
});
$('theme-search').addEventListener('keydown', event => {
  const first = visibleTiles()[0];
  if (event.key === 'ArrowDown' && first) { event.preventDefault(); focusTile(first); }
  else if (event.key === 'Enter' && first) { event.preventDefault(); keepTheme(first.dataset.theme); $('theme-dialog').close(); }
});
$('theme-open').addEventListener('click', openThemes);
$('theme-footer').addEventListener('click', openThemes);
// Alt+T (Option+T on a Mac) opens and closes the picker. The game ignores keys
// with modifiers, so this never types into a run.
document.addEventListener('keydown', event => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyT') return;
  event.preventDefault();
  if ($('theme-dialog').open) $('theme-dialog').close();
  else openThemes();
});

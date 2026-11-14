/**
 * Colour themes. A theme names the colours it cares about; resolveTheme mixes
 * ink into paper for everything it leaves out, so a new theme needs only paper,
 * ink, accent and error. The first theme is typy's own look and matches the
 * :root defaults in style.css exactly (a test keeps the two in step).
 */

export const TOKENS = [
  'paper', 'ink', 'word', 'context', 'faint', 'muted', 'line',
  'accent', 'accent-line', 'glow', 'soft', 'error', 'error-soft',
  'field', 'field-alt', 'placeholder', 'selection', 'ring', 'ink-hover',
  'chart', 'shadow', 'backdrop'
];

// Palettes credited by name are ports of open-source colour schemes (MIT):
// Solarized, Catppuccin, Dracula, Nord, Gruvbox, Tokyo Night and Rosé Pine.
export const THEMES = [
  {id: 'typy', name: 'typy', scheme: 'light', colors: {
    paper: '#f5f3ec', ink: '#263d33', word: '#7c8875', context: '#9da791', faint: '#b8beb2',
    muted: '#7b8177', line: '#dcded3', accent: '#e36c49', 'accent-line': '#e36c4933', glow: '#e36c4914',
    soft: '#e7ebdd', error: '#b24d36', 'error-soft': '#f5e0d5', field: '#fffdf6', 'field-alt': '#eeeee5',
    placeholder: '#969b91', selection: '#e8b9a4', ring: '#263d3312', 'ink-hover': '#385447',
    chart: '#6d8a67', shadow: '#263d3320', backdrop: '#172b2445'}},
  {id: 'oat', name: 'oat milk', scheme: 'light', colors: {paper: '#f1eadd', ink: '#3b2c22', accent: '#c46a2f', error: '#b0352a'}},
  {id: 'riso', name: 'riso', scheme: 'light', colors: {paper: '#f7f4ee', ink: '#23358f', accent: '#ff3d9a', error: '#d8322a'}},
  {id: 'sakura', name: 'sakura', scheme: 'light', colors: {paper: '#fbeff0', ink: '#4a2a38', accent: '#e2557c', error: '#b8323a'}},
  {id: 'solarized-light', name: 'solarized light', scheme: 'light', colors: {
    paper: '#fdf6e3', ink: '#073642', word: '#657b83', context: '#93a1a1', line: '#eee8d5', accent: '#268bd2', error: '#dc322f'}},
  {id: 'latte', name: 'catppuccin latte', scheme: 'light', colors: {
    paper: '#eff1f5', ink: '#4c4f69', word: '#7c7f93', context: '#9ca0b0', faint: '#bcc0cc', muted: '#6c6f85', line: '#ccd0da', accent: '#8839ef', error: '#d20f39'}},
  {id: 'contrast', name: 'high contrast', scheme: 'light', colors: {
    paper: '#ffffff', ink: '#000000', word: '#555555', context: '#8c8c8c', faint: '#bdbdbd', line: '#e0e0e0', accent: '#1d4ed8', error: '#c8102e'}},
  {id: 'night', name: 'typy night', scheme: 'dark', colors: {paper: '#151d19', ink: '#e7e9de', accent: '#ee8a63', error: '#ff7a66', chart: '#8fb486'}},
  {id: 'matcha', name: 'matcha', scheme: 'dark', colors: {paper: '#1b2920', ink: '#eef0dc', accent: '#b7d66b', error: '#ff8a78'}},
  {id: 'espresso', name: 'espresso', scheme: 'dark', colors: {paper: '#1d1713', ink: '#f2e6d5', accent: '#ff9f45', error: '#ff6b5a'}},
  {id: 'dracula', name: 'dracula', scheme: 'dark', colors: {
    paper: '#282a36', ink: '#f8f8f2', word: '#a9b0cc', context: '#6272a4', faint: '#44475a', line: '#3a3c4e', accent: '#ff79c6', error: '#ff5555', chart: '#bd93f9'}},
  {id: 'nord', name: 'nord', scheme: 'dark', colors: {
    paper: '#2e3440', ink: '#eceff4', word: '#a3abba', context: '#616e88', faint: '#4c566a', line: '#3b4252', accent: '#88c0d0', error: '#d57780'}},
  {id: 'gruvbox', name: 'gruvbox', scheme: 'dark', colors: {
    paper: '#282828', ink: '#ebdbb2', word: '#a89984', context: '#7c6f64', faint: '#504945', line: '#3c3836', accent: '#fe8019', error: '#fb4934', chart: '#b8bb26'}},
  {id: 'tokyo-night', name: 'tokyo night', scheme: 'dark', colors: {
    paper: '#1a1b26', ink: '#c0caf5', word: '#7f88b5', context: '#565f89', faint: '#3b4261', line: '#292e42', accent: '#7aa2f7', error: '#f7768e'}},
  {id: 'rose-pine', name: 'rosé pine', scheme: 'dark', colors: {
    paper: '#191724', ink: '#e0def4', word: '#908caa', context: '#6e6a86', faint: '#403d52', line: '#26233a', accent: '#ebbcba', error: '#eb6f92', chart: '#c4a7e7'}},
  {id: 'mocha', name: 'catppuccin mocha', scheme: 'dark', colors: {
    paper: '#1e1e2e', ink: '#cdd6f4', word: '#9399b2', context: '#6c7086', faint: '#45475a', line: '#313244', accent: '#cba6f7', error: '#f38ba8'}},
  {id: 'solarized-dark', name: 'solarized dark', scheme: 'dark', colors: {
    paper: '#002b36', ink: '#eee8d5', word: '#839496', context: '#586e75', line: '#073642', accent: '#b58900', error: '#dc322f'}},
  {id: 'phosphor', name: 'phosphor', scheme: 'dark', colors: {
    paper: '#0a0f0b', ink: '#a6ffbc', word: '#52b46e', context: '#2f6e42', faint: '#1f452b', line: '#15261a', accent: '#ffb000', error: '#ff5f56'}}
];

// "auto" follows the system setting with this pair; "random" picks a new theme each run.
export const AUTO = {light: 'typy', dark: 'night'};
export const MODES = [
  {id: 'auto', name: 'auto', note: 'follows your system'},
  {id: 'random', name: 'random', note: 'a new one each run'}
];

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hex2 = n => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** Blend `top` into `base` by weight t (0 keeps base, 1 is all top). */
export function mix(top, base, t) {
  const a = rgb(top), b = rgb(base);
  return '#' + b.map((value, i) => hex2(value + (a[i] - value) * t)).join('');
}

export function findTheme(id) {
  return THEMES.find(theme => theme.id === id) || null;
}

/** Every token for a theme, with the gaps filled from its own colours. */
export function resolveTheme(themeOrId) {
  const theme = typeof themeOrId === 'string' ? findTheme(themeOrId) : themeOrId;
  if (!theme) return null;
  const c = theme.colors, dark = theme.scheme === 'dark';
  const ink = c.ink, paper = c.paper, accent = c.accent, error = c.error;
  const vars = {
    paper, ink,
    word: c.word || mix(ink, paper, .6),
    context: c.context || mix(ink, paper, .44),
    faint: c.faint || mix(ink, paper, .3),
    muted: c.muted || mix(ink, paper, .6),
    line: c.line || mix(ink, paper, .12),
    accent,
    'accent-line': c['accent-line'] || accent + '33',
    glow: c.glow || accent + '14',
    soft: c.soft || mix(ink, paper, .065),
    error,
    'error-soft': c['error-soft'] || mix(error, paper, .16),
    field: c.field || (dark ? mix(ink, paper, .05) : mix('#ffffff', paper, .7)),
    'field-alt': c['field-alt'] || mix(ink, paper, .035),
    placeholder: c.placeholder || mix(ink, paper, .5),
    selection: c.selection || mix(accent, paper, .4),
    ring: c.ring || ink + '12',
    'ink-hover': c['ink-hover'] || mix(paper, ink, .12),
    chart: c.chart || c.word || mix(ink, paper, .6),
    shadow: c.shadow || (dark ? '#00000066' : ink + '20'),
    backdrop: c.backdrop || (dark ? '#0000008c' : ink + '45')
  };
  for (const token of TOKENS) {
    if (!HEX.test(vars[token])) throw new Error('theme ' + theme.id + ' has a bad ' + token + ': ' + vars[token]);
  }
  return {id: theme.id, name: theme.name, scheme: theme.scheme, vars};
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map(v => {
    const s = v / 255;
    return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}

/** WCAG contrast ratio between two opaque colours, 1 to 21. */
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

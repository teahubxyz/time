// The stage: the word being typed, word by word or line by line.
import { $, now, setClass, setText, spanOf, toast, writeLocal } from '/core/dom.js';
import { S, settings } from '/core/state.js';
import { lineStarts } from '/game.js';
import { updateOptions } from '/play/options.js';
import { renderReplay } from '/play/replay.js';
import { renderGame } from '/play/run.js';

let wordSpans = [];
let overflowSpan = null;

// Context recedes from the target: the previous and next words share a
// smaller size, and the word after next is smaller and fainter again.
export const NEAR_SCALE = .62;
export const FAR_SCALE = .48;

// The word after next appears only when a few of its letters fit beside the
// next word. A partial fit fades out rather than ending in an ellipsis.
export function fitAfterNext(room, size, track) {
  const later = $('after-next-word');
  const margin = size * .6;
  later.style.fontSize = size + 'px';
  later.style.letterSpacing = track * size + 'px';
  later.style.marginLeft = margin + 'px';
  later.style.maxWidth = '';
  later.classList.remove('clipped');
  later.hidden = !settings.preview || !later.textContent;
  if (later.hidden) return;
  // Two pixels of slack absorb rounding in the integer scroll widths, so the
  // next word never picks up an ellipsis because of its neighbour.
  const space = room - $('next-word').scrollWidth - margin - 2;
  if (later.scrollWidth <= space) return;
  if (space < size * 1.6) { later.hidden = true; return; }
  later.style.maxWidth = space + 'px';
  later.classList.add('clipped');
}

// Line view: the same run drawn a line at a time. Lines wrap to the stage and run
// on through the passage as it repeats. The current line is full size, and the
// lines around it recede the way the context words do in word view.
let lineMetrics = {size: 0, chars: 0};
let lineCache = {words: null, chars: 0, starts: [0]};
let lastLineKey = '';
let lastLineRow = -1;

export function measureLines() {
  const stage = $('stage');
  const size = Math.max(20, Math.min(44, stage.clientWidth * .036));
  const probe = $('line-probe');
  probe.style.fontSize = size + 'px';
  const advance = probe.getBoundingClientRect().width / 20 || size * .55;
  lineMetrics = {size, chars: Math.max(8, Math.floor((stage.clientWidth - 48) / advance))};
  lastLineKey = '';
}

export function lineRows(words, index) {
  let starts = lineCache.starts;
  if (lineCache.words !== words || lineCache.chars !== lineMetrics.chars || starts[starts.length - 3] <= index) {
    starts = lineStarts(words, lineMetrics.chars, index + 60);
    lineCache = {words, chars: lineMetrics.chars, starts};
  }
  let row = 0;
  while (starts[row + 1] <= index) row++;
  return {starts, row};
}

// The word being typed, letter by letter, with the same states and cursor as word view.
export function activeLetters(word, buffer, flags) {
  const typed = Array.from(buffer || '');
  const chars = Array.from(word || '');
  const letters = chars.map((char, i) => {
    let state = 'pending';
    if (i < typed.length) state = (flags ? flags[i] : typed[i] === char) ? 'correct' : 'incorrect';
    if (i === typed.length) state += ' cursor';
    return spanOf(char, state);
  });
  if (typed.length > chars.length) letters.push(spanOf('+' + (typed.length - chars.length), 'overflow'));
  return letters;
}

export function lineText(words, starts, row) {
  const out = [];
  for (let i = starts[row]; i < starts[row + 1]; i++) out.push(words[i % words.length]);
  return out.join(' ');
}

// A single word longer than a line shrinks to fit rather than run off the stage.
export function fitRow(node, text, size) {
  node.style.fontSize = size * Math.min(1, lineMetrics.chars / Math.max(1, Array.from(text).length)) + 'px';
}

export function drawLines(words, index, buffer, flags) {
  if (S.wordLayoutDirty || !lineMetrics.chars) { measureLines(); S.wordLayoutDirty = false; }
  const key = index + '|' + buffer + '|' + (flags?.join('') || '') + '|' + lineMetrics.chars + '|' + settings.preview;
  if (key === lastLineKey) return;
  lastLineKey = key;
  const {starts, row} = lineRows(words, index);
  const nodes = [];
  let cursorAfter = false;
  for (let i = starts[row]; i < starts[row + 1]; i++) {
    const word = words[i % words.length];
    // Once a word is typed in full, the cursor waits on the space after it.
    if (i > starts[row]) nodes.push(cursorAfter ? spanOf(' ', 'cursor') : document.createTextNode(' '));
    cursorAfter = false;
    if (i < index) nodes.push(spanOf(word, 'typed'));
    else if (i > index) nodes.push(spanOf(word, 'ahead'));
    else {
      const active = spanOf('', 'active');
      active.append(...activeLetters(word, buffer, flags));
      nodes.push(active);
      cursorAfter = Array.from(buffer || '').length === Array.from(word).length;
    }
  }
  if (cursorAfter) nodes.push(spanOf(' ', 'cursor'));
  const current = $('line-current');
  current.replaceChildren(...nodes);
  fitRow(current, lineText(words, starts, row), lineMetrics.size);
  for (const [id, at, scale] of [['line-prev', row - 1, NEAR_SCALE], ['line-next', row + 1, NEAR_SCALE], ['line-later', row + 2, FAR_SCALE]]) {
    const text = settings.preview && at >= 0 ? lineText(words, starts, at) : '';
    setText(id, text);
    fitRow($(id), text, lineMetrics.size * scale);
  }
  // A finished line slides up out of the way; reduced motion just swaps.
  if (row === lastLineRow + 1 && lastLineRow >= 0 && !S.reducedMotion) {
    $('line-view').animate([{transform:'translateY(' + Math.round(lineMetrics.size * .9) + 'px)'}, {transform:'none'}], {duration:220, easing:'cubic-bezier(.2,.7,.2,1)'});
  }
  lastLineRow = row;
}

// In line view the race lane shows the ghost's whole line, broken where yours is.
export function ghostLine(run, at, chars = lineMetrics.chars || 40) {
  const starts = lineStarts(run.words, chars, at.index);
  let row = 0;
  while (starts[row + 1] <= at.index) row++;
  const nodes = [];
  for (let i = starts[row]; i < starts[row + 1]; i++) {
    const word = run.words[i % run.words.length];
    if (nodes.length) nodes.push(document.createTextNode(' '));
    if (i < at.index || (at.done && i === at.index)) nodes.push(spanOf(word, 'correct'));
    else if (i > at.index) nodes.push(spanOf(word));
    else {
      // A word typed to its end waits for its space, so the cursor sits just after it.
      const letters = Array.from(word);
      nodes.push(...letters.map((letter, k) => spanOf(letter, (k < at.flags.length ? (at.flags[k] ? 'correct' : 'incorrect') : k === at.flags.length ? 'cursor' : '') + (k === letters.length - 1 && at.flags.length >= letters.length ? ' cursor-end' : ''))));
    }
  }
  return nodes;
}

export function drawWord(word, buffer, index, nextWord, flags = null, previousWord = '', afterNextWord = '') {
  if (settings.view === 'line') {
    const node = $('word');
    if (node.dataset.word !== word || S.lastWordIndex !== index) {
      node.dataset.word = word;
      node.setAttribute('aria-label', 'Word to type: ' + word);
      $('typing-input').setAttribute('aria-label', 'Type the word: ' + word);
      setText('word-number', String(index + 1).padStart(3, '0'));
      S.lastWordIndex = index;
    }
    drawLines(S.view === 'replay' ? S.currentResult.run.words : S.game.words, index, buffer, flags);
    return;
  }
  const key = word + '|' + buffer + '|' + index + '|' + (flags?.join('') || '');
  if (key === S.lastWordKey && !S.wordLayoutDirty) return;
  const node = $('word');
  const typed = Array.from(buffer || '');
  const wordChanged = index !== S.lastWordIndex || word !== S.renderedWord;
  if (wordChanged) {
    // The next target is readable immediately. Animation must never consume
    // part of the interval in which the player is already typing this word.
    S.errorAnimation?.cancel();
    const chars = Array.from(word || '');
    node.classList.toggle('long', chars.length > 12);
    node.classList.toggle('very-long', chars.length > 22);
    wordSpans = chars.map(char => {
      const span = document.createElement('span');
      span.textContent = char;
      return span;
    });
    overflowSpan = document.createElement('span');
    overflowSpan.className = 'overflow';
    overflowSpan.setAttribute('aria-hidden', 'true');
    overflowSpan.hidden = true;
    node.replaceChildren(...wordSpans, overflowSpan);
    node.setAttribute('aria-label', 'Word to type: ' + word);
    node.dataset.word = word;
    $('typing-input').setAttribute('aria-label', 'Type the word: ' + word);
    setText('word-number', String(index + 1).padStart(3, '0'));
    setText('next-word', nextWord || '');
    setText('previous-word', previousWord);
    setText('after-next-word', afterNextWord || '');
    $('previous-context').hidden = !settings.preview || !previousWord;
    S.wordLayoutDirty = true;
  }
  wordSpans.forEach((span, i) => {
    let state = '';
    if (i < typed.length) state = (flags ? flags[i] : typed[i] === span.textContent) ? 'correct' : 'incorrect';
    if (i === typed.length) state += ' cursor';
    if (span.className !== state) span.className = state;
  });
  const overflow = Math.max(0, typed.length - wordSpans.length);
  if (overflowSpan.hidden !== !overflow) overflowSpan.hidden = !overflow;
  if (overflow && overflowSpan.textContent !== '+' + overflow) overflowSpan.textContent = '+' + overflow;
  // Fit a long pasted word once, on word/viewport changes. Letter feedback does
  // not change glyph widths and must not force a layout read on every key.
  if (S.wordLayoutDirty) {
    node.style.fontSize = '';
    const stageWidth = $('stage').clientWidth;
    const width = node.scrollWidth;
    const style = getComputedStyle(node);
    const natural = parseFloat(style.fontSize);
    const tracking = parseFloat(style.letterSpacing) / natural;
    // The active word stays at the page center. Context words only use the
    // remaining space on either side, without shifting or shrinking the target.
    const anchor = .5;
    const available = Math.max(1, stageWidth - 28);
    const size = width > available ? Math.max(8, natural * available / width * .96) : natural;
    if (size !== natural) node.style.fontSize = size + 'px';
    $('word-pair').style.left = anchor * 100 + '%';
    const gap = Math.max(12, size * .4);
    const room = Math.max(0, stageWidth / 2 - width * size / natural / 2 - gap - 14);
    const track = Number.isFinite(tracking) ? tracking : 0;
    const near = size * NEAR_SCALE;
    for (const id of ['previous-context', 'upcoming']) {
      const context = $(id);
      context.style.fontSize = near + 'px';
      context.style.letterSpacing = track * near + 'px';
      context.style.width = room + 'px';
      context.style[id === 'previous-context' ? 'right' : 'left'] = 'calc(100% + ' + gap + 'px)';
    }
    fitAfterNext(room, size * FAR_SCALE, track);
    S.wordLayoutDirty = false;
  }
  S.lastWordKey = key;
  S.lastWordIndex = index;
  S.renderedWord = word;
}

// Views: word by word or line by line, from settings or Alt+L (Option+L on a Mac).
export function applyView() {
  const lines = settings.view === 'line';
  setClass($('stage'), 'lines', lines);
  $('line-view').hidden = !lines;
  S.wordLayoutDirty = true; S.lastWordKey = ''; S.lastWordIndex = -1; S.renderedWord = '';
  lastLineKey = ''; lastLineRow = -1; S.ghostLaneKey = '';
  lineCache = {words: null, chars: 0, starts: [0]};
}

export function redrawStage() {
  if (S.view === 'play' && S.game) renderGame(S.game.snapshot(now()));
  else if (S.view === 'replay') renderReplay(S.replay.position);
}

document.addEventListener('keydown', event => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyL') return;
  event.preventDefault();
  settings.view = settings.view === 'line' ? 'word' : 'line';
  writeLocal('settings', settings);
  applyView(); updateOptions(); redrawStage();
  toast(settings.view === 'line' ? 'line by line' : 'word by word');
});

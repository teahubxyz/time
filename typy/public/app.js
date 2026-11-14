import { TypingGame, timedSeconds, replayFrame, raceOutcome, lineStarts } from '/game.js';
import { generateWords, normalizePassage } from '/words.js';
import { createMusic, createConductor } from '/music.js';
// themes.js is a classic <head> script (it paints before the first render), so it is read from window.
const { THEMES, MODES, AUTO, DEFAULT: THEME_DEFAULT, resolveTheme, findTheme, paint: paintThemeVars, start: themeStart } = window.typyThemes;

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const now = () => performance.now();
const pretty = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : '0';
const round1 = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 10) / 10) : '0';
const modeNames = {'30':'30 seconds','60':'60 seconds','120':'120 seconds','50':'50 words','endless':'endless','tempo':'tempo'};
const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem('typy.' + key)) ?? fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem('typy.' + key, JSON.stringify(value)); } catch {} };
const settings = {...{advance:'space',preview:true,view:'word'}, ...readLocal('settings', {})};
const bests = readLocal('bests', {});
// Followed live: a visitor can turn the setting on mid-run, and the beat rail
// and the error nudge are drawn by script, out of reach of the stylesheet rule.
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionQuery.matches;
motionQuery.addEventListener('change', event => { reducedMotion = event.matches; });
let selectedMode = '30';
let source = {kind:'common'};
let passage = [];
let game = null;
let ghost = null;
let view = 'play';
let currentResult = null;
let shareId = null;
let shareIntent = 'result';
let currentPath = '/';
let routeSerial = 0;
let lastWordKey = '';
let lastWordIndex = -1;
let renderedWord = '';
let wordSpans = [];
let overflowSpan = null;
let wordLayoutDirty = true;
let errorAnimation = null;
let lastClockPaint = 0;
let lastErrorCount = 0;
let replay = {playing:false,position:0,anchor:0,anchorPosition:0};
let toastTimer;
let transitioning = false;
let isComposing = false;
let ghostLaneKey = '';
// Music mode (public/music.js). Off until someone turns it on; it then listens
// to the game's own event log, so live play and replays share one conductor.
const music = createMusic();
const conductor = createConductor();
let musicOn = readLocal('music', false) === true;
let lastHeard = null;
let ghostHeard = 0;
let replayCursor = 0;

function setText(id, value) {
  const node = $(id), text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

function setClass(node, name, enabled) {
  if (node.classList.contains(name) !== enabled) node.classList.toggle(name, enabled);
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers:{...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {})}});
  let body;
  try { body = await response.json(); } catch { throw new Error('The server could not answer. Please try again.'); }
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message || body.message;
    const error = new Error(message || 'Something interrupted that request. Please try again.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function sourceName() {
  if (ghost) return 'racing ' + (currentResult?.name || 'a friendly ghost');
  if (source.kind === 'topic') return (source.topic || '').replaceAll('-', ' ');
  if (source.kind === 'daily') return 'the daily · ' + (source.day || 'today');
  if (source.kind === 'paste') return 'your own words';
  return 'common words';
}

function localBestKey() { return selectedMode; }
function updateOptions() {
  const locked = source.kind === 'daily' || Boolean(ghost);
  const effectiveAdvance = ghost ? currentResult.run.advance : settings.advance;
  $('mode-switch').classList.toggle('locked', locked);
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === selectedMode));
    button.disabled = locked || view === 'replay';
    button.title = locked ? (ghost ? 'A race uses the original run’s mode.' : 'The daily is a shared 60-second run.') : '';
  });
  $('source-label').textContent = sourceName();
  $('advance-hint').innerHTML = selectedMode === 'tempo' ? 'finish before the beat' : effectiveAdvance === 'letter' ? 'last letter → next word' : '<kbd>space</kbd> next word';
  if ($('upcoming').hidden === settings.preview) wordLayoutDirty = true;
  $('upcoming').hidden = !settings.preview;
  $('previous-context').hidden = !settings.preview || !$('previous-word').textContent;
  $('advance-setting').value = effectiveAdvance;
  $('advance-setting').disabled = Boolean(ghost);
  $('preview-setting').checked = settings.preview;
  $('view-setting').value = settings.view === 'line' ? 'line' : 'word';
  $('footer-board').hidden = source.kind !== 'daily';
  $('daily-link').setAttribute('aria-current', source.kind === 'daily' ? 'page' : 'false');
  $('best-score').textContent = bests[localBestKey()] ? 'device best  ' + pretty(bests[localBestKey()]) + ' wpm' : '';
}

function focusTyping() {
  if (view !== 'play' || document.querySelector('dialog[open]')) return;
  $('typing-input').focus({preventScroll:true});
}

function newCommonPassage() {
  const words = generateWords(300);
  words[0] = 'breathe';
  return words;
}

function beginRun({freshWords = false, focus = false} = {}) {
  shuffleTheme();
  transitioning = false;
  if (freshWords && source.kind === 'common' && !ghost) passage = newCommonPassage();
  if (!passage.length) passage = newCommonPassage();
  game = new TypingGame({words:passage, mode:selectedMode, advance:ghost ? currentResult.run.advance : settings.advance, paceWpm:readLocal('lastAverage', 40)});
  conductor.reset(game.words);
  lastHeard = null;
  view = 'play';
  replay.playing = false;
  lastWordKey = '';
  lastWordIndex = -1;
  renderedWord = '';
  wordLayoutDirty = true;
  lastErrorCount = 0;
  $('load-panel').hidden = true;
  $('play-panel').hidden = false;
  $('result-panel').hidden = true;
  $('replay-controls').hidden = true;
  $('input-row').hidden = false;
  $('typing-input').value = '';
  $('typing-input').disabled = false;
  $('ghost-race').hidden = !ghost;
  $('ghost-lane').hidden = !ghost;
  ghostLaneKey = '';
  ghostHeard = 0;
  if (ghost) { setText('ghost-lane-label', currentResult?.name || 'ghost'); setText('race-you-label', 'you'); setText('race-them-label', 'ghost'); }
  $('finish-run').hidden = selectedMode !== 'endless' && selectedMode !== 'tempo';
  $('tempo-track').hidden = selectedMode !== 'tempo';
  $('restart-tip').hidden = false;
  updateOptions();
  renderGame(game.snapshot(now()));
  if (focus || innerWidth > 700) focusTyping();
}

// Context recedes from the target: the previous and next words share a
// smaller size, and the word after next is smaller and fainter again.
const NEAR_SCALE = .62;
const FAR_SCALE = .48;

// The word after next appears only when a few of its letters fit beside the
// next word. A partial fit fades out rather than ending in an ellipsis.
function fitAfterNext(room, size, track) {
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

function measureLines() {
  const stage = $('stage');
  const size = Math.max(20, Math.min(44, stage.clientWidth * .036));
  const probe = $('line-probe');
  probe.style.fontSize = size + 'px';
  const advance = probe.getBoundingClientRect().width / 20 || size * .55;
  lineMetrics = {size, chars: Math.max(8, Math.floor((stage.clientWidth - 48) / advance))};
  lastLineKey = '';
}

function lineRows(words, index) {
  let starts = lineCache.starts;
  if (lineCache.words !== words || lineCache.chars !== lineMetrics.chars || starts[starts.length - 3] <= index) {
    starts = lineStarts(words, lineMetrics.chars, index + 60);
    lineCache = {words, chars: lineMetrics.chars, starts};
  }
  let row = 0;
  while (starts[row + 1] <= index) row++;
  return {starts, row};
}

function spanOf(text, className = '') {
  const span = document.createElement('span');
  span.textContent = text;
  if (className) span.className = className;
  return span;
}

// The word being typed, letter by letter, with the same states and cursor as word view.
function activeLetters(word, buffer, flags) {
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

function lineText(words, starts, row) {
  const out = [];
  for (let i = starts[row]; i < starts[row + 1]; i++) out.push(words[i % words.length]);
  return out.join(' ');
}

// A single word longer than a line shrinks to fit rather than run off the stage.
function fitRow(node, text, size) {
  node.style.fontSize = size * Math.min(1, lineMetrics.chars / Math.max(1, Array.from(text).length)) + 'px';
}

function drawLines(words, index, buffer, flags) {
  if (wordLayoutDirty || !lineMetrics.chars) { measureLines(); wordLayoutDirty = false; }
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
  if (row === lastLineRow + 1 && lastLineRow >= 0 && !reducedMotion) {
    $('line-view').animate([{transform:'translateY(' + Math.round(lineMetrics.size * .9) + 'px)'}, {transform:'none'}], {duration:220, easing:'cubic-bezier(.2,.7,.2,1)'});
  }
  lastLineRow = row;
}

// In line view the race lane shows the ghost's whole line, broken where yours is.
function ghostLine(run, at) {
  const starts = lineStarts(run.words, lineMetrics.chars || 40, at.index);
  let row = 0;
  while (starts[row + 1] <= at.index) row++;
  const nodes = [];
  for (let i = starts[row]; i < starts[row + 1]; i++) {
    const word = run.words[i % run.words.length];
    if (nodes.length) nodes.push(document.createTextNode(' '));
    if (i < at.index || (at.done && i === at.index)) nodes.push(spanOf(word, 'correct'));
    else if (i > at.index) nodes.push(spanOf(word));
    else nodes.push(...Array.from(word).map((letter, k) => spanOf(letter, k < at.flags.length ? (at.flags[k] ? 'correct' : 'incorrect') : k === at.flags.length ? 'cursor' : '')));
  }
  return nodes;
}

function drawWord(word, buffer, index, nextWord, flags = null, previousWord = '', afterNextWord = '') {
  if (settings.view === 'line') {
    const node = $('word');
    if (node.dataset.word !== word || lastWordIndex !== index) {
      node.dataset.word = word;
      node.setAttribute('aria-label', 'Word to type: ' + word);
      $('typing-input').setAttribute('aria-label', 'Type the word: ' + word);
      setText('word-number', String(index + 1).padStart(3, '0'));
      lastWordIndex = index;
    }
    drawLines(view === 'replay' ? currentResult.run.words : game.words, index, buffer, flags);
    return;
  }
  const key = word + '|' + buffer + '|' + index + '|' + (flags?.join('') || '');
  if (key === lastWordKey && !wordLayoutDirty) return;
  const node = $('word');
  const typed = Array.from(buffer || '');
  const wordChanged = index !== lastWordIndex || word !== renderedWord;
  if (wordChanged) {
    // The next target is readable immediately. Animation must never consume
    // part of the interval in which the player is already typing this word.
    errorAnimation?.cancel();
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
    wordLayoutDirty = true;
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
  if (wordLayoutDirty) {
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
    wordLayoutDirty = false;
  }
  lastWordKey = key;
  lastWordIndex = index;
  renderedWord = word;
}

function renderGame(state) {
  hearRun();
  const previous = state.wordIndex > 0 ? game.words[(state.wordIndex - 1) % game.words.length] : '';
  drawWord(state.word, state.buffer, state.wordIndex, state.nextWord, null, previous, state.afterNextWord);
  setText('live-wpm', pretty(state.wpm));
  setText('live-accuracy', pretty(state.accuracy));
  setClass($('status-dot'), 'active', state.status === 'running');
  if (state.status === 'ready') setText('run-status', ghost ? 'your ghost is ready' : source.kind === 'daily' ? 'same words, your rhythm' : 'a fresh start');
  else if (state.errorIndex >= 0) setText('run-status', 'a little backspace, then onward');
  else if (state.waitingForBeat) setText('run-status', 'right on time · wait for the beat');
  else setText('run-status', state.streak >= 3 ? state.streak + ' clean words in a row' : 'one word, then the next');
  const hintStart = $('run-hint').querySelector('.hint-start');
  const hint = state.status === 'ready' ? 'type the word to begin' : state.errorIndex >= 0 ? 'backspace to correct' : state.waitingForBeat ? 'hold that rhythm' : 'keep your rhythm';
  if (hintStart.textContent !== hint) hintStart.textContent = hint;
  if (timedSeconds(selectedMode) !== null) {
    setText('time-label', 'remaining'); setText('live-time', Math.ceil(state.remainingMs / 1000)); setText('time-unit', 's');
  } else if (selectedMode === '50') {
    setText('time-label', 'remaining'); setText('live-time', Math.max(0, 50 - state.completedWords)); setText('time-unit', 'words');
  } else if (selectedMode === 'tempo') {
    setText('time-label', 'beat pace'); setText('live-time', pretty(state.paceWpm)); setText('time-unit', 'wpm');
  } else {
    setText('time-label', 'in the flow'); setText('live-time', Math.floor(state.elapsedMs / 1000)); setText('time-unit', 's');
  }
  setClass($('word'), 'behind', Boolean(state.behindPace));
  setClass($('line-current'), 'behind', Boolean(state.behindPace));
  if (selectedMode === 'tempo') {
    const fraction = state.beatDurationMs ? Math.max(0, state.beatRemainingMs / state.beatDurationMs) : 1;
    // Reduced motion gets the same information in tenths, so the rail reports
    // the beat instead of sliding across the screen.
    $('tempo-progress').style.transform = 'scaleX(' + (reducedMotion ? Math.ceil(fraction * 10) / 10 : fraction) + ')';
    setText('tempo-caption', state.status === 'ready' ? 'type to catch the first beat' : state.waitingForBeat ? 'got it. the next beat is coming.' : state.behindPace ? 'the pace is ahead of you — keep going' : 'finish the word before the line runs out');
    Array.from($('tempo-lives').children).forEach((dot, i) => setClass(dot, 'lost', i < state.misses));
    const label = (3 - state.misses) + ' missed beats remaining';
    if ($('tempo-lives').getAttribute('aria-label') !== label) $('tempo-lives').setAttribute('aria-label', label);
  }
  if (ghost) {
    const completed = ghost.wordTimings.filter(timing => timing.completed && timing.end <= state.elapsedMs).length;
    setText('race-you', state.completedWords);
    setText('race-them', completed);
    const difference = state.completedWords - completed;
    setText('race-delta', state.status === 'ready' ? '' : difference === 0 ? 'neck and neck' : Math.abs(difference) + (difference > 0 ? ' ahead' : ' behind'));
    renderGhostLane(ghost, state.status === 'ready' ? 0 : state.elapsedMs);
  }
  if (state.errors > lastErrorCount && !reducedMotion) {
    errorAnimation?.cancel();
    errorAnimation = (settings.view === 'line' ? document.querySelector('#line-current .active') || $('word') : $('word')).animate([{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}], {duration:90});
  }
  lastErrorCount = state.errors;
  lastClockPaint = now();
  if (state.status === 'finished' && !transitioning) finishDisplay();
}

// The ghost's own run plays under the stage on the race clock, letter by letter,
// live in a race and again when the race is watched back. It rebuilds only when
// the ghost's word or letters change.
function renderGhostLane(run, position) {
  const at = replayFrame(run, position);
  // With music on, each word the ghost finishes rings a soft ting: their pace, heard.
  if (at.index > ghostHeard) { if (musicOn && position > 0 && (view === 'play' || replay.playing)) music.ghost(); ghostHeard = at.index; }
  const key = at.index + '|' + at.flags.join(',') + '|' + at.done + '|' + settings.view;
  if (key === ghostLaneKey) return;
  ghostLaneKey = key;
  if (settings.view === 'line') $('ghost-lane-word').replaceChildren(...ghostLine(run, at));
  else $('ghost-lane-word').replaceChildren(...Array.from(at.word).map((letter, i) => {
    const span = document.createElement('span');
    span.textContent = letter;
    if (i < at.flags.length) span.className = at.flags[i] ? 'correct' : 'incorrect';
    else if (i === at.flags.length && !at.done) span.className = 'cursor';
    return span;
  }));
  setText('ghost-lane-next', at.done || settings.view === 'line' ? '' : at.next);
  setText('ghost-lane-pace', at.done ? 'done · ' + pretty(run.stats.wpm) + ' wpm' : '');
  setClass($('ghost-lane'), 'done', at.done);
}

function press(key) {
  if (view !== 'play' || !game || document.querySelector('dialog[open]')) return;
  renderGame(game.press(key, now()));
}

// The game trims its oldest events on very long runs, so the new ones are found
// by looking back from the end for the last event already heard.
function freshEvents(events, last) {
  for (let i = events.length - 1, back = 0; i >= 0 && back < 64; i--, back++) {
    if (events[i] === last) return events.slice(i + 1);
  }
  return last ? events.slice(-1) : events.slice(-64);
}

function hearRun() {
  if (!game) return;
  const fresh = freshEvents(game.events, lastHeard);
  if (!fresh.length) return;
  lastHeard = fresh[fresh.length - 1];
  const actions = fresh.flatMap(event => conductor.event(event));
  if (!musicOn) return;
  // A tab that slept through several tempo beats wakes to one chord, not a pile.
  let lastChord = -1;
  actions.forEach((action, i) => { if (action.type === 'chord') lastChord = i; });
  actions.forEach((action, i) => { if (action.type !== 'chord' || i === lastChord) music.play(action); });
}

function finishDisplay() {
  transitioning = true;
  const run = game.result(now());
  const previousBest = Number(bests[selectedMode] || 0);
  const qualifies = run.finishedReason !== 'manual' || selectedMode === 'endless' || selectedMode === 'tempo';
  const isBest = qualifies && run.stats.completedWords > 0 && run.stats.wpm > previousBest;
  if (isBest) { bests[selectedMode] = run.stats.wpm; writeLocal('bests', bests); }
  if (run.durationMs >= 5000 && run.stats.wpm > 0) writeLocal('lastAverage', Math.max(10, Math.min(200, run.stats.wpm)));
  const ghostStats = ghost?.stats;
  const ghostName = ghost ? currentResult?.name || '' : '';
  // A race keeps the ghost's run, so it can be watched back, and the result it raced.
  const ghostRun = ghost || null;
  const raceOf = ghost ? currentResult?.id || shareId || null : null;
  if (musicOn) music.finish(ghostStats ? raceOutcome(run.stats.wpm, ghostStats.wpm).verdict : 'solo');
  currentResult = {run,source:{...source},name:'',local:true,isBest,ghostStats,ghostName,ghostRun,raceOf};
  shareId = null;
  ghost = null;
  $('typing-input').blur();
  displayResult(currentResult);
}

function displayResult(result) {
  view = 'result';
  replay.playing = false;
  currentResult = result;
  const run = result.run;
  const stats = run.stats;
  selectedMode = run.mode;
  source = result.source || {kind:'common'};
  passage = [...run.words];
  $('load-panel').hidden = true; $('play-panel').hidden = true; $('result-panel').hidden = false;
  $('result-kicker').textContent = (result.name ? result.name + ' · ' : '') + modeNames[run.mode] + (run.finishedReason === 'manual' && (timedSeconds(run.mode) !== null || run.mode === '50') ? ' · finished early' : ', well spent');
  const race = result.ghostStats ? raceOutcome(stats.wpm, result.ghostStats.wpm) : null;
  const rival = result.ghostName || '';
  // Your own race says "you"; a shared race uses the racer's name.
  const racer = result.local ? 'you' : result.name || 'anonymous';
  $('result-title').textContent = !race ? 'there’s your rhythm.' : race.verdict === 'won' ? racer + ' beat ' + (rival || 'the ghost') + '.' : race.verdict === 'lost' ? (rival || 'the ghost') + ' got there first.' : 'a dead heat.';
  $('race-outcome').hidden = !race;
  if (race) {
    $('race-outcome').dataset.verdict = race.verdict;
    setText('race-verdict', race.verdict === 'tied' ? 'a tie' : race.verdict + ' by ' + race.margin + ' wpm');
    setText('race-score', racer + ' ' + race.mine + ' · ' + (rival || 'ghost') + ' ' + race.theirs + ' wpm');
  }
  setText('replay-label', result.ghostRun ? 'watch the race' : 'replay');
  if (!result.local && result.raceOf && !result.ghostRun) loadRace(result);
  $('result-wpm').textContent = pretty(stats.wpm);
  $('result-accuracy').textContent = round1(stats.accuracy) + '%';
  $('result-streak').textContent = stats.bestStreak + (stats.bestStreak === 1 ? ' word' : ' words');
  $('result-words').textContent = stats.completedWords;
  $('new-best').hidden = !result.isBest;
  $('again-button').innerHTML = result.local ? 'go again <span aria-hidden="true">↵</span>' : 'try these words <span aria-hidden="true">↵</span>';
  $('share-button').innerHTML = shareId ? 'copy result <span aria-hidden="true">↗</span>' : 'share result <span aria-hidden="true">↗</span>';
  $('race-button').textContent = result.local ? 'challenge a friend →' : 'race this →';
  $('replay-button').disabled = !run.events?.length;
  $('share-button').disabled = !run.events?.length || run.replayTruncated;
  $('race-button').disabled = !run.events?.length || run.replayTruncated;
  $('board-open').hidden = source.kind !== 'daily';
  if (run.replayTruncated) $('result-note').textContent = 'That was a long flow. Your score is complete; the replay holds the most recent portion, so this run cannot be shared.';
  else if (source.kind === 'daily' && result.local) $('result-note').textContent = 'Share your result to add it to today’s board. A name is optional, and the replay link it makes is public.';
  else if (result.ghostStats) $('result-note').textContent = result.local ? 'Same words, same mode, their original timing. Watch the race back, or send your run back with “challenge a friend”.' : 'This race is public to anyone with its link. Watch both runs back, or race this ghost yourself.';
  else $('result-note').textContent = result.local ? 'Your result is on this device. Sharing it makes a replay link that is public: anyone who has the link can watch the run, with no account needed.' : 'This replay is public to anyone with its link. Watch the original timing, or try the same words against this ghost.';
  const slowest = stats.slowest?.slice(0, 3) || [];
  $('slow-words').innerHTML = slowest.length ? slowest.map(row => '<span class="slow-word"><span>' + escapeHTML(row.word) + '</span><small>' + round1(row.ms / 1000) + 's</small></span>').join('') : '<span>your next run starts here</span>';
  const points = stats.sparkline || [];
  if (points.length) {
    const max = Math.max(20, ...points);
    const coords = points.map((value, i) => [(i / Math.max(1, points.length - 1)) * 896 + 2, 83 - (Math.min(value, max) / max) * 70]);
    const path = coords.map((point, i) => (i ? 'L' : 'M') + point[0].toFixed(1) + ',' + point[1].toFixed(1)).join(' ');
    $('speed-chart').innerHTML = '<path d="M0 84H900" class="chart-base"/><path d="' + path + ' L898 84 L2 84 Z" class="chart-area"/><path d="' + path + '" class="chart-line" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + coords.filter((_, i) => i === 0 || i === coords.length - 1).map(point => '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="3" class="chart-dot"/>').join('');
  } else $('speed-chart').innerHTML = '<path d="M0 60H900" class="chart-base"/>';
  updateOptions();
  $('mode-switch').querySelectorAll('button').forEach(button => { button.disabled = false; });
}

// A shared race names the result it raced. Fetching that run lets anyone with
// the link see the verdict and watch both runs back.
async function loadRace(result) {
  try {
    const rival = await api('/api/results/' + encodeURIComponent(result.raceOf));
    if (!rival?.run?.wordTimings?.length || !rival.run.stats) return;
    Object.assign(result, {ghostRun:rival.run, ghostStats:rival.run.stats, ghostName:rival.name || ''});
    if (currentResult === result && view === 'result') displayResult(result);
  } catch { /* the result still stands on its own */ }
}

function showLoading(title, description = '') {
  view = 'loading';
  replay.playing = false;
  $('play-panel').hidden = true; $('result-panel').hidden = true; $('load-panel').hidden = false;
  $('load-kicker').textContent = 'one moment';
  $('load-title').textContent = title; $('load-description').textContent = description;
  $('load-actions').hidden = true; $('loading-spinner').hidden = false;
}

function showRouteError(error) {
  view = 'loading';
  $('load-panel').hidden = false; $('play-panel').hidden = true; $('result-panel').hidden = true;
  $('loading-spinner').hidden = true; $('load-actions').hidden = false;
  $('load-kicker').textContent = error.status === 429 ? 'a little breathing room' : 'a small interruption';
  $('load-title').textContent = error.status === 404 ? 'that rhythm is missing.' : 'the words couldn’t land.';
  $('load-description').textContent = error.message;
}

async function route(path, push = true) {
  const serial = ++routeSerial;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  if (push) history.pushState({}, '', path);
  currentPath = path;
  ghost = null; shareId = null;
  if (path === '/') {
    source = {kind:'common'};
    currentResult = null;
    passage = newCommonPassage();
    beginRun();
    document.title = 'typy — one word at a time';
    return;
  }
  try {
    if (path === '/daily' || path === '/daily/') {
      showLoading('today’s words, for everyone.');
      const response = await api('/api/daily');
      if (serial !== routeSerial) return;
      passage = response.words;
      source = {kind:'daily',day:response.day};
      selectedMode = '60';
      currentResult = null;
      beginRun();
      document.title = 'the daily — typy';
    } else if (/^\/(r|race)\/[a-zA-Z0-9_-]+\/?$/.test(path)) {
      const [,kind,id] = path.split('/');
      showLoading(kind === 'race' ? 'a ghost is taking its place.' : 'finding that rhythm.');
      const response = await api('/api/results/' + encodeURIComponent(id));
      if (serial !== routeSerial) return;
      const result = {...response,local:false};
      if (!result.run?.words?.length || !result.run.stats) throw new Error('This replay is incomplete. Please try another result.');
      currentResult = result;
      shareId = result.id || id;
      source = result.source || {kind:'common'};
      passage = [...result.run.words];
      selectedMode = result.run.mode;
      if (kind === 'race') {
        ghost = result.run;
        beginRun();
      } else displayResult(result);
      document.title = pretty(result.run.stats.wpm) + ' wpm — typy';
    } else {
      const topic = decodeURIComponent(path).replace(/^\/|\/$/g, '');
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(topic)) throw Object.assign(new Error('Try a short topic with letters and hyphens, such as /react-hooks.'), {status:404});
      source = {kind:'topic',topic};
      updateOptions();
      showLoading('a little about ' + topic.replaceAll('-', ' ') + '.', 'Making a short passage for your next run.');
      const response = await api('/api/passage?topic=' + encodeURIComponent(topic));
      if (serial !== routeSerial) return;
      passage = response.words;
      source = {kind:'topic',topic:response.topic || topic};
      currentResult = null;
      beginRun();
      document.title = topic.replaceAll('-', ' ') + ' — typy';
    }
  } catch (error) { if (serial === routeSerial) showRouteError(error); }
}

// A race replay runs until the slower of the two runs is over.
const replayLength = () => Math.max(currentResult.run.durationMs, currentResult.ghostRun?.durationMs || 0);
const finishedWords = (run, position) => run.wordTimings.filter(timing => timing.completed && timing.end <= position).length;

function startReplay() {
  if (!currentResult?.run) return;
  view = 'replay';
  ghost = null;
  lastWordKey = ''; lastWordIndex = -1;
  $('result-panel').hidden = true; $('play-panel').hidden = false;
  $('input-row').hidden = true; $('replay-controls').hidden = false;
  // A race replays both runs on one clock: this run on the stage, the ghost's in the lane.
  const rival = currentResult.ghostRun || null;
  $('ghost-race').hidden = !rival; $('ghost-lane').hidden = !rival; $('tempo-track').hidden = true;
  ghostLaneKey = '';
  if (rival) {
    setText('ghost-lane-label', currentResult.ghostName || 'ghost');
    setText('race-you-label', currentResult.local ? 'you' : currentResult.name || 'anonymous');
    setText('race-them-label', currentResult.ghostName || 'ghost');
  }
  $('run-status').textContent = rival ? 'the race, replayed' : 'a rhythm, replayed';
  $('status-dot').classList.add('active');
  $('replay-scrubber').max = Math.max(1, replayLength());
  $('replay-scrubber').value = '0';
  $('time-label').textContent = 'replay'; $('time-unit').textContent = 's';
  replay = {playing:true,position:0,anchor:now(),anchorPosition:0};
  seekReplayMusic(0);
  $('replay-play').textContent = 'pause';
  updateOptions();
  renderReplay(0);
}

function clock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

// A replay plays its run's music on the replay clock, scheduled a few hundredths
// of a second ahead so every note lands exactly where it was typed.
function seekReplayMusic(position) {
  music.hush();
  const events = currentResult?.run?.events || [];
  conductor.reset(currentResult?.run?.words || []);
  replayCursor = 0;
  while (replayCursor < events.length && events[replayCursor].t < position) conductor.event(events[replayCursor++]);
  ghostHeard = currentResult?.ghostRun ? replayFrame(currentResult.ghostRun, position).index : 0;
}

function hearReplay(position) {
  const events = currentResult.run.events;
  const clock = musicOn ? music.clock() : 0;
  while (replayCursor < events.length && events[replayCursor].t <= position + 60) {
    const event = events[replayCursor++];
    const actions = conductor.event(event);
    if (musicOn) for (const action of actions) music.play(action, clock + Math.max(0, event.t - position) / 1000);
  }
}

function renderReplay(position) {
  const run = currentResult.run;
  const at = replayFrame(run, position);
  const characters = Array.from(at.word);
  const buffer = at.flags.map((flag, i) => flag ? characters[i] || '' : '·').join('');
  drawWord(at.word, buffer, at.index, at.next, at.flags, at.previous, at.afterNext);
  const rival = currentResult.ghostRun;
  if (rival) {
    const mine = finishedWords(run, position), theirs = finishedWords(rival, position);
    setText('race-you', mine); setText('race-them', theirs);
    setText('race-delta', position <= 0 ? '' : mine === theirs ? 'neck and neck' : Math.abs(mine - theirs) + (mine > theirs ? ' ahead' : ' behind'));
    renderGhostLane(rival, position);
  }
  $('live-wpm').textContent = pretty(run.stats.wpm);
  $('live-accuracy').textContent = pretty(run.stats.accuracy);
  $('live-time').textContent = Math.floor(position / 1000);
  $('replay-scrubber').value = String(position);
  $('replay-time').textContent = clock(position) + ' / ' + clock(replayLength());
}

function openShare(intent = 'result') {
  if (!currentResult) return;
  shareIntent = intent;
  $('share-kicker').textContent = source.kind === 'daily' ? 'put your rhythm on the board' : 'a good rhythm is worth sharing';
  $('share-title').textContent = intent === 'race' ? 'a friendly challenge.' : 'leave a little ghost.';
  $('share-error').hidden = true;
  $('share-name').value = readLocal('name', '');
  $('share-create').hidden = Boolean(shareId);
  $('share-ready').hidden = !shareId;
  if (shareId) fillShareLink();
  $('share-dialog').showModal();
}

function fillShareLink() {
  $('share-url').value = location.origin + (shareIntent === 'race' ? '/race/' : '/r/') + shareId;
  $('share-url-label').textContent = shareIntent === 'race' ? 'Your challenge link' : 'Your result link';
  $('share-ready-note').textContent = shareIntent === 'race' ? 'Same words, same mode. Your friend races your original timing.' : 'Anyone with this link can watch your replay or race your ghost.';
  $('copy-link').textContent = 'copy';
}

async function saveResult() {
  if (!currentResult || shareId) return;
  const button = $('save-result');
  button.disabled = true; button.textContent = 'saving your rhythm…';
  $('share-error').hidden = true;
  try {
    const name = $('share-name').value.trim();
    const raced = currentResult.raceOf ? {raceOf:currentResult.raceOf} : {};
    const response = await api('/api/results', {method:'POST',body:JSON.stringify({run:currentResult.run,source:currentResult.source,name,...raced})});
    if (!response.id) throw new Error('The server did not return a share link. Please try again.');
    shareId = response.id;
    currentResult = {...currentResult,id:shareId,name,boardPublished:response.boardPublished};
    writeLocal('name', name);
    $('share-create').hidden = true; $('share-ready').hidden = false;
    fillShareLink();
    history.replaceState({}, '', '/r/' + shareId);
    currentPath = '/r/' + shareId;
    $('share-button').innerHTML = 'copy result <span aria-hidden="true">↗</span>';
    $('result-note').textContent = source.kind === 'daily'
      ? response.boardPublished === false
        ? 'Your replay is shared, but the daily board could not update. Your result link still works.'
        : 'Your result is shared. The daily board may take a moment to refresh.'
      : 'Your replay is ready to share.';
    if (source.kind === 'daily' && response.boardPublished === false) toast('Result saved. The daily board could not update this time.');
  } catch (error) {
    $('share-error').textContent = error.message;
    $('share-error').hidden = false;
  } finally { button.disabled = false; button.textContent = 'create share link ↗'; }
}

async function copyShareLink() {
  try { await navigator.clipboard.writeText($('share-url').value); $('copy-link').textContent = 'copied ✓'; }
  catch { $('share-url').focus(); $('share-url').select(); toast('The link is selected. Copy it with your keyboard or press and hold.'); }
}

async function loadBoard() {
  const day = source.day || new Date().toISOString().slice(0, 10);
  $('board-date').textContent = day + ' · midnight to midnight UTC';
  $('board-content').innerHTML = '<p class="empty-board">finding today’s rhythms…</p>';
  try {
    const response = await api('/api/board?day=' + encodeURIComponent(day));
    const entries = response.entries || [];
    $('board-content').innerHTML = entries.length ? '<ol class="board-list">' + entries.map((entry, i) => '<li><span>' + String(i + 1).padStart(2, '0') + '</span><a href="/r/' + encodeURIComponent(entry.id) + '">' + escapeHTML(entry.name || 'anonymous') + '</a><strong>' + pretty(entry.wpm) + ' wpm</strong><small>' + round1(entry.accuracy) + '%</small></li>').join('') + '</ol>' : '<p class="empty-board">No shared runs yet. Set today’s rhythm.</p>';
  } catch (error) { $('board-content').innerHTML = '<p class="inline-error">' + escapeHTML(error.message) + '</p>'; }
}

function openBoard() { $('board-dialog').showModal(); loadBoard(); }
function topicRoute(topic) {
  const slug = topic.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '');
  if (!slug || ['api','r','race','daily'].includes(slug)) { toast('Try a few words about a topic, such as “the deep sea”.'); return; }
  route('/' + slug);
}

function restart({freshWords = false} = {}) {
  if (view === 'loading') return;
  if (view === 'result' && !currentResult?.local) {
    source = {...currentResult.source}; passage = [...currentResult.run.words]; selectedMode = currentResult.run.mode;
  }
  if (view === 'replay') { replay.playing = false; music.hush(); }
  // A local retry gets a clean address instead of replacing somebody else's result.
  if (view !== 'play') {
    const target = source.kind === 'daily' ? '/daily' : source.kind === 'topic' ? '/' + source.topic : '/';
    history.replaceState({}, '', target); currentPath = target;
    shareId = null;
  }
  beginRun({freshWords,focus:true});
}

document.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const target = event.target;
  if (target !== $('typing-input') && target.closest('input,textarea,select,[contenteditable=true]')) return;
  // Enter/Space must activate a focused control before they can be game
  // shortcuts. This keeps every toolbar and result action keyboard-accessible.
  if (target.closest('button,a') && (event.key === 'Enter' || event.key === ' ')) return;
  if (event.key === 'Escape') { event.preventDefault(); restart(); return; }
  if (view === 'result' && event.key === 'Enter') { event.preventDefault(); restart({freshWords:source.kind === 'common'}); return; }
  if (view !== 'play') return;
  if (event.key === 'Enter' && (selectedMode === 'endless' || selectedMode === 'tempo') && game.status === 'running') {
    event.preventDefault(); game.finish(now()); finishDisplay(); return;
  }
  if (target !== $('typing-input') && target.closest('button,a')) return;
  if (event.key === 'Backspace' || Array.from(event.key).length === 1) {
    event.preventDefault(); press(event.key);
  }
});

const input = $('typing-input');
input.addEventListener('compositionstart', () => { isComposing = true; });
input.addEventListener('compositionend', event => {
  isComposing = false;
  const text = event.data || input.value;
  input.value = '';
  for (const char of text) press(char);
});
input.addEventListener('beforeinput', event => {
  if (event.inputType === 'deleteContentBackward') { event.preventDefault(); press('Backspace'); }
  if (event.inputType === 'insertFromPaste') { event.preventDefault(); toast('Paste a passage in the words menu, then type it here.'); }
});
input.addEventListener('input', event => {
  if (isComposing || event.isComposing) return;
  const value = input.value;
  input.value = '';
  for (const char of value) press(char);
});
input.addEventListener('paste', event => { event.preventDefault(); toast('Use the words menu to choose a pasted passage.'); });
$('stage').addEventListener('click', focusTyping);
$('finish-run').addEventListener('click', () => { if (game?.status === 'running') { game.finish(now()); finishDisplay(); } else toast('Type the first word to start your run.'); });

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  selectedMode = button.dataset.mode;
  if (source.kind === 'daily' || ghost || view === 'result') {
    ghost = null; source = {kind:'common'}; passage = newCommonPassage(); currentResult = null;
    history.pushState({}, '', '/'); currentPath = '/';
  }
  beginRun({freshWords:source.kind === 'common',focus:true});
}));
$('settings-open').addEventListener('click', () => { updateOptions(); $('settings-dialog').showModal(); });
$('settings-done').addEventListener('click', () => {
  const changed = settings.advance !== $('advance-setting').value || settings.preview !== $('preview-setting').checked;
  const nextView = $('view-setting').value === 'line' ? 'line' : 'word';
  const viewChanged = settings.view !== nextView;
  if (!ghost) settings.advance = $('advance-setting').value;
  settings.preview = $('preview-setting').checked; settings.view = nextView; writeLocal('settings',settings);
  $('settings-dialog').close();
  if (viewChanged) applyView();
  if (changed && view === 'play') beginRun({focus:true});
  else {
    // A new view is a different camera on the same run, so the run carries on.
    updateOptions();
    if (changed || viewChanged) redrawStage();
    if (viewChanged) focusTyping();
  }
});
$('source-open').addEventListener('click', () => $('source-dialog').showModal());
['topic','paste','common'].forEach(tab => $('tab-' + tab).addEventListener('click', () => {
  ['topic','paste','common'].forEach(id => { $('tab-' + id).setAttribute('aria-selected',String(id === tab)); $('source-' + id).hidden = id !== tab; });
  if (tab === 'topic') $('topic-input').focus();
  else if (tab === 'paste') $('paste-input').focus();
}));
$('source-topic').addEventListener('submit', event => { event.preventDefault(); topicRoute($('topic-input').value); });
document.querySelectorAll('[data-topic]').forEach(button => button.addEventListener('click', () => topicRoute(button.dataset.topic)));
$('paste-input').addEventListener('input', () => { const count = normalizePassage($('paste-input').value).length; $('paste-count').textContent = count + ' / 300 words'; });
$('source-paste').addEventListener('submit', event => {
  event.preventDefault();
  const words = normalizePassage($('paste-input').value);
  if (!words.length) { toast('Add a few words first.'); return; }
  routeSerial++; source = {kind:'paste'}; passage = words; ghost = null; currentResult = null; shareId = null;
  $('source-dialog').close(); history.pushState({}, '', '/'); currentPath = '/'; beginRun({focus:true});
});
$('common-start').addEventListener('click', () => route('/'));
$('load-common').addEventListener('click', () => route('/'));
$('load-retry').addEventListener('click', () => route(currentPath,false));
$('help-open').addEventListener('click', () => $('help-dialog').showModal());
$('help-done').addEventListener('click', () => { $('help-dialog').close(); focusTyping(); });
$('again-button').addEventListener('click', () => restart({freshWords:source.kind === 'common'}));
$('replay-button').addEventListener('click', startReplay);
$('replay-back').addEventListener('click', () => { music.hush(); displayResult(currentResult); });
$('replay-play').addEventListener('click', () => {
  if (replay.position >= replayLength()) replay.position = 0;
  replay.playing = !replay.playing; replay.anchor = now(); replay.anchorPosition = replay.position;
  $('replay-play').textContent = replay.playing ? 'pause' : 'play';
  seekReplayMusic(replay.position);
});
$('replay-scrubber').addEventListener('input', () => {
  replay.position = Number($('replay-scrubber').value); replay.anchor = now(); replay.anchorPosition = replay.position;
  seekReplayMusic(replay.position);
  renderReplay(replay.position);
});
$('share-button').addEventListener('click', () => openShare('result'));
$('race-button').addEventListener('click', () => {
  if (currentResult?.local) openShare('race');
  else if (shareId) route('/race/' + shareId);
});
$('save-result').addEventListener('click', saveResult);
$('copy-link').addEventListener('click', copyShareLink);
$('share-url').addEventListener('click', () => $('share-url').select());
$('board-open').addEventListener('click', openBoard);
$('footer-board').addEventListener('click', openBoard);
$('board-refresh').addEventListener('click', loadBoard);
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
document.addEventListener('click', event => {
  const anchor = event.target.closest('a');
  if (!anchor || anchor.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin) return;
  event.preventDefault(); route(url.pathname);
});
window.addEventListener('popstate', () => route(location.pathname,false));
window.addEventListener('resize', () => {
  wordLayoutDirty = true;
  if (view === 'play' && game) renderGame(game.snapshot(now()));
  else if (view === 'replay') renderReplay(replay.position);
});

// Themes paint CSS variables on <html>. themes.js paints the first one in <head>,
// before the page renders; this block owns the picker and the auto and random modes.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
let themeChoice = themeStart?.choice || THEME_DEFAULT;
// Until someone keeps a theme, the default applies and is not saved as their choice.
let themeExplicit = Boolean(themeStart?.explicit);
let randomPick = themeChoice === 'random' ? themeStart?.shown || null : null;
let paintedTheme = themeStart?.shown || '';
let themeKept = false;
let themeShuffleReady = false;
let themeTiles = [];

function themeFor(choice) {
  if (choice === 'auto') return resolveTheme(darkQuery.matches ? AUTO.dark : AUTO.light);
  if (choice === 'random') return resolveTheme(randomPick || 'typy');
  return resolveTheme(choice) || resolveTheme('typy');
}

function paintTheme(theme) {
  if (theme.id === paintedTheme) return;
  paintThemeVars(theme);
  paintedTheme = theme.id;
}

function showThemeName() {
  const shown = themeFor(themeChoice);
  const label = themeChoice === 'auto' || themeChoice === 'random' ? themeChoice + ' · ' + shown.name : shown.name;
  setText('theme-name', label);
  $('theme-footer').setAttribute('aria-label', 'Theme: ' + label + '. Change theme');
}

// Storage keeps the kept choice and the last random deal, never colours, so the
// next visit deals something new and palette changes show up straight away.
function saveTheme() {
  writeLocal('theme', themeExplicit ? {id: themeChoice, pick: randomPick} : {pick: randomPick});
}

function otherTheme() {
  const pool = THEMES.filter(theme => theme.id !== paintedTheme);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function keepTheme(choice) {
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
function shuffleTheme() {
  if (themeChoice !== 'random') return;
  if (!themeShuffleReady) { themeShuffleReady = true; return; }
  randomPick = otherTheme();
  paintTheme(themeFor('random'));
  saveTheme();
  showThemeName();
}

function initThemes() {
  paintTheme(themeFor(themeChoice));
  saveTheme();
  showThemeName();
  darkQuery.addEventListener('change', () => {
    if (themeChoice !== 'auto' || $('theme-dialog').open) return;
    paintTheme(themeFor('auto'));
    showThemeName();
  });
}

function buildThemeGrid() {
  if (themeTiles.length) return;
  const grid = $('theme-grid');
  for (const entry of [...MODES, ...THEMES]) {
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

function previewTheme(id) {
  paintTheme(id === 'random' ? themeFor(themeChoice) : themeFor(id));
}

function visibleTiles() {
  return themeTiles.filter(tile => !tile.hidden);
}

function focusTile(tile) {
  for (const other of themeTiles) other.tabIndex = other === tile ? 0 : -1;
  tile.focus({preventScroll: true});
  tile.scrollIntoView({block: 'nearest'});
}

function filterThemes(query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const tile of themeTiles) tile.hidden = !words.every(word => tile.dataset.search.includes(word));
  const shown = visibleTiles();
  $('theme-empty').hidden = shown.length > 0;
  if (shown[0]) for (const tile of themeTiles) tile.tabIndex = tile === shown[0] ? 0 : -1;
  return shown;
}

function openThemes() {
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
  if (view === 'play' && innerWidth > 700) focusTyping();
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

// Views: word by word or line by line, from settings or Alt+L (Option+L on a Mac).
function applyView() {
  const lines = settings.view === 'line';
  setClass($('stage'), 'lines', lines);
  $('line-view').hidden = !lines;
  wordLayoutDirty = true; lastWordKey = ''; lastWordIndex = -1; renderedWord = '';
  lastLineKey = ''; lastLineRow = -1; ghostLaneKey = '';
  lineCache = {words: null, chars: 0, starts: [0]};
}

function redrawStage() {
  if (view === 'play' && game) renderGame(game.snapshot(now()));
  else if (view === 'replay') renderReplay(replay.position);
}

document.addEventListener('keydown', event => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyL') return;
  event.preventDefault();
  settings.view = settings.view === 'line' ? 'word' : 'line';
  writeLocal('settings', settings);
  applyView(); updateOptions(); redrawStage();
  toast(settings.view === 'line' ? 'line by line' : 'word by word');
});

// Music: the note button, Alt+M (Option+M on a Mac), and the choice kept on this device.
function showMusic() {
  const button = $('music-toggle');
  button.setAttribute('aria-pressed', String(musicOn));
  button.title = (musicOn ? 'Music on' : 'Music off') + ' (alt+m)';
}

function setMusic(on) {
  musicOn = on;
  writeLocal('music', on);
  showMusic();
  if (on) { music.unlock(); music.finish('hello'); }
  else music.hush();
  toast(on ? 'music on · your letters play the melody' : 'music off');
}

$('music-toggle').addEventListener('click', () => { setMusic(!musicOn); if (innerWidth > 700) focusTyping(); });
document.addEventListener('keydown', event => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyM') return;
  event.preventDefault();
  setMusic(!musicOn);
});
// Browsers only start audio from a gesture, so a returning player with music on
// wakes it with their first tap or key.
for (const type of ['pointerdown', 'keydown', 'touchend']) {
  document.addEventListener(type, () => { if (musicOn) music.unlock(); }, {capture:true, passive:true});
}
showMusic();

function frame(time) {
  // Input renders synchronously. Only the clock needs periodic refreshes; an
  // idle stage does no DOM work, while tempo keeps its smooth beat indicator.
  if (view === 'play' && game?.status === 'running' && ((selectedMode === 'tempo' && !reducedMotion) || time - lastClockPaint >= (ghost ? 50 : 100))) renderGame(game.tick(time));
  else if (view === 'replay' && replay.playing) {
    replay.position = Math.min(replayLength(), replay.anchorPosition + time - replay.anchor);
    hearReplay(replay.position);
    renderReplay(replay.position);
    if (replay.position >= replayLength()) {
      replay.playing = false; $('replay-play').textContent = 'play again';
      const ghostStats = currentResult.ghostStats;
      if (musicOn) music.finish(ghostStats ? raceOutcome(currentResult.run.stats.wpm, ghostStats.wpm).verdict : 'solo');
    }
  }
  requestAnimationFrame(frame);
}
applyView();
initThemes();
route(location.pathname,false);
requestAnimationFrame(frame);

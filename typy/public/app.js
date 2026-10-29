import { TypingGame, timedSeconds } from '/game.js';
import { generateWords, normalizePassage } from '/words.js';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const now = () => performance.now();
const pretty = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : '0';
const round1 = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 10) / 10) : '0';
const modeNames = {'30':'30 seconds','60':'60 seconds','120':'120 seconds','50':'50 words','endless':'endless','tempo':'tempo'};
const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem('typy.' + key)) ?? fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem('typy.' + key, JSON.stringify(value)); } catch {} };
const settings = {...{advance:'space',preview:true}, ...readLocal('settings', {})};
const bests = readLocal('bests', {});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  transitioning = false;
  if (freshWords && source.kind === 'common' && !ghost) passage = newCommonPassage();
  if (!passage.length) passage = newCommonPassage();
  game = new TypingGame({words:passage, mode:selectedMode, advance:ghost ? currentResult.run.advance : settings.advance, paceWpm:readLocal('lastAverage', 40)});
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
  $('finish-run').hidden = selectedMode !== 'endless' && selectedMode !== 'tempo';
  $('tempo-track').hidden = selectedMode !== 'tempo';
  $('restart-tip').hidden = false;
  updateOptions();
  renderGame(game.snapshot(now()));
  if (focus || innerWidth > 700) focusTyping();
}

function drawWord(word, buffer, index, nextWord, flags = null, previousWord = '') {
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
    const gap = Math.max(12, size * .45);
    const contextWidth = Math.max(0, stageWidth / 2 - width * size / natural / 2 - gap - 14) + 'px';
    for (const id of ['previous-context', 'upcoming']) {
      const context = $(id);
      context.style.fontSize = size + 'px';
      context.style.letterSpacing = (Number.isFinite(tracking) ? tracking * size : 0) + 'px';
      context.style.width = contextWidth;
      context.style[id === 'previous-context' ? 'right' : 'left'] = 'calc(100% + ' + gap + 'px)';
    }
    wordLayoutDirty = false;
  }
  lastWordKey = key;
  lastWordIndex = index;
  renderedWord = word;
}

function renderGame(state) {
  const previous = state.wordIndex > 0 ? game.words[(state.wordIndex - 1) % game.words.length] : '';
  drawWord(state.word, state.buffer, state.wordIndex, state.nextWord, null, previous);
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
  if (selectedMode === 'tempo') {
    const fraction = state.beatDurationMs ? Math.max(0, state.beatRemainingMs / state.beatDurationMs) : 1;
    $('tempo-progress').style.transform = 'scaleX(' + fraction + ')';
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
  }
  if (state.errors > lastErrorCount && !reducedMotion) {
    errorAnimation?.cancel();
    errorAnimation = $('word').animate([{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}], {duration:90});
  }
  lastErrorCount = state.errors;
  lastClockPaint = now();
  if (state.status === 'finished' && !transitioning) finishDisplay();
}

function press(key) {
  if (view !== 'play' || !game || document.querySelector('dialog[open]')) return;
  renderGame(game.press(key, now()));
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
  currentResult = {run,source:{...source},name:'',local:true,isBest,ghostStats};
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
  $('result-title').textContent = result.ghostStats ? (stats.wpm > result.ghostStats.wpm ? 'a little ahead of the ghost.' : 'a good race. another round?') : 'there’s your rhythm.';
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
  else if (result.ghostStats) $('result-note').textContent = 'Your ghost finished at ' + pretty(result.ghostStats.wpm) + ' wpm. Race links always use the same passage and mode.';
  else $('result-note').textContent = result.local ? 'Your result is on this device. Sharing it makes a replay link that is public: anyone who has the link can watch the run, with no account needed.' : 'This replay is public to anyone with its link. Watch the original timing, or try the same words against this ghost.';
  const slowest = stats.slowest?.slice(0, 3) || [];
  $('slow-words').innerHTML = slowest.length ? slowest.map(row => '<span class="slow-word"><span>' + escapeHTML(row.word) + '</span><small>' + round1(row.ms / 1000) + 's</small></span>').join('') : '<span>your next run starts here</span>';
  const points = stats.sparkline || [];
  if (points.length) {
    const max = Math.max(20, ...points);
    const coords = points.map((value, i) => [(i / Math.max(1, points.length - 1)) * 896 + 2, 83 - (Math.min(value, max) / max) * 70]);
    const path = coords.map((point, i) => (i ? 'L' : 'M') + point[0].toFixed(1) + ',' + point[1].toFixed(1)).join(' ');
    $('speed-chart').innerHTML = '<path d="M0 84H900" stroke="#dcded3" fill="none"/><path d="' + path + ' L898 84 L2 84 Z" fill="#e7ebdd"/><path d="' + path + '" stroke="#6d8a67" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>' + coords.filter((_, i) => i === 0 || i === coords.length - 1).map(point => '<circle cx="' + point[0] + '" cy="' + point[1] + '" r="3" fill="#e36c49"/>').join('');
  } else $('speed-chart').innerHTML = '<path d="M0 60H900" stroke="#dcded3" fill="none"/>';
  updateOptions();
  $('mode-switch').querySelectorAll('button').forEach(button => { button.disabled = false; });
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

function startReplay() {
  if (!currentResult?.run) return;
  view = 'replay';
  ghost = null;
  lastWordKey = ''; lastWordIndex = -1;
  $('result-panel').hidden = true; $('play-panel').hidden = false;
  $('input-row').hidden = true; $('replay-controls').hidden = false;
  $('ghost-race').hidden = true; $('tempo-track').hidden = true;
  $('run-status').textContent = 'a rhythm, replayed';
  $('status-dot').classList.add('active');
  $('replay-scrubber').max = Math.max(1, currentResult.run.durationMs);
  $('replay-scrubber').value = '0';
  $('time-label').textContent = 'replay'; $('time-unit').textContent = 's';
  replay = {playing:true,position:0,anchor:now(),anchorPosition:0};
  $('replay-play').textContent = 'pause';
  updateOptions();
  renderReplay(0);
}

function clock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function renderReplay(position) {
  const run = currentResult.run;
  let timing = run.wordTimings[0];
  for (const candidate of run.wordTimings) {
    if (candidate.start <= position) timing = candidate;
    else break;
  }
  const index = timing?.index || 0;
  const word = run.words[index % run.words.length];
  const flags = [];
  for (const event of run.events) {
    if (event.t > position) break;
    if (event.index !== index) continue;
    if (event.type === 'hit') flags.push(true);
    else if (event.type === 'miss') flags.push(false);
    else if (event.type === 'backspace') flags.pop();
  }
  const characters = Array.from(word);
  const buffer = flags.map((flag, i) => flag ? characters[i] || '' : '·').join('');
  const previous = index > 0 ? run.words[(index - 1) % run.words.length] : '';
  drawWord(word, buffer, index, run.words[(index + 1) % run.words.length], flags, previous);
  $('live-wpm').textContent = pretty(run.stats.wpm);
  $('live-accuracy').textContent = pretty(run.stats.accuracy);
  $('live-time').textContent = Math.floor(position / 1000);
  $('replay-scrubber').value = String(position);
  $('replay-time').textContent = clock(position) + ' / ' + clock(run.durationMs);
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
    const response = await api('/api/results', {method:'POST',body:JSON.stringify({run:currentResult.run,source:currentResult.source,name})});
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
  if (view === 'replay') replay.playing = false;
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
  if (!ghost) settings.advance = $('advance-setting').value;
  settings.preview = $('preview-setting').checked; writeLocal('settings',settings);
  $('settings-dialog').close();
  if (changed && view === 'play') beginRun({focus:true});
  else {
    updateOptions();
    if (changed && view === 'replay') renderReplay(replay.position);
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
$('replay-back').addEventListener('click', () => displayResult(currentResult));
$('replay-play').addEventListener('click', () => {
  if (replay.position >= currentResult.run.durationMs) replay.position = 0;
  replay.playing = !replay.playing; replay.anchor = now(); replay.anchorPosition = replay.position;
  $('replay-play').textContent = replay.playing ? 'pause' : 'play';
});
$('replay-scrubber').addEventListener('input', () => {
  replay.position = Number($('replay-scrubber').value); replay.anchor = now(); replay.anchorPosition = replay.position;
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

function frame(time) {
  // Input renders synchronously. Only the clock needs periodic refreshes; an
  // idle stage does no DOM work, while tempo keeps its smooth beat indicator.
  if (view === 'play' && game?.status === 'running' && (selectedMode === 'tempo' || time - lastClockPaint >= 100)) renderGame(game.tick(time));
  else if (view === 'replay' && replay.playing) {
    replay.position = Math.min(currentResult.run.durationMs, replay.anchorPosition + time - replay.anchor);
    renderReplay(replay.position);
    if (replay.position >= currentResult.run.durationMs) { replay.playing = false; $('replay-play').textContent = 'play again'; }
  }
  requestAnimationFrame(frame);
}
route(location.pathname,false);
requestAnimationFrame(frame);

// A live run: starting it, typing it, finishing it.
import { emit } from '/core/bus.js';
import { $, now, pretty, readLocal, setClass, setText, toast, writeLocal } from '/core/dom.js';
import { current, go, screen } from '/core/screens.js';
import { S, bests, coachRecorder, conductor, music, settings } from '/core/state.js';
import { shuffleTheme } from '/features/themes-ui.js';
import { raceOutcome, replayFrame, timedSeconds, TypingGame } from '/game.js';
import { updateOptions } from '/play/options.js';
import { displayResult } from '/play/result.js';
import { restart } from '/play/router.js';
import { drawWord, ghostLine } from '/play/stage.js';
import { generateWords } from '/words.js';

let lastErrorCount = 0;
let transitioning = false;
let isComposing = false;
let lastHeard = null;
let typedKey = '';

export function focusTyping() {
  if (document.querySelector('dialog[open]')) return;
  if (S.view === 'jam') $('jam-input').focus({preventScroll:true});
  else if (S.view === 'play') $('typing-input').focus({preventScroll:true});
}

export function newCommonPassage() {
  const words = generateWords(300);
  words[0] = 'breathe';
  return words;
}

export function beginRun({freshWords = false, focus = false} = {}) {
  shuffleTheme();
  transitioning = false;
  if (freshWords && S.source.kind === 'common' && !S.ghost) S.passage = newCommonPassage();
  if (!S.passage.length) S.passage = newCommonPassage();
  S.game = new TypingGame({words:S.passage, mode:S.selectedMode, advance:S.ghost ? S.currentResult.run.advance : settings.advance, paceWpm:readLocal('lastAverage', 40)});
  conductor.reset(S.game.words);
  coachRecorder.reset(S.game.words);
  lastHeard = null;
  go('play');
  S.replay.playing = false;
  S.lastWordKey = '';
  S.lastWordIndex = -1;
  S.renderedWord = '';
  S.wordLayoutDirty = true;
  lastErrorCount = 0;
  $('replay-controls').hidden = true;
  $('input-row').hidden = false;
  $('typing-input').value = '';
  $('typing-input').disabled = false;
  $('ghost-race').hidden = !S.ghost;
  $('ghost-lane').hidden = !S.ghost;
  setClass($('stage'), 'duel', false); $('race-duel').hidden = true; $('race-timeline').hidden = true;
  S.ghostLaneKey = '';
  S.ghostHeard = 0;
  if (S.ghost) { setText('ghost-lane-label', S.currentResult?.name || 'ghost'); setText('race-you-label', 'you'); setText('race-them-label', 'ghost'); }
  $('finish-run').hidden = S.selectedMode !== 'endless' && S.selectedMode !== 'tempo';
  $('tempo-track').hidden = S.selectedMode !== 'tempo';
  $('restart-tip').hidden = false;
  updateOptions();
  renderGame(S.game.snapshot(now()));
  if (focus || innerWidth > 700) focusTyping();
}

export function renderGame(state) {
  hearRun();
  const previous = state.wordIndex > 0 ? S.game.words[(state.wordIndex - 1) % S.game.words.length] : '';
  drawWord(state.word, state.buffer, state.wordIndex, state.nextWord, null, previous, state.afterNextWord);
  setText('live-wpm', pretty(state.wpm));
  setText('live-accuracy', pretty(state.accuracy));
  setClass($('status-dot'), 'active', state.status === 'running');
  if (state.status === 'ready') setText('run-status', S.ghost ? 'your ghost is ready' : S.source.kind === 'daily' ? 'same words, your rhythm' : 'a fresh start');
  else if (state.errorIndex >= 0) setText('run-status', 'a little backspace, then onward');
  else if (state.waitingForBeat) setText('run-status', 'right on time · wait for the beat');
  else setText('run-status', state.streak >= 3 ? state.streak + ' clean words in a row' : 'one word, then the next');
  const hintStart = $('run-hint').querySelector('.hint-start');
  const hint = state.status === 'ready' ? 'type the word to begin' : state.errorIndex >= 0 ? 'backspace to correct' : state.waitingForBeat ? 'hold that rhythm' : 'keep your rhythm';
  if (hintStart.textContent !== hint) hintStart.textContent = hint;
  if (timedSeconds(S.selectedMode) !== null) {
    setText('time-label', 'remaining'); setText('live-time', Math.ceil(state.remainingMs / 1000)); setText('time-unit', 's');
  } else if (S.selectedMode === '50') {
    setText('time-label', 'remaining'); setText('live-time', Math.max(0, 50 - state.completedWords)); setText('time-unit', 'words');
  } else if (S.selectedMode === 'tempo') {
    setText('time-label', 'beat pace'); setText('live-time', pretty(state.paceWpm)); setText('time-unit', 'wpm');
  } else {
    setText('time-label', 'in the flow'); setText('live-time', Math.floor(state.elapsedMs / 1000)); setText('time-unit', 's');
  }
  setClass($('word'), 'behind', Boolean(state.behindPace));
  setClass($('line-current'), 'behind', Boolean(state.behindPace));
  if (S.selectedMode === 'tempo') {
    const fraction = state.beatDurationMs ? Math.max(0, state.beatRemainingMs / state.beatDurationMs) : 1;
    // Reduced motion gets the same information in tenths, so the rail reports
    // the beat instead of sliding across the screen.
    $('tempo-progress').style.transform = 'scaleX(' + (S.reducedMotion ? Math.ceil(fraction * 10) / 10 : fraction) + ')';
    setText('tempo-caption', state.status === 'ready' ? 'type to catch the first beat' : state.waitingForBeat ? 'got it. the next beat is coming.' : state.behindPace ? 'the pace is ahead of you — keep going' : 'finish the word before the line runs out');
    Array.from($('tempo-lives').children).forEach((dot, i) => setClass(dot, 'lost', i < state.misses));
    const label = (3 - state.misses) + ' missed beats remaining';
    if ($('tempo-lives').getAttribute('aria-label') !== label) $('tempo-lives').setAttribute('aria-label', label);
  }
  if (S.ghost) {
    const completed = S.ghost.wordTimings.filter(timing => timing.completed && timing.end <= state.elapsedMs).length;
    setText('race-you', state.completedWords);
    setText('race-them', completed);
    const difference = state.completedWords - completed;
    setText('race-delta', state.status === 'ready' ? '' : difference === 0 ? 'neck and neck' : Math.abs(difference) + (difference > 0 ? ' ahead' : ' behind'));
    renderGhostLane(S.ghost, state.status === 'ready' ? 0 : state.elapsedMs);
  }
  if (state.errors > lastErrorCount && !S.reducedMotion) {
    S.errorAnimation?.cancel();
    S.errorAnimation = (settings.view === 'line' ? document.querySelector('#line-current .active') || $('word') : $('word')).animate([{transform:'translateX(0)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}], {duration:90});
  }
  lastErrorCount = state.errors;
  S.lastClockPaint = now();
  if (state.status === 'finished' && !transitioning) finishDisplay();
}

// The ghost's own run plays under the stage on the race clock, letter by letter,
// live in a race and again when the race is watched back. It rebuilds only when
// the ghost's word or letters change.
export function renderGhostLane(run, position) {
  const at = replayFrame(run, position);
  // With music on, each word the ghost finishes rings a soft ting: their pace, heard.
  if (at.index > S.ghostHeard) { if (S.musicOn && position > 0 && (S.view === 'play' || S.replay.playing)) music.ghost(); S.ghostHeard = at.index; }
  const key = at.index + '|' + at.flags.join(',') + '|' + at.done + '|' + settings.view;
  if (key === S.ghostLaneKey) return;
  S.ghostLaneKey = key;
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

export function press(key) {
  const own = current()?.press;
  if (own) { own(key); return; }
  if (S.view !== 'play' || !S.game || document.querySelector('dialog[open]')) return;
  // The coach hears which key a miss actually was; replays never store it.
  typedKey = key;
  renderGame(S.game.press(key, now()));
  typedKey = '';
}

// The game trims its oldest events on very long runs, so the new ones are found
// by looking back from the end for the last event already heard.
export function freshEvents(events, last) {
  for (let i = events.length - 1, back = 0; i >= 0 && back < 64; i--, back++) {
    if (events[i] === last) return events.slice(i + 1);
  }
  return last ? events.slice(-1) : events.slice(-64);
}

export function hearRun() {
  if (!S.game) return;
  const fresh = freshEvents(S.game.events, lastHeard);
  if (!fresh.length) return;
  lastHeard = fresh[fresh.length - 1];
  for (const event of fresh) coachRecorder.event(event, event.type === 'miss' ? typedKey : '');
  const actions = fresh.flatMap(event => conductor.event(event));
  if (!S.musicOn) return;
  // A tab that slept through several tempo beats wakes to one chord, not a pile.
  let lastChord = -1;
  actions.forEach((action, i) => { if (action.type === 'chord') lastChord = i; });
  actions.forEach((action, i) => { if (action.type !== 'chord' || i === lastChord) music.play(action); });
}

export function finishDisplay() {
  transitioning = true;
  const run = S.game.result(now());
  const previousBest = Number(bests[S.selectedMode] || 0);
  const qualifies = run.finishedReason !== 'manual' || S.selectedMode === 'endless' || S.selectedMode === 'tempo';
  const isBest = qualifies && run.stats.completedWords > 0 && run.stats.wpm > previousBest;
  if (isBest) { bests[S.selectedMode] = run.stats.wpm; writeLocal('bests', bests); }
  if (run.durationMs >= 5000 && run.stats.wpm > 0) writeLocal('lastAverage', Math.max(10, Math.min(200, run.stats.wpm)));
  const ghostStats = S.ghost?.stats;
  const ghostName = S.ghost ? S.currentResult?.name || '' : '';
  // A race keeps the ghost's run, so it can be watched back, and the result it raced.
  const ghostRun = S.ghost || null;
  const raceOf = S.ghost ? S.currentResult?.id || S.shareId || null : null;
  if (S.musicOn) music.finish(ghostStats ? raceOutcome(run.stats.wpm, ghostStats.wpm).verdict : 'solo');
  // Tempo keeps the beat's pace at the end: the speed you couldn't hold, which the coach can name.
  const tempoPeak = S.selectedMode === 'tempo' ? Math.round(S.game.paceWpm || 0) : 0;
  S.currentResult = {run,source:{...S.source},name:'',local:true,isBest,ghostStats,ghostName,ghostRun,raceOf,...(tempoPeak ? {tempoPeak} : {})};
  S.shareId = null;
  S.ghost = null;
  $('typing-input').blur();
  // The coach and the history hear about it before the card goes up, so the card can show what they made of it.
  emit('run:done', S.currentResult);
  displayResult(S.currentResult);
}

document.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.querySelector('dialog[open]')) return;
  const target = event.target;
  if (target !== $('typing-input') && target !== $('jam-input') && target.closest('input,textarea,select,[contenteditable=true]')) return;
  // Enter/Space must activate a focused control before they can be game
  // shortcuts. This keeps every toolbar and result action keyboard-accessible.
  if (target.closest('button,a') && (event.key === 'Enter' || event.key === ' ')) return;
  const own = current()?.keydown;
  if (own) { own(event); return; }
  if (event.key === 'Escape') { event.preventDefault(); restart(); return; }
  if (S.view === 'result' && event.key === 'Enter') { event.preventDefault(); restart({freshWords:S.source.kind === 'common'}); return; }
  if (S.view !== 'play') return;
  if (event.key === 'Enter' && (S.selectedMode === 'endless' || S.selectedMode === 'tempo') && S.game.status === 'running') {
    event.preventDefault(); S.game.finish(now()); finishDisplay(); return;
  }
  if (target !== $('typing-input') && target.closest('button,a')) return;
  if (event.key === 'Backspace' || Array.from(event.key).length === 1) {
    event.preventDefault(); press(event.key);
  }
});

for (const input of [$('typing-input'), $('jam-input')]) {
  input.addEventListener('compositionstart', () => { isComposing = true; });
  input.addEventListener('compositionend', event => {
    isComposing = false;
    const text = event.data || input.value;
    input.value = '';
    for (const char of text) press(char);
  });
  input.addEventListener('beforeinput', event => {
    if (event.inputType === 'deleteContentBackward') { event.preventDefault(); press('Backspace'); }
    if (event.inputType === 'insertFromPaste') { event.preventDefault(); toast(S.view === 'jam' ? 'A jam is typed, not pasted.' : 'Paste a passage in the words menu, then type it here.'); }
  });
  input.addEventListener('input', event => {
    if (isComposing || event.isComposing) return;
    const value = input.value;
    input.value = '';
    for (const char of value) press(char);
  });
  input.addEventListener('paste', event => { event.preventDefault(); toast(S.view === 'jam' ? 'A jam is typed, not pasted.' : 'Use the words menu to choose a pasted passage.'); });
}
$('stage').addEventListener('click', focusTyping);
$('finish-run').addEventListener('click', () => { if (S.game?.status === 'running') { S.game.finish(now()); finishDisplay(); } else toast('Type the first word to start your run.'); });

// Input renders synchronously. Only the clock needs periodic paints; an idle
// stage does no DOM work, while tempo keeps its smooth beat indicator.
export function playFrame(time) {
  if (S.game?.status === 'running' && ((S.selectedMode === 'tempo' && !S.reducedMotion) || time - S.lastClockPaint >= (S.ghost ? 50 : 100))) renderGame(S.game.tick(time));
}

screen('play', {panel: 'play-panel', frame: playFrame});

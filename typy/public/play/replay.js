// Replays: one run on the stage, or a race in two lanes over a timeline.
import { $, clock, now, pretty, setClass, setText } from '/core/dom.js';
import { go, screen } from '/core/screens.js';
import { S, conductor, music } from '/core/state.js';
import { raceOutcome, replayFrame } from '/game.js';
import { updateOptions } from '/play/options.js';
import { displayResult } from '/play/result.js';
import { drawWord, ghostLine } from '/play/stage.js';

let duelChars = 30;
let duelWidth = 0;
let duelKeys = {you: '', them: ''};
let replayCursor = 0;

// A race replay runs until the slower of the two runs is over.
export const replayLength = () => Math.max(S.currentResult.run.durationMs, S.currentResult.ghostRun?.durationMs || 0);
export const finishedWords = (run, position) => run.wordTimings.filter(timing => timing.completed && timing.end <= position).length;

export function startReplay() {
  if (!S.currentResult?.run) return;
  go('replay');
  S.ghost = null;
  S.lastWordKey = ''; S.lastWordIndex = -1;
  $('input-row').hidden = true; $('replay-controls').hidden = false;
  // A race replays both runs on one clock, in two lanes of the same size, over a timeline.
  const rival = S.currentResult.ghostRun || null;
  $('ghost-race').hidden = !rival; $('ghost-lane').hidden = true; $('tempo-track').hidden = true;
  S.ghostLaneKey = '';
  setClass($('stage'), 'duel', Boolean(rival));
  $('race-duel').hidden = !rival; $('race-timeline').hidden = !rival;
  duelKeys = {you: '', them: ''};
  if (rival) {
    const racer = S.currentResult.local ? 'you' : S.currentResult.name || 'anonymous';
    const rivalName = S.currentResult.ghostName || 'ghost';
    setText('race-you-label', racer); setText('duel-you-name', racer);
    setText('race-them-label', rivalName); setText('duel-them-name', rivalName);
    duelWidth = 0; measureDuel();
    drawRaceChart(S.currentResult.run, rival);
  }
  $('run-status').textContent = rival ? 'the race, replayed' : 'a rhythm, replayed';
  $('status-dot').classList.add('active');
  $('replay-scrubber').max = Math.max(1, replayLength());
  $('replay-scrubber').value = '0';
  $('time-label').textContent = 'replay'; $('time-unit').textContent = 's';
  S.replay = {playing:true,position:0,anchor:now(),anchorPosition:0};
  seekReplayMusic(0);
  $('replay-play').textContent = 'pause';
  updateOptions();
  renderReplay(0);
}

// A replay plays its run's music on the replay clock, scheduled a few hundredths
// of a second ahead so every note lands exactly where it was typed.
export function seekReplayMusic(position) {
  music.hush();
  const events = S.currentResult?.run?.events || [];
  conductor.reset(S.currentResult?.run?.words || []);
  replayCursor = 0;
  while (replayCursor < events.length && events[replayCursor].t < position) conductor.event(events[replayCursor++]);
  S.ghostHeard = S.currentResult?.ghostRun ? replayFrame(S.currentResult.ghostRun, position).index : 0;
}

export function hearReplay(position) {
  const events = S.currentResult.run.events;
  const clock = S.musicOn ? music.clock() : 0;
  while (replayCursor < events.length && events[replayCursor].t <= position + 60) {
    const event = events[replayCursor++];
    const actions = conductor.event(event);
    if (S.musicOn) for (const action of actions) music.play(action, clock + Math.max(0, event.t - position) / 1000);
  }
}

// Watching a race back: both runs in lanes of the same size, each on the line of
// the passage it has reached. Both lanes break lines the same way, so on the same
// line the gap between the two cursors is the lead. Beneath them, the timeline
// draws words finished over time for each run, and the playhead rides along it.
export function measureDuel() {
  const width = $('duel-you-words').clientWidth;
  if (!width || width === duelWidth) return;
  duelWidth = width;
  const char = $('duel-probe').getBoundingClientRect().width / 20 || 20;
  duelChars = Math.max(8, Math.floor(width / char) - 1);
  duelKeys = {you: '', them: ''};
}

export function renderLane(side, run, position) {
  const at = replayFrame(run, position);
  const key = at.index + '|' + at.flags.join(',') + '|' + at.done + '|' + duelChars;
  if (duelKeys[side] !== key) {
    duelKeys[side] = key;
    $('duel-' + side + '-words').replaceChildren(...ghostLine(run, at, duelChars));
    const finished = finishedWords(run, position);
    setText('duel-' + side + '-pace', at.done ? 'done · ' + pretty(run.stats.wpm) + ' wpm' : finished + (finished === 1 ? ' word' : ' words'));
    setClass($('duel-' + side), 'done', at.done);
  }
  return at;
}

export function drawRaceChart(run, rival) {
  const length = Math.max(1, replayLength());
  const finished = r => r.wordTimings.filter(timing => timing.completed).length;
  const top = Math.max(1, finished(run), finished(rival));
  const x = t => (Math.min(t, length) / length * 900).toFixed(1);
  const y = n => (112 - (n / top) * 104).toFixed(1);
  const steps = r => {
    let d = 'M0 112', count = 0;
    for (const timing of r.wordTimings) if (timing.completed) { count += 1; d += 'H' + x(timing.end) + 'V' + y(count); }
    return d + 'H' + x(r.durationMs);
  };
  $('race-chart').innerHTML = '<path d="M0 112H900" class="race-base"/><path d="' + steps(rival) + '" class="race-line them"/><path d="' + steps(run) + '" class="race-line you"/><path id="race-playhead" d="M0 0V120" class="race-playhead"/>';
  setText('race-axis-end', clock(length));
}

export function seekRace(event) {
  const box = $('race-chart').getBoundingClientRect();
  if (!box.width) return;
  S.replay.position = Math.round(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * replayLength());
  S.replay.anchor = now(); S.replay.anchorPosition = S.replay.position;
  seekReplayMusic(S.replay.position);
  renderReplay(S.replay.position);
}

export function renderReplay(position) {
  const run = S.currentResult.run;
  const rival = S.currentResult.ghostRun;
  if (rival) {
    renderLane('you', run, position);
    const them = renderLane('them', rival, position);
    // With music on, each word the ghost finishes rings a soft ting, as it did in the race.
    if (them.index > S.ghostHeard) { if (S.musicOn && position > 0 && S.replay.playing) music.ghost(); S.ghostHeard = them.index; }
    $('race-playhead')?.setAttribute('transform', 'translate(' + (Math.min(position, replayLength()) / Math.max(1, replayLength()) * 900).toFixed(1) + ' 0)');
    const mine = finishedWords(run, position), theirs = finishedWords(rival, position);
    setText('race-you', mine); setText('race-them', theirs);
    setText('race-delta', position <= 0 ? '' : mine === theirs ? 'neck and neck' : Math.abs(mine - theirs) + (mine > theirs ? ' ahead' : ' behind'));
  } else {
    const at = replayFrame(run, position);
    const characters = Array.from(at.word);
    const buffer = at.flags.map((flag, i) => flag ? characters[i] || '' : '·').join('');
    drawWord(at.word, buffer, at.index, at.next, at.flags, at.previous, at.afterNext);
  }
  $('live-wpm').textContent = pretty(run.stats.wpm);
  $('live-accuracy').textContent = pretty(run.stats.accuracy);
  $('live-time').textContent = Math.floor(position / 1000);
  $('replay-scrubber').value = String(position);
  $('replay-time').textContent = clock(position) + ' / ' + clock(replayLength());
}
$('replay-button').addEventListener('click', startReplay);
$('replay-back').addEventListener('click', () => { music.hush(); displayResult(S.currentResult); });
$('replay-play').addEventListener('click', () => {
  if (S.replay.position >= replayLength()) S.replay.position = 0;
  S.replay.playing = !S.replay.playing; S.replay.anchor = now(); S.replay.anchorPosition = S.replay.position;
  $('replay-play').textContent = S.replay.playing ? 'pause' : 'play';
  seekReplayMusic(S.replay.position);
});
$('replay-scrubber').addEventListener('input', () => {
  S.replay.position = Number($('replay-scrubber').value); S.replay.anchor = now(); S.replay.anchorPosition = S.replay.position;
  seekReplayMusic(S.replay.position);
  renderReplay(S.replay.position);
});
$('race-timeline').addEventListener('pointerdown', event => { if (S.view !== 'replay') return; $('race-timeline').setPointerCapture?.(event.pointerId); seekRace(event); });
$('race-timeline').addEventListener('pointermove', event => { if (S.view === 'replay' && $('race-timeline').hasPointerCapture?.(event.pointerId)) seekRace(event); });

export function stepReplay(time) {
  if (!S.replay.playing) return;
  // A frame's timestamp can be a hair older than the anchor a seek just set; time never runs backwards.
  S.replay.position = Math.min(replayLength(), S.replay.anchorPosition + Math.max(0, time - S.replay.anchor));
  hearReplay(S.replay.position);
  renderReplay(S.replay.position);
  if (S.replay.position >= replayLength()) {
    S.replay.playing = false; $('replay-play').textContent = 'play again';
    const ghostStats = S.currentResult.ghostStats;
    if (S.musicOn) music.finish(ghostStats ? raceOutcome(S.currentResult.run.stats.wpm, ghostStats.wpm).verdict : 'solo');
  }
}

screen('replay', {panel: 'play-panel', frame: stepReplay});

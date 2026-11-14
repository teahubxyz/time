// The result card after a run, and a shared result’s race.
import { S, modeNames } from '/core/state.js';
import { $, api, escapeHTML, pretty, round1, setText } from '/core/dom.js';
import { raceOutcome, timedSeconds } from '/game.js';
import { hideJam } from '/jam/jam-ui.js';
import { updateOptions } from '/play/options.js';
import { restart } from '/play/router.js';

export function displayResult(result) {
  S.view = 'result';
  S.replay.playing = false;
  S.currentResult = result;
  const run = result.run;
  const stats = run.stats;
  S.selectedMode = run.mode;
  S.source = result.source || {kind:'common'};
  S.passage = [...run.words];
  $('load-panel').hidden = true; $('play-panel').hidden = true; $('result-panel').hidden = false; hideJam();
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
  $('share-button').innerHTML = S.shareId ? 'copy result <span aria-hidden="true">↗</span>' : 'share result <span aria-hidden="true">↗</span>';
  $('race-button').textContent = result.local ? 'challenge a friend →' : 'race this →';
  $('replay-button').disabled = !run.events?.length;
  $('share-button').disabled = !run.events?.length || run.replayTruncated;
  $('race-button').disabled = !run.events?.length || run.replayTruncated;
  $('board-open').hidden = S.source.kind !== 'daily';
  if (run.replayTruncated) $('result-note').textContent = 'That was a long flow. Your score is complete; the replay holds the most recent portion, so this run cannot be shared.';
  else if (S.source.kind === 'daily' && result.local) $('result-note').textContent = 'Share your result to add it to today’s board. A name is optional, and the replay link it makes is public.';
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
export async function loadRace(result) {
  try {
    const rival = await api('/api/results/' + encodeURIComponent(result.raceOf));
    if (!rival?.run?.wordTimings?.length || !rival.run.stats) return;
    Object.assign(result, {ghostRun:rival.run, ghostStats:rival.run.stats, ghostName:rival.name || ''});
    if (S.currentResult === result && S.view === 'result') displayResult(result);
  } catch { /* the result still stands on its own */ }
}
$('again-button').addEventListener('click', () => restart({freshWords:S.source.kind === 'common'}));

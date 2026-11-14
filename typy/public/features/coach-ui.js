// The coach’s report and its practice runs.
import { S, coachStats } from '/core/state.js';
import { coachReport, emptyStats, KEYBOARD, practiceWords } from '/coach.js';
import { $, pretty, setText, spanOf, toast, writeLocal } from '/core/dom.js';
import { beginRun, focusTyping } from '/play/run.js';
import { VOCABULARY } from '/words.js';

// The coach: a closer look at your hands, from every run typed on this device.
export function renderCoach() {
  const report = coachReport(coachStats);
  const empty = !report.runs && !Object.values(report.keys).some(Boolean);
  $('coach-empty').hidden = !empty;
  $('coach-report').hidden = empty;
  setText('coach-title', empty ? 'your coach is listening.' : 'where your hands hesitate.');
  $('coach-keys').replaceChildren(...KEYBOARD.map(row => {
    const line = document.createElement('div');
    line.className = 'coach-row';
    for (const key of row) {
      const info = report.keys[key];
      const cell = spanOf(key, info ? 'coach-key' : 'coach-key unseen');
      cell.style.setProperty('--heat', info ? String(Math.round((0.06 + info.weakness * 0.82) * 100) / 100) : '0');
      cell.title = info ? key + ': ' + info.accuracy + '% accurate' + (info.ms ? ' · ' + info.ms + ' ms' : '') : key + ': not enough yet';
      line.append(cell);
    }
    return line;
  }));
  const lineOf = (...parts) => { const p = document.createElement('p'); p.className = 'coach-line'; p.append(...parts); return p; };
  $('coach-weak').replaceChildren(...(report.weakest.length
    ? report.weakest.map(item => lineOf(spanOf(item.key, 'coach-mono'), spanOf(item.accuracy + '% accurate' + (item.ms ? ' · ' + item.ms + ' ms' : ''), 'coach-dim')))
    : [lineOf(spanOf('nothing stands out yet.', 'coach-dim'))]));
  const slowest = report.pairs[0]?.ms || 1;
  $('coach-pairs').replaceChildren(...(report.pairs.length ? report.pairs.map(item => {
    const row = document.createElement('div');
    row.className = 'coach-pair';
    const track = spanOf('', 'coach-track');
    const bar = document.createElement('i');
    bar.style.width = Math.round(item.ms / slowest * 100) + '%';
    track.append(bar);
    row.append(spanOf(item.pair, 'coach-mono'), track, spanOf(item.ms + ' ms', 'coach-dim'));
    return row;
  }) : [lineOf(spanOf('a few more runs and your slow pairs show up here.', 'coach-dim'))]));
  const style = report.style;
  setText('coach-style-name', style ? style.name : 'still listening');
  setText('coach-style-line', style ? style.line : 'Type a couple of full runs and your style takes shape.');
  const facts = [];
  if (style) facts.push(['rhythm evenness', style.evenness + '%'], ['word starts vs inside', style.chunk + '×']);
  if (report.hands && report.hands.by >= 3) facts.push([report.hands.slower + ' hand', report.hands.by + '% slower']);
  const slip = report.slips[0];
  if (slip) facts.push(['usual slip', slip.target + ' → ' + slip.typed + (slip.kind === 'other' ? '' : ' (' + slip.kind + ')')]);
  $('coach-facts').replaceChildren(...facts.flatMap(([label, value]) => [spanOf(label, 'coach-dim'), spanOf(value)]));
  const points = report.progress;
  if (points.length >= 2) {
    const high = Math.max(...points), low = Math.min(...points), range = Math.max(1, high - low);
    const path = points.map((value, i) => (i ? 'L' : 'M') + (i / (points.length - 1) * 296 + 2).toFixed(1) + ',' + (52 - (value - low) / range * 46).toFixed(1)).join(' ');
    $('coach-progress').innerHTML = '<path d="' + path + '" class="chart-line" fill="none" stroke-width="2"/>';
    setText('coach-progress-note', points.length + ' runs · ' + pretty(low) + '–' + pretty(high) + ' wpm');
  } else {
    $('coach-progress').innerHTML = '';
    setText('coach-progress-note', 'a couple more runs and your trend shows up here.');
  }
  const ready = report.weakest.length || report.pairs.length;
  setText('coach-drill-label', ready ? 'drill my weak keys' : report.runs && report.missing.length ? 'fill the gaps' : report.runs ? 'take a quick check' : 'start with a quick check');
  $('coach-gaps').hidden = !ready || !report.missing.length;
  setText('coach-gaps-label', 'fill the gaps · ' + report.missing.slice(0, 6).join(' ') + (report.missing.length > 6 ? ' …' : ''));
  setText('coach-note', 'Learned from ' + report.runs + (report.runs === 1 ? ' run' : ' runs') + ' on this device. It never leaves it.');
}

export function openCoach() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  renderCoach();
  $('coach-dialog').showModal();
}

// A drill leans on your weak keys and slow pairs; filling the gaps covers the
// keys the coach has not seen enough of. Before there is any data, that is the
// quick check: every key, evenly.
export function startPractice(kind) {
  const report = coachReport(coachStats);
  const drill = kind === 'drill' && (report.weakest.length || report.pairs.length);
  // Until it knows your weak keys, the same button fills the gaps it hasn't met, or checks every key.
  const filling = !drill && report.runs > 0 && report.missing.length > 0;
  const gaps = filling ? report.missing : KEYBOARD.join('').split('');
  const focus = drill
    ? Object.fromEntries(Object.entries(report.keys).filter(([, info]) => info).map(([key, info]) => [key, info.weakness]))
    : Object.fromEntries(gaps.map(key => [key, 3]));
  S.passage = practiceWords(focus, drill ? report.pairs.map(item => item.pair) : [], VOCABULARY, 120);
  S.source = {kind: 'drill', label: drill ? 'weak-key drill' : filling ? 'filling the gaps' : 'a quick check'};
  $('coach-dialog').close();
  S.currentResult = null; S.ghost = null; S.shareId = null;
  if (S.currentPath !== '/') { history.replaceState({}, '', '/'); S.currentPath = '/'; }
  beginRun({focus:true});
}

$('footer-coach').addEventListener('click', openCoach);
$('coach-from-result').addEventListener('click', openCoach);
$('coach-drill').addEventListener('click', () => startPractice('drill'));
$('coach-gaps').addEventListener('click', () => startPractice('gaps'));
$('coach-forget').addEventListener('click', () => {
  Object.assign(coachStats, emptyStats());
  writeLocal('coach', coachStats);
  renderCoach();
  toast('coach data forgotten');
});
$('coach-dialog').addEventListener('close', focusTyping);

// History: every run and jam finished on this device, newest first. Open one to
// see its result again, replay it, or play the jam back.
import { on } from '/core/bus.js';
import { $, clock, pretty, round1, toast } from '/core/dom.js';
import { S } from '/core/state.js';
import { raceOutcome } from '/game.js';
import { addEntry, jamEntry, readHistory, runEntry, whenLabel } from '/history.js';
import { jamStats, jamText } from '/jam.js';
import { showJamResult } from '/jam/jam-ui.js';
import { modeName } from '/play/modes.js';
import { sourceName } from '/play/options.js';
import { displayResult } from '/play/result.js';
import { focusTyping } from '/play/run.js';const KEY = 'typy.history';
const NL = String.fromCharCode(10);

function stored() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
let entries = readHistory(stored());

// Local storage can fill up: history gives way, keeping its newest half, rather than break anything else.
function save() {
  if (!entries.length) { try { localStorage.removeItem(KEY); } catch {} return; }
  for (let keep = entries.length; keep > 0; keep = Math.floor(keep / 2)) {
    try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, keep))); entries = entries.slice(0, keep); return; } catch {}
  }
}

on('run:done', result => { entries = addEntry(entries, runEntry(result)); save(); });
on('jam:done', jam => { entries = addEntry(entries, jamEntry(jam)); save(); });

const preview = text => { const flat = text.split(NL).join(' / ').trim(); return flat.length > 72 ? flat.slice(0, 71) + '…' : flat; };

function row(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-row ' + entry.kind;
  button.dataset.id = entry.id;
  const title = document.createElement('span'), when = document.createElement('span'), detail = document.createElement('span');
  title.className = 'history-title'; when.className = 'history-when'; detail.className = 'history-detail';
  when.textContent = whenLabel(entry.at);
  if (entry.kind === 'jam') {
    const stats = jamStats(entry.keys);
    title.textContent = 'jam · ' + stats.notes + (stats.notes === 1 ? ' note' : ' notes') + ' · ' + clock(stats.durationMs);
    detail.textContent = preview(jamText(entry.keys));
  } else {
    const result = entry.result, stats = result.run.stats;
    const race = result.ghostStats ? raceOutcome(stats.wpm, result.ghostStats.wpm).verdict : '';
    title.textContent = pretty(stats.wpm) + ' wpm · ' + round1(stats.accuracy) + '%';
    detail.textContent = [modeName(result.run.mode), sourceName(result.source || {kind: 'common'}), race && (race === 'tied' ? 'tied race' : race + ' race'), result.isBest && 'best'].filter(Boolean).join(' · ');
  }
  button.append(title, when, detail);
  return button;
}

function renderHistory() {
  $('history-empty').hidden = entries.length > 0;
  $('history-clear').hidden = !entries.length;
  $('history-list').replaceChildren(...entries.map(row));
}

export function openHistory() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  renderHistory();
  $('history-dialog').showModal();
}

function openEntry(entry) {
  $('history-dialog').close();
  // The address follows what is open: its share link if it has one, otherwise where it was made.
  const path = entry.kind === 'jam' ? (entry.shareId ? '/j/' + entry.shareId : '/jam') : (entry.result.id ? '/r/' + entry.result.id : '/');
  history.replaceState({}, '', path);
  S.currentPath = path;
  if (entry.kind === 'jam') {
    S.jam = {keys: entry.keys, chars: [], t0: null, id: entry.shareId, name: entry.name, local: true};
    showJamResult();
    return;
  }
  S.ghost = null;
  S.shareId = entry.result.id || null;
  displayResult(entry.result);
}

$('footer-history').addEventListener('click', openHistory);
$('history-from-result').addEventListener('click', openHistory);
$('history-list').addEventListener('click', event => {
  const id = event.target.closest('.history-row')?.dataset.id;
  const entry = entries.find(item => item.id === id);
  if (entry) openEntry(entry);
});
$('history-clear').addEventListener('click', () => { entries = []; save(); renderHistory(); toast('history cleared'); });
$('history-dialog').addEventListener('close', focusTyping);

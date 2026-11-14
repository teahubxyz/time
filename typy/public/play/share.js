// Sharing a result, and the daily board.
import { S } from '/core/state.js';
import { $, api, escapeHTML, pretty, readLocal, round1, toast, writeLocal } from '/core/dom.js';
import { saveJam } from '/jam/jam-ui.js';
import { route } from '/play/router.js';

export function openShare(intent = 'result') {
  if (!S.currentResult) return;
  S.shareIntent = intent;
  $('share-create-note').textContent = 'The link makes this passage, score, and replay public. Your mistyped characters are never saved.';
  $('share-kicker').textContent = S.source.kind === 'daily' ? 'put your rhythm on the board' : 'a good rhythm is worth sharing';
  $('share-title').textContent = intent === 'race' ? 'a friendly challenge.' : 'leave a little ghost.';
  $('share-error').hidden = true;
  $('share-name').value = readLocal('name', '');
  $('share-create').hidden = Boolean(S.shareId);
  $('share-ready').hidden = !S.shareId;
  if (S.shareId) fillShareLink();
  $('share-dialog').showModal();
}

export function fillShareLink() {
  if (S.shareIntent === 'jam') {
    $('share-url').value = location.origin + '/j/' + S.jam.id;
    $('share-url-label').textContent = 'Your jam link';
    $('share-ready-note').textContent = 'Anyone with this link can play your tune back, letter by letter.';
    $('copy-link').textContent = 'copy';
    return;
  }
  $('share-url').value = location.origin + (S.shareIntent === 'race' ? '/race/' : '/r/') + S.shareId;
  $('share-url-label').textContent = S.shareIntent === 'race' ? 'Your challenge link' : 'Your result link';
  $('share-ready-note').textContent = S.shareIntent === 'race' ? 'Same words, same mode. Your friend races your original timing.' : 'Anyone with this link can watch your replay or race your ghost.';
  $('copy-link').textContent = 'copy';
}

export async function saveResult() {
  if (S.shareIntent === 'jam') return saveJam();
  if (!S.currentResult || S.shareId) return;
  const button = $('save-result');
  button.disabled = true; button.textContent = 'saving your rhythm…';
  $('share-error').hidden = true;
  try {
    const name = $('share-name').value.trim();
    const raced = S.currentResult.raceOf ? {raceOf:S.currentResult.raceOf} : {};
    const response = await api('/api/results', {method:'POST',body:JSON.stringify({run:S.currentResult.run,source:S.currentResult.source,name,...raced})});
    if (!response.id) throw new Error('The server did not return a share link. Please try again.');
    S.shareId = response.id;
    S.currentResult = {...S.currentResult,id:S.shareId,name,boardPublished:response.boardPublished};
    writeLocal('name', name);
    $('share-create').hidden = true; $('share-ready').hidden = false;
    fillShareLink();
    history.replaceState({}, '', '/r/' + S.shareId);
    S.currentPath = '/r/' + S.shareId;
    $('share-button').innerHTML = 'copy result <span aria-hidden="true">↗</span>';
    $('result-note').textContent = S.source.kind === 'daily'
      ? response.boardPublished === false
        ? 'Your replay is shared, but the daily board could not update. Your result link still works.'
        : 'Your result is shared. The daily board may take a moment to refresh.'
      : 'Your replay is ready to share.';
    if (S.source.kind === 'daily' && response.boardPublished === false) toast('Result saved. The daily board could not update this time.');
  } catch (error) {
    $('share-error').textContent = error.message;
    $('share-error').hidden = false;
  } finally { button.disabled = false; button.textContent = 'create share link ↗'; }
}

export async function copyShareLink() {
  try { await navigator.clipboard.writeText($('share-url').value); $('copy-link').textContent = 'copied ✓'; }
  catch { $('share-url').focus(); $('share-url').select(); toast('The link is selected. Copy it with your keyboard or press and hold.'); }
}

export async function loadBoard() {
  const day = S.source.day || new Date().toISOString().slice(0, 10);
  $('board-date').textContent = day + ' · midnight to midnight UTC';
  $('board-content').innerHTML = '<p class="empty-board">finding today’s rhythms…</p>';
  try {
    const response = await api('/api/board?day=' + encodeURIComponent(day));
    const entries = response.entries || [];
    $('board-content').innerHTML = entries.length ? '<ol class="board-list">' + entries.map((entry, i) => '<li><span>' + String(i + 1).padStart(2, '0') + '</span><a href="/r/' + encodeURIComponent(entry.id) + '">' + escapeHTML(entry.name || 'anonymous') + '</a><strong>' + pretty(entry.wpm) + ' wpm</strong><small>' + round1(entry.accuracy) + '%</small></li>').join('') + '</ol>' : '<p class="empty-board">No shared runs yet. Set today’s rhythm.</p>';
  } catch (error) { $('board-content').innerHTML = '<p class="inline-error">' + escapeHTML(error.message) + '</p>'; }
}

export function openBoard() { $('board-dialog').showModal(); loadBoard(); }
$('share-button').addEventListener('click', () => openShare('result'));
$('race-button').addEventListener('click', () => {
  if (S.currentResult?.local) openShare('race');
  else if (S.shareId) route('/race/' + S.shareId);
});
$('save-result').addEventListener('click', saveResult);
$('copy-link').addEventListener('click', copyShareLink);
$('share-url').addEventListener('click', () => $('share-url').select());
$('board-open').addEventListener('click', openBoard);
$('footer-board').addEventListener('click', openBoard);
$('board-refresh').addEventListener('click', loadBoard);

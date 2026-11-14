// Run options: modes, settings, and the words menu (topics, your own text, common words).
import { S, bests, jamming, settings } from '/core/state.js';
import { $, pretty, toast, writeLocal } from '/core/dom.js';
import { showMusic } from '/features/music-ui.js';
import { route, topicRoute } from '/play/router.js';
import { beginRun, focusTyping, newCommonPassage } from '/play/run.js';
import { applyView, redrawStage } from '/play/stage.js';
import { normalizePassage } from '/words.js';

export function sourceName() {
  if (S.ghost) return 'racing ' + (S.currentResult?.name || 'a friendly ghost');
  if (S.source.kind === 'topic') return (S.source.topic || '').replaceAll('-', ' ');
  if (S.source.kind === 'daily') return 'the daily · ' + (S.source.day || 'today');
  if (S.source.kind === 'drill') return S.source.label || 'weak-key drill';
  if (S.source.kind === 'paste') return 'your own words';
  return 'common words';
}

export function localBestKey() { return S.selectedMode; }
export function updateOptions() {
  const locked = S.source.kind === 'daily' || Boolean(S.ghost);
  const effectiveAdvance = S.ghost ? S.currentResult.run.advance : settings.advance;
  $('mode-switch').classList.toggle('locked', locked);
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(!jamming() && button.dataset.mode === S.selectedMode));
    button.disabled = locked || S.view === 'replay';
    button.title = locked ? (S.ghost ? 'A race uses the original run’s mode.' : 'The daily is a shared 60-second run.') : '';
  });
  $('source-label').textContent = sourceName();
  $('advance-hint').innerHTML = S.selectedMode === 'tempo' ? 'finish before the beat' : effectiveAdvance === 'letter' ? 'last letter → next word' : '<kbd>space</kbd> next word';
  if ($('upcoming').hidden === settings.preview) S.wordLayoutDirty = true;
  $('upcoming').hidden = !settings.preview;
  $('previous-context').hidden = !settings.preview || !$('previous-word').textContent;
  $('advance-setting').value = effectiveAdvance;
  $('advance-setting').disabled = Boolean(S.ghost);
  $('preview-setting').checked = settings.preview;
  $('view-setting').value = settings.view === 'line' ? 'line' : 'word';
  $('footer-board').hidden = S.source.kind !== 'daily';
  $('daily-link').setAttribute('aria-current', S.source.kind === 'daily' ? 'page' : 'false');
  $('best-score').textContent = bests[localBestKey()] ? 'device best  ' + pretty(bests[localBestKey()]) + ' wpm' : '';
  $('jam-option').setAttribute('aria-pressed', String(jamming()));
  $('source-open').hidden = jamming();
  $('restart-tip').innerHTML = '<kbd>esc</kbd> ' + (S.view === 'jam' ? 'done' : S.view === 'jam-play' ? 'skip' : S.view === 'jam-result' ? 'new jam' : 'restart');
  showMusic();
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  S.selectedMode = button.dataset.mode;
  if (S.source.kind === 'daily' || S.ghost || S.view === 'result' || jamming()) {
    S.ghost = null; S.source = {kind:'common'}; S.passage = newCommonPassage(); S.currentResult = null;
    history.pushState({}, '', '/'); S.currentPath = '/';
  }
  beginRun({freshWords:S.source.kind === 'common',focus:true});
}));
$('settings-open').addEventListener('click', () => { updateOptions(); $('settings-dialog').showModal(); });
$('settings-done').addEventListener('click', () => {
  const changed = settings.advance !== $('advance-setting').value || settings.preview !== $('preview-setting').checked;
  const nextView = $('view-setting').value === 'line' ? 'line' : 'word';
  const viewChanged = settings.view !== nextView;
  if (!S.ghost) settings.advance = $('advance-setting').value;
  settings.preview = $('preview-setting').checked; settings.view = nextView; writeLocal('settings',settings);
  $('settings-dialog').close();
  if (viewChanged) applyView();
  if (changed && S.view === 'play') beginRun({focus:true});
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
  S.routeSerial++; S.source = {kind:'paste'}; S.passage = words; S.ghost = null; S.currentResult = null; S.shareId = null;
  $('source-dialog').close(); history.pushState({}, '', '/'); S.currentPath = '/'; beginRun({focus:true});
});
$('common-start').addEventListener('click', () => route('/'));

// Jam: free play, its result, playback and sharing.
import { emit } from '/core/bus.js';
import { $, api, clock, now, readLocal, round1, setText, toast, writeLocal } from '/core/dom.js';
import { go, screen } from '/core/screens.js';
import { S, jamConductor, music } from '/core/state.js';
import { showMusic } from '/features/music-ui.js';
import { shuffleTheme } from '/features/themes-ui.js';
import { JAM, jamKey, jamStats, jamText, typeKey } from '/jam.js';
import { createJamConductor, RANGE } from '/music.js';
import { updateOptions } from '/play/options.js';
import { route } from '/play/router.js';
import { focusTyping } from '/play/run.js';
import { fillShareLink } from '/play/share.js';

let jamWarned = false;

// Jam: free play. Whatever you type is the tune. Its keys and their timing are
// the whole record, so the stats, a playback and a shared link rebuild from them.
// Leaving a playback, however it ends, stops its music.
function stopPlayback() {
  if (S.jamPlayback) { S.jamPlayback = null; music.hush(); }
}

export function newJam() {
  if (S.currentPath === '/jam') startJam();
  else route('/jam');
}

export function startJam() {
  shuffleTheme();
  go('jam');
  if (S.jamPlayback) { S.jamPlayback = null; music.hush(); }
  S.jam = {keys: [], chars: [], t0: null, id: null, name: '', local: true};
  jamWarned = false;
  jamConductor.reset();
  S.ghost = null; S.shareId = null; S.currentResult = null; S.replay.playing = false;
  $('jam-panel').classList.remove('playing');
  $('jam-dot').classList.remove('active');
  $('jam-input').value = ''; $('jam-input').disabled = false;
  setText('jam-status', 'free play · letters sing, a space changes the chord');
  setText('jam-done', 'done');
  drawJam([]);
  updateOptions();
  document.title = 'jam — typy';
  if (!S.jamMuted) music.unlock();
  focusTyping();
}

export function drawJam(chars, lit = false) {
  const box = $('jam-text');
  box.replaceChildren();
  const settled = (lit ? chars.slice(0, -1) : chars).join('');
  if (settled) box.append(settled);
  if (lit && chars.length) {
    const last = document.createElement('span');
    last.className = 'jam-lit';
    last.textContent = chars[chars.length - 1];
    box.append(last);
  }
  const caret = document.createElement('span');
  caret.className = 'jam-caret';
  box.append(caret);
  $('jam-empty').hidden = chars.length > 0;
  const chord = (S.jamPlayback ? S.jamPlayback.conductor : jamConductor).chord;
  setText('jam-chord', chord ? chord.name : '');
}

export function jamPress(key) {
  if (S.view !== 'jam' || !S.jam || !jamKey(key) || document.querySelector('dialog[open]')) return;
  if (key === 'Backspace' && !S.jam.chars.length) return;
  const time = now();
  const t = S.jam.t0 === null ? 0 : Math.round(time - S.jam.t0);
  if (S.jam.keys.length >= JAM.keys || t > JAM.ms || (key !== 'Backspace' && S.jam.chars.length >= JAM.chars)) {
    if (!jamWarned) { jamWarned = true; toast('That’s a full page. Press done to hear it back.'); }
    return;
  }
  if (S.jam.t0 === null) { S.jam.t0 = time; $('jam-dot').classList.add('active'); setText('jam-status', innerWidth > 700 ? 'jamming · esc when you’re done' : 'jamming · tap done to finish'); }
  S.jam.keys.push([t, key]);
  typeKey(S.jam.chars, key);
  const actions = jamConductor.key(key, t);
  if (!S.jamMuted) for (const action of actions) music.play(action);
  drawJam(S.jam.chars, key !== 'Backspace');
}

export function jamKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (S.view === 'jam') finishJam();
    else if (S.view === 'jam-play') endJamPlayback();
    else newJam();
    return;
  }
  if (S.view === 'jam-result') {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if ($('jam-result').classList.contains('sealed')) playJam(); else newJam();
    return;
  }
  if (S.view !== 'jam') return;
  if (event.key === 'Backspace' || event.key === 'Enter' || Array.from(event.key).length === 1) { event.preventDefault(); jamPress(event.key); }
}

export function finishJam() {
  if (!S.jam?.keys.length) { toast('Type a little first. Anything works.'); focusTyping(); return; }
  if (!S.jamMuted) music.finish('solo');
  emit('jam:done', S.jam);
  showJamResult();
}

// The song a jam makes, worked out again from its keys: every note and chord change, in time.
export function jamSong(keys) {
  const conductor = createJamConductor();
  const song = {notes: [], bars: [], ticks: []};
  for (const [t, key] of keys) {
    for (const action of conductor.key(key, t)) {
      if (action.type === 'note') song.notes.push([t, action.midi]);
      else if (action.type === 'chord') song.bars.push(t);
      else if (action.type === 'tick') song.ticks.push(t);
    }
  }
  return song;
}

export function drawRoll(song, duration) {
  const span = Math.max(1, duration);
  const x = t => (6 + (t / span) * 886).toFixed(1);
  const y = midi => (6 + ((RANGE[1] - midi) / (RANGE[1] - RANGE[0])) * 90).toFixed(1);
  $('jam-roll').innerHTML = '<path d="M0 110H900" class="chart-base"/>' +
    song.bars.map(t => '<path d="M' + x(t) + ' 2V104" class="roll-bar"/>').join('') +
    song.notes.map(([t, midi]) => '<rect x="' + x(t) + '" y="' + y(midi) + '" width="7" height="4" rx="2" class="roll-note"/>').join('') +
    song.ticks.map(t => '<rect x="' + x(t) + '" y="107" width="2" height="7" class="roll-tick"/>').join('');
}

export function showJamResult({sealed = false} = {}) {
  S.jamPlayback = null;
  go('jam-result');
  const stats = jamStats(S.jam.keys);
  const song = jamSong(S.jam.keys);
  const owner = S.jam.local ? 'your' : S.jam.name ? S.jam.name + '’s' : 'a';
  $('jam-result').classList.toggle('sealed', sealed);
  setText('jam-kicker', owner + ' jam · ' + clock(stats.durationMs) + ' · ' + stats.notes + (stats.notes === 1 ? ' note' : ' notes'));
  setText('jam-title', sealed ? (S.jam.name || 'someone') + ' made you a tune.' : S.jam.local ? 'that’s your tune.' : (S.jam.name || 'someone') + '’s tune.');
  $('jam-invite').hidden = !sealed;
  $('jam-words').textContent = jamText(S.jam.keys);
  setText('jam-wpm', stats.wpm); setText('jam-flow', stats.flowWpm); setText('jam-notes', stats.notes);
  setText('jam-chords', song.bars.length); setText('jam-longest', round1(stats.longestFlowMs / 1000));
  drawRoll(song, stats.durationMs);
  $('jam-again').hidden = sealed;
  $('jam-again').innerHTML = S.jam.local ? 'jam again <span aria-hidden="true">↵</span>' : 'jam back <span aria-hidden="true">↗</span>';
  $('jam-play').classList.toggle('primary', sealed);
  $('jam-play').innerHTML = (sealed ? 'play it' : 'play it back') + ' <span aria-hidden="true">▷</span>';
  $('jam-share').hidden = sealed;
  $('jam-share').innerHTML = (S.jam.id ? 'copy link' : 'share jam') + ' <span aria-hidden="true">↗</span>';
  setText('jam-note', sealed ? 'It plays back exactly as it was typed, so turn your sound on.' : !S.jam.local ? 'Anyone with this link can play it back. Jam back to make one of your own.' : S.jam.id ? 'Your tune is ready to share.' : 'This jam stays on this device unless you share it. A link plays your words back exactly as you typed them.');
  updateOptions();
  if (sealed) $('jam-play').focus({preventScroll:true});
}

// Playback runs on two clocks: notes are scheduled on the audio clock a little
// ahead, so they land where they were typed, and the words appear on time.
export function playJam() {
  if (!S.jam?.keys?.length) return;
  if (!S.jamMuted) music.unlock();
  music.hush();
  go('jam-play');
  $('jam-panel').classList.add('playing');
  $('jam-dot').classList.add('active');
  $('jam-input').disabled = true;
  S.jamPlayback = {keys: S.jam.keys, start: now() + 300, audio: 0, sound: 0, text: 0, chars: [], conductor: createJamConductor(), end: S.jam.keys[S.jam.keys.length - 1][0]};
  syncJamAudio();
  setText('jam-status', (S.jam.local ? 'your jam' : S.jam.name ? S.jam.name + '’s jam' : 'a jam') + ', played back');
  setText('jam-done', 'skip');
  drawJam([]);
  updateOptions();
}

export function syncJamAudio() {
  if (S.jamPlayback && !S.jamMuted) S.jamPlayback.audio = music.clock() + (S.jamPlayback.start - now()) / 1000;
}

export function stepJamPlayback(time) {
  const p = S.jamPlayback;
  const position = time - p.start;
  const late = S.jamMuted ? 0 : music.clock() - 0.25;
  while (p.sound < p.keys.length && p.keys[p.sound][0] <= position + 150) {
    const [t, key] = p.keys[p.sound++];
    const actions = p.conductor.key(key, t);
    const when = p.audio + t / 1000;
    // After a sleeping tab wakes, the notes it missed stay quiet rather than piling up.
    if (!S.jamMuted && when >= late) for (const action of actions) music.play(action, when);
  }
  let lit = null;
  while (p.text < p.keys.length && p.keys[p.text][0] <= position) {
    const key = p.keys[p.text++][1];
    typeKey(p.chars, key);
    lit = key !== 'Backspace';
  }
  if (lit !== null) drawJam(p.chars, lit);
  if (p.text >= p.keys.length && position >= p.end + 700) endJamPlayback(true);
}

export function endJamPlayback(finished = false) {
  if (!S.jamPlayback) return;
  S.jamPlayback = null;
  if (finished && !S.jamMuted) music.finish('solo'); else music.hush();
  $('jam-panel').classList.remove('playing');
  $('jam-input').disabled = false;
  showJamResult();
}

export function toggleJamSound() {
  S.jamMuted = !S.jamMuted;
  if (S.jamMuted) music.hush(); else { music.unlock(); syncJamAudio(); }
  showMusic();
  toast(S.jamMuted ? 'jam muted' : 'jam sound on');
}

export function openJamShare() {
  if (!S.jam?.keys?.length) return;
  S.shareIntent = 'jam';
  $('share-kicker').textContent = 'a tune is worth sharing';
  $('share-title').textContent = 'send it to someone.';
  $('share-create-note').textContent = 'The link makes your words, their timing and the tune public. Anyone who has it can play it back.';
  $('share-error').hidden = true;
  $('share-name').value = readLocal('name', '');
  $('share-create').hidden = Boolean(S.jam.id);
  $('share-ready').hidden = !S.jam.id;
  if (S.jam.id) fillShareLink();
  $('share-dialog').showModal();
}

export async function saveJam() {
  if (!S.jam?.keys?.length || S.jam.id) return;
  const button = $('save-result');
  button.disabled = true; button.textContent = 'saving your tune…';
  $('share-error').hidden = true;
  try {
    const name = $('share-name').value.trim();
    const response = await api('/api/jams', {method:'POST', body:JSON.stringify({jam:{version:1, keys:S.jam.keys}, name})});
    if (!response.id) throw new Error('The server did not return a share link. Please try again.');
    S.jam = {...S.jam, id:response.id, name};
    writeLocal('name', name);
    $('share-create').hidden = true; $('share-ready').hidden = false;
    fillShareLink();
    history.replaceState({}, '', '/j/' + S.jam.id);
    S.currentPath = '/j/' + S.jam.id;
    $('jam-share').innerHTML = 'copy link <span aria-hidden="true">↗</span>';
    setText('jam-note', 'Your tune is ready to share.');
  } catch (error) {
    $('share-error').textContent = error.message;
    $('share-error').hidden = false;
  } finally { button.disabled = false; button.textContent = 'create share link ↗'; }
}

$('jam-option').addEventListener('click', newJam);
$('jam-done').addEventListener('click', () => { if (S.view === 'jam-play') endJamPlayback(); else finishJam(); });
$('jam-again').addEventListener('click', newJam);
$('jam-play').addEventListener('click', playJam);
$('jam-share').addEventListener('click', openJamShare);
$('jam-stage').addEventListener('click', focusTyping);
document.addEventListener('keydown', event => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyJ') return;
  event.preventDefault();
  if (S.view !== 'jam') newJam();
});

screen('jam', {panel: 'jam-panel', keydown: jamKeydown, press: jamPress});
screen('jam-play', {panel: 'jam-panel', keydown: jamKeydown, frame: time => { if (S.jamPlayback) stepJamPlayback(time); }, leave: stopPlayback});
screen('jam-result', {panel: 'jam-result', keydown: jamKeydown});

// Music: the note button, Alt+M, and waking audio with a gesture.
import { $, toast, writeLocal } from '/core/dom.js';
import { S, jamming, music } from '/core/state.js';
import { toggleJamSound } from '/jam/jam-ui.js';
import { focusTyping } from '/play/run.js';

// Music: the note button, Alt+M (Option+M on a Mac), and the choice kept on this device.
export function showMusic() {
  const button = $('music-toggle');
  const on = jamming() ? !S.jamMuted : S.musicOn;
  button.setAttribute('aria-pressed', String(on));
  button.title = (jamming() ? (on ? 'Jam sound on' : 'Jam muted') : on ? 'Music on' : 'Music off') + ' (alt+m)';
}

export function setMusic(on) {
  S.musicOn = on;
  writeLocal('music', on);
  showMusic();
  if (on) { music.unlock(); music.finish('hello'); }
  else music.hush();
  toast(on ? 'music on · your letters play the melody' : 'music off');
}

$('music-toggle').addEventListener('click', () => { if (jamming()) toggleJamSound(); else setMusic(!S.musicOn); if (innerWidth > 700) focusTyping(); });
document.addEventListener('keydown', event => {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyM') return;
  event.preventDefault();
  if (jamming()) toggleJamSound(); else setMusic(!S.musicOn);
});
// Browsers only start audio from a gesture, so a returning player with music on
// wakes it with their first tap or key.
for (const type of ['pointerdown', 'keydown', 'touchend']) {
  document.addEventListener(type, () => { if (S.musicOn || (jamming() && !S.jamMuted)) music.unlock(); }, {capture:true, passive:true});
}
showMusic();

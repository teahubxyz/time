// Tempo's metronome. The beat sits on a steady grid of ticks (game.js): every tick gets a soft
// click, and the tick a word must be finished by gets a brighter one. Clicks are booked on the
// audio clock a little ahead, so they stay even however the frames fall, and a dot beside the
// caption pulses with them while the rail shows this beat's ticks as notches.
import { $ } from '/core/dom.js';
import { music, settings } from '/core/state.js';

const AHEAD_MS = 220;
let booked = 0;   // the last tick, on the page clock, already given to the audio clock
let pulsed = 0;   // the last tick the dot pulsed for
let gridKey = '';

/** The ticks of the beat in play, on the page clock. The last one is the beat itself. */
export function beatTicks(state) {
  if (!state?.tickMs || !state.beatTicks || state.beatDeadlineAt == null) return [];
  const start = state.beatDeadlineAt - state.beatDurationMs;
  return Array.from({length: state.beatTicks}, (_, i) => ({at: start + (i + 1) * state.tickMs, beat: i === state.beatTicks - 1}));
}

export function resetMetronome() {
  booked = 0; pulsed = 0; gridKey = '';
  $('tempo-ticks').replaceChildren();
}

export function keepTime(state, time) {
  if (state.mode !== 'tempo' || state.status !== 'running') return;
  const ticks = beatTicks(state);
  const key = state.wordIndex + '|' + state.beatTicks;
  if (key !== gridKey) { gridKey = key; drawGrid(state.beatTicks); }
  if (settings.metronome !== false) {
    const clock = music.clock();
    for (const tick of ticks) {
      if (tick.at <= booked) continue;
      if (tick.at > time + AHEAD_MS) break;
      booked = tick.at;
      // A tick the page slept through stays silent rather than arriving late.
      if (tick.at >= time - 25) music.tick(clock + Math.max(0, tick.at - time) / 1000, tick.beat);
    }
  }
  let last = null;
  for (const tick of ticks) if (tick.at <= time) last = tick;
  if (last && last.at > pulsed) { pulsed = last.at; pulse(last.beat); }
}

function drawGrid(count) {
  $('tempo-ticks').replaceChildren(...Array.from({length: Math.max(0, count - 1)}, (_, i) => {
    const mark = document.createElement('i');
    mark.style.left = ((i + 1) / count * 100) + '%';
    return mark;
  }));
}

function pulse(beat) {
  const dot = $('tempo-pulse');
  dot.classList.remove('on', 'beat');
  void dot.offsetWidth; // restart the animation
  dot.classList.add('on');
  if (beat) dot.classList.add('beat');
}

// Shared state: settings, bests, the sound engines, the coach’s data, and S, the
// mutable fields every screen reads and writes.
import { createRecorder, readStats } from '/coach.js';
import { readLocal } from '/core/dom.js';
import { createConductor, createJamConductor, createMusic } from '/music.js';

export const settings = {...{advance:'space',preview:true,view:'word'}, ...readLocal('settings', {})};
export const bests = readLocal('bests', {});
// Followed live: a visitor can turn the setting on mid-run, and the beat rail
// and the error nudge are drawn by script, out of reach of the stylesheet rule.
export const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
// Music mode (public/music.js). Off until someone turns it on; it then listens
// to the game's own event log, so live play and replays share one conductor.
export const music = createMusic();
export const conductor = createConductor();
// The coach (public/coach.js) learns from live runs on this device, and only here.
export const coachStats = readStats(readLocal('coach', null));
export const coachRecorder = createRecorder(coachStats);
// Jam: free play, where whatever you type is the tune.
export const jamConductor = createJamConductor();
export const jamming = () => S.view === 'jam' || S.view === 'jam-play' || S.view === 'jam-result';

// Shared, mutable state: every screen reads and writes these fields.
export const S = {
  reducedMotion: motionQuery.matches,
  selectedMode: '30',
  source: {kind:'common'},
  passage: [],
  game: null,
  ghost: null,
  view: 'play',
  currentResult: null,
  shareId: null,
  shareIntent: 'result',
  currentPath: '/',
  routeSerial: 0,
  lastWordKey: '',
  lastWordIndex: -1,
  renderedWord: '',
  wordLayoutDirty: true,
  errorAnimation: null,
  lastClockPaint: 0,
  replay: {playing:false,position:0,anchor:0,anchorPosition:0},
  ghostLaneKey: '',
  musicOn: readLocal('music', false) === true,
  ghostHeard: 0,
  jam: null,
  jamMuted: false,
  jamPlayback: null
};

motionQuery.addEventListener('change', event => { S.reducedMotion = event.matches; });

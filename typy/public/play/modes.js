// The ways to play. Each has a short name for the switch, a longer one for the
// result card, and a line that says how it works, shown under the switch: a new
// mode is a new entry here, and the line explains it to whoever picks it.
export const MODE_INFO = {
  '30': {name: '30 seconds', how: 'thirty seconds of words. your first letter starts the clock.'},
  '60': {name: '60 seconds', how: 'a minute of words, the length of the daily.'},
  '120': {name: '120 seconds', how: 'two minutes: long enough to find a rhythm and keep it.'},
  '50': {name: '50 words', how: 'fifty words as fast as they come. the clock stops at the last one.'},
  'endless': {name: 'endless', how: 'no clock and no end. press enter when you’re done.'},
  'tempo': {name: 'tempo', how: 'a beat sets the pace, starting from your usual speed. finish each word before its beat and the beat gets faster. miss three beats and the run ends.'}
};

export const JAM_HOW = 'type anything and it plays: letters sing, a space changes the chord, a full stop goes home. esc when you’re done.';

export const modeName = mode => MODE_INFO[mode]?.name || String(mode || '');

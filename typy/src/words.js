/** Small, frequency-biased English vocabulary. No network or content tracking. */
export const MAX_WORDS = 300;
export const MAX_WORD_LENGTH = 64;

const bands = [
  [6, 'the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were has had did been does may more'],
  [3, 'find here thing tell many through long down own world still life hand old right big place every great where help same home small number part turn need start little keep last read word run next move sound light water night day line play write point live around between without under again while before each never always thought change open close end air room story read try left feel let put mean call ask too state set three much really must high something both family leave course problem might different group begin seem country school talk show hear during house question answer study name book city eye few white today enough hard real kind public program follow head face stop once person door stand side sure such friend idea often together learn watch grow walk food hour money mother father reason morning front voice music across moment body love letter black clear bring young fact five become best least happen away large power picture line heart mind system form early right child example simple paper easy ready rhythm quiet quick fast space slow steady type finger beat sharp green blue red warm round smooth clean bright'],
  [1, 'river garden window silver ocean forest mountain summer winter spring autumn cloud stone bird moon sun rain wind tree leaf flower field coast island bridge path trail earth planet star sky shape circle square wonder dream hope memory future history science nature human language rhythm balance pattern signal planet curious delight gentle focus breathe listen calm flow spark glow fresh tiny brave clever useful true build draw smile travel explore create discover enjoy repeat practice improve notice understand imagine believe connect choose solve share follow pause rise drift shine carry reach rest repair shape learn design measure gather arrange search welcome begin finish steady quiet simple vivid mellow nimble honest warm cool sound silence orange yellow purple violet copper velvet cotton glass wood metal honey coffee tea bread apple lemon peach grape mint seed root branch shell pebble feather lantern paper pencil brush canvas poem color phrase melody canvas motion orbit puzzle magic chance wonder narrow wide deep shallow local global daily common subtle sudden patient playful perfect careful simple solid supple clear distinct fluent rapid active bright welcome hello thanks together tomorrow yesterday present minute second Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December']
];

const weightedWords = bands.flatMap(([weight, text]) =>
  text.split(/\s+/).flatMap(word => Array(weight).fill(word.toLowerCase()))
);

export function seededRandom(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0;
  return () => {
    hash = (hash + 0x6D2B79F5) >>> 0;
    let value = hash;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function generateWords(count = MAX_WORDS, seed) {
  const size = Math.max(1, Math.min(MAX_WORDS, Math.trunc(Number(count) || MAX_WORDS)));
  const random = seed === undefined ? Math.random : seededRandom(seed);
  const words = [];
  for (let index = 0; index < size; index++) {
    let next = weightedWords[Math.floor(random() * weightedWords.length)];
    // Immediate repeats are distracting; repeat the draw once, not forever.
    if (next === words[index - 1]) next = weightedWords[Math.floor(random() * weightedWords.length)];
    words.push(next);
  }
  return words;
}

/** Normalize visible passage text; return at most 300 words, each at most 64 code points. */
export function normalizePassage(text) {
  return String(text ?? '').normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2014]/g, '-')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim().split(/\s+/u).filter(Boolean).slice(0, MAX_WORDS)
    .map(word => Array.from(word).slice(0, MAX_WORD_LENGTH).join(''));
}

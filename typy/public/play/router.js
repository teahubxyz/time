// Addresses: what each path shows, loading and errors, and restarting.
import { S, music } from '/core/state.js';
import { $, api, now, pretty, toast } from '/core/dom.js';
import { hideJam, showJamResult, startJam } from '/jam/jam-ui.js';
import { updateOptions } from '/play/options.js';
import { measureDuel, renderReplay } from '/play/replay.js';
import { displayResult } from '/play/result.js';
import { beginRun, newCommonPassage, renderGame } from '/play/run.js';

export function showLoading(title, description = '') {
  S.view = 'loading';
  S.replay.playing = false;
  $('play-panel').hidden = true; $('result-panel').hidden = true; $('load-panel').hidden = false; hideJam();
  $('load-kicker').textContent = 'one moment';
  $('load-title').textContent = title; $('load-description').textContent = description;
  $('load-actions').hidden = true; $('loading-spinner').hidden = false;
}

export function showRouteError(error) {
  S.view = 'loading';
  $('load-panel').hidden = false; $('play-panel').hidden = true; $('result-panel').hidden = true; hideJam();
  $('loading-spinner').hidden = true; $('load-actions').hidden = false;
  $('load-kicker').textContent = error.status === 429 ? 'a little breathing room' : 'a small interruption';
  $('load-title').textContent = error.status === 404 ? 'that rhythm is missing.' : 'the words couldn’t land.';
  $('load-description').textContent = error.message;
}

export async function route(path, push = true) {
  const serial = ++S.routeSerial;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  if (push) history.pushState({}, '', path);
  S.currentPath = path;
  S.ghost = null; S.shareId = null;
  if (path === '/') {
    S.source = {kind:'common'};
    S.currentResult = null;
    S.passage = newCommonPassage();
    beginRun();
    document.title = 'typy — one word at a time';
    return;
  }
  if (path === '/jam' || path === '/jam/') { startJam(); return; }
  try {
    if (path === '/daily' || path === '/daily/') {
      showLoading('today’s words, for everyone.');
      const response = await api('/api/daily');
      if (serial !== S.routeSerial) return;
      S.passage = response.words;
      S.source = {kind:'daily',day:response.day};
      S.selectedMode = '60';
      S.currentResult = null;
      beginRun();
      document.title = 'the daily — typy';
    } else if (/^\/(r|race)\/[a-zA-Z0-9_-]+\/?$/.test(path)) {
      const [,kind,id] = path.split('/');
      showLoading(kind === 'race' ? 'a ghost is taking its place.' : 'finding that rhythm.');
      const response = await api('/api/results/' + encodeURIComponent(id));
      if (serial !== S.routeSerial) return;
      const result = {...response,local:false};
      if (!result.run?.words?.length || !result.run.stats) throw new Error('This replay is incomplete. Please try another result.');
      S.currentResult = result;
      S.shareId = result.id || id;
      S.source = result.source || {kind:'common'};
      S.passage = [...result.run.words];
      S.selectedMode = result.run.mode;
      if (kind === 'race') {
        S.ghost = result.run;
        beginRun();
      } else displayResult(result);
      document.title = pretty(result.run.stats.wpm) + ' wpm — typy';
    } else if (path.startsWith('/j/')) {
      const id = path.split('/')[2] || '';
      showLoading('tuning up.', 'Finding a jam somebody typed for you.');
      const response = await api('/api/jams/' + encodeURIComponent(id));
      if (serial !== S.routeSerial) return;
      if (!Array.isArray(response?.jam?.keys) || !response.jam.keys.length) throw new Error('This jam is incomplete. Please try another link.');
      S.jam = {keys: response.jam.keys, id: response.id || id, name: response.name || '', local: false};
      showJamResult({sealed: true});
      document.title = (S.jam.name ? S.jam.name + '’s jam' : 'a jam') + ' — typy';
    } else {
      const topic = decodeURIComponent(path).replace(/^\/|\/$/g, '');
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(topic)) throw Object.assign(new Error('Try a short topic with letters and hyphens, such as /react-hooks.'), {status:404});
      S.source = {kind:'topic',topic};
      updateOptions();
      showLoading('a little about ' + topic.replaceAll('-', ' ') + '.', 'Making a short passage for your next run.');
      const response = await api('/api/passage?topic=' + encodeURIComponent(topic));
      if (serial !== S.routeSerial) return;
      S.passage = response.words;
      S.source = {kind:'topic',topic:response.topic || topic};
      S.currentResult = null;
      beginRun();
      document.title = topic.replaceAll('-', ' ') + ' — typy';
    }
  } catch (error) { if (serial === S.routeSerial) showRouteError(error); }
}
export function topicRoute(topic) {
  const slug = topic.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '');
  if (!slug || ['api','r','race','daily'].includes(slug)) { toast('Try a few words about a topic, such as “the deep sea”.'); return; }
  route('/' + slug);
}

export function restart({freshWords = false} = {}) {
  if (S.view === 'loading') return;
  if (S.view === 'result' && !S.currentResult?.local) {
    S.source = {...S.currentResult.source}; S.passage = [...S.currentResult.run.words]; S.selectedMode = S.currentResult.run.mode;
  }
  if (S.view === 'replay') { S.replay.playing = false; music.hush(); }
  // A local retry gets a clean address instead of replacing somebody else's result.
  if (S.view !== 'play') {
    const target = S.source.kind === 'daily' ? '/daily' : S.source.kind === 'topic' ? '/' + S.source.topic : '/';
    history.replaceState({}, '', target); S.currentPath = target;
    S.shareId = null;
  }
  beginRun({freshWords,focus:true});
}
$('load-common').addEventListener('click', () => route('/'));
$('load-retry').addEventListener('click', () => route(S.currentPath,false));
document.addEventListener('click', event => {
  const anchor = event.target.closest('a');
  if (!anchor || anchor.target || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin) return;
  event.preventDefault(); route(url.pathname);
});
window.addEventListener('popstate', () => route(location.pathname,false));
window.addEventListener('resize', () => {
  S.wordLayoutDirty = true;
  if (S.view === 'play' && S.game) renderGame(S.game.snapshot(now()));
  else if (S.view === 'replay') { if (S.currentResult?.ghostRun) measureDuel(); renderReplay(S.replay.position); }
});

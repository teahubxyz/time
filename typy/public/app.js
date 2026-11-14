// typy: brings the modules together and runs the frame loop.
import { S, music } from '/core/state.js';
import { $ } from '/core/dom.js';
import { initThemes } from '/features/themes-ui.js';
import { raceOutcome } from '/game.js';
import { stepJamPlayback } from '/jam/jam-ui.js';
import { hearReplay, renderReplay, replayLength } from '/play/replay.js';
import { route } from '/play/router.js';
import { renderGame } from '/play/run.js';
import { applyView } from '/play/stage.js';
import '/core/ui.js';
import '/play/options.js';
import '/play/result.js';
import '/play/share.js';
import '/features/coach-ui.js';
import '/features/music-ui.js';

export function frame(time) {
  // Input renders synchronously. Only the clock needs periodic refreshes; an
  // idle stage does no DOM work, while tempo keeps its smooth beat indicator.
  if (S.view === 'play' && S.game?.status === 'running' && ((S.selectedMode === 'tempo' && !S.reducedMotion) || time - S.lastClockPaint >= (S.ghost ? 50 : 100))) renderGame(S.game.tick(time));
  else if (S.view === 'replay' && S.replay.playing) {
    // A frame's timestamp can be a hair older than the anchor a seek just set; time never runs backwards.
    S.replay.position = Math.min(replayLength(), S.replay.anchorPosition + Math.max(0, time - S.replay.anchor));
    hearReplay(S.replay.position);
    renderReplay(S.replay.position);
    if (S.replay.position >= replayLength()) {
      S.replay.playing = false; $('replay-play').textContent = 'play again';
      const ghostStats = S.currentResult.ghostStats;
      if (S.musicOn) music.finish(ghostStats ? raceOutcome(S.currentResult.run.stats.wpm, ghostStats.wpm).verdict : 'solo');
    }
  }
  else if (S.view === 'jam-play' && S.jamPlayback) stepJamPlayback(time);
  requestAnimationFrame(frame);
}
applyView();
initThemes();
route(location.pathname,false);
requestAnimationFrame(frame);

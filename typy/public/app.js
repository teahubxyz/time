// typy: brings the modules together and runs the frame loop.
import { current } from '/core/screens.js';
import { initThemes } from '/features/themes-ui.js';
import { route } from '/play/router.js';
import { applyView } from '/play/stage.js';
import '/core/ui.js';
import '/play/options.js';
import '/play/result.js';
import '/play/share.js';
import '/features/coach-ui.js';
import '/features/music-ui.js';
import '/features/history-ui.js';

// Each frame goes to whichever screen is up: the play clock, a replay, a jam playback.
export function frame(time) {
  current()?.frame?.(time);
  requestAnimationFrame(frame);
}
applyView();
initThemes();
route(location.pathname,false);
requestAnimationFrame(frame);

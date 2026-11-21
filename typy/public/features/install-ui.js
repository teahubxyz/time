// typy installs like an app. The service worker keeps it working offline, and
// an "install" button joins the footer when the browser offers to install.
// Safari on iPhone and iPad installs from the share sheet, so there it's a hint.
import { $, toast } from '/core/dom.js';

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

const button = $('install-app');
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let offer = null;

addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  offer = event;
  button.hidden = false;
});
addEventListener('appinstalled', () => {
  offer = null;
  button.hidden = true;
});
if (apple && !installed()) button.hidden = false;

button.addEventListener('click', () => {
  if (offer) {
    const shown = offer;
    offer = null;
    button.hidden = true;
    shown.prompt();
    return;
  }
  toast('tap share, then “add to home screen”.');
});

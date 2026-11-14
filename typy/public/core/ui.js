// Page-wide UI: dialogs close on a backdrop click, and the help dialog.
import { $ } from '/core/dom.js';
import { focusTyping } from '/play/run.js';

$('help-open').addEventListener('click', () => $('help-dialog').showModal());
$('help-done').addEventListener('click', () => { $('help-dialog').close(); focusTyping(); });
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});

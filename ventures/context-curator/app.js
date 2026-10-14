'use strict';
const $ = id => document.getElementById(id);
let original = SAMPLE_TEXT;
let applied = null;
let undoState = null;
let generation = 0;
const sampleConclusion = 'Root cause: preview_cache is keyed only by article ID, has no expiry, and is not invalidated on save. Invalidate that key after a successful save; verify with a save-then-preview regression test. Database writes and browser caching were ruled out. Keep the API response unchanged.';
function report(message) { $('status').textContent = message; }
function downloadsEnabled(value) {
  $('packet').disabled = !value; $('result').disabled = !value;
}
function renderSource(text) {
  const data = Curator.parse(text);
  original = text; applied = null; undoState = null;
  $('source').value = text;
  for (const id of ['first', 'last']) {
    $(id).replaceChildren(...data.messages.map((m, i) => {
      const option = document.createElement('option'); option.value = i;
      option.textContent = `${i + 1} · ${m.role} · ${m.id}`;
      return option;
    }));
  }
  $('first').value = Math.min(2, data.messages.length - 1);
  $('last').value = Math.min(7, data.messages.length - 1);
  $('conclusion').value = text === SAMPLE_TEXT ? sampleConclusion : '';
  $('before').textContent = JSON.stringify(data, null, 2);
  $('after').textContent = 'Apply a conclusion to see the complete result.';
  $('diff').textContent = 'Every message will appear here, including unchanged messages.';
  $('measure').textContent = `${Curator.bytes(JSON.stringify(data)).toLocaleString()} original JSON bytes`;
  $('undo').disabled = true; downloadsEnabled(false);
  report('Original preserved in memory. Nothing has been uploaded.');
}
function apply() {
  try {
    const next = Curator.curate(original, Number($('first').value), Number($('last').value), $('conclusion').value);
    undoState = applied; applied = next;
    renderResult(); $('undo').disabled = false;
    report('Span replaced in the working copy. Review the full diff before exporting.');
  } catch (e) { report(e.message); }
}
function renderResult() {
  if (!applied) {
    $('after').textContent = 'Working copy restored to the original.';
    $('diff').textContent = $('before').textContent;
    $('measure').textContent = `${Curator.bytes(JSON.stringify(Curator.parse(original))).toLocaleString()} original JSON bytes`;
    downloadsEnabled(false); return;
  }
  $('after').textContent = JSON.stringify(applied.result, null, 2);
  $('diff').textContent = applied.diff;
  const percent = (100 * applied.saved / applied.beforeBytes).toFixed(1);
  $('measure').textContent = `${applied.beforeBytes.toLocaleString()} → ${applied.afterBytes.toLocaleString()} JSON bytes · ${percent}% ${applied.saved >= 0 ? 'smaller' : 'reduction (growth)'} · not a token estimate`;
  downloadsEnabled(true);
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('apply').addEventListener('click', apply);
$('undo').addEventListener('click', () => { applied = undoState; undoState = null; renderResult(); $('undo').disabled = true; report('Last replacement undone. Original unchanged.'); });
$('load').addEventListener('click', () => { try { renderSource($('source').value); generation++; } catch(e) { report(e.message); } });
$('sample').addEventListener('click', () => { generation++; renderSource(SAMPLE_TEXT); apply(); });
$('file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const thisGeneration = ++generation;
  try {
    if (file.size > Curator.MAX_BYTES) throw Error('Transcript exceeds the 2 MiB limit.');
    const text = await file.text();
    if (thisGeneration === generation) renderSource(text);
  } catch(e) { report(e.message); }
  event.target.value = '';
});
$('packet').addEventListener('click', () => { if (applied) download('continuation.md', applied.packet, 'text/markdown;charset=utf-8'); });
$('result').addEventListener('click', () => { if (applied) download('curated.json', JSON.stringify(applied.result, null, 2), 'application/json'); });
$('original').addEventListener('click', () => download('original.json', original, 'application/json'));
renderSource(SAMPLE_TEXT); apply();
if (new URLSearchParams(location.search).get('joined') === '1') {
  $('thanks').hidden = false; $('join-form').hidden = true;
}
// Editing a proposed span invalidates downloads until it has been applied.
for (const id of ['first', 'last', 'conclusion']) {
  $(id).addEventListener('input', () => { downloadsEnabled(false); report('Proposal changed. Replace selected span to update the diff and exports.'); });
}

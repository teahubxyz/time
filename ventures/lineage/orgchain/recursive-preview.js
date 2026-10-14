// Trusted renderer only. Inscription JavaScript runs exclusively in the worker.
addEventListener('message', function start(event) {
  if (event.source !== parent || event.data?.type !== 'local-ord' || !event.ports[0]) return;
  removeEventListener('message', start);
  const port = event.ports[0];
  document.getElementById('markup').innerHTML = event.data.markup;
  const url = URL.createObjectURL(new Blob([event.data.worker], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.onmessage = ({ data }) => {
    if (data.type === 'render') document.getElementById('recursive-output').textContent = String(data.text).slice(0, 65536);
    else if (data.type === 'fetch') port.postMessage(data);
  };
  worker.onerror = () => { document.getElementById('recursive-output').textContent = 'Recursive script failed.'; };
  port.onmessage = ({ data }) => worker.postMessage(data);
  addEventListener('pagehide', () => { worker.terminate(); port.close(); URL.revokeObjectURL(url); }, { once: true });
});

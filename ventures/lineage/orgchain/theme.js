// Runs before first paint (a plain script, so the strict CSP still applies): apply a saved theme without a flash.
try { const t = localStorage.getItem('orgchain-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch { /* storage blocked: follow the system */ }

// update.js: an installed Havre has no address bar to refresh from, so the page notices when a new version has been
// published and offers a reload, like gandora's pill. It fingerprints the files the app is made of when it opens,
// checks again whenever it comes back to the foreground (and every ten minutes), and shows the pill when they differ.
// Checking fetches with cache: "reload", which also refreshes the browser's copies, so the reload gets the new files.
(() => {
  const FILES = ["./", "app.js", "style.css", "workflows.js", "abilities.js", "card.js", "venice.js", "memory.js",
    "threads.js", "media.js", "backup.js", "theme.js"];
  let base = null, shown = false, busy = false;
  async function print() {
    const parts = await Promise.all(FILES.map((f) => fetch(f, { cache: "reload" }).then((r) => (r.ok ? r.text() : "")).catch(() => null)));
    if (parts.some((p) => p === null)) return null;                        // offline: no verdict
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\u0000")));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function show() {
    if (shown) return;
    shown = true;
    const b = document.createElement("button");
    b.id = "upd"; b.type = "button"; b.textContent = "NEW VERSION · RELOAD";
    b.addEventListener("click", () => location.reload());
    document.body.append(b);
  }
  async function check() {
    if (busy || shown || !crypto.subtle) return;
    busy = true;
    try {
      const now = await print();
      if (!now) return;
      if (!base) base = now;
      else if (now !== base) show();
    } finally { busy = false; }
  }
  if (location.protocol !== "https:") return;
  setTimeout(check, 3000);
  setInterval(check, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
})();

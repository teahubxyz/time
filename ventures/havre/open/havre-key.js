(function () {
  try {
    var h = localStorage.getItem("havre.handoff"), handed = "";
    if (h) {
      localStorage.removeItem("havre.handoff");
      h = JSON.parse(h);
      if (h && typeof h.key === "string" && Date.now() - h.at < 60000) handed = h.key;
    }
    if (handed) { sessionStorage.setItem("venice-auth", handed); return; }
    if (sessionStorage.getItem("venice-auth")) return;
    var raw = sessionStorage.getItem("havre.key") || localStorage.getItem("havre.key");
    var key = raw ? JSON.parse(raw) : "";
    if (typeof key === "string" && key) sessionStorage.setItem("venice-auth", key);
  } catch (e) { /* no key then */ }
})();

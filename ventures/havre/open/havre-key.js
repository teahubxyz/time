(function () {
  try {
    if (sessionStorage.getItem("venice-auth")) return;
    var raw = sessionStorage.getItem("havre.key") || localStorage.getItem("havre.key");
    var key = raw ? JSON.parse(raw) : "";
    if (typeof key === "string" && key) sessionStorage.setItem("venice-auth", key);
  } catch (e) { /* no key then */ }
})();

// theme.js: light or dark, set before the page draws (so it doesn't flash), and the switch in the nav.
// "havre.theme" is "light", "dark", or absent (follow the system). /open reads the same key.
(function () {
  var root = document.documentElement, K = "havre.theme";
  function get() { try { return localStorage.getItem(K) || ""; } catch (e) { return ""; } }
  function dark() { var t = get(); return t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches); }
  function apply() {
    var t = get();
    if (t) root.setAttribute("data-theme", t); else root.removeAttribute("data-theme");
    var b = document.getElementById("theme");
    if (b) { b.textContent = dark() ? "light mode" : "dark mode"; b.setAttribute("aria-pressed", dark() ? "true" : "false"); }
  }
  apply();
  document.addEventListener("DOMContentLoaded", function () {
    apply();
    var b = document.getElementById("theme");
    if (b) b.addEventListener("click", function () { try { localStorage.setItem(K, dark() ? "light" : "dark"); } catch (e) { /* this time only */ } apply(); });
    // installed as an app there's no address bar and no pull to refresh: this is the way to the latest Havre
    var r = document.getElementById("reload");
    if (r) r.addEventListener("click", function () { r.textContent = "reloading…"; location.reload(); });
  });
})();

// Set light or dark before the page draws. "havre.theme" is shared with Havre's own page:
// "light", "dark", or absent to follow the system.
(function () {
  try {
    var t = localStorage.getItem("havre.theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* follow the system */ }
})();

// Paints the saved theme before the page first renders, so a dark theme never
// flashes light. app.js owns the theme list and rewrites this cache on change.
(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('typy.theme'));
    if (!saved) return;
    var pick = saved.id === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? saved.dark : saved.light) : saved;
    if (!pick || !pick.vars) return;
    var style = document.documentElement.style;
    for (var key in pick.vars) {
      if (/^[a-z-]+$/.test(key) && /^#[0-9a-f]{6,8}$/i.test(pick.vars[key])) style.setProperty('--' + key, pick.vars[key]);
    }
    style.colorScheme = pick.scheme === 'dark' ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && /^#[0-9a-f]{6}$/i.test(pick.vars.paper)) meta.setAttribute('content', pick.vars.paper);
  } catch (error) {}
})();

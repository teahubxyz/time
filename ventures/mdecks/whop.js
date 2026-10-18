/* Whop build only: which of the two human views this address is. The static build serves the same app at every
   /experiences/<id> and /dashboard/<id> path, so the app reads the path to know where it is.
     /dashboard/<companyId>      the creator's view: the editor with "Copy prompt for your agent"
     /experiences/<experienceId> the member's view: the editor and presenter, no agent prompt
   Anything else (the 404.html fallback on another path) is shown as the member view. */
(function () {
  "use strict";
  var view = /^\/dashboard(\/|$)/.test(location.pathname) ? "dashboard" : "member";
  document.documentElement.setAttribute("data-view", view);
  var style = document.createElement("style");
  style.textContent = 'html[data-view="member"] #agent{display:none}';
  document.head.appendChild(style);
})();

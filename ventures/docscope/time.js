/* Time's backend client for a venture page. Written by Time next to index.html; the build never edits it.
   Every call resolves to null when the backend can't help (no network, over the daily limit, or the page is being
   checked locally), so a product uses these only for extras and works fully without them.
     Time.save(obj)              -> a share link (string) or null
     Time.load()                 -> the object a share link (?s=...) carried, or null
     Time.ai(prompt, {system})   -> text from a small model, or null
     Time.ready                  -> a promise of true when the backend answers */
(function () {
  var API = "https://docscope.yolopreneur.lol/api/";
  var local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === "file:";

  function call(path, init) {
    if (local) return Promise.resolve(null);
    return fetch(API + path, init).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function post(path, body) {
    return call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  window.Time = {
    api: API,
    ready: call("health").then(function (r) { return !!(r && r.ok); }),
    save: function (obj) {
      return post("items", obj).then(function (r) { return r && r.link ? r.link : null; });
    },
    load: function () {
      var id = new URLSearchParams(location.search).get("s");
      return id && /^[a-z0-9]{6,32}$/.test(id) ? call("items/" + id) : Promise.resolve(null);
    },
    ai: function (prompt, opts) {
      return post("ai", { prompt: String(prompt || ""), system: opts && opts.system })
        .then(function (r) { return r && typeof r.text === "string" ? r.text : null; });
    }
  };
})();

/* Time's backend client for a venture page. Written by Time next to index.html; the build never edits it.
   Every call resolves to null (or false) when the backend can't help (no network, over the daily limit, or the page is
   being checked locally), so a product uses these only for extras and works fully without them.
     Time.save(obj)              -> a share link (string) or null; when someone is signed in it is also theirs
     Time.load()                 -> the object a share link (?s=...) carried, or null
     Time.ai(prompt, {system})   -> text from a small model, or null
     Time.ready                  -> a promise of true when the backend answers
   Accounts, with passkeys (Face ID, Touch ID, Windows Hello, a phone): no passwords, no email.
     Time.accounts               -> true when this page can sign people in (its own domain, a browser with passkeys)
     Time.user()                 -> { id, name } of whoever is signed in, or null
     Time.signUp(name)           -> makes an account with a new passkey and signs in: { id, name } or null
     Time.signIn()               -> signs in with a passkey made here before: { id, name } or null
     Time.signOut()              -> true
     Time.mine()                 -> [{ id, link, created }] the signed-in person saved, or null */
(function () {
  var API = "https://dollhouse.yolopreneur.lol/api/";
  var local = /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || location.protocol === "file:";
  var home = API.replace(/\/api\/?$/, "");
  var accounts = !local && location.origin === home.replace(/\/$/, "") && !!window.PublicKeyCredential;

  function call(path, init) {
    if (local) return Promise.resolve(null);
    return fetch(API + path, init).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function post(path, body) {
    return call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  }
  function bytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(s + "===".slice((s.length + 3) % 4)), function (c) { return c.charCodeAt(0); });
  }
  function text(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function user(r) { return r && r.user ? r.user : null; }

  window.Time = {
    api: API,
    accounts: accounts,
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
    },
    user: function () {
      return accounts ? call("auth/me").then(user) : Promise.resolve(null);
    },
    signUp: function (name) {
      if (!accounts) return Promise.resolve(null);
      return post("auth/register/start", { name: name }).then(function (o) {
        if (!o) return null;
        var pk = o.publicKey;
        pk.challenge = bytes(pk.challenge);
        pk.user.id = bytes(pk.user.id);
        return navigator.credentials.create({ publicKey: pk }).then(function (c) {
          var r = c.response;
          return post("auth/register/finish", {
            challengeId: o.challengeId, id: text(c.rawId), clientDataJSON: text(r.clientDataJSON),
            authenticatorData: text(r.getAuthenticatorData()), publicKey: text(r.getPublicKey()), alg: r.getPublicKeyAlgorithm()
          }).then(user);
        });
      }).catch(function () { return null; });
    },
    signIn: function () {
      if (!accounts) return Promise.resolve(null);
      return post("auth/login/start").then(function (o) {
        if (!o) return null;
        o.publicKey.challenge = bytes(o.publicKey.challenge);
        return navigator.credentials.get({ publicKey: o.publicKey }).then(function (c) {
          var r = c.response;
          return post("auth/login/finish", {
            challengeId: o.challengeId, id: text(c.rawId), clientDataJSON: text(r.clientDataJSON),
            authenticatorData: text(r.authenticatorData), signature: text(r.signature)
          }).then(user);
        });
      }).catch(function () { return null; });
    },
    signOut: function () {
      return accounts ? post("auth/logout").then(function () { return true; }) : Promise.resolve(true);
    },
    mine: function () {
      return accounts ? call("me/items").then(function (r) { return r && r.items ? r.items : null; }) : Promise.resolve(null);
    }
  };
})();

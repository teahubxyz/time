# gandora storage contract

The page keeps everything through one object, `db`, in `index.html`. Today it is IndexedDB in the browser; a backend
replaces it by implementing the same four calls and pointing `db` at the new implementation. Nothing else in the page
touches storage (`brain.js` reads through `db.all()` too).

```
db.put(row, store = "tracks")      // create or replace, keyed by row.id
db.all(store = "tracks")           // every row, newest first (tracks by `made`, stations by `last`)
db.del(id, store = "tracks")
db.open()                          // internal; a backend adapter can drop it
```

Two stores.

## tracks

```
{
  id:        "1760998800000-211979153",   // spec.made + "-" + hash32(title); stable, made by the page
  made:      1760998800000,               // ms epoch, when the DJ wrote it
  kept:      false,                       // pinned by KEEP (the only pin)
  plays:     3,                           // play starts + loop passes
  blob:      Blob,                        // the audio (FLAC from Venice, mp3 from Runware); a backend may return { url } instead
  spec: {                                 // the song on paper: enough to re-render it anywhere
    title, tags, lyrics, bpm, key, energy, line,   // what the DJ wrote (tags = the music prompt, <= 500 chars)
    seed, station, stationId,                      // where it came from
    reaction: "🔥 ❤️ \"less snare\" [skipped]",     // the listener's reactions, in order; words quoted, skips bracketed
    guess: 0.71,                                   // the taste net's prediction when it was cooked (optional)
    plays, id, made                                // mirrored for convenience
  }
}
```

## stations

```
{
  id:      "s-1760998800000-211979153",   // "s-" + ms + hash32(seed)
  seed:    "rainy trains",
  name:    "Platform Nine",               // chosen by the DJ on the first track, then stable
  taste:   { like: [...], avoid: [...], notes: [...] },   // last 8 of each, in words, fed to the DJ
  history: [ { id, title, tags, bpm, key, energy, reaction, made } ],   // last 8 tracks, no blobs
  made:    1760998800000,
  last:    1761002400000,                 // touched on every play and reaction
  played:  23
}
```

## what a backend adds

- identity: rows are per listener; `/user/station/track` links need the listener in the key
- `blob` as a URL the `<audio>` element and the Web Audio analyser can load (same-origin or CORS-enabled)
- sync: the page calls `db.all()` freely (library, taste, play counts), so cache on the client and keep `all()` cheap

## what stays on the page

The taste net (`brain.js`) trains in the browser from `db.all()` rows; it needs only `spec` + `kept` + `plays`.
Share links (`?t=`) carry a spec, not an id, so they work with no backend at all; with one, a link can carry the id
and the backend's audio instead of re-rendering.

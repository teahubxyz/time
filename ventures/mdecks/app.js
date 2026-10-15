(function () {
  "use strict";
  var src = document.getElementById("src");
  var slideEl = document.getElementById("slide");
  var counterEl = document.getElementById("counter");
  var barEl = document.getElementById("bar");
  var wrap = document.getElementById("wrap");
  var prevBtn = document.getElementById("prev");
  var nextBtn = document.getElementById("next");
  var copyBtn = document.getElementById("copy");
  var noteEl = document.getElementById("fitnote");

  var SAMPLE = [
    "# .mdeck",
    "## Slides from plain text",
    "",
    "This deck is the demo, and its source is in the editor: change a word there and watch this slide change.",
    "",
    "---",
    "# Why",
    "## A deck shouldn't take longer than the meeting",
    "",
    "- Dragging boxes isn't the job",
    "- Your words are the job",
    "- So type them, and let the slides follow",
    "",
    "---",
    "# How it works",
    "",
    "- `#` for a title, `##` for a subtitle",
    "- `-` for a point like this one",
    "- **bold**, *italic* and `code` work inline",
    "- `---` on its own line starts a new slide",
    "",
    "Any other line is a paragraph, like this one.",
    "",
    "---",
    "# Free, right now",
    "",
    "- This editor and the live preview",
    "- Arrow keys or swipe to present",
    "- **Copy deck as HTML**: one file that opens in any browser",
    "- **Copy link**: the whole deck rides inside the link",
    "- Nothing is saved or sent: your deck stays in this tab",
    "",
    "---",
    "# Who it's for",
    "",
    "Anyone who'd rather type a deck than drag one: the weekly update, the demo, the talk, the class notes.",
    "",
    "---",
    "# Pro, if you want more",
    "",
    "- Saved decks and themes",
    "- Speaker notes",
    "- PDF export",
    "- **$5/mo**, the founding price",
    "",
    "Pro isn't built yet, and nothing is charged today.",
    "",
    "---",
    "# Your turn",
    "",
    "Select everything in the editor, delete it, and type your own.",
    "Or [get early access to Pro](https://teahub.xyz/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+.mdeck&venture=mdecks&plan=Pro)."
  ].join("\n");

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inline(s) {
    var out = esc(s);
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Handle links - only http and https
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s\"'<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return out;
  }

  // Split raw text into slides on lines that are only "---".
  function splitSlides(text) {
    var lines = text.split(/\r?\n/);
    var slides = [[]];
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*---+\s*$/.test(lines[i])) {
        slides.push([]);
      } else {
        slides[slides.length - 1].push(lines[i]);
      }
    }
    return slides;
  }

  // Render one slide's lines to HTML.
  function renderSlide(lines) {
    var html = "";
    var inList = false;
    var hasContent = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.trim();
      if (t === "") {
        if (inList) { html += "</ul>"; inList = false; }
        continue;
      }
      hasContent = true;
      if (t.indexOf("## ") === 0) {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<h2>" + inline(t.slice(3)) + "</h2>";
      } else if (t.indexOf("# ") === 0) {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<h1>" + inline(t.slice(2)) + "</h1>";
      } else if (t.indexOf("- ") === 0 || t.indexOf("* ") === 0) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + inline(t.slice(2)) + "</li>";
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        html += "<p>" + inline(line) + "</p>";
      }
    }
    if (inList) html += "</ul>";
    if (!hasContent) html = '<p class="empty">(empty slide)</p>';
    return html;
  }

  // The copied deck's stylesheet. Slides are also measured with it, in a hidden frame the size of a
  // 1280x720 screen, to decide where a long slide is cut.
  var DECK_CSS =
    "*{box-sizing:border-box}html,body{height:100%;margin:0}" +
    "body{font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#0f1115;color:#e8eaf0;display:flex;flex-direction:column}" +
    ".bar{height:5px;background:#1e222b}.bar>div{height:100%;width:0;background:linear-gradient(90deg,#6ea8fe,#9d7bff);transition:width .18s ease}" +
    "main{flex:1;overflow-y:auto}" +
    ".s{display:none;--fit:1;padding:clamp(24px,6vw,64px);min-height:100%;flex-direction:column;justify-content:center;overflow-wrap:anywhere}" +
    ".s.on{display:flex}" +
    "h1{font-size:calc(clamp(1.8rem,5vw,3.2rem)*var(--fit));margin:0 0 .5em;line-height:1.15}" +
    "h2{font-size:calc(clamp(1.2rem,3vw,1.9rem)*var(--fit));color:#9aa1af;font-weight:500;margin:0 0 .6em}" +
    "ul{margin:0;padding-left:1.3em;font-size:calc(clamp(1.1rem,2.5vw,1.5rem)*var(--fit));line-height:1.7}" +
    "p{font-size:calc(clamp(1.1rem,2.5vw,1.5rem)*var(--fit));line-height:1.7;margin:.3em 0}" +
    "code{background:rgba(110,168,254,.12);border-radius:5px;padding:1px 6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}" +
    "a{color:#6ea8fe;text-decoration:none}a:hover{text-decoration:underline}" +
    ".empty{color:#9aa1af;font-style:italic}" +
    ".n{position:fixed;bottom:12px;right:16px;color:#9aa1af;font-size:.85rem;font-variant-numeric:tabular-nums}";

  var slides = [];   // the slides as typed, each a list of lines
  var deck = [];     // the slides as shown and copied: the typed ones, long ones cut
  var current = 0;

  function parse() {
    slides = splitSlides(src.value);
    if (slides.length === 0) slides = [[]];
    var cuts = [], over = [];
    deck = [];
    for (var k = 0; k < slides.length; k++) {
      var pieces = cut(slides[k]), first = deck.length + 1;
      for (var j = 0; j < pieces.length; j++) {
        deck.push(pieces[j].lines);
        if (pieces[j].over) over.push(deck.length);
      }
      if (pieces.length > 1) cuts.push([first, deck.length]);
    }
    if (current >= deck.length) current = deck.length - 1;
    if (current < 0) current = 0;
    render();
    note(cuts, over);
    scheduleLink();
  }

  function render() {
    slideEl.innerHTML = renderSlide(deck[current]);
    fit(slideEl, wrap);
    wrap.scrollTop = 0;
    counterEl.textContent = (current + 1) + " / " + deck.length;
    var pct = deck.length <= 1 ? 100 : (current / (deck.length - 1)) * 100;
    barEl.style.width = pct + "%";
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === deck.length - 1;
  }

  // Under the preview: which slides were cut, and any still too long.
  function note(cuts, over) {
    var text = "";
    if (cuts.length === 1) {
      text = "Slide " + cuts[0][0] + " was too long, so it runs onto " +
        (cuts[0][1] === cuts[0][0] + 1 ? "slide " + cuts[0][1] : "slides " + (cuts[0][0] + 1) + "–" + cuts[0][1]) +
        ". Put in a --- to choose the break yourself.";
    } else if (cuts.length > 1) {
      text = "Slides " + numbers(cuts.map(function (c) { return c[0]; })) +
        " were too long, so they run onto the slides after them. Put in a --- to choose a break yourself.";
    }
    if (over.length) {
      text += (text ? " " : "") + (over.length === 1 ? "Slide " + over[0] + " is" : "Slides " + numbers(over) + " are") +
        " too long to fit even with smaller text: shorten " + (over.length === 1 ? "its longest line." : "their longest lines.");
    }
    noteEl.hidden = !text;
    noteEl.textContent = text;
    noteEl.classList.toggle("warn", over.length > 0);
  }

  function numbers(ns) {
    return ns.length === 1 ? String(ns[0]) : ns.slice(0, -1).join(", ") + " and " + ns[ns.length - 1];
  }

  // Fit: a slide's text shrinks, never below FLOOR, until nothing has to scroll.
  var FLOOR = 0.7;

  function fits(box) {
    return box.scrollHeight <= box.clientHeight + 1;
  }

  // The text scale the slide got, or 0 when it is too long even at FLOOR.
  function fit(el, box) {
    el.style.setProperty("--fit", "1");
    if (fits(box)) return 1;
    el.style.setProperty("--fit", String(FLOOR));
    if (!fits(box)) return 0;
    var lo = FLOOR, hi = 1;
    for (var k = 0; k < 6; k++) {
      var mid = (lo + hi) / 2;
      el.style.setProperty("--fit", String(mid));
      if (fits(box)) lo = mid; else hi = mid;
    }
    el.style.setProperty("--fit", String(lo));
    return lo;
  }

  // Cut: a slide too long even at FLOOR is shown as two or more slides that fit. They are measured in a
  // hidden frame that shows the copied deck on a 1280x720 screen, so the cuts are the same on any screen
  // and in the copy. A cut falls between lines, never right after a heading, and as evenly as it can,
  // though a heading, a blank line or a change between list and text is worth a little evenness. Each
  // new slide repeats the slide's title, marked (cont.).
  var frameMain = null, frameSlide = null;
  var cutCache = Object.create(null), cached = 0;

  function makeFrame() {
    var frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("tabindex", "-1");
    frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1280px;height:720px;border:0;visibility:hidden;pointer-events:none";
    frame.addEventListener("load", function () {
      try {
        frameMain = frame.contentDocument.querySelector("main");
        frameSlide = frame.contentDocument.querySelector(".s");
      } catch (e) {
        return; // nowhere to measure: slides are not cut
      }
      cutCache = Object.create(null);
      cached = 0;
      parse();
    });
    // The page's height is set too, in case a browser grows the frame to fit what is in it.
    frame.srcdoc = "<!DOCTYPE html><html><head><style>" + DECK_CSS +
      "html{height:720px;-webkit-text-size-adjust:100%;text-size-adjust:100%}</style></head><body>" +
      '<div class="bar"><div></div></div><main><section class="s on"></section></main></body></html>';
    document.body.appendChild(frame);
  }

  function fitsAt(lines, scale) {
    frameSlide.innerHTML = renderSlide(lines);
    frameSlide.style.setProperty("--fit", String(scale));
    return fits(frameMain);
  }

  function kindOf(t) {
    if (t.indexOf("## ") === 0) return "h2";
    if (t.indexOf("# ") === 0) return "h1";
    if (t.indexOf("- ") === 0 || t.indexOf("* ") === 0) return "li";
    return "p";
  }

  function heading(block) {
    return block.kind === "h1" || block.kind === "h2";
  }

  // A typed slide as the slides it is shown as: [{lines, over}], over meaning still too long.
  function cut(lines) {
    if (!frameSlide || !frameMain) return [{ lines: lines, over: false }];
    var key = lines.join("\n");
    if (!(key in cutCache)) {
      if (++cached > 500) { cutCache = Object.create(null); cached = 1; }
      cutCache[key] = cutNow(lines);
    }
    return cutCache[key];
  }

  function cutNow(lines) {
    if (fitsAt(lines, FLOOR)) return [{ lines: lines, over: false }];
    // One block per line that isn't blank, noting a blank line before it. A leading heading is the title
    // unless a later heading is as big (then it heads a section, like the rest).
    var blocks = [], gap = false;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t === "") { gap = blocks.length > 0; continue; }
      blocks.push({ line: lines[i], kind: kindOf(t), gap: gap });
      gap = false;
    }
    var lead = blocks.length > 1 && heading(blocks[0]) ? blocks[0].kind : null;
    for (var n = 1; lead && n < blocks.length; n++) {
      if (blocks[n].kind === "h1" || blocks[n].kind === lead) lead = null;
    }
    var title = lead ? blocks[0].line.trim() : null;
    var body = title ? blocks.slice(1) : blocks, m = body.length;
    if (m < 2) return [{ lines: lines, over: true }];
    var piece = function (a, e) {
      var out = title ? [a === 0 ? title : title + " (cont.)"] : [];
      for (var i = a; i < e; i++) {
        if (body[i].gap && i > a) out.push("");
        out.push(body[i].line);
      }
      return out;
    };
    // reach[a]: body[a..reach[a]) is the most that fits on one slide starting at a (a lone line may not).
    var reach = [], end = 0;
    for (var a = 0; a < m; a++) {
      if (end < a) end = a;
      if (a === 1) while (end > a && !fitsAt(piece(a, end), FLOOR)) end--; // "(cont.)" can make the title longer
      while (end < m && fitsAt(piece(a, end + 1), FLOOR)) end++;
      reach[a] = end;
    }
    // Where each line starts at full size, to cut evenly. seam[c]: what a cut before body[c] costs in evenness,
    // nothing before a heading, a little at a blank line or between list and text, more inside a list or run.
    frameSlide.innerHTML = renderSlide(piece(0, m));
    frameSlide.style.setProperty("--fit", "1");
    var els = frameSlide.querySelectorAll("h1,h2,li,p"), skip = title ? 1 : 0, top = [], seam = [];
    for (var c = 0; c < m; c++) {
      top.push(els[c + skip].getBoundingClientRect().top);
      seam.push(c === 0 || heading(body[c]) ? 0 :
        body[c].gap || (body[c].kind === "li") !== (body[c - 1].kind === "li") ? 1 / 16 : 1 / 4);
    }
    top.push(els[m - 1 + skip].getBoundingClientRect().bottom);
    // The fewest slides it can be, with as many lines on each as fit; then as even as that many can be.
    var fewest = 0;
    for (var at = 0; at < m; fewest++) at = Math.max(reach[at], at + 1);
    var runs = null;
    for (var k = fewest; !runs && k < fewest + 4 && k <= m; k++) runs = evenly(k, body, reach, top, seam, true);
    if (!runs) runs = evenly(fewest, body, reach, top, seam, false);
    if (!runs) return [{ lines: lines, over: true }];
    return runs.map(function (r) { return { lines: piece(r[0], r[1]), over: reach[r[0]] < r[1] }; });
  }

  // body cut into k runs [a, e), each within reach, as evenly by height as it can be, at the best seams;
  // null when it can't be done. Strict: never right after a heading.
  function evenly(k, body, reach, top, seam, strict) {
    var m = body.length, target = (top[m] - top[0]) / k;
    var best = [[0]], from = [[]];
    for (var j = 1; j <= k; j++) {
      best[j] = [];
      from[j] = [];
      for (var e = j; e <= m; e++) {
        best[j][e] = Infinity;
        if (strict && e < m && heading(body[e - 1])) continue;
        for (var a = e - 1; a >= j - 1; a--) {
          if (e > Math.max(reach[a], a + 1)) {
            if (a === 1) continue; // reach can dip from 0 to 1, where "(cont.)" joins the title
            break;
          }
          if (!(best[j - 1][a] < Infinity)) continue;
          var d = top[e] - top[a] - target;
          var cost = best[j - 1][a] + d * d + (e < m ? seam[e] * target * target : 0);
          if (cost < best[j][e]) { best[j][e] = cost; from[j][e] = a; }
        }
      }
    }
    if (!(best[k][m] < Infinity)) return null;
    var runs = [];
    for (var i = k, stop = m; i >= 1; i--) {
      runs.unshift([from[i][stop], stop]);
      stop = from[i][stop];
    }
    return runs;
  }

  function go(delta) {
    var next = current + delta;
    if (next < 0 || next > deck.length - 1) return;
    current = next;
    render();
  }

  src.addEventListener("input", parse);
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { fit(slideEl, wrap); }, 100);
  });
  prevBtn.addEventListener("click", function () { go(-1); });
  nextBtn.addEventListener("click", function () { go(1); });

  document.addEventListener("keydown", function (e) {
    if (e.target === src) return; // don't steal keys while typing
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    else if (e.key === "Home") { current = 0; render(); }
    else if (e.key === "End") { current = deck.length - 1; render(); }
  });

  // Swipe navigation.
  var touchX = null;
  wrap.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener("touchend", function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  // Links: the deck's text travels in the link after "#", which browsers never send to a server, so
  // nothing is stored. #d= is the text deflated (raw) and base64url-encoded; #md= is the text
  // percent-encoded, for anything that can't compress. The README shows how to make either.
  var linkBtn = document.getElementById("link");
  var linkNote = document.getElementById("linknote");
  var linkFor = null, link = null, linkTimer = null;

  function say(text, warn) {
    linkNote.hidden = !text;
    linkNote.textContent = text || "";
    linkNote.classList.toggle("warn", !!warn);
  }

  function base64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function unbase64url(text) {
    var s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  function through(data, transform) {
    return new Response(new Blob([data]).stream().pipeThrough(transform));
  }

  // A link to this text, as a promise.
  function makeLink(text) {
    var base = location.href.split("#")[0];
    if (typeof CompressionStream !== "function") return Promise.resolve(base + "#md=" + encodeURIComponent(text));
    return through(text, new CompressionStream("deflate-raw")).arrayBuffer().then(function (buf) {
      return base + "#d=" + base64url(new Uint8Array(buf));
    });
  }

  // A link to the deck is kept ready, so a click copies it at once: some browsers only let a page
  // copy while it is still answering the click.
  function scheduleLink() {
    clearTimeout(linkTimer);
    linkTimer = setTimeout(function () {
      var text = src.value;
      makeLink(text).then(function (url) { linkFor = text; link = url; });
    }, 250);
  }

  // The deck in a "#", as a promise of its text, or null when there is none.
  function readLink(hash) {
    var params = new URLSearchParams(hash.replace(/^#/, ""));
    if (params.has("md")) return Promise.resolve(params.get("md"));
    if (!params.has("d")) return null;
    return Promise.resolve(params.get("d")).then(function (data) {
      if (typeof DecompressionStream !== "function") throw new Error("no DecompressionStream");
      return through(unbase64url(data), new DecompressionStream("deflate-raw")).text();
    });
  }

  function openLink() {
    var reading = readLink(location.hash);
    if (!reading) return;
    reading.then(function (text) {
      load(text);
      current = 0;
      parse();
      say("Opened from a link. Edits stay in this tab; copy a new link to share them.");
    }, function () {
      if (!src.value) { load(SAMPLE); parse(); }
      say("This link's deck couldn't be opened. It may have been cut short on the way.", true);
    });
  }

  // Put text in the editor, showing its start.
  function load(text) {
    src.value = text;
    src.scrollTop = 0;
  }

  function share(url) {
    history.replaceState(null, "", url);
    say(url.length > 8000 ? "This link is " + url.length.toLocaleString("en") + " characters long. Some apps " +
      "cut links that long short; the HTML copy travels anywhere." : "");
    copyText(url, linkBtn, "Link copied!", function () {
      say("Couldn't copy here, but the link is in the address bar.", true);
    });
  }

  linkBtn.addEventListener("click", function () {
    var text = src.value;
    if (linkFor === text) share(link);
    else makeLink(text).then(share);
  });

  // Build the self-contained export deck: the slides as shown, cuts and all.
  function buildExport() {
    var slidesHtml = deck.map(function (s) {
      return '<section class="s">' + renderSlide(s) + "</section>";
    }).join("\n");
    return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
      "<title>Deck — .mdeck</title>\n<style>\n" + DECK_CSS +
      "\n</style>\n</head>\n<body>\n<div class=\"bar\"><div id=\"b\"></div></div>\n<main>\n" +
      slidesHtml +
      "\n</main>\n<div class=\"n\" id=\"n\"></div>\n<script>\n" +
      "var s=document.querySelectorAll('.s'),i=0,n=document.getElementById('n'),b=document.getElementById('b');\n" +
      "function show(){for(var k=0;k<s.length;k++)s[k].classList.toggle('on',k===i);n.textContent=(i+1)+' / '+s.length;b.style.width=(s.length<=1?100:i/(s.length-1)*100)+'%';fit(s[i]);}\n" +
      "var F=0.7,m=document.querySelector('main');function ok(){return m.scrollHeight<=m.clientHeight+1;}\n" +
      "function fit(e){e.style.setProperty('--fit','1');if(ok())return;e.style.setProperty('--fit',String(F));if(!ok())return;var lo=F,hi=1;for(var k=0;k<6;k++){var md=(lo+hi)/2;e.style.setProperty('--fit',String(md));if(ok())lo=md;else hi=md;}e.style.setProperty('--fit',String(lo));}\n" +
      "window.addEventListener('resize',function(){fit(s[i]);});\n" +
      "function go(d){var j=i+d;if(j<0||j>s.length-1)return;i=j;show();}\n" +
      "document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();go(1);}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();go(-1);}else if(e.key==='Home'){i=0;show();}else if(e.key==='End'){i=s.length-1;show();}});\n" +
      "var x=null;document.addEventListener('touchstart',function(e){x=e.touches[0].clientX;},{passive:true});" +
      "document.addEventListener('touchend',function(e){if(x===null)return;var d=e.changedTouches[0].clientX-x;if(Math.abs(d)>40)go(d<0?1:-1);x=null;},{passive:true});\n" +
      "show();\n<\/script>\n</body>\n</html>";
  }

  copyBtn.addEventListener("click", function () {
    copyText(buildExport(), copyBtn, "Copied!");
  });

  // Copy, then say so on the button for a moment; failed (optional) runs when the browser won't copy.
  function copyText(text, button, label, failed) {
    var done = function () {
      if (!button.dataset.label) button.dataset.label = button.textContent;
      button.textContent = label;
      clearTimeout(button.labelTimer);
      button.labelTimer = setTimeout(function () { button.textContent = button.dataset.label; }, 1500);
    };
    var fallback = function () { fallbackCopy(text, done, failed || function () {}); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function fallbackCopy(text, done, failed) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var copied = false;
    try { copied = document.execCommand("copy"); } catch (e) { copied = false; }
    document.body.removeChild(ta);
    if (copied) done(); else failed();
  }

  // A deck in the address opens in place of the sample, and so does one pasted into it later.
  var linked = /(^#|&)(d|md)=/.test(location.hash);
  load(linked ? "" : SAMPLE);
  makeFrame();
  parse();
  if (linked) openLink();
  window.addEventListener("hashchange", openLink);
})();
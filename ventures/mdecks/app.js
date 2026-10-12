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

  var SAMPLE = [
    "# .mdeck",
    "## Plain text in, clean slides out",
    "",
    "- Type markdown-ish slides in the editor",
    "- Live preview renders on the right",
    "- Navigate with arrow keys or swipe",
    "- Copy as self-contained HTML",
    "",
    "---",
    "# How it works",
    "",
    "- `# Title` and `## Subtitle`",
    "- `- bullet` points or `* bullet`",
    "- `---` on its own line starts a new slide",
    "- Inline **bold**, *italic*, and `code`",
    "- Plain lines become paragraphs",
    "",
    "---",
    "# Free tier ($0)",
    "",
    "- Full plain-text editor",
    "- Live navigable preview",
    "- Arrow keys + progress bar",
    "- One-click HTML export",
    "- Nothing saved or sent",
    "",
    "---",
    "# Pro tier ($5/mo)",
    "",
    "- Saved decks",
    "- Themes",
    "- Speaker notes",
    "- PDF export",
    "- Shareable links",
    "",
    "---",
    "# Who it's for",
    "",
    "- Weekly status updates",
    "- Sprint demos",
    "- Lunch talks",
    "- Class notes",
    "- Anyone who'd rather type than drag boxes",
    "",
    "---",
    "# Try it now",
    "",
    "Edit this deck to try the syntax:",
    "- Change this bullet",
    "- Add another slide with `---`",
    "- Make text **bold** or *italic*",
    "",
    "[Join early access](https://github.com/teahubxyz/time/issues/new?template=early-access.yml&title=Early+access%3A+.mdeck&venture=mdecks&plan=Pro)"
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
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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

  var slides = [];
  var current = 0;

  function parse() {
    slides = splitSlides(src.value);
    if (slides.length === 0) slides = [[]];
    if (current >= slides.length) current = slides.length - 1;
    if (current < 0) current = 0;
    render();
  }

  function render() {
    slideEl.innerHTML = renderSlide(slides[current]);
    counterEl.textContent = (current + 1) + " / " + slides.length;
    var pct = slides.length <= 1 ? 100 : (current / (slides.length - 1)) * 100;
    barEl.style.width = pct + "%";
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === slides.length - 1;
  }

  function go(delta) {
    var next = current + delta;
    if (next < 0 || next > slides.length - 1) return;
    current = next;
    render();
  }

  src.addEventListener("input", parse);
  prevBtn.addEventListener("click", function () { go(-1); });
  nextBtn.addEventListener("click", function () { go(1); });

  document.addEventListener("keydown", function (e) {
    if (e.target === src) return; // don't steal keys while typing
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    else if (e.key === "Home") { current = 0; render(); }
    else if (e.key === "End") { current = slides.length - 1; render(); }
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

  // Build the self-contained export deck.
  function buildExport() {
    var slidesHtml = slides.map(function (s) {
      return '<section class="s">' + renderSlide(s) + "</section>";
    }).join("\n");
    return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
      "<title>Deck — .mdeck</title>\n<style>\n" +
      "*{box-sizing:border-box}html,body{height:100%;margin:0}" +
      "body{font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#0f1115;color:#e8eaf0;display:flex;flex-direction:column}" +
      ".bar{height:5px;background:#1e222b}.bar>div{height:100%;width:0;background:linear-gradient(90deg,#6ea8fe,#9d7bff);transition:width .18s ease}" +
      "main{flex:1;overflow-y:auto}" +
      ".s{display:none;padding:clamp(24px,6vw,64px);min-height:100%;flex-direction:column;justify-content:center}" +
      ".s.on{display:flex}" +
      "h1{font-size:clamp(1.8rem,5vw,3.2rem);margin:0 0 .5em;line-height:1.15}" +
      "h2{font-size:clamp(1.2rem,3vw,1.9rem);color:#9aa1af;font-weight:500;margin:0 0 .6em}" +
      "ul{margin:0;padding-left:1.3em;font-size:clamp(1.1rem,2.5vw,1.5rem);line-height:1.7}" +
      "p{font-size:clamp(1.1rem,2.5vw,1.5rem);line-height:1.7;margin:.3em 0}" +
      "code{background:rgba(110,168,254,.12);border-radius:5px;padding:1px 6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}" +
      "a{color:#6ea8fe;text-decoration:none}a:hover{text-decoration:underline}" +
      ".empty{color:#9aa1af;font-style:italic}" +
      ".n{position:fixed;bottom:12px;right:16px;color:#9aa1af;font-size:.85rem;font-variant-numeric:tabular-nums}" +
      "\n</style>\n</head>\n<body>\n<div class=\"bar\"><div id=\"b\"></div></div>\n<main>\n" +
      slidesHtml +
      "\n</main>\n<div class=\"n\" id=\"n\"></div>\n<script>\n" +
      "var s=document.querySelectorAll('.s'),i=0,n=document.getElementById('n'),b=document.getElementById('b');\n" +
      "function show(){for(var k=0;k<s.length;k++)s[k].classList.toggle('on',k===i);n.textContent=(i+1)+' / '+s.length;b.style.width=(s.length<=1?100:i/(s.length-1)*100)+'%';}\n" +
      "function go(d){var j=i+d;if(j<0||j>s.length-1)return;i=j;show();}\n" +
      "document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();go(1);}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();go(-1);}else if(e.key==='Home'){i=0;show();}else if(e.key==='End'){i=s.length-1;show();}});\n" +
      "var x=null;document.addEventListener('touchstart',function(e){x=e.touches[0].clientX;},{passive:true});" +
      "document.addEventListener('touchend',function(e){if(x===null)return;var d=e.changedTouches[0].clientX-x;if(Math.abs(d)>40)go(d<0?1:-1);x=null;},{passive:true});\n" +
      "show();\n<\/script>\n</body>\n</html>";
  }

  copyBtn.addEventListener("click", function () {
    var html = buildExport();
    var done = function () {
      var old = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      setTimeout(function () { copyBtn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(html).then(done, function () { fallbackCopy(html, done); });
    } else {
      fallbackCopy(html, done);
    }
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* give up quietly */ }
    document.body.removeChild(ta);
  }

  src.value = SAMPLE;
  parse();
})();
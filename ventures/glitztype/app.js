// Glitztype App Logic
// The preloaded sample and a typed word share one path: state goes through
// renderPreview(), which draws on canvas. A share URL encodes that full state
// locally (base64url in ?s=) so a friend opens the exact same piece. Time.save
// is only an extra; the copied link never depends on a server id.

(function () {
  const trySection = document.getElementById("try");
  if (!trySection) return;

  const SAMPLE = {
    text: "Nadia",
    style: "rainbow",
    font: "Impact",
    bend: 8,
    colors: {
      rainbow: ["#ff0000", "#ff8800", "#ffff00", "#00cc44", "#0088ff", "#cc00ff"],
      chrome: "#d8d8e0",
      neon: "#39ff14",
      arch: "#ff6600",
      gradient: "#ff2bd6",
      shadow: "#1a1a2e",
      outline: "#ff1744",
      italic: "#0066cc",
      bold: "#222222",
      wave: "#9932cc",
      stripe: "#ff4500",
      glow: "#ffd700"
    }
  };

  const FONTS = [
    "Arial",
    "Courier New",
    "Georgia",
    "Impact",
    "Verdana",
    "Comic Sans MS",
    "Times New Roman"
  ];

  const STYLE_KEYS = [
    "rainbow", "chrome", "neon", "arch", "gradient", "shadow",
    "outline", "italic", "bold", "wave", "stripe", "glow"
  ];

  let currentText = SAMPLE.text;
  let currentStyle = SAMPLE.style;
  let currentFont = SAMPLE.font;
  let currentBend = SAMPLE.bend;
  let currentColors = cloneColors(SAMPLE.colors);

  // Sample styles mimicking WordArt - a dozen clean-room treatments
  const styles = {
    rainbow: {
      name: "Rainbow Gradient",
      draw: function (ctx, text, x, y, fontSize) {
        const width = Math.max(ctx.measureText(text).width, fontSize);
        const gradient = ctx.createLinearGradient(x - width / 2, y, x + width / 2, y);
        const colors = Array.isArray(currentColors.rainbow) ? currentColors.rainbow : SAMPLE.colors.rainbow;
        for (let i = 0; i < colors.length; i++) {
          gradient.addColorStop(i / (colors.length - 1), colors[i]);
        }
        ctx.fillStyle = gradient;
        ctx.fillText(text, x, y);
      }
    },
    chrome: {
      name: "Chrome",
      draw: function (ctx, text, x, y, fontSize) {
        const width = Math.max(ctx.measureText(text).width, fontSize);
        const gradient = ctx.createLinearGradient(x - width / 2, y - fontSize, x + width / 2, y + fontSize / 2);
        const base = colorOf("chrome", "#c0c0c0");
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.35, base);
        gradient.addColorStop(0.55, "#6e6e78");
        gradient.addColorStop(0.75, "#f4f4f8");
        gradient.addColorStop(1, "#8a8a96");
        ctx.strokeStyle = "#2a2a32";
        ctx.lineWidth = Math.max(2, fontSize / 18);
        ctx.strokeText(text, x, y);
        ctx.fillStyle = gradient;
        ctx.fillText(text, x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1;
        ctx.strokeText(text, x, y - 1);
      }
    },
    neon: {
      name: "Neon Outline",
      draw: function (ctx, text, x, y, fontSize) {
        const neon = colorOf("neon", "#00ffff");
        ctx.shadowColor = neon;
        ctx.shadowBlur = fontSize / 3;
        ctx.strokeStyle = neon;
        ctx.lineWidth = Math.max(3, fontSize / 12);
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);
        ctx.shadowBlur = fontSize / 6;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = "#050510";
        ctx.shadowBlur = 0;
        ctx.fillText(text, x, y);
      }
    },
    arch: {
      name: "Arch",
      draw: function (ctx, text, x, y, fontSize) {
        ctx.fillStyle = colorOf("arch", "#ff6600");
        ctx.font = `bold ${fontSize}px ${currentFont}`;
        const chars = text.split("");
        const arcRadius = Math.max(fontSize * 1.6, chars.length * fontSize * 0.42);
        const spread = Math.min(Math.PI * 0.85, Math.max(0.4, chars.length * 0.28));
        const start = Math.PI / 2 + spread / 2;
        const angleStep = chars.length > 1 ? spread / (chars.length - 1) : 0;
        for (let i = 0; i < chars.length; i++) {
          const angle = start - angleStep * i;
          const charX = x + Math.cos(angle) * arcRadius;
          const charY = y + fontSize * 0.35 - Math.sin(angle) * arcRadius + arcRadius * 0.35;
          ctx.save();
          ctx.translate(charX, charY);
          ctx.rotate(Math.PI / 2 - angle);
          ctx.fillText(chars[i], 0, 0);
          ctx.restore();
        }
      }
    },
    gradient: {
      name: "Vertical Gradient",
      draw: function (ctx, text, x, y, fontSize) {
        const gradient = ctx.createLinearGradient(x, y - fontSize, x, y + fontSize * 0.4);
        gradient.addColorStop(0, colorOf("gradient", "#ff00ff"));
        gradient.addColorStop(1, "#4b0082");
        ctx.fillStyle = gradient;
        ctx.fillText(text, x, y);
      }
    },
    shadow: {
      name: "Drop Shadow",
      draw: function (ctx, text, x, y, fontSize) {
        const offset = Math.max(3, fontSize / 12);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillText(text, x + offset, y + offset);
        ctx.fillStyle = colorOf("shadow", "#111111");
        ctx.fillText(text, x, y);
      }
    },
    outline: {
      name: "Thick Outline",
      draw: function (ctx, text, x, y, fontSize) {
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.lineWidth = Math.max(5, fontSize / 7);
        ctx.strokeStyle = colorOf("outline", "#ff0000");
        ctx.strokeText(text, x, y);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, y);
      }
    },
    italic: {
      name: "Italic Slant",
      draw: function (ctx, text, x, y, fontSize) {
        ctx.fillStyle = colorOf("italic", "#0066cc");
        ctx.font = `bold italic ${fontSize}px ${currentFont}`;
        ctx.fillText(text, x, y);
      }
    },
    bold: {
      name: "Extra Bold",
      draw: function (ctx, text, x, y, fontSize) {
        ctx.fillStyle = colorOf("bold", "#333333");
        ctx.font = `900 ${fontSize}px ${currentFont}`;
        ctx.lineWidth = Math.max(1, fontSize / 28);
        ctx.strokeStyle = colorOf("bold", "#333333");
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    },
    wave: {
      name: "Wave",
      draw: function (ctx, text, x, y, fontSize) {
        ctx.fillStyle = colorOf("wave", "#9932cc");
        ctx.font = `bold ${fontSize}px ${currentFont}`;
        const chars = text.split("");
        const advance = fontSize * 0.62;
        const total = Math.max(advance, (chars.length - 1) * advance);
        for (let i = 0; i < chars.length; i++) {
          const waveOffset = Math.sin(i * 0.7 + currentBend / 30) * (fontSize * 0.28);
          ctx.save();
          ctx.translate(x - total / 2 + i * advance, y + waveOffset);
          ctx.rotate(Math.cos(i * 0.7) * 0.18);
          ctx.fillText(chars[i], 0, 0);
          ctx.restore();
        }
      }
    },
    stripe: {
      name: "Striped",
      draw: function (ctx, text, x, y, fontSize) {
        ctx.fillStyle = colorOf("stripe", "#ff4500");
        ctx.fillText(text, x, y);
        ctx.save();
        ctx.beginPath();
        // Clip stripes to the glyphs so the PNG stays a sticker, not a box.
        ctx.fillText(text, x, y);
        // The second fill is only to establish the clip path via destination-in below.
        const textWidth = Math.max(ctx.measureText(text).width, fontSize);
        ctx.globalCompositeOperation = "source-atop";
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = Math.max(2, fontSize / 18);
        for (let i = -textWidth; i < textWidth; i += Math.max(8, fontSize / 5)) {
          ctx.beginPath();
          ctx.moveTo(x + i, y - fontSize);
          ctx.lineTo(x + i + fontSize * 0.6, y + fontSize * 0.6);
          ctx.stroke();
        }
        ctx.restore();
      }
    },
    glow: {
      name: "Glow",
      draw: function (ctx, text, x, y, fontSize) {
        const glow = colorOf("glow", "#ffd700");
        ctx.shadowColor = glow;
        ctx.shadowBlur = fontSize / 2;
        ctx.fillStyle = glow;
        ctx.fillText(text, x, y);
        ctx.shadowBlur = fontSize / 5;
        ctx.fillStyle = "#fff8dc";
        ctx.fillText(text, x, y);
        ctx.shadowBlur = 0;
      }
    }
  };

  function cloneColors(src) {
    const out = {};
    STYLE_KEYS.forEach(function (key) {
      const value = src && src[key] != null ? src[key] : SAMPLE.colors[key];
      out[key] = Array.isArray(value) ? value.slice() : value;
    });
    return out;
  }

  function colorOf(key, fallback) {
    const value = currentColors[key];
    if (typeof value === "string" && value) return value;
    return fallback;
  }

  function hexColor(value, fallback) {
    const s = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    return fallback;
  }

  function pickerValue() {
    const value = currentColors[currentStyle];
    if (Array.isArray(value) && value.length) return hexColor(value[0], "#ff0000");
    return hexColor(value, "#ff0000");
  }

  function clampText(value) {
    const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return text.slice(0, 42);
  }

  function clampBend(value) {
    const n = parseInt(value, 10);
    if (!isFinite(n)) return 0;
    return Math.max(-30, Math.min(30, n));
  }

  function clampFont(value) {
    return FONTS.indexOf(value) >= 0 ? value : "Arial";
  }

  function clampStyle(value) {
    return styles[value] ? value : "rainbow";
  }

  // Full piece: text, style, font, bend, and every style color. This is what
  // the share URL carries, and what renderPreview reads.
  function pieceState() {
    return {
      text: currentText,
      style: currentStyle,
      font: currentFont,
      bend: currentBend,
      colors: cloneColors(currentColors)
    };
  }

  function applyPiece(piece) {
    const next = normalizePiece(piece);
    if (!next) return false;
    currentText = next.text;
    currentStyle = next.style;
    currentFont = next.font;
    currentBend = next.bend;
    currentColors = next.colors;
    syncControls();
    renderStyleGrid();
    renderPreview();
    return true;
  }

  function normalizePiece(piece) {
    if (!piece || typeof piece !== "object") return null;
    const text = clampText(piece.text);
    if (!text) return null;
    const colors = cloneColors(SAMPLE.colors);
    const incoming = piece.colors && typeof piece.colors === "object" ? piece.colors : null;
    if (incoming) {
      STYLE_KEYS.forEach(function (key) {
        if (key === "rainbow" && Array.isArray(incoming.rainbow) && incoming.rainbow.length >= 2) {
          colors.rainbow = incoming.rainbow.slice(0, 8).map(function (c, i) {
            return hexColor(c, SAMPLE.colors.rainbow[i] || "#ff0000");
          });
          return;
        }
        if (typeof incoming[key] === "string") {
          colors[key] = hexColor(incoming[key], SAMPLE.colors[key]);
        }
      });
    }
    return {
      text: text,
      style: clampStyle(piece.style),
      font: clampFont(piece.font),
      bend: clampBend(piece.bend),
      colors: colors
    };
  }

  function encodeState(obj) {
    const json = JSON.stringify({
      text: obj.text,
      style: obj.style,
      font: obj.font,
      bend: obj.bend,
      colors: obj.colors
    });
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function decodeState(token) {
    try {
      let b64 = String(token).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const json = decodeURIComponent(escape(atob(b64)));
      return normalizePiece(JSON.parse(json));
    } catch (e) {
      return null;
    }
  }

  function shareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("s", encodeState(pieceState()));
    url.hash = "";
    return url.toString();
  }

  function writeUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("s", encodeState(pieceState()));
      url.hash = "";
      window.history.replaceState({}, "", url);
    } catch (e) { /* file:// or a locked history */ }
  }

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("s");
    if (!token) return null;
    // A server link id is short and has no encoded payload. Ignore it so the
    // page never pretends a partial or remote token restored the piece.
    if (/^[a-z0-9]{6,32}$/.test(token) && token.indexOf("-") < 0 && token.indexOf("_") < 0) {
      return null;
    }
    return decodeState(token);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy") ? resolve() : reject(new Error("copy failed"));
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(input);
    });
  }

  function fontOptions() {
    return FONTS.map(function (font) {
      return `<option value="${font}">${font}</option>`;
    }).join("");
  }

  // Create UI elements
  function createUI() {
    trySection.innerHTML = `
      <div class="input-area">
        <input type="text" id="textInput" placeholder="Type a name or word" value="" maxlength="42" autocomplete="off">
        <button id="downloadBtn" type="button">Download PNG</button>
        <a href="#" id="shareLink">Copy share link</a>
      </div>
      <div class="style-grid" id="styleGrid"></div>
      <div class="preview-container">
        <canvas id="previewCanvas" width="640" height="280"></canvas>
      </div>
      <div class="controls">
        <label>Font:
          <select id="fontSelect">
            ${fontOptions()}
          </select>
        </label>
        <label>Bend:
          <input type="range" id="bendSlider" min="-30" max="30" value="0">
        </label>
        <label>Color:
          <input type="color" id="colorPicker" value="#ff0000">
        </label>
      </div>
      <p class="note friday-note">New style pack drops every Friday</p>
    `;

    renderStyleGrid();
    setupEventListeners();
  }

  // Render style grid. Each tile is a live canvas of the current word, drawn
  // by the same style functions as the main preview — not a canned thumbnail.
  function renderStyleGrid() {
    const grid = document.getElementById("styleGrid");
    if (!grid) return;

    grid.innerHTML = "";
    STYLE_KEYS.forEach(function (styleKey) {
      const style = styles[styleKey];
      const el = document.createElement("button");
      el.type = "button";
      el.className = "style-option";
      el.dataset.style = styleKey;
      el.setAttribute("aria-pressed", styleKey === currentStyle ? "true" : "false");
      if (styleKey === currentStyle) el.classList.add("selected");

      const canvas = document.createElement("canvas");
      canvas.width = 220;
      canvas.height = 84;
      canvas.className = "style-thumb";
      canvas.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = style.name;
      el.appendChild(canvas);
      el.appendChild(label);
      grid.appendChild(el);
      paintStyle(canvas, styleKey, currentText || " ", 28);
    });
  }

  function paintStyle(canvas, styleKey, text, fontSize) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `bold ${fontSize}px ${currentFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const draw = styles[styleKey] ? styles[styleKey].draw : styles.rainbow.draw;
    ctx.save();
    if (currentBend !== 0 && styleKey !== "arch" && styleKey !== "wave") {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(currentBend * Math.PI / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }
    draw(ctx, text, canvas.width / 2, canvas.height / 2, fontSize);
    ctx.restore();
  }

  function syncControls() {
    const input = document.getElementById("textInput");
    const font = document.getElementById("fontSelect");
    const bend = document.getElementById("bendSlider");
    const color = document.getElementById("colorPicker");
    if (input) input.value = currentText;
    if (font) font.value = currentFont;
    if (bend) bend.value = String(currentBend);
    if (color) color.value = pickerValue();
  }

  // Setup event listeners
  function setupEventListeners() {
    const textInput = document.getElementById("textInput");
    if (textInput) {
      textInput.addEventListener("input", function (e) {
        currentText = clampText(e.target.value) || " ";
        renderStyleGrid();
        renderPreview();
        writeUrl();
      });
    }

    const fontSelect = document.getElementById("fontSelect");
    if (fontSelect) {
      fontSelect.addEventListener("change", function (e) {
        currentFont = clampFont(e.target.value);
        renderStyleGrid();
        renderPreview();
        writeUrl();
      });
    }

    const bendSlider = document.getElementById("bendSlider");
    if (bendSlider) {
      bendSlider.addEventListener("input", function (e) {
        currentBend = clampBend(e.target.value);
        renderStyleGrid();
        renderPreview();
        writeUrl();
      });
    }

    const colorPicker = document.getElementById("colorPicker");
    if (colorPicker) {
      colorPicker.addEventListener("input", function (e) {
        const picked = hexColor(e.target.value, "#ff0000");
        if (currentStyle === "rainbow") {
          currentColors.rainbow = rainbowFrom(picked);
        } else {
          currentColors[currentStyle] = picked;
        }
        renderStyleGrid();
        renderPreview();
        writeUrl();
      });
    }

    const downloadBtn = document.getElementById("downloadBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", downloadPNG);
    }

    const shareLink = document.getElementById("shareLink");
    if (shareLink) {
      shareLink.addEventListener("click", function (e) {
        e.preventDefault();
        copyShareURL();
      });
    }

    const styleGrid = document.getElementById("styleGrid");
    if (styleGrid) {
      styleGrid.addEventListener("click", function (e) {
        const el = e.target.closest(".style-option");
        if (!el) return;
        document.querySelectorAll(".style-option").forEach(function (node) {
          node.classList.remove("selected");
          node.setAttribute("aria-pressed", "false");
        });
        el.classList.add("selected");
        el.setAttribute("aria-pressed", "true");
        currentStyle = clampStyle(el.dataset.style);
        document.getElementById("colorPicker").value = pickerValue();
        renderPreview();
        writeUrl();
      });
    }
  }

  function rainbowFrom(hex) {
    const base = hexColor(hex, "#ff0000");
    const hsl = hexToHsl(base);
    const stops = [];
    for (let i = 0; i < 6; i++) {
      stops.push(hslToHex((hsl.h + i * 48) % 360, Math.max(70, hsl.s), Math.max(48, hsl.l)));
    }
    return stops;
  }

  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s * 100, l: l * 100 };
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const to = function (v) {
      return Math.round((v + m) * 255).toString(16).padStart(2, "0");
    };
    return "#" + to(r) + to(g) + to(b);
  }

  // Render preview. Sample and user input both land here.
  function renderPreview() {
    const canvas = document.getElementById("previewCanvas");
    if (!canvas) return;
    const text = currentText || " ";
    const fontSize = text.length > 16 ? 56 : text.length > 10 ? 72 : 84;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `bold ${fontSize}px ${currentFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const draw = styles[currentStyle] ? styles[currentStyle].draw : styles.rainbow.draw;
    ctx.save();
    if (currentBend !== 0 && currentStyle !== "arch" && currentStyle !== "wave") {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(currentBend * Math.PI / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }
    draw(ctx, text, canvas.width / 2, canvas.height / 2, fontSize);
    ctx.restore();
  }

  // Download a transparent PNG of the same canvas the preview just drew.
  function downloadPNG() {
    const canvas = document.getElementById("previewCanvas");
    if (!canvas) return;
    renderPreview();
    const slug = (clampText(currentText) || "wordart")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "wordart";
    const link = document.createElement("a");
    link.download = slug + "-" + currentStyle + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // Copy a URL that encodes the full piece locally. No server round-trip.
  function copyShareURL() {
    const link = document.getElementById("shareLink");
    const url = shareUrl();
    writeUrl();
    const flash = function (label) {
      if (!link) return;
      const previous = link.textContent;
      link.textContent = label;
      setTimeout(function () { link.textContent = previous; }, 1600);
    };
    copyText(url).then(function () {
      flash("Copied");
    }).catch(function () {
      flash("Copy the link");
      window.prompt("Share link", url);
    });
  }

  function boot() {
    createUI();
    const fromUrl = readUrl();
    if (fromUrl) {
      applyPiece(fromUrl);
      return;
    }
    // First load: the sample is real input through the same apply/render path
    // a typed word and a shared URL use. Nothing is a canned picture.
    applyPiece(SAMPLE);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.Glitztype = {
    encodeState: function () { return encodeState(pieceState()); },
    decodeState: decodeState,
    piece: pieceState,
    sample: function () { return normalizePiece(SAMPLE); }
  };
})();
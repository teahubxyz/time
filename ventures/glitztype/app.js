// Glitztype App Logic

(function () {
  const trySection = document.getElementById("try");
  if (!trySection) return;

  let currentText = "Glitztype";
  let currentStyle = "rainbow";
  let currentFont = "Arial";
  let currentBend = 0;
  let currentColors = {
    rainbow: ["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff"],
    chrome: "#cccccc",
    neon: "#00ffff",
    arch: "#ff6600",
    gradient: "#ff00ff",
    shadow: "#000000",
    outline: "#ff0000",
    italic: "#0066cc",
    bold: "#333333",
    wave: "#9932cc",
    stripe: "#ff4500",
    glow: "#ffd700"
  };

  // Sample styles mimicking WordArt - expanded to a dozen
  const styles = {
    rainbow: {
      name: "Rainbow Gradient",
      draw: function(ctx, text, x, y, fontSize) {
        const gradient = ctx.createLinearGradient(0, 0, 300, 0);
        const colors = currentColors.rainbow;
        for (let i = 0; i < colors.length; i++) {
          gradient.addColorStop(i / (colors.length - 1), colors[i]);
        }
        ctx.fillStyle = gradient;
        ctx.fillText(text, x, y);
      }
    },
    chrome: {
      name: "Chrome",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = currentColors.chrome;
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 2;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    },
    neon: {
      name: "Neon Outline",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = "#000000";
        ctx.strokeStyle = currentColors.neon;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    },
    arch: {
      name: "Arch",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = currentColors.arch;
        ctx.font = `bold ${fontSize}px Arial`;
        const chars = text.split('');
        const arcRadius = 50;
        const angleStep = Math.PI / (chars.length + 1);
        for (let i = 0; i < chars.length; i++) {
          const angle = angleStep * (i + 1);
          const charX = x + Math.cos(angle) * arcRadius;
          const charY = y - Math.sin(angle) * arcRadius;
          ctx.save();
          ctx.translate(charX, charY);
          ctx.rotate(Math.PI/2 - angle);
          ctx.fillText(chars[i], 0, 0);
          ctx.restore();
        }
      }
    },
    gradient: {
      name: "Vertical Gradient",
      draw: function(ctx, text, x, y, fontSize) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 100);
        gradient.addColorStop(0, currentColors.gradient);
        gradient.addColorStop(1, "#800080");
        ctx.fillStyle = gradient;
        ctx.fillText(text, x, y);
      }
    },
    shadow: {
      name: "Drop Shadow",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = "#aaaaaa";
        ctx.fillText(text, x + 3, y + 3);
        ctx.fillStyle = currentColors.shadow;
        ctx.fillText(text, x, y);
      }
    },
    outline: {
      name: "Thick Outline",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = currentColors.outline;
        ctx.lineWidth = 5;
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    },
    italic: {
      name: "Italic Slant",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = currentColors.italic;
        ctx.font = `bold italic ${fontSize}px Arial`;
        ctx.fillText(text, x, y);
      }
    },
    bold: {
      name: "Extra Bold",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = currentColors.bold;
        ctx.font = `900 ${fontSize}px Arial`;
        ctx.fillText(text, x, y);
      }
    },
    wave: {
      name: "Wave",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = currentColors.wave;
        ctx.font = `bold ${fontSize}px Arial`;
        const chars = text.split('');
        for (let i = 0; i < chars.length; i++) {
          const waveOffset = Math.sin(i * 0.5) * 15;
          ctx.save();
          ctx.translate(x - (text.length * fontSize/4) + (i * fontSize/2), y + waveOffset);
          ctx.fillText(chars[i], 0, 0);
          ctx.restore();
        }
      }
    },
    stripe: {
      name: "Striped",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = currentColors.stripe;
        ctx.fillText(text, x, y);
        
        // Add stripes
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        const textWidth = ctx.measureText(text).width;
        for (let i = -textWidth; i < textWidth; i += 10) {
          ctx.beginPath();
          ctx.moveTo(x + i, y - 30);
          ctx.lineTo(x + i + 30, y + 30);
          ctx.stroke();
        }
      }
    },
    glow: {
      name: "Glow",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.shadowColor = currentColors.glow;
        ctx.shadowBlur = 15;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, y);
        ctx.shadowBlur = 0;
      }
    }
  };

  // Create UI elements
  function createUI() {
    trySection.innerHTML = `
      <div class="input-area">
        <input type="text" id="textInput" placeholder="Type a name or word" value="${currentText}">
        <button id="downloadBtn">Download PNG</button>
        <button id="shareBtn">Copy Share URL</button>
      </div>
      <div class="style-grid" id="styleGrid"></div>
      <div class="preview-container">
        <canvas id="previewCanvas" width="400" height="200"></canvas>
      </div>
      <div class="controls">
        <label>Font:
          <select id="fontSelect">
            <option value="Arial">Arial</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Impact">Impact</option>
            <option value="Verdana">Verdana</option>
            <option value="Comic Sans MS">Comic Sans MS</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
        </label>
        <label>Bend:
          <input type="range" id="bendSlider" min="-30" max="30" value="0">
        </label>
        <label>Color:
          <input type="color" id="colorPicker" value="#ff0000">
        </label>
      </div>
      <div class="note" style="text-align: center; margin-top: 1rem;">
        New style pack drops every Friday
      </div>
    `;

    renderStyleGrid();
    setupEventListeners();
    renderPreview();
  }

  // Render style grid
  function renderStyleGrid() {
    const grid = document.getElementById("styleGrid");
    if (!grid) return;

    grid.innerHTML = '';
    Object.keys(styles).forEach(styleKey => {
      const style = styles[styleKey];
      const el = document.createElement("div");
      el.className = "style-option";
      el.dataset.style = styleKey;
      el.textContent = style.name;
      if (styleKey === currentStyle) {
        el.classList.add("selected");
      }
      grid.appendChild(el);
    });
  }

  // Setup event listeners
  function setupEventListeners() {
    document.getElementById("textInput").addEventListener("input", function(e) {
      currentText = e.target.value || " ";
      renderPreview();
    });

    document.getElementById("fontSelect").addEventListener("change", function(e) {
      currentFont = e.target.value;
      renderPreview();
    });

    document.getElementById("bendSlider").addEventListener("input", function(e) {
      currentBend = parseInt(e.target.value);
      renderPreview();
    });

    document.getElementById("colorPicker").addEventListener("input", function(e) {
      // Update the current style's color
      currentColors[currentStyle] = e.target.value;
      renderPreview();
    });

    document.getElementById("downloadBtn").addEventListener("click", downloadPNG);
    
    document.getElementById("shareBtn").addEventListener("click", copyShareURL);

    document.querySelectorAll(".style-option").forEach(el => {
      el.addEventListener("click", function() {
        document.querySelectorAll(".style-option").forEach(e => e.classList.remove("selected"));
        this.classList.add("selected");
        currentStyle = this.dataset.style;
        // Update color picker to match current style's color
        document.getElementById("colorPicker").value = currentColors[currentStyle];
        renderPreview();
      });
    });
  }

  // Render preview
  function renderPreview() {
    const canvas = document.getElementById("previewCanvas");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = `bold 48px ${currentFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    const styleFunc = styles[currentStyle] ? styles[currentStyle].draw : styles.rainbow.draw;
    
    // Apply bend transformation if needed
    if (currentBend !== 0) {
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(currentBend * Math.PI / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      styleFunc(ctx, currentText, canvas.width / 2, canvas.height / 2, 48);
      ctx.restore();
    } else {
      styleFunc(ctx, currentText, canvas.width / 2, canvas.height / 2, 48);
    }
  }

  // Download PNG
  function downloadPNG() {
    const canvas = document.getElementById("previewCanvas");
    if (!canvas) return;
    
    const link = document.createElement("a");
    link.download = `${currentText || "wordart"}-${currentStyle}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
  
  // Copy share URL
  function copyShareURL() {
    // Create state object to encode
    const state = {
      text: currentText,
      style: currentStyle,
      font: currentFont,
      bend: currentBend,
      colors: currentColors
    };
    
    // Use Time.save to get a shareable link
    Time.save(state).then(function(link) {
      if (link) {
        const fullUrl = new URL(window.location);
        fullUrl.searchParams.set('s', link);
        navigator.clipboard.writeText(fullUrl.toString()).then(function() {
          alert("Share URL copied to clipboard!");
        }).catch(function() {
          // Fallback if clipboard fails
          prompt("Copy this share URL:", fullUrl.toString());
        });
      } else {
        // Fallback for when backend is unavailable
        const baseUrl = window.location.origin + window.location.pathname;
        const params = new URLSearchParams({
          text: currentText,
          style: currentStyle,
          font: currentFont,
          bend: currentBend
        });
        const fallbackUrl = `${baseUrl}?${params}`;
        navigator.clipboard.writeText(fallbackUrl).then(function() {
          alert("Share URL copied to clipboard! (local encoding)");
        }).catch(function() {
          prompt("Copy this share URL:", fallbackUrl);
        });
      }
    });
  }

  // Initialize on load
  window.addEventListener("DOMContentLoaded", function() {
    createUI();
    
    // Check for shared state
    Time.load().then(function(data) {
      if (data) {
        currentText = data.text || currentText;
        currentStyle = data.style || currentStyle;
        currentFont = data.font || currentFont;
        currentBend = data.bend || currentBend;
        if (data.colors) {
          currentColors = {...currentColors, ...data.colors};
        }
        document.getElementById("textInput").value = currentText;
        document.getElementById("fontSelect").value = currentFont;
        document.getElementById("bendSlider").value = currentBend;
        // Update color picker to match current style's color
        document.getElementById("colorPicker").value = currentColors[currentStyle];
        renderStyleGrid();
        renderPreview();
      }
    });
  });
})();
// Glitztype App Logic

(function () {
  const trySection = document.getElementById("try");
  if (!trySection) return;

  let currentText = "Glitztype";
  let currentStyle = "rainbow";
  let currentFont = "Arial";
  let currentBend = 0;

  // Sample styles mimicking WordArt
  const styles = {
    rainbow: {
      name: "Rainbow Gradient",
      draw: function(ctx, text, x, y, fontSize) {
        const gradient = ctx.createLinearGradient(0, 0, 300, 0);
        gradient.addColorStop(0, "#ff0000");
        gradient.addColorStop(0.2, "#ffff00");
        gradient.addColorStop(0.4, "#00ff00");
        gradient.addColorStop(0.6, "#00ffff");
        gradient.addColorStop(0.8, "#0000ff");
        gradient.addColorStop(1, "#ff00ff");
        ctx.fillStyle = gradient;
        ctx.fillText(text, x, y);
      }
    },
    chrome: {
      name: "Chrome",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = "#cccccc";
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
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    },
    arch: {
      name: "Arch",
      draw: function(ctx, text, x, y, fontSize) {
        ctx.fillStyle = "#ff6600";
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
    }
  };

  // Create UI elements
  function createUI() {
    trySection.innerHTML = `
      <div class="input-area">
        <input type="text" id="textInput" placeholder="Type a name or word" value="${currentText}">
        <button id="downloadBtn">Download PNG</button>
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
          </select>
        </label>
        <label>Bend:
          <input type="range" id="bendSlider" min="-30" max="30" value="0">
        </label>
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

    document.getElementById("downloadBtn").addEventListener("click", downloadPNG);

    document.querySelectorAll(".style-option").forEach(el => {
      el.addEventListener("click", function() {
        document.querySelectorAll(".style-option").forEach(e => e.classList.remove("selected"));
        this.classList.add("selected");
        currentStyle = this.dataset.style;
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
        document.getElementById("textInput").value = currentText;
        document.getElementById("fontSelect").value = currentFont;
        document.getElementById("bendSlider").value = currentBend;
        renderStyleGrid();
        renderPreview();
      }
    });
  });
})();
// StorySketch Application Logic

class StorySketch {
  constructor() {
    this.storyInput = document.getElementById('story-input');
    this.previewArea = document.getElementById('preview-area');
    this.copyButton = document.getElementById('copy-button');
    this.exportImageBtn = document.getElementById('export-image-btn');
    this.copyEmbedBtn = document.getElementById('copy-embed-btn');
    this.panelEditor = document.getElementById('panel-editor');
    this.sampleStory = "Once upon a time, a little rabbit named Luna loved to explore. One sunny morning, she hopped into the forest and found a sparkling pond. As she gazed at her reflection, a wise old turtle appeared. He smiled and said, 'The greatest adventures begin with a single hop.' Luna smiled back and hopped home, feeling brave.";
    
    // Panel editor elements
    this.panelTextareas = [
      document.getElementById('panel-1-text'),
      document.getElementById('panel-2-text'),
      document.getElementById('panel-3-text'),
      document.getElementById('panel-4-text')
    ];
    
    this.sceneSelects = [
      document.getElementById('panel-1-scene'),
      document.getElementById('panel-2-scene'),
      document.getElementById('panel-3-scene'),
      document.getElementById('panel-4-scene')
    ];
    
    this.currentPanels = [];
    
    this.init();
  }

  init() {
    // Load any shared story
    Time.load().then(data => {
      if (data && data.story) {
        this.storyInput.value = data.story;
        this.generateComic(data.story);
      } else {
        // Load sample story
        this.storyInput.value = this.sampleStory;
        this.generateComic(this.sampleStory);
      }
    }).catch(() => {
      // Fallback to sample if loading fails
      this.storyInput.value = this.sampleStory;
      this.generateComic(this.sampleStory);
    });

    // Event listeners
    this.storyInput.addEventListener('input', () => {
      this.debounceGenerate();
    });

    if (this.copyButton) {
      this.copyButton.addEventListener('click', () => {
        this.copyComic();
      });
    }

    if (this.exportImageBtn) {
      this.exportImageBtn.addEventListener('click', () => {
        this.exportAsImage();
      });
    }
    
    if (this.copyEmbedBtn) {
      this.copyEmbedBtn.addEventListener('click', () => {
        this.copyEmbedCode();
      });
    }

    // Panel editor event listeners
    this.panelTextareas.forEach((textarea, index) => {
      textarea.addEventListener('input', () => {
        this.updatePanelFromEditor(index);
      });
    });
    
    this.sceneSelects.forEach((select, index) => {
      select.addEventListener('change', () => {
        this.updatePanelFromEditor(index);
      });
    });
  }

  debounceTimer = null;
  debounceGenerate() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.generateComic(this.storyInput.value);
    }, 500);
  }

  generateComic(storyText) {
    // Limit to 150 words
    const words = storyText.trim().split(/\s+/);
    if (words.length > 150) {
      storyText = words.slice(0, 150).join(' ');
      this.storyInput.value = storyText;
    }

    // Split into 4 panels
    this.currentPanels = this.splitIntoPanels(storyText);
    
    // Update panel editor
    this.updatePanelEditor();
    
    // Generate SVG for each panel
    this.renderComic(this.currentPanels);
  }

  splitIntoPanels(text) {
    if (!text.trim()) {
      return Array(4).fill("").map(() => ({text: "", scene: "empty"}));
    }

    const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
    if (sentences.length === 0) return Array(4).fill("").map(() => ({text: "", scene: "empty"}));

    // Distribute sentences across 4 panels
    const panels = [];
    const sentencesPerPanel = Math.max(1, Math.ceil(sentences.length / 4));
    
    for (let i = 0; i < 4; i++) {
      const start = i * sentencesPerPanel;
      const end = Math.min(start + sentencesPerPanel, sentences.length);
      const panelSentences = sentences.slice(start, end);
      
      if (panelSentences.length > 0) {
        panels.push({
          text: panelSentences.join(' ').trim(),
          scene: this.determineScene(panelSentences.join(' '))
        });
      } else {
        panels.push({text: "", scene: "empty"});
      }
    }
    
    // Fill empty panels if less than 4
    while (panels.length < 4) {
      panels.push({text: "", scene: "empty"});
    }
    
    return panels;
  }

  determineScene(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('forest') || lowerText.includes('tree') || lowerText.includes('wood')) {
      return 'forest';
    } else if (lowerText.includes('house') || lowerText.includes('home') || lowerText.includes('room')) {
      return 'house';
    } else if (lowerText.includes('pond') || lowerText.includes('water') || lowerText.includes('lake')) {
      return 'pond';
    } else if (lowerText.includes('rabbit') || lowerText.includes('bunny') || lowerText.includes('animal')) {
      return 'rabbit';
    } else if (lowerText.includes('turtle') || lowerText.includes('wise') || lowerText.includes('old')) {
      return 'turtle';
    } else if (lowerText.includes('sun') || lowerText.includes('morning') || lowerText.includes('bright')) {
      return 'sun';
    } else if (lowerText.includes('night') || lowerText.includes('sleep') || lowerText.includes('bed')) {
      return 'moon';
    } else {
      // Default scenes
      const scenes = ['generic1', 'generic2', 'generic3', 'generic4'];
      return scenes[Math.floor(Math.random() * scenes.length)];
    }
  }

  renderComic(panels) {
    let svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" class="comic-svg">
        <style>
          .panel { fill: #f0f8ff; stroke: #333; stroke-width: 2; }
          .panel-text { font-family: Arial, sans-serif; font-size: 14px; fill: #333; }
          .scene-element { fill: #4682b4; }
        </style>
        <!-- Panel 1 -->
        <rect x="10" y="10" width="380" height="180" class="panel" rx="10"/>
        ${this.drawScene(panels[0].scene, 20, 20, 100, 100)}
        <foreignObject x="130" y="20" width="250" height="160">
          <div xmlns="http://www.w3.org/1999/xhtml" class="panel-text">${this.escapeHtml(panels[0].text)}</div>
        </foreignObject>
        
        <!-- Panel 2 -->
        <rect x="410" y="10" width="380" height="180" class="panel" rx="10"/>
        ${this.drawScene(panels[1].scene, 420, 20, 100, 100)}
        <foreignObject x="530" y="20" width="250" height="160">
          <div xmlns="http://www.w3.org/1999/xhtml" class="panel-text">${this.escapeHtml(panels[1].text)}</div>
        </foreignObject>
        
        <!-- Panel 3 -->
        <rect x="10" y="210" width="380" height="180" class="panel" rx="10"/>
        ${this.drawScene(panels[2].scene, 20, 220, 100, 100)}
        <foreignObject x="130" y="220" width="250" height="160">
          <div xmlns="http://www.w3.org/1999/xhtml" class="panel-text">${this.escapeHtml(panels[2].text)}</div>
        </foreignObject>
        
        <!-- Panel 4 -->
        <rect x="410" y="210" width="380" height="180" class="panel" rx="10"/>
        ${this.drawScene(panels[3].scene, 420, 220, 100, 100)}
        <foreignObject x="530" y="220" width="250" height="160">
          <div xmlns="http://www.w3.org/1999/xhtml" class="panel-text">${this.escapeHtml(panels[3].text)}</div>
        </foreignObject>
      </svg>
    `;
    
    this.previewArea.innerHTML = svgContent;
  }

  drawScene(sceneType, x, y, width, height) {
    switch(sceneType) {
      case 'forest':
        return `
          <rect x="${x}" y="${y}" width="${width}" height="${height/2}" fill="#8FBC8F" />
          <circle cx="${x + 20}" cy="${y + 30}" r="15" fill="#228B22" />
          <circle cx="${x + 50}" cy="${y + 20}" r="20" fill="#228B22" />
          <circle cx="${x + 80}" cy="${y + 35}" r="18" fill="#228B22" />
          <rect x="${x + 45}" y="${y + 30}" width="10" height="40" fill="#8B4513" />
        `;
      case 'house':
        return `
          <rect x="${x + 30}" y="${y + 20}" width="60" height="50" fill="#CD853F" />
          <polygon points="${x + 20},${y + 20} ${x + 90},${y + 20} ${x + 55},${y}" fill="#8B4513" />
          <rect x="${x + 45}" y="${y + 40}" width="15" height="30" fill="#654321" />
          <rect x="${x + 70}" y="${y + 35}" width="10" height="10" fill="#87CEEB" />
        `;
      case 'pond':
        return `
          <ellipse cx="${x + 50}" cy="${y + 50}" rx="40" ry="25" fill="#4169E1" />
          <circle cx="${x + 30}" cy="${y + 40}" r="3" fill="#fff" />
          <circle cx="${x + 70}" cy="${y + 60}" r="5" fill="#fff" />
          <path d="M${x + 20},${y + 30} Q${x + 50},${y + 10} ${x + 80},${y + 30}" fill="#20B2AA" />
        `;
      case 'rabbit':
        return `
          <ellipse cx="${x + 50}" cy="${y + 50}" rx="20" ry="15" fill="#fff" />
          <ellipse cx="${x + 35}" cy="${y + 40}" rx="8" ry="15" fill="#fff" />
          <ellipse cx="${x + 65}" cy="${y + 40}" rx="8" ry="15" fill="#fff" />
          <circle cx="${x + 45}" cy="${y + 45}" r="2" fill="#000" />
          <ellipse cx="${x + 30}" cy="${y + 30}" rx="5" ry="10" fill="#fff" transform="rotate(-30 ${x + 30} ${y + 30})" />
          <ellipse cx="${x + 70}" cy="${y + 30}" rx="5" ry="10" fill="#fff" transform="rotate(30 ${x + 70} ${y + 30})" />
        `;
      case 'turtle':
        return `
          <ellipse cx="${x + 50}" cy="${y + 50}" rx="25" ry="15" fill="#20B2AA" />
          <circle cx="${x + 50}" cy="${y + 40}" r="8" fill="#20B2AA" />
          <circle cx="${x + 47}" cy="${y + 38}" r="2" fill="#000" />
          <rect x="${x + 30}" y="${y + 50}" width="40" height="5" fill="#20B2AA" />
        `;
      case 'sun':
        return `
          <circle cx="${x + 50}" cy="${y + 50}" r="20" fill="#FFD700" />
          <line x1="${x + 50}" y1="${y + 20}" x2="${x + 50}" y2="${y + 10}" stroke="#FFD700" stroke-width="2" />
          <line x1="${x + 70}" y1="${y + 50}" x2="${x + 80}" y2="${y + 50}" stroke="#FFD700" stroke-width="2" />
          <line x1="${x + 50}" y1="${y + 80}" x2="${x + 50}" y2="${y + 90}" stroke="#FFD700" stroke-width="2" />
          <line x1="${x + 30}" y1="${y + 50}" x2="${x + 20}" y2="${y + 50}" stroke="#FFD700" stroke-width="2" />
        `;
      case 'moon':
        return `
          <circle cx="${x + 50}" cy="${y + 50}" r="20" fill="#F5F5F5" />
          <circle cx="${x + 60}" cy="${y + 45}" r="15" fill="#fff" />
          <circle cx="${x + 45}" cy="${y + 55}" r="8" fill="#F5F5F5" />
        `;
      case 'generic1':
        return `
          <rect x="${x + 20}" y="${y + 20}" width="60" height="40" fill="#9370DB" />
          <circle cx="${x + 50}" cy="${y + 50}" r="10" fill="#BA55D3" />
        `;
      case 'generic2':
        return `
          <polygon points="${x + 30},${y + 70} ${x + 70},${y + 70} ${x + 50},${y + 30}" fill="#32CD32" />
          <circle cx="${x + 50}" cy="${y + 60}" r="15" fill="#FF6347" />
        `;
      case 'generic3':
        return `
          <rect x="${x + 30}" y="${y + 30}" width="40" height="40" fill="#FF6347" />
          <circle cx="${x + 50}" cy="${y + 30}" r="10" fill="#FFA500" />
        `;
      case 'generic4':
        return `
          <ellipse cx="${x + 50}" cy="${y + 50}" rx="30" ry="20" fill="#9370DB" />
          <circle cx="${x + 40}" cy="${y + 45}" r="5" fill="#fff" />
          <circle cx="${x + 60}" cy="${y + 45}" r="5" fill="#fff" />
        `;
      default: // empty
        return `<text x="${x + 50}" y="${y + 50}" text-anchor="middle" fill="#ccc">Empty</text>`;
    }
  }

  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  updatePanelEditor() {
    // Show the panel editor
    this.panelEditor.style.display = 'grid';
    
    // Update panel editor fields with current panel data
    this.currentPanels.forEach((panel, index) => {
      if (this.panelTextareas[index]) {
        this.panelTextareas[index].value = panel.text;
      }
      if (this.sceneSelects[index]) {
        this.sceneSelects[index].value = panel.scene;
      }
    });
  }

  updatePanelFromEditor(panelIndex) {
    // Update the panel data from editor inputs
    const newText = this.panelTextareas[panelIndex].value;
    const newScene = this.sceneSelects[panelIndex].value;
    
    this.currentPanels[panelIndex] = {
      text: newText,
      scene: newScene
    };
    
    // Re-render the comic with updated panels
    this.renderComic(this.currentPanels);
  }

  copyComic() {
    const svgElement = this.previewArea.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], {type: "image/svg+xml"});
    
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([
        new ClipboardItem({
          "image/svg+xml": blob
        })
      ]).then(() => {
        this.showNotification("Comic copied to clipboard!");
      }).catch(err => {
        console.error('Failed to copy: ', err);
        this.showNotification("Failed to copy comic");
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = svgData;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      this.showNotification("Comic copied to clipboard!");
    }
  }

  copyEmbedCode() {
    const svgElement = this.previewArea.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const encodedSvg = encodeURIComponent(svgData);
    const embedCode = `<img src="data:image/svg+xml,${encodedSvg}" alt="StorySketch Comic" />`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(embedCode).then(() => {
        this.showNotification("Embed code copied to clipboard!");
      }).catch(err => {
        console.error('Failed to copy: ', err);
        this.showNotification("Failed to copy embed code");
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = embedCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      this.showNotification("Embed code copied to clipboard!");
    }
  }

  exportAsImage() {
    const svgElement = this.previewArea.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    const svgBlob = new Blob([svgData], {type: "image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      URL.revokeObjectURL(url);
      
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "storysketch-comic.png";
      link.href = pngUrl;
      link.click();
      
      this.showNotification("Comic downloaded as PNG!");
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.showNotification("Failed to export image");
    };
    
    img.src = url;
  }

  showNotification(message) {
    // Simple notification implementation
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = '#333';
    notification.style.color = '#fff';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '5px';
    notification.style.zIndex = '1000';
    notification.style.opacity = '0.9';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
  }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
  window.storySketch = new StorySketch();
});
// StorySketch Application Logic
// Paste or type a story. The same path splits it into four panels, draws matching
// SVG scenes, and paints the comic. The preloaded sample is real input on that path.
// Copy puts a PNG of the finished comic on the clipboard; embed copies the same image.

class StorySketch {
  constructor() {
    this.storyInput = document.getElementById('story-input');
    this.wordCountEl = document.getElementById('word-count');
    this.previewArea = document.getElementById('preview-area');
    this.copyButton = document.getElementById('copy-button');
    this.exportImageBtn = document.getElementById('export-image-btn');
    this.copyEmbedBtn = document.getElementById('copy-embed-btn');
    this.panelEditor = document.getElementById('panel-editor');
    this.sampleStory = "Once upon a time, a little rabbit named Luna loved to explore. One sunny morning, she hopped into the forest and found a sparkling pond. As she gazed at her reflection, a wise old turtle appeared. He smiled and said, 'The greatest adventures begin with a single hop.' Luna smiled back and hopped home, feeling brave.";

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
    this.syncingEditor = false;
    this.comicWidth = 800;
    this.comicHeight = 520;

    this.init();
  }

  init() {
    const boot = (story) => {
      this.storyInput.value = story;
      this.generateComic(story);
    };

    const pending = window.Time && typeof window.Time.load === 'function' ? window.Time.load() : null;
    Promise.resolve(pending).then((data) => {
      if (data && typeof data === 'object' && typeof data.story === 'string' && data.story.trim()) {
        boot(data.story);
      } else {
        boot(this.sampleStory);
      }
    }).catch(() => {
      boot(this.sampleStory);
    });

    this.storyInput.addEventListener('input', () => {
      this.updateWordCount(this.storyInput.value);
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

    this.panelTextareas.forEach((textarea, index) => {
      if (!textarea) return;
      textarea.addEventListener('input', () => {
        this.updatePanelFromEditor(index);
      });
    });

    this.sceneSelects.forEach((select, index) => {
      if (!select) return;
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
    }, 180);
  }

  wordCount(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  updateWordCount(text) {
    if (this.wordCountEl) this.wordCountEl.textContent = String(this.wordCount(text));
  }

  generateComic(storyText) {
    const words = String(storyText || '').trim().split(/\s+/).filter(Boolean);
    if (words.length > 150) {
      storyText = words.slice(0, 150).join(' ');
      this.storyInput.value = storyText;
    }
    this.updateWordCount(storyText);
    this.currentPanels = this.splitIntoPanels(storyText);
    this.updatePanelEditor();
    this.renderComic(this.currentPanels);
  }

  splitIntoPanels(text) {
    const empty = () => Array.from({ length: 4 }, () => ({ text: '', scene: 'empty' }));
    const source = String(text || '').trim();
    if (!source) return empty();

    const sentences = source.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [source];
    const chunks = sentences.map((s) => s.trim()).filter(Boolean);
    if (!chunks.length) return empty();

    const panels = [];
    const perPanel = Math.max(1, Math.ceil(chunks.length / 4));
    for (let i = 0; i < 4; i++) {
      const start = i * perPanel;
      const slice = chunks.slice(start, start + perPanel);
      if (slice.length) {
        const panelText = slice.join(' ').trim();
        panels.push({ text: panelText, scene: this.determineScene(panelText, i) });
      } else {
        panels.push({ text: '', scene: 'empty' });
      }
    }
    return panels;
  }

  determineScene(text, index) {
    const lowerText = String(text || '').toLowerCase();
    if (/\b(forest|tree|trees|wood|woods)\b/.test(lowerText)) return 'forest';
    if (/\b(house|home|room|cottage)\b/.test(lowerText)) return 'house';
    if (/\b(pond|water|lake|river|reflection)\b/.test(lowerText)) return 'pond';
    if (/\b(rabbit|bunny|hare|luna)\b/.test(lowerText)) return 'rabbit';
    if (/\b(turtle|tortoise|wise)\b/.test(lowerText)) return 'turtle';
    if (/\b(sun|sunny|morning|bright|day)\b/.test(lowerText)) return 'sun';
    if (/\b(night|moon|sleep|bed|stars)\b/.test(lowerText)) return 'moon';
    const scenes = ['generic1', 'generic2', 'generic3', 'generic4'];
    return scenes[index % scenes.length];
  }

  renderComic(panels) {
    const svg = this.buildSvg(panels);
    this.previewArea.innerHTML = '';
    this.previewArea.appendChild(svg);
  }

  buildSvg(panels) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('viewBox', `0 0 ${this.comicWidth} ${this.comicHeight}`);
    svg.setAttribute('width', String(this.comicWidth));
    svg.setAttribute('height', String(this.comicHeight));
    svg.setAttribute('class', 'comic-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Four panel story comic');

    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', String(this.comicWidth));
    bg.setAttribute('height', String(this.comicHeight));
    bg.setAttribute('fill', '#f4f1ea');
    svg.appendChild(bg);

    const slots = [
      { x: 16, y: 16 },
      { x: 408, y: 16 },
      { x: 16, y: 268 },
      { x: 408, y: 268 }
    ];

    panels.forEach((panel, i) => {
      const slot = slots[i];
      svg.appendChild(this.panelGroup(panel, slot.x, slot.y, i));
    });
    return svg;
  }

  panelGroup(panel, x, y, index) {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'comic-panel');

    const frame = document.createElementNS(NS, 'rect');
    frame.setAttribute('x', String(x));
    frame.setAttribute('y', String(y));
    frame.setAttribute('width', '376');
    frame.setAttribute('height', '236');
    frame.setAttribute('rx', '12');
    frame.setAttribute('fill', '#fffdf8');
    frame.setAttribute('stroke', '#2b2b2b');
    frame.setAttribute('stroke-width', '3');
    g.appendChild(frame);

    const scene = document.createElementNS(NS, 'g');
    scene.setAttribute('transform', `translate(${x + 14} ${y + 14})`);
    scene.innerHTML = this.drawScene(panel.scene, 0, 0, 118, 118);
    g.appendChild(scene);

    const badge = document.createElementNS(NS, 'text');
    badge.setAttribute('x', String(x + 352));
    badge.setAttribute('y', String(y + 28));
    badge.setAttribute('text-anchor', 'end');
    badge.setAttribute('font-family', 'Georgia, "Times New Roman", serif');
    badge.setAttribute('font-size', '13');
    badge.setAttribute('fill', '#6c757d');
    badge.textContent = String(index + 1);
    g.appendChild(badge);

    const lines = this.wrapText(panel.text || '', 28);
    lines.slice(0, 8).forEach((line, i) => {
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', String(x + 146));
      text.setAttribute('y', String(y + 36 + i * 22));
      text.setAttribute('font-family', 'Georgia, "Times New Roman", serif');
      text.setAttribute('font-size', '15');
      text.setAttribute('fill', '#212529');
      text.textContent = line;
      g.appendChild(text);
    });

    if (!panel.text) {
      const empty = document.createElementNS(NS, 'text');
      empty.setAttribute('x', String(x + 146));
      empty.setAttribute('y', String(y + 48));
      empty.setAttribute('font-family', 'Georgia, "Times New Roman", serif');
      empty.setAttribute('font-size', '15');
      empty.setAttribute('fill', '#adb5bd');
      empty.textContent = 'Empty panel';
      g.appendChild(empty);
    }
    return g;
  }

  wrapText(text, maxChars) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  drawScene(sceneType, x, y, width, height) {
    switch (sceneType) {
      case 'forest':
        return `
          <rect x="${x}" y="${y + 70}" width="${width}" height="48" fill="#c6e2b5" />
          <rect x="${x + 22}" y="${y + 42}" width="8" height="40" fill="#8B4513" />
          <circle cx="${x + 26}" cy="${y + 36}" r="18" fill="#2e8b57" />
          <rect x="${x + 58}" y="${y + 34}" width="8" height="48" fill="#8B4513" />
          <circle cx="${x + 62}" cy="${y + 28}" r="22" fill="#228B22" />
          <rect x="${x + 90}" y="${y + 46}" width="7" height="36" fill="#8B4513" />
          <circle cx="${x + 93}" cy="${y + 40}" r="16" fill="#3cb371" />
        `;
      case 'house':
        return `
          <rect x="${x + 18}" y="${y + 48}" width="78" height="58" fill="#e7c39a" />
          <polygon points="${x + 10},${y + 50} ${x + 104},${y + 50} ${x + 57},${y + 16}" fill="#b5651d" />
          <rect x="${x + 48}" y="${y + 74}" width="18" height="32" fill="#6b3e26" />
          <rect x="${x + 26}" y="${y + 62}" width="14" height="14" fill="#87CEEB" stroke="#6b3e26" />
          <rect x="${x + 74}" y="${y + 62}" width="14" height="14" fill="#87CEEB" stroke="#6b3e26" />
        `;
      case 'pond':
        return `
          <ellipse cx="${x + 60}" cy="${y + 78}" rx="48" ry="22" fill="#4f86c6" />
          <ellipse cx="${x + 60}" cy="${y + 74}" rx="36" ry="12" fill="#7eb6e0" />
          <path d="M${x + 18},${y + 40} Q${x + 40},${y + 18} ${x + 28},${y + 58}" fill="#20B2AA" />
          <path d="M${x + 96},${y + 36} Q${x + 78},${y + 16} ${x + 88},${y + 56}" fill="#2e8b57" />
          <circle cx="${x + 48}" cy="${y + 70}" r="3" fill="#fff" />
        `;
      case 'rabbit':
        return `
          <ellipse cx="${x + 58}" cy="${y + 74}" rx="28" ry="18" fill="#f7f4ef" stroke="#d9cfc2" />
          <circle cx="${x + 78}" cy="${y + 58}" r="14" fill="#f7f4ef" stroke="#d9cfc2" />
          <ellipse cx="${x + 70}" cy="${y + 36}" rx="5" ry="16" fill="#f7f4ef" stroke="#d9cfc2" />
          <ellipse cx="${x + 84}" cy="${y + 36}" rx="5" ry="16" fill="#f7f4ef" stroke="#d9cfc2" />
          <circle cx="${x + 74}" cy="${y + 56}" r="1.6" fill="#333" />
          <circle cx="${x + 84}" cy="${y + 56}" r="1.6" fill="#333" />
          <ellipse cx="${x + 34}" cy="${y + 78}" rx="8" ry="5" fill="#f7f4ef" stroke="#d9cfc2" />
        `;
      case 'turtle':
        return `
          <ellipse cx="${x + 62}" cy="${y + 70}" rx="32" ry="18" fill="#2f8f7a" />
          <ellipse cx="${x + 62}" cy="${y + 66}" rx="22" ry="12" fill="#3cb39a" />
          <circle cx="${x + 92}" cy="${y + 62}" r="9" fill="#7dcea0" />
          <circle cx="${x + 95}" cy="${y + 60}" r="1.5" fill="#123" />
          <rect x="${x + 36}" y="${y + 78}" width="10" height="6" rx="2" fill="#1f6f5b" />
          <rect x="${x + 78}" y="${y + 78}" width="10" height="6" rx="2" fill="#1f6f5b" />
        `;
      case 'sun':
        return `
          <circle cx="${x + 60}" cy="${y + 58}" r="22" fill="#FFD24A" />
          <g stroke="#FFD24A" stroke-width="4" stroke-linecap="round">
            <line x1="${x + 60}" y1="${y + 22}" x2="${x + 60}" y2="${y + 8}" />
            <line x1="${x + 60}" y1="${y + 94}" x2="${x + 60}" y2="${y + 108}" />
            <line x1="${x + 24}" y1="${y + 58}" x2="${x + 10}" y2="${y + 58}" />
            <line x1="${x + 96}" y1="${y + 58}" x2="${x + 110}" y2="${y + 58}" />
            <line x1="${x + 34}" y1="${y + 32}" x2="${x + 24}" y2="${y + 22}" />
            <line x1="${x + 86}" y1="${y + 32}" x2="${x + 96}" y2="${y + 22}" />
            <line x1="${x + 34}" y1="${y + 84}" x2="${x + 24}" y2="${y + 94}" />
            <line x1="${x + 86}" y1="${y + 84}" x2="${x + 96}" y2="${y + 94}" />
          </g>
        `;
      case 'moon':
        return `
          <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#1b2740" />
          <circle cx="${x + 70}" cy="${y + 42}" r="18" fill="#f4f1ea" />
          <circle cx="${x + 80}" cy="${y + 38}" r="14" fill="#1b2740" />
          <circle cx="${x + 28}" cy="${y + 30}" r="1.5" fill="#fff" />
          <circle cx="${x + 40}" cy="${y + 70}" r="1.2" fill="#fff" />
          <circle cx="${x + 96}" cy="${y + 78}" r="1.4" fill="#fff" />
        `;
      case 'generic1':
        return `
          <rect x="${x + 16}" y="${y + 28}" width="84" height="62" rx="8" fill="#7c6cf0" />
          <circle cx="${x + 58}" cy="${y + 58}" r="14" fill="#ffd24a" />
        `;
      case 'generic2':
        return `
          <polygon points="${x + 20},${y + 96} ${x + 100},${y + 96} ${x + 60},${y + 28}" fill="#3cb371" />
          <circle cx="${x + 60}" cy="${y + 70}" r="12" fill="#ff7a59" />
        `;
      case 'generic3':
        return `
          <rect x="${x + 28}" y="${y + 36}" width="62" height="62" rx="6" fill="#ff7a59" />
          <circle cx="${x + 59}" cy="${y + 28}" r="12" fill="#ffd24a" />
        `;
      case 'generic4':
        return `
          <ellipse cx="${x + 60}" cy="${y + 64}" rx="40" ry="26" fill="#7c6cf0" />
          <circle cx="${x + 46}" cy="${y + 58}" r="4" fill="#fff" />
          <circle cx="${x + 74}" cy="${y + 58}" r="4" fill="#fff" />
        `;
      default:
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#f8f9fa" stroke="#dee2e6" />`;
    }
  }

  updatePanelEditor() {
    if (this.panelEditor) this.panelEditor.style.display = 'grid';
    this.syncingEditor = true;
    this.currentPanels.forEach((panel, index) => {
      if (this.panelTextareas[index] && this.panelTextareas[index].value !== panel.text) {
        this.panelTextareas[index].value = panel.text;
      }
      if (this.sceneSelects[index]) {
        this.sceneSelects[index].value = panel.scene;
      }
    });
    this.syncingEditor = false;
  }

  updatePanelFromEditor(panelIndex) {
    if (this.syncingEditor) return;
    const textarea = this.panelTextareas[panelIndex];
    const select = this.sceneSelects[panelIndex];
    if (!textarea || !select) return;
    this.currentPanels[panelIndex] = {
      text: textarea.value,
      scene: select.value
    };
    this.renderComic(this.currentPanels);
  }

  svgMarkup() {
    const svg = this.previewArea.querySelector('svg');
    if (!svg) return '';
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(this.comicWidth));
    clone.setAttribute('height', String(this.comicHeight));
    return new XMLSerializer().serializeToString(clone);
  }

  rasterize() {
    const markup = this.svgMarkup();
    if (!markup) return Promise.reject(new Error('No comic to copy'));
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const width = this.comicWidth * 2;
    const height = this.comicHeight * 2;
    return new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => {
          if (!png) {
            reject(new Error('Could not encode PNG'));
            return;
          }
          resolve({ png, canvas });
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not draw the comic'));
      };
      img.src = url;
    });
  }

  copyComic() {
    const button = this.copyButton;
    const previous = button ? button.textContent : '';
    this.rasterize().then(({ png }) => {
      const writeImage = navigator.clipboard && window.ClipboardItem && navigator.clipboard.write
        ? navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
        : Promise.reject(new Error('clipboard image unsupported'));
      return writeImage.catch(() => this.downloadBlob(png, 'storysketch-comic.png').then(() => 'downloaded'));
    }).then((result) => {
      if (button) {
        button.textContent = result === 'downloaded' ? 'Downloaded PNG' : 'Copied image';
        setTimeout(() => { button.textContent = previous; }, 1600);
      }
      this.showNotification(result === 'downloaded'
        ? 'Clipboard images are blocked here, so the PNG was downloaded instead.'
        : 'Comic image copied. Paste it into a message or doc.');
    }).catch((err) => {
      console.error(err);
      this.showNotification('Could not copy the comic image');
    });
  }

  copyEmbedCode() {
    this.rasterize().then(({ canvas }) => {
      const dataUrl = canvas.toDataURL('image/png');
      const embedCode = `<img src="${dataUrl}" alt="StorySketch comic" width="${this.comicWidth}" />`;
      return this.copyText(embedCode);
    }).then(() => {
      const previous = this.copyEmbedBtn ? this.copyEmbedBtn.textContent : '';
      if (this.copyEmbedBtn) {
        this.copyEmbedBtn.textContent = 'Copied embed';
        setTimeout(() => { this.copyEmbedBtn.textContent = previous; }, 1600);
      }
      this.showNotification('Embed code copied. It is the comic as a PNG image.');
    }).catch((err) => {
      console.error(err);
      this.showNotification('Could not copy embed code');
    });
  }

  copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(area);
    });
  }

  exportAsImage() {
    this.rasterize().then(({ png }) => {
      return this.downloadBlob(png, 'storysketch-comic.png');
    }).then(() => {
      this.showNotification('Comic downloaded as PNG');
    }).catch((err) => {
      console.error(err);
      this.showNotification('Could not export the image');
    });
  }

  downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return Promise.resolve();
  }

  showNotification(message) {
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
    notification.style.maxWidth = '280px';
    document.body.appendChild(notification);
    setTimeout(() => {
      if (notification.parentNode) notification.parentNode.removeChild(notification);
    }, 2800);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.storySketch = new StorySketch();
});

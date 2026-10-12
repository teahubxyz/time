// Dollhouse Application Logic

class DollhouseApp {
  constructor() {
    this.gridSize = 20;
    this.gridWidth = 30;
    this.gridHeight = 20;
    this.walls = [];
    this.furniture = [];
    this.selectedTool = 'wall';
    this.isDrawing = false;
    this.startPoint = null;
    this.furnitureLibrary = {
      couch: { name: 'Couch', width: 6, height: 3, color: '#8B4513' },
      bed: { name: 'Bed', width: 6, height: 4, color: '#4682B4' },
      desk: { name: 'Desk', width: 4, height: 2, color: '#696969' },
      plant: { name: 'Plant', width: 1, height: 1, color: '#228B22' },
      tv: { name: 'TV', width: 3, height: 1, color: '#000000' }
    };
    
    this.init();
  }

  init() {
    this.createGrid();
    this.setupEventListeners();
    this.setupToolbar();
    this.loadFromURL();
    this.render();
  }

  createGrid() {
    const gridContainer = document.getElementById('grid-container');
    gridContainer.innerHTML = '';
    
    // Create grid cells
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.style.width = `${this.gridSize}px`;
        cell.style.height = `${this.gridSize}px`;
        cell.style.left = `${x * this.gridSize}px`;
        cell.style.top = `${y * this.gridSize}px`;
        gridContainer.appendChild(cell);
      }
    }
    
    // Set container size
    gridContainer.style.width = `${this.gridWidth * this.gridSize}px`;
    gridContainer.style.height = `${this.gridHeight * this.gridSize}px`;
  }

  setupEventListeners() {
    const gridContainer = document.getElementById('grid-container');
    
    gridContainer.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('grid-cell')) {
        this.isDrawing = true;
        const x = parseInt(e.target.dataset.x);
        const y = parseInt(e.target.dataset.y);
        
        if (this.selectedTool === 'wall') {
          this.startPoint = { x, y };
        } else if (this.selectedTool.startsWith('furniture-')) {
          const furnitureType = this.selectedTool.split('-')[1];
          this.addFurniture(x, y, furnitureType);
        }
      }
    });
    
    gridContainer.addEventListener('mousemove', (e) => {
      if (this.isDrawing && e.target.classList.contains('grid-cell')) {
        // Visual feedback during drawing
      }
    });
    
    gridContainer.addEventListener('mouseup', (e) => {
      if (this.isDrawing && e.target.classList.contains('grid-cell') && this.selectedTool === 'wall') {
        this.isDrawing = false;
        const x = parseInt(e.target.dataset.x);
        const y = parseInt(e.target.dataset.y);
        
        if (this.startPoint) {
          this.addWall(this.startPoint.x, this.startPoint.y, x, y);
          this.startPoint = null;
        }
      }
    });
    
    gridContainer.addEventListener('mouseleave', () => {
      this.isDrawing = false;
      this.startPoint = null;
    });
    
    // Toolbar buttons
    document.querySelectorAll('[data-tool]').forEach(button => {
      button.addEventListener('click', (e) => {
        this.selectTool(e.target.dataset.tool);
      });
    });
    
    // Clear button
    document.getElementById('clear-btn').addEventListener('click', () => {
      this.clearAll();
    });
    
    // Download button
    document.getElementById('download-btn').addEventListener('click', () => {
      this.downloadDiorama();
    });
  }

  setupToolbar() {
    const toolbar = document.getElementById('toolbar');
    
    // Wall tool
    const wallBtn = document.createElement('button');
    wallBtn.className = 'tool-btn';
    wallBtn.dataset.tool = 'wall';
    wallBtn.textContent = 'Wall';
    wallBtn.title = 'Draw walls';
    toolbar.appendChild(wallBtn);
    
    // Furniture tools
    Object.keys(this.furnitureLibrary).forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.dataset.tool = `furniture-${key}`;
      btn.textContent = this.furnitureLibrary[key].name;
      btn.title = `Place ${this.furnitureLibrary[key].name}`;
      toolbar.appendChild(btn);
    });
    
    // Select wall tool by default
    this.selectTool('wall');
  }

  selectTool(tool) {
    this.selectedTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tool === tool) {
        btn.classList.add('active');
      }
    });
  }

  addWall(startX, startY, endX, endY) {
    // Normalize coordinates
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    
    // Create wall object
    const wall = {
      startX: minX,
      startY: minY,
      endX: maxX,
      endY: maxY
    };
    
    this.walls.push(wall);
    this.render();
    this.updateURL();
  }

  addFurniture(x, y, type) {
    const furnitureItem = {
      x,
      y,
      type,
      ...this.furnitureLibrary[type]
    };
    
    this.furniture.push(furnitureItem);
    this.render();
    this.updateURL();
  }

  clearAll() {
    this.walls = [];
    this.furniture = [];
    this.render();
    this.updateURL();
  }

  render() {
    this.renderWalls();
    this.renderFurniture();
    this.renderDiorama();
  }

  renderWalls() {
    const wallContainer = document.getElementById('walls-container');
    wallContainer.innerHTML = '';
    
    this.walls.forEach(wall => {
      const wallElement = document.createElement('div');
      wallElement.className = 'wall';
      
      // Calculate wall dimensions
      const width = (wall.endX - wall.startX + 1) * this.gridSize;
      const height = (wall.endY - wall.startY + 1) * this.gridSize;
      const left = wall.startX * this.gridSize;
      const top = wall.startY * this.gridSize;
      
      wallElement.style.width = `${width}px`;
      wallElement.style.height = `${height}px`;
      wallElement.style.left = `${left}px`;
      wallElement.style.top = `${top}px`;
      
      wallContainer.appendChild(wallElement);
    });
  }

  renderFurniture() {
    const furnitureContainer = document.getElementById('furniture-container');
    furnitureContainer.innerHTML = '';
    
    this.furniture.forEach(item => {
      const furnitureElement = document.createElement('div');
      furnitureElement.className = 'furniture';
      furnitureElement.textContent = item.name.charAt(0);
      furnitureElement.title = item.name;
      
      // Position furniture
      const left = item.x * this.gridSize;
      const top = item.y * this.gridSize;
      const width = item.width * this.gridSize;
      const height = item.height * this.gridSize;
      
      furnitureElement.style.width = `${width}px`;
      furnitureElement.style.height = `${height}px`;
      furnitureElement.style.left = `${left}px`;
      furnitureElement.style.top = `${top}px`;
      furnitureElement.style.backgroundColor = item.color;
      
      furnitureContainer.appendChild(furnitureElement);
    });
  }

  renderDiorama() {
    const diorama = document.getElementById('diorama-svg');
    diorama.innerHTML = '';
    
    // Set viewBox for consistent sizing
    diorama.setAttribute('viewBox', '0 0 800 600');
    diorama.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    
    // Isometric projection settings
    const isoScale = 20;
    const offsetX = 400;
    const offsetY = 100;
    
    // Draw floor (isometric projection)
    this.drawIsometricFloor(diorama, offsetX, offsetY, isoScale);
    
    // Draw walls with isometric projection
    this.walls.forEach(wall => {
      this.drawIsometricWall(diorama, wall, offsetX, offsetY, isoScale);
    });
    
    // Draw furniture with isometric projection
    this.furniture.forEach(item => {
      this.drawIsometricFurniture(diorama, item, offsetX, offsetY, isoScale);
    });
  }

  // Draw isometric floor
  drawIsometricFloor(svg, offsetX, offsetY, scale) {
    // Define isometric floor points
    const points = [
      {x: offsetX, y: offsetY + 10 * scale},           // Bottom left
      {x: offsetX + 15 * scale, y: offsetY},          // Top center
      {x: offsetX + 30 * scale, y: offsetY + 10 * scale}, // Bottom right
      {x: offsetX + 15 * scale, y: offsetY + 20 * scale}  // Bottom center
    ];
    
    // Create floor polygon
    const floor = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
    floor.setAttribute('points', pointsStr);
    floor.setAttribute('fill', '#f0f0f0');
    floor.setAttribute('stroke', '#ccc');
    floor.setAttribute('stroke-width', '1');
    svg.appendChild(floor);
  }

  // Draw isometric wall
  drawIsometricWall(svg, wall, offsetX, offsetY, scale) {
    // Convert grid coordinates to isometric
    const startX = offsetX + wall.startX * scale;
    const startY = offsetY + wall.startY * scale;
    const endX = offsetX + wall.endX * scale;
    const endY = offsetY + wall.endY * scale;
    
    // Create isometric wall representation (simple approach)
    const wallGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Front face
    if (wall.endX > wall.startX) {
      const frontFace = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const points = [
        {x: startX, y: startY + 10 * scale},
        {x: endX, y: endY + 10 * scale},
        {x: endX, y: endY},
        {x: startX, y: startY}
      ];
      const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
      frontFace.setAttribute('points', pointsStr);
      frontFace.setAttribute('fill', '#8B4513');
      frontFace.setAttribute('stroke', '#5D2906');
      frontFace.setAttribute('stroke-width', '0.5');
      wallGroup.appendChild(frontFace);
    }
    
    // Side face
    if (wall.endY > wall.startY) {
      const sideFace = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const points = [
        {x: endX, y: endY + 10 * scale},
        {x: endX + 5 * scale, y: endY + 5 * scale},
        {x: endX + 5 * scale, y: endY - 5 * scale},
        {x: endX, y: endY}
      ];
      const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
      sideFace.setAttribute('points', pointsStr);
      sideFace.setAttribute('fill', '#6B3503');
      sideFace.setAttribute('stroke', '#5D2906');
      sideFace.setAttribute('stroke-width', '0.5');
      wallGroup.appendChild(sideFace);
    }
    
    svg.appendChild(wallGroup);
  }

  // Draw isometric furniture
  drawIsometricFurniture(svg, item, offsetX, offsetY, scale) {
    // Convert grid coordinates to isometric
    const x = offsetX + item.x * scale;
    const y = offsetY + item.y * scale;
    
    // Create isometric furniture representation
    const furnitureGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Base of furniture (top-down view in isometric)
    const base = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const widthScaled = item.width * scale;
    const heightScaled = item.height * scale;
    
    // Isometric base points
    const points = [
      {x: x, y: y},
      {x: x + widthScaled * 0.8, y: y - widthScaled * 0.3},
      {x: x + widthScaled * 0.8 + heightScaled * 0.5, y: y - widthScaled * 0.3 + heightScaled * 0.3},
      {x: x + heightScaled * 0.5, y: y + heightScaled * 0.3}
    ];
    
    const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
    base.setAttribute('points', pointsStr);
    base.setAttribute('fill', item.color);
    base.setAttribute('stroke', '#000');
    base.setAttribute('stroke-width', '0.5');
    furnitureGroup.appendChild(base);
    
    // Add 3D effect for some furniture
    if (item.type === 'couch' || item.type === 'bed') {
      // Backrest
      const back = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const backPoints = [
        {x: x, y: y},
        {x: x, y: y - heightScaled * 0.7},
        {x: x + widthScaled * 0.8, y: y - widthScaled * 0.3 - heightScaled * 0.7},
        {x: x + widthScaled * 0.8, y: y - widthScaled * 0.3}
      ];
      const backPointsStr = backPoints.map(p => `${p.x},${p.y}`).join(' ');
      back.setAttribute('points', backPointsStr);
      back.setAttribute('fill', this.darkenColor(item.color, 20));
      back.setAttribute('stroke', '#000');
      back.setAttribute('stroke-width', '0.5');
      furnitureGroup.appendChild(back);
    }
    
    // Add label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + widthScaled * 0.4);
    text.setAttribute('y', y - heightScaled * 0.2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '12');
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-weight', 'bold');
    text.textContent = item.name.charAt(0);
    furnitureGroup.appendChild(text);
    
    svg.appendChild(furnitureGroup);
  }

  // Helper function to darken a color
  darkenColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);
    
    R = Math.floor(R * (100 - percent) / 100);
    G = Math.floor(G * (100 - percent) / 100);
    B = Math.floor(B * (100 - percent) / 100);
    
    R = (R < 0) ? 0 : R;
    G = (G < 0) ? 0 : G;
    B = (B < 0) ? 0 : B;
    
    const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));
    
    return "#" + RR + GG + BB;
  }

  updateURL() {
    try {
      const state = {
        walls: this.walls,
        furniture: this.furniture
      };
      
      const jsonString = JSON.stringify(state);
      const compressed = this.compressString(jsonString);
      const url = new URL(window.location);
      url.searchParams.set('plan', compressed);
      window.history.replaceState({}, '', url);
    } catch (e) {
      console.warn('Could not update URL:', e);
    }
  }

  compressString(str) {
    // Simple base64 encoding for now
    return btoa(encodeURIComponent(str));
  }

  decompressString(compressed) {
    try {
      return decodeURIComponent(atob(compressed));
    } catch (e) {
      return null;
    }
  }

  loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    
    if (planParam) {
      try {
        const jsonString = this.decompressString(planParam);
        if (jsonString) {
          const state = JSON.parse(jsonString);
          this.walls = state.walls || [];
          this.furniture = state.furniture || [];
          return;
        }
      } catch (e) {
        console.warn('Could not load plan from URL:', e);
      }
    }
    
    // Load sample plan if none provided
    this.loadSamplePlan();
  }

  loadSamplePlan() {
    // Sample room: 2 walls forming a corner and some furniture
    this.walls = [
      { startX: 5, startY: 5, endX: 15, endY: 5 }, // Horizontal wall
      { startX: 15, startY: 5, endX: 15, endY: 12 }  // Vertical wall
    ];
    
    this.furniture = [
      {
        x: 7,
        y: 7,
        type: 'couch',
        name: 'Couch',
        width: 6,
        height: 3,
        color: '#8B4513'
      },
      {
        x: 9,
        y: 10,
        type: 'desk',
        name: 'Desk',
        width: 4,
        height: 2,
        color: '#696969'
      },
      {
        x: 12,
        y: 6,
        type: 'plant',
        name: 'Plant',
        width: 1,
        height: 1,
        color: '#228B22'
      }
    ];
    
    // Update URL with sample plan
    this.updateURL();
  }

  downloadDiorama() {
    const svg = document.getElementById('diorama-svg');
    
    // Create PNG version
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    // Set canvas size
    canvas.width = 800;
    canvas.height = 600;
    
    img.onload = function() {
      ctx.drawImage(img, 0, 0);
      
      // Download PNG
      const pngUrl = canvas.toDataURL('image/png');
      const pngLink = document.createElement('a');
      pngLink.href = pngUrl;
      pngLink.download = 'dollhouse-diorama.png';
      document.body.appendChild(pngLink);
      pngLink.click();
      document.body.removeChild(pngLink);
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    
    // Also download SVG
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const svgLink = document.createElement('a');
    svgLink.href = svgUrl;
    svgLink.download = 'dollhouse-diorama.svg';
    document.body.appendChild(svgLink);
    svgLink.click();
    document.body.removeChild(svgLink);
    URL.revokeObjectURL(svgUrl);
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.dollhouseApp = new DollhouseApp();
});
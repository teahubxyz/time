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
    diorama.setAttribute('viewBox', '0 0 600 400');
    diorama.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    
    // Draw floor
    const floor = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    floor.setAttribute('x', '50');
    floor.setAttribute('y', '100');
    floor.setAttribute('width', '500');
    floor.setAttribute('height', '250');
    floor.setAttribute('fill', '#f0f0f0');
    floor.setAttribute('stroke', '#ccc');
    diorama.appendChild(floor);
    
    // Draw walls
    this.walls.forEach(wall => {
      // Convert grid coordinates to isometric
      const startX = 50 + wall.startX * 10;
      const startY = 100 + wall.startY * 10;
      const endX = 50 + wall.endX * 10;
      const endY = 100 + wall.endY * 10;
      
      // Simple wall representation
      const wallLine = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      wallLine.setAttribute('x', startX);
      wallLine.setAttribute('y', startY);
      wallLine.setAttribute('width', (endX - startX) || 10);
      wallLine.setAttribute('height', (endY - startY) || 10);
      wallLine.setAttribute('fill', '#8B4513');
      diorama.appendChild(wallLine);
    });
    
    // Draw furniture
    this.furniture.forEach(item => {
      // Convert grid coordinates to isometric
      const x = 50 + item.x * 10;
      const y = 100 + item.y * 10;
      
      // Simple furniture representation
      const furnitureRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      furnitureRect.setAttribute('x', x);
      furnitureRect.setAttribute('y', y);
      furnitureRect.setAttribute('width', item.width * 10);
      furnitureRect.setAttribute('height', item.height * 10);
      furnitureRect.setAttribute('fill', item.color);
      furnitureRect.setAttribute('stroke', '#000');
      furnitureRect.setAttribute('stroke-width', '0.5');
      diorama.appendChild(furnitureRect);
      
      // Add label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x + item.width * 5);
      text.setAttribute('y', y + item.height * 5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '8');
      text.setAttribute('fill', '#fff');
      text.textContent = item.name.charAt(0);
      diorama.appendChild(text);
    });
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
      { startX: 2, startY: 2, endX: 10, endY: 2 }, // Horizontal wall
      { startX: 10, startY: 2, endX: 10, endY: 8 }  // Vertical wall
    ];
    
    this.furniture = [
      {
        x: 3,
        y: 3,
        type: 'couch',
        name: 'Couch',
        width: 6,
        height: 3,
        color: '#8B4513'
      },
      {
        x: 4,
        y: 6,
        type: 'desk',
        name: 'Desk',
        width: 4,
        height: 2,
        color: '#696969'
      }
    ];
  }

  downloadDiorama() {
    const svg = document.getElementById('diorama-svg');
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dollhouse-diorama.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.dollhouseApp = new DollhouseApp();
});
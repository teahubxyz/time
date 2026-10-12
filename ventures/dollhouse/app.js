// Dollhouse Application Logic
// Every rendered result — including the preloaded sample — comes from the same
// plan object through the same render path. Nothing is drawn from fixed points.

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
    this.previewWall = null;
    this.furnitureLibrary = {
      couch: { name: 'Couch', width: 6, height: 3, color: '#8B4513' },
      bed: { name: 'Bed', width: 6, height: 4, color: '#4682B4' },
      desk: { name: 'Desk', width: 4, height: 2, color: '#696969' },
      plant: { name: 'Plant', width: 1, height: 1, color: '#228B22' },
      tv: { name: 'TV', width: 3, height: 1, color: '#1a1a1a' }
    };

    this.init();
  }

  init() {
    this.createGrid();
    this.setupToolbar();
    this.setupEventListeners();
    this.loadFromURL();
    this.render();
  }

  // ---- sample is real input, not a canned picture ----

  samplePlan() {
    // A one-bedroom studio: outer walls, a short partition, and a realistic set
    // of furniture. This object is applied with applyPlan(), the same function
    // that loads a shared URL and that user edits flow through.
    return {
      walls: [
        { x1: 2, y1: 2, x2: 22, y2: 2 },
        { x1: 22, y1: 2, x2: 22, y2: 16 },
        { x1: 22, y1: 16, x2: 2, y2: 16 },
        { x1: 2, y1: 16, x2: 2, y2: 2 },
        { x1: 14, y1: 2, x2: 14, y2: 9 }
      ],
      furniture: [
        { type: 'bed', x: 4, y: 4 },
        { type: 'desk', x: 16, y: 4 },
        { type: 'couch', x: 4, y: 11 },
        { type: 'tv', x: 12, y: 14 },
        { type: 'plant', x: 19, y: 13 },
        { type: 'plant', x: 3, y: 3 }
      ]
    };
  }

  applyPlan(plan) {
    const walls = Array.isArray(plan && plan.walls) ? plan.walls : [];
    const furniture = Array.isArray(plan && plan.furniture) ? plan.furniture : [];
    this.walls = walls
      .map((w) => this.normalizeWall(w))
      .filter(Boolean);
    this.furniture = furniture
      .map((item) => this.normalizeFurniture(item))
      .filter(Boolean);
  }

  normalizeWall(w) {
    if (!w) return null;
    const x1 = this.clamp(this.num(w.x1 != null ? w.x1 : w.startX), 0, this.gridWidth - 1);
    const y1 = this.clamp(this.num(w.y1 != null ? w.y1 : w.startY), 0, this.gridHeight - 1);
    const x2 = this.clamp(this.num(w.x2 != null ? w.x2 : w.endX), 0, this.gridWidth - 1);
    const y2 = this.clamp(this.num(w.y2 != null ? w.y2 : w.endY), 0, this.gridHeight - 1);
    if (x1 === x2 && y1 === y2) return null;
    // Walls are axis-aligned segments. A diagonal drag snaps to the longer axis
    // so the diorama always reflects a real wall the user drew.
    if (x1 !== x2 && y1 !== y2) {
      if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) return { x1, y1, x2, y2: y1 };
      return { x1, y1, x2: x1, y2 };
    }
    return { x1, y1, x2, y2 };
  }

  normalizeFurniture(item) {
    if (!item || !this.furnitureLibrary[item.type]) return null;
    const spec = this.furnitureLibrary[item.type];
    const x = this.clamp(this.num(item.x), 0, this.gridWidth - spec.width);
    const y = this.clamp(this.num(item.y), 0, this.gridHeight - spec.height);
    return {
      type: item.type,
      x,
      y,
      name: spec.name,
      width: spec.width,
      height: spec.height,
      color: spec.color
    };
  }

  num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // ---- grid ----

  createGrid() {
    const gridContainer = document.getElementById('grid-container');
    gridContainer.innerHTML = '';
    gridContainer.style.width = `${this.gridWidth * this.gridSize}px`;
    gridContainer.style.height = `${this.gridHeight * this.gridSize}px`;

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
  }

  cellFromEvent(e) {
    const grid = document.getElementById('grid-container');
    const rect = grid.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.gridSize);
    const y = Math.floor((e.clientY - rect.top) / this.gridSize);
    if (x < 0 || y < 0 || x >= this.gridWidth || y >= this.gridHeight) return null;
    return { x, y };
  }

  setupEventListeners() {
    const gridContainer = document.getElementById('grid-container');

    gridContainer.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const cell = this.cellFromEvent(e);
      if (!cell) return;
      e.preventDefault();
      if (this.selectedTool === 'wall') {
        this.isDrawing = true;
        this.startPoint = cell;
        this.previewWall = null;
      } else if (this.selectedTool.indexOf('furniture-') === 0) {
        const furnitureType = this.selectedTool.slice('furniture-'.length);
        this.addFurniture(cell.x, cell.y, furnitureType);
      }
    });

    // Listen on the document so a drag that leaves the grid still finishes
    // on the last cell the pointer was over, which is how "drag to draw" works.
    document.addEventListener('mousemove', (e) => {
      if (!this.isDrawing || this.selectedTool !== 'wall' || !this.startPoint) return;
      const cell = this.cellFromEvent(e);
      if (!cell) return;
      const next = this.normalizeWall({
        x1: this.startPoint.x,
        y1: this.startPoint.y,
        x2: cell.x,
        y2: cell.y
      });
      this.previewWall = next;
      this.renderWalls();
    });

    document.addEventListener('mouseup', (e) => {
      if (!this.isDrawing || this.selectedTool !== 'wall') return;
      this.isDrawing = false;
      const cell = this.cellFromEvent(e) || this.previewEnd();
      const start = this.startPoint;
      this.startPoint = null;
      this.previewWall = null;
      if (start && cell) this.addWall(start.x, start.y, cell.x, cell.y);
      else this.renderWalls();
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      this.clearAll();
    });

    document.getElementById('download-btn').addEventListener('click', () => {
      this.downloadDiorama();
    });

    document.getElementById('copy-link-btn').addEventListener('click', () => {
      this.copyShareLink();
    });
  }

  previewEnd() {
    if (!this.previewWall) return null;
    return { x: this.previewWall.x2, y: this.previewWall.y2 };
  }

  setupToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.innerHTML = '';

    const wallBtn = document.createElement('button');
    wallBtn.type = 'button';
    wallBtn.className = 'tool-btn';
    wallBtn.dataset.tool = 'wall';
    wallBtn.textContent = 'Wall';
    wallBtn.title = 'Drag on the grid to draw a wall';
    toolbar.appendChild(wallBtn);

    Object.keys(this.furnitureLibrary).forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tool-btn';
      btn.dataset.tool = `furniture-${key}`;
      btn.textContent = this.furnitureLibrary[key].name;
      btn.title = `Drop a ${this.furnitureLibrary[key].name} on the grid`;
      toolbar.appendChild(btn);
    });

    toolbar.addEventListener('click', (e) => {
      const button = e.target.closest('[data-tool]');
      if (!button) return;
      this.selectTool(button.dataset.tool);
    });

    this.selectTool('wall');
  }

  selectTool(tool) {
    this.selectedTool = tool;
    this.isDrawing = false;
    this.startPoint = null;
    this.previewWall = null;
    document.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  addWall(x1, y1, x2, y2) {
    const wall = this.normalizeWall({ x1, y1, x2, y2 });
    if (!wall) return;
    const key = this.wallKey(wall);
    if (this.walls.some((w) => this.wallKey(w) === key)) return;
    this.walls.push(wall);
    this.render();
    this.updateURL();
  }

  wallKey(w) {
    const ax = Math.min(w.x1, w.x2);
    const ay = Math.min(w.y1, w.y2);
    const bx = Math.max(w.x1, w.x2);
    const by = Math.max(w.y1, w.y2);
    return `${ax},${ay},${bx},${by}`;
  }

  addFurniture(x, y, type) {
    const item = this.normalizeFurniture({ type, x, y });
    if (!item) return;
    this.furniture.push(item);
    this.render();
    this.updateURL();
  }

  clearAll() {
    this.walls = [];
    this.furniture = [];
    this.previewWall = null;
    this.render();
    this.updateURL();
  }

  // ---- render: grid overlay and diorama both read this.walls / this.furniture ----

  render() {
    this.renderWalls();
    this.renderFurniture();
    this.renderDiorama();
    this.renderShare();
  }

  renderWalls() {
    const wallContainer = document.getElementById('walls-container');
    wallContainer.innerHTML = '';
    const draw = (wall, preview) => {
      const el = document.createElement('div');
      el.className = preview ? 'wall wall-preview' : 'wall';
      const horizontal = wall.y1 === wall.y2;
      const x = Math.min(wall.x1, wall.x2);
      const y = Math.min(wall.y1, wall.y2);
      const length = horizontal
        ? Math.abs(wall.x2 - wall.x1)
        : Math.abs(wall.y2 - wall.y1);
      const thickness = 0.35;
      if (horizontal) {
        el.style.left = `${x * this.gridSize}px`;
        el.style.top = `${(y - thickness / 2) * this.gridSize}px`;
        el.style.width = `${length * this.gridSize}px`;
        el.style.height = `${Math.max(4, thickness * this.gridSize)}px`;
      } else {
        el.style.left = `${(x - thickness / 2) * this.gridSize}px`;
        el.style.top = `${y * this.gridSize}px`;
        el.style.width = `${Math.max(4, thickness * this.gridSize)}px`;
        el.style.height = `${length * this.gridSize}px`;
      }
      wallContainer.appendChild(el);
    };
    this.walls.forEach((wall) => draw(wall, false));
    if (this.previewWall) draw(this.previewWall, true);
  }

  renderFurniture() {
    const furnitureContainer = document.getElementById('furniture-container');
    furnitureContainer.innerHTML = '';
    this.furniture.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'furniture';
      el.textContent = item.name;
      el.title = item.name;
      el.style.left = `${item.x * this.gridSize}px`;
      el.style.top = `${item.y * this.gridSize}px`;
      el.style.width = `${item.width * this.gridSize}px`;
      el.style.height = `${item.height * this.gridSize}px`;
      el.style.backgroundColor = item.color;
      el.addEventListener('mousedown', (e) => {
        if (this.selectedTool === 'wall') return;
        e.stopPropagation();
        e.preventDefault();
        this.dragFurniture(index, e);
      });
      furnitureContainer.appendChild(el);
    });
  }

  dragFurniture(index, downEvent) {
    const item = this.furniture[index];
    if (!item) return;
    const origin = this.cellFromEvent(downEvent);
    if (!origin) return;
    const dx = item.x - origin.x;
    const dy = item.y - origin.y;
    const move = (e) => {
      const cell = this.cellFromEvent(e);
      if (!cell) return;
      const next = this.normalizeFurniture({
        type: item.type,
        x: cell.x + dx,
        y: cell.y + dy
      });
      if (!next) return;
      this.furniture[index] = next;
      this.render();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      this.updateURL();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // ---- isometric diorama: geometry is derived from the plan, never fixed ----

  planBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const touch = (x, y) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    this.walls.forEach((w) => {
      touch(w.x1, w.y1);
      touch(w.x2, w.y2);
    });
    this.furniture.forEach((item) => {
      touch(item.x, item.y);
      touch(item.x + item.width, item.y + item.height);
    });
    if (!Number.isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 12, maxY: 10 };
    }
    const pad = 1;
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad
    };
  }

  renderDiorama() {
    const svg = document.getElementById('diorama-svg');
    const bounds = this.planBounds();
    const spanX = Math.max(4, bounds.maxX - bounds.minX);
    const spanY = Math.max(4, bounds.maxY - bounds.minY);
    // Classic 2:1 isometric. Scale so the room, its walls and furniture fit.
    const tile = Math.min(28, Math.floor(Math.min(520 / spanX, 340 / spanY)));
    const wallH = Math.round(tile * 1.35);
    const project = (gx, gy, gz) => {
      const x = (gx - bounds.minX) * tile;
      const y = (gy - bounds.minY) * tile;
      const z = (gz || 0);
      return {
        x: (x - y) * 0.5,
        y: (x + y) * 0.25 - z
      };
    };

    const corners = [
      project(bounds.minX, bounds.minY, 0),
      project(bounds.maxX, bounds.minY, 0),
      project(bounds.maxX, bounds.maxY, 0),
      project(bounds.minX, bounds.maxY, 0),
      project(bounds.minX, bounds.minY, wallH),
      project(bounds.maxX, bounds.minY, wallH),
      project(bounds.maxX, bounds.maxY, wallH),
      project(bounds.minX, bounds.maxY, wallH)
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const pad = 28;
    const minPX = Math.min.apply(null, xs) - pad;
    const maxPX = Math.max.apply(null, xs) + pad;
    const minPY = Math.min.apply(null, ys) - pad;
    const maxPY = Math.max.apply(null, ys) + pad;
    const width = Math.ceil(maxPX - minPX);
    const height = Math.ceil(maxPY - minPY);
    const ox = -minPX;
    const oy = -minPY;
    const P = (gx, gy, gz) => {
      const p = project(gx, gy, gz);
      return { x: p.x + ox, y: p.y + oy };
    };

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '400');

    const ns = 'http://www.w3.org/2000/svg';
    const poly = (points, attrs) => {
      const el = document.createElementNS(ns, 'polygon');
      el.setAttribute('points', points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      return el;
    };
    const line = (a, b, attrs) => {
      const el = document.createElementNS(ns, 'line');
      el.setAttribute('x1', a.x.toFixed(1));
      el.setAttribute('y1', a.y.toFixed(1));
      el.setAttribute('x2', b.x.toFixed(1));
      el.setAttribute('y2', b.y.toFixed(1));
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      return el;
    };

    const root = document.createElementNS(ns, 'g');
    root.setAttribute('id', 'diorama-scene');

    // Floor is the bounding diamond of the actual plan, not a fixed rectangle.
    const floor = poly(
      [
        P(bounds.minX, bounds.minY, 0),
        P(bounds.maxX, bounds.minY, 0),
        P(bounds.maxX, bounds.maxY, 0),
        P(bounds.minX, bounds.maxY, 0)
      ],
      { fill: '#f4efe6', stroke: '#d9d0c1', 'stroke-width': '1' }
    );
    root.appendChild(floor);

    // Faint grid so the diorama reads as the same plan the user drew.
    for (let gx = Math.ceil(bounds.minX); gx <= bounds.maxX; gx++) {
      root.appendChild(line(
        P(gx, bounds.minY, 0),
        P(gx, bounds.maxY, 0),
        { stroke: '#e6dfd2', 'stroke-width': '0.6' }
      ));
    }
    for (let gy = Math.ceil(bounds.minY); gy <= bounds.maxY; gy++) {
      root.appendChild(line(
        P(bounds.minX, gy, 0),
        P(bounds.maxX, gy, 0),
        { stroke: '#e6dfd2', 'stroke-width': '0.6' }
      ));
    }

    // Furniture sits on the floor, painted before walls so walls can occlude it
    // only where a wall is actually in front. Sort back-to-front by depth.
    const pieces = this.furniture
      .map((item, index) => ({ item, index, depth: item.x + item.y }))
      .sort((a, b) => a.depth - b.depth);
    pieces.forEach(({ item }) => {
      root.appendChild(this.furnitureGroup(item, P, wallH, ns, poly));
    });

    // Walls are extruded segments of the walls the user (or the sample) drew.
    const wallPieces = this.walls
      .map((wall, index) => ({ wall, index, depth: wall.x1 + wall.y1 + wall.x2 + wall.y2 }))
      .sort((a, b) => a.depth - b.depth);
    wallPieces.forEach(({ wall }) => {
      root.appendChild(this.wallGroup(wall, P, wallH, ns, poly));
    });

    if (this.walls.length === 0 && this.furniture.length === 0) {
      const note = document.createElementNS(ns, 'text');
      const c = P((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, 0);
      note.setAttribute('x', c.x.toFixed(1));
      note.setAttribute('y', c.y.toFixed(1));
      note.setAttribute('text-anchor', 'middle');
      note.setAttribute('fill', '#8a8175');
      note.setAttribute('font-size', '14');
      note.setAttribute('font-family', 'sans-serif');
      note.textContent = 'Drag walls on the grid to start your room';
      root.appendChild(note);
    }

    svg.innerHTML = '';
    svg.appendChild(root);
    this._lastScene = { width, height };
  }

  wallGroup(wall, P, wallH, ns, poly) {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'iso-wall');
    const thickness = 0.28;
    const horizontal = wall.y1 === wall.y2;
    const x1 = Math.min(wall.x1, wall.x2);
    const x2 = Math.max(wall.x1, wall.x2);
    const y1 = Math.min(wall.y1, wall.y2);
    const y2 = Math.max(wall.y1, wall.y2);

    // A wall is a thin box standing on the segment between its two endpoints.
    let a, b, c, d;
    if (horizontal) {
      a = { x: x1, y: y1 - thickness / 2 };
      b = { x: x2, y: y1 - thickness / 2 };
      c = { x: x2, y: y1 + thickness / 2 };
      d = { x: x1, y: y1 + thickness / 2 };
    } else {
      a = { x: x1 - thickness / 2, y: y1 };
      b = { x: x1 + thickness / 2, y: y1 };
      c = { x: x1 + thickness / 2, y: y2 };
      d = { x: x1 - thickness / 2, y: y2 };
    }
    const top = [P(a.x, a.y, wallH), P(b.x, b.y, wallH), P(c.x, c.y, wallH), P(d.x, d.y, wallH)];
    const faceA = [P(a.x, a.y, 0), P(b.x, b.y, 0), P(b.x, b.y, wallH), P(a.x, a.y, wallH)];
    const faceB = [P(b.x, b.y, 0), P(c.x, c.y, 0), P(c.x, c.y, wallH), P(b.x, b.y, wallH)];
    const faceC = [P(d.x, d.y, 0), P(c.x, c.y, 0), P(c.x, c.y, wallH), P(d.x, d.y, wallH)];
    const faceD = [P(a.x, a.y, 0), P(d.x, d.y, 0), P(d.x, d.y, wallH), P(a.x, a.y, wallH)];

    // Painter's order: the two faces the camera can see, then the top.
    g.appendChild(poly(faceC, { fill: '#c4b29a', stroke: '#8d7b66', 'stroke-width': '0.6' }));
    g.appendChild(poly(faceB, { fill: '#b7a48c', stroke: '#8d7b66', 'stroke-width': '0.6' }));
    g.appendChild(poly(faceA, { fill: '#d8c7b0', stroke: '#8d7b66', 'stroke-width': '0.6' }));
    g.appendChild(poly(faceD, { fill: '#cbbba4', stroke: '#8d7b66', 'stroke-width': '0.6' }));
    g.appendChild(poly(top, { fill: '#efe4d4', stroke: '#8d7b66', 'stroke-width': '0.8' }));
    return g;
  }

  furnitureGroup(item, P, wallH, ns, poly) {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', `iso-furniture iso-${item.type}`);
    const heights = { couch: 0.55, bed: 0.42, desk: 0.7, plant: 0.9, tv: 0.85 };
    const h = (heights[item.type] || 0.5) * wallH;
    const x = item.x;
    const y = item.y;
    const w = item.width;
    const d = item.height;
    const box = (x0, y0, w0, d0, z0, z1, top, left, right) => {
      const p = (px, py, pz) => P(px, py, pz);
      g.appendChild(poly(
        [p(x0, y0 + d0, z0), p(x0 + w0, y0 + d0, z0), p(x0 + w0, y0 + d0, z1), p(x0, y0 + d0, z1)],
        { fill: left, stroke: 'rgba(0,0,0,0.25)', 'stroke-width': '0.5' }
      ));
      g.appendChild(poly(
        [p(x0 + w0, y0, z0), p(x0 + w0, y0 + d0, z0), p(x0 + w0, y0 + d0, z1), p(x0 + w0, y0, z1)],
        { fill: right, stroke: 'rgba(0,0,0,0.25)', 'stroke-width': '0.5' }
      ));
      g.appendChild(poly(
        [p(x0, y0, z1), p(x0 + w0, y0, z1), p(x0 + w0, y0 + d0, z1), p(x0, y0 + d0, z1)],
        { fill: top, stroke: 'rgba(0,0,0,0.3)', 'stroke-width': '0.6' }
      ));
    };

    const top = item.color;
    const left = this.darkenColor(item.color, 18);
    const right = this.darkenColor(item.color, 32);

    if (item.type === 'couch') {
      box(x + 0.15, y + 0.7, w - 0.3, d - 0.85, 0, h * 0.55, top, left, right);
      box(x + 0.15, y + 0.15, w - 0.3, 0.55, 0, h, this.darkenColor(item.color, 8), left, right);
      box(x, y + 0.3, 0.28, d - 0.5, 0, h * 0.75, left, right, right);
      box(x + w - 0.28, y + 0.3, 0.28, d - 0.5, 0, h * 0.75, left, right, right);
    } else if (item.type === 'bed') {
      box(x + 0.15, y + 0.9, w - 0.3, d - 1.05, 0, h * 0.7, '#f7f3ee', '#e4ddd4', '#d5cdc3');
      box(x + 0.2, y + 0.15, w - 0.4, 0.7, 0, h, top, left, right);
      box(x + 0.45, y + 1.15, w * 0.38, 0.7, h * 0.7, h * 0.95, '#ffffff', '#eeeae4', '#e0dbd4');
      box(x + w * 0.55, y + 1.15, w * 0.35, 0.7, h * 0.7, h * 0.95, '#f3efe8', '#e7e1d8', '#d9d2c8');
    } else if (item.type === 'desk') {
      box(x + 0.15, y + 0.15, 0.28, d - 0.3, 0, h * 0.92, left, right, right);
      box(x + w - 0.43, y + 0.15, 0.28, d - 0.3, 0, h * 0.92, left, right, right);
      box(x, y, w, d, h * 0.92, h, top, left, right);
    } else if (item.type === 'plant') {
      const cx = x + w / 2;
      const cy = y + d / 2;
      box(cx - 0.28, cy - 0.28, 0.56, 0.56, 0, h * 0.38, '#c4a574', '#a8885c', '#8c7048');
      const leaf = (ox, oy, s, color) => {
        g.appendChild(poly(
          [
            P(cx + ox, cy + oy, h * 0.35),
            P(cx + ox + s, cy + oy - s * 0.2, h * 0.85),
            P(cx + ox, cy + oy, h),
            P(cx + ox - s * 0.3, cy + oy + s * 0.4, h * 0.8)
          ],
          { fill: color, stroke: '#145214', 'stroke-width': '0.4' }
        ));
      };
      leaf(-0.05, 0.05, 0.55, '#2e8b2e');
      leaf(0.1, -0.05, 0.5, '#228B22');
      leaf(-0.15, -0.1, 0.42, '#3cb043');
    } else if (item.type === 'tv') {
      box(x + w * 0.4, y + d * 0.25, w * 0.2, d * 0.5, 0, h * 0.28, '#4a4a4a', '#333', '#222');
      box(x, y + d * 0.15, w, d * 0.35, h * 0.28, h, '#1c1c1c', '#111', '#000');
      g.appendChild(poly(
        [
          P(x + 0.18, y + d * 0.15, h * 0.4),
          P(x + w - 0.18, y + d * 0.15, h * 0.4),
          P(x + w - 0.18, y + d * 0.15, h * 0.9),
          P(x + 0.18, y + d * 0.15, h * 0.9)
        ],
        { fill: '#3a6ea5', stroke: '#0e0e0e', 'stroke-width': '0.4' }
      ));
    } else {
      box(x, y, w, d, 0, h, top, left, right);
    }

    const label = document.createElementNS(ns, 'text');
    const c = P(x + w / 2, y + d / 2, h + 2);
    label.setAttribute('x', c.x.toFixed(1));
    label.setAttribute('y', c.y.toFixed(1));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#3d342b');
    label.setAttribute('font-size', '11');
    label.setAttribute('font-family', 'sans-serif');
    label.textContent = item.name;
    g.appendChild(label);
    return g;
  }

  darkenColor(color, percent) {
    const hex = String(color || '#888888').replace('#', '');
    const full = hex.length === 3
      ? hex.split('').map((c) => c + c).join('')
      : hex.padEnd(6, '0').slice(0, 6);
    let R = parseInt(full.substring(0, 2), 16);
    let G = parseInt(full.substring(2, 4), 16);
    let B = parseInt(full.substring(4, 6), 16);
    R = Math.max(0, Math.floor(R * (100 - percent) / 100));
    G = Math.max(0, Math.floor(G * (100 - percent) / 100));
    B = Math.max(0, Math.floor(B * (100 - percent) / 100));
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(R)}${h(G)}${h(B)}`;
  }

  // ---- URL: the whole plan, nothing else ----

  planState() {
    return {
      walls: this.walls.map((w) => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
      furniture: this.furniture.map((item) => ({ type: item.type, x: item.x, y: item.y }))
    };
  }

  updateURL() {
    try {
      const compressed = this.compressString(JSON.stringify(this.planState()));
      const url = new URL(window.location.href);
      url.searchParams.set('plan', compressed);
      window.history.replaceState({}, '', url);
      this.renderShare();
    } catch (e) {
      console.warn('Could not update URL:', e);
    }
  }

  renderShare() {
    const el = document.getElementById('share-url');
    if (!el) return;
    el.textContent = window.location.href;
  }

  copyShareLink() {
    const url = window.location.href;
    const done = () => {
      const btn = document.getElementById('copy-link-btn');
      if (!btn) return;
      const previous = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = previous; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => this.fallbackCopy(url, done));
    } else {
      this.fallbackCopy(url, done);
    }
  }

  fallbackCopy(url, done) {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(input);
    if (done) done();
  }

  compressString(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  decompressString(compressed) {
    try {
      let b64 = String(compressed).replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return decodeURIComponent(escape(atob(b64)));
    } catch (e) {
      return null;
    }
  }

  loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    if (planParam) {
      const jsonString = this.decompressString(planParam);
      if (jsonString) {
        try {
          this.applyPlan(JSON.parse(jsonString));
          return;
        } catch (e) {
          console.warn('Could not load plan from URL:', e);
        }
      }
    }
    // First load: the sample is input, applied through the same code path.
    this.applyPlan(this.samplePlan());
    this.updateURL();
  }

  downloadDiorama() {
    const svg = document.getElementById('diorama-svg');
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const vb = (svg.getAttribute('viewBox') || '0 0 800 600').split(/[\s,]+/).map(Number);
    const width = vb[2] || 800;
    const height = vb[3] || 600;
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    if (!clone.querySelector('rect.poster-bg')) {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('class', 'poster-bg');
      bg.setAttribute('x', '0');
      bg.setAttribute('y', '0');
      bg.setAttribute('width', String(width));
      bg.setAttribute('height', String(height));
      bg.setAttribute('fill', '#f7f4ef');
      clone.insertBefore(bg, clone.firstChild);
    }
    const svgData = new XMLSerializer().serializeToString(clone);

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    this.triggerDownload(svgUrl, 'dollhouse-diorama.svg');
    setTimeout(() => URL.revokeObjectURL(svgUrl), 1000);

    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#f7f4ef';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        this.triggerDownload(pngUrl, 'dollhouse-diorama.png');
        setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  }

  triggerDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dollhouseApp = new DollhouseApp();
});

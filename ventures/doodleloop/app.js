// Doodleloop App Logic

class DoodleloopApp {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.animationCanvas = null;
        this.animationCtx = null;
        this.originalImage = null;
        this.motionStyle = 'ink-ripple';
        this.intensity = 50;
        this.speed = 50;
        this.isAnimating = false;
        this.animationFrameId = null;
        this.sampleImageData = 'data:image/svg+xml;base64,' + btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
                <rect width="400" height="400" fill="#f0f8ff"/>
                <circle cx="100" cy="100" r="40" fill="#FFD700"/>
                <circle cx="90" cy="90" r="5" fill="#000"/>
                <circle cx="110" cy="90" r="5" fill="#000"/>
                <path d="M 85 120 Q 100 140 115 120" stroke="#000" fill="none" stroke-width="3"/>
                <rect x="200" y="150" width="120" height="80" rx="10" fill="#8B4513"/>
                <rect x="210" y="100" width="100" height="50" rx="5" fill="#ADD8E6"/>
                <rect x="240" y="80" width="40" height="30" fill="#FF6347"/>
                <polygon points="260,60 250,80 270,80" fill="#006400"/>
                <text x="50" y="300" font-family="Arial" font-size="20" fill="#333">Draw something!</text>
                <text x="50" y="330" font-family="Arial" font-size="16" fill="#666">Drop image or use sample</text>
            </svg>
        `);
        
        this.motionStyles = {
            'ink-ripple': { name: 'Ink Ripple', effect: this.inkRippleEffect.bind(this) },
            'van-gogh-swirl': { name: 'Van Gogh Swirl', effect: this.vanGoghSwirlEffect.bind(this) },
            'watercolor-bleed': { name: 'Watercolor Bleed', effect: this.watercolorBleedEffect.bind(this) },
            'paper-cut-bob': { name: 'Paper-Cut Bob', effect: this.paperCutBobEffect.bind(this) },
            'neon-pulse': { name: 'Neon Pulse', effect: this.neonPulseEffect.bind(this) },
            'falling-snow': { name: 'Falling Snow', effect: this.fallingSnowEffect.bind(this) },
            'fire-flicker': { name: 'Fire Flicker', effect: this.fireFlickerEffect.bind(this) },
            'bubble-pop': { name: 'Bubble Pop', effect: this.bubblePopEffect.bind(this) },
            'lightning-flash': { name: 'Lightning Flash', effect: this.lightningFlashEffect.bind(this) },
            'earthquake-shake': { name: 'Earthquake Shake', effect: this.earthquakeShakeEffect.bind(this) },
            'ocean-wave': { name: 'Ocean Wave', effect: this.oceanWaveEffect.bind(this) },
            'magic-sparkle': { name: 'Magic Sparkle', effect: this.magicSparkleEffect.bind(this) }
        };
        
        this.init();
    }
    
    init() {
        this.setupElements();
        this.setupEventListeners();
        this.loadSampleImage();
    }
    
    setupElements() {
        // Main canvas for original image
        this.canvas = document.getElementById('original-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Animation canvas for effects
        this.animationCanvas = document.getElementById('animation-canvas');
        this.animationCtx = this.animationCanvas.getContext('2d');
        
        // Set canvas sizes
        this.canvas.width = 400;
        this.canvas.height = 400;
        this.animationCanvas.width = 400;
        this.animationCanvas.height = 400;
    }
    
    setupEventListeners() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const styleSelect = document.getElementById('motion-style');
        const intensitySlider = document.getElementById('intensity-slider');
        const speedSlider = document.getElementById('speed-slider');
        const exportBtn = document.getElementById('export-btn');
        const sampleBtn = document.getElementById('sample-btn');
        
        // Drag and drop events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });
        
        // Click to upload
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.handleFile(e.target.files[0]);
            }
        });
        
        // Motion style selection
        styleSelect.addEventListener('change', (e) => {
            this.motionStyle = e.target.value;
            if (this.originalImage) {
                this.startAnimation();
            }
        });
        
        // Slider events
        intensitySlider.addEventListener('input', (e) => {
            this.intensity = parseInt(e.target.value);
            if (this.originalImage) {
                this.startAnimation();
            }
        });
        
        speedSlider.addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            if (this.originalImage) {
                this.startAnimation();
            }
        });
        
        // Sample button
        sampleBtn.addEventListener('click', () => {
            this.loadSampleImage();
        });
        
        // Export button
        exportBtn.addEventListener('click', () => {
            this.exportGIF();
        });
    }
    
    handleFile(file) {
        if (!file.type.match('image.*')) {
            alert('Please select an image file');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.loadImage(e.target.result);
        };
        reader.readAsDataURL(file);
    }
    
    loadImage(src) {
        const img = new Image();
        img.onload = () => {
            this.originalImage = img;
            this.drawOriginalImage();
            this.startAnimation();
        };
        img.src = src;
    }
    
    loadSampleImage() {
        this.loadImage(this.sampleImageData);
    }
    
    drawOriginalImage() {
        if (!this.originalImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw image centered and scaled to fit
        const imgRatio = this.originalImage.width / this.originalImage.height;
        const canvasRatio = this.canvas.width / this.canvas.height;
        let drawWidth, drawHeight, offsetX, offsetY;
        
        if (imgRatio > canvasRatio) {
            // Image is wider relative to height
            drawWidth = this.canvas.width;
            drawHeight = this.canvas.width / imgRatio;
            offsetX = 0;
            offsetY = (this.canvas.height - drawHeight) / 2;
        } else {
            // Image is taller relative to width
            drawHeight = this.canvas.height;
            drawWidth = this.canvas.height * imgRatio;
            offsetX = (this.canvas.width - drawWidth) / 2;
            offsetY = 0;
        }
        
        this.ctx.drawImage(this.originalImage, offsetX, offsetY, drawWidth, drawHeight);
    }
    
    startAnimation() {
        if (!this.originalImage) return;
        
        // Cancel any ongoing animation
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Clear animation canvas
        this.animationCtx.clearRect(0, 0, this.animationCanvas.width, this.animationCanvas.height);
        
        // Start new animation
        this.isAnimating = true;
        this.animate();
    }
    
    animate() {
        if (!this.isAnimating) return;
        
        // Clear previous frame
        this.animationCtx.clearRect(0, 0, this.animationCanvas.width, this.animationCanvas.height);
        
        // Apply selected effect
        const effect = this.motionStyles[this.motionStyle].effect;
        effect();
        
        // Continue animation loop
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
    
    // Motion Effects
    
    inkRippleEffect() {
        const time = Date.now() * (this.speed / 1000);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create ripple pattern
        for (let i = 0; i < 5; i++) {
            const radius = (time % 1000) / 10 + i * 30;
            const alpha = Math.max(0, 1 - (radius / 100));
            
            ctx.beginPath();
            ctx.arc(width/2, height/2, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(30, 144, 255, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    
    vanGoghSwirlEffect() {
        const time = Date.now() * (this.speed / 500);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        ctx.save();
        ctx.translate(width/2, height/2);
        ctx.rotate(Math.sin(time/100) * 0.2);
        
        // Create swirling pattern
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 4 + time/100;
            const radius = 20 + i * 5;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = `hsl(${angle * 20}, 80%, 60%)`;
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    watercolorBleedEffect() {
        const time = Date.now() * (this.speed / 1000);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create soft bleeding colors
        ctx.globalAlpha = 0.1;
        for (let i = 0; i < 10; i++) {
            const x = (Math.sin(time/200 + i) * width/3) + width/2;
            const y = (Math.cos(time/150 + i) * height/3) + height/2;
            const radius = 30 + Math.sin(time/100 + i) * 20;
            
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `hsla(${(time/10 + i*30) % 360}, 80%, 60%, 0.8)`);
            gradient.addColorStop(1, `hsla(${(time/10 + i*30) % 360}, 80%, 60%, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    
    paperCutBobEffect() {
        const time = Date.now() * (this.speed / 500);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create bobbing paper cut effect
        ctx.save();
        ctx.translate(0, Math.sin(time/50) * 5);
        
        // Draw some geometric shapes that bob
        ctx.fillStyle = 'rgba(255, 99, 71, 0.7)';
        ctx.fillRect(width/4, height/3, 50, 50);
        
        ctx.fillStyle = 'rgba(60, 179, 113, 0.7)';
        ctx.beginPath();
        ctx.moveTo(width/2, height/2);
        ctx.lineTo(width/2 + 40, height/2 + 40);
        ctx.lineTo(width/2 - 40, height/2 + 40);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
    
    neonPulseEffect() {
        const time = Date.now() * (this.speed / 200);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create pulsing neon glow
        const pulse = Math.abs(Math.sin(time/100)) * 0.8 + 0.2;
        
        ctx.shadowBlur = 20 * pulse;
        ctx.shadowColor = '#00ffff';
        ctx.strokeStyle = `rgba(0, 255, 255, ${pulse})`;
        ctx.lineWidth = 3;
        
        ctx.beginPath();
        ctx.rect(50, 50, width-100, height-100);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
    }
    
    fallingSnowEffect() {
        const time = Date.now() * (this.speed / 300);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create falling snow
        for (let i = 0; i < 50; i++) {
            const x = (Math.sin(time/50 + i) * width/2) + width/2;
            const y = (time/5 + i * 20) % (height + 50);
            
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
        }
    }
    
    fireFlickerEffect() {
        const time = Date.now() * (this.speed / 100);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create flickering fire effect at bottom
        ctx.globalCompositeOperation = 'screen';
        
        for (let i = 0; i < 30; i++) {
            const x = (i / 30) * width;
            const flicker = Math.abs(Math.sin(time/100 + i));
            const heightFactor = 30 + flicker * 40;
            
            const gradient = ctx.createLinearGradient(x, height, x, height - heightFactor);
            gradient.addColorStop(0, 'rgba(255, 100, 0, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.6)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x - 5, height - heightFactor, 10, heightFactor);
        }
        
        ctx.globalCompositeOperation = 'source-over';
    }
    
    bubblePopEffect() {
        const time = Date.now() * (this.speed / 200);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create popping bubbles
        for (let i = 0; i < 20; i++) {
            const phase = (time/100 + i) % 10;
            const size = Math.min(phase * 5, 25);
            const x = (i * 37) % width;
            const y = height - ((time/20 + i * 10) % (height + 50));
            
            if (phase < 5) {
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(173, 216, 230, ${1 - phase/5})`;
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Add shine
                ctx.beginPath();
                ctx.arc(x - size/3, y - size/3, size/4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.fill();
            }
        }
    }
    
    lightningFlashEffect() {
        const time = Date.now() * (this.speed / 100);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Random lightning flashes
        if (Math.random() < 0.02) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(0, 0, width, height);
            
            // Lightning bolt
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(width/2, 0);
            ctx.lineTo(width/2 - 20, height/3);
            ctx.lineTo(width/2 + 30, height/2);
            ctx.lineTo(width/2 - 10, height*2/3);
            ctx.lineTo(width/2 + 20, height);
            ctx.stroke();
        }
    }
    
    earthquakeShakeEffect() {
        const time = Date.now() * (this.speed / 50);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Screen shake effect
        const shakeX = Math.sin(time/10) * 3;
        const shakeY = Math.cos(time/15) * 3;
        
        ctx.save();
        ctx.translate(shakeX, shakeY);
        
        // Cracks appearing
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.7)';
        ctx.lineWidth = 2;
        
        for (let i = 0; i < 5; i++) {
            const offset = i * 50;
            ctx.beginPath();
            ctx.moveTo(offset, height/2 + Math.sin(time/20 + i) * 10);
            ctx.lineTo(offset + 30, height/2 + Math.sin(time/20 + i + 1) * 15);
            ctx.lineTo(offset + 60, height/2 + Math.sin(time/20 + i + 2) * 5);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    oceanWaveEffect() {
        const time = Date.now() * (this.speed / 200);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Wave motion
        ctx.beginPath();
        ctx.moveTo(0, height - 50);
        
        for (let x = 0; x <= width; x += 10) {
            const y = height - 50 + Math.sin(x/30 + time/50) * 20;
            ctx.lineTo(x, y);
        }
        
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        
        const gradient = ctx.createLinearGradient(0, height - 70, 0, height);
        gradient.addColorStop(0, 'rgba(30, 144, 255, 0.6)');
        gradient.addColorStop(1, 'rgba(0, 100, 200, 0.3)');
        
        ctx.fillStyle = gradient;
        ctx.fill();
    }
    
    magicSparkleEffect() {
        const time = Date.now() * (this.speed / 100);
        const ctx = this.animationCtx;
        const width = this.animationCanvas.width;
        const height = this.animationCanvas.height;
        
        // Create magical sparkles
        for (let i = 0; i < 30; i++) {
            const x = (i * 47) % width;
            const y = (i * 31) % height;
            const sparkle = Math.abs(Math.sin(time/100 + i));
            
            ctx.beginPath();
            ctx.arc(x, y, sparkle * 3, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${(time/10 + i*12) % 360}, 100%, 70%, ${sparkle})`;
            ctx.fill();
            
            // Star shape
            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
                const angle = (j * 2 * Math.PI / 5) - Math.PI/2;
                const outerRadius = sparkle * 5;
                const innerRadius = sparkle * 2;
                
                const outerX = x + Math.cos(angle) * outerRadius;
                const outerY = y + Math.sin(angle) * outerRadius;
                const innerAngle = angle + Math.PI / 5;
                const innerX = x + Math.cos(innerAngle) * innerRadius;
                const innerY = y + Math.sin(innerAngle) * innerRadius;
                
                if (j === 0) {
                    ctx.moveTo(outerX, outerY);
                } else {
                    ctx.lineTo(innerX, innerY);
                }
                ctx.lineTo(outerX, outerY);
            }
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 215, 0, ${sparkle * 0.7})`;
            ctx.fill();
        }
    }
    
    exportGIF() {
        alert('GIF export would be implemented here. In a full implementation, this would generate an animated GIF using the canvas frames.');
        // In a real implementation, we would use a library like gif.js to encode the animation
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.doodleloopApp = new DoodleloopApp();
});
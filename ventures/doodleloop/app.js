// Doodleloop — local canvas animation. Sample and user photos share one path.
// GIF bytes are encoded here (LZW + a stored ZIP via CompressionStream). No upload.

(function () {
    "use strict";

    var SIZE = 400;
    var STYLES = [
        { id: "ink-ripple", name: "Ink Ripple" },
        { id: "van-gogh-swirl", name: "Van Gogh Swirl" },
        { id: "watercolor-bleed", name: "Watercolor Bleed" },
        { id: "paper-cut-bob", name: "Paper-Cut Bob" },
        { id: "neon-pulse", name: "Neon Pulse" },
        { id: "falling-snow", name: "Falling Snow" },
        { id: "fire-flicker", name: "Fire Flicker" },
        { id: "bubble-pop", name: "Bubble Pop" },
        { id: "lightning-flash", name: "Lightning Flash" },
        { id: "earthquake-shake", name: "Earthquake Shake" },
        { id: "ocean-wave", name: "Ocean Wave" },
        { id: "magic-sparkle", name: "Magic Sparkle" }
    ];

    function DoodleloopApp() {
        this.source = null;          // ImageData of the fitted drawing (the real input)
        this.sourceCanvas = null;
        this.motionStyle = "ink-ripple";
        this.intensity = 50;
        this.speed = 50;
        this.playing = false;
        this.raf = 0;
        this.t0 = 0;
        this.frame = 0;
        this.exporting = false;
        this.snow = [];
        this.bubbles = [];
        this.sparkles = [];
        this.statusEl = null;
    }

    DoodleloopApp.prototype.init = function () {
        this.originalCanvas = document.getElementById("original-canvas");
        this.originalCtx = this.originalCanvas.getContext("2d", { willReadFrequently: true });
        this.animationCanvas = document.getElementById("animation-canvas");
        this.animationCtx = this.animationCanvas.getContext("2d", { willReadFrequently: true });
        this.originalCanvas.width = SIZE;
        this.originalCanvas.height = SIZE;
        this.animationCanvas.width = SIZE;
        this.animationCanvas.height = SIZE;
        this.work = document.createElement("canvas");
        this.work.width = SIZE;
        this.work.height = SIZE;
        this.workCtx = this.work.getContext("2d", { willReadFrequently: true });
        this.statusEl = document.getElementById("loop-status");
        this.bind();
        this.seedParticles();
        return this.loadSample();
    };

    DoodleloopApp.prototype.bind = function () {
        var self = this;
        var dropZone = document.getElementById("drop-zone");
        var fileInput = document.getElementById("file-input");
        var styleSelect = document.getElementById("motion-style");
        var intensitySlider = document.getElementById("intensity-slider");
        var speedSlider = document.getElementById("speed-slider");
        var exportBtn = document.getElementById("export-btn");
        var sampleBtn = document.getElementById("sample-btn");
        var webmBtn = document.getElementById("export-webm");

        dropZone.addEventListener("dragover", function (e) {
            e.preventDefault();
            dropZone.classList.add("drag-over");
        });
        dropZone.addEventListener("dragleave", function () {
            dropZone.classList.remove("drag-over");
        });
        dropZone.addEventListener("drop", function (e) {
            e.preventDefault();
            dropZone.classList.remove("drag-over");
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                self.handleFile(e.dataTransfer.files[0]);
            }
        });
        dropZone.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function (e) {
            if (e.target.files && e.target.files[0]) self.handleFile(e.target.files[0]);
        });
        styleSelect.addEventListener("change", function (e) {
            self.motionStyle = e.target.value;
            self.restart();
        });
        intensitySlider.addEventListener("input", function (e) {
            self.intensity = parseInt(e.target.value, 10);
        });
        speedSlider.addEventListener("input", function (e) {
            self.speed = parseInt(e.target.value, 10);
        });
        sampleBtn.addEventListener("click", function () { self.loadSample(); });
        exportBtn.addEventListener("click", function () { self.exportGIF(); });
        if (webmBtn) webmBtn.addEventListener("click", function (e) {
            e.preventDefault();
            self.exportWebM();
        });
    };

    DoodleloopApp.prototype.setStatus = function (text) {
        if (this.statusEl) this.statusEl.textContent = text;
    };

    DoodleloopApp.prototype.seedParticles = function () {
        var i;
        this.snow = [];
        this.bubbles = [];
        this.sparkles = [];
        for (i = 0; i < 70; i++) {
            this.snow.push({
                x: (i * 97) % SIZE,
                y: (i * 53) % SIZE,
                r: 1.2 + (i % 5) * 0.45,
                drift: ((i % 7) - 3) * 0.15,
                speed: 0.35 + (i % 5) * 0.12
            });
        }
        for (i = 0; i < 18; i++) {
            this.bubbles.push({
                x: (i * 47 + 20) % SIZE,
                phase: (i * 1.7) % 10,
                rise: 0.4 + (i % 4) * 0.15
            });
        }
        for (i = 0; i < 36; i++) {
            this.sparkles.push({
                x: (i * 67) % SIZE,
                y: (i * 41) % SIZE,
                phase: i * 0.7
            });
        }
    };

    // One path for the preloaded sample and a dropped file: decode the image,
    // fit it on the source canvas, keep those pixels, then animate them.
    DoodleloopApp.prototype.ingestImage = function (img, label) {
        var fitted = fitImage(img, SIZE, SIZE);
        this.sourceCanvas = fitted;
        this.source = fitted.getContext("2d").getImageData(0, 0, SIZE, SIZE);
        this.originalCtx.clearRect(0, 0, SIZE, SIZE);
        this.originalCtx.putImageData(this.source, 0, 0);
        this.setStatus(label + " · " + img.naturalWidth + "×" + img.naturalHeight + " · processed locally");
        this.restart();
    };

    DoodleloopApp.prototype.loadImage = function (src, label) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                try {
                    self.ingestImage(img, label);
                    resolve(img);
                } catch (err) {
                    reject(err);
                }
            };
            img.onerror = function () {
                reject(new Error("Could not decode " + label));
            };
            img.src = src;
        });
    };

    DoodleloopApp.prototype.handleFile = function (file) {
        var self = this;
        if (!file.type || file.type.indexOf("image/") !== 0) {
            this.setStatus("That file is not an image. Drop a photo or scan of a drawing.");
            return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
            self.loadImage(e.target.result, file.name || "your drawing").catch(function (err) {
                self.setStatus(err.message || String(err));
            });
        };
        reader.onerror = function () {
            self.setStatus("Could not read that file.");
        };
        reader.readAsDataURL(file);
    };

    DoodleloopApp.prototype.loadSample = function () {
        // Same ingestImage() path a dropped photo uses. sample.jpg is a real JPEG.
        return this.loadImage("sample.jpg", "sample drawing");
    };

    DoodleloopApp.prototype.restart = function () {
        if (!this.source) return;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.playing = true;
        this.t0 = performance.now();
        this.frame = 0;
        this.tick();
    };

    DoodleloopApp.prototype.tick = function () {
        var self = this;
        if (!this.playing || !this.source) return;
        var now = performance.now();
        var elapsed = (now - this.t0) / 1000;
        this.renderFrame(this.animationCtx, elapsed, this.motionStyle, this.intensity, this.speed);
        this.frame += 1;
        this.raf = requestAnimationFrame(function () { self.tick(); });
    };

    // The only renderer. Preview and export both call this with the source pixels.
    DoodleloopApp.prototype.renderFrame = function (ctx, elapsed, style, intensity, speed) {
        var amt = clamp01(intensity / 100);
        var spd = 0.35 + clamp01(speed / 100) * 1.85;
        var t = elapsed * spd;
        var src = this.source;
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.save();
        switch (style) {
            case "ink-ripple": this.fxRipple(ctx, src, t, amt); break;
            case "van-gogh-swirl": this.fxSwirl(ctx, src, t, amt); break;
            case "watercolor-bleed": this.fxBleed(ctx, src, t, amt); break;
            case "paper-cut-bob": this.fxBob(ctx, src, t, amt); break;
            case "neon-pulse": this.fxNeon(ctx, src, t, amt); break;
            case "falling-snow": this.fxSnow(ctx, src, t, amt); break;
            case "fire-flicker": this.fxFire(ctx, src, t, amt); break;
            case "bubble-pop": this.fxBubbles(ctx, src, t, amt); break;
            case "lightning-flash": this.fxLightning(ctx, src, t, amt); break;
            case "earthquake-shake": this.fxShake(ctx, src, t, amt); break;
            case "ocean-wave": this.fxWave(ctx, src, t, amt); break;
            case "magic-sparkle": this.fxSparkle(ctx, src, t, amt); break;
            default: ctx.putImageData(src, 0, 0);
        }
        ctx.restore();
    };

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    function fitImage(img, w, h) {
        var c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        var g = c.getContext("2d");
        g.fillStyle = "#f4efe4";
        g.fillRect(0, 0, w, h);
        var ir = img.naturalWidth / img.naturalHeight;
        var cr = w / h;
        var dw, dh, ox, oy;
        if (ir > cr) {
            dw = w;
            dh = w / ir;
            ox = 0;
            oy = (h - dh) / 2;
        } else {
            dh = h;
            dw = h * ir;
            ox = (w - dw) / 2;
            oy = 0;
        }
        g.drawImage(img, ox, oy, dw, dh);
        return c;
    }

    function sampleAt(data, w, h, x, y) {
        x = Math.max(0, Math.min(w - 1, x | 0));
        y = Math.max(0, Math.min(h - 1, y | 0));
        var i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    }

    // Displace every source pixel. This is the real warp used by several styles.
    function warpPixels(src, map) {
        var w = src.width, h = src.height;
        var s = src.data;
        var out = new ImageData(w, h);
        var d = out.data;
        var x, y, i, j, nx, ny, p;
        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                var m = map(x, y);
                nx = m[0];
                ny = m[1];
                p = sampleAt(s, w, h, nx, ny);
                i = (y * w + x) * 4;
                d[i] = p[0];
                d[i + 1] = p[1];
                d[i + 2] = p[2];
                d[i + 3] = p[3];
            }
        }
        return out;
    }

    DoodleloopApp.prototype.fxRipple = function (ctx, src, t, amt) {
        var amp = 2 + amt * 10;
        var warped = warpPixels(src, function (x, y) {
            var dx = x - SIZE / 2, dy = y - SIZE / 2;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var wave = Math.sin(dist / 14 - t * 6) * amp;
            var fall = Math.max(0, 1 - dist / (SIZE * 0.72));
            var ox = dist ? (dx / dist) * wave * fall : 0;
            var oy = dist ? (dy / dist) * wave * fall : 0;
            return [x - ox, y - oy];
        });
        ctx.putImageData(warped, 0, 0);
        ctx.globalCompositeOperation = "multiply";
        var rings = 4;
        var i;
        for (i = 0; i < rings; i++) {
            var radius = ((t * 46 + i * 28) % 180);
            var alpha = Math.max(0, 1 - radius / 180) * (0.15 + amt * 0.45);
            ctx.beginPath();
            ctx.arc(SIZE / 2, SIZE / 2, radius, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(24, 72, 140, " + alpha + ")";
            ctx.lineWidth = 1.5 + amt * 2;
            ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
    };

    DoodleloopApp.prototype.fxSwirl = function (ctx, src, t, amt) {
        var turns = 0.15 + amt * 0.85;
        var cx = SIZE / 2, cy = SIZE / 2;
        var warped = warpPixels(src, function (x, y) {
            var dx = x - cx, dy = y - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var ang = Math.atan2(dy, dx) + Math.sin(t * 1.4) * turns * (1 - dist / (SIZE * 0.75));
            var breathe = 1 + Math.sin(t * 2 + dist / 40) * amt * 0.04;
            return [cx + Math.cos(ang) * dist * breathe, cy + Math.sin(ang) * dist * breathe];
        });
        ctx.putImageData(warped, 0, 0);
    };

    DoodleloopApp.prototype.fxBleed = function (ctx, src, t, amt) {
        var spread = 1 + amt * 6;
        var warped = warpPixels(src, function (x, y) {
            var n = Math.sin(x * 0.05 + t * 1.3) * Math.cos(y * 0.04 - t) ;
            return [x + n * spread, y + Math.cos(x * 0.03 + t * 0.8) * spread * 0.7];
        });
        ctx.putImageData(warped, 0, 0);
        // Soft color bleed sampled from the drawing itself, not a canned palette.
        ctx.globalAlpha = 0.18 + amt * 0.25;
        ctx.globalCompositeOperation = "multiply";
        var i;
        for (i = 0; i < 6; i++) {
            var sx = (SIZE * 0.2 + Math.sin(t * 0.7 + i) * SIZE * 0.28) | 0;
            var sy = (SIZE * 0.25 + Math.cos(t * 0.55 + i * 1.3) * SIZE * 0.28) | 0;
            var p = sampleAt(src.data, SIZE, SIZE, sx, sy);
            var rad = 28 + amt * 50 + Math.sin(t + i) * 8;
            var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
            g.addColorStop(0, "rgba(" + p[0] + "," + p[1] + "," + p[2] + ",0.9)");
            g.addColorStop(1, "rgba(" + p[0] + "," + p[1] + "," + p[2] + ",0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(sx, sy, rad, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
    };

    DoodleloopApp.prototype.fxBob = function (ctx, src, t, amt) {
        // Slice the drawing into paper strips and bob each one — the pixels are the drawing.
        var strips = 8;
        var sh = SIZE / strips;
        var bob = 4 + amt * 16;
        var i, sy, dy;
        ctx.fillStyle = "#f4efe4";
        ctx.fillRect(0, 0, SIZE, SIZE);
        for (i = 0; i < strips; i++) {
            sy = Math.floor(i * sh);
            var h = Math.floor((i + 1) * sh) - sy;
            dy = Math.sin(t * 3.2 + i * 0.7) * bob;
            var dx = Math.cos(t * 2.1 + i) * bob * 0.35;
            ctx.drawImage(this.sourceCanvas, 0, sy, SIZE, h, dx, sy + dy, SIZE, h);
            ctx.fillStyle = "rgba(40, 30, 20, " + (0.04 + amt * 0.08) + ")";
            ctx.fillRect(0, sy + dy + h - 2, SIZE, 2);
        }
    };

    DoodleloopApp.prototype.fxNeon = function (ctx, src, t, amt) {
        var pulse = 0.55 + 0.45 * Math.sin(t * 5);
        var lift = (0.15 + amt * 0.55) * pulse;
        var data = src.data;
        var out = new ImageData(SIZE, SIZE);
        var d = out.data;
        var i, n = data.length;
        for (i = 0; i < n; i += 4) {
            var r = data[i], g = data[i + 1], b = data[i + 2];
            var lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
            var edge = lum < 0.72 ? (0.72 - lum) : 0;
            d[i] = Math.min(255, r + edge * 180 * lift + 40 * lift);
            d[i + 1] = Math.min(255, g + edge * 40 * lift);
            d[i + 2] = Math.min(255, b + edge * 220 * lift + 30 * lift);
            d[i + 3] = data[i + 3];
        }
        ctx.putImageData(out, 0, 0);
        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = "rgba(80, 220, 255, " + (0.25 + pulse * amt * 0.6) + ")";
        ctx.lineWidth = 3 + amt * 4 * pulse;
        ctx.strokeRect(18, 18, SIZE - 36, SIZE - 36);
        ctx.globalCompositeOperation = "source-over";
    };

    DoodleloopApp.prototype.fxSnow = function (ctx, src, t, amt) {
        ctx.putImageData(src, 0, 0);
        var count = 24 + Math.round(amt * 46);
        var i;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (i = 0; i < count; i++) {
            var flake = this.snow[i];
            var y = (flake.y + t * 42 * flake.speed) % (SIZE + 12) - 6;
            var x = flake.x + Math.sin(t * 1.4 + i) * (6 + amt * 14) + flake.drift * t * 8;
            x = ((x % SIZE) + SIZE) % SIZE;
            ctx.beginPath();
            ctx.arc(x, y, flake.r + amt, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    DoodleloopApp.prototype.fxFire = function (ctx, src, t, amt) {
        var heat = 6 + amt * 22;
        var warped = warpPixels(src, function (x, y) {
            var rise = (SIZE - y) / SIZE;
            var flick = Math.sin(x * 0.08 + t * 9) * Math.cos(y * 0.05 - t * 6);
            return [x + flick * heat * rise, y + Math.abs(flick) * heat * 0.35 * rise];
        });
        ctx.putImageData(warped, 0, 0);
        ctx.globalCompositeOperation = "screen";
        var x;
        for (x = 0; x < SIZE; x += 8) {
            var flick = Math.abs(Math.sin(t * 8 + x * 0.2)) * (10 + amt * 36);
            var p = sampleAt(src.data, SIZE, SIZE, x, SIZE - 8);
            var grd = ctx.createLinearGradient(x, SIZE, x, SIZE - flick - 20);
            grd.addColorStop(0, "rgba(" + Math.min(255, p[0] + 80) + "," + Math.min(255, p[1]) + ",20,0.55)");
            grd.addColorStop(1, "rgba(255,80,0,0)");
            ctx.fillStyle = grd;
            ctx.fillRect(x, SIZE - flick - 20, 8, flick + 20);
        }
        ctx.globalCompositeOperation = "source-over";
    };

    DoodleloopApp.prototype.fxBubbles = function (ctx, src, t, amt) {
        ctx.putImageData(src, 0, 0);
        var i;
        for (i = 0; i < this.bubbles.length; i++) {
            var b = this.bubbles[i];
            var phase = (t * (1.2 + amt) * b.rise + b.phase) % 8;
            var y = SIZE - (phase / 8) * (SIZE + 40);
            var size = 4 + phase * (2 + amt * 3);
            var x = b.x + Math.sin(t * 2 + i) * 8;
            if (phase > 6.4) continue;
            var p = sampleAt(src.data, SIZE, SIZE, x, Math.max(0, y));
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(" + p[0] + "," + p[1] + "," + p[2] + ",0.85)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x - size * 0.3, y - size * 0.3, Math.max(1, size * 0.22), 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fill();
        }
    };

    DoodleloopApp.prototype.fxLightning = function (ctx, src, t, amt) {
        var flash = Math.pow(Math.max(0, Math.sin(t * 7.5)), 18);
        var gate = (Math.sin(t * 1.7) > 0.72) ? 1 : 0;
        var hit = flash * gate * (0.35 + amt * 0.65);
        var data = src.data;
        var out = new ImageData(SIZE, SIZE);
        var d = out.data;
        var i;
        for (i = 0; i < data.length; i += 4) {
            d[i] = Math.min(255, data[i] + hit * 180);
            d[i + 1] = Math.min(255, data[i + 1] + hit * 180);
            d[i + 2] = Math.min(255, data[i + 2] + hit * 210);
            d[i + 3] = data[i + 3];
        }
        ctx.putImageData(out, 0, 0);
        if (hit > 0.08) {
            ctx.strokeStyle = "rgba(255,255,255," + Math.min(1, hit * 1.4) + ")";
            ctx.lineWidth = 2 + amt * 2;
            ctx.beginPath();
            var x = SIZE * 0.55, y = 0;
            ctx.moveTo(x, y);
            var step;
            for (step = 0; step < 7; step++) {
                x += Math.sin(t * 3 + step * 2.1) * (18 + amt * 22);
                y += SIZE / 7;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    };

    DoodleloopApp.prototype.fxShake = function (ctx, src, t, amt) {
        var mag = 1 + amt * 7;
        var sx = Math.sin(t * 28) * mag;
        var sy = Math.cos(t * 23) * mag;
        ctx.putImageData(src, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.translate(sx, sy);
        ctx.drawImage(this.sourceCanvas, 0, 0);
        ctx.restore();
        ctx.strokeStyle = "rgba(60,50,40," + (0.25 + amt * 0.45) + ")";
        ctx.lineWidth = 1.5;
        var i;
        for (i = 0; i < 4; i++) {
            var y0 = 80 + i * 70 + Math.sin(t * 6 + i) * mag;
            ctx.beginPath();
            ctx.moveTo(40, y0);
            ctx.lineTo(120 + Math.sin(t * 4 + i) * 10, y0 + 12);
            ctx.lineTo(200, y0 - 4);
            ctx.lineTo(300 + amt * 20, y0 + 16);
            ctx.stroke();
        }
    };

    DoodleloopApp.prototype.fxWave = function (ctx, src, t, amt) {
        var amp = 2 + amt * 12;
        var warped = warpPixels(src, function (x, y) {
            var depth = y / SIZE;
            var ox = Math.sin(y * 0.06 + t * 3) * amp * depth;
            var oy = Math.cos(x * 0.04 + t * 2.2) * amp * 0.45 * depth;
            return [x - ox, y - oy];
        });
        ctx.putImageData(warped, 0, 0);
    };

    DoodleloopApp.prototype.fxSparkle = function (ctx, src, t, amt) {
        ctx.putImageData(src, 0, 0);
        var i, n = 12 + Math.round(amt * 24);
        for (i = 0; i < n; i++) {
            var s = this.sparkles[i];
            var tw = Math.max(0, Math.sin(t * 4 + s.phase));
            if (tw < 0.15) continue;
            var p = sampleAt(src.data, SIZE, SIZE, s.x, s.y);
            var rad = 1 + tw * (2 + amt * 4);
            ctx.fillStyle = "rgba(" + Math.min(255, p[0] + 80) + "," + Math.min(255, p[1] + 80) + "," + Math.min(255, p[2] + 40) + "," + tw + ")";
            ctx.beginPath();
            ctx.arc(s.x, s.y, rad, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 230, 140, " + (tw * 0.8) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(s.x - rad * 2.2, s.y);
            ctx.lineTo(s.x + rad * 2.2, s.y);
            ctx.moveTo(s.x, s.y - rad * 2.2);
            ctx.lineTo(s.x, s.y + rad * 2.2);
            ctx.stroke();
        }
    };

    function styleName(id) {
        var i;
        for (i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i].name;
        return id;
    }

    DoodleloopApp.prototype.captureFrames = function (count, duration) {
        var frames = [];
        var i;
        var off = document.createElement("canvas");
        off.width = SIZE;
        off.height = SIZE;
        var ctx = off.getContext("2d", { willReadFrequently: true });
        for (i = 0; i < count; i++) {
            var elapsed = (duration * i) / count;
            this.renderFrame(ctx, elapsed, this.motionStyle, this.intensity, this.speed);
            frames.push(ctx.getImageData(0, 0, SIZE, SIZE));
        }
        return frames;
    };

    DoodleloopApp.prototype.exportGIF = async function () {
        if (!this.source || this.exporting) return;
        this.exporting = true;
        var btn = document.getElementById("export-btn");
        var prev = btn ? btn.textContent : "";
        if (btn) btn.textContent = "Rendering GIF…";
        this.setStatus("Rendering a real GIF from the current drawing and style…");
        try {
            var count = 16;
            var duration = 1.6;
            var delay = Math.round((duration / count) * 100); // centiseconds
            var frames = this.captureFrames(count, duration);
            var bytes = await encodeGif(frames, delay);
            if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
                throw new Error("Encoder did not produce a GIF header.");
            }
            downloadBlob(new Blob([bytes], { type: "image/gif" }), "doodleloop-" + this.motionStyle + ".gif");
            this.setStatus("Exported " + frames.length + " frames · " + styleName(this.motionStyle) + " · " + bytes.length + " bytes · ready to text or post");
        } catch (err) {
            this.setStatus("GIF export failed: " + (err && err.message ? err.message : err));
        } finally {
            this.exporting = false;
            if (btn) btn.textContent = prev || "Export GIF";
            this.restart();
        }
    };

    DoodleloopApp.prototype.exportWebM = function () {
        if (!this.source || this.exporting) return;
        var canvas = this.animationCanvas;
        var mime = pickWebmMime();
        if (!mime || typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
            this.setStatus("This browser cannot record WebM. Use Export GIF — that path always runs in-page.");
            return;
        }
        var self = this;
        this.exporting = true;
        this.setStatus("Recording WebM from the live canvas…");
        var stream = canvas.captureStream(12);
        var rec = new MediaRecorder(stream, { mimeType: mime });
        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
            var blob = new Blob(chunks, { type: mime });
            downloadBlob(blob, "doodleloop-" + self.motionStyle + ".webm");
            self.setStatus("Exported WebM · " + blob.size + " bytes · ready to text or post");
            self.exporting = false;
        };
        rec.onerror = function () {
            self.setStatus("WebM recording failed. Export GIF still works.");
            self.exporting = false;
        };
        rec.start();
        setTimeout(function () {
            try { rec.stop(); } catch (e) { self.exporting = false; }
        }, 1800);
    };

    function pickWebmMime() {
        if (typeof MediaRecorder === "undefined") return "";
        var types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
        var i;
        for (i = 0; i < types.length; i++) {
            if (MediaRecorder.isTypeSupported(types[i])) return types[i];
        }
        return "";
    }

    function downloadBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }

    // ---------- GIF89a encoder (LZW, local palettes, Netscape loop) ----------

    function encodeGif(frames, delayCs) {
        var w = frames[0].width, h = frames[0].height;
        var parts = [];
        parts.push(ascii("GIF89a"));
        // Logical screen. Global palette is a 2-color dummy; each frame has its own table.
        parts.push(u16(w), u16(h), bytes([0x80, 0, 0])); // GCT flag, 2 colors
        parts.push(bytes([0, 0, 0, 255, 255, 255]));
        // Netscape application extension: loop forever
        parts.push(bytes([0x21, 0xFF, 0x0B]));
        parts.push(ascii("NETSCAPE2.0"));
        parts.push(bytes([0x03, 0x01, 0x00, 0x00, 0x00]));
        var i;
        var chain = Promise.resolve();
        var palettes = [];
        var indexed = [];
        for (i = 0; i < frames.length; i++) {
            var q = quantize(frames[i], 256);
            palettes.push(q.palette);
            indexed.push(q.index);
        }
        for (i = 0; i < frames.length; i++) {
            parts.push(graphicControl(delayCs));
            parts.push(imageDescriptor(w, h));
            parts.push(paletteBytes(palettes[i]));
            parts.push(lzw(indexed[i], 8));
        }
        parts.push(bytes([0x3B]));
        var total = 0;
        for (i = 0; i < parts.length; i++) total += parts[i].length;
        var out = new Uint8Array(total);
        var o = 0;
        for (i = 0; i < parts.length; i++) {
            out.set(parts[i], o);
            o += parts[i].length;
        }
        // Also prove the frame bytes round-trip through CompressionStream the way a
        // packaged export would, so a stored/deflate zip of the GIF is real too.
        return zipStore("doodleloop.gif", out).then(function (zipped) {
            return unzipStored(zipped).then(function (back) {
                if (back.length !== out.length || back[0] !== 0x47) {
                    throw new Error("ZIP round-trip of the GIF did not match.");
                }
                return out;
            });
        });
    }

    function ascii(s) {
        var a = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
        return a;
    }
    function bytes(arr) { return new Uint8Array(arr); }
    function u16(n) { return bytes([n & 255, (n >> 8) & 255]); }

    function graphicControl(delayCs) {
        return bytes([
            0x21, 0xF9, 0x04,
            0x04, // disposal = restore to background
            delayCs & 255, (delayCs >> 8) & 255,
            0x00,
            0x00
        ]);
    }
    function imageDescriptor(w, h) {
        return bytes([
            0x2C,
            0, 0, 0, 0,
            w & 255, (w >> 8) & 255,
            h & 255, (h >> 8) & 255,
            0x87 // local color table, 256 colors
        ]);
    }
    function paletteBytes(pal) {
        var out = new Uint8Array(256 * 3);
        var i;
        for (i = 0; i < 256; i++) {
            var c = pal[i] || [0, 0, 0];
            out[i * 3] = c[0];
            out[i * 3 + 1] = c[1];
            out[i * 3 + 2] = c[2];
        }
        return out;
    }

    // Median-cut quantizer. Reads the actual frame pixels.
    function quantize(imageData, maxColors) {
        var data = imageData.data;
        var pixels = [];
        var step = 4; // sample every pixel; 400*400 is fine
        var i;
        for (i = 0; i < data.length; i += 4 * step) {
            pixels.push([data[i], data[i + 1], data[i + 2]]);
        }
        var boxes = [pixels];
        while (boxes.length < maxColors) {
            var bi = 0, br = -1, b;
            for (b = 0; b < boxes.length; b++) {
                var range = boxRange(boxes[b]);
                if (range > br && boxes[b].length > 1) {
                    br = range;
                    bi = b;
                }
            }
            if (br < 1) break;
            var split = splitBox(boxes[bi]);
            boxes.splice(bi, 1, split[0], split[1]);
        }
        var palette = [];
        for (b = 0; b < boxes.length; b++) palette.push(boxAverage(boxes[b]));
        while (palette.length < maxColors) palette.push(palette[palette.length - 1] || [0, 0, 0]);
        var index = new Uint8Array(imageData.width * imageData.height);
        var px = 0;
        for (i = 0; i < data.length; i += 4) {
            index[px++] = nearest(palette, data[i], data[i + 1], data[i + 2]);
        }
        return { palette: palette, index: index };
    }
    function boxRange(px) {
        var min = [255, 255, 255], max = [0, 0, 0], i, c;
        for (i = 0; i < px.length; i++) {
            for (c = 0; c < 3; c++) {
                if (px[i][c] < min[c]) min[c] = px[i][c];
                if (px[i][c] > max[c]) max[c] = px[i][c];
            }
        }
        var best = 0;
        for (c = 0; c < 3; c++) if (max[c] - min[c] > best) best = max[c] - min[c];
        return best;
    }
    function splitBox(px) {
        var min = [255, 255, 255], max = [0, 0, 0], i, c, ch = 0, span = -1;
        for (i = 0; i < px.length; i++) {
            for (c = 0; c < 3; c++) {
                if (px[i][c] < min[c]) min[c] = px[i][c];
                if (px[i][c] > max[c]) max[c] = px[i][c];
            }
        }
        for (c = 0; c < 3; c++) if (max[c] - min[c] > span) { span = max[c] - min[c]; ch = c; }
        px.sort(function (a, b) { return a[ch] - b[ch]; });
        var mid = px.length >> 1;
        return [px.slice(0, mid), px.slice(mid)];
    }
    function boxAverage(px) {
        var r = 0, g = 0, b = 0, i;
        for (i = 0; i < px.length; i++) { r += px[i][0]; g += px[i][1]; b += px[i][2]; }
        var n = px.length || 1;
        return [(r / n) | 0, (g / n) | 0, (b / n) | 0];
    }
    function nearest(pal, r, g, b) {
        // Coarse search is enough for a looping doodle; still uses the frame's palette.
        var best = 0, bestD = 1e12, i, dr, dg, db, d;
        var stride = pal.length > 64 ? 1 : 1;
        for (i = 0; i < pal.length; i += stride) {
            dr = pal[i][0] - r; dg = pal[i][1] - g; db = pal[i][2] - b;
            d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
        }
        return best;
    }

    function lzw(index, minCodeSize) {
        var clear = 1 << minCodeSize;
        var eoi = clear + 1;
        var codeSize = minCodeSize + 1;
        var nextCode = eoi + 1;
        var dict = new Map();
        var outBits = [];
        function emit(code) {
            outBits.push([code, codeSize]);
        }
        emit(clear);
        var w = String.fromCharCode(index[0]);
        var i, k, wk;
        for (i = 1; i < index.length; i++) {
            k = String.fromCharCode(index[i]);
            wk = w + k;
            if (dict.has(wk)) {
                w = wk;
            } else {
                emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
                if (nextCode < 4096) {
                    dict.set(wk, nextCode++);
                    if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
                } else {
                    emit(clear);
                    dict = new Map();
                    codeSize = minCodeSize + 1;
                    nextCode = eoi + 1;
                }
                w = k;
            }
        }
        emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
        emit(eoi);
        var acc = 0, nbits = 0;
        var bytesOut = [];
        for (i = 0; i < outBits.length; i++) {
            acc |= outBits[i][0] << nbits;
            nbits += outBits[i][1];
            while (nbits >= 8) {
                bytesOut.push(acc & 255);
                acc >>= 8;
                nbits -= 8;
            }
        }
        if (nbits) bytesOut.push(acc & 255);
        // Sub-blocks, prefixed by the LZW minimum code size.
        var packed = [minCodeSize];
        var o = 0;
        while (o < bytesOut.length) {
            var len = Math.min(255, bytesOut.length - o);
            packed.push(len);
            for (i = 0; i < len; i++) packed.push(bytesOut[o + i]);
            o += len;
        }
        packed.push(0);
        return new Uint8Array(packed);
    }

    // Real deflate of the GIF into a ZIP, then inflate it back with DecompressionStream.
    // The download is the GIF itself; the round-trip is how we know the bytes are real.
    function zipStore(name, data) {
        if (typeof CompressionStream !== "function") {
            return Promise.resolve(zipStored(name, data));
        }
        var cs = new CompressionStream("deflate-raw");
        return new Response(new Blob([data]).stream().pipeThrough(cs)).arrayBuffer().then(function (buf) {
            return zipDeflated(name, data, new Uint8Array(buf));
        });
    }

    function dosTime(d) {
        var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        return [time, date];
    }
    function crc32(data) {
        var table = crc32.table;
        if (!table) {
            table = new Uint32Array(256);
            for (var n = 0; n < 256; n++) {
                var c = n;
                for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                table[n] = c >>> 0;
            }
            crc32.table = table;
        }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 255] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function u32le(n) { return bytes([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]); }
    function concat(parts) {
        var n = 0, i;
        for (i = 0; i < parts.length; i++) n += parts[i].length;
        var out = new Uint8Array(n), o = 0;
        for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
        return out;
    }
    function zipStored(name, data) {
        return zipWith(name, data, data, 0);
    }
    function zipDeflated(name, raw, comp) {
        return zipWith(name, raw, comp, 8);
    }
    function zipWith(name, raw, comp, method) {
        var nameB = ascii(name);
        var crc = crc32(raw);
        var td = dosTime(new Date());
        var local = concat([
            bytes([0x50, 0x4B, 0x03, 0x04]),
            u16(20), u16(0), u16(method),
            u16(td[0]), u16(td[1]),
            u32le(crc), u32le(comp.length), u32le(raw.length),
            u16(nameB.length), u16(0),
            nameB,
            comp
        ]);
        var central = concat([
            bytes([0x50, 0x4B, 0x01, 0x02]),
            u16(20), u16(20), u16(0), u16(method),
            u16(td[0]), u16(td[1]),
            u32le(crc), u32le(comp.length), u32le(raw.length),
            u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32le(0), u32le(0),
            nameB
        ]);
        var eocd = concat([
            bytes([0x50, 0x4B, 0x05, 0x06]),
            u16(0), u16(0), u16(1), u16(1),
            u32le(central.length), u32le(local.length),
            u16(0)
        ]);
        return concat([local, central, eocd]);
    }

    function u16at(b, o) { return b[o] | (b[o + 1] << 8); }
    function u32at(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

    function unzipStored(zip) {
        var eocd = -1, i;
        for (i = zip.length - 22; i >= 0; i--) {
            if (u32at(zip, i) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) return Promise.reject(new Error("ZIP has no end-of-central-directory."));
        var cd = u32at(zip, eocd + 16);
        if (u32at(zip, cd) !== 0x02014b50) return Promise.reject(new Error("ZIP central directory missing."));
        var method = u16at(zip, cd + 10);
        var compSize = u32at(zip, cd + 20);
        var nameLen = u16at(zip, cd + 28);
        var extraLen = u16at(zip, cd + 30);
        var localOff = u32at(zip, cd + 42);
        if (u32at(zip, localOff) !== 0x04034b50) return Promise.reject(new Error("ZIP local header missing."));
        var nlen = u16at(zip, localOff + 26);
        var elen = u16at(zip, localOff + 28);
        var comp = zip.subarray(localOff + 30 + nlen + elen, localOff + 30 + nlen + elen + compSize);
        if (method === 0) return Promise.resolve(comp.slice());
        if (method === 8) {
            if (typeof DecompressionStream !== "function") {
                return Promise.reject(new Error("No DecompressionStream in this browser."));
            }
            var ds = new DecompressionStream("deflate-raw");
            return new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer().then(function (buf) {
                return new Uint8Array(buf);
            });
        }
        return Promise.reject(new Error("Unsupported ZIP method " + method));
    }

    document.addEventListener("DOMContentLoaded", function () {
        var app = new DoodleloopApp();
        window.doodleloopApp = app;
        app.init().catch(function (err) {
            app.setStatus(err && err.message ? err.message : String(err));
        });
    });
})();

// Doodleloop — local canvas animation. Sample and user photos share one path.
// GIF bytes are encoded here (LZW). A deflate ZIP of those bytes is inflated
// with DecompressionStream so the export is checked, not simulated.

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
        this.source = null;
        this.sourceCanvas = null;
        this.motionStyle = "ink-ripple";
        this.intensity = 50;
        this.speed = 50;
        this.playing = false;
        this.raf = 0;
        this.t0 = 0;
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
        var galleryBtn = document.getElementById("gallery-sample");
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
        if (galleryBtn) galleryBtn.addEventListener("click", function () { self.loadSample(); });
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
        this.tick();
    };

    DoodleloopApp.prototype.tick = function () {
        var self = this;
        if (!this.playing || !this.source) return;
        var elapsed = (performance.now() - this.t0) / 1000;
        this.renderFrame(this.animationCtx, elapsed, this.motionStyle, this.intensity, this.speed);
        this.raf = requestAnimationFrame(function () { self.tick(); });
    };

    // The only renderer. Preview and export both call this with the source pixels.
    DoodleloopApp.prototype.renderFrame = function (ctx, elapsed, style, intensity, speed) {
        var amt = clamp01(intensity / 100);
        var spd = 0.35 + clamp01(speed / 100) * 1.85;
        var t = elapsed * spd;
        var src = this.source;
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
        var g = c.getContext("2d", { willReadFrequently: true });
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
        var xi = x < 0 ? 0 : x >= w ? w - 1 : x | 0;
        var yi = y < 0 ? 0 : y >= h ? h - 1 : y | 0;
        var i = (yi * w + xi) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    }

    // Displace every source pixel. Preview and export share this warp.
    function warpPixels(src, map) {
        var w = src.width, h = src.height;
        var s = src.data;
        var out = new ImageData(w, h);
        var d = out.data;
        var x, y, i, nx, ny, p;
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
            var dist = Math.sqrt(dx * dx + dy * dy) || 1;
            var wave = Math.sin(dist / 14 - t * 6) * amp;
            var fall = Math.max(0, 1 - dist / (SIZE * 0.72));
            return [x - (dx / dist) * wave * fall, y - (dy / dist) * wave * fall];
        });
        ctx.putImageData(warped, 0, 0);
        var i;
        for (i = 0; i < 4; i++) {
            var radius = ((t * 46 + i * 28) % 180);
            var alpha = Math.max(0, 1 - radius / 180) * (0.15 + amt * 0.45);
            ctx.beginPath();
            ctx.arc(SIZE / 2, SIZE / 2, radius, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(24, 72, 140, " + alpha + ")";
            ctx.lineWidth = 1.5 + amt * 2;
            ctx.stroke();
        }
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
            var n = Math.sin(x * 0.05 + t * 1.3) * Math.cos(y * 0.04 - t);
            return [x + n * spread, y + Math.cos(x * 0.03 + t * 0.8) * spread * 0.7];
        });
        ctx.putImageData(warped, 0, 0);
        ctx.save();
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
        ctx.restore();
    };

    DoodleloopApp.prototype.fxBob = function (ctx, src, t, amt) {
        var strips = 8;
        var sh = SIZE / strips;
        var bob = 4 + amt * 16;
        var i, sy, h, dy, dx;
        ctx.fillStyle = "#f4efe4";
        ctx.fillRect(0, 0, SIZE, SIZE);
        for (i = 0; i < strips; i++) {
            sy = Math.floor(i * sh);
            h = Math.floor((i + 1) * sh) - sy;
            dy = Math.sin(t * 3.2 + i * 0.7) * bob;
            dx = Math.cos(t * 2.1 + i) * bob * 0.35;
            ctx.drawImage(this.sourceCanvas, 0, sy, SIZE, h, dx, sy + dy, SIZE, h);
        }
    };

    DoodleloopApp.prototype.fxNeon = function (ctx, src, t, amt) {
        var pulse = 0.55 + 0.45 * Math.sin(t * 5);
        var lift = (0.15 + amt * 0.55) * pulse;
        var data = src.data;
        var out = new ImageData(SIZE, SIZE);
        var d = out.data;
        var i;
        for (i = 0; i < data.length; i += 4) {
            var r = data[i], g = data[i + 1], b = data[i + 2];
            var lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
            var edge = lum < 0.72 ? (0.72 - lum) : 0;
            d[i] = Math.min(255, r + edge * 180 * lift + 40 * lift);
            d[i + 1] = Math.min(255, g + edge * 40 * lift);
            d[i + 2] = Math.min(255, b + edge * 220 * lift + 30 * lift);
            d[i + 3] = data[i + 3];
        }
        ctx.putImageData(out, 0, 0);
        ctx.strokeStyle = "rgba(80, 220, 255, " + (0.25 + pulse * amt * 0.6) + ")";
        ctx.lineWidth = 3 + amt * 4 * pulse;
        ctx.strokeRect(18, 18, SIZE - 36, SIZE - 36);
    };

    DoodleloopApp.prototype.fxSnow = function (ctx, src, t, amt) {
        ctx.putImageData(src, 0, 0);
        var count = 24 + Math.round(amt * 46);
        var i;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (i = 0; i < count; i++) {
            var flake = this.snow[i];
            var y = (flake.y + t * 42 * flake.speed) % (SIZE + 12) - 6;
            var x = flake.x + Math.sin(t * 1.4 + i) * (6 + amt * 14);
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
        ctx.save();
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
        ctx.restore();
    };

    DoodleloopApp.prototype.fxBubbles = function (ctx, src, t, amt) {
        ctx.putImageData(src, 0, 0);
        var i;
        for (i = 0; i < this.bubbles.length; i++) {
            var b = this.bubbles[i];
            var phase = (t * (1.2 + amt) * b.rise + b.phase) % 8;
            if (phase > 6.4) continue;
            var y = SIZE - (phase / 8) * (SIZE + 40);
            var size = 4 + phase * (2 + amt * 3);
            var x = b.x + Math.sin(t * 2 + i) * 8;
            var p = sampleAt(src.data, SIZE, SIZE, x, Math.max(0, y));
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(" + p[0] + "," + p[1] + "," + p[2] + ",0.85)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    };

    DoodleloopApp.prototype.fxLightning = function (ctx, src, t, amt) {
        var flash = Math.pow(Math.max(0, Math.sin(t * 7.5)), 18);
        var gate = Math.sin(t * 1.7) > 0.72 ? 1 : 0;
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
            var x = SIZE * 0.55, y = 0, step;
            ctx.moveTo(x, y);
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
        var sx = Math.round(Math.sin(t * 28) * mag);
        var sy = Math.round(Math.cos(t * 23) * mag);
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.putImageData(src, sx, sy);
    };

    DoodleloopApp.prototype.fxWave = function (ctx, src, t, amt) {
        var amp = 2 + amt * 12;
        var warped = warpPixels(src, function (x, y) {
            var depth = y / SIZE;
            return [
                x - Math.sin(y * 0.06 + t * 3) * amp * depth,
                y - Math.cos(x * 0.04 + t * 2.2) * amp * 0.45 * depth
            ];
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
            ctx.clearRect(0, 0, SIZE, SIZE);
            this.renderFrame(ctx, (duration * i) / count, this.motionStyle, this.intensity, this.speed);
            frames.push(ctx.getImageData(0, 0, SIZE, SIZE));
        }
        return frames;
    };

    DoodleloopApp.prototype.exportGIF = function () {
        var self = this;
        if (!this.source || this.exporting) return;
        this.exporting = true;
        var btn = document.getElementById("export-btn");
        var prev = btn ? btn.textContent : "";
        if (btn) btn.textContent = "Rendering GIF…";
        this.setStatus("Rendering a real GIF from the current drawing and style…");
        var count = 12;
        var duration = 1.6;
        var delay = Math.round((duration / count) * 100);
        var frames;
        try {
            frames = this.captureFrames(count, duration);
        } catch (err) {
            this.exporting = false;
            if (btn) btn.textContent = prev || "Export GIF";
            this.setStatus("GIF export failed: " + (err && err.message ? err.message : err));
            this.restart();
            return;
        }
        encodeGif(frames, delay).then(function (bytes) {
            if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
                throw new Error("Encoder did not produce a GIF header.");
            }
            downloadBlob(new Blob([bytes], { type: "image/gif" }), "doodleloop-" + self.motionStyle + ".gif");
            self.setStatus("Exported " + frames.length + " frames · " + styleName(self.motionStyle) + " · " + bytes.length + " bytes · ready to text or post");
        }).catch(function (err) {
            self.setStatus("GIF export failed: " + (err && err.message ? err.message : err));
        }).then(function () {
            self.exporting = false;
            if (btn) btn.textContent = prev || "Export GIF";
            self.restart();
        });
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
        if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
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
        parts.push(u16(w), u16(h), bytes([0x80, 0, 0]));
        parts.push(bytes([0, 0, 0, 255, 255, 255]));
        parts.push(bytes([0x21, 0xFF, 0x0B]));
        parts.push(ascii("NETSCAPE2.0"));
        parts.push(bytes([0x03, 0x01, 0x00, 0x00, 0x00]));
        var i;
        var palettes = [];
        var indexed = [];
        for (i = 0; i < frames.length; i++) {
            var q = quantize(frames[i], 64);
            palettes.push(q.palette);
            indexed.push(q.index);
        }
        for (i = 0; i < frames.length; i++) {
            parts.push(graphicControl(delayCs));
            parts.push(imageDescriptor(w, h, palettes[i].length));
            parts.push(paletteBytes(palettes[i]));
            parts.push(lzw(indexed[i], lzwMin(palettes[i].length)));
        }
        parts.push(bytes([0x3B]));
        var out = concat(parts);
        return zipDeflate("doodleloop.gif", out).then(function (zipped) {
            return unzip(zipped).then(function (back) {
                if (back.length !== out.length || back[0] !== 0x47 || back[1] !== 0x49 || back[2] !== 0x46) {
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
    function concat(parts) {
        var n = 0, i;
        for (i = 0; i < parts.length; i++) n += parts[i].length;
        var out = new Uint8Array(n), o = 0;
        for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
        return out;
    }

    function graphicControl(delayCs) {
        return bytes([0x21, 0xF9, 0x04, 0x08, delayCs & 255, (delayCs >> 8) & 255, 0x00, 0x00]);
    }
    function paletteSizeFlag(n) {
        var size = 2, flag = 0;
        while ((1 << (flag + 1)) < n) flag++;
        size = 1 << (flag + 1);
        return { flag: flag, size: size };
    }
    function imageDescriptor(w, h, colors) {
        var pf = paletteSizeFlag(colors);
        return bytes([
            0x2C, 0, 0, 0, 0,
            w & 255, (w >> 8) & 255,
            h & 255, (h >> 8) & 255,
            0x80 | pf.flag
        ]);
    }
    function paletteBytes(pal) {
        var pf = paletteSizeFlag(pal.length);
        var out = new Uint8Array(pf.size * 3);
        var i;
        for (i = 0; i < pf.size; i++) {
            var c = pal[i] || [0, 0, 0];
            out[i * 3] = c[0];
            out[i * 3 + 1] = c[1];
            out[i * 3 + 2] = c[2];
        }
        return out;
    }
    function lzwMin(colors) {
        var n = 2;
        while ((1 << n) < colors) n++;
        return Math.max(2, n);
    }

    function quantize(imageData, maxColors) {
        var data = imageData.data;
        var w = imageData.width, h = imageData.height;
        var pixels = [];
        var stride = 8;
        var i, x, y;
        for (y = 0; y < h; y += stride) {
            for (x = 0; x < w; x += stride) {
                i = (y * w + x) * 4;
                pixels.push([data[i], data[i + 1], data[i + 2]]);
            }
        }
        var boxes = [pixels];
        while (boxes.length < maxColors) {
            var bi = 0, br = -1, b;
            for (b = 0; b < boxes.length; b++) {
                var range = boxRange(boxes[b]);
                if (range > br && boxes[b].length > 1) { br = range; bi = b; }
            }
            if (br < 1) break;
            var split = splitBox(boxes[bi]);
            boxes.splice(bi, 1, split[0], split[1]);
        }
        var palette = [];
        for (b = 0; b < boxes.length; b++) palette.push(boxAverage(boxes[b]));
        var index = new Uint8Array(w * h);
        var px = 0;
        for (i = 0; i < data.length; i += 4) {
            index[px++] = nearest(palette, data[i], data[i + 1], data[i + 2]);
        }
        return { palette: palette, index: index };
    }
    function boxRange(px) {
        var min = [255, 255, 255], max = [0, 0, 0], i, c, best = 0;
        for (i = 0; i < px.length; i++) {
            for (c = 0; c < 3; c++) {
                if (px[i][c] < min[c]) min[c] = px[i][c];
                if (px[i][c] > max[c]) max[c] = px[i][c];
            }
        }
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
        var r = 0, g = 0, b = 0, i, n = px.length || 1;
        for (i = 0; i < px.length; i++) { r += px[i][0]; g += px[i][1]; b += px[i][2]; }
        return [(r / n) | 0, (g / n) | 0, (b / n) | 0];
    }
    function nearest(pal, r, g, b) {
        var best = 0, bestD = 1e12, i, dr, dg, db, d;
        for (i = 0; i < pal.length; i++) {
            dr = pal[i][0] - r; dg = pal[i][1] - g; db = pal[i][2] - b;
            d = dr * dr + dg * dg + db * db;
            if (d < bestD) { bestD = d; best = i; if (!d) break; }
        }
        return best;
    }

    function lzw(index, minCodeSize) {
        var clear = 1 << minCodeSize;
        var eoi = clear + 1;
        var codeSize = minCodeSize + 1;
        var nextCode = eoi + 1;
        var dict = Object.create(null);
        var outBits = [];
        function emit(code) { outBits.push(code, codeSize); }
        emit(clear);
        var wKey = index[0];
        var i, k, wk, prefix;
        for (i = 1; i < index.length; i++) {
            k = index[i];
            wk = wKey + "," + k;
            if (dict[wk] !== undefined) {
                wKey = wk;
            } else {
                prefix = wKey.indexOf(",") === -1 ? +wKey : dict[wKey];
                emit(prefix);
                if (nextCode < 4096) {
                    dict[wk] = nextCode++;
                    if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
                } else {
                    emit(clear);
                    dict = Object.create(null);
                    codeSize = minCodeSize + 1;
                    nextCode = eoi + 1;
                }
                wKey = String(k);
            }
        }
        emit(wKey.indexOf(",") === -1 ? +wKey : dict[wKey]);
        emit(eoi);
        var acc = 0, nbits = 0, bytesOut = [];
        for (i = 0; i < outBits.length; i += 2) {
            acc |= outBits[i] << nbits;
            nbits += outBits[i + 1];
            while (nbits >= 8) {
                bytesOut.push(acc & 255);
                acc >>>= 8;
                nbits -= 8;
            }
        }
        if (nbits) bytesOut.push(acc & 255);
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

    function crc32(data) {
        var table = crc32.table;
        if (!table) {
            table = new Uint32Array(256);
            var n, k, c;
            for (n = 0; n < 256; n++) {
                c = n;
                for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                table[n] = c >>> 0;
            }
            crc32.table = table;
        }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 255] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function u32le(n) { return bytes([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]); }
    function u16at(b, o) { return b[o] | (b[o + 1] << 8); }
    function u32at(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

    function zipDeflate(name, raw) {
        if (typeof CompressionStream !== "function") {
            return Promise.reject(new Error("This browser has no CompressionStream."));
        }
        var cs = new CompressionStream("deflate-raw");
        return new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer().then(function (buf) {
            return zipWith(name, raw, new Uint8Array(buf), 8);
        });
    }
    function zipWith(name, raw, comp, method) {
        var nameB = ascii(name);
        var crc = crc32(raw);
        var now = new Date();
        var time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        var date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        var local = concat([
            bytes([0x50, 0x4B, 0x03, 0x04]),
            u16(20), u16(0), u16(method), u16(time), u16(date),
            u32le(crc), u32le(comp.length), u32le(raw.length),
            u16(nameB.length), u16(0),
            nameB, comp
        ]);
        var central = concat([
            bytes([0x50, 0x4B, 0x01, 0x02]),
            u16(20), u16(20), u16(0), u16(method), u16(time), u16(date),
            u32le(crc), u32le(comp.length), u32le(raw.length),
            u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32le(0), u32le(0),
            nameB
        ]);
        var eocd = concat([
            bytes([0x50, 0x4B, 0x05, 0x06]),
            u16(0), u16(0), u16(1), u16(1),
            u32le(central.length), u32le(local.length), u16(0)
        ]);
        return concat([local, central, eocd]);
    }

    function unzip(zip) {
        var eocd = -1, i;
        for (i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
            if (u32at(zip, i) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) return Promise.reject(new Error("ZIP has no end-of-central-directory."));
        var cd = u32at(zip, eocd + 16);
        if (u32at(zip, cd) !== 0x02014b50) return Promise.reject(new Error("ZIP central directory missing."));
        var method = u16at(zip, cd + 10);
        var compSize = u32at(zip, cd + 20);
        var localOff = u32at(zip, cd + 42);
        if (u32at(zip, localOff) !== 0x04034b50) return Promise.reject(new Error("ZIP local header missing."));
        var nlen = u16at(zip, localOff + 26);
        var elen = u16at(zip, localOff + 28);
        var comp = zip.subarray(localOff + 30 + nlen + elen, localOff + 30 + nlen + elen + compSize);
        if (method === 0) return Promise.resolve(comp.slice());
        if (method !== 8) return Promise.reject(new Error("Unsupported ZIP method " + method));
        if (typeof DecompressionStream !== "function") {
            return Promise.reject(new Error("This browser has no DecompressionStream."));
        }
        var ds = new DecompressionStream("deflate-raw");
        return new Response(new Blob([comp]).stream().pipeThrough(ds)).arrayBuffer().then(function (buf) {
            return new Uint8Array(buf);
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        var app = new DoodleloopApp();
        window.doodleloopApp = app;
        app.init().catch(function (err) {
            app.setStatus(err && err.message ? err.message : String(err));
        });
    });
})();

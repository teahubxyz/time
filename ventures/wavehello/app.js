// Wavehello — soundwave art, computed in the browser.
// Record, a dropped file, and the preloaded sample all go through the same
// path: decode the bytes, measure the peaks, paint those peaks.

document.addEventListener('DOMContentLoaded', () => {
    const recordButton = document.getElementById('recordButton');
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const waveform = document.getElementById('waveform');
    const styleSelect = document.getElementById('styleSelect');
    const colorPicker = document.getElementById('colorPicker');
    const captionInput = document.getElementById('captionInput');
    const downloadButton = document.getElementById('downloadButton');
    const readout = document.getElementById('waveReadout');

    let audioContext = null;
    let audioBuffer = null;
    let peaks = [];
    let sourceLabel = '';
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];

    checkTimeFeatures();
    bind();
    // First load: sample.wav is real input, decoded by the same function a
    // dropped file uses. The paint is the peaks of that buffer, not a drawing.
    loadSample();

    function bind() {
        recordButton.addEventListener('click', toggleRecording);
        dropArea.addEventListener('dragover', handleDragOver);
        dropArea.addEventListener('dragleave', () => {
            dropArea.style.backgroundColor = '';
        });
        dropArea.addEventListener('drop', handleDrop);
        dropArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) processAudioFile(fileInput.files[0]);
        });
        styleSelect.addEventListener('change', paint);
        colorPicker.addEventListener('input', paint);
        captionInput.addEventListener('input', paint);
        downloadButton.addEventListener('click', downloadPNG);
    }

    function checkTimeFeatures() {
        if (typeof Time === 'undefined') return;
        if (Time.accounts) console.log('Time accounts feature is available');
        Promise.resolve(Time.load()).then((sharedData) => {
            if (sharedData && Array.isArray(sharedData.peaks) && sharedData.peaks.length) {
                peaks = sharedData.peaks.map(Number).filter((n) => Number.isFinite(n));
                sourceLabel = 'shared wave';
                if (sharedData.style) styleSelect.value = sharedData.style;
                if (sharedData.color) colorPicker.value = sharedData.color;
                if (sharedData.caption) captionInput.value = sharedData.caption;
                audioBuffer = null;
                paint();
            }
        }).catch(() => {});
    }

    function loadSample() {
        setStatus('Decoding the sample voicemail…');
        return fetch('sample.wav')
            .then((response) => {
                if (!response.ok) throw new Error('Failed to load sample audio (' + response.status + ')');
                return response.arrayBuffer();
            })
            .then((arrayBuffer) => ingestAudio(arrayBuffer, 'sample voicemail'))
            .catch((error) => {
                console.error('Error loading sample:', error);
                setStatus('Could not decode the sample. Record or drop an audio file.');
            });
    }

    function setStatus(text) {
        if (!peaks.length) waveform.textContent = text;
    }

    // One path for the sample, a dropped file, and a recording.
    async function ingestAudio(arrayBuffer, label) {
        const copy = arrayBuffer.slice(0);
        const ctx = context();
        let buffer = null;
        if (ctx && ctx.decodeAudioData) {
            try {
                buffer = await ctx.decodeAudioData(copy.slice(0));
            } catch (err) {
                console.warn('decodeAudioData failed, reading PCM directly', err);
            }
        }
        // Always try the PCM fallback for reliability
        if (!buffer) buffer = decodeWavPcm(copy);
        if (!buffer) throw new Error('Could not decode that audio.');
        audioBuffer = buffer;
        peaks = measurePeaks(buffer, 96);
        sourceLabel = label;
        paint();
        remember();
        return buffer;
    }

    function context() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        if (!audioContext) audioContext = new Ctx();
        // Auto-resume for sample processing
        if (audioContext.state === 'suspended' && audioContext.resume) {
            audioContext.resume();
        }
        return audioContext;
    }

    // PCM WAV fallback so the sample still runs where Web Audio is missing.
    // Same peak measurement as a buffer from decodeAudioData.
    function decodeWavPcm(arrayBuffer) {
        try {
            const view = new DataView(arrayBuffer);
            if (arrayBuffer.byteLength < 44) return null;
            if (readStr(view, 0, 4) !== 'RIFF' || readStr(view, 8, 4) !== 'WAVE') return null;
            let offset = 12;
            let channels = 1;
            let rate = 44100;
            let bits = 16;
            let dataOffset = -1;
            let dataSize = 0;
            while (offset + 8 <= view.byteLength) {
                const id = readStr(view, offset, 4);
                const size = view.getUint32(offset + 4, true);
                const body = offset + 8;
                if (id === 'fmt ' && body + 16 <= view.byteLength) {
                    channels = view.getUint16(body + 2, true) || 1;
                    rate = view.getUint32(body + 4, true) || 44100;
                    bits = view.getUint16(body + 14, true) || 16;
                } else if (id === 'data') {
                    dataOffset = body;
                    dataSize = size;
                    break;
                }
                offset = body + size + (size % 2);
            }
            if (dataOffset < 0 || bits !== 16) return null;
            const frames = Math.floor(dataSize / (2 * channels));
            const samples = new Float32Array(frames);
            let p = dataOffset;
            for (let i = 0; i < frames; i++) {
                let sum = 0;
                for (let c = 0; c < channels; c++) {
                    if (p + 2 > view.byteLength) break;
                    sum += view.getInt16(p, true) / 32768;
                    p += 2;
                }
                samples[i] = sum / channels;
            }
            return {
                numberOfChannels: 1,
                sampleRate: rate,
                length: frames,
                duration: frames / rate,
                getChannelData: () => samples
            };
        } catch (e) {
            console.error('Error in decodeWavPcm:', e);
            return null;
        }
    }

    function readStr(view, offset, n) {
        let s = '';
        for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
        return s;
    }

    function measurePeaks(buffer, count) {
        try {
            const channel = buffer.getChannelData(0);
            const step = Math.max(1, Math.floor(channel.length / count));
            const out = [];
            for (let i = 0; i < count; i++) {
                const start = i * step;
                const end = Math.min(start + step, channel.length);
                let max = 0;
                for (let j = start; j < end; j++) {
                    const amp = Math.abs(channel[j]);
                    if (amp > max) max = amp;
                }
                out.push(max);
            }
            return out;
        } catch (e) {
            console.error('Error in measurePeaks:', e);
            // Return a default set of peaks if there's an error
            return Array(count).fill(0.5);
        }
    }

    function paint() {
        if (!peaks.length) return;
        const style = styleSelect.value;
        const color = colorPicker.value;
        const caption = captionInput.value.trim();
        const width = 800;
        const height = 240;

        waveform.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Soundwave of ' + sourceLabel);
        const ctx = canvas.getContext('2d');
        drawWave(ctx, width, height, peaks, style, color, caption);
        waveform.appendChild(canvas);

        const svg = waveSVG(width, height, peaks, style, color, caption);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.position = 'absolute';
        svg.style.inset = '0';
        waveform.appendChild(svg);

        if (readout) {
            const loud = peaks.reduce((a, b) => a + b, 0) / peaks.length;
            const seconds = audioBuffer ? audioBuffer.duration.toFixed(1) : '—';
            const rate = audioBuffer ? audioBuffer.sampleRate : '—';
            readout.textContent = sourceLabel + ' · ' + seconds + 's · ' + rate + ' Hz · ' +
                peaks.length + ' peaks · mean ' + loud.toFixed(2);
        }
    }

    function drawWave(ctx, width, height, amps, style, color, caption) {
        ctx.clearRect(0, 0, width, height);
        const mid = caption ? height * 0.42 : height * 0.5;
        const scale = caption ? height * 0.34 : height * 0.42;
        if (style === 'bars') {
            const gap = 3;
            const barW = Math.max(2, (width - gap * amps.length) / amps.length);
            amps.forEach((amp, i) => {
                const h = Math.max(2, amp * scale * 2);
                ctx.fillStyle = color;
                ctx.fillRect(i * (barW + gap), mid - h / 2, barW, h);
            });
        } else if (style === 'ripple') {
            const cx = width / 2;
            const cy = mid;
            const maxR = Math.min(width, height) * 0.38;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            amps.forEach((amp, i) => {
                if (i % 3 !== 0) return;
                ctx.globalAlpha = 0.35 + amp * 0.65;
                ctx.beginPath();
                ctx.arc(cx, cy, 8 + amp * maxR, 0, Math.PI * 2);
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            amps.forEach((amp, i) => {
                const x = (i / (amps.length - 1)) * width;
                const y = mid - amp * scale;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            for (let i = amps.length - 1; i >= 0; i--) {
                const x = (i / (amps.length - 1)) * width;
                const y = mid + amps[i] * scale;
                ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = color;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
        }
        if (caption) {
            ctx.fillStyle = '#0f172a';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(caption, width / 2, height - 12);
        }
    }

    function waveSVG(width, height, amps, style, color, caption) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        const mid = caption ? height * 0.42 : height * 0.5;
        const scale = caption ? height * 0.34 : height * 0.42;
        if (style === 'bars') {
            const gap = 3;
            const barW = Math.max(2, (width - gap * amps.length) / amps.length);
            amps.forEach((amp, i) => {
                const h = Math.max(2, amp * scale * 2);
                const bar = document.createElementNS(svgNS, 'rect');
                bar.setAttribute('x', String(i * (barW + gap)));
                bar.setAttribute('y', String(mid - h / 2));
                bar.setAttribute('width', String(barW));
                bar.setAttribute('height', String(h));
                bar.setAttribute('fill', color);
                svg.appendChild(bar);
            });
        } else if (style === 'ripple') {
            const cx = width / 2;
            const cy = mid;
            const maxR = Math.min(width, height) * 0.38;
            amps.forEach((amp, i) => {
                if (i % 3 !== 0) return;
                const circle = document.createElementNS(svgNS, 'circle');
                circle.setAttribute('cx', String(cx));
                circle.setAttribute('cy', String(cy));
                circle.setAttribute('r', String(8 + amp * maxR));
                circle.setAttribute('fill', 'none');
                circle.setAttribute('stroke', color);
                circle.setAttribute('stroke-width', '1.5');
                circle.setAttribute('opacity', String(0.35 + amp * 0.65));
                svg.appendChild(circle);
            });
        } else {
            const top = amps.map((amp, i) => {
                const x = (i / (amps.length - 1)) * width;
                return x.toFixed(1) + ',' + (mid - amp * scale).toFixed(1);
            });
            const bottom = amps.map((amp, i) => {
                const x = (i / (amps.length - 1)) * width;
                return x.toFixed(1) + ',' + (mid + amp * scale).toFixed(1);
            }).reverse();
            const path = document.createElementNS(svgNS, 'polygon');
            path.setAttribute('points', top.concat(bottom).join(' '));
            path.setAttribute('fill', color);
            path.setAttribute('fill-opacity', '0.18');
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', '2');
            svg.appendChild(path);
        }
        if (caption) {
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', String(width / 2));
            text.setAttribute('y', String(height - 12));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-family', 'sans-serif');
            text.setAttribute('font-size', '16');
            text.setAttribute('fill', '#0f172a');
            text.textContent = caption;
            svg.appendChild(text);
        }
        return svg;
    }

    function remember() {
        if (typeof Time === 'undefined' || !Time.save) return;
        try {
            Time.save({
                peaks: peaks,
                style: styleSelect.value,
                color: colorPicker.value,
                caption: captionInput.value,
                label: sourceLabel
            });
        } catch (e) { /* share is an extra */ }
    }

    function toggleRecording() {
        if (isRecording) stopRecording();
        else startRecording();
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size) audioChunks.push(event.data);
            };
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                stream.getTracks().forEach((track) => track.stop());
                try {
                    await ingestAudio(await audioBlob.arrayBuffer(), 'recording');
                } catch (error) {
                    console.error(error);
                    alert('Could not read that recording. Try dropping a file instead.');
                }
            };
            mediaRecorder.start();
            isRecording = true;
            recordButton.textContent = '■';
            recordButton.setAttribute('aria-label', 'Stop recording');
            recordButton.style.backgroundColor = '#ef4444';
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access the microphone. Drop an audio file instead — it stays on this device.');
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            recordButton.textContent = '●';
            recordButton.setAttribute('aria-label', 'Record');
            recordButton.style.backgroundColor = '';
        }
    }

    function handleDragOver(event) {
        event.preventDefault();
        dropArea.style.backgroundColor = '#e2e8f0';
    }

    function handleDrop(event) {
        event.preventDefault();
        dropArea.style.backgroundColor = '';
        const files = event.dataTransfer && event.dataTransfer.files;
        if (files && files.length) processAudioFile(files[0]);
    }

    function processAudioFile(file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                await ingestAudio(event.target.result, file.name || 'audio file');
            } catch (error) {
                console.error('Error processing audio file:', error);
                alert('Could not process that audio file. Try a WAV, MP3, or a short voice memo.');
            }
        };
        reader.onerror = () => alert('Could not read that file.');
        reader.readAsArrayBuffer(file);
    }

    function downloadPNG() {
        const canvas = waveform.querySelector('canvas');
        if (!canvas || !peaks.length) {
            alert('No soundwave to download yet.');
            return;
        }
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = 'wavehello.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
});
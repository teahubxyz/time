// Wavehello App Logic

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const recordButton = document.getElementById('recordButton');
    const dropArea = document.getElementById('dropArea');
    const waveform = document.getElementById('waveform');
    const styleSelect = document.getElementById('styleSelect');
    const colorPicker = document.getElementById('colorPicker');
    const captionInput = document.getElementById('captionInput');
    const downloadButton = document.getElementById('downloadButton');
    
    // State
    let audioContext = null;
    let audioBuffer = null;
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];
    
    // Check for Time library features
    checkTimeFeatures();
    
    // Initialize with sample data
    initializeSample();
    
    // Event Listeners
    recordButton.addEventListener('click', toggleRecording);
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('drop', handleDrop);
    styleSelect.addEventListener('change', updateVisualization);
    colorPicker.addEventListener('input', updateVisualization);
    captionInput.addEventListener('input', updateVisualization);
    downloadButton.addEventListener('click', downloadPNG);
    
    // Functions
    function checkTimeFeatures() {
        // Check if Time.accounts is available and show sign-in option if so
        if (typeof Time !== 'undefined' && Time.accounts) {
            // In a full implementation, we would add sign-in UI here
            console.log('Time accounts feature is available');
        }
        
        // Check for shared data
        if (typeof Time !== 'undefined') {
            const sharedData = Time.load();
            if (sharedData) {
                // Load shared creation if present
                console.log('Loading shared data:', sharedData);
                // In a full implementation, we would load the shared creation here
            }
        }
    }
    
    async function initializeSample() {
        try {
            // Fetch the sample audio file
            const response = await fetch('sample.wav');
            if (!response.ok) {
                throw new Error('Failed to load sample audio');
            }
            
            const arrayBuffer = await response.arrayBuffer();
            
            // Create audio context if needed
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Decode the audio data
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Visualize the audio buffer
            visualizeAudioBuffer(audioBuffer);
        } catch (error) {
            console.error('Error loading sample:', error);
            // Fallback to sample visualization if loading fails
            createSampleVisualization();
        }
    }
    
    function createSampleVisualization() {
        // Clear previous content
        waveform.innerHTML = '';
        
        // Get selected style and color
        const style = styleSelect.value;
        const color = colorPicker.value;
        const caption = captionInput.value;
        
        // Create SVG container
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 800 200");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        
        // Add background
        const bg = document.createElementNS(svgNS, "rect");
        bg.setAttribute("width", "100%");
        bg.setAttribute("height", "100%");
        bg.setAttribute("fill", "white");
        svg.appendChild(bg);
        
        // Generate sample waveform data
        const points = [];
        for (let i = 0; i <= 800; i += 10) {
            // Create a more interesting wave pattern
            const amplitude = Math.sin(i / 50) * 30 + Math.sin(i / 20) * 20;
            const y = 100 - amplitude;
            points.push(`${i},${y}`);
        }
        
        // Draw based on selected style
        if (style === 'line') {
            const path = document.createElementNS(svgNS, "polyline");
            path.setAttribute("points", points.join(" "));
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", color);
            path.setAttribute("stroke-width", "2");
            svg.appendChild(path);
        } else if (style === 'bars') {
            for (let i = 0; i < points.length; i++) {
                const [x, y] = points[i].split(',').map(Number);
                const height = 100 - y;
                const bar = document.createElementNS(svgNS, "rect");
                bar.setAttribute("x", x - 2);
                bar.setAttribute("y", y);
                bar.setAttribute("width", "4");
                bar.setAttribute("height", height);
                bar.setAttribute("fill", color);
                svg.appendChild(bar);
            }
        } else if (style === 'ripple') {
            const circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", "400");
            circle.setAttribute("cy", "100");
            circle.setAttribute("r", "80");
            circle.setAttribute("fill", "none");
            circle.setAttribute("stroke", color);
            circle.setAttribute("stroke-width", "2");
            svg.appendChild(circle);
            
            const innerCircle = document.createElementNS(svgNS, "circle");
            innerCircle.setAttribute("cx", "400");
            innerCircle.setAttribute("cy", "100");
            innerCircle.setAttribute("r", "50");
            innerCircle.setAttribute("fill", "none");
            innerCircle.setAttribute("stroke", color);
            innerCircle.setAttribute("stroke-width", "1");
            innerCircle.setAttribute("stroke-dasharray", "5,5");
            svg.appendChild(innerCircle);
            
            const center = document.createElementNS(svgNS, "circle");
            center.setAttribute("cx", "400");
            center.setAttribute("cy", "100");
            center.setAttribute("r", "10");
            center.setAttribute("fill", color);
            svg.appendChild(center);
        }
        
        // Add caption if provided
        if (caption) {
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", "400");
            text.setAttribute("y", "180");
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-family", "sans-serif");
            text.setAttribute("font-size", "14");
            text.setAttribute("fill", "#333");
            text.textContent = caption;
            svg.appendChild(text);
        }
        
        waveform.appendChild(svg);
    }
    
    function updateVisualization() {
        if (audioBuffer) {
            visualizeAudioBuffer(audioBuffer);
        } else {
            createSampleVisualization();
        }
    }
    
    function toggleRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }
    
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await processAudioBlob(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            isRecording = true;
            recordButton.textContent = '⏹';
            recordButton.style.backgroundColor = '#ef4444';
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Please ensure you have given permission.');
        }
    }
    
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            recordButton.textContent = '●';
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
        
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                processAudioFile(file);
            } else {
                alert('Please drop an audio file.');
            }
        }
    }
    
    function processAudioFile(file) {
        const reader = new FileReader();
        reader.onload = async event => {
            try {
                const arrayBuffer = event.target.result;
                await decodeAudioData(arrayBuffer);
            } catch (error) {
                console.error('Error processing audio file:', error);
                alert('Could not process the audio file. Please try another file.');
            }
        };
        reader.readAsArrayBuffer(file);
    }
    
    async function processAudioBlob(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        await decodeAudioData(arrayBuffer);
    }
    
    async function decodeAudioData(arrayBuffer) {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            visualizeAudioBuffer(audioBuffer);
            
            // Save creation using Time library if available
            if (typeof Time !== 'undefined') {
                const creationData = {
                    style: styleSelect.value,
                    color: colorPicker.value,
                    caption: captionInput.value,
                    // In a full implementation, we would include audio data or a reference
                };
                
                // Try to save the creation
                const shareLink = Time.save(creationData);
                if (shareLink) {
                    console.log('Creation saved with share link:', shareLink);
                    // In a full implementation, we would show the share link to the user
                }
            }
        } catch (error) {
            console.error('Error decoding audio data:', error);
            alert('Could not decode the audio data. Please try another file.');
        }
    }
    
    function visualizeAudioBuffer(buffer) {
        // Clear previous visualization
        waveform.innerHTML = '';
        
        // Get selected style and color
        const style = styleSelect.value;
        const color = colorPicker.value;
        const caption = captionInput.value;
        
        // Create SVG container
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 800 200");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        
        // Add background
        const bg = document.createElementNS(svgNS, "rect");
        bg.setAttribute("width", "100%");
        bg.setAttribute("height", "100%");
        bg.setAttribute("fill", "white");
        svg.appendChild(bg);
        
        // Get audio data (use left channel or mono)
        const channelData = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0);
        
        // Reduce data points for visualization
        const step = Math.ceil(channelData.length / 800);
        const ampPoints = [];
        
        for (let i = 0; i < 800; i++) {
            const start = i * step;
            const end = Math.min(start + step, channelData.length);
            let max = 0;
            
            for (let j = start; j < end; j++) {
                const amplitude = Math.abs(channelData[j]);
                if (amplitude > max) max = amplitude;
            }
            
            ampPoints.push(max);
        }
        
        // Draw based on selected style
        if (style === 'line') {
            const points = ampPoints.map((amp, i) => {
                const y = 100 - (amp * 80); // Scale amplitude to fit in view
                return `${i}, ${y}`;
            }).join(" ");
            
            const path = document.createElementNS(svgNS, "polyline");
            path.setAttribute("points", points);
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", color);
            path.setAttribute("stroke-width", "2");
            svg.appendChild(path);
        } else if (style === 'bars') {
            for (let i = 0; i < ampPoints.length; i += 5) {
                const amp = ampPoints[i];
                const height = amp * 100; // Scale amplitude
                const bar = document.createElementNS(svgNS, "rect");
                bar.setAttribute("x", i);
                bar.setAttribute("y", 100 - height);
                bar.setAttribute("width", "3");
                bar.setAttribute("height", height);
                bar.setAttribute("fill", color);
                svg.appendChild(bar);
            }
        } else if (style === 'ripple') {
            // Create concentric circles based on amplitude
            const centerX = 400;
            const centerY = 100;
            
            // Draw outer circle
            const maxRadius = 80;
            const circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", centerX);
            circle.setAttribute("cy", centerY);
            circle.setAttribute("r", maxRadius);
            circle.setAttribute("fill", "none");
            circle.setAttribute("stroke", color);
            circle.setAttribute("stroke-width", "1");
            svg.appendChild(circle);
            
            // Draw inner circles based on peaks
            const peakCount = 5;
            for (let i = 0; i < peakCount; i++) {
                const idx = Math.floor((i / peakCount) * ampPoints.length);
                const radius = ampPoints[idx] * 50;
                const circle = document.createElementNS(svgNS, "circle");
                circle.setAttribute("cx", centerX);
                circle.setAttribute("cy", centerY);
                circle.setAttribute("r", radius);
                circle.setAttribute("fill", "none");
                circle.setAttribute("stroke", color);
                circle.setAttribute("stroke-width", "1");
                circle.setAttribute("opacity", 0.7 - (i * 0.1));
                svg.appendChild(circle);
            }
            
            // Draw center point
            const center = document.createElementNS(svgNS, "circle");
            center.setAttribute("cx", centerX);
            center.setAttribute("cy", centerY);
            center.setAttribute("r", "5");
            center.setAttribute("fill", color);
            svg.appendChild(center);
        }
        
        // Add caption if provided
        if (caption) {
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", "400");
            text.setAttribute("y", "180");
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-family", "sans-serif");
            text.setAttribute("font-size", "14");
            text.setAttribute("fill", "#333");
            text.textContent = caption;
            svg.appendChild(text);
        }
        
        waveform.appendChild(svg);
    }
    
    function downloadPNG() {
        const svg = waveform.querySelector('svg');
        if (!svg) {
            alert('No visualization to download');
            return;
        }
        
        // Serialize SVG to string
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);
        const svgBlob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
        
        // Convert SVG to canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            canvas.width = 800;
            canvas.height = 200;
            ctx.drawImage(img, 0, 0);
            
            // Create download link
            const pngUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = 'wavehello.png';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        };
        
        const url = URL.createObjectURL(svgBlob);
        img.src = `data:image/svg+xml;base64,${btoa(svgString)}`;
    }
});
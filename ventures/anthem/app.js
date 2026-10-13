// Anthem - Main Application Logic

// Audio context for WebAudio API
let audioContext;
let isPlaying = false;
let scheduledNotes = [];

// Style constants
const STYLES = {
  CHIPTUNE: 'chiptune',
  LOFI: 'lo-fi',
  FANFARE: 'fanfare'
};

// Current state
let currentState = {
  name: 'Anthem',
  style: STYLES.CHIPTUNE,
  volume: 0.7
};

// Note mapping for melody generation
const NOTE_MAPPING = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const OCTAVE_NOTES = {
  'C4': 261.63,
  'D4': 293.66,
  'E4': 329.63,
  'F4': 349.23,
  'G4': 392.00,
  'A4': 440.00,
  'B4': 493.88,
  'C5': 523.25
};

// Initialize the app
function initApp() {
  // Check if we have a saved state from URL
  const loadedState = Time.load();
  if (loadedState) {
    currentState = loadedState;
  }
  
  // Set up UI elements
  setupUI();
  
  // Initialize audio context on first user interaction
  document.body.addEventListener('click', initAudio, { once: true });
  
  // Render initial state
  renderState();
}

// Set up UI event listeners
function setupUI() {
  const nameInput = document.getElementById('name-input');
  const playButton = document.getElementById('play-button');
  const styleChips = document.querySelectorAll('.style-chip');
  const shareButton = document.getElementById('share-button');
  const downloadButton = document.getElementById('download-button');
  
  // Name input handler
  nameInput.addEventListener('input', function(e) {
    currentState.name = e.target.value || 'Anthem';
    renderState();
  });
  
  // Play button handler
  playButton.addEventListener('click', function() {
    if (isPlaying) {
      stopPlayback();
      playButton.textContent = 'Play';
      isPlaying = false;
    } else {
      playMelody();
      playButton.textContent = 'Stop';
      isPlaying = true;
    }
  });
  
  // Style selection handlers
  styleChips.forEach(chip => {
    chip.addEventListener('click', function() {
      // Remove active class from all chips
      styleChips.forEach(c => c.classList.remove('active'));
      // Add active class to clicked chip
      this.classList.add('active');
      // Update style
      currentState.style = this.dataset.style;
      renderState();
    });
  });
  
  // Share button handler
  shareButton.addEventListener('click', function() {
    const link = Time.save(currentState);
    if (link) {
      navigator.clipboard.writeText(link).then(() => {
        const originalText = shareButton.textContent;
        shareButton.textContent = 'Copied!';
        setTimeout(() => {
          shareButton.textContent = originalText;
        }, 2000);
      });
    } else {
      // Fallback for when Time.save returns null
      const url = new URL(window.location);
      url.searchParams.set('s', btoa(JSON.stringify(currentState)).replace(/[^a-zA-Z0-9]/g, ''));
      navigator.clipboard.writeText(url.toString());
      const originalText = shareButton.textContent;
      shareButton.textContent = 'Copied!';
      setTimeout(() => {
        shareButton.textContent = originalText;
      }, 2000);
    }
  });
  
  // Download button handler
  downloadButton.addEventListener('click', function() {
    generateWAV();
  });
}

// Render current state to UI
function renderState() {
  // Update name input
  document.getElementById('name-input').value = currentState.name;
  
  // Update title card
  document.getElementById('title-text').textContent = currentState.name;
  
  // Update style chips
  document.querySelectorAll('.style-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.style === currentState.style);
  });
  
  // Update visualization
  updateVisualization();
}

// Update visualization based on current state
function updateVisualization() {
  const viz = document.getElementById('visualization');
  viz.innerHTML = '';
  
  // Create bars representing the melody
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    
    // Get note for this position
    const charIndex = i % currentState.name.length;
    const charCode = currentState.name.charCodeAt(charIndex);
    const noteIndex = charCode % NOTE_MAPPING.length;
    const note = NOTE_MAPPING[noteIndex];
    
    // Set height based on note frequency
    const frequency = OCTAVE_NOTES[note];
    const height = 20 + (frequency / OCTAVE_NOTES['C5']) * 80;
    bar.style.height = `${height}%`;
    
    // Set color based on style
    switch (currentState.style) {
      case STYLES.CHIPTUNE:
        bar.style.backgroundColor = '#00ff00';
        break;
      case STYLES.LOFI:
        bar.style.backgroundColor = '#ff6b6b';
        break;
      case STYLES.FANFARE:
        bar.style.backgroundColor = '#4cc9f0';
        break;
    }
    
    viz.appendChild(bar);
  }
}

// Initialize audio context
function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Play the melody
function playMelody() {
  if (!audioContext) {
    initAudio();
  }
  
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  stopPlayback();
  
  // Schedule notes for playback
  const startTime = audioContext.currentTime + 0.1;
  const tempo = 120; // BPM
  const secondsPerBeat = 60 / tempo;
  
  for (let i = 0; i < 8; i++) {
    const charIndex = i % currentState.name.length;
    const charCode = currentState.name.charCodeAt(charIndex);
    const noteIndex = charCode % NOTE_MAPPING.length;
    const note = NOTE_MAPPING[noteIndex];
    const frequency = OCTAVE_NOTES[note];
    
    const noteTime = startTime + i * secondsPerBeat;
    scheduleNote(frequency, noteTime, secondsPerBeat * 0.8);
  }
}

// Schedule a single note
function scheduleNote(frequency, startTime, duration) {
  if (!audioContext) return;
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Set oscillator type based on style
  switch (currentState.style) {
    case STYLES.CHIPTUNE:
      oscillator.type = 'square';
      break;
    case STYLES.LOFI:
      oscillator.type = 'sawtooth';
      gainNode.gain.value = 0.3; // Lower volume for lo-fi
      break;
    case STYLES.FANFARE:
      oscillator.type = 'triangle';
      break;
  }
  
  oscillator.frequency.value = frequency;
  
  // Apply envelope
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(currentState.volume, startTime + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
  
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
  
  // Keep track of scheduled notes for stopping
  scheduledNotes.push({
    oscillator: oscillator,
    gainNode: gainNode
  });
  
  // Clean up after note finishes
  oscillator.onended = function() {
    const index = scheduledNotes.findIndex(note => note.oscillator === oscillator);
    if (index !== -1) {
      scheduledNotes.splice(index, 1);
    }
    
    // If this was the last note, reset play button
    if (scheduledNotes.length === 0) {
      document.getElementById('play-button').textContent = 'Play';
      isPlaying = false;
    }
  };
}

// Stop playback
function stopPlayback() {
  scheduledNotes.forEach(note => {
    try {
      note.oscillator.stop();
    } catch (e) {
      // Ignore errors when stopping
    }
  });
  scheduledNotes = [];
}

// Generate WAV file
function generateWAV() {
  // In a real implementation, this would generate actual audio data
  // For now, we'll just simulate the download
  alert('In a complete implementation, this would download a WAV file of your theme song.');
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initApp);
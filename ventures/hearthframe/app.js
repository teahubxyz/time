// Hearthframe Application Logic
document.addEventListener('DOMContentLoaded', function() {
  // Sample data for initial load
  const samplePhotos = [
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+U2FtcGxlIFBob3RvIDE8L3RleHQ+PC9zdmc+',
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzaWxpbmU9Im1pZGRsZSI+U2FtcGxlIFBob3RvIDI8L3RleHQ+PC9zdmc+',
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOGY4Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iIzMzMyIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzaWxpbmU9Im1pZGRsZSI+U2FtcGxlIFBob3RvIDM8L3RleHQ+PC9zdmc+'
  ];

  // State management
  let state = {
    photos: samplePhotos,
    currentIndex: 0,
    frameStyle: 'classic',
    clockStyle: 'digital',
    transition: 'fade',
    caption: 'Our family memories',
    isPlaying: false,
    intervalId: null
  };

  // DOM Elements
  const elements = {
    photoInput: document.getElementById('photo-input'),
    photoContainer: document.getElementById('photo-container'),
    frameSelect: document.getElementById('frame-style'),
    clockSelect: document.getElementById('clock-style'),
    transitionSelect: document.getElementById('transition'),
    captionInput: document.getElementById('caption'),
    previewBtn: document.getElementById('preview-btn'),
    downloadBtn: document.getElementById('download-btn'),
    playBtn: document.getElementById('play-btn'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    slideshowContainer: document.getElementById('slideshow'),
    slideshowImage: document.getElementById('slideshow-image'),
    slideshowCaption: document.getElementById('slideshow-caption'),
    slideshowClock: document.getElementById('slideshow-clock'),
    closeSlideshowBtn: document.getElementById('close-slideshow')
  };

  // Frame styles
  const frameStyles = {
    classic: { border: 'solid 20px #8B4513', background: '#f5f5dc' },
    modern: { border: 'solid 15px #333', background: '#fff' },
    vintage: { border: 'solid 25px #d2b48c', background: '#f0e6d2' },
    minimalist: { border: 'solid 10px #eee', background: '#fff' }
  };

  // Initialize the app
  function init() {
    setupEventListeners();
    renderPhotoGrid();
    updateTime();
    setInterval(updateTime, 1000);
  }

  // Set up event listeners
  function setupEventListeners() {
    elements.photoInput.addEventListener('change', handlePhotoUpload);
    elements.frameSelect.addEventListener('change', updateFrameStyle);
    elements.clockSelect.addEventListener('change', updateClockStyle);
    elements.transitionSelect.addEventListener('change', updateTransition);
    elements.captionInput.addEventListener('input', updateCaption);
    elements.previewBtn.addEventListener('click', toggleSlideshow);
    elements.downloadBtn.addEventListener('click', downloadFrame);
    elements.playBtn.addEventListener('click', togglePlay);
    elements.prevBtn.addEventListener('click', showPrevPhoto);
    elements.nextBtn.addEventListener('click', showNextPhoto);
    elements.closeSlideshowBtn.addEventListener('click', closeSlideshow);
  }

  // Handle photo upload
  function handlePhotoUpload(event) {
    const files = Array.from(event.target.files);
    const newPhotos = [];
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          newPhotos.push(e.target.result);
          if (newPhotos.length === files.length) {
            state.photos = [...state.photos, ...newPhotos];
            renderPhotoGrid();
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Render photo grid
  function renderPhotoGrid() {
    elements.photoContainer.innerHTML = '';
    state.photos.forEach((photo, index) => {
      const img = document.createElement('img');
      img.src = photo;
      img.alt = `Uploaded photo ${index + 1}`;
      img.className = 'thumbnail';
      elements.photoContainer.appendChild(img);
    });
  }

  // Update frame style
  function updateFrameStyle() {
    state.frameStyle = elements.frameSelect.value;
    if (elements.slideshowContainer.style.display !== 'none') {
      applyFrameStyle();
    }
  }

  // Apply frame style to slideshow
  function applyFrameStyle() {
    const style = frameStyles[state.frameStyle];
    elements.slideshowContainer.style.border = style.border;
    elements.slideshowContainer.style.background = style.background;
  }

  // Update clock style
  function updateClockStyle() {
    state.clockStyle = elements.clockSelect.value;
  }

  // Update transition effect
  function updateTransition() {
    state.transition = elements.transitionSelect.value;
  }

  // Update caption
  function updateCaption() {
    state.caption = elements.captionInput.value;
    elements.slideshowCaption.textContent = state.caption;
  }

  // Toggle slideshow
  function toggleSlideshow() {
    if (elements.slideshowContainer.style.display === 'none') {
      showSlideshow();
    } else {
      closeSlideshow();
    }
  }

  // Show slideshow
  function showSlideshow() {
    elements.slideshowContainer.style.display = 'block';
    document.querySelector('.app-container').style.display = 'none';
    updateSlideshow();
    applyFrameStyle();
  }

  // Close slideshow
  function closeSlideshow() {
    elements.slideshowContainer.style.display = 'none';
    document.querySelector('.app-container').style.display = 'block';
    stopSlideshow();
  }

  // Update slideshow display
  function updateSlideshow() {
    if (state.photos.length > 0) {
      elements.slideshowImage.src = state.photos[state.currentIndex];
      elements.slideshowCaption.textContent = state.caption;
      
      // Apply transition effect
      elements.slideshowImage.style.opacity = '0';
      setTimeout(() => {
        elements.slideshowImage.style.opacity = '1';
      }, 100);
    }
  }

  // Show previous photo
  function showPrevPhoto() {
    if (state.photos.length > 0) {
      state.currentIndex = (state.currentIndex - 1 + state.photos.length) % state.photos.length;
      updateSlideshow();
    }
  }

  // Show next photo
  function showNextPhoto() {
    if (state.photos.length > 0) {
      state.currentIndex = (state.currentIndex + 1) % state.photos.length;
      updateSlideshow();
    }
  }

  // Toggle play/pause
  function togglePlay() {
    if (state.isPlaying) {
      stopSlideshow();
      elements.playBtn.textContent = '▶ Play';
    } else {
      startSlideshow();
      elements.playBtn.textContent = '⏸ Pause';
    }
  }

  // Start slideshow
  function startSlideshow() {
    state.isPlaying = true;
    state.intervalId = setInterval(() => {
      state.currentIndex = (state.currentIndex + 1) % state.photos.length;
      updateSlideshow();
    }, 5000);
  }

  // Stop slideshow
  function stopSlideshow() {
    state.isPlaying = false;
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
  }

  // Update time display
  function updateTime() {
    const now = new Date();
    if (state.clockStyle === 'digital') {
      elements.slideshowClock.textContent = now.toLocaleTimeString();
    } else {
      elements.slideshowClock.textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    }
  }

  // Download frame as HTML file
  function downloadFrame() {
    const htmlContent = generateHTML();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hearthframe.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Generate standalone HTML file
  function generateHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hearthframe</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            overflow: hidden;
        }
        .frame {
            border: solid 20px #8B4513;
            background: #f5f5dc;
            width: 90vmin;
            height: 90vmin;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .photo-container {
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }
        .photo {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        .caption {
            text-align: center;
            padding: 10px;
            font-size: 1.2em;
            color: #333;
        }
        .clock {
            position: absolute;
            top: 10px;
            right: 10px;
            font-size: 1em;
            color: #333;
            background: rgba(255, 255, 255, 0.7);
            padding: 5px 10px;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="frame" id="frame">
        <div class="photo-container">
            <img class="photo" id="photo" src="${state.photos[0] || ''}" alt="Slideshow photo">
        </div>
        <div class="caption" id="caption">${state.caption}</div>
        <div class="clock" id="clock"></div>
    </div>

    <script>
        const photos = ${JSON.stringify(state.photos)};
        let currentIndex = 0;
        
        const photoElement = document.getElementById('photo');
        const captionElement = document.getElementById('caption');
        const clockElement = document.getElementById('clock');
        
        function updateTime() {
            const now = new Date();
            clockElement.textContent = now.toLocaleTimeString();
        }
        
        function updatePhoto() {
            if (photos.length > 0) {
                photoElement.src = photos[currentIndex];
                currentIndex = (currentIndex + 1) % photos.length;
            }
        }
        
        // Initial setup
        updateTime();
        updatePhoto();
        
        // Update time every second
        setInterval(updateTime, 1000);
        
        // Change photo every 5 seconds
        setInterval(updatePhoto, 5000);
    <\/script>
</body>
</html>`;
  }

  // Initialize the application
  init();
});
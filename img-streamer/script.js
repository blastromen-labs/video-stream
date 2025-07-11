// Constants - Note: Width and Height are swapped from video app
const PANEL_WIDTH = 40;
const PANEL_HEIGHT = 96;
const FRAME_SIZE = PANEL_WIDTH * PANEL_HEIGHT * 3;  // RGB
const CHUNK_SIZE = 1024;
const TARGET_FPS = 30;
const FRAME_TIME = 1000 / TARGET_FPS;

// State variables
let port;
let isStreaming = false;
let isConnected = false;
let frameCount = 0;
let lastFpsTime = 0;
let streamInterval;
let contrast = 1.0;
let marginX = 10; // Default 10% margin on each side
let marginY = 5;  // Default 5% margin on top and bottom
let yPosition = 50; // Default 50% (centered)
let shadows = 0; // Default 0 (no adjustment)
let midtones = 0; // Default 0 (no adjustment)
let highlights = 0; // Default 0 (no adjustment)
let showGuides = false; // Default false (guides hidden)
let letterSpacing = 0.3; // Default 0.3

// Image mode variables
let displayMode = 'text'; // 'text' or 'image'
let uploadedImage = null;
let imageXPosition = 50;
let imageYPosition = 50;
let imageScale = 100;
let imageFitMode = 'fill';

// Get DOM elements
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
const processCanvas = document.getElementById('processCanvas');
const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });
const textInput = document.getElementById('textInput');
const textColor = document.getElementById('textColor');
const previewMode = document.getElementById('previewMode');
const fontSelect = document.getElementById('fontSelect');
const letterSpacingSlider = document.getElementById('letterSpacing');
const contrastSlider = document.getElementById('contrast');
const marginXSlider = document.getElementById('marginX');
const marginYSlider = document.getElementById('marginY');
const yPositionSlider = document.getElementById('yPosition');
const shadowsSlider = document.getElementById('shadows');
const midtonesSlider = document.getElementById('midtones');
const highlightsSlider = document.getElementById('highlights');
const showGuidesCheckbox = document.getElementById('showGuides');

// Image mode DOM elements
const modeSelect = document.getElementById('modeSelect');
const textControls = document.getElementById('textControls');
const imageControls = document.getElementById('imageControls');
const imageUpload = document.getElementById('imageUpload');
const imageInfo = document.getElementById('imageInfo');
const imageFitModeSelect = document.getElementById('imageFitMode');
const imageXPositionSlider = document.getElementById('imageXPosition');
const imageYPositionSlider = document.getElementById('imageYPosition');
const imageScaleSlider = document.getElementById('imageScale');

// Set up canvases
previewCanvas.width = PANEL_WIDTH;
previewCanvas.height = PANEL_HEIGHT;
processCanvas.width = PANEL_WIDTH;
processCanvas.height = PANEL_HEIGHT;

// Start preview loop
requestAnimationFrame(updatePreview);

// Initialize centered indicator visibility
const centeredIndicator = document.getElementById('centeredIndicator');
if (yPosition === 50) {
    centeredIndicator.style.display = 'inline';
} else {
    centeredIndicator.style.display = 'none';
}

// Initialize letter spacing display
document.getElementById('letterSpacingValue').textContent = letterSpacing.toFixed(2);

// Event listeners
document.getElementById('connectButton').addEventListener('click', toggleConnection);
document.getElementById('streamButton').addEventListener('click', toggleStreaming);
document.getElementById('stopButton').addEventListener('click', stopStreaming);
document.getElementById('downloadBinButton').addEventListener('click', downloadBin);
textInput.addEventListener('input', () => requestAnimationFrame(updatePreview));
textColor.addEventListener('input', () => requestAnimationFrame(updatePreview));
fontSelect.addEventListener('change', () => {
    // Update letter spacing to font's default
    const fontConfig = getFontConfig(fontSelect.value);
    letterSpacing = fontConfig.letterSpacing || 0.3;
    letterSpacingSlider.value = Math.round(letterSpacing * 100);
    document.getElementById('letterSpacingValue').textContent = letterSpacing.toFixed(2);
    requestAnimationFrame(updatePreview);
});
letterSpacingSlider.addEventListener('input', (e) => {
    letterSpacing = parseInt(e.target.value) / 100;
    document.getElementById('letterSpacingValue').textContent = letterSpacing.toFixed(2);
    requestAnimationFrame(updatePreview);
});
contrastSlider.addEventListener('input', (e) => {
    contrast = e.target.value / 100;
    document.getElementById('contrastValue').textContent = contrast.toFixed(1);
    requestAnimationFrame(updatePreview);
});
marginXSlider.addEventListener('input', (e) => {
    marginX = parseInt(e.target.value);
    document.getElementById('marginXValue').textContent = marginX;
    requestAnimationFrame(updatePreview);
});
marginYSlider.addEventListener('input', (e) => {
    marginY = parseInt(e.target.value);
    document.getElementById('marginYValue').textContent = marginY;
    requestAnimationFrame(updatePreview);
});
yPositionSlider.addEventListener('input', (e) => {
    yPosition = parseInt(e.target.value);
    document.getElementById('yPositionValue').textContent = yPosition;

    // Show/hide centered indicator
    if (yPosition === 50) {
        centeredIndicator.style.display = 'inline';
    } else {
        centeredIndicator.style.display = 'none';
    }

    requestAnimationFrame(updatePreview);
});
shadowsSlider.addEventListener('input', (e) => {
    shadows = parseInt(e.target.value);
    document.getElementById('shadowsValue').textContent = shadows;
    requestAnimationFrame(updatePreview);
});
midtonesSlider.addEventListener('input', (e) => {
    midtones = parseInt(e.target.value);
    document.getElementById('midtonesValue').textContent = midtones;
    requestAnimationFrame(updatePreview);
});
highlightsSlider.addEventListener('input', (e) => {
    highlights = parseInt(e.target.value);
    document.getElementById('highlightsValue').textContent = highlights;
    requestAnimationFrame(updatePreview);
});
showGuidesCheckbox.addEventListener('change', () => {
    showGuides = showGuidesCheckbox.checked;
    requestAnimationFrame(updatePreview);
});

// Image mode event listeners
modeSelect.addEventListener('change', (e) => {
    displayMode = e.target.value;
    if (displayMode === 'text') {
        textControls.style.display = 'block';
        imageControls.style.display = 'none';
    } else {
        textControls.style.display = 'none';
        imageControls.style.display = 'block';
    }
    requestAnimationFrame(updatePreview);
});

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                uploadedImage = img;
                imageInfo.textContent = `${img.width}x${img.height} - ${file.name}`;
                requestAnimationFrame(updatePreview);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

imageFitModeSelect.addEventListener('change', (e) => {
    imageFitMode = e.target.value;
    requestAnimationFrame(updatePreview);
});

imageXPositionSlider.addEventListener('input', (e) => {
    imageXPosition = parseInt(e.target.value);
    document.getElementById('imageXPositionValue').textContent = imageXPosition;
    requestAnimationFrame(updatePreview);
});

imageYPositionSlider.addEventListener('input', (e) => {
    imageYPosition = parseInt(e.target.value);
    document.getElementById('imageYPositionValue').textContent = imageYPosition;
    requestAnimationFrame(updatePreview);
});

imageScaleSlider.addEventListener('input', (e) => {
    imageScale = parseInt(e.target.value);
    document.getElementById('imageScaleValue').textContent = imageScale;
    requestAnimationFrame(updatePreview);
});

// Helper function to convert hex to RGB
function hexToRgb(hex) {
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    return { r, g, b };
}

// Function to get font configuration based on selection
function getFontConfig(fontType) {
    const configs = {
        'monospace': {
            family: 'monospace',
            weight: 'normal',
            pixelated: false,
            letterSpacing: 0.2
        },
        'retro': {
            family: 'Courier New, monospace',
            weight: 'bold',
            pixelated: true,
            letterSpacing: 0.3
        },
        'pixel': {
            family: 'monospace',
            weight: 'bold',
            pixelated: true,
            letterSpacing: 0.4,
            minSize: 8
        },
        'terminal': {
            family: 'Consolas, Monaco, monospace',
            weight: 'normal',
            pixelated: false,
            letterSpacing: 0.2,
            glow: false
        },
        'arcade': {
            family: 'Impact, Arial Black, sans-serif',
            weight: 'bold',
            pixelated: true,
            letterSpacing: 0.3
        },
        'matrix': {
            family: 'Courier New, monospace',
            weight: 'bold',
            pixelated: false,
            letterSpacing: 0.25,
            glow: true,
            glowColor: '#00ff00'
        },
        'c64': {
            family: 'monospace',
            weight: 'normal',
            pixelated: false,
            letterSpacing: 0.1,
            blockStyle: true
        },
        'silkscreen': {
            family: 'Silkscreen, monospace',
            weight: '700',
            pixelated: false,  // Already pixelated by design
            letterSpacing: 0.3,
            minSize: 8
        },
        'orbitron': {
            family: 'Orbitron, sans-serif',
            weight: '700',
            pixelated: false,
            letterSpacing: 0.35,
            minSize: 8
        },
        'audiowide': {
            family: 'Audiowide, cursive',
            weight: '400',
            pixelated: false,
            letterSpacing: 0.4,
            minSize: 8
        },
        'doto': {
            family: 'Doto, sans-serif',
            weight: '700',
            pixelated: false,
            letterSpacing: 0.3,
            minSize: 8
        },
        'saira': {
            family: '"Saira Stencil One", cursive',
            weight: '400',
            pixelated: false,
            letterSpacing: 0.35,
            minSize: 9
        }
    };

    return configs[fontType] || configs['monospace'];
}

// Function to apply contrast adjustment
function adjustContrast(imageData, contrast) {
    const data = imageData.data;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        // Skip fully transparent pixels
        if (data[i + 3] === 0) continue;

        // Apply contrast to RGB channels
        data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));     // R
        data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128)); // G
        data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128)); // B
    }

    return imageData;
}

// Function to apply tone adjustments (shadows, midtones, highlights)
function adjustTones(imageData, shadowsVal, midtonesVal, highlightsVal) {
    const data = imageData.data;

    // Convert percentage values to adjustment factors
    const shadowFactor = 1 + (shadowsVal / 100);
    const midtoneFactor = 1 + (midtonesVal / 100);
    const highlightFactor = 1 + (highlightsVal / 100);

    for (let i = 0; i < data.length; i += 4) {
        // Skip fully transparent pixels
        if (data[i + 3] === 0) continue;

        // Process each color channel
        for (let ch = 0; ch < 3; ch++) {
            let value = data[i + ch];
            let normalized = value / 255;

            // Calculate weights for each tone range
            // Shadows: strong at 0, fade to 0 at 0.5
            let shadowWeight = Math.max(0, 1 - normalized * 2);

            // Midtones: peak at 0.5, fade to 0 at 0 and 1
            let midtoneWeight = 1 - Math.abs(2 * normalized - 1);

            // Highlights: 0 at 0.5, strong at 1
            let highlightWeight = Math.max(0, normalized * 2 - 1);

            // Apply adjustments based on weights
            let adjustment = 0;
            adjustment += (shadowFactor - 1) * shadowWeight * 128;
            adjustment += (midtoneFactor - 1) * midtoneWeight * 128;
            adjustment += (highlightFactor - 1) * highlightWeight * 128;

            // Apply adjustment and clamp
            data[i + ch] = Math.max(0, Math.min(255, value + adjustment));
        }
    }

    return imageData;
}

// Function to draw center guides
function drawGuides(ctx) {
    if (!showGuides) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)'; // Semi-transparent green
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]); // Dashed line

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, PANEL_HEIGHT / 2);
    ctx.lineTo(PANEL_WIDTH, PANEL_HEIGHT / 2);
    ctx.stroke();

    // Visual indicator for centered position
    if (yPosition === 50) {
        // Draw a small center marker
        ctx.fillStyle = 'rgba(76, 175, 80, 0.7)';
        ctx.fillRect(PANEL_WIDTH / 2 - 2, PANEL_HEIGHT / 2 - 2, 4, 4);
    }

    ctx.restore();
}

// Function to render text vertically
function renderText(ctx, text, color) {
    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

    if (!text) return;

    // Get font configuration
    const fontType = fontSelect.value;
    const fontConfig = getFontConfig(fontType);

    // Convert text to uppercase for better readability
    text = text.toUpperCase();

    // Enable or disable image smoothing based on font type
    ctx.imageSmoothingEnabled = !fontConfig.pixelated;

    // Start with a base font size
    let fontSize = fontConfig.minSize || 12;
    ctx.font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;

    // Measure text metrics
    let maxCharWidth = 0;
    for (let char of text) {
        const metrics = ctx.measureText(char);
        maxCharWidth = Math.max(maxCharWidth, metrics.width);
    }

    // Calculate required height for vertical text
    const charSpacing = fontSize * letterSpacing;
    const totalHeight = text.length * fontSize + (text.length - 1) * charSpacing;

    // Adjust font size to fit both width and height
    const widthScale = PANEL_WIDTH * ((100 - 2 * marginX) / 100) / maxCharWidth; // Use margin X
    const heightScale = PANEL_HEIGHT * ((100 - 2 * marginY) / 100) / totalHeight; // Use margin Y
    const scale = Math.min(widthScale, heightScale);

    fontSize = Math.floor(fontSize * scale);
    fontSize = Math.max(fontConfig.minSize || 6, fontSize); // Minimum font size

    // Set final font
    ctx.font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Recalculate with final font size
    const finalCharSpacing = fontSize * letterSpacing;
    const finalTotalHeight = text.length * fontSize + (text.length - 1) * finalCharSpacing;

    // Calculate starting Y position based on yPosition percentage
    // 0% = text starts at top edge, 100% = text ends at bottom edge
    // -50% and 150% allow moving off-screen
    const availableSpace = PANEL_HEIGHT - finalTotalHeight;
    const startY = (availableSpace * yPosition / 100) + fontSize / 2;

    // Apply special effects for certain fonts
    if (fontConfig.glow) {
        ctx.shadowColor = fontConfig.glowColor || color;
        ctx.shadowBlur = 2;
    } else {
        ctx.shadowBlur = 0;
    }

    // Draw each character
    if (fontConfig.blockStyle) {
        // C64-style block characters
        ctx.fillStyle = color;
        for (let i = 0; i < text.length; i++) {
            const x = PANEL_WIDTH / 2;
            const y = startY + i * (fontSize + finalCharSpacing);

            // Draw background block - ensure full character coverage
            const blockWidth = maxCharWidth * scale; // Full character width
            const blockHeight = fontSize; // Full font size height

            // Position block to fully contain the character
            // Text baseline is 'middle', so we need to account for ascenders
            const blockY = y - fontSize * 0.6;

            ctx.fillRect(x - blockWidth / 2, blockY, blockWidth, blockHeight);

            // Draw character in black
            ctx.fillStyle = '#000000';
            ctx.fillText(text[i], x, y);
            ctx.fillStyle = color;
        }
    } else {
        // Normal text rendering
        ctx.fillStyle = color;
        for (let i = 0; i < text.length; i++) {
            const x = PANEL_WIDTH / 2;
            const y = startY + i * (fontSize + finalCharSpacing);
            ctx.fillText(text[i], x, y);
        }
    }

    // Apply pixelation effect if needed
    if (fontConfig.pixelated && fontSize > 10) {
        const imageData = ctx.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
        const pixelSize = 2;

        for (let y = 0; y < PANEL_HEIGHT; y += pixelSize) {
            for (let x = 0; x < PANEL_WIDTH; x += pixelSize) {
                const i = (y * PANEL_WIDTH + x) * 4;

                // Get the color of the top-left pixel in the block
                const r = imageData.data[i];
                const g = imageData.data[i + 1];
                const b = imageData.data[i + 2];
                const a = imageData.data[i + 3];

                // Apply to all pixels in the block
                for (let py = 0; py < pixelSize && y + py < PANEL_HEIGHT; py++) {
                    for (let px = 0; px < pixelSize && x + px < PANEL_WIDTH; px++) {
                        const pi = ((y + py) * PANEL_WIDTH + (x + px)) * 4;
                        imageData.data[pi] = r;
                        imageData.data[pi + 1] = g;
                        imageData.data[pi + 2] = b;
                        imageData.data[pi + 3] = a;
                    }
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // Apply contrast adjustment if not default
    if (contrast !== 1.0) {
        const imageData = ctx.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
        const adjustedData = adjustContrast(imageData, (contrast - 1) * 255);
        ctx.putImageData(adjustedData, 0, 0);
    }

    // Apply tone adjustments if any are set
    if (shadows !== 0 || midtones !== 0 || highlights !== 0) {
        const imageData = ctx.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
        const adjustedData = adjustTones(imageData, shadows, midtones, highlights);
        ctx.putImageData(adjustedData, 0, 0);
    }
}

// Function to render image
function renderImage(ctx, img) {
    // Clear canvas with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

    if (!img) return;

    // Calculate dimensions based on fit mode
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    let dx = 0, dy = 0, dw = PANEL_WIDTH, dh = PANEL_HEIGHT;

    const imgAspect = img.width / img.height;
    const canvasAspect = PANEL_WIDTH / PANEL_HEIGHT;

    // Apply scale
    const scale = imageScale / 100;

    if (imageFitMode === 'fill') {
        // Fill mode: Scale image to fill canvas, cropping if necessary
        if (imgAspect > canvasAspect) {
            // Image is wider - crop left and right
            const scaledWidth = img.height * canvasAspect;
            sx = (img.width - scaledWidth) / 2;
            sw = scaledWidth;
        } else {
            // Image is taller - crop top and bottom
            const scaledHeight = img.width / canvasAspect;
            sy = (img.height - scaledHeight) / 2;
            sh = scaledHeight;
        }
    } else if (imageFitMode === 'fit') {
        // Fit mode: Scale image to fit within canvas, adding black bars if necessary
        if (imgAspect > canvasAspect) {
            // Image is wider - add black bars top and bottom
            dh = PANEL_WIDTH / imgAspect;
            dy = (PANEL_HEIGHT - dh) / 2;
        } else {
            // Image is taller - add black bars left and right
            dw = PANEL_HEIGHT * imgAspect;
            dx = (PANEL_WIDTH - dw) / 2;
        }
    }
    // Stretch mode uses default values (full canvas)

    // Apply scale to destination dimensions
    const scaledDw = dw * scale;
    const scaledDh = dh * scale;

    // Apply position offsets
    const offsetX = (imageXPosition - 50) / 100 * PANEL_WIDTH;
    const offsetY = (imageYPosition - 50) / 100 * PANEL_HEIGHT;

    // Center the scaled image and apply offsets
    dx = dx + (dw - scaledDw) / 2 + offsetX;
    dy = dy + (dh - scaledDh) / 2 + offsetY;

    // Draw the image
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, scaledDw, scaledDh);

    // Apply contrast adjustment if not default
    if (contrast !== 1.0) {
        const imageData = ctx.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
        const adjustedData = adjustContrast(imageData, (contrast - 1) * 255);
        ctx.putImageData(adjustedData, 0, 0);
    }

    // Apply tone adjustments if any are set
    if (shadows !== 0 || midtones !== 0 || highlights !== 0) {
        const imageData = ctx.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
        const adjustedData = adjustTones(imageData, shadows, midtones, highlights);
        ctx.putImageData(adjustedData, 0, 0);
    }
}

// Function to process frame and get RGB data
function processFrame(sourceCtx) {
    const imageData = sourceCtx.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
    const data = imageData.data;
    const rgbData = new Uint8Array(PANEL_WIDTH * PANEL_HEIGHT * 3);
    let rgbIndex = 0;

    // Convert RGBA to RGB
    for (let i = 0; i < data.length; i += 4) {
        rgbData[rgbIndex++] = data[i];     // R
        rgbData[rgbIndex++] = data[i + 1]; // G
        rgbData[rgbIndex++] = data[i + 2]; // B
    }

    return rgbData;
}

// Update preview
function updatePreview() {
    if (isStreaming && !previewMode.checked) {
        requestAnimationFrame(updatePreview);
        return;
    }

    if (displayMode === 'text') {
        const text = textInput.value;
        const color = textColor.value;
        renderText(previewCtx, text, color);
    } else if (displayMode === 'image') {
        renderImage(previewCtx, uploadedImage);
    }

    drawGuides(previewCtx);

    requestAnimationFrame(updatePreview);
}

// Connection management
async function toggleConnection() {
    if (!isConnected) {
        try {
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 2000000 });

            isConnected = true;
            document.getElementById('connectButton').textContent = 'Disconnect';
            document.getElementById('status').className = 'success';
            document.getElementById('status').textContent = 'Connected to Teensy';
            document.getElementById('streamButton').disabled = false;
        } catch (error) {
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Connection failed: ' + error;
        }
    } else {
        try {
            if (isStreaming) {
                stopStreaming();
            }

            await port.close();
            port = null;

            isConnected = false;
            document.getElementById('connectButton').textContent = 'Connect to Teensy';
            document.getElementById('status').className = 'info';
            document.getElementById('status').textContent = 'Disconnected from Teensy';
            document.getElementById('streamButton').disabled = true;
            document.getElementById('stopButton').disabled = true;
        } catch (error) {
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Disconnect failed: ' + error;
        }
    }
}

// Streaming management
function toggleStreaming() {
    if (!isStreaming) {
        startStreaming();
    } else {
        stopStreaming();
    }
}

async function startStreaming() {
    if (!port || !isConnected) return;

    isStreaming = true;
    document.getElementById('streamButton').textContent = 'Pause Streaming';
    document.getElementById('stopButton').disabled = false;
    document.getElementById('status').className = 'success';
    document.getElementById('status').textContent = 'Streaming to Teensy';

    frameCount = 0;
    lastFpsTime = performance.now();

    streamInterval = setInterval(async () => {
        try {
            await sendFrame();
        } catch (error) {
            console.error('Stream error:', error);
            stopStreaming();
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Streaming error: ' + error;
        }
    }, FRAME_TIME);
}

function stopStreaming() {
    isStreaming = false;
    clearInterval(streamInterval);

    document.getElementById('streamButton').textContent = 'Start Streaming';
    document.getElementById('stopButton').disabled = true;
    document.getElementById('status').className = 'info';
    document.getElementById('status').textContent = 'Streaming stopped';
}

// Send frame to Teensy
async function sendFrame() {
    // Render content based on display mode
    if (displayMode === 'text') {
        const text = textInput.value;
        const color = textColor.value;
        renderText(processCtx, text, color);
    } else if (displayMode === 'image') {
        renderImage(processCtx, uploadedImage);
    }

    // Get RGB data
    const rgbData = processFrame(processCtx);

    // Send data in chunks
    const writer = port.writable.getWriter();
    try {
        for (let i = 0; i < rgbData.length; i += CHUNK_SIZE) {
            const chunk = rgbData.slice(i, Math.min(i + CHUNK_SIZE, rgbData.length));
            await writer.write(chunk);
        }
    } finally {
        writer.releaseLock();
    }

    // Update FPS counter
    frameCount++;
    const currentTime = performance.now();
    const elapsedTime = currentTime - lastFpsTime;

    if (elapsedTime >= 1000) {
        const fps = (frameCount * 1000) / elapsedTime;
        document.getElementById('fps').textContent = `FPS: ${fps.toFixed(1)}`;
        frameCount = 0;
        lastFpsTime = currentTime;
    }
}

// Function to download current display as .bin file
function downloadBin() {
    let filename;

    if (displayMode === 'text') {
        const text = textInput.value;
        const color = textColor.value;

        if (!text) {
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Please enter some text';
            return;
        }

        // Render text to process canvas
        renderText(processCtx, text, color);

        // Generate filename for text
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const cleanText = text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        filename = `text_${cleanText}_${PANEL_WIDTH}x${PANEL_HEIGHT}_${timestamp}.bin`;
    } else if (displayMode === 'image') {
        if (!uploadedImage) {
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Please upload an image';
            return;
        }

        // Render image to process canvas
        renderImage(processCtx, uploadedImage);

        // Generate filename for image
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        filename = `image_${imageFitMode}_${PANEL_WIDTH}x${PANEL_HEIGHT}_${timestamp}.bin`;
    }

    // Get RGB data
    const rgbData = processFrame(processCtx);

    // Create blob from RGB data
    const blob = new Blob([rgbData], { type: 'application/octet-stream' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Update status
    document.getElementById('status').className = 'success';
    document.getElementById('status').textContent = `Downloaded: ${filename}`;
}

// Handle visibility change
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isStreaming) {
        stopStreaming();
        document.getElementById('status').className = 'info';
        document.getElementById('status').textContent = 'Streaming paused (tab inactive)';
    }
});

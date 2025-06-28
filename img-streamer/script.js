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

// Get DOM elements
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d', { willReadFrequently: true });
const processCanvas = document.getElementById('processCanvas');
const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });
const textInput = document.getElementById('textInput');
const textColor = document.getElementById('textColor');
const previewMode = document.getElementById('previewMode');
const fontSelect = document.getElementById('fontSelect');
const contrastSlider = document.getElementById('contrast');

// Set up canvases
previewCanvas.width = PANEL_WIDTH;
previewCanvas.height = PANEL_HEIGHT;
processCanvas.width = PANEL_WIDTH;
processCanvas.height = PANEL_HEIGHT;

// Start preview loop
requestAnimationFrame(updatePreview);

// Event listeners
document.getElementById('connectButton').addEventListener('click', toggleConnection);
document.getElementById('streamButton').addEventListener('click', toggleStreaming);
document.getElementById('stopButton').addEventListener('click', stopStreaming);
document.getElementById('downloadBinButton').addEventListener('click', downloadBin);
textInput.addEventListener('input', () => requestAnimationFrame(updatePreview));
textColor.addEventListener('input', () => requestAnimationFrame(updatePreview));
fontSelect.addEventListener('change', () => requestAnimationFrame(updatePreview));
contrastSlider.addEventListener('input', (e) => {
    contrast = e.target.value / 100;
    document.getElementById('contrastValue').textContent = contrast.toFixed(1);
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
            letterSpacing: 0.4,
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
    const charSpacing = fontSize * fontConfig.letterSpacing;
    const totalHeight = text.length * fontSize + (text.length - 1) * charSpacing;

    // Adjust font size to fit both width and height
    const widthScale = PANEL_WIDTH * 0.8 / maxCharWidth; // 80% of panel width
    const heightScale = PANEL_HEIGHT * 0.9 / totalHeight; // 90% of panel height
    const scale = Math.min(widthScale, heightScale);

    fontSize = Math.floor(fontSize * scale);
    fontSize = Math.max(fontConfig.minSize || 6, fontSize); // Minimum font size

    // Set final font
    ctx.font = `${fontConfig.weight} ${fontSize}px ${fontConfig.family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Recalculate with final font size
    const finalCharSpacing = fontSize * fontConfig.letterSpacing;
    const finalTotalHeight = text.length * fontSize + (text.length - 1) * finalCharSpacing;

    // Calculate starting Y position to center vertically
    const startY = (PANEL_HEIGHT - finalTotalHeight) / 2 + fontSize / 2;

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

            // Draw background block
            const blockWidth = maxCharWidth * scale * 0.9;
            const blockHeight = fontSize * 0.8;
            ctx.fillRect(x - blockWidth / 2, y - blockHeight / 2, blockWidth, blockHeight);

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

    const text = textInput.value;
    const color = textColor.value;

    renderText(previewCtx, text, color);

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
    const text = textInput.value;
    const color = textColor.value;

    // Render text to process canvas
    renderText(processCtx, text, color);

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
    const text = textInput.value;
    const color = textColor.value;

    if (!text) {
        document.getElementById('status').className = 'error';
        document.getElementById('status').textContent = 'Please enter some text';
        return;
    }

    // Render text to process canvas
    renderText(processCtx, text, color);

    // Get RGB data
    const rgbData = processFrame(processCtx);

    // Create blob from RGB data
    const blob = new Blob([rgbData], { type: 'application/octet-stream' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    // Generate filename with text and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const cleanText = text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `text_${cleanText}_${PANEL_WIDTH}x${PANEL_HEIGHT}_${timestamp}.bin`;

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

const PANEL_WIDTH = 40;
const PANEL_HEIGHT = 96;
const FRAME_SIZE = PANEL_WIDTH * PANEL_HEIGHT * 3;  // RGB
const CHUNK_SIZE = 1024;
const TARGET_FPS = 30;
const FRAME_TIME = 1000 / TARGET_FPS;
const PREVIEW_WIDTH = PANEL_WIDTH;
const PREVIEW_HEIGHT = PANEL_HEIGHT;

let port;
let isStreaming = false;
let frameCount = 0;
let lastFpsTime = 0;
let streamInterval;
let contrast = 1.0;
let brightness = 0;
let shouldLoop = true;
let videoLoop;
let originalFileName = '';
let shadows = 0;
let midtones = 0;
let highlights = 0;
let redChannel = 1.0;
let greenChannel = 1.0;
let blueChannel = 1.0;
let hueShift = 0; // -180 to 180 degrees
let isConnected = false;
let trimStart = 0;
let trimEnd = 0;
let xOffset = 0;  // -100 to 100 percentage
let yOffset = 0;  // -100 to 100 percentage
let colorizeColor = '#4a90e2';
let colorizeAmount = 0;
let colorLevels = 256;  // Number of color levels per channel
let oneBitMode = false;
let primaryColor = '#ffffff';
let secondaryColor = '#000000';
let oneBitThreshold = 128;
let gaussianMid = 0.5;
let gaussianSpread = 0.25;
let gaussianStrength = 0.5;
let gaussianEnabled = false;
let invertEnabled = false;
let colorSwapEnabled = false;
let colorSwapSource = '#ff0000';
let colorSwapTarget = '#000000';
let colorSwapThreshold = 30;
let maskEnabled = false;
let maskX = 0;
let maskY = 0;
let maskWidth = 25;
let maskHeight = 25;
let pingPongMode = false;
let isPlayingBackward = false;
let pingPongPlaybackRate = 1;
let playbackSpeed = 1.0;

// Performance optimization variables
let lastUpdateTime = 0;
let animationFrameId = null;
let isProcessing = false;
const UPDATE_THROTTLE = 16; // ~60 FPS max

// Optimize canvas context creation
const video = document.getElementById('preview');
const canvas = document.getElementById('processCanvas');
const ctx = canvas.getContext('2d', {
    willReadFrequently: true,
    alpha: false,
    desynchronized: true
});
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d', {
    willReadFrequently: true,
    alpha: false,
    desynchronized: true
});

// Set up canvases with correct dimensions
canvas.width = PANEL_WIDTH;
canvas.height = PANEL_HEIGHT;
previewCanvas.width = PREVIEW_WIDTH;
previewCanvas.height = PREVIEW_HEIGHT;

// Optimized preview update function with throttling
function updatePreview() {
    if (isProcessing) {
        animationFrameId = requestAnimationFrame(updatePreview);
        return;
    }

    const now = performance.now();
    if (now - lastUpdateTime < UPDATE_THROTTLE) {
        animationFrameId = requestAnimationFrame(updatePreview);
        return;
    }

    if (video.readyState < 2) {
        animationFrameId = requestAnimationFrame(updatePreview);
        return;
    }

    isProcessing = true;
    lastUpdateTime = now;

    try {
        const crop = calculateCrop(video.videoWidth, video.videoHeight);

        // Clear the canvas before drawing to prevent trails
        previewCtx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

        // Draw at panel resolution with crop
        previewCtx.drawImage(video,
            crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
            0, 0, PANEL_WIDTH, PANEL_HEIGHT
        );

        // Process the frame
        processFrame(previewCanvas, previewCtx);

        // Handle ping pong for preview mode (when not streaming)
        if (pingPongMode && shouldLoop && !isStreaming && isPlayingBackward) {
            // Continue backward playback in preview mode
            playBackward();
        }
    } catch (error) {
        console.warn('Preview update error:', error);
    } finally {
        isProcessing = false;
    }

    if (!isStreaming) {
        animationFrameId = requestAnimationFrame(updatePreview);
    }
}

// Throttled updateControls function
let controlsUpdateTimeout = null;
function updateControls() {
    if (controlsUpdateTimeout) {
        clearTimeout(controlsUpdateTimeout);
    }

    controlsUpdateTimeout = setTimeout(() => {
        if (!isStreaming) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            animationFrameId = requestAnimationFrame(updatePreview);
        }
    }, 8); // Small delay to batch rapid changes
}

// Start the preview loop immediately
animationFrameId = requestAnimationFrame(updatePreview);

// Add this to make sure preview updates when video loads
video.addEventListener('loadedmetadata', () => {
    if (!isStreaming) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = requestAnimationFrame(updatePreview);
    }
});

// Optimize video event listeners
video.addEventListener('play', () => {
    if (!isStreaming) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = requestAnimationFrame(updatePreview);
    }
});

video.addEventListener('pause', () => {
    // Update one last time when paused
    if (!isStreaming) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = requestAnimationFrame(updatePreview);
    }
});

// Define default values for all sliders
const DEFAULT_VALUES = {
    'contrast': 100,        // 1.0
    'brightness': 0,
    'shadows': 0,
    'midtones': 0,
    'highlights': 0,
    'red': 100,            // 100%
    'green': 100,          // 100%
    'blue': 100,           // 100%
    'hueShift': 0,         // 0 degrees
    'xOffset': 0,
    'yOffset': 0,
    'colorizeAmount': 0,
    'colorLevels': 256,
    'oneBitThreshold': 128,
    'gaussianMid': 50,     // 0.5
    'gaussianSpread': 25,  // 0.25
    'gaussianStrength': 50, // 0.5
    'maskX': 0,
    'maskY': 0,
    'maskWidth': 25,
    'maskHeight': 25,
    'playbackSpeed': 100   // 1.0x
};

// Add double-click handlers to all sliders
Object.keys(DEFAULT_VALUES).forEach(id => {
    const slider = document.getElementById(id);
    if (slider) {
        slider.addEventListener('dblclick', () => {
            slider.value = DEFAULT_VALUES[id];

            // Update the corresponding value display and variable
            switch (id) {
                case 'contrast':
                    contrast = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('contrast', 'contrastInput', DEFAULT_VALUES[id]);
                    break;
                case 'brightness':
                    brightness = DEFAULT_VALUES[id];
                    syncSliderInput('brightness', 'brightnessInput', DEFAULT_VALUES[id]);
                    break;
                case 'shadows':
                    shadows = DEFAULT_VALUES[id];
                    syncSliderInput('shadows', 'shadowsInput', DEFAULT_VALUES[id]);
                    break;
                case 'midtones':
                    midtones = DEFAULT_VALUES[id];
                    syncSliderInput('midtones', 'midtonesInput', DEFAULT_VALUES[id]);
                    break;
                case 'highlights':
                    highlights = DEFAULT_VALUES[id];
                    syncSliderInput('highlights', 'highlightsInput', DEFAULT_VALUES[id]);
                    break;
                case 'red':
                    redChannel = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('red', 'redInput', DEFAULT_VALUES[id]);
                    break;
                case 'green':
                    greenChannel = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('green', 'greenInput', DEFAULT_VALUES[id]);
                    break;
                case 'blue':
                    blueChannel = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('blue', 'blueInput', DEFAULT_VALUES[id]);
                    break;
                case 'hueShift':
                    hueShift = DEFAULT_VALUES[id];
                    syncSliderInput('hueShift', 'hueShiftInput', DEFAULT_VALUES[id]);
                    break;
                case 'xOffset':
                    xOffset = DEFAULT_VALUES[id];
                    syncSliderInput('xOffset', 'xOffsetInput', DEFAULT_VALUES[id]);
                    break;
                case 'yOffset':
                    yOffset = DEFAULT_VALUES[id];
                    syncSliderInput('yOffset', 'yOffsetInput', DEFAULT_VALUES[id]);
                    break;
                case 'colorizeAmount':
                    colorizeAmount = DEFAULT_VALUES[id];
                    syncSliderInput('colorizeAmount', 'colorizeAmountInput', DEFAULT_VALUES[id]);
                    break;
                case 'colorLevels':
                    colorLevels = DEFAULT_VALUES[id];
                    syncSliderInput('colorLevels', 'colorLevelsInput', DEFAULT_VALUES[id]);
                    break;
                case 'oneBitThreshold':
                    oneBitThreshold = DEFAULT_VALUES[id];
                    syncSliderInput('oneBitThreshold', 'oneBitThresholdInput', DEFAULT_VALUES[id]);
                    break;
                case 'gaussianMid':
                    gaussianMid = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('gaussianMid', 'gaussianMidInput', DEFAULT_VALUES[id]);
                    break;
                case 'gaussianSpread':
                    gaussianSpread = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('gaussianSpread', 'gaussianSpreadInput', DEFAULT_VALUES[id]);
                    break;
                case 'gaussianStrength':
                    gaussianStrength = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('gaussianStrength', 'gaussianStrengthInput', DEFAULT_VALUES[id]);
                    break;
                case 'maskX':
                    maskX = DEFAULT_VALUES[id];
                    syncSliderInput('maskX', 'maskXInput', DEFAULT_VALUES[id]);
                    break;
                case 'maskY':
                    maskY = DEFAULT_VALUES[id];
                    syncSliderInput('maskY', 'maskYInput', DEFAULT_VALUES[id]);
                    break;
                case 'maskWidth':
                    maskWidth = DEFAULT_VALUES[id];
                    syncSliderInput('maskWidth', 'maskWidthInput', DEFAULT_VALUES[id]);
                    break;
                case 'maskHeight':
                    maskHeight = DEFAULT_VALUES[id];
                    syncSliderInput('maskHeight', 'maskHeightInput', DEFAULT_VALUES[id]);
                    break;
                case 'playbackSpeed':
                    playbackSpeed = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('playbackSpeed', 'playbackSpeedInput', DEFAULT_VALUES[id]);
                    video.playbackRate = playbackSpeed;
                    break;
            }
            updateControls();
        });
    }
});

async function toggleConnection() {
    if (!isConnected) {
        try {
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 2000000 });

            isConnected = true;
            document.getElementById('connectButton').textContent = 'Disconnect';
            document.getElementById('connectButton').classList.add('connected');
            document.getElementById('status').className = 'success';
            document.getElementById('status').textContent = 'Connected to Teensy';
            document.getElementById('streamButton').disabled = !video.src;  // Only enable if we have a video
        } catch (error) {
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Connection failed: ' + error;
        }
    } else {
        try {
            // Stop streaming if active
            if (isStreaming) {
                isStreaming = false;
                clearTimeout(videoLoop);
                video.pause();
            }

            // Close the port
            await port.close();
            port = null;

            isConnected = false;
            document.getElementById('connectButton').textContent = 'Connect to Teensy';
            document.getElementById('connectButton').classList.remove('connected');
            document.getElementById('status').className = 'info';
            document.getElementById('status').textContent = 'Disconnected from Teensy';
            document.getElementById('streamButton').disabled = true;  // Always disable when disconnected
        } catch (error) {
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Disconnect failed: ' + error;
        }
    }
}

// Add this helper function at the top with other utility functions
function hexToRgb(hex) {
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    return [r, g, b];
}

// Add this helper function for color blending
function blendColorize(original, targetRGB, intensity, channel) {
    // Get luminance of original pixel
    const luminance = original / 255;

    // Get target color for this channel
    const targetValue = channel === redChannel ? targetRGB[0] :
        channel === greenChannel ? targetRGB[1] : targetRGB[2];

    // Overlay blend mode formula
    let result;
    if (luminance < 0.5) {
        result = (2 * original * targetValue) / 255;
    } else {
        result = 255 - (2 * (255 - original) * (255 - targetValue)) / 255;
    }

    // Blend between original and overlaid color
    return original * (1 - intensity) + result * intensity;
}

// RGB to HSL conversion
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return [h * 360, s, l];
}

// HSL to RGB conversion
function hslToRgb(h, s, l) {
    h /= 360;

    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Optimize processFrame function with early returns
function processFrame(sourceCanvas, sourceCtx) {
    const imageData = sourceCtx.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
    const data = imageData.data;
    const rgbData = new Uint8Array(PANEL_WIDTH * PANEL_HEIGHT * 3);
    let rgbIndex = 0;

    // Pre-calculate values that don't change per pixel
    const hasHueShift = hueShift !== 0;
    const hasColorize = colorizeAmount > 0;
    const hasColorReduction = colorLevels < 256;
    const hasColorSwap = colorSwapEnabled;
    const hasMask = maskEnabled;
    const targetRGB = hasColorize ? hexToRgb(colorizeColor) : null;
    const colorizeIntensity = hasColorize ? colorizeAmount / 100 : 0;
    const sourceRGB = hasColorSwap ? hexToRgb(colorSwapSource) : null;
    const targetSwapRGB = hasColorSwap ? hexToRgb(colorSwapTarget) : null;
    const primaryRGB = oneBitMode ? hexToRgb(primaryColor) : null;
    const secondaryRGB = oneBitMode ? hexToRgb(secondaryColor) : null;

    // Pre-calculate mask boundaries
    let maskLeft, maskTop, maskRight, maskBottom;
    if (hasMask) {
        maskLeft = Math.floor((maskX / 100) * PANEL_WIDTH);
        maskTop = Math.floor((maskY / 100) * PANEL_HEIGHT);
        maskRight = Math.floor(maskLeft + (maskWidth / 100) * PANEL_WIDTH);
        maskBottom = Math.floor(maskTop + (maskHeight / 100) * PANEL_HEIGHT);
    }

    for (let i = 0; i < data.length; i += 4) {
        // Get RGB values with optimized adjustPixel calls
        let rr = adjustPixel(data[i], contrast, brightness, redChannel);
        let gg = adjustPixel(data[i + 1], contrast, brightness, greenChannel);
        let bb = adjustPixel(data[i + 2], contrast, brightness, blueChannel);

        // Apply hue shift if enabled (expensive operation)
        if (hasHueShift) {
            const [h, s, l] = rgbToHsl(rr, gg, bb);
            let newHue = h + hueShift;
            if (newHue < 0) newHue += 360;
            if (newHue >= 360) newHue -= 360;
            const [newR, newG, newB] = hslToRgb(newHue, s, l);
            rr = newR;
            gg = newG;
            bb = newB;
        }

        // Apply colorize effect after other adjustments
        if (hasColorize) {
            rr = blendColorize(rr, targetRGB, colorizeIntensity, redChannel);
            gg = blendColorize(gg, targetRGB, colorizeIntensity, greenChannel);
            bb = blendColorize(bb, targetRGB, colorizeIntensity, blueChannel);
        }

        // Apply color reduction
        if (hasColorReduction) {
            rr = reduceColors(rr);
            gg = reduceColors(gg);
            bb = reduceColors(bb);
        }

        // Apply 1-bit mode
        if (oneBitMode) {
            const luminance = (rr * 0.299 + gg * 0.587 + bb * 0.114);
            if (luminance >= oneBitThreshold) {
                rr = primaryRGB[0];
                gg = primaryRGB[1];
                bb = primaryRGB[2];
            } else {
                rr = secondaryRGB[0];
                gg = secondaryRGB[1];
                bb = secondaryRGB[2];
            }
        }

        // Apply invert effect
        if (invertEnabled) {
            rr = 255 - rr;
            gg = 255 - gg;
            bb = 255 - bb;
        }

        // Apply color swap effect
        if (hasColorSwap) {
            const colorDistance = Math.sqrt(
                Math.pow(rr - sourceRGB[0], 2) +
                Math.pow(gg - sourceRGB[1], 2) +
                Math.pow(bb - sourceRGB[2], 2)
            );

            if (colorDistance <= colorSwapThreshold) {
                rr = targetSwapRGB[0];
                gg = targetSwapRGB[1];
                bb = targetSwapRGB[2];
            }
        }

        // Apply black mask
        if (hasMask) {
            const pixelIndex = (i / 4);
            const x = pixelIndex % PANEL_WIDTH;
            const y = Math.floor(pixelIndex / PANEL_WIDTH);

            if (x >= maskLeft && x < maskRight && y >= maskTop && y < maskBottom) {
                rr = 0;
                gg = 0;
                bb = 0;
            }
        }

        // Store adjusted values with clamping
        data[i] = Math.max(0, Math.min(255, rr));
        data[i + 1] = Math.max(0, Math.min(255, gg));
        data[i + 2] = Math.max(0, Math.min(255, bb));

        // Store RGB values for binary output
        rgbData[rgbIndex++] = data[i];
        rgbData[rgbIndex++] = data[i + 1];
        rgbData[rgbIndex++] = data[i + 2];
    }

    sourceCtx.putImageData(imageData, 0, 0);
    return rgbData;
}

// Optimize adjustPixel function
function adjustPixel(value, contrast, brightness, channel) {
    // Apply contrast
    let newValue = ((value / 255 - 0.5) * contrast + 0.5) * 255;

    // Apply brightness
    newValue += brightness;

    // Apply Gaussian curve adjustment only if enabled
    if (gaussianEnabled) {
        const gaussianValue = newValue / 255;
        const gaussianAdjustment = Math.exp(
            -Math.pow(gaussianValue - gaussianMid, 2) / (2 * Math.pow(gaussianSpread, 2))
        );
        newValue = newValue * (1 + gaussianStrength * gaussianAdjustment);
    }

    // Apply tone adjustments
    const normalizedValue = newValue / 255;

    // Shadows affect dark areas (0-0.33)
    if (normalizedValue <= 0.33) {
        newValue += shadows * (1 - normalizedValue * 3);
    }

    // Midtones affect middle areas (0.33-0.66)
    if (normalizedValue > 0.33 && normalizedValue <= 0.66) {
        const midtoneFactor = (normalizedValue - 0.33) * 3;
        newValue += midtones * (1 - Math.abs(midtoneFactor - 0.5) * 2);
    }

    // Highlights affect bright areas (0.66-1.0)
    if (normalizedValue > 0.66) {
        newValue += highlights * ((normalizedValue - 0.66) * 3);
    }

    // Apply channel multiplier
    newValue *= channel;

    return newValue;
}

// Event Listeners
document.getElementById('connectButton').onclick = toggleConnection;

document.getElementById('fileInput').onchange = (event) => {
    const file = event.target.files[0];
    if (file) {
        originalFileName = file.name;  // Store the original filename
        video.src = URL.createObjectURL(file);
        document.getElementById('streamButton').disabled = !isConnected;  // Only enable if connected
        document.getElementById('downloadBinButton').disabled = false;
        isPlayingBackward = false;  // Reset ping pong state
    }
};

// Update the convertToBin function to use the same processor
async function convertToBin() {
    if (!video.src) {
        document.getElementById('status').className = 'error';
        document.getElementById('status').textContent = 'Please select a video file';
        return;
    }

    const progressBar = document.getElementById('conversionProgress');
    const progressFill = progressBar.querySelector('.progress-fill');
    const progressText = progressBar.querySelector('.progress-text');

    progressBar.style.display = 'block';
    document.getElementById('downloadBinButton').disabled = true;
    document.getElementById('status').className = 'info';
    const speedInfo = playbackSpeed !== 1.0 ? ` at ${playbackSpeed.toFixed(1)}x speed` : '';
    document.getElementById('status').textContent = `Converting video to binary${speedInfo}...`;

    // Calculate frames from trim points
    const startFrame = Math.floor(trimStart * TARGET_FPS);
    const endFrame = Math.floor(trimEnd * TARGET_FPS);
    const sourceFrames = endFrame - startFrame;

    // Adjust total frames based on playback speed
    const adjustedFrames = Math.floor(sourceFrames / playbackSpeed);
    const totalFrames = pingPongMode ? adjustedFrames * 2 : adjustedFrames;
    let currentFrame = 0;

    // Create a buffer to hold trimmed frames
    const binData = new Uint8Array(totalFrames * FRAME_SIZE);
    let binOffset = 0;

    // Save current video time and playback state
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;
    if (wasPlaying) {
        video.pause();
    }

    try {
        // Process frames based on playback speed
        for (let outputFrame = 0; outputFrame < adjustedFrames; outputFrame++) {
            const sourceFrameIndex = startFrame + Math.floor(outputFrame * playbackSpeed);
            video.currentTime = sourceFrameIndex / TARGET_FPS;

            await new Promise(resolve => {
                video.onseeked = resolve;
            });

            const crop = calculateCrop(video.videoWidth, video.videoHeight);
            ctx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
            ctx.drawImage(video,
                crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                0, 0, PANEL_WIDTH, PANEL_HEIGHT
            );

            const rgbData = processFrame(canvas, ctx);
            binData.set(rgbData, binOffset);
            binOffset += rgbData.length;

            currentFrame++;
            const progress = Math.floor((currentFrame / totalFrames) * 100);
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${progress}%`;
        }

        // If ping pong mode is enabled, add frames in reverse order
        if (pingPongMode) {
            document.getElementById('status').textContent = `Converting video to binary${speedInfo} (backward pass)...`;

            for (let outputFrame = adjustedFrames - 2; outputFrame >= 0; outputFrame--) {
                const sourceFrameIndex = startFrame + Math.floor(outputFrame * playbackSpeed);
                video.currentTime = sourceFrameIndex / TARGET_FPS;

                await new Promise(resolve => {
                    video.onseeked = resolve;
                });

                const crop = calculateCrop(video.videoWidth, video.videoHeight);
                ctx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
                ctx.drawImage(video,
                    crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                    0, 0, PANEL_WIDTH, PANEL_HEIGHT
                );

                const rgbData = processFrame(canvas, ctx);
                binData.set(rgbData, binOffset);
                binOffset += rgbData.length;

                currentFrame++;
                const progress = Math.floor((currentFrame / totalFrames) * 100);
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${progress}%`;
            }
        }

        // Create and download the binary file
        const blob = new Blob([binData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const nameWithoutExt = originalFileName.split('.')[0];
        const trimInfo = `_${trimStart.toFixed(1)}s-${trimEnd.toFixed(1)}s`;
        const pingPongSuffix = pingPongMode ? '_pingpong' : '';
        const speedSuffix = playbackSpeed !== 1.0 ? `_${playbackSpeed.toFixed(1)}x` : '';
        a.download = `${nameWithoutExt}${trimInfo}${speedSuffix}${pingPongSuffix}.bin`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        document.getElementById('status').className = 'success';
        document.getElementById('status').textContent = 'Binary file downloaded!';
    } catch (error) {
        document.getElementById('status').className = 'error';
        document.getElementById('status').textContent = 'Error converting video: ' + error.message;
    } finally {
        // Restore video state
        video.currentTime = originalTime;
        video.playbackRate = playbackSpeed;
        if (wasPlaying && isStreaming) {
            video.play();
        }
        document.getElementById('downloadBinButton').disabled = false;
        progressBar.style.display = 'none';
    }
}

// Add the streamVideo function
async function streamVideo() {
    if (!port || !video.src) return;

    const writer = port.writable.getWriter();
    let lastFrameTime = performance.now();
    frameCount = 0;
    lastFpsTime = performance.now();

    try {
        while (isStreaming) {
            const currentTime = performance.now();
            const elapsed = currentTime - lastFrameTime;

            if (elapsed >= FRAME_TIME) {
                // Process frame using our shared function
                const crop = calculateCrop(video.videoWidth, video.videoHeight);

                // Clear the canvas before drawing to prevent trails
                ctx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

                // Draw with crop
                ctx.drawImage(video,
                    crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                    0, 0, PANEL_WIDTH, PANEL_HEIGHT
                );

                // Process the frame using shared processor
                const rgbData = processFrame(canvas, ctx);

                // Send frame in chunks
                for (let i = 0; i < rgbData.length; i += CHUNK_SIZE) {
                    const chunk = rgbData.slice(i, i + CHUNK_SIZE);
                    await writer.write(chunk);
                }

                frameCount++;
                if (currentTime - lastFpsTime >= 1000) {
                    const fps = frameCount;
                    document.getElementById('fps').textContent = `FPS: ${fps}`;
                    frameCount = 0;
                    lastFpsTime = currentTime;
                }

                lastFrameTime = currentTime;

                // Check if we need to loop or handle ping pong
                if (pingPongMode && shouldLoop) {
                    // In ping pong mode, the timeupdate event handler will manage the playback
                    // Just ensure we don't exit the streaming loop
                } else if (video.ended || video.currentTime >= trimEnd) {
                    if (shouldLoop) {
                        video.currentTime = trimStart;
                        video.play();
                    } else {
                        isStreaming = false;
                        break;
                    }
                }
            }

            // Wait for next frame
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    } catch (error) {
        console.error('Stream error:', error);
        document.getElementById('status').className = 'error';
        document.getElementById('status').textContent = 'Streaming error: ' + error.message;
    } finally {
        writer.releaseLock();
        if (!shouldLoop || !isStreaming) {
            video.pause();
            document.getElementById('streamButton').textContent = 'Start Streaming';
            document.getElementById('streamButton').classList.remove('streaming');
            document.getElementById('streamButton').disabled = false;
            document.getElementById('status').className = 'info';
            document.getElementById('status').textContent = 'Stream ended';
        }
    }
}

// Add the stream button toggle handler
document.getElementById('streamButton').onclick = () => {
    if (!port || !video.src) return;

    if (!isStreaming) {
        // Start streaming
        isStreaming = true;
        isPlayingBackward = false; // Reset ping pong state
        video.currentTime = trimStart;
        video.playbackRate = playbackSpeed; // Ensure playback speed is set
        video.play();

        document.getElementById('streamButton').textContent = 'Stop Streaming';
        document.getElementById('streamButton').classList.add('streaming');
        document.getElementById('status').className = 'info';
        document.getElementById('status').textContent = 'Streaming video...';
        streamVideo();
    } else {
        // Stop streaming
        isStreaming = false;
        video.pause();
        document.getElementById('streamButton').textContent = 'Start Streaming';
        document.getElementById('streamButton').classList.remove('streaming');
        document.getElementById('status').className = 'info';
        document.getElementById('status').textContent = 'Stream stopped';
    }
};

// Set up synchronized slider-input pairs
addSliderInputSync('contrast', 'contrastInput',
    (value) => { contrast = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

addSliderInputSync('brightness', 'brightnessInput',
    (value) => { brightness = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

addSliderInputSync('shadows', 'shadowsInput',
    (value) => { shadows = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

addSliderInputSync('midtones', 'midtonesInput',
    (value) => { midtones = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

addSliderInputSync('highlights', 'highlightsInput',
    (value) => { highlights = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

document.getElementById('loopVideo').onchange = (event) => {
    shouldLoop = event.target.checked;
    video.loop = shouldLoop && !pingPongMode;
    updateControls();
};

document.getElementById('pingPongMode').onchange = (event) => {
    pingPongMode = event.target.checked;
    video.loop = shouldLoop && !pingPongMode;
    updateControls();
};

document.getElementById('downloadBinButton').onclick = convertToBin;

// Check WebSerial support
if (!navigator.serial) {
    document.getElementById('status').className = 'error';
    document.getElementById('status').textContent =
        'WebSerial is not supported in this browser. Please use Chrome or Edge.';
    document.getElementById('connectButton').disabled = true;
}

// Add video ended event handler
video.addEventListener('ended', () => {
    if (pingPongMode && shouldLoop) {
        // In ping pong mode, start backward playback when video ends
        isPlayingBackward = true;
        video.pause();
        playBackward();
    } else if (!shouldLoop) {
        isStreaming = false;
        clearTimeout(videoLoop);
        document.getElementById('streamButton').textContent = 'Start Streaming';
        document.getElementById('streamButton').classList.remove('streaming');
        document.getElementById('streamButton').disabled = false;
        document.getElementById('status').className = 'info';
        document.getElementById('status').textContent = 'Playback finished';
    }
});

// Ensure playback rate is applied when video is loaded
video.addEventListener('loadeddata', () => {
    video.playbackRate = playbackSpeed;
});

// Set up RGB channel synchronized sliders
addSliderInputSync('red', 'redInput',
    (value) => { redChannel = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

addSliderInputSync('green', 'greenInput',
    (value) => { greenChannel = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

addSliderInputSync('blue', 'blueInput',
    (value) => { blueChannel = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

addSliderInputSync('hueShift', 'hueShiftInput',
    (value) => { hueShift = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

// Add this function to update trim controls
function updateTrimControls() {
    const duration = video.duration || 0;
    const startSlider = document.getElementById('trimStart');
    const endSlider = document.getElementById('trimEnd');
    const startNum = document.getElementById('trimStartNum');
    const endNum = document.getElementById('trimEndNum');

    // Update slider ranges
    startSlider.max = duration;
    endSlider.max = duration;
    startNum.max = duration;
    endNum.max = duration;

    // Auto-update trim values to cover the whole new video
    trimStart = 0;
    trimEnd = duration;

    // Update UI elements
    startSlider.value = 0;
    endSlider.value = duration;
    startNum.value = '0.0';
    endNum.value = duration.toFixed(1);
}

// Add these event listeners
video.addEventListener('loadedmetadata', updateTrimControls);

document.getElementById('trimStart').oninput = (event) => {
    trimStart = parseFloat(event.target.value);
    document.getElementById('trimStartNum').value = trimStart.toFixed(1);
    if (trimStart >= trimEnd) {
        trimStart = trimEnd - 0.1;
        event.target.value = trimStart;
        document.getElementById('trimStartNum').value = trimStart.toFixed(1);
    }
    if (!isStreaming && video.currentTime < trimStart) {
        video.currentTime = trimStart;
    }
};

document.getElementById('trimEnd').oninput = (event) => {
    trimEnd = parseFloat(event.target.value);
    document.getElementById('trimEndNum').value = trimEnd.toFixed(1);
    if (trimEnd <= trimStart) {
        trimEnd = trimStart + 0.1;
        event.target.value = trimEnd;
        document.getElementById('trimEndNum').value = trimEnd.toFixed(1);
    }
};

document.getElementById('trimStartNum').onchange = (event) => {
    trimStart = Math.max(0, Math.min(parseFloat(event.target.value), trimEnd - 0.1));
    event.target.value = trimStart.toFixed(1);
    document.getElementById('trimStart').value = trimStart;
    if (!isStreaming && video.currentTime < trimStart) {
        video.currentTime = trimStart;
    }
};

document.getElementById('trimEndNum').onchange = (event) => {
    trimEnd = Math.min(video.duration, Math.max(trimStart + 0.1, parseFloat(event.target.value)));
    event.target.value = trimEnd.toFixed(1);
    document.getElementById('trimEnd').value = trimEnd;
};

// Modify the video ended event handler
video.addEventListener('timeupdate', () => {
    if (pingPongMode && shouldLoop) {
        // Ping pong mode logic
        if (!isPlayingBackward && video.currentTime >= trimEnd) {
            // Reached the end, start playing backward
            isPlayingBackward = true;
            video.pause();
            // Start backward playback
            playBackward();
        } else if (isPlayingBackward && video.currentTime <= trimStart) {
            // Reached the start, start playing forward
            isPlayingBackward = false;
            video.currentTime = trimStart;
            video.playbackRate = playbackSpeed; // Ensure playback speed is set
            video.play();
        }
    } else {
        // Normal mode
        if (video.currentTime >= trimEnd) {
            if (shouldLoop) {
                video.currentTime = trimStart;
            } else {
                video.pause();
                if (isStreaming) {
                    isStreaming = false;
                    clearTimeout(videoLoop);
                    document.getElementById('streamButton').textContent = 'Start Streaming';
                    document.getElementById('streamButton').classList.remove('streaming');
                    document.getElementById('streamButton').disabled = false;
                    document.getElementById('status').className = 'info';
                    document.getElementById('status').textContent = 'Playback finished';
                }
            }
        }
    }
});

// Function to handle backward playback
function playBackward() {
    if (!isPlayingBackward) {
        return;
    }

    // Check if we've reached the start
    if (video.currentTime <= trimStart) {
        isPlayingBackward = false;
        video.currentTime = trimStart;
        video.play();
        return;
    }

    // Move video backward by one frame, adjusted for playback speed
    const frameTime = (1 / TARGET_FPS) * playbackSpeed;
    video.currentTime = Math.max(trimStart, video.currentTime - frameTime);

    // Continue backward playback if we should keep playing
    // Adjust timeout for playback speed
    if (shouldLoop && pingPongMode) {
        setTimeout(() => playBackward(), FRAME_TIME / playbackSpeed);
    }
}

// Add with other event listeners
document.getElementById('muteVideo').onchange = (event) => {
    video.muted = !event.target.checked;
};

addSliderInputSync('playbackSpeed', 'playbackSpeedInput',
    (value) => {
        playbackSpeed = value / 100;
        video.playbackRate = playbackSpeed;
        pingPongPlaybackRate = playbackSpeed;
    },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

// Set up offset synchronized sliders
addSliderInputSync('xOffset', 'xOffsetInput',
    (value) => { xOffset = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

addSliderInputSync('yOffset', 'yOffsetInput',
    (value) => { yOffset = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

// Reset function to restore default values
function resetControls() {
    // Reset all values to defaults
    contrast = 1.0;
    brightness = 0;
    shadows = 0;
    midtones = 0;
    highlights = 0;
    redChannel = 1.0;
    greenChannel = 1.0;
    blueChannel = 1.0;
    hueShift = 0;
    xOffset = 0;
    yOffset = 0;
    colorizeAmount = 0;
    colorLevels = 256;
    oneBitMode = false;
    document.getElementById('oneBitMode').checked = false;
    document.getElementById('primaryColor').value = '#ffffff';
    document.getElementById('secondaryColor').value = '#000000';
    syncSliderInput('oneBitThreshold', 'oneBitThresholdInput', 128);
    primaryColor = '#ffffff';
    secondaryColor = '#000000';
    oneBitThreshold = 128;
    document.querySelector('.one-bit-control').classList.remove('active');
    gaussianMid = 0.5;
    gaussianSpread = 0.25;
    gaussianStrength = 0.5;
    syncSliderInput('gaussianMid', 'gaussianMidInput', 50);
    syncSliderInput('gaussianSpread', 'gaussianSpreadInput', 25);
    syncSliderInput('gaussianStrength', 'gaussianStrengthInput', 50);
    gaussianEnabled = false;
    document.getElementById('gaussianEnabled').checked = false;
    document.querySelector('.gaussian-sliders').classList.remove('active');
    invertEnabled = false;
    document.getElementById('invertEnabled').checked = false;
    colorSwapEnabled = false;
    document.getElementById('colorSwapEnabled').checked = false;
    document.getElementById('colorSwapSource').value = '#ff0000';
    document.getElementById('colorSwapTarget').value = '#000000';
    syncSliderInput('colorSwapThreshold', 'colorSwapThresholdInput', 30);
    document.querySelector('.color-swap-control').classList.remove('active');
    colorSwapSource = '#ff0000';
    colorSwapTarget = '#000000';
    colorSwapThreshold = 30;

    // Reset mask controls
    maskEnabled = false;
    maskX = 0;
    maskY = 0;
    maskWidth = 25;
    maskHeight = 25;
    document.getElementById('maskEnabled').checked = false;
    syncSliderInput('maskX', 'maskXInput', 0);
    syncSliderInput('maskY', 'maskYInput', 0);
    syncSliderInput('maskWidth', 'maskWidthInput', 25);
    syncSliderInput('maskHeight', 'maskHeightInput', 25);
    document.querySelector('.mask-control').classList.remove('active');

    // Reset playback speed
    playbackSpeed = 1.0;
    pingPongPlaybackRate = 1.0;
    syncSliderInput('playbackSpeed', 'playbackSpeedInput', 100);
    video.playbackRate = playbackSpeed;

    // Reset all sliders and their input fields
    syncSliderInput('contrast', 'contrastInput', 100);
    syncSliderInput('brightness', 'brightnessInput', 0);
    syncSliderInput('shadows', 'shadowsInput', 0);
    syncSliderInput('midtones', 'midtonesInput', 0);
    syncSliderInput('highlights', 'highlightsInput', 0);
    syncSliderInput('red', 'redInput', 100);
    syncSliderInput('green', 'greenInput', 100);
    syncSliderInput('blue', 'blueInput', 100);
    syncSliderInput('hueShift', 'hueShiftInput', 0);
    syncSliderInput('xOffset', 'xOffsetInput', 0);
    syncSliderInput('yOffset', 'yOffsetInput', 0);
    syncSliderInput('colorizeAmount', 'colorizeAmountInput', 0);
    syncSliderInput('colorLevels', 'colorLevelsInput', 256);

    document.getElementById('colorizeColor').value = '#4a90e2';
    colorizeColor = '#4a90e2';

    // Update preview
    updateControls();
}

// Add the reset button event listener
document.getElementById('resetButton').onclick = resetControls;

// Add after the resetControls function
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomizeControls() {
    // Randomize values within reasonable ranges
    contrast = (getRandomInt(50, 150) / 100);  // 0.5 to 1.5
    brightness = getRandomInt(-50, 50);        // -50 to 50
    shadows = getRandomInt(-50, 50);           // -50 to 50
    midtones = getRandomInt(-50, 50);          // -50 to 50
    highlights = getRandomInt(-50, 50);        // -50 to 50
    redChannel = (getRandomInt(50, 150) / 100);   // 0.5 to 1.5
    greenChannel = (getRandomInt(50, 150) / 100); // 0.5 to 1.5
    blueChannel = (getRandomInt(50, 150) / 100);  // 0.5 to 1.5
    hueShift = getRandomInt(-180, 180);           // -180 to 180 degrees
    colorizeAmount = getRandomInt(0, 100);
    colorLevels = Math.pow(2, getRandomInt(2, 8)); // 4 to 256 colors in power of 2 steps
    oneBitMode = Math.random() < 0.5;
    document.getElementById('oneBitMode').checked = oneBitMode;
    document.querySelector('.one-bit-control').classList.toggle('active', oneBitMode);

    // Random colors
    primaryColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    secondaryColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    document.getElementById('primaryColor').value = primaryColor;
    document.getElementById('secondaryColor').value = secondaryColor;

    oneBitThreshold = getRandomInt(64, 192);
    syncSliderInput('oneBitThreshold', 'oneBitThresholdInput', oneBitThreshold);

    // Update all sliders and their input fields
    syncSliderInput('contrast', 'contrastInput', contrast * 100);
    syncSliderInput('brightness', 'brightnessInput', brightness);
    syncSliderInput('shadows', 'shadowsInput', shadows);
    syncSliderInput('midtones', 'midtonesInput', midtones);
    syncSliderInput('highlights', 'highlightsInput', highlights);
    syncSliderInput('red', 'redInput', redChannel * 100);
    syncSliderInput('green', 'greenInput', greenChannel * 100);
    syncSliderInput('blue', 'blueInput', blueChannel * 100);
    syncSliderInput('hueShift', 'hueShiftInput', hueShift);
    syncSliderInput('colorizeAmount', 'colorizeAmountInput', colorizeAmount);
    syncSliderInput('colorLevels', 'colorLevelsInput', colorLevels);

    // Random color
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    document.getElementById('colorizeColor').value = randomColor;
    colorizeColor = randomColor;

    // Random Gaussian values
    gaussianMid = getRandomInt(30, 70) / 100;
    gaussianSpread = getRandomInt(10, 40) / 100;
    gaussianStrength = getRandomInt(20, 80) / 100;
    syncSliderInput('gaussianMid', 'gaussianMidInput', gaussianMid * 100);
    syncSliderInput('gaussianSpread', 'gaussianSpreadInput', gaussianSpread * 100);
    syncSliderInput('gaussianStrength', 'gaussianStrengthInput', gaussianStrength * 100);

    // Update preview
    updateControls();

    gaussianEnabled = Math.random() < 0.5;
    document.getElementById('gaussianEnabled').checked = gaussianEnabled;
    document.querySelector('.gaussian-sliders').classList.toggle('active', gaussianEnabled);
    invertEnabled = Math.random() < 0.5;
    document.getElementById('invertEnabled').checked = invertEnabled;
    colorSwapEnabled = Math.random() < 0.5;
    document.getElementById('colorSwapEnabled').checked = colorSwapEnabled;
    document.querySelector('.color-swap-control').classList.toggle('active', colorSwapEnabled);

    // Random colors for swap
    const randomSource = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const randomTarget = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    document.getElementById('colorSwapSource').value = randomSource;
    document.getElementById('colorSwapTarget').value = randomTarget;
    colorSwapSource = randomSource;
    colorSwapTarget = randomTarget;

    colorSwapThreshold = getRandomInt(10, 50);
    syncSliderInput('colorSwapThreshold', 'colorSwapThresholdInput', colorSwapThreshold);
}

// Add the random button event listener
document.getElementById('randomButton').onclick = randomizeControls;

// Add the colorize event listeners
document.getElementById('colorizeColor').onchange = (event) => {
    colorizeColor = event.target.value;
    updateControls();
};

addSliderInputSync('colorizeAmount', 'colorizeAmountInput',
    (value) => { colorizeAmount = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

// Set up color levels synchronized slider
addSliderInputSync('colorLevels', 'colorLevelsInput',
    (value) => { colorLevels = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

// Add color reduction function
function reduceColors(value) {
    if (colorLevels === 256) return value;

    // Calculate step size for the given number of levels
    const step = 256 / (colorLevels - 1);

    // Quantize the value to nearest step
    return Math.round(Math.round(value / step) * step);
}

// Add event listeners
document.getElementById('oneBitMode').onchange = (event) => {
    oneBitMode = event.target.checked;
    document.querySelector('.one-bit-control').classList.toggle('active', oneBitMode);
    updateControls();
};

document.getElementById('primaryColor').onchange = (event) => {
    primaryColor = event.target.value;
    updateControls();
};

document.getElementById('secondaryColor').onchange = (event) => {
    secondaryColor = event.target.value;
    updateControls();
};

addSliderInputSync('oneBitThreshold', 'oneBitThresholdInput',
    (value) => { oneBitThreshold = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

// Update the format time function to show seconds with one decimal
function formatTime(seconds) {
    return seconds.toFixed(1) + 's';
}

// Add these event listeners
video.addEventListener('loadedmetadata', () => {
    document.getElementById('totalTime').textContent = formatTime(video.duration);
});

video.addEventListener('timeupdate', () => {
    document.getElementById('currentTime').textContent = formatTime(video.currentTime);
});

// Set up Gaussian synchronized sliders
addSliderInputSync('gaussianMid', 'gaussianMidInput',
    (value) => { gaussianMid = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

addSliderInputSync('gaussianSpread', 'gaussianSpreadInput',
    (value) => { gaussianSpread = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

addSliderInputSync('gaussianStrength', 'gaussianStrengthInput',
    (value) => { gaussianStrength = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

// Update the event listener for the toggle
document.getElementById('gaussianEnabled').onchange = (event) => {
    gaussianEnabled = event.target.checked;
    document.querySelector('.gaussian-sliders').classList.toggle('active', gaussianEnabled);
    updateControls();
};

// Add event listener for invert checkbox
document.getElementById('invertEnabled').onchange = (event) => {
    invertEnabled = event.target.checked;
    updateControls();
};

// Add event listeners
document.getElementById('colorSwapEnabled').onchange = (event) => {
    colorSwapEnabled = event.target.checked;
    document.querySelector('.color-swap-control').classList.toggle('active', colorSwapEnabled);
    updateControls();
};

document.getElementById('colorSwapSource').onchange = (event) => {
    colorSwapSource = event.target.value;
    updateControls();
};

document.getElementById('colorSwapTarget').onchange = (event) => {
    colorSwapTarget = event.target.value;
    updateControls();
};

addSliderInputSync('colorSwapThreshold', 'colorSwapThresholdInput',
    (value) => { colorSwapThreshold = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

// Add mask event listeners
document.getElementById('maskEnabled').onchange = (event) => {
    maskEnabled = event.target.checked;
    document.querySelector('.mask-control').classList.toggle('active', maskEnabled);
    updateControls();
};

// Set up mask synchronized sliders
addSliderInputSync('maskX', 'maskXInput',
    (value) => { maskX = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

addSliderInputSync('maskY', 'maskYInput',
    (value) => { maskY = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

addSliderInputSync('maskWidth', 'maskWidthInput',
    (value) => { maskWidth = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

addSliderInputSync('maskHeight', 'maskHeightInput',
    (value) => { maskHeight = value; },
    (value) => Math.round(value),
    (value) => parseInt(value)
);

// Add this function back near the top with other utility functions
function calculateCrop(videoWidth, videoHeight) {
    const videoAspect = videoWidth / videoHeight;
    const panelAspect = PANEL_WIDTH / PANEL_HEIGHT;

    let sourceWidth, sourceHeight, sourceX, sourceY;

    if (videoAspect > panelAspect) {
        // Video is wider than panel
        sourceHeight = videoHeight;
        sourceWidth = videoHeight * panelAspect;
        sourceY = 0 + (yOffset / 100 * videoHeight);
        sourceX = ((videoWidth - sourceWidth) / 2) + (xOffset / 100 * (videoWidth - sourceWidth));
    } else {
        // Video is taller than panel
        sourceWidth = videoWidth;
        sourceHeight = videoWidth / panelAspect;
        sourceX = 0;
        sourceY = ((videoHeight - sourceHeight) / 2) + (yOffset / 100 * (videoHeight - sourceHeight));
    }

    return {
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight
    };
}

// Add helper function to synchronize slider and input values
function syncSliderInput(sliderId, inputId, value, formatter = (v) => v) {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    if (slider && input) {
        slider.value = value;
        input.value = formatter(value);
    }
}

// Add helper function to create synchronized event listeners
function addSliderInputSync(sliderId, inputId, updateFunction, formatter = (v) => v, parser = (v) => v) {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);

    if (slider && input) {
        slider.oninput = (event) => {
            const value = parser(event.target.value);
            input.value = formatter(value);
            updateFunction(value);
            updateControls();
        };

        input.oninput = (event) => {
            const value = parser(event.target.value);
            slider.value = value;
            updateFunction(value);
            updateControls();
        };
    }
}

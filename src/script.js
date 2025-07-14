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
let zoom = 1.0;  // 0.25 to 4.0 (25% to 400%)
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

        // Fill with black for letterboxing when zoomed out
        if (zoom < 1.0) {
            previewCtx.fillStyle = 'black';
            previewCtx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
        }

        // Draw at panel resolution with crop
        previewCtx.drawImage(video,
            crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
            crop.destX, crop.destY, crop.destWidth, crop.destHeight
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
    'zoom': 100,           // 100%
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
                case 'zoom':
                    zoom = DEFAULT_VALUES[id] / 100;
                    syncSliderInput('zoom', 'zoomInput', DEFAULT_VALUES[id]);
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

            // Fill with black for letterboxing when zoomed out
            if (zoom < 1.0) {
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
            }

            ctx.drawImage(video,
                crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                crop.destX, crop.destY, crop.destWidth, crop.destHeight
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

                // Fill with black for letterboxing when zoomed out
                if (zoom < 1.0) {
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
                }

                ctx.drawImage(video,
                    crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                    crop.destX, crop.destY, crop.destWidth, crop.destHeight
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
        isExporting = false; // Reset export flag
    }
}

// Add the streamVideo function
async function streamVideo() {
    if (!port || !video.src) return;

    const writer = port.writable.getWriter();
    let lastFrameTime = performance.now();
    frameCount = 0;
    lastFpsTime = performance.now();

    // Initialize timeline tracking for streaming
    let streamStartTime = performance.now();
    let streamTimelinePosition = 0;  // Always start from 0
    let streamPausedAt = null;
    let streamTotalPausedTime = 0;
    let wasPlaying = !video.paused;
    let lastVideoTime = video.currentTime;
    let videoHasLooped = false;

    try {
        while (isStreaming) {
            const currentTime = performance.now();
            const elapsed = currentTime - lastFrameTime;

            // Handle pause state
            if (video.paused && !streamPausedAt) {
                // Just paused
                streamPausedAt = currentTime;
                wasPlaying = false;
                document.getElementById('status').className = 'info';
                document.getElementById('status').textContent = 'Streaming paused...';
            } else if (!video.paused && streamPausedAt) {
                // Just resumed
                const pauseDuration = currentTime - streamPausedAt;
                streamTotalPausedTime += pauseDuration;
                streamPausedAt = null;
                wasPlaying = true;
                // Don't update status here - let the main loop handle it
            }

            // Handle seek detection
            if (Math.abs(video.currentTime - lastVideoTime) > 0.5 && !video.paused) {
                // User seeked - only adjust if timeline is not longer than video
                // If timeline is longer, maintain the current timeline position
                if (Timeline.tracks.length === 0 || Timeline.duration <= (trimEnd - trimStart)) {
                    const trimmedVideoDuration = trimEnd - trimStart;
                    const videoPositionInTrim = video.currentTime - trimStart;
                    streamTimelinePosition = videoPositionInTrim % trimmedVideoDuration;
                    streamStartTime = currentTime - (streamTimelinePosition * 1000) - streamTotalPausedTime;
                }
                // Otherwise, keep the timeline position as is - don't sync with video position
            }
            lastVideoTime = video.currentTime;

            // Update visual playhead position even when paused
            if (Timeline.tracks.length > 0) {
                const playhead = document.getElementById('timelinePlayhead');
                if (playhead) {
                    playhead.style.left = `${streamTimelinePosition * Timeline.pixelsPerSecond}px`;
                }
            }

            if (elapsed >= FRAME_TIME && !video.paused) {
                // Calculate timeline position for streaming
                if (Timeline.tracks.length > 0) {
                    const streamElapsed = (currentTime - streamStartTime - streamTotalPausedTime) / 1000;
                    streamTimelinePosition = streamElapsed;

                    // Only loop timeline if we've exceeded duration and looping is enabled
                    if (streamTimelinePosition >= Timeline.duration) {
                        if (shouldLoop) {
                            // console.log(`Timeline loop: Resetting from ${streamTimelinePosition.toFixed(2)}s to 0`);
                            streamTimelinePosition = 0;
                            streamStartTime = currentTime - streamTotalPausedTime;
                            video.currentTime = trimStart;  // Also reset video when timeline loops
                        } else {
                            // Stop at timeline end
                            streamTimelinePosition = Timeline.duration;
                        }
                    }

                    applyAutomationAtTime(streamTimelinePosition);

                    // Update visual playhead during streaming
                    const playhead = document.getElementById('timelinePlayhead');
                    if (playhead) {
                        playhead.style.left = `${streamTimelinePosition * Timeline.pixelsPerSecond}px`;
                    }

                    // Update status to show timeline position
                    const trimmedVideoDuration = trimEnd - trimStart;
                    const videoLoop = Math.floor(streamTimelinePosition / trimmedVideoDuration) + 1;
                    const statusText = Timeline.duration > trimmedVideoDuration
                        ? `Streaming... Timeline: ${streamTimelinePosition.toFixed(1)}/${Timeline.duration}s (Video loop ${videoLoop})`
                        : `Streaming... Timeline: ${streamTimelinePosition.toFixed(1)}s`;
                    document.getElementById('status').textContent = statusText;
                }

                // Process frame using our shared function
                const crop = calculateCrop(video.videoWidth, video.videoHeight);

                // Clear the canvas before drawing to prevent trails
                ctx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

                // Fill with black for letterboxing when zoomed out
                if (zoom < 1.0) {
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
                }

                // Draw with crop
                ctx.drawImage(video,
                    crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                    crop.destX, crop.destY, crop.destWidth, crop.destHeight
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
                } else if (video.currentTime >= trimEnd - 0.05) {  // Check near end, not video.ended
                    if (shouldLoop || (Timeline.tracks.length > 0 && streamTimelinePosition < Timeline.duration)) {
                        // Log for debugging
                        // if (Timeline.tracks.length > 0) {
                        //     console.log(`Video loop: Timeline at ${streamTimelinePosition.toFixed(2)}s/${Timeline.duration}s, Video at ${video.currentTime.toFixed(2)}s`);
                        // }

                        video.currentTime = trimStart;

                        // Only stop streaming if timeline is complete and loop is disabled
                        if (Timeline.tracks.length > 0) {
                            if (streamTimelinePosition >= Timeline.duration && !shouldLoop) {
                                // console.log('Timeline completed, stopping stream');
                                isStreaming = false;
                                break;
                            }
                            // Otherwise continue - timeline hasn't finished
                        } else if (!shouldLoop) {
                            // No timeline, just video looping
                            isStreaming = false;
                            break;
                        }
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

        // Sync timeline position back to main Timeline object
        if (Timeline.tracks.length > 0) {
            Timeline.playheadPosition = streamTimelinePosition;
            Timeline.startTime = null;
            Timeline.pausedAt = null;
            Timeline.totalPausedTime = 0;
        }

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

        // Reset timeline position for streaming if we have timeline tracks
        if (Timeline.tracks.length > 0) {
            Timeline.playheadPosition = 0;
            Timeline.loopCount = 0;
            Timeline.startTime = null;
            Timeline.pausedAt = null;
            Timeline.totalPausedTime = 0;
            // Stop the preview automation loop since streaming will handle it
            stopAutomationLoop();
        }

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

        // Sync timeline position back from streaming state
        if (Timeline.tracks.length > 0) {
            // The streamVideo function will have set the correct timeline position
            // We just need to prepare for preview mode to take over
            Timeline.startTime = null;
            Timeline.pausedAt = null;
            Timeline.totalPausedTime = 0;
        }
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
    // Skip if timeline is controlling playback or if we're streaming
    if ((Timeline.tracks.length > 0 && Timeline.animationFrameId) || isStreaming) {
        return;
    }

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

    // Update timeline duration to match trimmed duration
    Timeline.duration = Math.max(trimEnd - trimStart, 0.1); // Ensure minimum duration
    Timeline.isCustomDuration = false; // Reset custom duration flag when video loads
    if (document.getElementById('timelineLength')) {
        updateTimelineLengthInput();
    }
}

// Add these event listeners
video.addEventListener('loadedmetadata', updateTrimControls);

// Helper function to update timeline duration when trim changes
function updateTimelineDurationFromTrim() {
    // Only update if not custom duration
    if (!Timeline.isCustomDuration) {
        Timeline.duration = Math.max(trimEnd - trimStart, 0.1); // Ensure minimum duration
        updateTimelineLengthInput();
        updateTimelineRuler();
    }
}

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

    // Always update timeline duration to match trim
    updateTimelineDurationFromTrim();
};

document.getElementById('trimEnd').oninput = (event) => {
    trimEnd = parseFloat(event.target.value);
    document.getElementById('trimEndNum').value = trimEnd.toFixed(1);
    if (trimEnd <= trimStart) {
        trimEnd = trimStart + 0.1;
        event.target.value = trimEnd;
        document.getElementById('trimEndNum').value = trimEnd.toFixed(1);
    }

    // Always update timeline duration to match trim
    updateTimelineDurationFromTrim();
};

document.getElementById('trimStartNum').onchange = (event) => {
    trimStart = Math.max(0, Math.min(parseFloat(event.target.value), trimEnd - 0.1));
    event.target.value = trimStart.toFixed(1);
    document.getElementById('trimStart').value = trimStart;
    if (!isStreaming && video.currentTime < trimStart) {
        video.currentTime = trimStart;
    }

    // Always update timeline duration to match trim
    updateTimelineDurationFromTrim();
};

document.getElementById('trimEndNum').onchange = (event) => {
    trimEnd = Math.min(video.duration, Math.max(trimStart + 0.1, parseFloat(event.target.value)));
    event.target.value = trimEnd.toFixed(1);
    document.getElementById('trimEnd').value = trimEnd;

    // Always update timeline duration to match trim
    updateTimelineDurationFromTrim();
};

// Modify the video ended event handler
video.addEventListener('timeupdate', () => {
    // Skip if timeline is controlling playback
    if (Timeline.tracks.length > 0 && Timeline.animationFrameId) {
        return;
    }

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

// Set up zoom and offset synchronized sliders
addSliderInputSync('zoom', 'zoomInput',
    (value) => { zoom = value / 100; },
    (value) => Math.round(value),
    (value) => parseFloat(value)
);

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
    zoom = 1.0;
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
    syncSliderInput('zoom', 'zoomInput', 100);
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
    zoom = getRandomInt(50, 200) / 100;          // 50% to 200%
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
    syncSliderInput('zoom', 'zoomInput', zoom * 100);
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
    let destX = 0, destY = 0, destWidth = PANEL_WIDTH, destHeight = PANEL_HEIGHT;

    if (zoom >= 1.0) {
        // ZOOM IN MODE: Crop video to fill panel completely
        if (videoAspect > panelAspect) {
            // Video is wider - crop width to match panel aspect
            sourceHeight = videoHeight;
            sourceWidth = sourceHeight * panelAspect;
        } else {
            // Video is taller - crop height to match panel aspect
            sourceWidth = videoWidth;
            sourceHeight = sourceWidth / panelAspect;
        }

        // Apply zoom in (show less content)
        sourceWidth = sourceWidth / zoom;
        sourceHeight = sourceHeight / zoom;

        // Fill entire panel - no black bars
        destX = 0;
        destY = 0;
        destWidth = PANEL_WIDTH;
        destHeight = PANEL_HEIGHT;
    } else {
        // ZOOM OUT MODE: Gradually show more content with black bars
        // We transition smoothly from cropped to full video view

        // Calculate the crop we'd use at 100% zoom
        let crop100Width, crop100Height;
        if (videoAspect > panelAspect) {
            crop100Height = videoHeight;
            crop100Width = crop100Height * panelAspect;
        } else {
            crop100Width = videoWidth;
            crop100Height = crop100Width / panelAspect;
        }

        // Smoothly interpolate source size between 100% crop and full video
        // At zoom = 1.0: show crop100 size
        // At zoom = 0.25: show full video
        const t = Math.min((1 - zoom) / 0.75, 1); // 0 at zoom=1, 1 at zoom=0.25

        sourceWidth = crop100Width + (videoWidth - crop100Width) * t;
        sourceHeight = crop100Height + (videoHeight - crop100Height) * t;

        // Ensure we don't exceed video bounds
        sourceWidth = Math.min(sourceWidth, videoWidth);
        sourceHeight = Math.min(sourceHeight, videoHeight);

        // Now calculate how to display this source in the panel
        // This will naturally create black bars as we show more content
        const displayScale = Math.min(PANEL_WIDTH / sourceWidth, PANEL_HEIGHT / sourceHeight);

        destWidth = sourceWidth * displayScale;
        destHeight = sourceHeight * displayScale;
        destX = (PANEL_WIDTH - destWidth) / 2;
        destY = (PANEL_HEIGHT - destHeight) / 2;
    }

    // Center the source area in the video
    sourceX = (videoWidth - sourceWidth) / 2;
    sourceY = (videoHeight - sourceHeight) / 2;

    // Apply user pan offsets
    sourceX += (xOffset / 100 * (videoWidth - sourceWidth));
    sourceY += (yOffset / 100 * (videoHeight - sourceHeight));

    // Ensure source stays within video bounds
    sourceX = Math.max(0, Math.min(sourceX, videoWidth - sourceWidth));
    sourceY = Math.max(0, Math.min(sourceY, videoHeight - sourceHeight));
    sourceWidth = Math.min(sourceWidth, videoWidth - sourceX);
    sourceHeight = Math.min(sourceHeight, videoHeight - sourceY);

    return {
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        destX,
        destY,
        destWidth,
        destHeight
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

// Timeline System
const Timeline = {
    tracks: [],
    duration: 10,          // Timeline duration (default 10 seconds, will update when video loads)
    videoDuration: 0,     // Actual video duration
    zoom: 1,
    playheadPosition: 0,
    isPlaying: false,
    pixelsPerSecond: 100,
    selectedKeyframe: null,
    selectedTrack: null,
    animationFrameId: null,
    startTime: null,      // For tracking timeline playback time
    loopCount: 0,         // Track how many times video has looped
    pausedAt: null,       // Track when timeline was paused
    totalPausedTime: 0,    // Track total time spent paused
    isCustomDuration: false // Track if user manually set timeline duration
};

// Available parameters for automation
const AUTOMATABLE_PARAMETERS = {
    'contrast': { min: 0, max: 2, default: 1, scale: 100 },
    'brightness': { min: -100, max: 100, default: 0, scale: 1 },
    'shadows': { min: -100, max: 100, default: 0, scale: 1 },
    'midtones': { min: -100, max: 100, default: 0, scale: 1 },
    'highlights': { min: -100, max: 100, default: 0, scale: 1 },
    'red': { min: 0, max: 2, default: 1, scale: 100 },
    'green': { min: 0, max: 2, default: 1, scale: 100 },
    'blue': { min: 0, max: 2, default: 1, scale: 100 },
    'hueShift': { min: -180, max: 180, default: 0, scale: 1 },
    'zoom': { min: 0.25, max: 4, default: 1, scale: 100 },
    'xOffset': { min: -100, max: 100, default: 0, scale: 1 },
    'yOffset': { min: -100, max: 100, default: 0, scale: 1 },
    'colorizeAmount': { min: 0, max: 100, default: 0, scale: 1 },
    'colorLevels': { min: 2, max: 256, default: 256, scale: 1 },
    'oneBitThreshold': { min: 0, max: 255, default: 128, scale: 1 },
    'gaussianMid': { min: 0, max: 1, default: 0.5, scale: 100 },
    'gaussianSpread': { min: 0, max: 1, default: 0.25, scale: 100 },
    'gaussianStrength': { min: 0, max: 1, default: 0.5, scale: 100 },
    'colorSwapThreshold': { min: 0, max: 255, default: 30, scale: 1 },
    'maskX': { min: -100, max: 100, default: 0, scale: 1 },
    'maskY': { min: -100, max: 100, default: 0, scale: 1 },
    'maskWidth': { min: 0, max: 100, default: 25, scale: 1 },
    'maskHeight': { min: 0, max: 100, default: 25, scale: 1 }
};

// Track class
class AutomationTrack {
    constructor(parameter) {
        this.id = Date.now() + Math.random();
        this.parameter = parameter;
        this.keyframes = [];
        this.enabled = true;
        this.color = '#4a90e2';
    }

    addKeyframe(time, value, easing = 'linear') {
        const keyframe = {
            id: Date.now() + Math.random(),
            time: time,
            value: value,
            easing: easing
        };

        // Insert keyframe in sorted order
        const insertIndex = this.keyframes.findIndex(k => k.time > time);
        if (insertIndex === -1) {
            this.keyframes.push(keyframe);
        } else {
            this.keyframes.splice(insertIndex, 0, keyframe);
        }

        return keyframe;
    }

    removeKeyframe(keyframeId) {
        this.keyframes = this.keyframes.filter(k => k.id !== keyframeId);
    }

    getValueAtTime(time) {
        if (this.keyframes.length === 0) {
            return AUTOMATABLE_PARAMETERS[this.parameter].default;
        }

        if (time <= this.keyframes[0].time) {
            return this.keyframes[0].value;
        }

        if (time >= this.keyframes[this.keyframes.length - 1].time) {
            return this.keyframes[this.keyframes.length - 1].value;
        }

        // Find the two keyframes to interpolate between
        for (let i = 0; i < this.keyframes.length - 1; i++) {
            const k1 = this.keyframes[i];
            const k2 = this.keyframes[i + 1];

            if (time >= k1.time && time <= k2.time) {
                const t = (time - k1.time) / (k2.time - k1.time);
                return interpolate(k1.value, k2.value, t, k2.easing);
            }
        }

        return this.keyframes[0].value;
    }
}

// Interpolation functions
function interpolate(start, end, t, easing) {
    switch (easing) {
        case 'ease-in':
            t = t * t;
            break;
        case 'ease-out':
            t = 1 - (1 - t) * (1 - t);
            break;
        case 'ease-in-out':
            t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            break;
        case 'linear':
        default:
            // t remains unchanged
            break;
    }

    return start + (end - start) * t;
}

// Timeline UI Management
function initializeTimeline() {
    const toggleButton = document.getElementById('toggleTimeline');
    const timelineContainer = document.getElementById('timelineContainer');

    toggleButton.addEventListener('click', () => {
        const isOpen = timelineContainer.classList.toggle('active');
        toggleButton.textContent = isOpen ? 'Hide Timeline' : 'Show Timeline';
        toggleButton.classList.toggle('timeline-open', isOpen);

        if (isOpen) {
            if (video.duration) {
                Timeline.videoDuration = video.duration;
                // Only update timeline duration if not custom and video is loaded
                if (!Timeline.isCustomDuration) {
                    Timeline.duration = Math.max(trimEnd - trimStart, 0.1);
                }
            }
            // If no video loaded yet, keep the default duration
            updateTimelineLengthInput();
            updateTimelineRuler();
            renderTimeline();

            // Start automation loop if video is playing
            if (!video.paused && Timeline.tracks.length > 0) {
                startAutomationLoop();
            }
        } else {
            // Stop automation loop when timeline is hidden
            stopAutomationLoop();
            // Clear pause tracking since we're hiding the timeline
            Timeline.pausedAt = null;
        }
    });

    // Add track button
    document.getElementById('addTrackButton').addEventListener('click', showParameterSelector);

    // Clear timeline button
    document.getElementById('clearTimelineButton').addEventListener('click', () => {
        if (confirm('Clear all timeline tracks?')) {
            Timeline.tracks = [];
            Timeline.playheadPosition = 0;
            Timeline.startTime = null;
            Timeline.pausedAt = null;
            Timeline.totalPausedTime = 0;
            Timeline.loopCount = 0;
            renderTimeline();
            stopAutomationLoop();
        }
    });

    // Timeline zoom
    document.getElementById('timelineZoom').addEventListener('input', (e) => {
        Timeline.zoom = parseFloat(e.target.value);
        Timeline.pixelsPerSecond = 100 * Timeline.zoom;
        updateTimelineRuler();
        renderTimeline();
    });

    // Context menu
    document.addEventListener('click', hideContextMenu);

    const contextMenuItems = document.querySelectorAll('.context-menu-item');
    contextMenuItems.forEach(item => {
        item.addEventListener('click', handleContextMenuAction);
    });

    // Keyframe editor modal
    document.getElementById('cancelKeyframeEdit').addEventListener('click', closeKeyframeEditor);
    document.getElementById('saveKeyframeEdit').addEventListener('click', saveKeyframeEdit);
    document.getElementById('modalOverlay').addEventListener('click', closeKeyframeEditor);

    // Update timeline when video loads
    video.addEventListener('loadedmetadata', () => {
        Timeline.videoDuration = video.duration;
        // Only update timeline duration if it hasn't been manually set
        const isDefaultDuration = Timeline.duration === 10 || Timeline.duration === 0;
        if (isDefaultDuration) {
            Timeline.duration = Math.max(trimEnd - trimStart, 0.1);
        }
        updateTimelineRuler();
        updateTimelineLengthInput();
    });

    // Timeline length controls
    const timelineLengthInput = document.getElementById('timelineLength');
    const resetLengthButton = document.getElementById('resetTimelineLength');

    timelineLengthInput.addEventListener('change', (e) => {
        const newDuration = parseFloat(e.target.value);

        if (newDuration > 0) {
            Timeline.duration = newDuration;
            // Mark as custom duration if different from trim duration
            Timeline.isCustomDuration = Math.abs(newDuration - (trimEnd - trimStart)) > 0.1;
            updateTimelineRuler();
            renderTimeline();
        } else {
            // Reset to current trim duration if invalid
            Timeline.duration = Math.max(trimEnd - trimStart, 0.1);
            Timeline.isCustomDuration = false;
            updateTimelineLengthInput();
        }
    });

    resetLengthButton.addEventListener('click', () => {
        Timeline.duration = Math.max(trimEnd - trimStart, 0.1);
        Timeline.isCustomDuration = false;
        updateTimelineLengthInput();
        updateTimelineRuler();
        renderTimeline();
    });

    // Smooth automation updates during playback
    video.addEventListener('play', () => {
        if (Timeline.tracks.length > 0) {
            // Reset timeline position if we're starting from the beginning
            if (video.currentTime <= trimStart + 0.1 && Timeline.playheadPosition >= Timeline.duration - 0.1) {
                Timeline.playheadPosition = 0;
                Timeline.loopCount = 0;
                Timeline.startTime = null;
                Timeline.pausedAt = null;
                Timeline.totalPausedTime = 0;
            }
            startAutomationLoop();
        }
    });

    video.addEventListener('pause', () => {
        stopAutomationLoop();
        // Timeline position is already set by the animation loop, no need to update
    });

    video.addEventListener('seeked', () => {
        // When user manually seeks video, update timeline position
        if (Timeline.tracks.length > 0 && !Timeline.animationFrameId && !isExporting) {
            // Calculate timeline position based on video position
            const trimmedVideoDuration = trimEnd - trimStart;
            const videoPositionInTrim = video.currentTime - trimStart;
            Timeline.playheadPosition = videoPositionInTrim + (Timeline.loopCount * trimmedVideoDuration);

            // Reset timeline timing to current position
            if (Timeline.startTime) {
                Timeline.startTime = performance.now() - (Timeline.playheadPosition * 1000);
                Timeline.totalPausedTime = 0;
                Timeline.pausedAt = null;
            }

            updatePlayhead();
        }
    });

    // Click on timeline to seek
    document.getElementById('timelineRuler').addEventListener('click', handleTimelineClick);
    document.getElementById('timelineTracks').addEventListener('click', handleTimelineClick);

    // Synchronized scrolling between headers and tracks
    const scrollableContainer = document.querySelector('.timeline-scrollable');
    const headersContainer = document.getElementById('timelineHeaders');

    if (scrollableContainer && headersContainer) {
        scrollableContainer.addEventListener('scroll', () => {
            headersContainer.scrollTop = scrollableContainer.scrollTop;
        });
    }

    // Timeline help button
    document.getElementById('timelineHelp').addEventListener('click', () => {
        document.getElementById('timelineHelpModal').classList.add('active');
        document.getElementById('modalOverlay').classList.add('active');
    });

    document.getElementById('closeTimelineHelp').addEventListener('click', () => {
        document.getElementById('timelineHelpModal').classList.remove('active');
        document.getElementById('modalOverlay').classList.remove('active');
    });

    // Save/Load timeline
    document.getElementById('saveTimelineButton').addEventListener('click', saveTimeline);
    document.getElementById('loadTimelineButton').addEventListener('click', () => {
        document.getElementById('timelineFileInput').click();
    });
    document.getElementById('timelineFileInput').addEventListener('change', loadTimeline);
}

// Show parameter selector for adding tracks
function showParameterSelector() {
    // Create parameter selector dropdown
    const selector = document.createElement('div');
    selector.className = 'parameter-dropdown active';
    selector.style.position = 'fixed';
    selector.style.left = '20px';
    selector.style.top = '50%';

    Object.keys(AUTOMATABLE_PARAMETERS).forEach(param => {
        const option = document.createElement('div');
        option.className = 'parameter-option';
        option.textContent = param.charAt(0).toUpperCase() + param.slice(1).replace(/([A-Z])/g, ' $1');
        option.dataset.parameter = param;
        option.addEventListener('click', () => {
            addTrack(param);
            selector.remove();
        });
        selector.appendChild(option);
    });

    document.body.appendChild(selector);

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeSelector(e) {
            if (!selector.contains(e.target)) {
                selector.remove();
                document.removeEventListener('click', closeSelector);
            }
        });
    }, 100);
}

// Add a new automation track
function addTrack(parameter) {
    // Check if track already exists
    if (Timeline.tracks.find(t => t.parameter === parameter)) {
        alert(`Track for ${parameter} already exists`);
        return;
    }

    const track = new AutomationTrack(parameter);
    Timeline.tracks.push(track);

    // Add initial keyframe at current parameter value
    const currentValue = getCurrentParameterValue(parameter);
    track.addKeyframe(0, currentValue);

    renderTimeline();

    // Start automation loop if video is playing and this is the first track
    if (!video.paused && Timeline.tracks.length === 1) {
        startAutomationLoop();
    }
}

// Get current value of a parameter
function getCurrentParameterValue(parameter) {
    const params = {
        'contrast': contrast,
        'brightness': brightness,
        'shadows': shadows,
        'midtones': midtones,
        'highlights': highlights,
        'red': redChannel,
        'green': greenChannel,
        'blue': blueChannel,
        'hueShift': hueShift,
        'zoom': zoom,
        'xOffset': xOffset,
        'yOffset': yOffset,
        'colorizeAmount': colorizeAmount,
        'colorLevels': colorLevels,
        'oneBitThreshold': oneBitThreshold,
        'gaussianMid': gaussianMid,
        'gaussianSpread': gaussianSpread,
        'gaussianStrength': gaussianStrength,
        'colorSwapThreshold': colorSwapThreshold,
        'maskX': maskX,
        'maskY': maskY,
        'maskWidth': maskWidth,
        'maskHeight': maskHeight
    };

    return params[parameter] || AUTOMATABLE_PARAMETERS[parameter].default;
}

// Render the timeline
function renderTimeline() {
    const headersContainer = document.getElementById('timelineHeaders');
    const tracksContainer = document.getElementById('timelineTracks');

    headersContainer.innerHTML = '';
    tracksContainer.innerHTML = '';

    Timeline.tracks.forEach((track, index) => {
        const { header, content } = createTrackElements(track, index);
        headersContainer.appendChild(header);
        tracksContainer.appendChild(content);
    });

    // Re-add loop markers after clearing tracks
    const trimmedVideoDuration = trimEnd - trimStart;
    if (trimmedVideoDuration > 0 && Timeline.duration > trimmedVideoDuration) {
        for (let loop = 1; loop * trimmedVideoDuration < Timeline.duration; loop++) {
            const loopMarker = document.createElement('div');
            loopMarker.className = 'timeline-loop-marker';
            loopMarker.style.left = `${loop * trimmedVideoDuration * Timeline.pixelsPerSecond}px`;
            loopMarker.setAttribute('data-loop', `Loop ${loop + 1}`);
            tracksContainer.appendChild(loopMarker);
        }
    }
}

// Create track header and content elements separately
function createTrackElements(track, index) {
    // Create header
    const header = document.createElement('div');
    header.className = 'track-header';
    header.dataset.trackId = track.id;
    header.innerHTML = `
        <span>${track.parameter.charAt(0).toUpperCase() + track.parameter.slice(1).replace(/([A-Z])/g, ' $1')}</span>
        <button class="timeline-button" style="padding: 2px 8px; font-size: 10px;" onclick="removeTrack('${track.id}')">×</button>
    `;

    // Create track content
    const trackEl = document.createElement('div');
    trackEl.className = 'timeline-track';
    trackEl.dataset.trackId = track.id;

    const content = document.createElement('div');
    content.className = 'track-content';
    content.dataset.trackId = track.id;
    content.addEventListener('dblclick', (e) => handleTrackDoubleClick(e, track));

    // Render keyframes
    track.keyframes.forEach(keyframe => {
        const keyframeEl = createKeyframeElement(keyframe, track);
        content.appendChild(keyframeEl);
    });

    // Render automation curve
    if (track.keyframes.length > 1) {
        const curve = createAutomationCurve(track);
        content.appendChild(curve);
    }

    trackEl.appendChild(content);

    return { header, content: trackEl };
}

// Create keyframe element
function createKeyframeElement(keyframe, track) {
    const el = document.createElement('div');
    el.className = 'keyframe';
    el.dataset.keyframeId = keyframe.id;
    el.dataset.trackId = track.id;
    el.style.left = `${keyframe.time * Timeline.pixelsPerSecond}px`;

    el.addEventListener('mousedown', startDragKeyframe);
    el.addEventListener('contextmenu', showKeyframeContextMenu);

    return el;
}

// Create automation curve visualization
function createAutomationCurve(track) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('automation-curve');
    svg.style.width = `${Timeline.duration * Timeline.pixelsPerSecond}px`;
    svg.style.height = '40px';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const pathData = generateCurvePath(track);
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', track.color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('opacity', '0.6');

    svg.appendChild(path);
    return svg;
}

// Generate SVG path for automation curve
function generateCurvePath(track) {
    if (track.keyframes.length < 2) return '';

    const param = AUTOMATABLE_PARAMETERS[track.parameter];
    const range = param.max - param.min;

    let path = '';
    const points = [];

    // Sample the curve
    for (let t = 0; t <= Timeline.duration; t += 0.1) {
        const value = track.getValueAtTime(t);
        const normalizedValue = (value - param.min) / range;
        const x = t * Timeline.pixelsPerSecond;
        const y = 35 - (normalizedValue * 30); // Invert Y and scale to track height
        points.push({ x, y });
    }

    // Create path
    points.forEach((point, i) => {
        if (i === 0) {
            path += `M ${point.x} ${point.y}`;
        } else {
            path += ` L ${point.x} ${point.y}`;
        }
    });

    return path;
}

// Handle track double-click to add keyframe
function handleTrackDoubleClick(e, track) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / Timeline.pixelsPerSecond;

    if (time >= 0 && time <= Timeline.duration) {
        const value = track.getValueAtTime(time);
        track.addKeyframe(time, value);
        renderTimeline();
    }
}

// Timeline interaction handlers
let isDraggingKeyframe = false;
let draggedKeyframe = null;
let draggedTrack = null;

function startDragKeyframe(e) {
    e.preventDefault();
    isDraggingKeyframe = true;
    draggedKeyframe = e.target;
    const keyframeId = draggedKeyframe.dataset.keyframeId;
    const trackId = draggedKeyframe.dataset.trackId;

    draggedTrack = Timeline.tracks.find(t => t.id === parseFloat(trackId));
    Timeline.selectedKeyframe = draggedTrack.keyframes.find(k => k.id === parseFloat(keyframeId));

    document.addEventListener('mousemove', dragKeyframe);
    document.addEventListener('mouseup', stopDragKeyframe);
}

function dragKeyframe(e) {
    if (!isDraggingKeyframe || !draggedKeyframe) return;

    const trackContent = draggedKeyframe.parentElement;
    const rect = trackContent.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const time = x / Timeline.pixelsPerSecond;

    Timeline.selectedKeyframe.time = Math.max(0, Math.min(time, Timeline.duration));
    draggedKeyframe.style.left = `${Timeline.selectedKeyframe.time * Timeline.pixelsPerSecond}px`;

    // Re-sort keyframes
    draggedTrack.keyframes.sort((a, b) => a.time - b.time);
}

function stopDragKeyframe() {
    isDraggingKeyframe = false;
    draggedKeyframe = null;
    document.removeEventListener('mousemove', dragKeyframe);
    document.removeEventListener('mouseup', stopDragKeyframe);
    renderTimeline();
}

// Context menu handlers
function showKeyframeContextMenu(e) {
    e.preventDefault();
    const menu = document.getElementById('timelineContextMenu');
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.classList.add('active');

    const keyframeId = e.target.dataset.keyframeId;
    const trackId = e.target.dataset.trackId;

    Timeline.selectedTrack = Timeline.tracks.find(t => t.id === parseFloat(trackId));
    Timeline.selectedKeyframe = Timeline.selectedTrack.keyframes.find(k => k.id === parseFloat(keyframeId));
}

function hideContextMenu() {
    document.getElementById('timelineContextMenu').classList.remove('active');
}

function handleContextMenuAction(e) {
    const action = e.target.dataset.action;

    if (action === 'edit') {
        openKeyframeEditor();
    } else if (action === 'delete') {
        if (Timeline.selectedTrack && Timeline.selectedKeyframe) {
            Timeline.selectedTrack.removeKeyframe(Timeline.selectedKeyframe.id);
            renderTimeline();
        }
    }

    hideContextMenu();
}

// Keyframe editor
function openKeyframeEditor() {
    if (!Timeline.selectedKeyframe || !Timeline.selectedTrack) return;

    const modal = document.getElementById('keyframeEditor');
    const overlay = document.getElementById('modalOverlay');

    document.getElementById('keyframeTime').value = Timeline.selectedKeyframe.time.toFixed(1);
    document.getElementById('keyframeValue').value = Timeline.selectedKeyframe.value;
    document.getElementById('keyframeEasing').value = Timeline.selectedKeyframe.easing;

    const param = AUTOMATABLE_PARAMETERS[Timeline.selectedTrack.parameter];
    document.getElementById('keyframeValue').min = param.min;
    document.getElementById('keyframeValue').max = param.max;
    document.getElementById('keyframeValue').step = param.scale === 1 ? 1 : 0.01;

    modal.classList.add('active');
    overlay.classList.add('active');
}

function closeKeyframeEditor() {
    document.getElementById('keyframeEditor').classList.remove('active');
    document.getElementById('modalOverlay').classList.remove('active');
}

function saveKeyframeEdit() {
    if (!Timeline.selectedKeyframe) return;

    Timeline.selectedKeyframe.time = parseFloat(document.getElementById('keyframeTime').value);
    Timeline.selectedKeyframe.value = parseFloat(document.getElementById('keyframeValue').value);
    Timeline.selectedKeyframe.easing = document.getElementById('keyframeEasing').value;

    // Re-sort keyframes
    Timeline.selectedTrack.keyframes.sort((a, b) => a.time - b.time);

    renderTimeline();
    closeKeyframeEditor();
}

// Timeline ruler
function updateTimelineRuler() {
    const ruler = document.getElementById('timelineRuler');
    const tracks = document.getElementById('timelineTracks');
    const timelineWidth = Timeline.duration * Timeline.pixelsPerSecond;

    ruler.innerHTML = '';
    ruler.style.width = `${timelineWidth}px`;
    tracks.style.minWidth = `${timelineWidth}px`;

    // Add time markers
    const markerInterval = Timeline.zoom < 1 ? 5 : Timeline.zoom < 2 ? 2 : 1;
    for (let t = 0; t <= Timeline.duration; t += markerInterval) {
        const marker = document.createElement('div');
        marker.className = 'timeline-time-marker';
        if (t === 0) {
            marker.className += ' zero-marker';
        }
        marker.style.left = `${t * Timeline.pixelsPerSecond}px`;
        marker.textContent = `${t}s`;
        ruler.appendChild(marker);
    }

    // Add video loop markers if timeline is longer than video
    const trimmedVideoDuration = trimEnd - trimStart;
    if (trimmedVideoDuration > 0 && Timeline.duration > trimmedVideoDuration) {
        for (let loop = 1; loop * trimmedVideoDuration < Timeline.duration; loop++) {
            const loopMarker = document.createElement('div');
            loopMarker.className = 'timeline-loop-marker';
            loopMarker.style.left = `${loop * trimmedVideoDuration * Timeline.pixelsPerSecond}px`;
            loopMarker.setAttribute('data-loop', `Loop ${loop + 1}`);

            // Add to both ruler and tracks for full height
            ruler.appendChild(loopMarker.cloneNode(true));
            tracks.appendChild(loopMarker);
        }
    }
}

// Playhead management
function updatePlayhead() {
    const playhead = document.getElementById('timelinePlayhead');

    // Only update timeline position if not controlled by animation loop
    if (!Timeline.animationFrameId) {
        Timeline.playheadPosition = video.currentTime;
    }

    playhead.style.left = `${Timeline.playheadPosition * Timeline.pixelsPerSecond}px`;

    // Apply automation values if not already being updated by the animation loop
    if (!Timeline.animationFrameId && Timeline.tracks.length > 0) {
        applyAutomationAtTime(Timeline.playheadPosition);
    }
}

// Apply automation values at specific time
function applyAutomationAtTime(time) {
    let hasChanges = false;

    Timeline.tracks.forEach(track => {
        if (!track.enabled) return;

        const value = track.getValueAtTime(time);
        const currentValue = getCurrentParameterValue(track.parameter);

        // Only update if value has changed significantly
        if (Math.abs(value - currentValue) > 0.001) {
            setParameterValue(track.parameter, value);
            hasChanges = true;


        }
    });

    // Only trigger preview update if we're not streaming and values changed
    if (!isStreaming && hasChanges) {
        // The preview loop will automatically pick up the parameter changes
        // No need to call updateControls() as it would cause duplicate updates
    }
}

// Set parameter value
function setParameterValue(parameter, value) {
    const param = AUTOMATABLE_PARAMETERS[parameter];

    switch (parameter) {
        case 'contrast':
            contrast = value;
            syncSliderInputQuiet('contrast', 'contrastInput', value * param.scale);
            break;
        case 'brightness':
            brightness = value;
            syncSliderInputQuiet('brightness', 'brightnessInput', value);
            break;
        case 'shadows':
            shadows = value;
            syncSliderInputQuiet('shadows', 'shadowsInput', value);
            break;
        case 'midtones':
            midtones = value;
            syncSliderInputQuiet('midtones', 'midtonesInput', value);
            break;
        case 'highlights':
            highlights = value;
            syncSliderInputQuiet('highlights', 'highlightsInput', value);
            break;
        case 'red':
            redChannel = value;
            syncSliderInputQuiet('red', 'redInput', value * param.scale);
            break;
        case 'green':
            greenChannel = value;
            syncSliderInputQuiet('green', 'greenInput', value * param.scale);
            break;
        case 'blue':
            blueChannel = value;
            syncSliderInputQuiet('blue', 'blueInput', value * param.scale);
            break;
        case 'hueShift':
            hueShift = value;
            syncSliderInputQuiet('hueShift', 'hueShiftInput', value);
            break;
        case 'zoom':
            zoom = value;
            syncSliderInputQuiet('zoom', 'zoomInput', value * param.scale);
            break;
        case 'xOffset':
            xOffset = value;
            syncSliderInputQuiet('xOffset', 'xOffsetInput', value);
            break;
        case 'yOffset':
            yOffset = value;
            syncSliderInputQuiet('yOffset', 'yOffsetInput', value);
            break;
        case 'colorizeAmount':
            colorizeAmount = value;
            syncSliderInputQuiet('colorizeAmount', 'colorizeAmountInput', value);
            break;
        case 'colorLevels':
            colorLevels = value;
            syncSliderInputQuiet('colorLevels', 'colorLevelsInput', value);
            break;
        case 'oneBitThreshold':
            oneBitThreshold = value;
            syncSliderInputQuiet('oneBitThreshold', 'oneBitThresholdInput', value);
            break;
        case 'gaussianMid':
            gaussianMid = value;
            syncSliderInputQuiet('gaussianMid', 'gaussianMidInput', value * param.scale);
            break;
        case 'gaussianSpread':
            gaussianSpread = value;
            syncSliderInputQuiet('gaussianSpread', 'gaussianSpreadInput', value * param.scale);
            break;
        case 'gaussianStrength':
            gaussianStrength = value;
            syncSliderInputQuiet('gaussianStrength', 'gaussianStrengthInput', value * param.scale);
            break;
        case 'colorSwapThreshold':
            colorSwapThreshold = value;
            syncSliderInputQuiet('colorSwapThreshold', 'colorSwapThresholdInput', value);
            break;
        case 'maskX':
            maskX = value;
            syncSliderInputQuiet('maskX', 'maskXInput', value);
            break;
        case 'maskY':
            maskY = value;
            syncSliderInputQuiet('maskY', 'maskYInput', value);
            break;
        case 'maskWidth':
            maskWidth = value;
            syncSliderInputQuiet('maskWidth', 'maskWidthInput', value);
            break;
        case 'maskHeight':
            maskHeight = value;
            syncSliderInputQuiet('maskHeight', 'maskHeightInput', value);
            break;
    }
}

// Add a quiet version of syncSliderInput that doesn't trigger updateControls
function syncSliderInputQuiet(sliderId, inputId, value, formatter = null) {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    if (slider && input) {
        // Temporarily remove event listeners to avoid triggering updateControls
        const oldSliderHandler = slider.oninput;
        const oldInputHandler = input.oninput;

        slider.oninput = null;
        input.oninput = null;

        slider.value = value;
        input.value = formatter ? formatter(value) : value;

        // Restore event listeners after a tiny delay
        setTimeout(() => {
            slider.oninput = oldSliderHandler;
            input.oninput = oldInputHandler;
        }, 0);
    }
}

// Handle timeline click to seek
function handleTimelineClick(e) {
    if (e.target.classList.contains('keyframe')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(x / Timeline.pixelsPerSecond, Timeline.duration));

    // Update timeline position
    Timeline.playheadPosition = time;

    // Calculate which video loop we're in and the position within that loop
    const trimmedVideoDuration = trimEnd - trimStart;
    Timeline.loopCount = Math.floor(time / trimmedVideoDuration);
    const videoPosition = time % trimmedVideoDuration;

    // Set video to appropriate position
    const targetVideoTime = trimStart + videoPosition;
    video.currentTime = Math.min(targetVideoTime, trimEnd);

    // Update start time for animation loop
    if (Timeline.startTime) {
        Timeline.startTime = performance.now() - (time * 1000);
        Timeline.totalPausedTime = 0;
        Timeline.pausedAt = null;
    }

    // Update visual playhead
    updatePlayhead();
}

// Remove track
function removeTrack(trackId) {
    Timeline.tracks = Timeline.tracks.filter(t => t.id !== parseFloat(trackId));
    renderTimeline();

    // Stop automation loop if no tracks remain
    if (Timeline.tracks.length === 0) {
        stopAutomationLoop();
        Timeline.playheadPosition = 0;
        Timeline.startTime = null;
        Timeline.pausedAt = null;
        Timeline.totalPausedTime = 0;
        Timeline.loopCount = 0;
    }
}

// Modified convertToBin function to support timeline
let isExporting = false; // Global flag to prevent interference during export

async function convertToBinWithTimeline() {
    isExporting = true; // Set flag at start of export

    // Check if Timeline object exists
    if (typeof Timeline === 'undefined') {
        alert('Timeline system not initialized. Please refresh the page.');
        isExporting = false;
        return;
    }

    if (!video.src) {
        document.getElementById('status').className = 'error';
        document.getElementById('status').textContent = 'Please select a video file';
        return;
    }

    // Early check for Timeline duration
    if (Timeline.duration <= 0 || !isFinite(Timeline.duration)) {
        alert('Invalid timeline duration. Please check your timeline settings.');
        return;
    }

    // Ensure trim values are valid
    if (trimEnd === 0 || trimEnd <= trimStart) {
        if (video.duration > 0) {
            trimEnd = video.duration;
        } else {
            // If no video duration available, use timeline duration
            trimEnd = trimStart + Timeline.duration;
        }
    }

    // Only update timeline duration if not custom

    const progressBar = document.getElementById('conversionProgress');
    const progressFill = progressBar.querySelector('.progress-fill');
    const progressText = progressBar.querySelector('.progress-text');

    progressBar.style.display = 'block';
    document.getElementById('downloadBinButton').disabled = true;
    document.getElementById('status').className = 'info';

    const speedInfo = playbackSpeed !== 1.0 ? ` at ${playbackSpeed.toFixed(1)}x speed` : '';
    const hasAutomation = Timeline.tracks.length > 0;
    const automationInfo = hasAutomation ? ' with automation' : '';
    document.getElementById('status').textContent = `Converting video to binary${speedInfo}${automationInfo}...`;

    // Save the timeline duration at the start to ensure it doesn't get changed
    const targetExportDuration = Timeline.duration;

    // Double-check the locked duration is valid
    if (targetExportDuration <= 0 || !isFinite(targetExportDuration)) {
        alert('Invalid timeline duration. Please check your timeline settings.');
        return;
    }

    // Always use timeline duration for export
    const exportDuration = targetExportDuration;
    const totalExportFrames = Math.floor(exportDuration * TARGET_FPS / playbackSpeed);

    // For ping pong mode, only apply at video level if timeline matches video duration
    const trimmedVideoDuration = Math.max(trimEnd - trimStart, 0.1);

    // Ensure we have a valid video duration to work with
    if (trimmedVideoDuration <= 0.1 || !isFinite(trimmedVideoDuration)) {
        alert('Invalid video trim settings. Please check your trim points.');
        return;
    }

    const isDefaultTimeline = Math.abs(Timeline.duration - trimmedVideoDuration) < 0.1;
    const totalFrames = pingPongMode && isDefaultTimeline ? totalExportFrames * 2 : totalExportFrames;
    let currentFrame = 0;



    // Create a buffer to hold all frames
    const binData = new Uint8Array(totalFrames * FRAME_SIZE);
    let binOffset = 0;

    // Save current video time and playback state
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;
    if (wasPlaying) {
        video.pause();
    }

    try {
        // Process frames for the entire timeline duration
        let lastSuccessfulFrame = -1;

        for (let outputFrame = 0; outputFrame < totalExportFrames; outputFrame++) {
            // Calculate timeline time for this frame - this should go from 0 to exportDuration
            const frameTimelineTime = (outputFrame * playbackSpeed) / TARGET_FPS;
            const timelineTime = frameTimelineTime;



            // Apply timeline automation if available
            if (Timeline.tracks.length > 0) {
                applyAutomationAtTime(timelineTime);
            }

            // Calculate video position (with looping if timeline is longer than video)
            // (trimmedVideoDuration is already declared at the function level)

            // Ensure video position calculation won't fail
            if (!isFinite(timelineTime) || timelineTime < 0) {
                continue;
            }

            const videoPosition = timelineTime % trimmedVideoDuration;
            const videoTime = trimStart + videoPosition;

            // Check if we're already at the target position
            if (Math.abs(video.currentTime - videoTime) < 0.01) {
                // Already at the correct position, no need to seek
            } else {
                video.currentTime = videoTime;

                // Add timeout for seeking with better error handling
                try {
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            // Don't reject, just continue with current frame
                            resolve();
                        }, 2000); // 2 second timeout

                        video.onseeked = async () => {
                            clearTimeout(timeout);

                            // Wait for video to be ready
                            if (video.readyState < 2) {
                                await new Promise(r => {
                                    video.oncanplay = r;
                                    setTimeout(r, 100); // Timeout fallback
                                });
                            }

                            // Add a small delay to ensure frame is rendered
                            setTimeout(resolve, 50);
                        };

                        video.onerror = () => {
                            clearTimeout(timeout);
                            resolve(); // Continue instead of rejecting
                        };
                    });
                } catch (seekError) {
                    // Continue with export even if seek failed
                }
            }

            const crop = calculateCrop(video.videoWidth, video.videoHeight);
            ctx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

            // Fill with black for letterboxing when zoomed out
            if (zoom < 1.0) {
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
            }

            ctx.drawImage(video,
                crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                crop.destX, crop.destY, crop.destWidth, crop.destHeight
            );

            const rgbData = processFrame(canvas, ctx);
            binData.set(rgbData, binOffset);
            binOffset += rgbData.length;

            currentFrame++;
            const progress = Math.floor((currentFrame / totalFrames) * 100);
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${progress}%`;

            lastSuccessfulFrame = outputFrame;


        }

        // If ping pong mode is enabled and timeline matches video duration, add frames in reverse order
        if (pingPongMode && isDefaultTimeline) {
            document.getElementById('status').textContent = `Converting video to binary${speedInfo} (backward pass)...`;

            for (let outputFrame = totalExportFrames - 2; outputFrame >= 0; outputFrame--) {
                const sourceFrameIndex = Math.floor(outputFrame * playbackSpeed);
                const frameTime = trimStart + sourceFrameIndex / TARGET_FPS;
                video.currentTime = frameTime;

                await new Promise(resolve => {
                    video.onseeked = resolve;
                });

                const crop = calculateCrop(video.videoWidth, video.videoHeight);
                ctx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

                // Fill with black for letterboxing when zoomed out
                if (zoom < 1.0) {
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
                }

                ctx.drawImage(video,
                    crop.sourceX, crop.sourceY, crop.sourceWidth, crop.sourceHeight,
                    crop.destX, crop.destY, crop.destWidth, crop.destHeight
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
        const blob = new Blob([binData.slice(0, binOffset)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        const nameWithoutExt = originalFileName.split('.')[0];
        const durationInfo = `_${Timeline.duration.toFixed(1)}s`;
        const pingPongSuffix = pingPongMode && isDefaultTimeline ? '_pingpong' : '';
        const speedSuffix = playbackSpeed !== 1.0 ? `_${playbackSpeed.toFixed(1)}x` : '';
        const timelineSuffix = Timeline.tracks.length > 0 ? '_automation' : '';
        a.download = `${nameWithoutExt}${durationInfo}${speedSuffix}${pingPongSuffix}${timelineSuffix}.bin`;

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

// Override the original convertToBin function
convertToBin = convertToBinWithTimeline;

// Update the button to use the new function
const downloadBtn = document.getElementById('downloadBinButton');
if (downloadBtn) {
    downloadBtn.onclick = convertToBinWithTimeline;
}

// Initialize timeline when DOM is loaded
initializeTimeline();

// Save timeline to JSON file
function saveTimeline() {
    if (Timeline.tracks.length === 0) {
        alert('No timeline tracks to save');
        return;
    }

    const timelineData = {
        version: '1.1',
        duration: Timeline.duration,
        videoDuration: Timeline.videoDuration,
        tracks: Timeline.tracks.map(track => ({
            parameter: track.parameter,
            enabled: track.enabled,
            color: track.color,
            keyframes: track.keyframes.map(kf => ({
                time: kf.time,
                value: kf.value,
                easing: kf.easing
            }))
        }))
    };

    const blob = new Blob([JSON.stringify(timelineData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline_${originalFileName.split('.')[0] || 'preset'}_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Load timeline from JSON file
function loadTimeline(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const timelineData = JSON.parse(e.target.result);

            if (!timelineData.version || !timelineData.tracks) {
                throw new Error('Invalid timeline file format');
            }

            // Clear existing tracks
            Timeline.tracks = [];

            // Load timeline duration if available
            if (timelineData.duration) {
                Timeline.duration = timelineData.duration;
                // Check if it's a custom duration
                Timeline.isCustomDuration = Math.abs(Timeline.duration - (trimEnd - trimStart)) > 0.1;
                updateTimelineLengthInput();
                updateTimelineRuler();
            }

            // Load tracks
            timelineData.tracks.forEach(trackData => {
                const track = new AutomationTrack(trackData.parameter);
                track.enabled = trackData.enabled !== undefined ? trackData.enabled : true;
                track.color = trackData.color || '#4a90e2';

                // Clear default keyframe
                track.keyframes = [];

                // Add loaded keyframes
                trackData.keyframes.forEach(kf => {
                    track.addKeyframe(kf.time, kf.value, kf.easing || 'linear');
                });

                Timeline.tracks.push(track);
            });

            renderTimeline();
            document.getElementById('status').className = 'success';
            document.getElementById('status').textContent = 'Timeline loaded successfully';
        } catch (error) {
            document.getElementById('status').className = 'error';
            document.getElementById('status').textContent = 'Error loading timeline: ' + error.message;
        }
    };

    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

// Smooth automation update loop
function startAutomationLoop() {
    if (Timeline.animationFrameId) {
        cancelAnimationFrame(Timeline.animationFrameId);
    }

    // Initialize or resume timeline
    const currentTime = performance.now();
    const trimmedVideoDuration = trimEnd - trimStart;

    if (Timeline.pausedAt) {
        // Resuming from pause - adjust start time by pause duration
        const pauseDuration = currentTime - Timeline.pausedAt;
        Timeline.totalPausedTime += pauseDuration;
        Timeline.pausedAt = null;
    } else if (!Timeline.startTime) {
        // First time starting - initialize
        Timeline.startTime = currentTime;
        Timeline.totalPausedTime = 0;
    }

    Timeline.loopCount = Math.floor(Timeline.playheadPosition / trimmedVideoDuration);

    function updateAutomation() {
        if (video.paused || !Timeline.tracks.length) {
            Timeline.animationFrameId = null;
            return;
        }

        // Calculate timeline position based on elapsed time minus paused time
        const currentTime = performance.now();
        const elapsed = (currentTime - Timeline.startTime - Timeline.totalPausedTime) / 1000;
        Timeline.playheadPosition = elapsed;

        // Check if we've reached the end of the timeline
        if (Timeline.playheadPosition >= Timeline.duration) {
            if (shouldLoop) {
                // Reset timeline to beginning
                Timeline.playheadPosition = 0;
                Timeline.startTime = currentTime;
                Timeline.totalPausedTime = 0;
                Timeline.loopCount = 0;
                video.currentTime = trimStart;
            } else {
                // Stop at the end
                video.pause();
                Timeline.animationFrameId = null;
                return;
            }
        }

        // Calculate video position within the timeline
        const trimmedVideoDuration = trimEnd - trimStart;
        const videoPosition = Timeline.playheadPosition % trimmedVideoDuration;
        const currentLoopCount = Math.floor(Timeline.playheadPosition / trimmedVideoDuration);

        // Handle video looping
        if (currentLoopCount !== Timeline.loopCount) {
            Timeline.loopCount = currentLoopCount;
            video.currentTime = trimStart;
        } else {
            // Sync video position
            const targetVideoTime = trimStart + videoPosition;
            if (Math.abs(video.currentTime - targetVideoTime) > 0.1) {
                video.currentTime = targetVideoTime;
            }
        }

        // Update playhead visual position
        const playhead = document.getElementById('timelinePlayhead');
        playhead.style.left = `${Timeline.playheadPosition * Timeline.pixelsPerSecond}px`;

        // Apply automation values at the timeline position
        applyAutomationAtTime(Timeline.playheadPosition);

        // Continue the loop
        Timeline.animationFrameId = requestAnimationFrame(updateAutomation);
    }

    updateAutomation();
}

function stopAutomationLoop() {
    if (Timeline.animationFrameId) {
        cancelAnimationFrame(Timeline.animationFrameId);
        Timeline.animationFrameId = null;

        // Record when we paused
        Timeline.pausedAt = performance.now();

        // Update visual playhead to show exact pause position
        const playhead = document.getElementById('timelinePlayhead');
        if (playhead) {
            playhead.style.left = `${Timeline.playheadPosition * Timeline.pixelsPerSecond}px`;
        }
    }
}

// Update timeline length input display
function updateTimelineLengthInput() {
    const input = document.getElementById('timelineLength');
    if (input) {
        input.value = Timeline.duration.toFixed(1);
    }
}

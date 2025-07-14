# Video Stream

A web-based video processing application for LED panels with real-time effects and timeline automation.

## Features

- **Video Processing**: Convert videos to binary format for LED panels (40x96 resolution)
- **Real-time Effects**: Apply various effects including contrast, brightness, color adjustments, zoom, and more
- **Timeline Automation**: Create smooth parameter animations over time
- **WebSerial Support**: Stream directly to Teensy devices
- **Trim & Loop**: Set start/end points and enable ping-pong playback
- **Export Options**: Download processed videos as .bin files

## New: Timeline Feature

### Overview
The timeline feature allows you to create sophisticated animations by automating any parameter over time. This enables smooth transitions and complex effects that change throughout your video.

### How to Use the Timeline

1. **Open Timeline**: Click "Show Timeline" button to reveal the timeline panel at the bottom
2. **Add Automation Track**:
   - Click "Add Track" button
   - Select a parameter to automate (e.g., Zoom, Hue, X Offset)
3. **Create Keyframes**:
   - Double-click on a track at any time position to add a keyframe
   - The keyframe will inherit the current parameter value
4. **Edit Keyframes**:
   - Right-click on a keyframe to open the context menu
   - Select "Edit Keyframe" to modify time, value, and easing
   - Drag keyframes to adjust their timing
5. **Preview Changes**: Play the video to see automation in real-time
6. **Export with Timeline**: Click "Download .bin" to export with all automation applied

### Available Parameters for Automation

- **Visual Effects**: Contrast, Brightness, Shadows, Midtones, Highlights
- **Color Channels**: Red, Green, Blue multipliers
- **Color Effects**: Hue Shift, Colorize Amount, Color Levels
- **Position/Scale**: Zoom, X Offset, Y Offset
- **Advanced**: Gaussian parameters, Color Swap Threshold, Mask position/size

### Timeline Controls

- **Zoom Slider**: Adjust timeline zoom for precision editing
- **Save/Load Timeline**: Export timeline configurations as JSON files
- **Clear All**: Remove all automation tracks
- **Timeline Help**: Access built-in guide

### Easing Options

- **Linear**: Constant rate of change
- **Ease In**: Slow start, fast end
- **Ease Out**: Fast start, slow end
- **Ease In-Out**: Slow start and end

### Tips

- Multiple parameters can be automated simultaneously
- Click on the timeline ruler to seek to specific times
- The red playhead shows current playback position
- Automation curves visualize parameter changes
- Exported files include "_timeline" suffix when automation is used

## Getting Started

1. Open `index.html` in a Chrome or Edge browser
2. Select a video file
3. Adjust parameters manually or use timeline automation
4. Export as .bin file or stream to connected device

## Requirements

- Modern browser with WebSerial API support (Chrome/Edge)
- Video files in common formats (MP4, WebM, etc.)

## License

See LICENSE file for details.

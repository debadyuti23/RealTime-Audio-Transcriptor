# Real-Time Audio Transcriptor

A Chrome extension that captures audio from browser tabs and provides real-time transcription using Deepgram's Live Streaming API.

## Features

- **Real-time transcription** of tab audio using Deepgram's Nova-2 model
- **Live streaming** with interim results for instant feedback
- **Session timer** with pause/resume functionality for meeting duration tracking
- **Recording controls** - Start, pause/resume, and stop with clear visual states
- **Export functionality** - Copy to clipboard or download as Text/JSON/CSV
- **Clean sidepanel interface** with recording controls and status indicators
- **Relative timestamps** for easy navigation
- **User-friendly error handling** with helpful messages

## API Integration

This project uses the **Deepgram Live Streaming API** with the official Node.js SDK:
- **API Documentation**: [developers.deepgram.com/reference/listen-live](https://developers.deepgram.com/reference/listen-live)
- **SDK Package**: `@deepgram/sdk` v3.4.0
- **Model**: Nova-2 (latest Deepgram model for accuracy)

## Prerequisites

Before running this application, ensure you have:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Google Chrome** (v88 or higher)
- **Deepgram API Key** - [Get free credits at console.deepgram.com](https://console.deepgram.com/)

## Setup

### 1. Clone/Download Repository
```bash
git clone https://github.com/debadyuti23/RealTime-Audio-Transcriptor.git
cd RealTime-Audio-Transcriptor
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create Environment File
Create a `.env` file in the root directory:
```env
PORT=3004
DEEPGRAM_API_KEY=your_actual_deepgram_api_key_here
```
Copy paste your deepgram API Key from [Deepgram Console](https://console.deepgram.com/)

**Important**: 
- The API key is shown **only once** during creation - copy it immediately

## Running the Application

### Step 1: Start the Backend Server
```bash
npm start
```

You should see:
```
WebSocket server running on port 3004
```

**Keep this terminal window open** - the server must be running for transcription to work.

### Step 2: Load Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. **Enable "Developer mode"** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `RealTime-Audio-Transcriptor` folder
5. The extension should appear in your extensions list

### Step 3: Test the Extension

1. **Navigate to any webpage** with audio content (YouTube, news sites, etc.)
2. **Click the extension icon** in the Chrome toolbar (or pin it for easy access)
3. The **sidepanel will open** on the right side showing connection status and session timer
4. Click **"Start Recording"** to begin transcription - the timer will start automatically
5. **Audio from the current tab** will be transcribed in real-time
6. Use **"Pause"** to temporarily stop recording (timer pauses) and **"Resume"** to continue
7. Click **"Stop Recording"** when done - timer resets to 00:00:00
8. Use **export options** to save your transcript with session duration metadata

## Usage Tips

- **Audio Source**: Only captures audio from the **active tab**
- **Session Timer**: Displays in HH:MM:SS format, automatically starts with recording
- **Pause/Resume**: Use to take breaks during long sessions - timer pauses accordingly
- **Permissions**: Grant microphone/tab capture permissions when prompted
- **Connection**: Ensure stable internet for best transcription quality
- **Export**: Use Ctrl+C (or Cmd+C) to quickly copy transcript
- **Status**: Check connection status and session duration in the sidepanel header

## Troubleshooting

### Common Issues

**"Not connected to server"**
- Ensure `npm start` is running in terminal
- Check if port 3004 is available
- Verify `.env` file exists with correct PORT

**"Unable to start transcription service"**
- Check your `DEEPGRAM_API_KEY` in `.env`
- Verify you have remaining API credits
- Ensure stable internet connection

**"Extension has not been invoked for current page"**
- Navigate to a regular webpage (not chrome:// pages)
- Click the extension icon to open sidepanel
- Grant necessary permissions when prompted

**No audio being captured**
- Ensure the tab has audio playing
- Check Chrome's tab audio indicator (speaker icon)
- Try refreshing the page and restarting recording

### Reset Instructions

If you encounter persistent issues:

1. **Stop the server** (Ctrl+C in terminal)
2. **Reload the extension** in `chrome://extensions/`
3. **Restart the server** with `npm start`
4. **Try again** on a fresh webpage


## Technical Details

- **Frontend**: Chrome Extension (Manifest V3)
- **Backend**: Node.js WebSocket server
- **API**: Deepgram Live Streaming API Model Nova-2 Free Tier
- **Audio**: WebM format, real-time streaming with pause/resume support
- **Timer**: JavaScript-based session duration tracking with pause functionality
- **Styling**: Modular CSS architecture with external stylesheets
- **Permissions**: `tabCapture`, `activeTab`, `sidePanel`, `storage`

### Project Structure
```
RealTime-Audio-Transcriptor/
├── .env                    # Environment variables
├── package.json           # Dependencies and scripts
├── server.js              # WebSocket server
├── manifest.json          # Chrome extension manifest
├── service-worker.js      # Background service worker
├── sidepanel.html         # Extension UI structure
├── sidepanel.css          # Extension UI styles
├── sidepanel.js           # Extension UI logic
└── icons/                 # Extension icons
```

## License

This project is for educational/demonstration purposes. Please comply with Deepgram's terms of service and applicable laws regarding audio recording.

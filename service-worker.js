// Service Worker for Real-time Transcription
console.log('Service Worker loaded');

let ws = null;
let sessionId = null;
let isRecording = false;
let connectionStatus = 'disconnected';

// WebSocket connection to server
function connectToServer() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  ws = new WebSocket('ws://localhost:3004'); // Note: Update this if PORT changes in .env

  ws.onopen = () => {
    connectionStatus = 'connected';
    broadcastToTabs({ type: 'CONNECTION_STATUS', status: 'connected' });
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
      case 'session_started':
        sessionId = data.sessionId;
        broadcastToTabs({ type: 'SESSION_STARTED', sessionId });
        break;

      case 'session_ready':
        broadcastToTabs({ type: 'SESSION_READY' });
        break;

      case 'transcription':
        broadcastToTabs({
          type: 'TRANSCRIPTION',
          text: data.text,
          confidence: data.confidence,
          timestamp: data.timestamp,
          isFinal: true
        });
        break;

      case 'interim_transcription':
        broadcastToTabs({
          type: 'INTERIM_TRANSCRIPTION',
          text: data.text,
          confidence: data.confidence,
          isFinal: false
        });
        break;

      case 'error':
        broadcastToTabs({ type: 'ERROR', message: data.message });
        break;

      case 'status':
        broadcastToTabs({ type: 'STATUS', message: data.message });
        break;

      case 'session_stopped':
        isRecording = false;
        broadcastToTabs({ type: 'SESSION_STOPPED' });
        break;
      }
    } catch (error) {
      // Silent message parsing error
    }
  };

  ws.onclose = () => {
    connectionStatus = 'disconnected';
    broadcastToTabs({ type: 'CONNECTION_STATUS', status: 'disconnected' });

    // Attempt reconnection after 3 seconds
    setTimeout(() => {
      if (connectionStatus === 'disconnected') {
        connectToServer();
      }
    }, 3000);
  };

  ws.onerror = (_error) => {
    broadcastToTabs({ type: 'ERROR', message: 'Connection error' });
  };
}

// Send message to all connected tabs
function broadcastToTabs(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No tabs listening
  });
}

// Handle messages from side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {


  switch (message.type) {
  case 'CONNECT':
    connectToServer();
    sendResponse({ status: 'connecting' });
    break;

  case 'START_RECORDING':
    if (!ws || ws.readyState !== WebSocket.OPEN) {

      sendResponse({ error: 'Not connected to server' });
      return;
    }


    isRecording = true;

    // Start transcription session
    ws.send(JSON.stringify({ type: 'start_session' }));
    sendResponse({ status: 'starting' });
    break;

  case 'AUDIO_CHUNK':
    if (!ws || ws.readyState !== WebSocket.OPEN || !isRecording) {
      return;
    }

    // Forward audio chunk to server
    try {
      ws.send(JSON.stringify({
        type: 'audio_chunk',
        audio: message.audio,
        mimeType: message.mimeType
      }));
    } catch (error) {
      // Silent audio send error
    }
    break;

  case 'STOP_RECORDING':
    if (ws && ws.readyState === WebSocket.OPEN && isRecording) {
      ws.send(JSON.stringify({ type: 'stop_session' }));
      isRecording = false;
    }
    sendResponse({ status: 'stopped' });
    break;

  case 'GET_STATUS':
    sendResponse({
      connectionStatus,
      isRecording,
      sessionId
    });
    break;

  default:
    break;
  }
});

// Handle extension action button click
chrome.action.onClicked.addListener(async(tab) => {
  try {
    // Open side panel for this tab
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    // Silent side panel open error
  }
});

// Initialize connection when service worker starts
connectToServer();

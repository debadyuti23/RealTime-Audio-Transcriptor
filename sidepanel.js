// Side Panel Script for Real-time Transcription


let mediaRecorder = null;
let audioContext = null;
let audioStream = null; // Store the stream reference
let isRecording = false;
let transcriptionContainer = null;
let statusElement = null;
let startButton = null;
let pauseButton = null;
let stopButton = null;
let connectionStatus = 'disconnected';

// Timer functionality
let timerElement = null;
let sessionStartTime = null;
let pausedDuration = 0;
let pauseStartTime = null;
let timerInterval = null;
let isPaused = false;

// Export and transcript management
let transcriptData = [];
let recordingStartTime = null;
let clearButton = null;
let copyButton = null;
let exportButton = null;
let exportMenu = null;

// Initialize UI elements
document.addEventListener('DOMContentLoaded', () => {


  transcriptionContainer = document.getElementById('transcription');
  statusElement = document.getElementById('status');
  startButton = document.getElementById('startBtn');
  pauseButton = document.getElementById('pauseBtn');
  stopButton = document.getElementById('stopBtn');
  timerElement = document.getElementById('sessionTimer');
  clearButton = document.getElementById('clearBtn');
  copyButton = document.getElementById('copyBtn');
  exportButton = document.getElementById('exportBtn');
  exportMenu = document.querySelector('.export-menu');

  if (!transcriptionContainer || !statusElement || !startButton || !pauseButton || !stopButton || !timerElement) {
    console.error('Required UI elements not found');
    return;
  }

  // Set up event listeners
  startButton.addEventListener('click', startRecording);
  pauseButton.addEventListener('click', togglePause);
  stopButton.addEventListener('click', stopRecording);
  clearButton.addEventListener('click', clearTranscript);
  copyButton.addEventListener('click', copyTranscript);
  exportButton.addEventListener('click', toggleExportMenu);

  // Export option listeners
  document.getElementById('exportTxt').addEventListener('click', () => exportTranscript('txt'));
  document.getElementById('exportJson').addEventListener('click', () => exportTranscript('json'));
  document.getElementById('exportCsv').addEventListener('click', () => exportTranscript('csv'));

  // Close export menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!exportButton.contains(e.target) && !exportMenu.contains(e.target)) {
      exportMenu.classList.remove('show');
    }
  });

  // Initial UI state
  updateUI();
  updateStatus('Ready to connect to server');

  // Connect to service worker
  connectToServiceWorker();
});

// Clean up resources when page unloads
window.addEventListener('beforeunload', () => {

  cleanupAudioResources();
});

// Clean up resources when extension is disabled/reloaded
window.addEventListener('unload', () => {

  cleanupAudioResources();
});

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Ctrl+C or Cmd+C to copy transcript
  if ((event.ctrlKey || event.metaKey) && event.key === 'c' && !event.shiftKey) {
    // Only if no text is selected in the page and we have transcript data
    const selection = window.getSelection();
    if (selection.toString().length === 0 && transcriptData.length > 0) {
      event.preventDefault();
      copyTranscript();
    }
  }
});

// Connect to service worker and check status
async function connectToServiceWorker() {
  try {


    // Check initial status
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    connectionStatus = response.connectionStatus;

    if (connectionStatus === 'disconnected') {
      updateStatus('Connecting to server...');
      await chrome.runtime.sendMessage({ type: 'CONNECT' });
    } else {
      updateStatus('Connected to server');
    }

    updateUI();
  } catch (error) {
    console.error('Failed to connect to service worker:', error.message);
    updateStatus('Failed to connect to service worker');
  }
}

// Timer functions
function startTimer() {
  sessionStartTime = Date.now();
  pausedDuration = 0;
  isPaused = false;
  timerElement.classList.remove('paused');

  timerInterval = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

function pauseTimer() {
  if (!isPaused) {
    pauseStartTime = Date.now();
    isPaused = true;
    timerElement.classList.add('paused');
    clearInterval(timerInterval);
  }
}

function resumeTimer() {
  if (isPaused) {
    pausedDuration += Date.now() - pauseStartTime;
    isPaused = false;
    timerElement.classList.remove('paused');
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
  }
}

function stopTimer() {
  clearInterval(timerInterval);
  sessionStartTime = null;
  pausedDuration = 0;
  isPaused = false;
  timerElement.classList.remove('paused');
  timerElement.textContent = '00:00:00';
}

function updateTimerDisplay() {
  if (!sessionStartTime) {
    return;
  }

  let elapsed = Date.now() - sessionStartTime - pausedDuration;
  if (isPaused) {
    elapsed = pauseStartTime - sessionStartTime - pausedDuration;
  }

  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  timerElement.textContent =
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:` +
    `${seconds.toString().padStart(2, '0')}`;
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message) => {


  switch (message.type) {
  case 'CONNECTION_STATUS':
    connectionStatus = message.status;
    updateStatus(message.status === 'connected' ? 'Connected to server' : 'Disconnected from server');
    updateUI();
    break;

  case 'SESSION_STARTED':
    updateStatus('Deepgram session started');
    break;

  case 'SESSION_READY':
    updateStatus('Deepgram ready for audio');
    break;

  case 'TRANSCRIPTION':
    addTranscription(message.text, true, message.confidence);
    break;

  case 'INTERIM_TRANSCRIPTION':
    addTranscription(message.text, false, message.confidence);
    break;

  case 'ERROR':
    updateStatus(`Error: ${message.message}`);
    break;

  case 'STATUS':
    updateStatus(message.message);
    break;

  case 'SESSION_STOPPED':
    isRecording = false;
    isPaused = false;
    stopTimer();
    updateStatus('Recording stopped');
    updateUI();
    break;
  }
});

// Pause/Resume toggle function
function togglePause() {
  if (!isRecording) {
    return;
  }

  if (isPaused) {
    // Resume recording
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
    }
    resumeTimer();
    pauseButton.textContent = 'Pause';
    updateStatus('Recording resumed');
  } else {
    // Pause recording
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
    }
    pauseTimer();
    pauseButton.textContent = 'Resume';
    updateStatus('Recording paused');
  }
}

// Start recording
async function startRecording() {
  if (connectionStatus !== 'connected') {
    updateStatus('Not connected to server');
    return;
  }

  // Ensure clean state before starting
  if (isRecording) {

    await stopRecording();
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Clean up any existing resources
  cleanupAudioResources();

  try {
    console.log('Starting recording');
    updateStatus('Starting recording...');

    // Get tab audio using callback-based API
    const stream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture({
        audio: true,
        video: false
      }, (stream) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(stream);
        }
      });
    });

    if (!stream) {
      throw new Error('Failed to capture tab audio');
    }

    // Store stream reference for cleanup
    audioStream = stream;

    // Set up audio context to prevent muting
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Set up MediaRecorder with compatible format
    let mimeType = 'audio/webm;codecs=opus';

    // Try different formats in order of preference
    const formats = [
      'audio/wav',
      'audio/webm;codecs=pcm',
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg;codecs=opus'
    ];

    for (const format of formats) {
      if (MediaRecorder.isTypeSupported(format)) {
        mimeType = format;

        break;
      }
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.addEventListener('dataavailable', (event) => {


      if (event.data.size > 0 && isRecording) {
        // Convert to base64 and send to service worker
        const reader = new FileReader();
        reader.onload = () => {
          try {
            // Extract base64 data from data URL (removes "data:audio/webm;base64," prefix)
            const dataUrl = reader.result;
            const base64Audio = dataUrl.split(',')[1];

            chrome.runtime.sendMessage({
              type: 'AUDIO_CHUNK',
              audio: base64Audio,
              mimeType: mimeType
            }).then(() => {

            }).catch((error) => {
              console.error('Failed to send audio chunk to SW:', error.message);
            });
          } catch (error) {
            console.error('Error converting audio to base64:', error.message);
          }
        };
        reader.readAsDataURL(event.data); // Use readAsDataURL instead of readAsArrayBuffer
      }
      // Note: Empty audio data is silently skipped
    });

    mediaRecorder.addEventListener('start', () => {
      isRecording = true;
      recordingStartTime = Date.now(); // Set recording start time
      startTimer(); // Start session timer
      updateUI();
      updateStatus('Recording... Listening for speech');
    });

    mediaRecorder.addEventListener('stop', () => {
      isRecording = false;
      isPaused = false;
      stopTimer(); // Stop session timer
      updateUI();

      // Clean up audio resources
      cleanupAudioResources();
    });

    mediaRecorder.addEventListener('error', (event) => {
      console.error('MediaRecorder error:', event.error.message);
      updateStatus(`Recording error: ${event.error.message}`);
      stopRecording();
    });

    // Start recording with service worker
    // Send enhanced start recording with real-time config
    await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      config: {
        realTimeMode: true,
        lowLatency: true
      }
    });

    // Start MediaRecorder (capture audio every 500ms - balanced performance)
    mediaRecorder.start(500);

  } catch (error) {
    console.error('Failed to start recording:', error.message);
    updateStatus(`Failed to start recording: ${error.message}`);
  }
}

// Stop recording
async function stopRecording() {
  try {
    console.log('Stopping recording');

    // Stop MediaRecorder first
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    // Stop recording with service worker
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

    // Clean up audio resources immediately
    cleanupAudioResources();

    updateStatus('Recording stopped');

  } catch (error) {
    console.error('Failed to stop recording:', error.message);
    updateStatus(`Failed to stop recording: ${error.message}`);

    // Ensure cleanup even on error
    cleanupAudioResources();
  }
}

// Clean up all audio resources
function cleanupAudioResources() {


  try {
    // Stop all tracks in the audio stream
    if (audioStream) {
      audioStream.getTracks().forEach(track => {

        track.stop();
      });
      audioStream = null;
    }

    // Close audio context
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().then(() => {

      }).catch(err => {
        console.warn('Error closing AudioContext:', err.message);
      });
      audioContext = null;
    }

    // Reset MediaRecorder
    if (mediaRecorder) {
      mediaRecorder = null;
    }

    // Reset recording state
    isRecording = false;
    updateUI();



  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

// Add transcription to UI
function addTranscription(text, isFinal, confidence = null) {
  if (!transcriptionContainer) {
    return;
  }

  // Remove previous interim result
  if (!isFinal) {
    const existingInterim = transcriptionContainer.querySelector('.interim');
    if (existingInterim) {
      existingInterim.remove();
    }
  }

  const transcriptionElement = document.createElement('div');
  transcriptionElement.className = `transcription-item ${isFinal ? 'final' : 'interim'}`;

  // Calculate relative timestamp from recording start
  const relativeTime = recordingStartTime ?
    formatRelativeTime(Date.now() - recordingStartTime) :
    '00:00';

  const confidenceText = confidence ? ` (${Math.round(confidence * 100)}%)` : '';

  transcriptionElement.innerHTML = `
    <div class="timestamp">${relativeTime}${confidenceText}</div>
    <div class="text">${text}</div>
  `;

  // Store transcript data for export (only final transcriptions)
  if (isFinal) {
    transcriptData.push({
      timestamp: relativeTime,
      absoluteTime: new Date().toISOString(),
      text: text,
      confidence: confidence,
      isFinal: true
    });
    // Update UI to reflect new transcript data
    updateUI();
  }

  transcriptionContainer.appendChild(transcriptionElement);
  transcriptionContainer.scrollTop = transcriptionContainer.scrollHeight;
}

// Format relative time (ms to MM:SS)
function formatRelativeTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Clear transcript
function clearTranscript() {
  if (transcriptionContainer) {
    transcriptionContainer.innerHTML = `
      <div class="empty-state">
        Click "Start Recording" to begin transcribing tab audio
      </div>
    `;
  }
  transcriptData = [];

}

// Copy transcript to clipboard
async function copyTranscript() {
  if (transcriptData.length === 0) {
    updateStatus('No transcript data to copy');
    return;
  }

  try {
    // Create simple text format for clipboard
    const clipboardText = transcriptData.map(item =>
      `[${item.timestamp}] ${item.text}`
    ).join('\n');

    // Use the Clipboard API
    await navigator.clipboard.writeText(clipboardText);

    // Show success feedback
    updateStatus(`Copied ${transcriptData.length} transcript entries to clipboard`);

    // Temporarily update button text
    const originalText = copyButton.textContent;
    copyButton.textContent = '✅ Copied!';
    copyButton.disabled = true;

    setTimeout(() => {
      copyButton.textContent = originalText;
      copyButton.disabled = false;
    }, 2000);



  } catch (error) {
    console.error('Failed to copy transcript:', error.message);

    // Fallback for older browsers or if clipboard API fails
    try {
      const clipboardText = transcriptData.map(item =>
        `[${item.timestamp}] ${item.text}`
      ).join('\n');

      const textArea = document.createElement('textarea');
      textArea.value = clipboardText;
      document.body.appendChild(textArea);
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        updateStatus('Transcript copied to clipboard (fallback method)');
      } else {
        updateStatus('Failed to copy transcript to clipboard');
      }
    } catch (fallbackError) {
      console.error('Fallback copy also failed:', fallbackError.message);
      updateStatus('Copy to clipboard not supported in this browser');
    }
  }
}

// Toggle export menu
function toggleExportMenu() {
  if (exportMenu) {
    exportMenu.classList.toggle('show');
  }
}

// Export transcript in different formats
function exportTranscript(format) {
  if (transcriptData.length === 0) {
    updateStatus('No transcript data to export');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let content = '';
  let filename = '';
  let mimeType = '';

  switch (format) {
  case 'txt':
    content = transcriptData.map(item =>
      `[${item.timestamp}] ${item.text}`
    ).join('\n');
    filename = `deepgram-transcript-${timestamp}.txt`;
    mimeType = 'text/plain';
    break;

  case 'json':
    content = JSON.stringify({
      metadata: {
        exportedAt: new Date().toISOString(),
        totalEntries: transcriptData.length,
        recordingStartTime: recordingStartTime ? new Date(recordingStartTime).toISOString() : null,
        source: 'Deepgram Real-time Transcription'
      },
      transcripts: transcriptData
    }, null, 2);
    filename = `deepgram-transcript-${timestamp}.json`;
    mimeType = 'application/json';
    break;

  case 'csv': {
    const csvHeader = 'Timestamp,Absolute Time,Text,Confidence\n';
    const csvRows = transcriptData.map(item =>
      `"${item.timestamp}","${item.absoluteTime}","${item.text.replace(/"/g, '""')}","${item.confidence || ''}"`
    ).join('\n');
    content = csvHeader + csvRows;
    filename = `deepgram-transcript-${timestamp}.csv`;
    mimeType = 'text/csv';
    break;
  }
  }

  // Create and download file
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  updateStatus(`Exported ${transcriptData.length} entries as ${format.toUpperCase()}`);
  exportMenu.classList.remove('show');


}

// Update status display
function updateStatus(message) {
  if (statusElement) {
    statusElement.textContent = message;

  }
}

// Update UI based on current state
function updateUI() {
  if (!startButton || !pauseButton || !stopButton || !clearButton || !copyButton || !exportButton) {
    return;
  }

  const canStart = connectionStatus === 'connected' && !isRecording;
  const canPause = isRecording;
  const canStop = isRecording;
  const hasTranscript = transcriptData.length > 0;

  startButton.disabled = !canStart;
  pauseButton.disabled = !canPause;
  stopButton.disabled = !canStop;
  clearButton.disabled = !hasTranscript;
  copyButton.disabled = !hasTranscript;
  exportButton.disabled = !hasTranscript;

  startButton.textContent = canStart ? 'Start Recording' : 'Not Ready';
  pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
  stopButton.textContent = 'Stop Recording';
  copyButton.textContent = hasTranscript ? `Copy (${transcriptData.length})` : 'Copy';
  exportButton.textContent = hasTranscript ? `Export (${transcriptData.length})` : 'Export';
}

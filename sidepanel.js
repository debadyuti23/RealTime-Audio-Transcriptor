// Sidepanel (frontend): capture active tab audio using MediaRecorder, send audio chunks to SW.
const $ = (id) => document.getElementById(id);
let port, mediaRecorder, mediaStream, chunks = [], startedAt, tick;

function connectPort() {
  if (port) return;
  port = chrome.runtime.connect({ name: "panel" });
  port.onMessage.addListener((msg) => {
    if (msg.type === "status") $("status").textContent = msg.text;
    if (msg.type === "transcript") appendLine((msg.isFinal ? "⏹ " : "◀ ") + msg.text);
    if (msg.type === "error") $("status").textContent = "error: " + msg.text;
  });
}

function appendLine(t) {
  $("log").textContent += ($("log").textContent ? "\n" : "") + t;
  $("log").scrollTop = $("log").scrollHeight;
}

function startTimer() {
  startedAt = Date.now();
  tick = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    $("timer").textContent = `${mm}:${ss}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(tick);
  $("timer").textContent = "00:00";
}

$("start").onclick = () => {
  connectPort();
  chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
    if (!stream) { 
      $("status").textContent = "tabCapture failed"; 
      return; 
    }

    mediaStream = stream;
    chunks = [];

    // Simple MediaRecorder setup
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 16000
    });

    // Collect audio chunks every 3 seconds
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        
        // Send chunk to service worker
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          port.postMessage({ 
            type: "AUDIO_CHUNK", 
            data: reader.result // base64 audio data
          });
        };
        reader.readAsDataURL(blob);
        
        chunks = []; // Clear processed chunks
      }
    };

    mediaRecorder.onerror = (event) => {
      $("status").textContent = "Recording error: " + event.error;
    };

    // Start recording with 3-second chunks
    mediaRecorder.start(3000);
    port.postMessage({ type: "START" });
    
    $("start").disabled = true;
    $("stop").disabled = false;
    $("status").textContent = "recording...";
    startTimer();
  });
};

$("stop").onclick = () => {
  $("stop").disabled = true;
  $("start").disabled = false;
  port?.postMessage({ type: "STOP" });

  try { mediaRecorder?.stop(); } catch {}
  try { mediaStream?.getTracks().forEach(t => t.stop()); } catch {}

  stopTimer();
  $("status").textContent = "stopped";
};

$("copy").onclick = async () => {
  await navigator.clipboard.writeText($("log").textContent || "");
  $("status").textContent = "copied";
};

$("clear").onclick = () => { 
  $("log").textContent = ""; 
};
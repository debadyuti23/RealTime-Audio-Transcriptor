// Service worker (backend): opens WS to Node bridge, forwards PCM frames, relays transcripts.
let ports = new Set();
let ws = null;
let isOpen = false;

const WS_URL = "ws://localhost:3000"; // your Node server

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel") return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));

  port.onMessage.addListener((msg) => {
    if (msg.type === "START") openWS();
    if (msg.type === "AUDIO_CHUNK") forwardAudioChunk(msg.data);
    if (msg.type === "STOP") closeWS();
  });
});

function broadcast(m) { 
  ports.forEach(p => p.postMessage(m)); 
}

function openWS() {
  if (ws && isOpen) return;
  ws = new WebSocket(WS_URL);
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { 
    isOpen = true; 
    ws.send(JSON.stringify({ type: "start" })); 
    broadcast({ type: "status", text: "connected" }); 
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "transcript") {
        broadcast({ type: "transcript", text: msg.text, isFinal: !!msg.isFinal });
      } else if (msg.type === "status") {
        broadcast({ type: "status", text: msg.message || "status" });
      } else if (msg.type === "error") {
        broadcast({ type: "error", text: msg.error });
      }
    } catch { /* ignore */ }
  };
  ws.onerror = () => broadcast({ type: "status", text: "ws error" });
  ws.onclose = () => { 
    isOpen = false; 
    broadcast({ type: "status", text: "disconnected" }); 
  };
}

function forwardAudioChunk(audioData) {
  if (!ws || ws.readyState !== 1) return;
  
  try {
    // Extract base64 audio data and convert to ArrayBuffer
    const base64Audio = audioData.split(',')[1];
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Send as binary data to WebSocket
    ws.send(bytes.buffer);
  } catch (error) {
    console.error('Error forwarding audio chunk:', error);
    broadcast({ type: "error", text: "Audio processing error" });
  }
}

function closeWS() {
  try { ws?.send(JSON.stringify({ type: "stop" })); } catch {}
  try { ws?.send(JSON.stringify({ type: "end" })); } catch {}
  try { ws?.close(); } catch {}
  ws = null;
  isOpen = false;
}
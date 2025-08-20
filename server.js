/**
 * Node WebSocket bridge to Gemini Live API (@google/genai)
 * - Receives binary PCM Int16 (16 kHz) frames from the extension
 * - Streams them into a Live session
 * - Emits transcript messages back to the client
 */
import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const MODEL = 'gemini-live-2.5-flash-preview'; // AI Studio live model

const wss = new WebSocketServer({ port: PORT });
console.log(`Gemini Live WS bridge on ws://localhost:${PORT}`);

wss.on('connection', async (socket) => {
  let session = null;
  let closed = false;

  const send = (obj) => { if (!closed) try { socket.send(JSON.stringify(obj)); } catch {} };

  const start = async () => {
    if (session) return;
    session = await ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.TEXT],
        inputAudioTranscription: {},
      },
      callbacks: {
        onopen()  { send({ type: 'status', message: 'live-session-open' }); },
        onclose() { send({ type: 'status', message: 'live-session-closed' }); },
        onerror(e){ send({ type: 'error',  error: e?.message || String(e) }); },
        onmessage(m){
          const t = m?.serverContent?.inputTranscription?.text || m?.text;
          if (typeof t === 'string' && t.length) {
            const isFinal = !!(m?.serverContent?.generationComplete || m?.serverContent?.turnComplete);
            send({ type: 'transcript', text: t, isFinal });
          }
        }
      }
    });
  };

  socket.on('message', async (data, isBinary) => {
    try {
      if (!isBinary) {
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'start') await start();
        else if (msg.type === 'stop') {
          if (session) session.sendRealtimeInput({ audioStreamEnd: true });
        } else if (msg.type === 'end') {
          try { await session?.close(); } catch {}
          session = null;
          socket.close();
        }
        return;
      }
      // Binary audio: forward as base64 PCM 16k
      if (!session) await start();
      const base64 = Buffer.from(data).toString('base64');
      session.sendRealtimeInput({
        audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
      });
    } catch (e) {
      send({ type: 'error', error: e?.message || String(e) });
    }
  });

  socket.on('close', () => {
    closed = true;
    try { session?.close(); } catch {}
    session = null;
  });
});
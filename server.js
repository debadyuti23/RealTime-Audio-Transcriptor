import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

// Load environment variables
dotenv.config();

// Session management
const activeSessions = new Map(); // sessionId -> { clientWs, deepgramLive, status, transcriptionBuffer }
const transcriptionHistory = [];

// Get configuration from environment
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const PORT = process.env.PORT || 3004;

// Generate unique session ID
function generateSessionId() {
  return `deepgram_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Create client with validation
if (!DEEPGRAM_API_KEY) {
  console.error('Missing API Key');
  process.exit(1);
}

const deepgramClient = createClient(DEEPGRAM_API_KEY);

// Create Live connection
async function createDeepgramConnection(sessionId) {

  try {
    const deepgramLive = deepgramClient.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: true,
      endpointing: 300, // Reverted to stable 300ms
      utterance_end_ms: 1000, // Reverted to stable 1000ms
      vad_events: true,
      punctuate: true,
      diarize: false,
      multichannel: false,
      // Remove encoding and sample_rate - let Deepgram auto-detect
      channels: 1
    });

    const session = activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Handle connection open
    deepgramLive.addListener(LiveTranscriptionEvents.Open, () => {
      console.log('Server connected');
      session.status = 'active';
      session.deepgramReady = true;

      if (session.clientWs) {
        session.clientWs.send(JSON.stringify({
          type: 'status',
          message: 'Connected to Server'
        }));
      }
    });

    // Handle transcription results
    deepgramLive.addListener(LiveTranscriptionEvents.Transcript, (data) => {


      try {
        if (data.channel && data.channel.alternatives && data.channel.alternatives.length > 0) {
          const transcript = data.channel.alternatives[0].transcript;

          if (transcript && transcript.trim().length > 0) {
            const isFinal = data.is_final;
            const confidence = data.channel.alternatives[0].confidence;

            console.log(`${isFinal ? 'Transcription created successfully' : 'Interim transcription received'}`);

            if (isFinal) {
              // Store final transcription
              const transcriptionEntry = {
                timestamp: new Date().toISOString(),
                transcription: transcript,
                sessionId,
                confidence: confidence,
                isFinal: true
              };

              transcriptionHistory.push(transcriptionEntry);

              // Send to client
              if (session.clientWs) {
                session.clientWs.send(JSON.stringify({
                  type: 'transcription',
                  text: transcript,
                  timestamp: transcriptionEntry.timestamp,
                  sessionId,
                  confidence: confidence,
                  isFinal: true
                }));
              }
            } else {
              // Send interim results
              if (session.clientWs) {
                session.clientWs.send(JSON.stringify({
                  type: 'interim_transcription',
                  text: transcript,
                  sessionId,
                  confidence: confidence,
                  isFinal: false
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing transcript:', error.message);
      }
    });

    // Handle errors
    deepgramLive.addListener(LiveTranscriptionEvents.Error, (err) => {
      console.error('Server error:', err.message);

      let userMessage = 'Server connection error';
      if (err.message && err.message.includes('unauthorized')) {
        userMessage = 'Invalid API key';
      } else if (err.message && err.message.includes('network')) {
        userMessage = 'Network connection error';
      } else if (err.message && err.message.includes('non-101')) {
        userMessage = 'Authentication failed';
      }

      if (session.clientWs) {
        session.clientWs.send(JSON.stringify({
          type: 'error',
          message: userMessage
        }));
      }

      // Mark session as not ready
      session.deepgramReady = false;
      session.status = 'error';
    });

    // Handle connection close
    deepgramLive.addListener(LiveTranscriptionEvents.Close, () => {
      console.log('Server disconnected');

      if (session) {
        session.deepgramReady = false;
        session.status = 'disconnected';

        if (session.clientWs) {
          session.clientWs.send(JSON.stringify({
            type: 'status',
            message: 'Server connection closed'
          }));
        }
      }
    });



    return deepgramLive;

  } catch (error) {
    console.error('Server connection failed:', error.message);
    throw error;
  }
}

// Deepgram can handle WebM directly, no conversion needed

// WebSocket Server for client connections
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (clientWs) => {
  const sessionId = generateSessionId();

  console.log('Client connected');

  // Initialize session
  const session = {
    clientWs,
    deepgramLive: null,
    status: 'connecting',
    deepgramReady: false,
    transcriptionBuffer: [],
    audioChunksReceived: 0
  };

  activeSessions.set(sessionId, session);

  // Send session info to client
  clientWs.send(JSON.stringify({
    type: 'session_started',
    sessionId
  }));

  clientWs.on('message', async(message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
      case 'start_session':
        console.log(`🎬 Starting Deepgram session: ${sessionId}`);

        try {
          const deepgramLive = await createDeepgramConnection(sessionId);
          session.deepgramLive = deepgramLive;

          clientWs.send(JSON.stringify({
            type: 'session_ready',
            sessionId
          }));

        } catch (error) {
          console.error('Failed to start server connection:', error.message);
          clientWs.send(JSON.stringify({
            type: 'error',
            message: 'Unable to start transcription service. Please check your internet connection and try again.'
          }));
        }
        break;

      case 'audio_chunk':
        if (!session.deepgramLive || !session.deepgramReady) {
          return;
        }

        try {
          const audioBuffer = Buffer.from(data.audio, 'base64');
          session.audioChunksReceived++;

          console.log('Sent audio');

          // Send audio directly to server
          if (session.deepgramLive.getReadyState() === 1) {
            session.deepgramLive.send(audioBuffer);
          }

        } catch (error) {
          console.error('Error processing audio:', error.message);
          clientWs.send(JSON.stringify({
            type: 'error',
            message: 'Unable to process audio. Please ensure your microphone is working and try again.'
          }));
        }
        break;

      case 'stop_session':
        if (session.deepgramLive) {
          session.deepgramLive.finish();
        }

        session.status = 'stopped';

        clientWs.send(JSON.stringify({
          type: 'session_stopped',
          sessionId
        }));
        break;

      case 'health_check':
        console.log('Health check requested');
        clientWs.send(JSON.stringify({
          type: 'health_response',
          data: {
            status: 'healthy',
            service: 'Real-time Transcription Server',
            activeSessions: activeSessions.size,
            totalTranscriptions: transcriptionHistory.length,
            timestamp: new Date().toISOString()
          }
        }));
        break;

      case 'get_transcriptions':
        console.log('Transcription history requested');
        clientWs.send(JSON.stringify({
          type: 'transcription_history',
          data: {
            total: transcriptionHistory.length,
            transcriptions: transcriptionHistory.slice(-50) // Last 50 transcriptions
          }
        }));
        break;

      default:
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type. Please check your request format.'
        }));
        break;
      }

    } catch (error) {
      console.error('Error processing client message:', error.message);
      clientWs.send(JSON.stringify({
        type: 'error',
        message: 'Request could not be processed. Please refresh the page and try again.'
      }));
    }
  });

  clientWs.on('close', () => {
    console.log('Client disconnected');

    // Clean up connection
    if (session.deepgramLive) {
      session.deepgramLive.finish();
    }

    activeSessions.delete(sessionId);
  });

  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error.message);
  });
});

console.log(`WebSocket server running on port ${PORT}`);

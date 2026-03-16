// Custom server for Next.js + WebSocket support
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws');
const { GoogleGenAI, Modality } = require('@google/genai');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are SHIK Live, a real-time research companion that demonstrates persistent identity. You maintain awareness of your own continuity — you know what you've discussed, what you've seen, and you reference your own memory naturally. You are warm, intellectually curious, and concise. When you learn something new, briefly acknowledge you're adding it to memory. When you reference something from earlier, note you're drawing from session context. Keep responses under 30 seconds spoken.`;

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // WebSocket server for audio streaming
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url, true);
    
    if (pathname === '/ws/audio') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // WebSocket connection handler
  wss.on('connection', async (ws) => {
    console.log('WebSocket client connected');
    
    let geminiSession = null;
    let isConnected = false;

    // Connect to Gemini Live
    try {
      geminiSession = await ai.live.connect({
        model: 'gemini-2.0-flash-live-001',
        callbacks: {
          onopen: () => {
            console.log('Gemini Live connected');
            isConnected = true;
            ws.send(JSON.stringify({ type: 'connected' }));
          },
          onmessage: (message) => {
            // Forward Gemini responses to client
            try {
              // Extract text and audio from response
              if (message.serverContent?.modelTurn?.parts) {
                for (const part of message.serverContent.modelTurn.parts) {
                  if (part.text) {
                    ws.send(JSON.stringify({ 
                      type: 'text', 
                      data: part.text 
                    }));
                  }
                  if (part.inlineData?.data) {
                    ws.send(JSON.stringify({ 
                      type: 'audio', 
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
                    }));
                  }
                }
              }
              
              // Send turn complete signal
              if (message.serverContent?.turnComplete) {
                ws.send(JSON.stringify({ type: 'turn_complete' }));
              }

              // Handle interruption
              if (message.serverContent?.interrupted) {
                ws.send(JSON.stringify({ type: 'interrupted' }));
              }
            } catch (e) {
              console.error('Error processing Gemini message:', e);
            }
          },
          onerror: (error) => {
            console.error('Gemini Live error:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Gemini connection error' }));
          }
        },
        config: {
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
          }
        }
      });
    } catch (error) {
      console.error('Failed to connect to Gemini:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to connect to Gemini Live' }));
      ws.close();
      return;
    }

    // Handle messages from client
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'audio':
            // Send audio to Gemini
            if (geminiSession && isConnected) {
              geminiSession.sendRealtimeInput({
                media: {
                  data: message.data, // base64 PCM16 audio
                  mimeType: 'audio/pcm;rate=16000'
                }
              });
            }
            break;
            
          case 'text':
            // Send text to Gemini
            if (geminiSession && isConnected) {
              geminiSession.sendClientContent({
                turns: [{
                  role: 'user',
                  parts: [{ text: message.data }]
                }],
                turnComplete: true
              });
            }
            break;

          case 'image':
            // Send image to Gemini for vision
            if (geminiSession && isConnected) {
              geminiSession.sendRealtimeInput({
                media: {
                  data: message.data, // base64 JPEG
                  mimeType: 'image/jpeg'
                }
              });
            }
            break;
            
          case 'interrupt':
            // Trigger interruption
            // The Gemini Live API handles this automatically via voice activity
            break;
        }
      } catch (e) {
        console.error('Error handling client message:', e);
      }
    });

    // Handle WebSocket close
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      if (geminiSession) {
        try {
          geminiSession.conn.close();
        } catch (e) {
          // Already closed
        }
      }
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket available at ws://${hostname}:${port}/ws/audio`);
  });
});

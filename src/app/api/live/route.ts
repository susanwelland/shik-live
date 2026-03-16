import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Modality, Session } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Store active sessions (in production, use Redis)
const sessions = new Map<string, { session: Session; messages: any[] }>();

const SYSTEM_INSTRUCTION = `You are SHIK Live, a real-time research companion that demonstrates persistent identity. You maintain awareness of your own continuity — you know what you've discussed, what you've seen, and you reference your own memory naturally. You are warm, intellectually curious, and concise. When you learn something new, briefly acknowledge you're adding it to memory. When you reference something from earlier, note you're drawing from session context. Keep responses under 30 seconds spoken.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, audioData, textInput } = body;

    switch (action) {
      case 'connect': {
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const messageQueue: any[] = [];
        
        const session = await ai.live.connect({
          model: 'gemini-2.0-flash-live-001',
          callbacks: {
            onopen: () => {
              console.log(`Session ${newSessionId} connected`);
            },
            onmessage: (message) => {
              messageQueue.push(message);
            },
            onerror: (error) => {
              console.error(`Session ${newSessionId} error:`, error);
            }
          },
          config: {
            responseModalities: [Modality.AUDIO, Modality.TEXT],
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }]
            }
          }
        });

        sessions.set(newSessionId, { session, messages: messageQueue });

        return NextResponse.json({ 
          success: true, 
          sessionId: newSessionId,
          message: 'Gemini Live session connected'
        });
      }

      case 'send_text': {
        const sessionData = sessions.get(sessionId);
        if (!sessionData) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Clear message queue before sending
        sessionData.messages.length = 0;

        // Send text input
        sessionData.session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: textInput }]
          }],
          turnComplete: true
        });

        // Wait for response (poll message queue)
        const startTime = Date.now();
        const timeout = 30000; // 30 second timeout
        
        while (Date.now() - startTime < timeout) {
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Check for complete response
          const messages = sessionData.messages;
          const hasComplete = messages.some((m: any) => 
            m.serverContent?.turnComplete || m.toolCall
          );
          
          if (hasComplete) {
            break;
          }
        }

        // Extract response content
        const responseMessages = [...sessionData.messages];
        sessionData.messages.length = 0;

        let textResponse = '';
        let audioResponse: string | null = null;

        for (const msg of responseMessages) {
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.text) {
                textResponse += part.text;
              }
              if (part.inlineData?.data) {
                audioResponse = part.inlineData.data;
              }
            }
          }
        }

        return NextResponse.json({ 
          success: true,
          text: textResponse,
          audio: audioResponse,
          rawMessages: responseMessages
        });
      }

      case 'send_audio': {
        const sessionData = sessions.get(sessionId);
        if (!sessionData) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Clear message queue
        sessionData.messages.length = 0;

        // Send audio data
        sessionData.session.sendRealtimeInput({
          media: {
            data: audioData,
            mimeType: 'audio/pcm;rate=16000'
          }
        });

        // Wait briefly for VAD to trigger response
        await new Promise(resolve => setTimeout(resolve, 2000));

        const responseMessages = [...sessionData.messages];
        
        let textResponse = '';
        let audioResponse: string | null = null;

        for (const msg of responseMessages) {
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.text) {
                textResponse += part.text;
              }
              if (part.inlineData?.data) {
                audioResponse = part.inlineData.data;
              }
            }
          }
        }

        return NextResponse.json({ 
          success: true,
          text: textResponse,
          audio: audioResponse
        });
      }

      case 'poll': {
        const sessionData = sessions.get(sessionId);
        if (!sessionData) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const messages = [...sessionData.messages];
        sessionData.messages.length = 0;

        return NextResponse.json({ 
          success: true,
          messages
        });
      }

      case 'disconnect': {
        const sessionData = sessions.get(sessionId);
        if (sessionData) {
          sessionData.session.conn.close();
          sessions.delete(sessionId);
        }
        return NextResponse.json({ success: true, message: 'Session disconnected' });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Gemini Live API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: String(error) },
      { status: 500 }
    );
  }
}

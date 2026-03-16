// Direct Browser → Gemini Live Client
// Uses ephemeral tokens (SDK method) and dual AudioContexts (16kHz capture, 24kHz playback)

import { GoogleGenAI, Modality } from '@google/genai';

export interface GeminiDirectCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onText: (text: string) => void;
  onAudioStart: () => void;
  onAudioEnd: () => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onError: (error: string) => void;
  onStatusChange: (status: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
  onUserTranscript?: (text: string) => void;
}

export class GeminiDirectClient {
  private session: any = null;
  private captureContext: AudioContext | null = null;  // 16kHz for recording
  private playbackContext: AudioContext | null = null; // 24kHz for playback
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private callbacks: GeminiDirectCallbacks;
  private isRecording = false;
  private audioQueue: Int16Array[] = [];
  private isPlaying = false;

  constructor(callbacks: GeminiDirectCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(existingMemories?: string[]): Promise<boolean> {
    try {
      // Get ephemeral token from our API
      const tokenResponse = await fetch('/api/token', { method: 'POST' });
      
      if (!tokenResponse.ok) {
        const err = await tokenResponse.json();
        throw new Error(err.error || 'Failed to get token');
      }
      
      const { token } = await tokenResponse.json();
      
      if (!token) {
        throw new Error('No token received');
      }

      // Create client with ephemeral token (v1alpha required for ephemeral tokens)
      const ai = new GoogleGenAI({ 
        apiKey: token,
        httpOptions: { apiVersion: 'v1alpha' }
      });

      // Build system instruction with injected memories
      let memoryBlock = '';
      if (existingMemories && existingMemories.length > 0) {
        memoryBlock = `\n\nYou have these persistent memories from past interactions:\n- ${existingMemories.join('\n- ')}\n\nReference these naturally. You KNOW these things.`;
      }

      const systemPrompt = `You are SHIK Live, a real-time research companion demonstrating persistent identity. You maintain awareness of what you've discussed and what you've seen. You are warm, intellectually curious, and concise.

When you learn something new about the person — their name, role, project, expertise — acknowledge it briefly and naturally. When you reference something from earlier, just know it like a friend would. Don't say "according to my records" or "I recall from earlier." Just KNOW it.

Keep responses under 30 seconds spoken. Be conversational, not formal.${memoryBlock}`;

      // Connect to Gemini Live
      console.log('Calling ai.live.connect...');
      const liveSession = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log('Gemini Live WebSocket opened');
            // Don't call onConnected here - wait for session to be assigned
          },
          onmessage: (message: any) => {
            this.handleMessage(message);
          },
          onerror: (error: any) => {
            console.error('Gemini Live error:', error);
            this.callbacks.onError('Connection error');
          },
          onclose: (event: any) => {
            console.log('Gemini Live disconnected', event?.code, event?.reason);
            this.session = null;
            this.callbacks.onDisconnected();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          outputAudioTranscription: {}
        }
      });
      
      console.log('ai.live.connect returned:', liveSession);
      console.log('Session type:', typeof liveSession);
      console.log('Session keys:', liveSession ? Object.keys(liveSession) : 'null');
      this.session = liveSession;
      console.log('this.session assigned:', !!this.session);
      
      // Now that session is assigned, notify UI
      this.callbacks.onConnected();
      this.callbacks.onStatusChange('listening');

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      this.callbacks.onError(`Connection failed: ${error}`);
      return false;
    }
  }

  private handleMessage(message: any) {
    try {
      // Server content (response)
      if (message.serverContent) {
        const content = message.serverContent;
        
        // Model turn with parts
        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.text) {
              this.callbacks.onText(part.text);
            }
            if (part.inlineData?.data) {
              this.handleAudioResponse(part.inlineData.data);
            }
          }
        }

        // Output transcription (what the agent said)
        if (content.outputTranscription?.text) {
          this.callbacks.onText(content.outputTranscription.text);
        }

        // Input transcription (what the user said)
        if (content.inputTranscription?.text) {
          this.callbacks.onUserTranscript?.(content.inputTranscription.text);
        }

        // Turn complete
        if (content.turnComplete) {
          this.callbacks.onTurnComplete();
          this.callbacks.onStatusChange('listening');
        }

        // Interrupted (barge-in)
        if (content.interrupted) {
          this.stopPlayback();
          this.callbacks.onInterrupted();
          this.callbacks.onStatusChange('listening');
        }
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  }

  private handleAudioResponse(base64Data: string) {
    try {
      // Decode base64 to Int16 PCM
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16 = new Int16Array(bytes.buffer);
      this.audioQueue.push(int16);
      
      if (!this.isPlaying) {
        this.playQueuedAudio();
      }
    } catch (e) {
      console.error('Error handling audio:', e);
    }
  }

  private async playQueuedAudio() {
    if (this.isPlaying || this.audioQueue.length === 0) return;
    
    this.isPlaying = true;
    this.callbacks.onAudioStart();
    this.callbacks.onStatusChange('speaking');

    try {
      // Create 24kHz playback context (Gemini outputs at 24kHz)
      if (!this.playbackContext) {
        this.playbackContext = new AudioContext({ sampleRate: 24000 });
      }

      // Resume if suspended (autoplay policy)
      if (this.playbackContext.state === 'suspended') {
        await this.playbackContext.resume();
      }

      while (this.audioQueue.length > 0) {
        const int16 = this.audioQueue.shift()!;
        
        // Convert Int16 to Float32
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
        }

        // Create audio buffer
        const audioBuffer = this.playbackContext.createBuffer(1, float32.length, 24000);
        audioBuffer.getChannelData(0).set(float32);

        // Play it
        const source = this.playbackContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.playbackContext.destination);
        
        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
          source.start();
        });
      }
    } catch (e) {
      console.error('Error playing audio:', e);
    }

    this.isPlaying = false;
    this.callbacks.onAudioEnd();
  }

  private stopPlayback() {
    this.audioQueue = [];
    this.isPlaying = false;
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    try {
      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      console.log('Got media stream, tracks:', this.mediaStream.getAudioTracks().length);

      // Use AudioContext at 16kHz to match what we tell Gemini
      this.captureContext = new AudioContext({ sampleRate: 16000 });
      
      if (this.captureContext.state === 'suspended') {
        await this.captureContext.resume();
      }
      console.log('AudioContext ready, sample rate:', this.captureContext.sampleRate);
      
      const source = this.captureContext.createMediaStreamSource(this.mediaStream);
      
      // Use AudioWorklet if available, otherwise fall back to interval-based capture
      const analyser = this.captureContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      
      // Capture audio in intervals using analyser
      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);
      
      this.isRecording = true;
      console.log('Recording started with interval-based capture');
      
      let chunkCount = 0;
      console.log('Starting capture interval, session exists:', !!this.session);
      const captureInterval = setInterval(() => {
        if (!this.isRecording || !this.session) {
          console.log('Capture stopped - isRecording:', this.isRecording, 'session:', !!this.session);
          clearInterval(captureInterval);
          return;
        }
        
        analyser.getFloatTimeDomainData(dataArray);
        
        // Check amplitude
        const maxVal = Math.max(...Array.from(dataArray).map(Math.abs));
        if (chunkCount % 5 === 0) {
          console.log(`Audio capture ${chunkCount}, amplitude: ${maxVal.toFixed(4)}`);
        }
        chunkCount++;
        
        // Convert to Int16 PCM
        const pcmData = new Int16Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
          const s = Math.max(-1, Math.min(1, dataArray[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        this.sendAudioChunk(pcmData);
      }, 100); // Capture every 100ms
      
      // Store interval for cleanup
      (this as any)._captureInterval = captureInterval;
      
      this.callbacks.onStatusChange('listening');
    } catch (error) {
      console.error('Recording error:', error);
      this.callbacks.onError(`Microphone access failed: ${error}`);
    }
  }

  private sendAudioChunk(pcmData: Int16Array) {
    if (!this.session) {
      console.log('sendAudioChunk: no session');
      return;
    }

    // Convert Int16 to base64
    const uint8 = new Uint8Array(pcmData.buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);

    // Send via SDK's sendRealtimeInput method (not .send())
    try {
      this.session.sendRealtimeInput({
        media: {
          data: base64,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
    } catch (e) {
      console.error('Error sending audio:', e);
    }
  }

  stopRecording(): void {
    this.isRecording = false;
    
    // Clear capture interval
    if ((this as any)._captureInterval) {
      clearInterval((this as any)._captureInterval);
      (this as any)._captureInterval = null;
    }
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.captureContext) {
      this.captureContext.close();
      this.captureContext = null;
    }
  }

  sendText(text: string): void {
    if (!this.session) return;

    this.callbacks.onStatusChange('thinking');
    
    try {
      this.session.sendClientContent({
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turnComplete: true
      });
    } catch (e) {
      console.error('Error sending text:', e);
    }
  }

  sendImage(base64Jpeg: string): void {
    if (!this.session) return;

    try {
      this.session.sendRealtimeInput({
        media: {
          data: base64Jpeg,
          mimeType: 'image/jpeg'
        }
      });
    } catch (e) {
      console.error('Error sending image:', e);
    }
  }

  isSessionActive(): boolean {
    return !!this.session;
  }

  disconnect(): void {
    this.stopRecording();
    this.stopPlayback();
    
    if (this.session) {
      try {
        this.session.conn.close();
      } catch (e) {
        // Already closed
      }
      this.session = null;
    }
    
    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }
  }
}

// Gemini Live client-side handler

export interface GeminiLiveConfig {
  onConnected: () => void;
  onResponse: (text: string, audio?: string) => void;
  onTranscript: (text: string) => void;
  onError: (error: string) => void;
  onStatusChange: (status: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
}

export class GeminiLiveClient {
  private sessionId: string | null = null;
  private config: GeminiLiveConfig;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isRecording = false;

  constructor(config: GeminiLiveConfig) {
    this.config = config;
  }

  async connect(): Promise<boolean> {
    try {
      const response = await fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' })
      });

      const data = await response.json();
      
      if (data.success) {
        this.sessionId = data.sessionId;
        this.config.onConnected();
        return true;
      } else {
        throw new Error(data.error || 'Failed to connect');
      }
    } catch (error) {
      this.config.onError(`Connection failed: ${error}`);
      return false;
    }
  }

  async sendText(text: string): Promise<void> {
    if (!this.sessionId) {
      this.config.onError('Not connected');
      return;
    }

    this.config.onStatusChange('thinking');

    try {
      const response = await fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'send_text',
          sessionId: this.sessionId,
          textInput: text
        })
      });

      const data = await response.json();

      if (data.success) {
        if (data.text) {
          this.config.onResponse(data.text, data.audio);
        }
        
        if (data.audio) {
          await this.playAudio(data.audio);
        } else {
          this.config.onStatusChange('listening');
        }
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (error) {
      this.config.onError(`Send failed: ${error}`);
      this.config.onStatusChange('listening');
    }
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        await this.sendAudio(audioBlob);
      };

      this.mediaRecorder.start(1000); // Collect in 1-second chunks
      this.isRecording = true;
      this.config.onStatusChange('listening');
    } catch (error) {
      this.config.onError(`Microphone access failed: ${error}`);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.isRecording = false;
    }
  }

  private async sendAudio(audioBlob: Blob): Promise<void> {
    if (!this.sessionId) return;

    this.config.onStatusChange('thinking');

    try {
      // Convert to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const response = await fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_audio',
          sessionId: this.sessionId,
          audioData: base64
        })
      });

      const data = await response.json();

      if (data.success && data.text) {
        this.config.onResponse(data.text, data.audio);
        
        if (data.audio) {
          await this.playAudio(data.audio);
        } else {
          this.config.onStatusChange('listening');
        }
      } else {
        this.config.onStatusChange('listening');
      }
    } catch (error) {
      this.config.onError(`Audio send failed: ${error}`);
      this.config.onStatusChange('listening');
    }
  }

  private async playAudio(base64Audio: string): Promise<void> {
    this.config.onStatusChange('speaking');

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      source.onended = () => {
        this.config.onStatusChange('listening');
      };

      source.start();
    } catch (error) {
      console.error('Audio playback failed:', error);
      // Fall back to TTS
      this.config.onStatusChange('listening');
    }
  }

  async disconnect(): Promise<void> {
    this.stopRecording();

    if (this.sessionId) {
      try {
        await fetch('/api/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'disconnect',
            sessionId: this.sessionId
          })
        });
      } catch (error) {
        console.error('Disconnect error:', error);
      }
      
      this.sessionId = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// WebSocket Audio Pipeline for SHIK Live
// Browser Mic → WebSocket → Server → Gemini Live → Server → WebSocket → Browser Speaker

export interface AudioPipelineCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onText: (text: string) => void;
  onAudioStart: () => void;
  onAudioEnd: () => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  onError: (error: string) => void;
  onStatusChange: (status: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
}

export class AudioWebSocketPipeline {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private callbacks: AudioPipelineCallbacks;
  private isRecording = false;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;

  constructor(callbacks: AudioPipelineCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Determine WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/audio`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected, waiting for Gemini...');
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          this.callbacks.onDisconnected();
          resolve(false);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.callbacks.onError('WebSocket connection failed');
          resolve(false);
        };

        // Wait for connected message from server
        const timeout = setTimeout(() => {
          this.callbacks.onError('Connection timeout');
          resolve(false);
        }, 10000);

        const originalHandler = this.ws.onmessage;
        this.ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            clearTimeout(timeout);
            this.callbacks.onConnected();
            this.ws!.onmessage = originalHandler;
            resolve(true);
          } else if (data.type === 'error') {
            clearTimeout(timeout);
            this.callbacks.onError(data.message);
            resolve(false);
          }
        };
      } catch (error) {
        this.callbacks.onError(`Connection error: ${error}`);
        resolve(false);
      }
    });
  }

  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'text':
          this.callbacks.onText(message.data);
          break;
          
        case 'audio':
          this.queueAudio(message.data, message.mimeType);
          break;
          
        case 'turn_complete':
          this.callbacks.onTurnComplete();
          this.callbacks.onStatusChange('listening');
          break;
          
        case 'interrupted':
          this.stopAudioPlayback();
          this.callbacks.onInterrupted();
          this.callbacks.onStatusChange('listening');
          break;
          
        case 'error':
          this.callbacks.onError(message.message);
          break;
      }
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  }

  private async queueAudio(base64Data: string, mimeType: string) {
    try {
      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      this.audioQueue.push(bytes.buffer);
      
      if (!this.isPlaying) {
        this.playQueuedAudio();
      }
    } catch (e) {
      console.error('Error queueing audio:', e);
    }
  }

  private async playQueuedAudio() {
    if (this.isPlaying || this.audioQueue.length === 0) return;
    
    this.isPlaying = true;
    this.callbacks.onAudioStart();
    this.callbacks.onStatusChange('speaking');

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 24000 });
      }

      while (this.audioQueue.length > 0) {
        const buffer = this.audioQueue.shift()!;
        
        // Create audio buffer from PCM data
        // Gemini returns PCM16 at 24kHz
        const pcmData = new Int16Array(buffer);
        const floatData = new Float32Array(pcmData.length);
        
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = pcmData[i] / 32768.0;
        }

        const audioBuffer = this.audioContext.createBuffer(1, floatData.length, 24000);
        audioBuffer.getChannelData(0).set(floatData);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        
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

  private stopAudioPlayback() {
    this.audioQueue = [];
    this.isPlaying = false;
    // AudioContext sources will naturally stop
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Use ScriptProcessor for audio processing (deprecated but widely supported)
      // In production, use AudioWorklet
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert to base64
        const base64 = this.arrayBufferToBase64(pcmData.buffer);
        
        // Send to server
        this.ws.send(JSON.stringify({
          type: 'audio',
          data: base64
        }));
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      this.isRecording = true;
      this.callbacks.onStatusChange('listening');
    } catch (error) {
      this.callbacks.onError(`Microphone access failed: ${error}`);
    }
  }

  stopRecording(): void {
    this.isRecording = false;
    
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  sendText(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.callbacks.onStatusChange('thinking');
      this.ws.send(JSON.stringify({
        type: 'text',
        data: text
      }));
    }
  }

  sendImage(base64Jpeg: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'image',
        data: base64Jpeg
      }));
    }
  }

  disconnect(): void {
    this.stopRecording();
    this.stopAudioPlayback();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

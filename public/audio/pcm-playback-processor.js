// PCM Playback AudioWorklet Processor
// Plays Int16 PCM audio at 24kHz from Gemini
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.isPlaying = false;
    
    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        // Receive Int16 PCM and queue for playback
        const int16 = new Int16Array(event.data.data);
        const float32 = this.int16ToFloat32(int16);
        this.buffer.push(...float32);
        this.isPlaying = true;
      } else if (event.data.type === 'clear') {
        this.buffer = [];
        this.isPlaying = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outputChannel = output[0];
    
    if (this.buffer.length >= outputChannel.length) {
      // Fill output buffer from our queue
      for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = this.buffer.shift();
      }
    } else if (this.buffer.length > 0) {
      // Partial fill
      for (let i = 0; i < this.buffer.length; i++) {
        outputChannel[i] = this.buffer[i];
      }
      for (let i = this.buffer.length; i < outputChannel.length; i++) {
        outputChannel[i] = 0;
      }
      this.buffer = [];
      this.isPlaying = false;
      this.port.postMessage({ type: 'ended' });
    } else {
      // Silence
      outputChannel.fill(0);
    }
    
    return true;
  }

  int16ToFloat32(int16Array) {
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    return float32Array;
  }
}

registerProcessor('pcm-playback-processor', PCMPlaybackProcessor);

// PCM Recorder AudioWorklet Processor
// Captures audio at 16kHz, converts Float32 to Int16 PCM
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Collect ~256ms of audio at 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];
    
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      if (this.bufferIndex >= this.bufferSize) {
        // Convert Float32 to Int16 PCM
        const pcm16 = this.float32ToInt16(this.buffer);
        
        // Send to main thread
        this.port.postMessage({
          type: 'audio',
          data: pcm16
        }, [pcm16.buffer]);
        
        this.bufferIndex = 0;
        this.buffer = new Float32Array(this.bufferSize);
      }
    }
    
    return true;
  }

  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }
}

registerProcessor('pcm-recorder-processor', PCMRecorderProcessor);

// Voice handling utilities for SHIK Live
// Uses Web Speech API for STT/TTS with Gemini as the brain

export interface VoiceConfig {
  onTranscript: (text: string, isFinal: boolean) => void;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onError: (error: string) => void;
}

export class VoiceManager {
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesisUtterance | null = null;
  private config: VoiceConfig;
  private isListening = false;
  private isSpeaking = false;

  constructor(config: VoiceConfig) {
    this.config = config;
    this.initRecognition();
  }

  private initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      this.config.onError('Speech recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      // If user starts speaking while agent is talking, interrupt
      if (this.isSpeaking && transcript.length > 3) {
        this.stopSpeaking();
      }

      this.config.onTranscript(transcript, isFinal);
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.config.onError(`Speech recognition error: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if we're supposed to be listening
      if (this.isListening) {
        try {
          this.recognition?.start();
        } catch (e) {
          // Ignore - already started
        }
      }
    };
  }

  startListening() {
    if (!this.recognition) {
      this.config.onError('Speech recognition not available');
      return;
    }

    this.isListening = true;
    try {
      this.recognition.start();
    } catch (e) {
      // Already started, ignore
    }
  }

  stopListening() {
    this.isListening = false;
    this.recognition?.stop();
  }

  speak(text: string, onComplete?: () => void) {
    // Cancel any current speech
    window.speechSynthesis.cancel();

    this.synthesis = new SpeechSynthesisUtterance(text);
    this.synthesis.rate = 1.1; // Slightly faster
    this.synthesis.pitch = 1.0;
    
    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes('Google') || 
      v.name.includes('Samantha') ||
      v.name.includes('Daniel') ||
      (v.lang.startsWith('en') && v.localService)
    );
    if (preferredVoice) {
      this.synthesis.voice = preferredVoice;
    }

    this.synthesis.onstart = () => {
      this.isSpeaking = true;
      this.config.onSpeakingChange(true);
    };

    this.synthesis.onend = () => {
      this.isSpeaking = false;
      this.config.onSpeakingChange(false);
      onComplete?.();
    };

    this.synthesis.onerror = () => {
      this.isSpeaking = false;
      this.config.onSpeakingChange(false);
    };

    window.speechSynthesis.speak(this.synthesis);
  }

  stopSpeaking() {
    window.speechSynthesis.cancel();
    this.isSpeaking = false;
    this.config.onSpeakingChange(false);
  }

  isCurrentlySpeaking() {
    return this.isSpeaking;
  }

  cleanup() {
    this.stopListening();
    this.stopSpeaking();
  }
}

// Type declarations imported from src/types/speech.d.ts

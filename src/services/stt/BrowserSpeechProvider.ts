// =========================================
// BROWSER WEB SPEECH API PROVIDER
// Default STT implementation using browser's built-in API
// Can be replaced with Google Cloud Speech, Azure, AWS, etc.
// =========================================

import { SpeechToTextProvider, STTConfig } from '../interfaces';

export class BrowserSpeechProvider implements SpeechToTextProvider {
  private recognition: any = null;
  private isListening = false;

  async initialize(config: STTConfig): Promise<void> {
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported in this browser');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = config.continuous ?? true;
    this.recognition.interimResults = config.interimResults ?? true;
  }

  async startListening(
    language: string,
    onTranscript: (transcript: string, isFinal: boolean) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!this.recognition) {
      throw new Error('Speech recognition not initialized');
    }

    this.recognition.lang = language;
    this.isListening = true;

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;
        onTranscript(transcript, isFinal);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        onError(`Speech recognition error: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (err) {
          console.error('Error restarting recognition:', err);
        }
      }
    };

    try {
      this.recognition.start();
    } catch (err) {
      throw new Error(`Failed to start speech recognition: ${err}`);
    }
  }

  async stopListening(): Promise<void> {
    this.isListening = false;
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  isSupported(): boolean {
    return !!(
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition
    );
  }

  getProviderName(): string {
    return 'Browser Web Speech API';
  }
}
/**
 * Deepgram Speech-to-Text Provider
 * Integrates with backend WebSocket for live transcription
 */

interface TranscriptEvent {
  type: "transcript" | "error" | "connected";
  text?: string;
  isFinal?: boolean;
  timestamp?: string;
  message?: string;
  clientId?: string;
}

export class DeepgramProvider {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  // mediaRecorder removed: using AudioContext + ScriptProcessor for raw PCM capture
  private isListening = false;
  private backendUrl: string;
  private onTranscript: ((text: string, isFinal: boolean) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(backendUrl: string = "ws://localhost:3002") {
    this.backendUrl = backendUrl;
  }

  /**
   * Initialize the Deepgram connection
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.backendUrl.replace(/^http/, "ws");
        console.log(`[Deepgram] Connecting to ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log("[Deepgram] WebSocket connected");
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error("[Deepgram] WebSocket error:", error);
          this.onError?.(
            "Failed to connect to Deepgram service. Please check your connection."
          );
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("[Deepgram] WebSocket closed");
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start listening to microphone input
   * @param onTranscript Callback for transcription updates
   * @param onError Callback for errors
   * @param existingStream Optional existing MediaStream to use instead of requesting microphone
   */
  async startListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onError?: (error: string) => void,
    existingStream?: MediaStream
  ): Promise<void> {
    if (this.isListening) {
      console.warn("[Deepgram] Already listening");
      return;
    }

    this.onTranscript = onTranscript;
    this.onError = onError || null;

    try {
      // Use existing stream if provided, otherwise request microphone
      if (existingStream) {
        console.log("[Deepgram] Using existing MediaStream");
        this.mediaStream = existingStream;
      } else {
        console.log("[Deepgram] Requesting new MediaStream");
        // Request microphone access
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
      }

      // Create audio context (request preferred sampleRate 16000)
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      try {
        this.audioContext = new AudioCtx({ sampleRate: 16000 });
      } catch (e) {
        // Fallback if browser doesn't accept sampleRate option
        this.audioContext = new AudioCtx();
      }

      const source = (this.audioContext as AudioContext).createMediaStreamSource(this.mediaStream as MediaStream);

      // AudioWorklet path (relative to this module)
      try {
        await (this.audioContext as any).audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url).href);
      } catch (e) {
        console.error('[Deepgram] Failed to load AudioWorklet module, falling back to ScriptProcessor', e);
        // Fallback to ScriptProcessor (already implemented earlier)
        const bufferSize = 2048;
        const processor = (this.audioContext as AudioContext).createScriptProcessor(bufferSize, 1, 1);
        processor.onaudioprocess = (evt: AudioProcessingEvent) => {
          const inputBuffer = evt.inputBuffer.getChannelData(0);
          const downsampled = this.downsampleBuffer(inputBuffer, (this.audioContext as AudioContext).sampleRate, 16000);
          const pcm16 = this.convertFloat32ToInt16(downsampled);
          if (this.ws && this.ws.readyState === WebSocket.OPEN && pcm16 && pcm16.byteLength > 0) {
            try { this.ws.send(pcm16.buffer); } catch (err) { console.error('[Deepgram] Failed to send audio chunk:', err); }
          }
        };
        source.connect(processor);
        processor.connect((this.audioContext as AudioContext).destination);
        (this as any)._processor = processor;
        this.isListening = true;
        console.log('[Deepgram] Listening started (ScriptProcessor fallback)');
        return;
      }

      // Create AudioWorkletNode and wire messages
      const node = new AudioWorkletNode((this.audioContext as AudioContext), 'pcm-processor');
      source.connect(node);
      node.connect((this.audioContext as AudioContext).destination);

      // VAD and pre-roll setup
      const vadThreshold = 0.01; // RMS threshold, tune as needed
      const hangoverMs = 300; // keep sending after speech stops
      const sampleRate = (this.audioContext as AudioContext).sampleRate || 48000;
      const dstRate = 16000;
      const preRollFrames: Array<Int16Array> = [];
      const maxPreRoll = 8; // store ~8 frames for pre-roll
      let inSpeech = false;
      let lastSpeechTs = 0;

      node.port.onmessage = (ev: MessageEvent) => {
        try {
          const float32 = new Float32Array(ev.data);
          // downsample to 16k
          const down = this.downsampleBuffer(float32, sampleRate, dstRate);
          // VAD - compute RMS
          let sum = 0;
          for (let i = 0; i < down.length; i++) { const v = down[i]; sum += v * v; }
          const rms = Math.sqrt(sum / down.length);

          const pcm16 = this.convertFloat32ToInt16(down);

          // manage pre-roll
          preRollFrames.push(pcm16);
          if (preRollFrames.length > maxPreRoll) preRollFrames.shift();

          const now = Date.now();
          if (rms >= vadThreshold) {
            // voice detected
            inSpeech = true;
            lastSpeechTs = now;
            // flush pre-roll first
            while (preRollFrames.length) {
              const chunk = preRollFrames.shift()!;
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try { this.ws.send(chunk.buffer); } catch (err) { console.error('[Deepgram] send pre-roll failed', err); }
              }
            }
            // send current frame
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              try { this.ws.send(pcm16.buffer); } catch (err) { console.error('[Deepgram] send failed', err); }
            }
          } else {
            // no voice
            if (inSpeech) {
              // still within hangover, send a few more frames
              if (now - lastSpeechTs <= hangoverMs) {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                  try { this.ws.send(pcm16.buffer); } catch (err) { console.error('[Deepgram] send failed', err); }
                }
              } else {
                inSpeech = false;
                // keep the last frame in pre-roll
              }
            }
          }
        } catch (err) {
          console.error('[Deepgram] Error handling worklet message', err);
        }
      };

      // Save node reference for stop
      (this as any)._processor = node;
      this.isListening = true;
      console.log('[Deepgram] Listening started (AudioWorklet streaming)');
    } catch (error: any) {
      const errorMsg =
        error.name === "NotAllowedError"
          ? "Microphone access denied. Please allow microphone access."
          : error.message || "Failed to start listening";

      this.onError?.(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Stop listening to microphone input
   */
  stopListening(): void {
    if (!this.isListening) {
      console.warn("[Deepgram] Not currently listening");
      return;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    // stop and disconnect processor if present
    const proc = (this as any)._processor;
    if (proc) {
      try { proc.disconnect(); } catch (e) {}
      (this as any)._processor = null;
    }

    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) {}
    }

    this.isListening = false;
    console.log("[Deepgram] Listening stopped");
  }

  /**
   * Transcribe a pre-recorded audio file
   */
  async transcribeFile(audioBlob: Blob): Promise<string> {
    const backendUrl = this.backendUrl.replace(/^ws/, "http");
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob);

      const response = await fetch(`${backendUrl}/api/deepgram/transcribe`, {
        method: "POST",
        body: audioBlob,
        headers: {
          "Content-Type": audioBlob.type || "audio/wav",
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      if (data.transcript) {
        return data.transcript;
      }

      throw new Error("No transcription received");
    } catch (error: any) {
      console.error("[Deepgram] File transcription error:", error);
      throw new Error(
        error.message || "Failed to transcribe audio file"
      );
    }
  }

  /**
   * Check Deepgram service status
   */
  async checkStatus(): Promise<boolean> {
    const backendUrl = this.backendUrl.replace(/^ws/, "http");
    
    try {
      const response = await fetch(`${backendUrl}/api/deepgram/status`);
      const data = await response.json();
      return data.status === "configured";
    } catch (error) {
      console.error("[Deepgram] Status check failed:", error);
      return false;
    }
  }

  /**
   * Close the connection
   */
  disconnect(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    const proc = (this as any)._processor;
    if (proc) {
      try { proc.disconnect(); } catch (e) {}
      (this as any)._processor = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isListening = false;
    console.log("[Deepgram] Disconnected");
  }

  /**
   * Get current listening status
   */
  getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Downsample a Float32Array buffer from srcRate to dstRate (returns Float32Array)
   */
  private downsampleBuffer(buffer: Float32Array, srcRate: number, dstRate: number): Float32Array {
    if (dstRate === srcRate) {
      return buffer;
    }

    const sampleRateRatio = srcRate / dstRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  /**
   * Convert Float32Array (-1..1) to Int16Array (PCM 16-bit little endian)
   */
  private convertFloat32ToInt16(buffer: Float32Array): Int16Array {
    const l = buffer.length;
    const result = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      let s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return result;
  }

  /**
   * Handle WebSocket messages from backend
   */
  private handleMessage(data: string): void {
    try {
      const message: TranscriptEvent = JSON.parse(data);
      console.log("[Deepgram] Received message:", message.type, message);

      switch (message.type) {
        case "connected":
          console.log("[Deepgram] Connected to service:", message.clientId);
          break;

        case "transcript":
          console.log("[Deepgram] Transcript received:", message.text, "isFinal:", message.isFinal);
          if (message.text && this.onTranscript) {
            this.onTranscript(message.text, !!message.isFinal);
          }
          break;

        case "error":
          console.error("[Deepgram] Service error:", message.message);
          this.onError?.(message.message || "Service error occurred");
          break;

        default:
          console.warn("[Deepgram] Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("[Deepgram] Failed to parse message:", error);
    }
  }

  /**
   * Attempt to reconnect to the service
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      
      console.log(
        `[Deepgram] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
      );

      setTimeout(() => {
        this.initialize().catch((error) => {
          console.error("[Deepgram] Reconnect failed:", error);
        });
      }, delay);
    } else {
      console.error(
        "[Deepgram] Max reconnection attempts reached"
      );
      this.onError?.(
        "Lost connection to Deepgram service and could not reconnect"
      );
    }
  }
}

// Export singleton instance
export const deepgramProvider = new DeepgramProvider();

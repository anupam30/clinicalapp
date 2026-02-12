/**
 * AssemblyAI Speech-to-Text Provider
 * Direct browser-to-AssemblyAI streaming (low latency)
 * Supports Hindi, English, and Hinglish for medical transcription
 */

interface AssemblyAITranscript {
  message_type: "SessionBegins" | "Transcript" | "FinalTranscript" | "SessionTerminated" | "Error";
  session_id?: string;
  transcript?: string;
  confidence?: number;
  audio_start?: number;
  audio_end?: number;
  message?: string;
}

export class AssemblyAIProvider {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private isListening = false;
  private backendUrl: string;
  private onTranscript: ((text: string, isFinal: boolean) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(backendUrl: string = "http://localhost:3002") {
    this.backendUrl = backendUrl;
  }

  /**
   * Initialize connection to AssemblyAI via API key validation
   */
  async initialize(): Promise<void> {
    try {
      console.log("[AssemblyAI] Validating API key with backend...");
      
      const tokenRes = await fetch(`${this.backendUrl}/api/assemblyai/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error(`[AssemblyAI] Validation failed: ${tokenRes.status}`, errorText);
        throw new Error(`API key validation failed: ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      if (!tokenData.token || !tokenData.ready) {
        console.error("[AssemblyAI] Invalid validation response:", tokenData);
        throw new Error("API key validation returned invalid response");
      }

      const apiKey = tokenData.token;
      console.log("[AssemblyAI] API key validated, connecting to WebSocket...");

      return new Promise((resolve, reject) => {
        try {
          // Connect directly to AssemblyAI RealtimeTranscriber WebSocket with API key
          const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?token=${apiKey}`;
          console.log("[AssemblyAI] Connecting WebSocket...");
          
          this.ws = new WebSocket(wsUrl);

          this.ws.onopen = () => {
            console.log("[AssemblyAI] WebSocket connected successfully");
            this.reconnectAttempts = 0;
            resolve();
          };

          this.ws.onmessage = (event) => {
            this.handleMessage(event.data);
          };

          this.ws.onerror = (error) => {
            console.error("[AssemblyAI] WebSocket error:", error);
            reject(new Error("Failed to connect to AssemblyAI"));
          };

          this.ws.onclose = () => {
            console.log("[AssemblyAI] WebSocket closed");
            this.attemptReconnect();
          };
        } catch (error) {
          console.error("[AssemblyAI] WebSocket creation error:", error);
          reject(error);
        }
      });
    } catch (error: any) {
      console.error("[AssemblyAI] Initialization error:", error);
      throw new Error(error.message || "Failed to initialize AssemblyAI");
    }
  }

  /**
   * Start listening to microphone and stream to AssemblyAI
   * @param onTranscript Callback for transcription updates
   * @param onError Callback for errors
   * @param existingStream Optional existing MediaStream to use
   */
  async startListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onError?: (error: string) => void,
    existingStream?: MediaStream
  ): Promise<void> {
    if (this.isListening) {
      console.warn("[AssemblyAI] Already listening");
      return;
    }

    this.onTranscript = onTranscript;
    this.onError = onError || null;

    try {
      // Use existing stream if provided, otherwise request microphone
      if (existingStream) {
        console.log("[AssemblyAI] Using existing MediaStream");
        this.mediaStream = existingStream;
      } else {
        console.log("[AssemblyAI] Requesting new MediaStream");
        // Request microphone access with 16kHz sample rate
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
          },
        });
      }

      // Create audio context at 16kHz
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      try {
        this.audioContext = new AudioCtx({ sampleRate: 16000 });
      } catch (e) {
        this.audioContext = new AudioCtx();
      }

      const source = (this.audioContext as AudioContext).createMediaStreamSource(this.mediaStream as MediaStream);

      // Try AudioWorklet first, fallback to ScriptProcessor
      try {
        await (this.audioContext as any).audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url).href);
        const node = new AudioWorkletNode((this.audioContext as AudioContext), 'pcm-processor');
        source.connect(node);
        node.connect((this.audioContext as AudioContext).destination);

        node.port.onmessage = (ev: MessageEvent) => {
          this.sendAudioToAssemblyAI(new Float32Array(ev.data));
        };

        (this as any)._processor = node;
      } catch (e) {
        console.warn("[AssemblyAI] AudioWorklet not available, using ScriptProcessor");
        // Fallback to ScriptProcessor
        const processor = (this.audioContext as AudioContext).createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (evt: AudioProcessingEvent) => {
          this.sendAudioToAssemblyAI(evt.inputBuffer.getChannelData(0));
        };

        source.connect(processor);
        processor.connect((this.audioContext as AudioContext).destination);
        (this as any)._processor = processor;
      }

      this.isListening = true;
      console.log("[AssemblyAI] Listening started (streaming PCM)");
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
   * Send audio frame to AssemblyAI via WebSocket
   */
  private sendAudioToAssemblyAI(float32Data: Float32Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // AssemblyAI expects 16-bit PCM in base64-encoded message
      const int16 = this.convertFloat32ToInt16(float32Data);
      const base64 = this.arrayBufferToBase64(int16.buffer);

      this.ws.send(
        JSON.stringify({
          user_id: "browser-client",
          encoding: "pcm_s16le",
          sample_rate: 16000,
          audio_data: base64,
        })
      );
    } catch (err) {
      console.error("[AssemblyAI] Error sending audio:", err);
    }
  }

  /**
   * Stop listening to microphone
   */
  stopListening(): void {
    if (!this.isListening) {
      console.warn("[AssemblyAI] Not currently listening");
      return;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    const proc = (this as any)._processor;
    if (proc) {
      try {
        proc.disconnect();
      } catch (e) {}
      (this as any)._processor = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {}
    }

    this.isListening = false;
    console.log("[AssemblyAI] Listening stopped");
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
      try {
        proc.disconnect();
      } catch (e) {}
      (this as any)._processor = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isListening = false;
    console.log("[AssemblyAI] Disconnected");
  }

  /**
   * Get current listening status
   */
  getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Handle WebSocket messages from AssemblyAI
   */
  private handleMessage(data: string): void {
    try {
      const message: AssemblyAITranscript = JSON.parse(data);

      switch (message.message_type) {
        case "SessionBegins":
          console.log("[AssemblyAI] Session started:", message.session_id);
          break;

        case "Transcript":
          // Interim result
          if (message.transcript && this.onTranscript) {
            console.log("[AssemblyAI] Interim:", message.transcript);
            this.onTranscript(message.transcript, false);
          }
          break;

        case "FinalTranscript":
          // Final result
          if (message.transcript && this.onTranscript) {
            console.log("[AssemblyAI] Final:", message.transcript);
            this.onTranscript(message.transcript, true);
          }
          break;

        case "SessionTerminated":
          console.log("[AssemblyAI] Session terminated");
          break;

        case "Error":
          console.error("[AssemblyAI] Error:", message.message);
          this.onError?.(message.message || "AssemblyAI error");
          break;

        default:
          console.warn("[AssemblyAI] Unknown message type:", message.message_type);
      }
    } catch (error) {
      console.error("[AssemblyAI] Failed to parse message:", error);
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

      console.log(
        `[AssemblyAI] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
      );

      setTimeout(() => {
        this.initialize().catch((error) => {
          console.error("[AssemblyAI] Reconnect failed:", error);
        });
      }, delay);
    } else {
      console.error("[AssemblyAI] Max reconnection attempts reached");
      this.onError?.("Lost connection to AssemblyAI and could not reconnect");
    }
  }

  /**
   * Convert Float32Array to Int16Array (PCM 16-bit)
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
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer | ArrayBufferLike): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

// Export singleton instance
export const assemblyaiProvider = new AssemblyAIProvider();

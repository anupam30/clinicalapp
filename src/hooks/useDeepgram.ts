import { useState, useCallback, useEffect, useRef } from "react";
import { deepgramProvider } from "@/services/stt/DeepgramProvider";

interface UseDeepgramOptions {
  backendUrl?: string;
  onTranscriptUpdate?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

export const useDeepgram = (options: UseDeepgramOptions = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const transcriptRef = useRef("");

  // Initialize Deepgram provider
  useEffect(() => {
    const initializeDeepgram = async () => {
      try {
        setIsLoading(true);
        console.log("[useDeepgram] Starting initialization...");
        
        // First check if backend is available
        const isConfigured = await deepgramProvider.checkStatus();
        console.log("[useDeepgram] Backend status check:", isConfigured);
        
        if (!isConfigured) {
          setError("Deepgram backend not configured. Will use browser STT as fallback.");
          setIsInitialized(false);
          return;
        }

        // Then initialize the WebSocket connection
        await deepgramProvider.initialize();
        console.log("[useDeepgram] Deepgram initialized successfully");
        setIsInitialized(true);
        setError(null);
      } catch (err: any) {
        console.error("[useDeepgram] Initialization failed:", err);
        setError(`Deepgram initialization failed: ${err.message}`);
        setIsInitialized(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDeepgram();

    return () => {
      console.log("[useDeepgram] Cleaning up Deepgram connection");
      deepgramProvider.disconnect();
    };
  }, []);

  // Handle transcript updates
  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      // Final transcript - add to main transcript
      transcriptRef.current += text + " ";
      setTranscript(transcriptRef.current.trim());
      setInterimTranscript("");
    } else {
      // Interim result - show as you type
      setInterimTranscript(text);
    }

    options.onTranscriptUpdate?.(text, isFinal);
  }, [options]);

  // Handle errors
  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    options.onError?.(errorMsg);
  }, [options]);

  // Start listening
  const startListening = useCallback(async (mediaStream?: MediaStream) => {
    if (!isInitialized) {
      setError("Deepgram is not initialized yet");
      return;
    }

    if (isListening) {
      console.warn("Already listening");
      return;
    }

    try {
      setError(null);
      setTranscript("");
      transcriptRef.current = "";
      setInterimTranscript("");

      await deepgramProvider.startListening(handleTranscript, handleError, mediaStream);
      setIsListening(true);
    } catch (err: any) {
      const errorMsg =
        err.message ||
        "Failed to start listening. Please check microphone permissions.";
      setError(errorMsg);
      setIsListening(false);
    }
  }, [isInitialized, isListening, handleTranscript, handleError]);

  // Stop listening
  const stopListening = useCallback(() => {
    deepgramProvider.stopListening();
    setIsListening(false);
  }, []);

  // Transcribe file
  const transcribeFile = useCallback(async (audioBlob: Blob) => {
    try {
      setError(null);
      setTranscript("");
      transcriptRef.current = "";

      const result = await deepgramProvider.transcribeFile(audioBlob);
      setTranscript(result);
      return result;
    } catch (err: any) {
      const errorMsg = err.message || "Failed to transcribe audio file";
      setError(errorMsg);
      throw err;
    }
  }, []);

  // Clear transcript
  const clearTranscript = useCallback(() => {
    setTranscript("");
    transcriptRef.current = "";
    setInterimTranscript("");
    setError(null);
  }, []);

  return {
    // State
    isListening,
    transcript,
    interimTranscript,
    error,
    isInitialized,
    isLoading,

    // Methods
    startListening,
    stopListening,
    transcribeFile,
    clearTranscript,

    // Full transcript (transcript + interim)
    fullTranscript: transcript + (interimTranscript ? " " + interimTranscript : ""),
  };
};

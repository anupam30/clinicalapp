import React, { useState } from "react";
import { useDeepgram } from "@/hooks/useDeepgram";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

/**
 * Example component demonstrating Deepgram speech-to-text integration
 */
export const DeepgramExample = () => {
  const {
    isListening,
    error,
    isInitialized,
    isLoading,
    startListening,
    stopListening,
    transcribeFile,
    clearTranscript,
    fullTranscript,
  } = useDeepgram({
    onTranscriptUpdate: (text: string, isFinal: boolean) => {
      console.log(`[${isFinal ? "Final" : "Interim"}] ${text}`);
    },
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTranscribingFile, setIsTranscribingFile] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleTranscribeFile = async () => {
    if (!selectedFile) return;

    try {
      setIsTranscribingFile(true);
      await transcribeFile(selectedFile);
    } catch (error) {
      console.error("File transcription error:", error);
    } finally {
      setIsTranscribingFile(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Deepgram Speech-to-Text</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-4">Initializing Deepgram...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Deepgram Speech-to-Text</CardTitle>
        <CardDescription>
          {isInitialized
            ? "Ready for transcription"
            : "Failed to initialize"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Status */}
        <div className="text-sm text-gray-600">
          <p>
            Status:{" "}
            <span className={isListening ? "text-red-500 font-semibold" : "text-green-500"}>
              {isListening ? "● Recording..." : "● Ready"}
            </span>
          </p>
        </div>

        {/* Live Recording Controls */}
        <div className="space-y-2">
          <h3 className="font-semibold">Live Transcription</h3>
          <div className="flex gap-2">
            <Button
              onClick={startListening}
              disabled={!isInitialized || isListening}
              className="flex-1"
            >
              Start Recording
            </Button>
            <Button
              onClick={stopListening}
              disabled={!isListening}
              variant="destructive"
              className="flex-1"
            >
              Stop Recording
            </Button>
          </div>
        </div>

        {/* Transcript Display */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Transcript</label>
          <Textarea
            value={fullTranscript}
            readOnly
            className="min-h-[120px] bg-gray-50"
            placeholder="Transcribed text will appear here..."
          />
          <div className="flex gap-2">
            <Button
              onClick={clearTranscript}
              variant="outline"
              className="flex-1"
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(fullTranscript);
              }}
              variant="outline"
              className="flex-1"
            >
              Copy
            </Button>
          </div>
        </div>

        {/* File Transcription */}
        <div className="space-y-2 border-t pt-4">
          <h3 className="font-semibold">Upload Audio File</h3>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="w-full"
          />
          <Button
            onClick={handleTranscribeFile}
            disabled={!selectedFile || isTranscribingFile || !isInitialized}
            className="w-full"
          >
            {isTranscribingFile ? "Transcribing..." : "Transcribe File"}
          </Button>
        </div>

        {/* Info */}
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
          <p>💡 Tip: Deepgram uses nova-2 model for accurate transcription</p>
          <p>🎤 Make sure microphone permissions are enabled for live recording</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DeepgramExample;

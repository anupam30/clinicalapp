import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, AlertCircle, Cloud, Zap, Radio } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useDeepgram } from '@/hooks/useDeepgram';
import { assemblyaiProvider } from '@/services/stt/AssemblyAIProvider';
import { VoiceAnalyzer } from '@/services/speaker-detection/VoiceAnalyzer';

type STTProvider = 'deepgram' | 'browser' | 'assemblyai';

export interface Message {
  speaker: 'Doctor' | 'Patient';
  text: string;
  timestamp?: number;
}

interface LiveTranscriptionProps {
  onTranscriptUpdate: (transcript: string) => void;
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
}

export function LiveTranscription({ 
  onTranscriptUpdate,
  isRecording, 
  onRecordingChange,
  selectedLanguage,
  onLanguageChange
}: LiveTranscriptionProps) {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<STTProvider>('browser');
  const [isAssemblyAIInitialized, setIsAssemblyAIInitialized] = useState(false);
  const [isAssemblyAILoading, setIsAssemblyAILoading] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioAnalysisRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const messagesRef = useRef<Message[]>([]);
  const voiceAnalyzerRef = useRef<VoiceAnalyzer | null>(null);
  const currentSpeakerRef = useRef<'Patient' | 'Doctor'>('Patient');
  const lastSpeakerChangeTimeRef = useRef(0);
  const minSpeakerChangeDurationRef = useRef(2000); // Minimum 2 seconds before switching speaker
  const isRecognitionRunningRef = useRef(false); // Track if recognition is currently running

  // Deepgram hook initialization
  const deepgram = useDeepgram({
    onTranscriptUpdate: (text: string, isFinal: boolean) => {
      if (currentProvider !== 'deepgram') return;
      
      if (isFinal && text.trim()) {
        // Simple raw text accumulation - no role-based filtering
        transcriptRef.current += text.trim() + ' ';
        setTranscript(transcriptRef.current);
        onTranscriptUpdate(transcriptRef.current);
      } else {
        setInterimTranscript(text);
      }
    },
    onError: (deepgramError) => {
      console.error('Deepgram error:', deepgramError);
      // Fallback to browser STT
      setCurrentProvider('browser');
      setError(`Deepgram unavailable, switched to browser STT: ${deepgramError}`);
      // Start browser recognition
      if (recognitionRef.current && isRecording) {
        setTimeout(() => recognitionRef.current?.start(), 100);
      }
    },
  });

  // Speaker detection removed - using simple raw text accumulation
  // This matches the approach in the attached app for better accuracy

  useEffect(() => {
    // Initialize AssemblyAI provider
    const initAssemblyAI = async () => {
      try {
        setIsAssemblyAILoading(true);
        await assemblyaiProvider.initialize();
        setIsAssemblyAIInitialized(true);
        console.log('✓ AssemblyAI provider initialized');
      } catch (err) {
        console.warn('AssemblyAI initialization failed:', err);
        setIsAssemblyAIInitialized(false);
      } finally {
        setIsAssemblyAILoading(false);
      }
    };

    initAssemblyAI();
  }, []);

  useEffect(() => {
    // Check if browser supports Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    // Set language based on selection
    const langMap: { [key: string]: string } = {
      'hindi': 'hi-IN',
      'english': 'en-IN',
      'hinglish': 'en-IN' // Use Indian English locale which tends to handle Hinglish better
    };
    recognition.lang = langMap[selectedLanguage] || 'hi-IN';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptText = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcriptText + ' ';
        } else {
          interim += transcriptText;
        }
      }

      if (final && final.trim()) {
        // Simple raw text accumulation - no role-based filtering
        // Just add the text directly, matching the attached app approach for better accuracy
        transcriptRef.current += final.trim() + ' ';
        setTranscript(transcriptRef.current);
        onTranscriptUpdate(transcriptRef.current);
      }
      
      setInterimTranscript(interim);
    };

    recognition.onstart = () => {
      console.log('Speech recognition started');
      isRecognitionRunningRef.current = true;
      setError('');
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'no-speech') {
        // Restart if no speech detected and not already starting
        if (isRecording && !isRecognitionRunningRef.current) {
          try {
            recognition.stop();
            setTimeout(() => {
              if (isRecording && !isRecognitionRunningRef.current) {
                recognition.start();
              }
            }, 100);
          } catch (err) {
            console.error('Error restarting after no-speech:', err);
          }
        }
      } else if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access.');
        onRecordingChange(false);
      } else if (event.error !== 'aborted') {
        setError(`Error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      isRecognitionRunningRef.current = false;
      // Restart if still recording and not already running
      if (isRecording && !isRecognitionRunningRef.current) {
        try {
          recognition.start();
        } catch (err) {
          console.error('Error restarting recognition:', err);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [selectedLanguage]);

  // Handle recording lifecycle
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isRecording && currentProvider === 'browser') {
      // Only start if not already running
      if (!isRecognitionRunningRef.current) {
        try {
          console.log('useEffect: Starting browser recognition');
          recognitionRef.current.start();
        } catch (error: any) {
          console.error('useEffect: Error starting recognition:', error);
          if (error.name === 'InvalidStateError') {
            // Already started, that's okay
            console.log('Recognition already active');
            isRecognitionRunningRef.current = true;
          } else {
            setError('Failed to start recording');
            onRecordingChange(false);
          }
        }
      }
    } else if (!isRecording) {
      // Stop if currently running
      if (isRecognitionRunningRef.current) {
        try {
          console.log('useEffect: Stopping recognition');
          recognitionRef.current.stop();
          isRecognitionRunningRef.current = false;
        } catch (error) {
          console.error('useEffect: Error stopping recognition:', error);
        }
      }
    }
  }, [isRecording, currentProvider, onRecordingChange]);

  const handleConsentAndStart = async () => {
    if (!consentGiven) {
      return;
    }

    setShowConsentDialog(false);
    setError(null);

    try {
      // Request microphone access with explicit constraints
      console.log('Requesting microphone access...');
      console.log('Browser:', navigator.userAgent.substring(0, 100));
      
      const audioConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 },
        }
      };
      
      console.log('Audio constraints:', JSON.stringify(audioConstraints));
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        micStreamRef.current = stream;
        console.log('✅ Microphone access granted!');
        console.log('Microphone details:', {
          tracks: stream.getTracks().length,
          audioTracks: stream.getAudioTracks().length,
          enabled: stream.getAudioTracks()[0]?.enabled,
          settings: stream.getAudioTracks()[0]?.getSettings?.()
        });
      } catch (strictError) {
        console.warn('Strict audio constraints failed, trying with minimal constraints:', strictError);
        // Fallback to minimal constraints
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        console.log('✅ Microphone access granted (with minimal constraints)');
      }
      
      // Reset transcript for new recording
      transcriptRef.current = '';
      messagesRef.current = [];
      currentSpeakerRef.current = 'Patient';
      lastSpeakerChangeTimeRef.current = 0;
      setTranscript('');

      // Use user's selected provider
      if (currentProvider === 'deepgram' && deepgram.isInitialized) {
        console.log('Starting Deepgram...');
        try {
          await deepgram.startListening(micStreamRef.current!);
          console.log('✓ Using Deepgram (Cloud STT)');
        } catch (deepgramError) {
          console.error('Deepgram start error:', deepgramError);
          // Fallback to browser
          setCurrentProvider('browser');
          setError('Deepgram unavailable, using browser STT as fallback');
          if (recognitionRef.current) {
            recognitionRef.current.start();
          }
        }
      } else if (currentProvider === 'deepgram' && !deepgram.isInitialized) {
        // User selected Deepgram but it's not available
        console.log('Deepgram not initialized, falling back to browser STT');
        setCurrentProvider('browser');
        setError('Deepgram not available, using browser STT as fallback');
        if (recognitionRef.current) {
          recognitionRef.current.start();
          // start audio analysis in parallel to recognition (for pitch/VAD)
          startAudioAnalysis();
        }
      } else if (currentProvider === 'assemblyai' && isAssemblyAIInitialized) {
        console.log('Starting AssemblyAI...');
        try {
          await assemblyaiProvider.startListening(
            (text: string, isFinal: boolean) => {
              if (isFinal && text.trim()) {
                // Simple raw text accumulation - no role-based filtering
                transcriptRef.current += text.trim() + ' ';
                setTranscript(transcriptRef.current);
                onTranscriptUpdate(transcriptRef.current);
              } else {
                setInterimTranscript(text);
              }
            },
            (error: string) => {
              console.error('AssemblyAI error:', error);
              // Fallback to browser
              setCurrentProvider('browser');
              setError(`AssemblyAI unavailable, switched to browser STT: ${error}`);
              if (recognitionRef.current && isRecording) {
                setTimeout(() => recognitionRef.current?.start(), 100);
              }
            },
            micStreamRef.current! // Pass the existing stream
          );
          console.log('✓ Using AssemblyAI (Cloud STT)');
        } catch (assemblyError) {
          console.error('AssemblyAI start error:', assemblyError);
          // Fallback to browser
          setCurrentProvider('browser');
          setError('AssemblyAI unavailable, using browser STT as fallback');
          if (recognitionRef.current) {
            recognitionRef.current.start();
          }
        }
      } else if (currentProvider === 'assemblyai' && !isAssemblyAIInitialized) {
        // User selected AssemblyAI but it's not available
        console.log('AssemblyAI not initialized, falling back to browser STT');
        setCurrentProvider('browser');
        setError('AssemblyAI not available, using browser STT as fallback');
        if (recognitionRef.current) {
          recognitionRef.current.start();
          startAudioAnalysis();
        }
      } else {
        // User selected browser STT
        console.log('✓ Using browser STT');
        try {
          if (recognitionRef.current) {
            recognitionRef.current.start();
            startAudioAnalysis();
          }
        } catch (startErr) {
          console.error('Error starting browser STT:', startErr);
          setError(`Failed to start browser STT: ${(startErr as any)?.message || 'Unknown error'}`);
          onRecordingChange(false);
          return;
        }
      }
      
      onRecordingChange(true);
    } catch (err: any) {
      console.error('❌ Recording start error:', err);
      console.error('Error details:', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        constraint: err?.constraint,
        type: typeof err,
      });
      
      // Provide detailed error message based on error type
      let errorMsg = 'Microphone access denied.';
      
      if (err?.name === 'NotAllowedError') {
        errorMsg = '❌ Permission Denied: Microphone access blocked. Check browser settings or reload and grant permission when prompted.';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        errorMsg = '❌ No Microphone Found: No microphone device detected. Check hardware connections.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'AbortError') {
        errorMsg = '❌ Microphone In Use: Microphone is being used by another application. Close other audio apps and try again.';
      } else if (err?.name === 'OverconstrainedError') {
        errorMsg = '❌ Microphone Constraints Error: Your microphone doesn\'t support the requested settings. Reloading...';
      } else if (err?.name === 'TypeError') {
        errorMsg = '❌ Browser Error: getUserMedia not supported or HTTPS required. Use HTTPS or a supported browser.';
      } else if (err?.message?.includes('Permission denied')) {
        errorMsg = '❌ System Permission Denied: Operating system microphone access denied. Check OS settings.';
      } else {
        errorMsg = `❌ Error: ${err?.message || 'Unknown microphone error'}`;
      }
      
      setError(errorMsg);
    }
  };

  // Acoustic-based real speaker detection using VoiceAnalyzer
  const startAudioAnalysis = () => {
    try {
      if (!micStreamRef.current) {
        console.warn('[Audio Analysis] No media stream available');
        return;
      }
      
      console.log('[Audio Analysis] Starting acoustic speaker detection...');
      
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        const actx = new AudioCtx();
        const src = actx.createMediaStreamSource(micStreamRef.current);
        
        // Create analyser for voice characteristics
        const analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.3;
        
        // Initialize voice analyzer for speaker detection
        voiceAnalyzerRef.current = new VoiceAnalyzer(actx.sampleRate);
        currentSpeakerRef.current = 'Patient'; // Start with patient
        
        // Create processor for real-time analysis
        const processor = actx.createScriptProcessor(2048, 1, 1);
        
        processor.onaudioprocess = (ev: any) => {
          try {
            const data = ev.inputBuffer.getChannelData(0);
            
            // Skip silent frames
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
            const rms = Math.sqrt(sum / data.length);
            
            if (rms < 0.005) return; // Skip if too quiet
            
            // Analyze acoustic characteristics
            const analyzer = voiceAnalyzerRef.current;
            if (analyzer) {
              const { changeEvent } = analyzer.analyzeFrame(data);
              
              // Check if speaker changed
              if (changeEvent && Date.now() - lastSpeakerChangeTimeRef.current > minSpeakerChangeDurationRef.current) {
                const newSpeaker = changeEvent.newSpeaker === 0 ? 'Patient' : 'Doctor';
                currentSpeakerRef.current = newSpeaker;
                lastSpeakerChangeTimeRef.current = Date.now();
                
                console.log(`🔊 Speaker change detected: ${newSpeaker}`, {
                  confidence: changeEvent.confidence.toFixed(2),
                  pitch: changeEvent.features.pitch.toFixed(0),
                  energy: changeEvent.features.energy.toFixed(4),
                  spectral: changeEvent.features.spectralCentroid.toFixed(0),
                });
              }
            }
          } catch (err) {
            console.error('Error processing audio frame:', err);
          }
        };
        
        src.connect(analyser);
        analyser.connect(processor);
        processor.connect(actx.destination);
        
        audioAnalysisRef.current = { actx, processor, analyser };
        console.log('[Audio Analysis] Acoustic analysis initialized successfully');
      } catch (audioErr) {
        console.warn('[Audio Analysis] Audio context setup failed, continuing without speaker detection:', audioErr);
        // Don't fail - just continue without speaker detection
      }
    } catch (err) {
      console.error('[Audio Analysis] Failed to start audio analysis:', err);
      // Don't fail - just continue without acoustic analysis
    }
  };

  const stopAudioAnalysis = () => {
    try {
      const o = audioAnalysisRef.current;
      if (o) {
        try { o.processor.disconnect(); } catch (e) {}
        try { o.analyser.disconnect(); } catch (e) {}
        try { o.actx.close(); } catch (e) {}
        audioAnalysisRef.current = null;
      }
      if (voiceAnalyzerRef.current) {
        voiceAnalyzerRef.current.reset();
        voiceAnalyzerRef.current = null;
      }
    } catch (err) {}
  };

  const toggleRecording = () => {
    if (!isRecording) {
      // Show consent dialog before starting
      setShowConsentDialog(true);
    } else {
      // Stop recording
      if (currentProvider === 'deepgram') {
        deepgram.stopListening();
      } else if (currentProvider === 'assemblyai') {
        assemblyaiProvider.stopListening();
      } else if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      // stop audio analysis if running
      try { stopAudioAnalysis(); } catch (e) {}
      setInterimTranscript('');
      onRecordingChange(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header: Title + Record Button */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Live Transcription</h3>
        
        {/* Start/Stop Recording Button - MAIN CONTROL */}
        <Button
          onClick={toggleRecording}
          className={`gap-2 ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'}`}
        >
          {isRecording ? (
            <>
              <MicOff className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Start Recording
            </>
          )}
        </Button>

        {/* Recording Badge (while recording) */}
        {isRecording && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs">
            {currentProvider === 'deepgram' ? (
              <>
                <Cloud className="h-3.5 w-3.5 text-blue-600" />
                <span className="font-medium text-blue-600">Deepgram (Cloud)</span>
              </>
            ) : currentProvider === 'assemblyai' ? (
              <>
                <Radio className="h-3.5 w-3.5 text-purple-600" />
                <span className="font-medium text-purple-600">AssemblyAI (Cloud)</span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 text-amber-600" />
                <span className="font-medium text-amber-600">Browser STT (Recording...)</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Controls: Provider + Language Selection */}
      <div className="flex items-center gap-4 mb-4 pb-3 border-b">
        {/* STT Provider Selector */}
        {!isRecording && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 font-medium">Provider:</label>
            <Select 
              value={currentProvider} 
              onValueChange={(value: string) => setCurrentProvider(value as STTProvider)}
              disabled={isRecording}
            >
              <SelectTrigger className="w-[160px] h-8 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="browser">
                  Browser STT
                </SelectItem>
                <SelectItem value="deepgram">
                  {deepgram.isInitialized ? '🌐 Deepgram' : '⚠️ Deepgram (Unavailable)'}
                </SelectItem>
                <SelectItem value="assemblyai">
                  {isAssemblyAIInitialized ? '📻 AssemblyAI' : '⚠️ AssemblyAI (Unavailable)'}
                </SelectItem>
              </SelectContent>
            </Select>
            {/* Status Indicator */}
            <div className="flex items-center gap-1 text-xs">
              {currentProvider === 'deepgram' ? (
                deepgram.isLoading ? (
                  <span className="text-gray-500">Initializing...</span>
                ) : deepgram.isInitialized ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                    Ready
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-amber-600 rounded-full"></span>
                    Unavailable
                  </span>
                )
              ) : currentProvider === 'assemblyai' ? (
                isAssemblyAILoading ? (
                  <span className="text-gray-500">Initializing...</span>
                ) : isAssemblyAIInitialized ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                    Ready
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-amber-600 rounded-full"></span>
                    Unavailable
                  </span>
                )
              ) : (
                <span className="text-green-600 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 bg-green-600 rounded-full"></span>
                  Ready
                </span>
              )}
            </div>
          </div>
        )}

        {/* Language Selector */}
        <Select value={selectedLanguage} onValueChange={onLanguageChange} disabled={isRecording}>
          <SelectTrigger className="w-[140px] h-8 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hinglish">Hinglish</SelectItem>
            <SelectItem value="hindi">हिंदी (Hindi)</SelectItem>
            <SelectItem value="english">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex-1 bg-white border rounded-lg p-4 overflow-auto">
        {transcript ? (
          <div className="text-sm leading-relaxed text-gray-800">
            <p className="whitespace-pre-wrap">{transcript}</p>
            {interimTranscript && (
              <span className="text-gray-400 italic">{interimTranscript}</span>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Mic className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">
                {isRecording 
                  ? 'Listening... Start speaking'
                  : 'Select language and click "Start Recording" to begin'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Consent Dialog */}
      <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Patient Consent Required</DialogTitle>
            <DialogDescription>
              Before starting the recording, please confirm the following:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 my-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Recording patient conversations requires explicit consent and microphone access.
              </AlertDescription>
            </Alert>
            
            <div className="flex items-start space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <Checkbox 
                id="consent" 
                checked={consentGiven}
                onCheckedChange={(checked: boolean | 'indeterminate') => setConsentGiven(checked === true)}
              />
              <label htmlFor="consent" className="text-sm leading-relaxed cursor-pointer">
                I confirm that the patient has given explicit consent for this conversation to be recorded, 
                transcribed, and processed for medical documentation purposes. The patient understands 
                that this data will be stored securely and used only for their healthcare.
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsentDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConsentAndStart}
              disabled={!consentGiven}
              className="bg-primary hover:bg-primary/90"
            >
              Allow Microphone & Start Recording
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Stethoscope, Settings as SettingsIcon, LogOut, CheckCircle, Save, Loader, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { VisitHistory } from './components/VisitHistory';
import { PatientLifecycle } from './components/PatientLifecycle';
import { Settings } from './components/Settings';
import { PatientSelector } from './components/PatientSelector';
import { LiveTranscription } from './components/LiveTranscription';
import { LivePrescription } from './components/LivePrescription';
import { LLMProviderSelector } from './components/LLMProviderSelector';
import { ModelSelector } from './components/ModelSelector';
import { Button } from './components/ui/button';
import { LoginPage } from './components/LoginPage';
import { SignupPage } from './components/SignupPage';
import { useConsultations } from './hooks/useApi';
import { useMultiProviderLLM } from './hooks/useMultiProviderLLM';
import { medicalAnalysisToPrescription } from './utils/llmConverters';
import { MedicalAnalysisAgent } from './services/agents/MedicalAnalysisAgent';
import { MedicineDatabase } from './services/database/MedicineDatabase';
import { LLMManager } from './services/llm/LLMManager';
import { Patient, Prescription } from './types';
import { toast, Toaster } from 'sonner';

import { AuthProvider, useAuth } from './contexts/AuthContext';

type Tab = 'dashboard' | 'consult' | 'lifecycle' | 'settings';

function AppContent() {
  const { user, loading: authLoading, signOut, isAuthenticated } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('hinglish');
  const [prescription, setPrescription] = useState<Prescription>({
    chiefComplaint: '',
    symptoms: [],
    medicalHistory: '',
    previousMedication: [],
    previousReports: '',
    diagnosis: '',
    medications: [],
    investigations: [],
    advice: '',
    followUp: '',
  });
  const [currentConsultationId, setCurrentConsultationId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isGeneratingLive, setIsGeneratingLive] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<Prescription | null>(null);
  const [liveAnalysisError, setLiveAnalysisError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(() => 
    LLMManager.getDefaultModel('openai')
  );
  const transcriptRef = useRef('');
  const medicalAgentRef = useRef<MedicalAnalysisAgent | null>(null);

  const {
    consultations,
    loading,
    createConsultation,
    updateConsultation,
    fetchConsultations,
  } = useConsultations(selectedPatient?.member_id);

  // Initialize multi-provider LLM
  const llm = useMultiProviderLLM({
    defaultProvider: 'openai',
    apiKeys: {
      openai: import.meta.env.VITE_OPENAI_API_KEY || '',
      claude: import.meta.env.VITE_CLAUDE_API_KEY || '',
      gemini: import.meta.env.VITE_GEMINI_API_KEY || ''
    },
    fallbackProviders: ['openai', 'claude', 'gemini']
  });

  // Update ref when transcript changes
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Convert AI analysis to prescription format
  useEffect(() => {
    if (llm.analysis) {
      const convertedPrescription = medicalAnalysisToPrescription(llm.analysis);
      setAiAnalysis(convertedPrescription);
    }
  }, [llm.analysis]);

  // Live analysis using MedicalAnalysisAgent - triggers every 5 seconds while recording
  useEffect(() => {
    if (!isRecording) {
      // Stop agent if recording stops
      if (medicalAgentRef.current) {
        medicalAgentRef.current.stopAnalysis();
        medicalAgentRef.current.destroy();
        medicalAgentRef.current = null;
      }
      return;
    }

    // Destroy existing agent if provider or model changes
    if (medicalAgentRef.current) {
      medicalAgentRef.current.stopAnalysis();
      medicalAgentRef.current.destroy();
      medicalAgentRef.current = null;
    }

    // Initialize agent when recording starts
    const apiKey = (import.meta.env as any)[`VITE_${llm.activeProvider.toUpperCase()}_API_KEY`];
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    console.log('[App] Agent initialization check:');
    console.log('[App] - activeProvider:', llm.activeProvider);
    console.log('[App] - hasApiKey:', !!apiKey);
    console.log('[App] - supabaseUrl:', supabaseUrl);
    console.log('[App] - hasAnonKey:', !!supabaseAnonKey);
    console.log('[App] - selectedModel:', selectedModel);
    
    if (!medicalAgentRef.current && llm.activeProvider && (apiKey || supabaseUrl)) {
      console.log('🚀 [App] Initializing Medical Analysis Agent with', llm.activeProvider, 'model:', selectedModel);
      console.log('[App] - Using Edge Function:', !!supabaseUrl);
      
      medicalAgentRef.current = new MedicalAnalysisAgent({
        provider: llm.activeProvider,
        apiKey: apiKey || '',
        model: selectedModel,
        analysisIntervalSeconds: 5,
        minTranscriptLength: 30,
        edgeFunctionUrl: supabaseUrl, // Optional: Use Edge Function if Supabase URL is available
        anonKey: supabaseAnonKey, // Pass the anonymous key for authentication
      });
      
      console.log('[App] ✅ Agent created successfully');

      // Start analyzing
      medicalAgentRef.current.startAnalysis(
        () => transcriptRef.current,
        async (result) => {
          setIsGeneratingLive(medicalAgentRef.current?.isCurrentlyAnalyzing() || false);
          
          if (result.error) {
            console.error('Agent analysis error:', result.error);
            setLiveAnalysisError(result.error);
            return;
          }

          if (result.analysis) {
            console.log('✅ Live analysis complete:', {
              chiefComplaint: result.analysis.chiefComplaint?.substring(0, 50),
              medications: result.analysis.medications?.length,
            });

            // Convert to prescription format
            const convertedPrescription: Prescription = {
              chiefComplaint: result.analysis.chiefComplaint || '',
              symptoms: result.analysis.symptoms || [],
              medicalHistory: result.analysis.medicalHistory || '',
              previousMedication: [],
              previousReports: '',
              diagnosis: result.analysis.diagnosis || '',
              medications: result.analysis.medications || [],
              investigations: result.analysis.investigationsSuggested || [],
              advice: result.analysis.instructions?.join('\n') || '',
              followUp: result.analysis.followUp || '',
            };

            setPrescription(convertedPrescription);
            setLiveAnalysisError(null);

            // Optionally enrich medications with composition data
            if (convertedPrescription.medications?.length > 0) {
              const enrichedMeds = await Promise.all(
                convertedPrescription.medications.map(async (med) => ({
                  ...med,
                  medicineInfo: await MedicineDatabase.searchMedicine(med.name),
                }))
              );
              
              // You can store this for display in the UI if needed
              console.log('💊 Enriched medications:', enrichedMeds);
            }
          }
        }
      );
    }

    return () => {
      // Cleanup when component unmounts or recording stops
      if (medicalAgentRef.current) {
        medicalAgentRef.current.stopAnalysis();
      }
    };
  }, [isRecording, llm.activeProvider, selectedModel]);

  const handleRecordingChange = async (recording: boolean) => {
    if (recording) {
      // Only create consultation when recording actually starts (after consent)
      if (!selectedPatient) {
        toast.error('Please select a patient first');
        return;
      }

      try {
        const consultation = await createConsultation({
          memberId: selectedPatient.member_id,
          transcript: '',
          prescription: {},
        });
        setCurrentConsultationId(consultation.consultation_id);
        setIsRecording(true);
        setTranscript('');
        setIsSaved(false);
        toast.success('Consultation started - Recording in progress');
      } catch (error) {
        console.error('Failed to start consultation:', error);
        toast.error('Failed to start consultation');
        return;
      }
    } else {
      setIsRecording(false);
    }
  };

  const handleSaveConsultation = async () => {
    if (!currentConsultationId) {
      toast.error('No active consultation');
      return;
    }

    try {
      await updateConsultation(currentConsultationId, {
        transcript,
        prescription,
        status: 'completed',
      });
      setIsSaved(true);
      toast.success('Consultation saved successfully');
      
      if (selectedPatient) {
        fetchConsultations(selectedPatient.member_id);
      }
    } catch (error) {
      console.error('Failed to save consultation:', error);
      toast.error('Failed to save consultation');
    }
  };

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setTranscript('');
    setPrescription({
      chiefComplaint: '',
      symptoms: [],
      medicalHistory: '',
      previousMedication: [],
      previousReports: '',
      diagnosis: '',
      medications: [],
      investigations: [],
      advice: '',
      followUp: '',
    });
    setCurrentConsultationId(null);
    setIsSaved(false);
    setIsRecording(false);
    // Switch to consult tab when patient is selected from dashboard
    setActiveTab('consult');
  };

  const handleNewConsultation = () => {
    setSelectedPatient(null);
    setTranscript('');
    setPrescription({
      chiefComplaint: '',
      symptoms: [],
      medicalHistory: '',
      previousMedication: [],
      previousReports: '',
      diagnosis: '',
      medications: [],
      investigations: [],
      advice: '',
      followUp: '',
    });
    setCurrentConsultationId(null);
    setIsSaved(false);
    setIsRecording(false);
    setActiveTab('consult');
  };

  // Handle patient selection from lifecycle page
  const handleLifecyclePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'consult', label: 'Consult', icon: Stethoscope },
    { id: 'lifecycle', label: 'Patient Lifecycle', icon: Stethoscope },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fc] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-[#3e65f3] border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login/signup if not authenticated
  if (!isAuthenticated) {
    if (authView === 'login') {
      return <LoginPage onSwitchToSignup={() => setAuthView('signup')} />;
    } else {
      return <SignupPage onSwitchToLogin={() => setAuthView('login')} />;
    }
  }

  // Show main app if authenticated
  return (
    <div className="min-h-screen bg-[#f8f9fc]">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Stethoscope className="h-8 w-8 text-[#3e65f3]" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  AI Clinical Conversation Capture
                </h1>
                <p className="text-xs text-gray-500">
                  Automated patient data capture system
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {activeTab === 'consult' && currentConsultationId && !isSaved && (
                <Button onClick={handleSaveConsultation} className="gap-2 bg-[#3e65f3] hover:bg-[#3e65f3]/90" disabled={loading}>
                  {isSaved ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Consultation
                    </>
                  )}
                </Button>
              )}
              {/* User Info and Logout */}
              <div className="flex items-center gap-3 border-l pl-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.email || user?.phone || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">Doctor</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await signOut();
                      toast.success('Logged out successfully');
                    } catch (error) {
                      toast.error('Failed to log out');
                    }
                  }}
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-[#3e65f3] text-[#3e65f3] bg-blue-50/50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'dashboard' && (
          <Dashboard 
            onPatientSelect={handlePatientSelect}
            onNewConsultation={handleNewConsultation}
          />
        )}

        {activeTab === 'consult' && (
          <div className="space-y-6">
            {/* Patient Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <PatientSelector
                onPatientSelect={handlePatientSelect}
                selectedPatient={selectedPatient}
              />
            </div>

            {/* Consultation Area */}
            {selectedPatient && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Live Transcription (1/3) */}
                  <div className="lg:col-span-1 bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                    {/* Live Transcription */}
                    <LiveTranscription
                      onTranscriptUpdate={setTranscript}
                      isRecording={isRecording}
                      onRecordingChange={handleRecordingChange}
                      selectedLanguage={selectedLanguage}
                      onLanguageChange={setSelectedLanguage}
                    />

                    {/* AI Analysis Button - Now automatic via MedicalAnalysisAgent */}
                    {/* Commented out since live analysis runs every 5 seconds
                    <Button
                      onClick={() => {
                        if (messages.length > 0) {
                          llm.analyzeConsultation(messages, transcript);
                        }
                      }}
                      disabled={
                        llm.isAnalyzing ||
                        llm.getAvailableProviders().length === 0
                      }
                      className="w-full gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      <Zap className="h-4 w-4" />
                      {llm.isAnalyzing ? 'Analyzing...' : 'Analyze with AI'}
                    </Button>
                    */}

                    {llm.error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        {llm.error}
                      </div>
                    )}
                  </div>

                  {/* Right: Live Prescription (2/3) */}
                  <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                    {/* Live Analysis Status Indicators */}
                    {isGeneratingLive && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-center gap-2 animate-pulse">
                        <Loader className="h-4 w-4 text-blue-600 animate-spin" />
                        <span className="text-sm text-blue-700 font-medium">
                          🔄 Live AI analysis in progress with {llm.getProviderName(llm.activeProvider)}...
                        </span>
                      </div>
                    )}

                    {liveAnalysisError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-red-700">
                          {liveAnalysisError}
                        </span>
                      </div>
                    )}

                    {prescription.medications && prescription.medications.length > 0 && (
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700 font-medium">
                          ✨ Live prescription updating with {llm.getProviderName(llm.activeProvider)}
                        </span>
                      </div>
                    )}

                    <LivePrescription
                      prescription={aiAnalysis || prescription}
                      onPrescriptionUpdate={(updated) => {
                        setAiAnalysis(null);
                        setPrescription(updated);
                      }}
                      providerSelector={
                        <LLMProviderSelector
                          activeProvider={llm.activeProvider}
                          onProviderChange={llm.switchProvider}
                          providerStatus={llm.providerStatus}
                          isAnalyzing={isGeneratingLive}
                          compact={true}
                        />
                      }
                      modelSelector={
                        <ModelSelector
                          provider={llm.activeProvider}
                          selectedModel={selectedModel}
                          onModelChange={setSelectedModel}
                          isAnalyzing={isGeneratingLive}
                        />
                      }
                      providerStatus={llm.providerStatus}
                      activeProvider={llm.activeProvider}
                      patientName={selectedPatient.name}
                      memberId={selectedPatient.member_id}
                      patientAge={selectedPatient.age}
                      patientSex={selectedPatient.sex}
                      patientMobile={selectedPatient.mobile}
                      isEditable={!isRecording}
                      isLiveUpdating={isGeneratingLive}
                    />
                  </div>
                </div>

                {/* Visit History */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <VisitHistory
                    consultations={consultations}
                    patientName={selectedPatient.name}
                  />
                </div>
              </>
            )}

            {/* Empty State */}
            {!selectedPatient && (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <Stethoscope className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Select or Create a Patient
                </h3>
                <p className="text-gray-500">
                  Search for an existing patient or create a new one to start the consultation
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lifecycle' && <PatientLifecycle onPatientSelect={handleLifecyclePatientSelect} />}
        {activeTab === 'settings' && <Settings />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
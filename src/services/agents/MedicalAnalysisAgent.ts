/**
 * Medical Analysis Agent
 * Analyzes STT transcript in real-time (every 5 seconds)
 * Supports both Edge Function (recommended) and browser-direct LLM calls
 */

import { LLMManager, type LLMProvider, type MedicalAnalysis } from '@/services/llm/LLMManager';
import { EdgeFunctionLLM } from '@/services/llm/EdgeFunctionLLM';

export interface AgentConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  analysisIntervalSeconds?: number;
  minTranscriptLength?: number;
  edgeFunctionUrl?: string; // Optional: Supabase Edge Function URL for secure analysis
  anonKey?: string; // Optional: Supabase anonymous key for authentication
}

export interface AnalysisResult {
  timestamp: number;
  analysis: MedicalAnalysis | null;
  error: string | null;
  provider: LLMProvider;
}

export class MedicalAnalysisAgent {
  private llmManager: LLMManager | null = null;
  private edgeFunctionLlm: EdgeFunctionLLM | null = null;
  private analysisIntervalMs: number;
  private minTranscriptLength: number;
  private analysisTimer: NodeJS.Timeout | null = null;
  private lastProcessedLength: number = 0;
  private onAnalysisUpdate: ((result: AnalysisResult) => void) | null = null;
  private isAnalyzing: boolean = false;
  private provider: LLMProvider;
  private model: string;

  constructor(config: AgentConfig) {
    this.provider = config.provider;
    this.model = config.model || LLMManager.getDefaultModel(config.provider);
    this.analysisIntervalMs = (config.analysisIntervalSeconds || 5) * 1000;
    this.minTranscriptLength = config.minTranscriptLength || 30;
    
    try {
      if (config.edgeFunctionUrl) {
        // Use Edge Function (recommended)
        this.edgeFunctionLlm = new EdgeFunctionLLM(config.edgeFunctionUrl, config.anonKey);
        console.log('✅ Using Supabase Edge Function for medical analysis');
      } else {
        // Fallback to browser-direct LLM (legacy)
        this.llmManager = new LLMManager({
          provider: config.provider,
          apiKey: config.apiKey,
          model: this.model,
        });
        console.log('⚠️ Using browser-direct LLM (not recommended, may have CORS issues)');
      }
    } catch (error) {
      console.error('Failed to initialize LLM:', error);
    }
  }

  /**
   * Start analyzing transcript with a timer
   */
  startAnalysis(
    transcriptGetter: () => string,
    onUpdate: (result: AnalysisResult) => void
  ) {
    if (this.analysisTimer) {
      console.warn('Analysis already running, stopping previous instance');
      this.stopAnalysis();
    }

    this.onAnalysisUpdate = onUpdate;
    this.lastProcessedLength = 0;

    console.log(`🚀 Medical Analysis Agent started (${this.provider}) - analyzing every ${this.analysisIntervalMs}ms`);

    this.analysisTimer = setInterval(async () => {
      const transcript = transcriptGetter().trim();

      // Skip if no significant content
      if (transcript.length < this.minTranscriptLength) {
        return;
      }

      // Skip if already analyzing
      if (this.isAnalyzing) {
        console.log('⏳ Analysis in progress, skipping this interval');
        return;
      }

      // Skip if no new content
      const newContentLength = transcript.length - this.lastProcessedLength;
      if (newContentLength < 5) {
        return;
      }

      try {
        this.isAnalyzing = true;
        // Notify UI immediately that analysis has started to avoid a perceived delay
        if (this.onAnalysisUpdate) {
          this.onAnalysisUpdate({
            timestamp: Date.now(),
            analysis: null,
            error: null,
            provider: this.provider,
          });
        }
        await this.performAnalysis(transcript);
        this.lastProcessedLength = transcript.length;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Analysis failed:', errorMsg);
        
        if (this.onAnalysisUpdate) {
          this.onAnalysisUpdate({
            timestamp: Date.now(),
            analysis: null,
            error: errorMsg,
            provider: this.provider,
          });
        }
      } finally {
        this.isAnalyzing = false;
      }
    }, this.analysisIntervalMs);
  }

  /**
   * Stop analyzing
   */
  stopAnalysis() {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
      console.log('🛑 Medical Analysis Agent stopped');
    }
    this.isAnalyzing = false;
  }

  /**
   * Perform single analysis
   */
  private async performAnalysis(transcript: string) {
    console.log(`📊 [MedicalAnalysisAgent] Analyzing transcript (${transcript.length} chars) with ${this.provider}...`);
    let analysis: MedicalAnalysis | null = null;
    let errorMsg: string | null = null;

    try {
      if (this.edgeFunctionLlm) {
        console.log('[MedicalAnalysisAgent] Using Edge Function path');
        // Use Edge Function (recommended path)
        analysis = await this.edgeFunctionLlm.analyzeMedical(transcript, this.model);
      } else if (this.llmManager) {
        console.log('[MedicalAnalysisAgent] Using browser-direct LLM path');
        // Fallback to browser-direct
        analysis = await this.llmManager.analyzeConsultation([], transcript);
      } else {
        throw new Error('No LLM service available - neither EdgeFunction nor LLMManager initialized');
      }

      console.log('✅ [MedicalAnalysisAgent] Analysis complete:', {
        chiefComplaint: analysis?.chiefComplaint?.substring(0, 50),
        medications: analysis?.medications?.length,
        investigations: analysis?.investigationsSuggested?.length,
      });
    } catch (error) {
      errorMsg = error instanceof Error ? error.message : String(error);
      console.error('❌ [MedicalAnalysisAgent] Analysis error:', errorMsg);
      console.error('❌ [MedicalAnalysisAgent] Full error:', error);
    } finally {
      // Clear analyzing flag BEFORE notifying UI to avoid race where UI reads the flag still set
      this.isAnalyzing = false;

      if (this.onAnalysisUpdate) {
        this.onAnalysisUpdate({
          timestamp: Date.now(),
          analysis: analysis,
          error: errorMsg,
          provider: this.provider,
        });
      }

      if (errorMsg) {
        // re-throw so upstream callers/timers can handle logging if needed
        throw new Error(errorMsg);
      }
    }
  }

  /**
   * Check if currently analyzing
   */
  isCurrentlyAnalyzing(): boolean {
    return this.isAnalyzing;
  }

  /**
   * Switch LLM provider
   */
  switchProvider(newProvider: LLMProvider, apiKey: string) {
    this.provider = newProvider;
    try {
      this.llmManager = new LLMManager({
        provider: newProvider,
        apiKey,
        model: LLMManager.getDefaultModel(newProvider),
      });
      console.log(`✨ Switched to ${newProvider} provider`);
    } catch (error) {
      console.error('Failed to switch provider:', error);
      throw error;
    }
  }

  /**
   * Destroy agent
   */
  destroy() {
    this.stopAnalysis();
    this.llmManager = null;
    this.edgeFunctionLlm = null;
    this.onAnalysisUpdate = null;
  }
}

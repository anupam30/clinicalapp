/**
 * Multi-Provider LLM Manager
 * Supports: OpenAI, Claude (Anthropic), Google Gemini
 * Browser-only implementation for low latency
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message } from '@/components/LiveTranscription';

export type LLMProvider = 'openai' | 'claude' | 'gemini';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface MedicalAnalysis {
  chiefComplaint: string;
  symptoms: string[];
  medicalHistory: string;
  diagnosis: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
  }>;
  instructions: string[];
  investigationsSuggested: string[];
  followUp: string;
  physicalExamination: string[];
  vitalSigns?: {
    bloodPressure?: string;
    temperature?: string;
    heartRate?: string;
    respiratoryRate?: string;
  };
}

const MEDICAL_ANALYSIS_PROMPT = `You are an expert medical analysis AI specialized in analyzing doctor-patient consultations, particularly for Indian medical context.

Your task: Analyze the doctor-patient conversation and extract structured medical information.

IMPORTANT: Return ONLY valid JSON with NO markdown formatting, NO code blocks, NO explanations. Just pure JSON.

Return this exact JSON structure:
{
  "chiefComplaint": "Main reason for visit",
  "symptoms": ["symptom1", "symptom2"],
  "medicalHistory": "Any past medical conditions mentioned",
  "diagnosis": "Doctor's diagnosis or assessment",
  "medications": [
    {
      "name": "Medicine name (use Indian brand names if mentioned)",
      "dosage": "e.g., 500mg, 10ml",
      "frequency": "e.g., twice daily, once at night",
      "duration": "e.g., 5 days, 2 weeks"
    }
  ],
  "instructions": ["Special instruction 1", "Special instruction 2"],
  "investigationsSuggested": ["Test/Investigation 1"],
  "followUp": "When to come back",
  "physicalExamination": ["Examination done"],
  "vitalSigns": {
    "bloodPressure": "if mentioned",
    "temperature": "if mentioned",
    "heartRate": "if mentioned",
    "respiratoryRate": "if mentioned"
  }
}

Rules:
1. Extract ONLY information explicitly mentioned in the conversation
2. If information is not mentioned, set to empty string or empty array
3. Use Indian medical terminology and brand names
4. Be concise and factual
5. Return ONLY JSON, absolutely NO other text

Conversation transcript:`;

/**
 * LLMManager - Handles multi-provider LLM analysis
 */
export class LLMManager {
  private config: LLMConfig;
  private openaiClient: any;
  private anthropicClient: any;
  private googleClient: any;

  constructor(config: LLMConfig) {
    this.config = config;
    this.initializeClients();
  }

  private initializeClients() {
    switch (this.config.provider) {
      case 'openai':
        this.initializeOpenAI();
        break;
      case 'claude':
        this.initializeAnthropic();
        break;
      case 'gemini':
        this.initializeGoogle();
        break;
    }
  }

  private initializeOpenAI() {
    this.openaiClient = new OpenAI({
      apiKey: this.config.apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  private initializeAnthropic() {
    this.anthropicClient = new Anthropic({
      apiKey: this.config.apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  private initializeGoogle() {
    this.googleClient = new GoogleGenerativeAI(this.config.apiKey);
  }

  async analyzeConsultation(
    messages: Message[],
    transcript: string
  ): Promise<MedicalAnalysis> {
    const conversationText = messages
      .map((m) => `${m.speaker}: ${m.text}`)
      .join('\n');

    const userPrompt = `${MEDICAL_ANALYSIS_PROMPT}

${conversationText}

Full transcript for context:
${transcript}`;

    try {
      // If no API key or client not initialized, use a lightweight local fallback for live updates
      if (this.config.provider === 'openai' && !this.openaiClient) {
        console.warn('[LLMManager] OpenAI client not initialized — using local fallback');
        return this.localFallbackAnalyze(transcript || conversationText);
      }

      switch (this.config.provider) {
        case 'openai':
          return await this.analyzeWithOpenAI(userPrompt);
        case 'claude':
          return await this.analyzeWithClaude(userPrompt);
        case 'gemini':
          return await this.analyzeWithGemini(userPrompt);
        default:
          throw new Error(`Unknown provider: ${this.config.provider}`);
      }
    } catch (error) {
      console.error(`[${this.config.provider}] Analysis failed, falling back locally:`, error);
      // On any LLM failure, provide a best-effort local extraction so UI can show live prescriptions
      return this.localFallbackAnalyze(transcript || conversationText);
    }
  }

  /**
   * Lightweight local extractor used when no LLM is available or as a live partial fallback.
   * It performs simple regex-based extraction for medication names, dosages, frequency and duration.
   */
  localFallbackAnalyze(text: string): MedicalAnalysis {
    const meds: Array<{ name: string; dosage: string; frequency: string; duration: string }> = [];

    // Simple medication pattern: <name> <dosage> <frequency> for <duration>
    const medRegex = /([A-Za-z][A-Za-z0-9\s\-]{1,40}?)(?:,|\s)\s*(\d+\s?mg|\d+\s?ml|\d+g|\d+\s?units)?(?:\s*(once|twice|thrice|\b\d+ times\b|daily|nightly|at night|in the morning))?(?:\s*(?:for|x)\s*(\d+\s*(?:days?|weeks?|months?)))?/gi;

    let match: RegExpExecArray | null;
    while ((match = medRegex.exec(text))) {
      const name = (match[1] || '').trim();
      const dosage = (match[2] || '').trim();
      const frequency = (match[3] || '').trim();
      const duration = (match[4] || '').trim();
      if (name) {
        meds.push({ name, dosage: dosage || '', frequency: frequency || '', duration: duration || '' });
      }
    }

    // Extract chief complaint heuristically: first sentence mentioning pain/fever/cough
    const complainMatch = text.match(/(fever|cough|pain|headache|stomach|vomit|diarrhoea|cold|sore throat)/i);
    const chiefComplaint = complainMatch ? complainMatch[0] : '';

    return {
      chiefComplaint,
      symptoms: [],
      medicalHistory: '',
      diagnosis: '',
      medications: meds,
      instructions: [],
      investigationsSuggested: [],
      followUp: '',
      physicalExamination: [],
      vitalSigns: {},
    } as MedicalAnalysis;
  }

  private async analyzeWithOpenAI(prompt: string): Promise<MedicalAnalysis> {
    const response = await this.openaiClient.chat.completions.create({
      model: this.config.model || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical analysis expert. Return ONLY valid JSON with no markdown or extra text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: this.config.temperature ?? 0.3,
      max_tokens: this.config.maxTokens ?? 1500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    return JSON.parse(content);
  }

  private async analyzeWithClaude(prompt: string): Promise<MedicalAnalysis> {
    const response = await this.anthropicClient.messages.create({
      model: this.config.model || 'claude-3-sonnet-20240229',
      max_tokens: this.config.maxTokens ?? 1500,
      temperature: this.config.temperature ?? 0.3,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0]?.text;
    if (!content) throw new Error('Empty response from Claude');

    // Claude might return with markdown, clean it
    const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedContent);
  }

  private async analyzeWithGemini(prompt: string): Promise<MedicalAnalysis> {
    const model = this.googleClient.getGenerativeModel({
      model: this.config.model || 'gemini-pro'
    });

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: this.config.temperature ?? 0.3,
        maxOutputTokens: this.config.maxTokens ?? 1500
      }
    });

    const content = response.response.text();
    if (!content) throw new Error('Empty response from Gemini');

    // Gemini might return with markdown, clean it
    const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleanedContent);
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      console.log(`[${this.config.provider}] Starting API validation...`);
      
      // First, verify client is initialized
      switch (this.config.provider) {
        case 'openai':
          if (!this.openaiClient) {
            console.error('[openai] Client not initialized');
            return false;
          }
          break;
        case 'claude':
          if (!this.anthropicClient) {
            console.error('[claude] Client not initialized');
            return false;
          }
          break;
        case 'gemini':
          if (!this.googleClient) {
            console.error('[gemini] Client not initialized');
            return false;
          }
          break;
      }

      const testPrompt =
        "Respond with: {\"valid\": true} in JSON format only";

      switch (this.config.provider) {
        case 'openai':
          console.log('[openai] Attempting API call...');
          await this.openaiClient.chat.completions.create({
            model: this.config.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: testPrompt }],
            max_tokens: 50
          });
          console.log('[openai] ✅ Validation successful');
          return true;

        case 'claude':
          console.log('[claude] Attempting API call...');
          await this.anthropicClient.messages.create({
            model: this.config.model || 'claude-3-sonnet-20240229',
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }]
          });
          console.log('[claude] ✅ Validation successful');
          return true;

        case 'gemini':
          console.log('[gemini] Attempting API call...');
          const model = this.googleClient.getGenerativeModel({
            model: this.config.model || 'gemini-pro'
          });
          await model.generateContent(testPrompt);
          console.log('[gemini] ✅ Validation successful');
          return true;

        default:
          console.error(`Unknown provider: ${this.config.provider}`);
          return false;
      }
    } catch (error) {
      console.error(`[${this.config.provider}] Validation error:`, error instanceof Error ? error.message : error);
      if (error instanceof Error) {
        console.error(`[${this.config.provider}] Error details:`, error.stack);
      }
      return false;
    }
  }

  /**
   * Get available models for a provider
   */
  static getAvailableModels(provider: LLMProvider): string[] {
    const models: Record<LLMProvider, string[]> = {
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
      claude: [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ],
      gemini: ['gemini-2.5-pro', 'gemini-pro-latest', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemини-2.5-flash-lite']
    };
    return models[provider] || [];
  }

  /**
   * Get default model for a provider
   */
  static getDefaultModel(provider: LLMProvider): string {
    const defaults: Record<LLMProvider, string> = {
      openai: 'gpt-4o-mini',
      claude: 'claude-3-sonnet-20240229',
      gemini: 'gemini-2.5-flash'
    };
    return defaults[provider];
  }
}

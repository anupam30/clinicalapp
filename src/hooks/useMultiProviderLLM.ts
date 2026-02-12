/**
 * useMultiProviderLLM - React hook for multi-provider LLM analysis
 * Supports OpenAI, Claude, and Gemini with fallback logic
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '@/components/LiveTranscription';
import {
  LLMManager,
  type LLMProvider,
  type MedicalAnalysis
} from '@/services/llm/LLMManager';

interface UseLLMConfig {
  defaultProvider: LLMProvider;
  apiKeys: Record<LLMProvider, string>;
  fallbackProviders?: LLMProvider[];
}

export function useMultiProviderLLM(config: UseLLMConfig) {
  const [analysis, setAnalysis] = useState<MedicalAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<LLMProvider>(
    config.defaultProvider
  );
  const [providerStatus, setProviderStatus] = useState<
    Record<LLMProvider, { valid: boolean; tested: boolean; error?: string }>
  >({
    openai: { valid: false, tested: false },
    claude: { valid: false, tested: false },
    gemini: { valid: false, tested: false }
  });

  const managersRef = useRef<Record<LLMProvider, LLMManager | null>>({
    openai: null,
    claude: null,
    gemini: null
  });

  // Initialize and validate all providers
  useEffect(() => {
    const validateProviders = async () => {
      const providers: LLMProvider[] = ['openai', 'claude', 'gemini'];

      for (const provider of providers) {
        try {
          const apiKey = config.apiKeys[provider];
          if (!apiKey) {
            setProviderStatus((prev) => ({
              ...prev,
              [provider]: {
                valid: false,
                tested: true,
                error: 'No API key provided'
              }
            }));
            continue;
          }

          const manager = new LLMManager({
            provider,
            apiKey,
            model: LLMManager.getDefaultModel(provider)
          });

          managersRef.current[provider] = manager;

          // Optimistically allow providers when an API key is present.
          setProviderStatus((prev) => ({
            ...prev,
            [provider]: {
              valid: true,
              tested: false
            }
          }));

          console.log(`[${provider}] Validating API key...`);
          const isValid = await manager.validateApiKey();

          if (isValid) {
            setProviderStatus((prev) => ({
              ...prev,
              [provider]: {
                valid: true,
                tested: true
              }
            }));
          } else {
            // Browser-side validation can fail due to CORS; keep provider enabled.
            setProviderStatus((prev) => ({
              ...prev,
              [provider]: {
                valid: true,
                tested: true,
                error: 'Validation failed in browser (possible CORS). Will attempt on use.'
              }
            }));
          }

          console.log(
            `[${provider}] Status: ${isValid ? 'VALID' : 'UNVERIFIED'}`
          );

        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[${provider}] Validation error:`, errorMessage);

          setProviderStatus((prev) => ({
            ...prev,
            [provider]: {
              valid: true,
              tested: true,
              error: `Validation failed in browser (possible CORS). Will attempt on use. Details: ${errorMessage}`
            }
          }));
        }
      }
    };

    validateProviders();
  }, [config.apiKeys]);

  /**
   * Analyze consultation with specified provider, with fallback logic
   */
  const analyzeConsultation = useCallback(
    async (
      messages: Message[],
      transcript: string,
      providerOverride?: LLMProvider
    ) => {
      if (!messages.length) {
        setError('No messages to analyze');
        return;
      }

      setIsAnalyzing(true);
      setError(null);

      const primaryProvider = providerOverride || activeProvider;
      const fallbackProviders = config.fallbackProviders || [
        'openai',
        'claude',
        'gemini'
      ];

      // Remove primary from fallback and reorder
      const providersToTry = [
        primaryProvider,
        ...fallbackProviders.filter((p) => p !== primaryProvider)
      ];

      let lastError: Error | null = null;

      for (const provider of providersToTry) {
        try {
          const manager = managersRef.current[provider];

          // Skip if provider not validated
          if (!manager || !providerStatus[provider]?.valid) {
            console.log(`[${provider}] Skipping (not available)`);
            continue;
          }

          console.log(`[${provider}] Analyzing consultation...`);

          const result = await manager.analyzeConsultation(
            messages,
            transcript
          );

          setActiveProvider(provider);
          setAnalysis(result);
          console.log(`[${provider}] ✅ Analysis complete`);

          setIsAnalyzing(false);
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(
            `[${provider}] Failed, trying next provider...`,
            lastError.message
          );
          continue;
        }
      }

      // All providers failed
      const errorMsg = `Analysis failed with all providers. Last error: ${lastError?.message}`;
      setError(errorMsg);
      console.error(errorMsg);
      setIsAnalyzing(false);
    },
    [activeProvider, config.fallbackProviders, providerStatus]
  );

  /**
   * Change active provider
   */
  const switchProvider = useCallback((provider: LLMProvider) => {
    if (providerStatus[provider]?.valid) {
      setActiveProvider(provider);
      setError(null);
    } else {
      setError(`Provider ${provider} is not available`);
    }
  }, [providerStatus]);

  /**
   * Get list of available providers
   */
  const getAvailableProviders = useCallback((): LLMProvider[] => {
    return (['openai', 'claude', 'gemini'] as LLMProvider[]).filter(
      (p) => providerStatus[p]?.valid
    );
  }, [providerStatus]);

  /**
   * Get provider display name
   */
  const getProviderName = (provider: LLMProvider): string => {
    const names: Record<LLMProvider, string> = {
      openai: 'OpenAI (GPT-4)',
      claude: 'Claude (Anthropic)',
      gemini: 'Gemini (Google)'
    };
    return names[provider];
  };

  return {
    // State
    analysis,
    isAnalyzing,
    error,
    activeProvider,
    providerStatus,

    // Actions
    analyzeConsultation,
    switchProvider,

    // Utilities
    getAvailableProviders,
    getProviderName
  };
}

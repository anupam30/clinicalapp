import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { type LLMProvider } from '@/services/llm/LLMManager';

interface LLMProviderSelectorProps {
  activeProvider: LLMProvider;
  onProviderChange: (provider: LLMProvider) => void;
  providerStatus: Record<LLMProvider, { valid: boolean; tested: boolean; error?: string }>;
  isAnalyzing?: boolean;
  compact?: boolean;
}

export function LLMProviderSelector({
  activeProvider,
  onProviderChange,
  providerStatus,
  isAnalyzing,
  compact = false
}: LLMProviderSelectorProps) {
  const providers: LLMProvider[] = ['openai', 'claude', 'gemini'];

  const getProviderLabel = (provider: LLMProvider): string => {
    const labels: Record<LLMProvider, string> = {
      openai: 'GPT-4',
      claude: 'Claude',
      gemini: 'Gemini'
    };
    return labels[provider];
  };

  const availableProviders = providers.filter(
    (p) => providerStatus[p]?.valid
  );

  // Compact mode - just the dropdown (for horizontal layout)
  if (compact) {
    return (
      <Select
        value={activeProvider}
        onValueChange={(value: string) => onProviderChange(value as LLMProvider)}
        disabled={isAnalyzing || availableProviders.length === 0}
      >
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providers.map((provider) => {
            const isAvailable = providerStatus[provider]?.valid;
            return (
              <SelectItem
                key={provider}
                value={provider}
                disabled={!isAvailable}
                className="text-xs"
              >
                {getProviderLabel(provider)}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  // Full mode - with labels (for original layout)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold text-gray-700">
          LLM Provider:
        </label>
        <Select
          value={activeProvider}
          onValueChange={(value: string) => onProviderChange(value as LLMProvider)}
          disabled={isAnalyzing || availableProviders.length === 0}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {providers.map((provider) => {
              const isAvailable = providerStatus[provider]?.valid;
              return (
                <SelectItem
                  key={provider}
                  value={provider}
                  disabled={!isAvailable}
                >
                  <span>{getProviderLabel(provider)}</span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

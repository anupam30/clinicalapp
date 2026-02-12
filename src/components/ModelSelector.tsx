import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { type LLMProvider } from '@/services/llm/LLMManager';
import { LLMManager } from '@/services/llm/LLMManager';

interface ModelSelectorProps {
  provider: LLMProvider;
  selectedModel: string;
  onModelChange: (model: string) => void;
  isAnalyzing?: boolean;
}

export function ModelSelector({
  provider,
  selectedModel,
  onModelChange,
  isAnalyzing = false
}: ModelSelectorProps) {
  const availableModels = LLMManager.getAvailableModels(provider);

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-600 font-medium whitespace-nowrap">Model:</label>
      <Select
        value={selectedModel}
        onValueChange={onModelChange}
        disabled={isAnalyzing}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => (
            <SelectItem key={model} value={model} className="text-xs">
              {model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

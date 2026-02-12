/**
 * Edge Function LLM Service
 * Calls Supabase Edge Function for secure medical analysis
 * - No CORS issues
 * - API keys stay safe on Supabase
 * - Low latency via edge network
 */

import { MedicalAnalysis } from './LLMManager';

export class EdgeFunctionLLM {
  private edgeFunctionUrl: string;
  private anonKey: string;

  constructor(supabaseUrl: string, anonKey?: string) {
    // Format: https://your-project.supabase.co/functions/v1/extract-medical
    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/extract-medical`;
    this.anonKey = anonKey || '';
    console.log('[EdgeFunctionLLM] Initialized with URL:', this.edgeFunctionUrl);
    console.log('[EdgeFunctionLLM] Has auth key:', !!this.anonKey);
  }

  private async retryFetch(url: string, opts: RequestInit, retries = 3, backoff = 300): Promise<Response> {
    let attempt = 0;
    while (true) {
      try {
        const res = await fetch(url, opts);
        if (!res.ok && attempt < retries) {
          attempt++;
          await new Promise((r) => setTimeout(r, backoff * attempt));
          continue;
        }
        return res;
      } catch (err) {
        if (attempt >= retries) throw err;
        attempt++;
        await new Promise((r) => setTimeout(r, backoff * attempt));
      }
    }
  }

  /**
   * Append a streaming chunk to a conversation on the Edge Function.
   * Returns { ok: true, conversationId } on success.
   */
  async appendChunk(conversationId: string, chunk: string, append = true): Promise<any> {
    const body = { conversationId, chunk, append };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.anonKey) headers['Authorization'] = `Bearer ${this.anonKey}`;

    const res = await this.retryFetch(this.edgeFunctionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Append chunk failed: ${res.status} ${text}`);
    }

    return await res.json();
  }

  /**
   * Finalize a conversation and request analysis for the stored transcript.
   */
  async finalizeConversation(conversationId: string, model = 'gpt-4o-mini') {
    const body = { conversationId, finalize: true, model };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.anonKey) headers['Authorization'] = `Bearer ${this.anonKey}`;

    const res = await this.retryFetch(this.edgeFunctionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errText = await res.text();
      try { errText = JSON.parse(errText); } catch {};
      throw new Error(`Finalize failed: ${res.status} ${JSON.stringify(errText)}`);
    }

    return await res.json();
  }

  /**
   * Analyze medical consultation via Edge Function
   */
  async analyzeMedical(
    transcript: string,
    model: string = 'gemini-2.5-pro'
  ): Promise<MedicalAnalysis> {
    try {
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Transcript is empty');
      }

      console.log('[EdgeFunctionLLM] Starting analysis request');
      console.log('[EdgeFunctionLLM] URL:', this.edgeFunctionUrl);
      console.log('[EdgeFunctionLLM] Transcript length:', transcript.length);
      console.log('[EdgeFunctionLLM] Model:', model);
      
      const requestBody = {
        transcript: transcript.trim(),
        model,
      };

      console.log('[EdgeFunctionLLM] Request body prepared');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.anonKey) {
        headers['Authorization'] = `Bearer ${this.anonKey}`;
        console.log('[EdgeFunctionLLM] Adding authorization header');
      }
      
      // Use retryFetch to reduce transient network failures
      const response = await this.retryFetch(this.edgeFunctionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      console.log('[EdgeFunctionLLM] Response received, status:', response.status);

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch (e) {
          const text = await response.text();
          console.error('[EdgeFunctionLLM] Response text:', text);
          errorData = { error: text || response.statusText };
        }

        const errorMsg = `Edge Function error: ${response.status} - ${errorData.error || response.statusText}`;
        console.error('[EdgeFunctionLLM] ERROR:', errorMsg);
        console.error('[EdgeFunctionLLM] Error details:', errorData);
        throw new Error(errorMsg);
      }

      const responseData = await response.json();
      console.log('[EdgeFunctionLLM] Response parsed successfully');

      const { analysis } = responseData;
      
      if (!analysis) {
        console.error('[EdgeFunctionLLM] No analysis in response:', responseData);
        throw new Error('No analysis returned from Edge Function');
      }

      console.log('[EdgeFunctionLLM] ✅ Analysis successful');
      return analysis;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[EdgeFunctionLLM] FATAL ERROR:', errorMsg);
      console.error('[EdgeFunctionLLM] Stack:', error instanceof Error ? error.stack : '');
      throw error;
    }
  }

  /**
   * Validate Edge Function is accessible
   */
  async validate(): Promise<boolean> {
    try {
      console.log('[EdgeFunctionLLM] Validating connectivity...');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (this.anonKey) {
        headers['Authorization'] = `Bearer ${this.anonKey}`;
      }
      
      const response = await fetch(this.edgeFunctionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transcript: 'Test message',
          model: 'gemini-2.5-pro',
        }),
      });

      if (!response.ok) {
        console.error('[EdgeFunctionLLM] Validation failed:', response.status);
        return false;
      }

      console.log('[EdgeFunctionLLM] ✅ Validation successful');
      return true;
    } catch (error) {
      console.error('[EdgeFunctionLLM] Validation error:', error);
      return false;
    }
  }
}

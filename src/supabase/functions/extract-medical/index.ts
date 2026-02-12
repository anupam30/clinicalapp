// @ts-ignore: Deno std import (allowed in runtime, may not be resolvable by TS server)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Supabase client for optional persistence (server-side)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Provide a lightweight declaration for the Deno runtime for TypeScript checks
declare const Deno: any;

interface MedicalAnalysisRequest {
  transcript: string;
  model?: string;
  provider?: string;
}

interface MedicalAnalysis {
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

type LLMProvider = 'openai' | 'gemini' | 'claude';

// Ephemeral in-memory store for streaming/patching of transcripts.
// Note: This does not persist between cold starts or multiple function instances.
// For reliable persistence use a database (Supabase) or external store.
const conversationStore = new Map<string, string>();

// Optional Supabase persistence (requires a table `medical_conversations` in your DB)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
let supabaseClient: any = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log('[extract-medical] Supabase client initialized for persistence');
  } catch (e) {
    console.warn('[extract-medical] Failed to initialize Supabase client:', e);
    supabaseClient = null;
  }
} else {
  console.log('[extract-medical] Supabase persistence not configured (SUPABASE_URL or SERVICE_ROLE_KEY missing)');
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

async function callOpenAI(model: string, transcript: string): Promise<MedicalAnalysis> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  // Server-side lightweight fallback extractor if no API key or calls fail
  function localFallbackAnalyzeServer(text: string): MedicalAnalysis {
    const meds: Array<{ name: string; dosage: string; frequency: string; duration: string }> = [];
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

  if (!apiKey) {
    console.warn('[callOpenAI] OPENAI_API_KEY not configured — using server-side fallback analyzer');
    return localFallbackAnalyzeServer(transcript);
  }

  console.log(`[callOpenAI] Calling OpenAI with model: ${model}`);

  // retry/backoff helper
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const maxAttempts = 3;
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: MEDICAL_ANALYSIS_PROMPT,
            },
            {
              role: "user",
              content: transcript,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        let errorText = await response.text();
        let errorData: any = null;
        try { errorData = JSON.parse(errorText); } catch (_e) { errorData = errorText; }
        console.error(`[callOpenAI] OpenAI API error (attempt ${attempt}):`, errorData);
        lastError = new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        // If not last attempt, wait and retry
        if (attempt < maxAttempts) await sleep(200 * attempt);
        continue;
      }

      const data = await response.json();
      const contentText = data.choices?.[0]?.message?.content;

      if (!contentText) {
        console.error("[callOpenAI] No content in OpenAI response:", data);
        lastError = new Error("Empty response from OpenAI");
        if (attempt < maxAttempts) await sleep(200 * attempt);
        continue;
      }

      console.log(`[callOpenAI] Received response, parsing JSON...`);
      const cleanedContent = contentText.replace(/```json\n?|\n?```/g, "").trim();
      const analysis: MedicalAnalysis = JSON.parse(cleanedContent);
      return analysis;
    } catch (err) {
      console.error(`[callOpenAI] Fetch error (attempt ${attempt}):`, err instanceof Error ? err.message : err);
      lastError = err;
      if (attempt < maxAttempts) await sleep(200 * attempt);
    }
  }

  console.error('[callOpenAI] All attempts failed, falling back to server-side analyzer', lastError);
  return localFallbackAnalyzeServer(transcript);
}

async function validateOpenAI(): Promise<{ ok: boolean; detail?: any }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { ok: false, detail: "OPENAI_API_KEY missing" };

  try {
    const resp = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, detail: text };
    }

    const json = await resp.json();
    return { ok: true, detail: json };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function callGemini(model: string, prompt: string): Promise<MedicalAnalysis> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured in Supabase secrets");
  }

  console.log(`[callGemini] Calling Gemini with model: ${model}`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    console.error("[callGemini] Gemini API error:", errorData);
    throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!contentText) {
    console.error("[callGemini] No content in Gemini response:", data);
    throw new Error("Empty response from Gemini");
  }

  console.log(`[callGemini] Received response, parsing JSON...`);
  
  // Clean markdown if present
  const cleanedContent = contentText.replace(/```json\n?|\n?```/g, "").trim();
  const analysis: MedicalAnalysis = JSON.parse(cleanedContent);
  
  return analysis;
}

serve(async (req: Request) => {
  // Enable CORS
  if (req.method === "OPTIONS") {
    return new Response("OK", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Support GET for a quick OpenAI validation check
  if (req.method === "GET") {
    const validation = await validateOpenAI();
    return new Response(JSON.stringify({ validation }), {
      status: validation.ok ? 200 : 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      transcript: incomingTranscript,
      model = "gpt-4o-mini",
      provider,
      conversationId,
      chunk,
      append = false,
      finalize = false,
    } = body as any;

    // If client sends a chunk with conversationId, append or overwrite the stored transcript
    if (conversationId && typeof chunk === 'string') {
      const existing = conversationStore.get(conversationId) || '';
      const updated = append && existing ? (existing + '\n' + chunk) : chunk;
      conversationStore.set(conversationId, updated);

      // Persist to Supabase if client configured (upsert)
      if (supabaseClient) {
        try {
          await supabaseClient
            .from('medical_conversations')
            .upsert({ id: conversationId, transcript: updated, finalized: false, updated_at: new Date().toISOString() });
        } catch (e) {
          console.error('[extract-medical] Supabase upsert failed:', e instanceof Error ? e.message : e);
        }
      }

      // If not finalizing, acknowledge the patch
      if (!finalize) {
        return new Response(JSON.stringify({ ok: true, conversationId }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      // if finalize is true, fall through to analysis using the stored transcript
    }

    // Choose transcript: stored (if conversationId) or incoming
    const transcript = (conversationId && conversationStore.get(conversationId)) || incomingTranscript;

    if (!transcript || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Transcript is required and cannot be empty" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Detect provider from model name if not explicitly provided
    let detectedProvider: LLMProvider = (provider as LLMProvider) || 'gemini';
    if (!provider) {
      if (model.includes('gpt')) {
        detectedProvider = 'openai';
      } else if (model.includes('claude')) {
        detectedProvider = 'claude';
      } else {
        detectedProvider = 'gemini';
      }
    }

    console.log(`[extract-medical] Processing with provider: ${detectedProvider}, model: ${model}`);

    // Clip transcript to reasonable size to avoid huge requests
    const MAX_TRANSCRIPT_CHARS = 20000;
    const clippedTranscript = transcript.length > MAX_TRANSCRIPT_CHARS ? transcript.slice(-MAX_TRANSCRIPT_CHARS) : transcript;

    let analysis: MedicalAnalysis;

    if (detectedProvider === 'openai') {
      analysis = await callOpenAI(model, clippedTranscript);
    } else if (detectedProvider === 'gemini') {
      analysis = await callGemini(model, clippedTranscript);
    } else {
      throw new Error(`Unsupported provider: ${detectedProvider}`);
    }

    // If we finalized this conversation, delete its stored transcript
    if (conversationId && finalize) {
      conversationStore.delete(conversationId);
      // Persist final transcript/analysis to Supabase (if available)
      if (supabaseClient) {
        try {
          await supabaseClient
            .from('medical_conversations')
            .update({ transcript: clippedTranscript, finalized: true, analysis: JSON.stringify(analysis), finalized_at: new Date().toISOString() })
            .eq('id', conversationId);
        } catch (e) {
          console.error('[extract-medical] Supabase finalize update failed:', e instanceof Error ? e.message : e);
        }
      }
    }

    return new Response(
      JSON.stringify({ analysis }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in extract-medical function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

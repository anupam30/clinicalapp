// @ts-ignore: Deno std import (allowed in runtime, may not be resolvable by TS server)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Supabase client for optional persistence (server-side)
// @ts-ignore: remote CDN import may not resolve in local TS server but is valid in Deno runtime
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Provide a lightweight declaration for the Deno runtime for TypeScript checks
declare const Deno: any;

interface MedicalAnalysisRequest {
  transcript: string;
  model?: string;
  provider?: string;
  promptOverride?: string;
}

interface MedicalAnalysis {
  chiefComplaint: string;
  symptoms: string[];
  chief_complaints?: string[] | null;
  duration_of_symptoms?: string | null;
  past_medical_history?: string[] | null;
  medication_history?: Array<{ name: string; dosage?: string | null; frequency?: string | null; duration?: string | null }> | null;
  allergies?: string[] | null;
  clinical_findings?: string[] | null;
  medicalHistory: string;
  diagnosis: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    timing?: string | null;
    composition?: string[] | null;
  }>;
  medications_prescribed?: Array<{
    name: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    timing: string | null;
    composition: string[] | null;
  }> | null;
  instructions: string[];
  advice?: string[] | null;
  investigationsSuggested: string[];
  followUp: string;
  follow_up_instructions?: string | null;
  physicalExamination: string[];
  vitalSigns?: {
    bloodPressure?: string;
    temperature?: string;
    heartRate?: string;
    respiratoryRate?: string;
  };
}

type LLMProvider = 'openai';

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

const DEFAULT_MEDICAL_ANALYSIS_PROMPT = `You are a clinical documentation AI assistant.

Your task is to analyze a doctor-patient conversation transcript and extract structured medical information.

You must rely on semantic understanding, medical reasoning, and full conversational context.
Do NOT use rule-based word matching.
Do NOT guess missing facts.
Do NOT invent medications or diagnoses.
Only extract what is clearly stated or strongly implied by medical reasoning.
If something is not mentioned, return null.

IMPORTANT: Return ONLY valid JSON with no markdown and no extra text.

Return this exact JSON structure:
{
  "chiefComplaint": "Main reason for visit or null",
  "symptoms": ["symptom1", "symptom2"],
  "chief_complaints": ["complaint 1", "complaint 2"],
  "duration_of_symptoms": "duration string or null",
  "past_medical_history": ["history item"] or null,
  "medication_history": [{"name":"...","dosage":"...","frequency":"...","duration":"..."}] or null,
  "allergies": ["allergy"] or null,
  "clinical_findings": ["doctor observation"] or null,
  "medicalHistory": "Any past medical conditions mentioned",
  "diagnosis": "Doctor's diagnosis or assessment",
  "medications": [
    {
      "name": "Medicine name",
      "dosage": "e.g., 500mg, 10ml (must include units)",
      "frequency": "e.g., twice daily",
      "duration": "e.g., 5 days",
      "timing": "before meal|after meal|with food|at bedtime|null",
      "composition": ["salt/composition if known"]
    }
  ],
  "medications_prescribed": [
    {
      "name": "Medicine name",
      "dosage": "with units or null",
      "frequency": "frequency or null",
      "duration": "duration or null",
      "timing": "before meal|after meal|with food|at bedtime|null",
      "composition": ["salt/composition if known"] or null
    }
  ],
  "instructions": ["Special instruction 1", "Special instruction 2"],
  "advice": ["hydration/rest/diet/lifestyle advice"] or null,
  "investigationsSuggested": ["Test/Investigation 1"],
  "followUp": "When to come back",
  "follow_up_instructions": "Timeline and follow-up instructions or null",
  "physicalExamination": ["Examination done"],
  "vitalSigns": {
    "bloodPressure": "if mentioned",
    "temperature": "if mentioned",
    "heartRate": "if mentioned",
    "respiratoryRate": "if mentioned"
  }
}

Rules:
1. Extract only what is stated or strongly implied by clinical context.
2. If missing, return null (not guessed values).
3. Extract only real medicines prescribed by doctor.
4. Do not include conversational words/fillers.
5. Dosage must include units; parse frequency/duration if implied.
6. Do not split one medicine into multiple entries.
7. Include lifestyle advice and follow-up timeline when present.
8. Keep both legacy fields and new fields populated consistently.

Conversation transcript:`;

function resolveMedicalPrompt(promptOverride?: string): string {
  const envPrompt = Deno.env.get("MEDICAL_ANALYSIS_SYSTEM_PROMPT");
  if (promptOverride && promptOverride.trim().length > 0) return promptOverride;
  if (envPrompt && envPrompt.trim().length > 0) return envPrompt;
  return DEFAULT_MEDICAL_ANALYSIS_PROMPT;
}

async function callOpenAI(model: string, transcript: string, promptOverride?: string): Promise<MedicalAnalysis> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const systemPrompt = resolveMedicalPrompt(promptOverride);

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
              content: systemPrompt,
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

// Gemini support removed — OpenAI is the only provider used by the function now.

serve(async (req: Request) => {
  // Small helper to mask sensitive headers for logs
  function maskHeaders(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of headers.entries()) {
      if (k.toLowerCase() === 'authorization' || k.toLowerCase().includes('key')) {
        out[k] = v ? 'REDACTED' : '';
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  // Read raw body once so we can both log a preview and parse JSON safely
  let rawBody = '';
  try {
    rawBody = await req.text();
  } catch (e) {
    rawBody = '';
  }

  // Log incoming request (redacting sensitive headers)
  try {
    console.log('[extract-medical] Incoming request', {
      method: req.method,
      url: (req as any).url || 'unknown',
      headers: maskHeaders(req.headers),
      bodyPreview: rawBody ? (rawBody.length > 2000 ? rawBody.slice(0, 2000) + '...[truncated]' : rawBody) : '',
    });
  } catch (e) {
    console.warn('[extract-medical] Failed to log incoming request:', e instanceof Error ? e.message : e);
  }

  // Enable CORS
  if (req.method === "OPTIONS") {
    return new Response("OK", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    // Parse JSON from the raw body we already read above
    let body: any = {};
    try {
      body = rawBody && rawBody.length > 0 ? JSON.parse(rawBody) : {};
    } catch (e) {
      console.warn('[extract-medical] Failed to parse JSON body:', e instanceof Error ? e.message : e);
      body = {};
    }

    const {
      transcript: incomingTranscript,
      model = "gpt-4o-mini",
      provider,
      promptOverride,
      conversationId,
      chunk,
      append = false,
      finalize = false,
    } = body as any;

    // Additional debug log for commonly used fields
    console.log('[extract-medical] Parsed request fields', {
      conversationId: conversationId || null,
      hasChunk: typeof chunk === 'string',
      append,
      finalize,
      model,
      provider,
      hasPromptOverride: !!promptOverride,
      incomingTranscriptPreview: incomingTranscript ? (incomingTranscript.length > 500 ? incomingTranscript.slice(0, 500) + '...[truncated]' : incomingTranscript) : null,
    });

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

    // Choose transcript: prefer in-memory store, otherwise fall back to DB (if available), otherwise incoming
    let transcript = (conversationId && conversationStore.get(conversationId)) || incomingTranscript;

    // If no transcript in-memory and we have a Supabase client, try to fetch the persisted transcript
    if ((!transcript || transcript.trim().length === 0) && conversationId && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('medical_conversations')
          .select('transcript')
          .eq('id', conversationId)
          .single();
        if (!error && data && data.transcript) {
          transcript = data.transcript;
          console.log('[extract-medical] Loaded transcript from DB for', conversationId);
        }
      } catch (e) {
        console.warn('[extract-medical] Failed to load transcript from DB:', e instanceof Error ? e.message : e);
      }
    }

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

    // Use OpenAI for analysis
    const detectedProvider: LLMProvider = 'openai';
    console.log(`[extract-medical] Processing with provider: ${detectedProvider}, model: ${model}`);

    // Clip transcript to reasonable size to avoid huge requests
    const MAX_TRANSCRIPT_CHARS = 20000;
    const clippedTranscript = transcript.length > MAX_TRANSCRIPT_CHARS ? transcript.slice(-MAX_TRANSCRIPT_CHARS) : transcript;

    let analysis: MedicalAnalysis;

    // Only OpenAI provider is supported here
    analysis = await callOpenAI(model, clippedTranscript, promptOverride);

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

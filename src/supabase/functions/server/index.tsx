import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Create Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Initialize database tables
async function initializeTables() {
  try {
    // Tables likely already exist, just add user_id column if missing
    await supabase.rpc('exec_sql', {
      sql: `
        -- Add user_id column to member_data if it doesn't exist
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'member_data' AND column_name = 'user_id'
          ) THEN
            ALTER TABLE member_data ADD COLUMN user_id UUID;
          END IF;
        END $$;

        -- Add user_id column to consultations if it doesn't exist
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'consultations' AND column_name = 'user_id'
          ) THEN
            ALTER TABLE consultations ADD COLUMN user_id UUID;
          END IF;
        END $$;

        -- Add user_id column to doctor_settings if it doesn't exist
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'doctor_settings' AND column_name = 'user_id'
          ) THEN
            ALTER TABLE doctor_settings ADD COLUMN user_id UUID;
          END IF;
        END $$;

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_member_user ON member_data(user_id);
        CREATE INDEX IF NOT EXISTS idx_consultation_user ON consultations(user_id);
        CREATE INDEX IF NOT EXISTS idx_doctor_settings_user ON doctor_settings(user_id);
      `
    }).catch(e => {
      console.log('Database update note:', e.message);
      // RPC might not be available, user will run RLS_SETUP.sql manually
    });
  } catch (error) {
    console.log('Database initialization note:', error.message);
  }
}

// Initialize tables on startup
initializeTables();

// Helper function to get user from JWT token
async function getUserFromToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      console.log('Auth error:', error?.message || 'No user found');
      return null;
    }
    return data.user.id;
  } catch (error) {
    console.log('Error validating token:', error);
    return null;
  }
}

// Health check endpoint (no auth required)
app.get("/make-server-ae2bff40/health", (c) => {
  return c.json({ status: "ok" });
});

// Helper function to generate member ID based on phone number
function generateMemberId(mobile: string, count: number): string {
  // Format: M<last4digits><count>
  const last4 = mobile.slice(-4);
  return `M${last4}${String(count).padStart(3, '0')}`;
}

// ========================================
// PROTECTED ROUTES (REQUIRE AUTHENTICATION)
// ========================================

// Member Routes (PROTECTED)
app.post("/make-server-ae2bff40/members", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const body = await c.req.json();
    const { name, age, sex, mobile, email, address, blood_group, family_history, allergies } = body;

    if (!name || !age || !sex || !mobile) {
      return c.json({ error: "Missing required fields: name, age, sex, mobile" }, 400);
    }

    // Check if member with same name and mobile already exists for THIS USER
    const { data: existingMember } = await supabase
      .from('member_data')
      .select('*')
      .eq('user_id', userId)
      .eq('mobile', mobile)
      .eq('name', name)
      .single();

    if (existingMember) {
      return c.json({ error: "Patient already exists with this name and mobile number" }, 400);
    }

    // Count existing members with same mobile FOR THIS USER
    const { data: existingMembers, count } = await supabase
      .from('member_data')
      .select('*', { count: 'exact', head: false })
      .eq('user_id', userId)
      .eq('mobile', mobile);

    const memberCount = (count || 0) + 1;
    const memberId = generateMemberId(mobile, memberCount);

    // Insert new member WITH user_id
    const { data: member, error } = await supabase
      .from('member_data')
      .insert({
        member_id: memberId,
        user_id: userId, // ← CRITICAL: Link to authenticated user
        name,
        age,
        sex,
        mobile,
        email,
        address,
        blood_group,
        family_history,
        allergies,
      })
      .select()
      .single();

    if (error) {
      console.log('Error creating member:', error);
      return c.json({ error: `Failed to create member: ${error.message}` }, 500);
    }

    if (!member) {
      console.log('Member was not created - empty response');
      return c.json({ error: 'Failed to create member - no data returned' }, 500);
    }

    return c.json({ success: true, member });
  } catch (error) {
    console.log(`Error creating member: ${error}`);
    return c.json({ error: `Failed to create member: ${(error as any).message}` }, 500);
  }
});

app.get("/make-server-ae2bff40/members/search", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const query = c.req.query("q");
    
    if (!query || query.trim().length === 0) {
      return c.json({ members: [] });
    }

    // Search ONLY this user's members
    const { data: members, error } = await supabase
      .from('member_data')
      .select('*')
      .eq('user_id', userId) // ← CRITICAL: Filter by user
      .or(`member_id.ilike.%${query}%,name.ilike.%${query}%,mobile.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.log('Error searching members:', error);
      return c.json({ error: `Failed to search members: ${error.message}` }, 500);
    }

    return c.json({ members: members || [] });
  } catch (error) {
    console.log(`Error searching members: ${error}`);
    return c.json({ error: `Failed to search members: ${error.message}` }, 500);
  }
});

app.get("/make-server-ae2bff40/members/:id", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const memberId = c.req.param("id");
    
    // Get member ONLY if belongs to this user
    const { data: member, error } = await supabase
      .from('member_data')
      .select('*')
      .eq('member_id', memberId)
      .eq('user_id', userId) // ← CRITICAL: Verify ownership
      .single();

    if (error || !member) {
      return c.json({ error: "Member not found" }, 404);
    }

    return c.json({ member });
  } catch (error) {
    console.log(`Error fetching member: ${error}`);
    return c.json({ error: `Failed to fetch member: ${error.message}` }, 500);
  }
});

app.get("/make-server-ae2bff40/members", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    // Get ONLY this user's members
    const { data: members, error } = await supabase
      .from('member_data')
      .select('*')
      .eq('user_id', userId) // ← CRITICAL: Filter by user
      .order('created_at', { ascending: false });

    if (error) {
      console.log('Error fetching all members:', error);
      return c.json({ error: `Failed to fetch members: ${error.message}` }, 500);
    }

    return c.json({ members: members || [] });
  } catch (error) {
    console.log(`Error fetching members: ${error}`);
    return c.json({ error: `Failed to fetch members: ${error.message}` }, 500);
  }
});

// Consultation Routes (PROTECTED)
app.post("/make-server-ae2bff40/consultations", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const body = await c.req.json();
    const { memberId, transcript, prescription, status } = body;

    if (!memberId) {
      return c.json({ error: "Member ID is required" }, 400);
    }

    // Verify member exists AND belongs to this user
    const { data: member } = await supabase
      .from('member_data')
      .select('member_id')
      .eq('member_id', memberId)
      .eq('user_id', userId) // ← CRITICAL: Verify ownership
      .single();

    if (!member) {
      return c.json({ error: "Member not found or access denied" }, 404);
    }

    const consultationId = `CONS${Date.now()}`;

    // Insert consultation WITH user_id
    const { data: consultation, error } = await supabase
      .from('consultations')
      .insert({
        consultation_id: consultationId,
        user_id: userId, // ← CRITICAL: Link to authenticated user
        member_id: memberId,
        transcript: transcript || "",
        prescription: prescription || {},
        status: status || 'ongoing',
      })
      .select()
      .single();

    if (error) {
      console.log('Error creating consultation:', error);
      return c.json({ error: `Failed to create consultation: ${error.message}` }, 500);
    }

    if (!consultation) {
      console.log('Consultation was not created - empty response');
      return c.json({ error: 'Failed to create consultation - no data returned' }, 500);
    }

    return c.json({ success: true, consultation });
  } catch (error) {
    console.log(`Error creating consultation: ${error}`);
    return c.json({ error: `Failed to create consultation: ${(error as any).message}` }, 500);
  }
});

app.put("/make-server-ae2bff40/consultations/:id", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const consultationId = c.req.param("id");
    const body = await c.req.json();

    // Update ONLY if belongs to this user
    const { data: consultation, error } = await supabase
      .from('consultations')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('consultation_id', consultationId)
      .eq('user_id', userId) // ← CRITICAL: Verify ownership
      .select()
      .single();

    if (error) {
      console.log('Error updating consultation:', error);
      return c.json({ error: `Failed to update consultation: ${error.message}` }, 500);
    }

    if (!consultation) {
      return c.json({ error: "Consultation not found or access denied" }, 404);
    }

    return c.json({ success: true, consultation });
  } catch (error) {
    console.log(`Error updating consultation: ${error}`);
    return c.json({ error: `Failed to update consultation: ${(error as any).message}` }, 500);
  }
});

app.get("/make-server-ae2bff40/consultations/:id", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const consultationId = c.req.param("id");

    // Get ONLY if belongs to this user
    const { data: consultation, error } = await supabase
      .from('consultations')
      .select('*')
      .eq('consultation_id', consultationId)
      .eq('user_id', userId) // ← CRITICAL: Verify ownership
      .single();

    if (error || !consultation) {
      return c.json({ error: "Consultation not found or access denied" }, 404);
    }

    return c.json({ consultation });
  } catch (error) {
    console.log(`Error fetching consultation: ${error}`);
    return c.json({ error: `Failed to fetch consultation: ${error.message}` }, 500);
  }
});

app.get("/make-server-ae2bff40/members/:id/consultations", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const memberId = c.req.param("id");

    // Get consultations ONLY for this user's patient
    const { data: consultations, error } = await supabase
      .from('consultations')
      .select('*')
      .eq('member_id', memberId)
      .eq('user_id', userId) // ← CRITICAL: Filter by user
      .order('created_at', { ascending: false });

    if (error) {
      console.log('Error fetching consultations:', error);
      return c.json({ error: `Failed to fetch consultations: ${error.message}` }, 500);
    }

    return c.json({ consultations: consultations || [] });
  } catch (error) {
    console.log(`Error fetching member consultations: ${error}`);
    return c.json({ error: `Failed to fetch consultations: ${error.message}` }, 500);
  }
});

// Dashboard KPIs (PROTECTED)
app.get("/make-server-ae2bff40/dashboard/kpis", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const period = c.req.query("period") || "day"; // day, week, month
    
    let dateFilter = new Date();
    if (period === "day") {
      dateFilter.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      dateFilter.setDate(dateFilter.getDate() - 7);
    } else if (period === "month") {
      dateFilter.setMonth(dateFilter.getMonth() - 1);
    }

    // Total members registered in period FOR THIS USER
    const { count: registeredCount } = await supabase
      .from('member_data')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId) // ← CRITICAL: Filter by user
      .gte('created_at', dateFilter.toISOString());

    // Total consultations in period FOR THIS USER
    const { count: visitedCount } = await supabase
      .from('consultations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId) // ← CRITICAL: Filter by user
      .gte('created_at', dateFilter.toISOString());

    // Ongoing consultations FOR THIS USER
    const { count: followUpCount } = await supabase
      .from('consultations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId) // ← CRITICAL: Filter by user
      .eq('status', 'ongoing');

    // Total members ever FOR THIS USER
    const { count: totalMembers } = await supabase
      .from('member_data')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId); // ← CRITICAL: Filter by user

    return c.json({
      period,
      registered: registeredCount || 0,
      visited: visitedCount || 0,
      followUpPending: followUpCount || 0,
      totalMembers: totalMembers || 0,
    });
  } catch (error) {
    console.log(`Error fetching KPIs: ${error}`);
    return c.json({ error: `Failed to fetch KPIs: ${error.message}` }, 500);
  }
});

// AI Prescription Generation Route
app.post("/make-server-ae2bff40/generate-prescription", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const body = await c.req.json();
    const { transcript } = body;

    if (!transcript || transcript.trim().length === 0) {
      return c.json({ error: "Transcript is required" }, 400);
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    
    if (!geminiApiKey) {
      return c.json({ error: "Gemini API key not configured" }, 500);
    }

    // Call Gemini API to extract structured prescription
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a medical AI assistant. Extract structured prescription information from the following doctor-patient conversation transcript. 

Transcript:
${transcript}

Please extract and return ONLY a valid JSON object with the following structure (do not include any markdown formatting or code blocks):
{
  "chiefComplaint": "main problem patient is facing",
  "symptoms": ["symptom1", "symptom2"],
  "medicalHistory": "relevant past medical history",
  "previousMedication": ["med1", "med2"],
  "previousReports": "any previous tests or investigations mentioned",
  "diagnosis": "doctor's diagnosis or analysis",
  "medications": [
    {
      "name": "medicine name",
      "dosage": "dosage amount",
      "frequency": "how often",
      "duration": "how long"
    }
  ],
  "investigations": ["test1", "test2"],
  "advice": "general advice given",
  "followUp": "follow-up instructions"
}

Return only valid JSON without any additional text or markdown.`
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.log(`Gemini API error: ${errorText}`);
      return c.json({ error: "Failed to generate prescription from AI" }, 500);
    }

    const geminiData = await geminiResponse.json();
    let prescriptionText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    // Clean up the response - remove markdown code blocks if present
    prescriptionText = prescriptionText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const prescription = JSON.parse(prescriptionText);

    return c.json({ success: true, prescription });
  } catch (error) {
    console.log(`Error generating prescription: ${error}`);
    return c.json({ error: `Failed to generate prescription: ${error.message}` }, 500);
  }
});

// NEW: Live/Streaming prescription generation - returns partial prescription as conversation progresses
app.post("/make-server-ae2bff40/generate-prescription-live", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const body = await c.req.json();
    const { transcript } = body;

    console.log('📥 Live prescription request - Transcript length:', transcript?.length || 0);

    // Return empty prescription if transcript is too short
    if (!transcript || transcript.trim().length < 10) {
      console.log('⚠️ Transcript too short, returning empty prescription');
      return c.json({ 
        success: true, 
        prescription: {
          chiefComplaint: "",
          symptoms: [],
          medicalHistory: "",
          previousMedication: [],
          previousReports: "",
          diagnosis: "",
          medications: [],
          investigations: [],
          advice: "",
          followUp: ""
        }
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    
    if (!geminiApiKey) {
      console.log('⚠️ GEMINI_API_KEY not found - Using RULE-BASED EXTRACTION');
      
      // FALLBACK: Rule-based extraction without AI
      const prescription = extractPrescriptionRuleBased(transcript);
      console.log('✅ Rule-based extraction complete:', prescription);
      return c.json({ success: true, prescription, method: 'rule-based' });
    }

    console.log('🤖 Calling Gemini API for live extraction...');

    // Call Gemini API with a modified prompt for live extraction
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a medical AI assistant extracting medical information from a doctor-patient conversation transcript.

The transcript is a continuous conversation without speaker labels. Infer who is speaking based on:
- First-person statements ("I have", "I'm") = Patient
- Medical commands/questions ("Take this", "Did you", "Any pain?") = Doctor
- Complaints and symptoms = Patient
- Diagnosis and treatment advice = Doctor

Extract information ONLY from what has been said so far (the conversation may be ongoing).

Transcript (ongoing conversation):
${transcript}

Return ONLY valid JSON (no markdown) with this structure:
{
  "chiefComplaint": "main reason for visit or complaint",
  "symptoms": ["list of symptoms mentioned by patient"],
  "medicalHistory": "past medical conditions or history if mentioned",
  "previousMedication": ["current medications patient is taking"],
  "previousReports": "previous lab reports or test results if discussed",
  "diagnosis": "doctor's diagnosis if stated",
  "medications": [
    {
      "name": "medicine name",
      "dosage": "dosage amount",
      "frequency": "how often to take",
      "duration": "how long to take"
    }
  ],
  "investigations": ["lab tests or investigations recommended"],
  "advice": "doctor's advice and instructions",
  "followUp": "follow-up appointment details if mentioned"
}

Important:
- Leave arrays as [] if no information given
- Leave strings as "" if no information given
- Extract ONLY what is explicitly mentioned
- Be concise and accurate
- Return ONLY JSON, no additional text`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 20,
            topP: 0.9,
            maxOutputTokens: 2048,
          }
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.log(`❌ Gemini API error (live): ${errorText}`);
      
      // FALLBACK to rule-based extraction
      console.log('⚠️ Falling back to rule-based extraction');
      const prescription = extractPrescriptionRuleBased(transcript);
      return c.json({ success: true, prescription, method: 'rule-based-fallback' });
    }

    const geminiData = await geminiResponse.json();
    let prescriptionText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    console.log('📄 Raw Gemini response:', prescriptionText);
    
    // Clean up the response
    prescriptionText = prescriptionText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      const prescription = JSON.parse(prescriptionText);
      console.log('✅ Prescription extracted successfully:', prescription);
      return c.json({ success: true, prescription, isLive: true, method: 'gemini' });
    } catch (parseError) {
      console.log(`❌ JSON parse error (live): ${parseError}`);
      console.log('Raw text that failed to parse:', prescriptionText);
      
      // FALLBACK to rule-based extraction
      console.log('⚠️ Falling back to rule-based extraction');
      const prescription = extractPrescriptionRuleBased(transcript);
      return c.json({ success: true, prescription, method: 'rule-based-fallback' });
    }
  } catch (error) {
    console.log(`❌ Error in live prescription generation: ${error}`);
    
    // FALLBACK to rule-based extraction
    try {
      const prescription = extractPrescriptionRuleBased(transcript || '');
      return c.json({ success: true, prescription, method: 'rule-based-error-fallback' });
    } catch (fallbackError) {
      // Return empty prescription as last resort
      return c.json({ 
        success: true, 
        prescription: {
          chiefComplaint: "",
          symptoms: [],
          medicalHistory: "",
          previousMedication: [],
          previousReports: "",
          diagnosis: "",
          medications: [],
          investigations: [],
          advice: "",
          followUp: ""
        },
        method: 'empty-fallback'
      });
    }
  }
});

// Rule-based extraction function (works WITHOUT any API)
function extractPrescriptionRuleBased(transcript: string) {
  const lines = transcript.split('\n').filter(l => l.trim());
  const lowerTranscript = transcript.toLowerCase();
  
  let chiefComplaint = "";
  const symptoms: string[] = [];
  let medicalHistory = "";
  const previousMedication: string[] = [];
  let diagnosis = "";
  const medications: any[] = [];
  const investigations: string[] = [];
  let advice = "";
  let followUp = "";
  
  // Extract Chief Complaint (from Patient lines with symptoms)
  const symptomKeywords = ['dard', 'pain', 'bukhar', 'fever', 'khasi', 'cough', 'ulti', 'vomit', 'chakkar', 'dizzy', 'kamzori', 'weakness', 'problem', 'issue'];
  for (const line of lines) {
    if (line.startsWith('Patient:')) {
      const text = line.replace('Patient:', '').trim();
      for (const keyword of symptomKeywords) {
        if (text.toLowerCase().includes(keyword)) {
          if (!chiefComplaint) {
            chiefComplaint = text;
          }
          
          // Extract specific symptoms
          if (text.toLowerCase().includes('bukhar') || text.toLowerCase().includes('fever')) {
            if (!symptoms.includes('Fever')) symptoms.push('Fever');
          }
          if (text.toLowerCase().includes('dard') || text.toLowerCase().includes('pain')) {
            if (!symptoms.includes('Pain')) symptoms.push('Pain');
          }
          if (text.toLowerCase().includes('kamzori') || text.toLowerCase().includes('weakness')) {
            if (!symptoms.includes('Weakness')) symptoms.push('Weakness');
          }
          if (text.toLowerCase().includes('khasi') || text.toLowerCase().includes('cough')) {
            if (!symptoms.includes('Cough')) symptoms.push('Cough');
          }
          break;
        }
      }
    }
  }
  
  // Extract Medical History (diabetes, BP, etc.)
  const historyKeywords = ['diabetes', 'bp', 'blood pressure', 'sugar', 'thyroid', 'asthma'];
  for (const line of lines) {
    if (line.startsWith('Patient:')) {
      const text = line.replace('Patient:', '').trim().toLowerCase();
      for (const keyword of historyKeywords) {
        if (text.includes(keyword)) {
          medicalHistory += (medicalHistory ? ', ' : '') + keyword;
        }
      }
    }
  }
  
  // Extract Diagnosis (from Doctor lines)
  const diagnosisKeywords = ['viral', 'bacterial', 'infection', 'gastritis', 'fever', 'cold', 'flu'];
  for (const line of lines) {
    if (line.startsWith('Doctor:')) {
      const text = line.replace('Doctor:', '').trim().toLowerCase();
      for (const keyword of diagnosisKeywords) {
        if (text.includes(keyword) && !diagnosis) {
          diagnosis = text;
          break;
        }
      }
    }
  }
  
  // Extract Medications (from Doctor lines)
  const medicinePattern = /(paracetamol|crocin|dolo|azithromycin|amoxicillin|ciprofloxacin|metformin|aspirin|ibuprofen|omeprazole|pantoprazole|cetirizine)/gi;
  const dosagePattern = /(\d+\s*mg|\d+\s*ml)/gi;
  const frequencyPattern = /(twice|thrice|once|two times|three times|daily|morning|evening|night)/gi;
  const durationPattern = /(\d+\s*days?|\d+\s*weeks?|\d+\s*months?)/gi;
  
  for (const line of lines) {
    if (line.startsWith('Doctor:')) {
      const text = line.replace('Doctor:', '').trim();
      const medMatch = text.match(medicinePattern);
      
      if (medMatch) {
        const name = medMatch[0];
        const dosageMatch = text.match(dosagePattern);
        const frequencyMatch = text.match(frequencyPattern);
        const durationMatch = text.match(durationPattern);
        
        medications.push({
          name: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(),
          dosage: dosageMatch ? dosageMatch[0] : "",
          frequency: frequencyMatch ? frequencyMatch[0] : "",
          duration: durationMatch ? durationMatch[0] : ""
        });
      }
    }
  }
  
  // Extract Investigations (tests)
  const testKeywords = ['cbc', 'blood test', 'urine test', 'x-ray', 'xray', 'ct scan', 'mri', 'ultrasound', 'ecg', 'dengue test', 'malaria test'];
  for (const line of lines) {
    if (line.startsWith('Doctor:')) {
      const text = line.replace('Doctor:', '').trim().toLowerCase();
      for (const test of testKeywords) {
        if (text.includes(test)) {
          const testName = test.toUpperCase();
          if (!investigations.includes(testName)) {
            investigations.push(testName);
          }
        }
      }
    }
  }
  
  // Extract Advice
  if (lowerTranscript.includes('rest') || lowerTranscript.includes('aaram')) {
    advice += 'Take rest. ';
  }
  if (lowerTranscript.includes('fluids') || lowerTranscript.includes('pani')) {
    advice += 'Drink plenty of fluids. ';
  }
  if (lowerTranscript.includes('avoid') || lowerTranscript.includes('mat khao')) {
    advice += 'Avoid spicy food. ';
  }
  
  // Extract Follow-up
  if (lowerTranscript.includes('follow') || lowerTranscript.includes('dobara') || lowerTranscript.includes('wapas')) {
    const followMatch = transcript.match(/(\d+)\s*(day|days|din)/i);
    if (followMatch) {
      followUp = `Follow up after ${followMatch[1]} days`;
    } else {
      followUp = 'Follow up if symptoms persist';
    }
  }
  
  return {
    chiefComplaint,
    symptoms,
    medicalHistory,
    previousMedication,
    previousReports: "",
    diagnosis,
    medications,
    investigations,
    advice: advice.trim(),
    followUp
  };
}

// Doctor Settings Routes
app.get("/make-server-ae2bff40/settings", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const { data: settings, error } = await supabase
      .from('doctor_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('id', 'default')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.log('Error fetching settings:', error);
      return c.json({ error: `Failed to fetch settings: ${error.message}` }, 500);
    }

    return c.json({ settings: settings || {} });
  } catch (error) {
    console.log(`Error fetching settings: ${error}`);
    return c.json({ error: `Failed to fetch settings: ${error.message}` }, 500);
  }
});

app.put("/make-server-ae2bff40/settings", async (c) => {
  try {
    // Get user from auth token
    const userId = await getUserFromToken(c.req.header('Authorization'));
    if (!userId) {
      return c.json({ error: 'Unauthorized - Please log in' }, 401);
    }

    const body = await c.req.json();

    const { data: settings, error } = await supabase
      .from('doctor_settings')
      .upsert({
        id: 'default',
        user_id: userId, // ← CRITICAL: Link to authenticated user
        ...body,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.log('Error updating settings:', error);
      return c.json({ error: `Failed to update settings: ${error.message}` }, 500);
    }

    if (!settings) {
      console.log('Settings update returned empty - checking if insert needed');
      return c.json({ error: 'Failed to update settings - no data returned' }, 500);
    }

    return c.json({ success: true, settings });
  } catch (error) {
    console.log(`Error updating settings: ${error}`);
    return c.json({ error: `Failed to update settings: ${(error as any).message}` }, 500);
  }
});

Deno.serve(app.fetch);
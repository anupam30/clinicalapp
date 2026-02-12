/// <reference types="node" />

interface ImportMetaEnv {
  VITE_OPENAI_API_KEY?: string;
  VITE_CLAUDE_API_KEY?: string;
  VITE_GEMINI_API_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

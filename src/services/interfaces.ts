// =========================================
// SERVICE INTERFACES
// These define contracts that any provider implementation must follow
// Change providers without changing application code!
// =========================================

import { Prescription } from '../types';

// =========================================
// SPEECH-TO-TEXT SERVICE INTERFACE
// =========================================
export interface SpeechToTextProvider {
  /**
   * Initialize the STT service
   * @param config - Provider-specific configuration
   */
  initialize(config: STTConfig): Promise<void>;

  /**
   * Start listening to speech
   * @param language - Language code (e.g., 'hi-IN', 'en-IN')
   * @param onTranscript - Callback for transcript updates
   * @param onError - Callback for errors
   */
  startListening(
    language: string,
    onTranscript: (transcript: string, isFinal: boolean) => void,
    onError: (error: string) => void
  ): Promise<void>;

  /**
   * Stop listening
   */
  stopListening(): Promise<void>;

  /**
   * Check if provider is supported in current environment
   */
  isSupported(): boolean;

  /**
   * Get provider name
   */
  getProviderName(): string;
}

export interface STTConfig {
  apiKey?: string;
  endpoint?: string;
  continuous?: boolean;
  interimResults?: boolean;
  [key: string]: any;
}

// =========================================
// LLM SERVICE INTERFACE (Prescription Extraction)
// =========================================
export interface LLMProvider {
  /**
   * Initialize the LLM service
   * @param config - Provider-specific configuration
   */
  initialize(config: LLMConfig): Promise<void>;

  /**
   * Extract prescription from conversation transcript
   * @param transcript - Doctor-patient conversation
   * @param isLive - Whether this is live/partial extraction
   * @returns Structured prescription object
   */
  extractPrescription(
    transcript: string,
    isLive: boolean
  ): Promise<Prescription>;

  /**
   * Get provider name
   */
  getProviderName(): string;
}

export interface LLMConfig {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}

// =========================================
// DATABASE SERVICE INTERFACE
// =========================================
export interface DatabaseProvider {
  /**
   * Initialize database connection
   * @param config - Provider-specific configuration
   */
  initialize(config: DatabaseConfig): Promise<void>;

  /**
   * Get a value from key-value store
   */
  get(key: string): Promise<any>;

  /**
   * Set a value in key-value store
   */
  set(key: string, value: any): Promise<void>;

  /**
   * Delete a value from key-value store
   */
  delete(key: string): Promise<void>;

  /**
   * Get multiple values by keys
   */
  getMultiple(keys: string[]): Promise<any[]>;

  /**
   * Get values by key prefix
   */
  getByPrefix(prefix: string): Promise<any[]>;

  /**
   * Execute a raw query (for SQL databases)
   */
  query(sql: string, params?: any[]): Promise<any>;

  /**
   * Get provider name
   */
  getProviderName(): string;
}

export interface DatabaseConfig {
  connectionString?: string;
  apiKey?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  [key: string]: any;
}

// =========================================
// AUTH SERVICE INTERFACE
// =========================================
export interface AuthProvider {
  /**
   * Initialize auth service
   */
  initialize(config: AuthConfig): Promise<void>;

  /**
   * Sign up with email and password
   */
  signUpWithEmail(email: string, password: string, metadata?: any): Promise<AuthResult>;

  /**
   * Sign in with email and password
   */
  signInWithEmail(email: string, password: string): Promise<AuthResult>;

  /**
   * Send OTP to phone number
   */
  sendPhoneOTP(phone: string): Promise<void>;

  /**
   * Verify phone OTP
   */
  verifyPhoneOTP(phone: string, otp: string): Promise<AuthResult>;

  /**
   * Sign out current user
   */
  signOut(): Promise<void>;

  /**
   * Get current session
   */
  getSession(): Promise<AuthSession | null>;

  /**
   * Get current user
   */
  getCurrentUser(): Promise<AuthUser | null>;

  /**
   * Get provider name
   */
  getProviderName(): string;
}

export interface AuthConfig {
  apiUrl?: string;
  apiKey?: string;
  [key: string]: any;
}

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  metadata?: any;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export interface AuthResult {
  user: AuthUser | null;
  session: AuthSession | null;
  error?: string;
}

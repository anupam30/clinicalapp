// =========================================
// SERVICE MANAGER
// Central configuration for all service providers
// Change providers here without touching application code!
// =========================================

import { 
  SpeechToTextProvider, 
  LLMProvider, 
  DatabaseProvider, 
  AuthProvider 
} from './interfaces';
import { BrowserSpeechProvider } from './stt/BrowserSpeechProvider';
import { SupabaseDatabaseProvider } from './database/SupabaseDatabaseProvider';
import { SupabaseAuthProvider } from './auth/SupabaseAuthProvider';
import { projectId, publicAnonKey } from '../utils/supabase/info';

// =========================================
// PROVIDER CONFIGURATION
// Change these to switch providers!
// =========================================

class ServiceManager {
  private sttProvider: SpeechToTextProvider | null = null;
  private dbProvider: DatabaseProvider | null = null;
  private authProvider: AuthProvider | null = null;

  // =========================================
  // SPEECH-TO-TEXT CONFIGURATION
  // =========================================
  async getSTTProvider(): Promise<SpeechToTextProvider> {
    if (!this.sttProvider) {
      // TODO: Add configuration to switch between providers
      // Options: 'browser' | 'google' | 'azure' | 'aws' | 'deepgram'
      const providerType = 'browser'; // Change this to switch providers

      switch (providerType) {
        case 'browser':
          this.sttProvider = new BrowserSpeechProvider();
          await this.sttProvider.initialize({
            continuous: true,
            interimResults: true,
          });
          break;

        // Example: Add Google Cloud Speech
        // case 'google':
        //   this.sttProvider = new GoogleSpeechProvider();
        //   await this.sttProvider.initialize({
        //     apiKey: process.env.GOOGLE_SPEECH_API_KEY,
        //   });
        //   break;

        // Example: Add Azure Speech
        // case 'azure':
        //   this.sttProvider = new AzureSpeechProvider();
        //   await this.sttProvider.initialize({
        //     apiKey: process.env.AZURE_SPEECH_KEY,
        //     region: process.env.AZURE_REGION,
        //   });
        //   break;

        default:
          throw new Error(`Unknown STT provider: ${providerType}`);
      }

      console.log(`✅ STT Provider initialized: ${this.sttProvider.getProviderName()}`);
    }

    return this.sttProvider;
  }

  // =========================================
  // DATABASE CONFIGURATION
  // =========================================
  async getDatabaseProvider(): Promise<DatabaseProvider> {
    if (!this.dbProvider) {
      // TODO: Add configuration to switch between providers
      // Options: 'supabase' | 'mongodb' | 'firebase' | 'mysql' | 'postgres'
      const providerType = 'supabase'; // Change this to switch providers

      switch (providerType) {
        case 'supabase':
          this.dbProvider = new SupabaseDatabaseProvider();
          await this.dbProvider.initialize({
            connectionString: `https://${projectId}.supabase.co`,
            apiKey: publicAnonKey,
          });
          break;

        // Example: Add MongoDB
        // case 'mongodb':
        //   this.dbProvider = new MongoDBProvider();
        //   await this.dbProvider.initialize({
        //     connectionString: process.env.MONGODB_URI,
        //   });
        //   break;

        // Example: Add Firebase
        // case 'firebase':
        //   this.dbProvider = new FirebaseProvider();
        //   await this.dbProvider.initialize({
        //     apiKey: process.env.FIREBASE_API_KEY,
        //     projectId: process.env.FIREBASE_PROJECT_ID,
        //   });
        //   break;

        default:
          throw new Error(`Unknown database provider: ${providerType}`);
      }

      console.log(`✅ Database Provider initialized: ${this.dbProvider.getProviderName()}`);
    }

    return this.dbProvider;
  }

  // =========================================
  // AUTH CONFIGURATION
  // =========================================
  async getAuthProvider(): Promise<AuthProvider> {
    if (!this.authProvider) {
      // TODO: Add configuration to switch between providers
      // Options: 'supabase' | 'firebase' | 'auth0' | 'clerk'
      const providerType = 'supabase'; // Change this to switch providers

      switch (providerType) {
        case 'supabase':
          this.authProvider = new SupabaseAuthProvider();
          await this.authProvider.initialize({
            apiUrl: `https://${projectId}.supabase.co`,
            apiKey: publicAnonKey,
          });
          break;

        // Example: Add Firebase Auth
        // case 'firebase':
        //   this.authProvider = new FirebaseAuthProvider();
        //   await this.authProvider.initialize({
        //     apiKey: process.env.FIREBASE_API_KEY,
        //     authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        //   });
        //   break;

        // Example: Add Auth0
        // case 'auth0':
        //   this.authProvider = new Auth0Provider();
        //   await this.authProvider.initialize({
        //     domain: process.env.AUTH0_DOMAIN,
        //     clientId: process.env.AUTH0_CLIENT_ID,
        //   });
        //   break;

        default:
          throw new Error(`Unknown auth provider: ${providerType}`);
      }

      console.log(`✅ Auth Provider initialized: ${this.authProvider.getProviderName()}`);
    }

    return this.authProvider;
  }

  // =========================================
  // LLM CONFIGURATION (Backend-based)
  // =========================================
  getLLMEndpoint(): string {
    // LLM extraction happens on backend
    return `https://${projectId}.supabase.co/functions/v1/make-server-ae2bff40/generate-prescription-live`;
  }

  // Reset providers (useful for testing or provider switching)
  reset() {
    this.sttProvider = null;
    this.dbProvider = null;
    this.authProvider = null;
  }
}

// Singleton instance
export const serviceManager = new ServiceManager();

// =========================================
// CONVENIENCE EXPORTS
// Use these in your application code
// =========================================

export const getSTTProvider = () => serviceManager.getSTTProvider();
export const getDatabaseProvider = () => serviceManager.getDatabaseProvider();
export const getAuthProvider = () => serviceManager.getAuthProvider();
export const getLLMEndpoint = () => serviceManager.getLLMEndpoint();

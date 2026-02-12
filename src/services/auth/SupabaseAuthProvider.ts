// =========================================
// SUPABASE AUTH PROVIDER
// Uses Supabase Authentication
// Can be replaced with Firebase Auth, Auth0, Clerk, etc.
// =========================================

import { AuthProvider, AuthConfig, AuthUser, AuthSession, AuthResult } from '../interfaces';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class SupabaseAuthProvider implements AuthProvider {
  private client: SupabaseClient | null = null;

  async initialize(config: AuthConfig): Promise<void> {
    if (!config.apiUrl || !config.apiKey) {
      throw new Error('Supabase Auth requires apiUrl and apiKey');
    }

    this.client = createClient(config.apiUrl, config.apiKey);
  }

  async signUpWithEmail(email: string, password: string, metadata?: any): Promise<AuthResult> {
    if (!this.client) throw new Error('Auth not initialized');

    console.log('🔵 SupabaseAuthProvider: Calling Supabase signUp...', { email, metadata });

    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: metadata || {},
      },
    });

    console.log('🔵 SupabaseAuthProvider: Supabase response:', {
      hasUser: !!data.user,
      hasSession: !!data.session,
      userId: data.user?.id,
      userEmail: data.user?.email,
      error: error?.message,
    });

    if (error) {
      console.error('❌ SupabaseAuthProvider: Signup error:', error);
      return {
        user: null,
        session: null,
        error: error.message,
      };
    }

    return {
      user: data.user ? {
        id: data.user.id,
        email: data.user.email,
        phone: data.user.phone,
        metadata: data.user.user_metadata,
      } : null,
      session: data.session ? {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user!.id,
          email: data.user!.email,
          phone: data.user!.phone,
          metadata: data.user!.user_metadata,
        },
      } : null,
    };
  }

  async signInWithEmail(email: string, password: string): Promise<AuthResult> {
    if (!this.client) throw new Error('Auth not initialized');

    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: error.message,
      };
    }

    return {
      user: data.user ? {
        id: data.user.id,
        email: data.user.email,
        phone: data.user.phone,
        metadata: data.user.user_metadata,
      } : null,
      session: data.session ? {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user!.id,
          email: data.user!.email,
          phone: data.user!.phone,
          metadata: data.user!.user_metadata,
        },
      } : null,
    };
  }

  async sendPhoneOTP(phone: string): Promise<void> {
    if (!this.client) throw new Error('Auth not initialized');

    const { error } = await this.client.auth.signInWithOtp({
      phone,
    });

    if (error) {
      throw new Error(`Failed to send OTP: ${error.message}`);
    }
  }

  async verifyPhoneOTP(phone: string, otp: string): Promise<AuthResult> {
    if (!this.client) throw new Error('Auth not initialized');

    const { data, error } = await this.client.auth.verifyOtp({
      phone,
      token: otp,
      type: 'sms',
    });

    if (error) {
      return {
        user: null,
        session: null,
        error: error.message,
      };
    }

    return {
      user: data.user ? {
        id: data.user.id,
        email: data.user.email,
        phone: data.user.phone,
        metadata: data.user.user_metadata,
      } : null,
      session: data.session ? {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user: {
          id: data.user!.id,
          email: data.user!.email,
          phone: data.user!.phone,
          metadata: data.user!.user_metadata,
        },
      } : null,
    };
  }

  async signOut(): Promise<void> {
    if (!this.client) throw new Error('Auth not initialized');

    const { error } = await this.client.auth.signOut();
    if (error) {
      throw new Error(`Failed to sign out: ${error.message}`);
    }
  }

  async getSession(): Promise<AuthSession | null> {
    if (!this.client) throw new Error('Auth not initialized');

    const { data, error } = await this.client.auth.getSession();

    if (error || !data.session) {
      return null;
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.session.user.id,
        email: data.session.user.email,
        phone: data.session.user.phone,
        metadata: data.session.user.user_metadata,
      },
    };
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    if (!this.client) throw new Error('Auth not initialized');

    const { data, error } = await this.client.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    return {
      id: data.user.id,
      email: data.user.email,
      phone: data.user.phone,
      metadata: data.user.user_metadata,
    };
  }

  getProviderName(): string {
    return 'Supabase Auth';
  }
}
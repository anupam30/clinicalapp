// =========================================
// AUTHENTICATION CONTEXT
// Manages user authentication state across the app
// =========================================

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthUser, AuthSession } from '../services/interfaces';
import { getAuthProvider } from '../services/ServiceManager';

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string, metadata?: any) => Promise<{ error?: string }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  sendPhoneOTP: (phone: string) => Promise<{ error?: string }>;
  verifyPhoneOTP: (phone: string, otp: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session on mount
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const authProvider = await getAuthProvider();
      const existingSession = await authProvider.getSession();
      
      if (existingSession) {
        setSession(existingSession);
        setUser(existingSession.user);
        console.log('✅ Existing session found:', existingSession.user.email || existingSession.user.phone);
      }
    } catch (error) {
      console.error('Failed to check session:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (email: string, password: string, metadata?: any) => {
    try {
      console.log('🔵 AuthContext: Starting signup...', { email, metadata });
      const authProvider = await getAuthProvider();
      const result = await authProvider.signUpWithEmail(email, password, metadata);
      
      console.log('🔵 AuthContext: Signup result:', { 
        hasUser: !!result.user, 
        hasSession: !!result.session, 
        error: result.error 
      });

      if (result.error) {
        console.error('❌ AuthContext: Signup error:', result.error);
        return { error: result.error };
      }

      if (result.session && result.user) {
        setSession(result.session);
        setUser(result.user);
        console.log('✅ AuthContext: User signed up and logged in:', result.user.email);
        return {};
      }

      // IMPORTANT: If email confirmation is enabled, session might be null
      if (result.user && !result.session) {
        console.warn('⚠️ AuthContext: User created but no session (email confirmation may be required)');
        return { error: 'Please check your email to confirm your account, then login.' };
      }

      return {};
    } catch (error: any) {
      console.error('❌ AuthContext: Sign up exception:', error);
      return { error: error.message };
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const authProvider = await getAuthProvider();
      const result = await authProvider.signInWithEmail(email, password);
      
      if (result.error) {
        return { error: result.error };
      }

      if (result.session && result.user) {
        setSession(result.session);
        setUser(result.user);
        console.log('✅ User signed in:', result.user.email);
      }

      return {};
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { error: error.message };
    }
  };

  const sendPhoneOTP = async (phone: string) => {
    try {
      const authProvider = await getAuthProvider();
      await authProvider.sendPhoneOTP(phone);
      console.log('✅ OTP sent to:', phone);
      return {};
    } catch (error: any) {
      console.error('Send OTP error:', error);
      return { error: error.message };
    }
  };

  const verifyPhoneOTP = async (phone: string, otp: string) => {
    try {
      const authProvider = await getAuthProvider();
      const result = await authProvider.verifyPhoneOTP(phone, otp);
      
      if (result.error) {
        return { error: result.error };
      }

      if (result.session && result.user) {
        setSession(result.session);
        setUser(result.user);
        console.log('✅ Phone verified:', result.user.phone);
      }

      return {};
    } catch (error: any) {
      console.error('Verify OTP error:', error);
      return { error: error.message };
    }
  };

  const signOut = async () => {
    try {
      const authProvider = await getAuthProvider();
      await authProvider.signOut();
      setSession(null);
      setUser(null);
      console.log('✅ User signed out');
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  const value = {
    user,
    session,
    loading,
    signUpWithEmail,
    signInWithEmail,
    sendPhoneOTP,
    verifyPhoneOTP,
    signOut,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
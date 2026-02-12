// =========================================
// DIAGNOSTIC TOOL
// Debug authentication issues
// =========================================

import { useState } from 'react';
import { Button } from './ui/button';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export function DiagnosticTool() {
  const [results, setResults] = useState<any>({});
  const [testing, setTesting] = useState(false);

  const runDiagnostics = async () => {
    setTesting(true);
    const diagnostics: any = {};

    // Test 1: Check environment variables
    console.log('🔍 Test 1: Checking environment variables...');
    diagnostics.envVars = {
      projectId: projectId ? '✅ Set' : '❌ Missing',
      publicAnonKey: publicAnonKey ? '✅ Set' : '❌ Missing',
      projectIdValue: projectId,
      anonKeyPreview: publicAnonKey ? publicAnonKey.substring(0, 30) + '...' : 'Missing',
    };
    console.log('Environment:', diagnostics.envVars);

    // Test 2: Check Supabase connection
    console.log('🔍 Test 2: Testing Supabase connection...');
    try {
      const supabase = createClient(
        `https://${projectId}.supabase.co`,
        publicAnonKey
      );
      
      // Try to get session (should be null if not logged in)
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      diagnostics.connection = {
        status: sessionError ? '❌ Failed' : '✅ Connected',
        error: sessionError?.message,
        hasSession: !!sessionData.session,
      };
      console.log('Connection:', diagnostics.connection);
    } catch (error: any) {
      diagnostics.connection = {
        status: '❌ Failed',
        error: error.message,
      };
      console.error('Connection error:', error);
    }

    // Test 3: Try test signup
    console.log('🔍 Test 3: Testing signup with test user...');
    try {
      const supabase = createClient(
        `https://${projectId}.supabase.co`,
        publicAnonKey
      );

      const testEmail = `test-${Date.now()}@example.com`;
      const testPassword = 'password123';

      console.log('Attempting signup with:', testEmail);

      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword,
        options: {
          data: { name: 'Test User' },
        },
      });

      diagnostics.signup = {
        status: error ? '❌ Failed' : '✅ Success',
        error: error?.message,
        hasUser: !!data.user,
        hasSession: !!data.session,
        userId: data.user?.id,
        userEmail: data.user?.email,
        sessionToken: data.session?.access_token ? 'Present' : 'Missing',
      };

      console.log('Signup result:', diagnostics.signup);

      // Clean up test user
      if (data.session) {
        await supabase.auth.signOut();
      }
    } catch (error: any) {
      diagnostics.signup = {
        status: '❌ Failed',
        error: error.message,
      };
      console.error('Signup error:', error);
    }

    // Test 4: Check email confirmation settings
    console.log('🔍 Test 4: Analyzing results...');
    if (diagnostics.signup.hasUser && !diagnostics.signup.hasSession) {
      diagnostics.diagnosis = {
        issue: 'EMAIL_CONFIRMATION_ENABLED',
        message: '⚠️ Email confirmation is ENABLED in Supabase',
        solution: 'Go to Supabase Dashboard → Authentication → Providers → Disable "Confirm email"',
      };
    } else if (diagnostics.signup.hasUser && diagnostics.signup.hasSession) {
      diagnostics.diagnosis = {
        issue: 'NONE',
        message: '✅ Everything working! Email confirmation is disabled.',
        solution: 'Authentication should work normally. Check frontend code.',
      };
    } else {
      diagnostics.diagnosis = {
        issue: 'UNKNOWN',
        message: '❌ Signup failed completely',
        solution: 'Check Supabase dashboard and project settings',
      };
    }

    console.log('Diagnosis:', diagnostics.diagnosis);
    console.log('Full diagnostics:', diagnostics);

    setResults(diagnostics);
    setTesting(false);
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-xl border-2 border-blue-500 p-6 max-w-md z-50">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-6 w-6 text-blue-600" />
        <h3 className="text-lg font-bold">Authentication Diagnostics</h3>
      </div>

      <Button
        onClick={runDiagnostics}
        disabled={testing}
        className="w-full mb-4 bg-blue-600 hover:bg-blue-700"
      >
        {testing ? 'Running Tests...' : 'Run Diagnostic Tests'}
      </Button>

      {Object.keys(results).length > 0 && (
        <div className="space-y-3 text-sm">
          {/* Environment Variables */}
          <div className="border rounded p-2">
            <div className="font-semibold mb-1">1. Environment Variables:</div>
            <div className="text-xs space-y-1 pl-2">
              <div>Project ID: {results.envVars?.projectId}</div>
              <div>Anon Key: {results.envVars?.publicAnonKey}</div>
            </div>
          </div>

          {/* Connection */}
          <div className="border rounded p-2">
            <div className="font-semibold mb-1">2. Supabase Connection:</div>
            <div className="text-xs space-y-1 pl-2">
              <div>Status: {results.connection?.status}</div>
              {results.connection?.error && (
                <div className="text-red-600">Error: {results.connection.error}</div>
              )}
            </div>
          </div>

          {/* Signup Test */}
          <div className="border rounded p-2">
            <div className="font-semibold mb-1">3. Signup Test:</div>
            <div className="text-xs space-y-1 pl-2">
              <div>Status: {results.signup?.status}</div>
              <div>User Created: {results.signup?.hasUser ? '✅ Yes' : '❌ No'}</div>
              <div>Session Created: {results.signup?.hasSession ? '✅ Yes' : '❌ No'}</div>
              {results.signup?.error && (
                <div className="text-red-600">Error: {results.signup.error}</div>
              )}
            </div>
          </div>

          {/* Diagnosis */}
          {results.diagnosis && (
            <div className={`border-2 rounded p-3 ${
              results.diagnosis.issue === 'NONE' 
                ? 'border-green-500 bg-green-50' 
                : results.diagnosis.issue === 'EMAIL_CONFIRMATION_ENABLED'
                ? 'border-yellow-500 bg-yellow-50'
                : 'border-red-500 bg-red-50'
            }`}>
              <div className="flex items-start gap-2">
                {results.diagnosis.issue === 'NONE' && (
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                )}
                {results.diagnosis.issue === 'EMAIL_CONFIRMATION_ENABLED' && (
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                )}
                {results.diagnosis.issue === 'UNKNOWN' && (
                  <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold mb-1">Diagnosis:</div>
                  <div className="text-xs mb-2">{results.diagnosis.message}</div>
                  <div className="text-xs font-semibold">Solution:</div>
                  <div className="text-xs">{results.diagnosis.solution}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        Check browser console (F12) for detailed logs
      </div>
    </div>
  );
}

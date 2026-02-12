// =========================================
// SIGNUP PAGE
// Phone OTP-based signup with optional email
// =========================================

import { useState } from 'react';
import { Stethoscope, Phone, Mail, User, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner@2.0.3';
import { DiagnosticTool } from './DiagnosticTool';

interface SignupPageProps {
  onSwitchToLogin: () => void;
}

export function SignupPage({ onSwitchToLogin }: SignupPageProps) {
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [usePhoneSignup, setUsePhoneSignup] = useState(true);

  const { signUpWithEmail, sendPhoneOTP, verifyPhoneOTP } = useAuth();

  const handlePhoneSignupStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate phone format
    if (!phone.match(/^\+?[1-9]\d{9,14}$/)) {
      toast.error('Please enter a valid phone number with country code (e.g., +919876543210)');
      setLoading(false);
      return;
    }

    if (!name.trim()) {
      toast.error('Please enter your name');
      setLoading(false);
      return;
    }

    const { error } = await sendPhoneOTP(phone);

    if (error) {
      toast.error(error);
    } else {
      setStep('otp');
      toast.success('OTP sent to your phone!');
    }

    setLoading(false);
  };

  const handlePhoneSignupComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await verifyPhoneOTP(phone, otp);

    if (error) {
      toast.error(error);
    } else {
      toast.success('Account created successfully!');
      // Note: User metadata (name) will need to be updated separately after signup
    }

    setLoading(false);
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (!name.trim()) {
      toast.error('Please enter your name');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    console.log('🔵 Starting email signup...', { email, name });
    const { error } = await signUpWithEmail(email, password, { name });

    if (error) {
      console.error('❌ Signup error:', error);
      toast.error(error);
    } else {
      console.log('✅ Signup successful!');
      toast.success('Account created successfully!');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      {/* Diagnostic Tool */}
      <DiagnosticTool />
      
      <div className="w-full max-w-md">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#3e65f3] rounded-full mb-4">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Create Account
          </h1>
          <p className="text-gray-600">
            Join the AI-powered clinical assistant platform
          </p>
        </div>

        {/* Signup Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {/* Method Toggle */}
          <div className="flex gap-2 mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setUsePhoneSignup(true)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                usePhoneSignup
                  ? 'bg-white text-[#3e65f3] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Phone className="h-4 w-4 inline mr-2" />
              Phone OTP
            </button>
            <button
              onClick={() => setUsePhoneSignup(false)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                !usePhoneSignup
                  ? 'bg-white text-[#3e65f3] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Mail className="h-4 w-4 inline mr-2" />
              Email
            </button>
          </div>

          {/* Phone OTP Signup - Details Step */}
          {usePhoneSignup && step === 'details' && (
            <form onSubmit={handlePhoneSignupStart} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. John Doe"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="pl-10"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Include country code (e.g., +91 for India)
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#3e65f3] hover:bg-[#3e65f3]/90"
                disabled={loading}
              >
                {loading ? 'Sending OTP...' : 'Continue with Phone'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}

          {/* Phone OTP Signup - OTP Verification Step */}
          {usePhoneSignup && step === 'otp' && (
            <form onSubmit={handlePhoneSignupComplete} className="space-y-4">
              <div className="text-center mb-4">
                <p className="text-sm text-gray-600">
                  OTP sent to <span className="font-semibold">{phone}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter OTP
                </label>
                <Input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep('details');
                    setOtp('');
                  }}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#3e65f3] hover:bg-[#3e65f3]/90"
                  disabled={loading}
                >
                  {loading ? 'Verifying...' : 'Create Account'}
                </Button>
              </div>
            </form>
          )}

          {/* Email Signup */}
          {!usePhoneSignup && (
            <form onSubmit={handleEmailSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. John Doe"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="doctor@example.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  At least 6 characters
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#3e65f3] hover:bg-[#3e65f3]/90"
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}
        </div>

        {/* Login Link */}
        <div className="text-center mt-6">
          <p className="text-gray-600">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-[#3e65f3] font-semibold hover:underline"
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
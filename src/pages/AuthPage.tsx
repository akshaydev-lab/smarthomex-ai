import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  Sparkles,
  LogOut,
  Database,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import {
  signInWithEmail,
  signUpWithEmail,
  getCurrentUser,
  resetPasswordForEmail,
  isSupabaseConfigured,
  getSupabaseConfig,
  diagnoseSupabaseConnectivity,
  SupabaseDiagnosticReport,
} from '../lib/supabaseClient';
import { updateUserProfile } from '../services/supabaseDataService';

// ==============================================================================
// SmartHomeX AI — Authentication Page
// Handles: Sign In, Sign Up, Forgot Password, Profile Card
// Supabase Auth: signInWithPassword, signUp, resetPasswordForEmail
// ==============================================================================

type AuthView = 'login' | 'signup' | 'forgot_password';

export const AuthPage: React.FC = () => {
  const { isAuthenticated, user, login, logout, setCurrentPage } = useSmartHome();

  // View state
  const [view, setView] = useState<AuthView>('login');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Network & Endpoint Diagnostics
  const [diagnosticReport, setDiagnosticReport] = useState<SupabaseDiagnosticReport | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const runConnectivityCheck = async () => {
    setIsDiagnosing(true);
    try {
      const report = await diagnoseSupabaseConnectivity();
      setDiagnosticReport(report);
    } catch (e) {
      console.error('Failed running diagnostics:', e);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const supabaseConfig = getSupabaseConfig();

  // ── Reset form state when switching views ──────────────────────────────────
  const switchView = (v: AuthView) => {
    setView(v);
    setAuthError(null);
    setAuthSuccess(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setTermsAccepted(false);
    setForgotEmail('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  // ── Sign In Handler ─────────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setIsLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      if (isSupabaseConfigured) {
        const { data, error } = await signInWithEmail(email.trim(), password);
        if (error) {
          setAuthError(error.message);
          return;
        }
        if (data.user && data.session) {
          const name =
            data.user.user_metadata?.full_name ||
            data.user.email?.split('@')[0] ||
            'User';
          // BUG 4 FIX: pass Supabase UUID so realtime subscriptions work
          login(data.user.email || email, name, data.user.id);
          setCurrentPage('overview');
        } else {
          setAuthError('Sign in failed. Please check your credentials and try again.');
        }
      } else {
        if (import.meta.env.PROD) {
          setAuthError('Supabase authentication is required in production. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel project settings.');
          return;
        }
        // Demo mode only in local dev
        await new Promise((r) => setTimeout(r, 500));
        login(email, email.split('@')[0]);
        setCurrentPage('overview');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication request failed.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Sign Up Handler ─────────────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!fullName.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setAuthError('Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match. Please re-enter your password.');
      return;
    }
    if (!termsAccepted) {
      setAuthError('You must accept the Terms & Conditions to create an account.');
      return;
    }

    setIsLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      if (isSupabaseConfigured) {
        const { data, error } = await signUpWithEmail(email.trim(), password, fullName.trim());
        if (error) {
          setAuthError(error.message);
          return;
        }

        if (data.user) {
          // BUG 2 FIX: Check for an active session before calling login().
          // When email confirmation is enabled, data.session will be null even
          // though data.user is populated. Never treat the user as authenticated
          // until Supabase actually issues a session JWT.
          if (data.session) {
            // Email confirmation is disabled — session is immediately active
            const name =
              data.user.user_metadata?.full_name ||
              data.user.email?.split('@')[0] ||
              'User';
            login(data.user.email || email, name, data.user.id);
            setAuthSuccess(
              'Account created successfully! Welcome to SmartHomeX AI.'
            );
            setTimeout(() => setCurrentPage('overview'), 1200);
          } else {
            // Email confirmation required — do NOT log in yet
            setAuthSuccess(
              '✅ Account registered! Check your inbox for a confirmation email. ' +
              'Click the link in the email, then sign in here.'
            );
            // Stay on auth page in sign-in view after a short delay
            setTimeout(() => switchView('login'), 4000);
          }
        }
      } else {
        if (import.meta.env.PROD) {
          setAuthError('Supabase registration is required in production. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel project settings.');
          return;
        }
        // Demo mode only in local dev
        await new Promise((r) => setTimeout(r, 600));
        login(email, fullName || email.split('@')[0]);
        setCurrentPage('overview');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup request failed.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot Password Handler ─────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setAuthError('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      if (isSupabaseConfigured) {
        const { error } = await resetPasswordForEmail(forgotEmail.trim());
        if (error) {
          setAuthError(error.message);
          return;
        }
        setAuthSuccess(
          `Password reset email sent to ${forgotEmail.trim()}. ` +
          'Check your inbox and follow the link to reset your password.'
        );
      } else {
        setAuthError('Password reset requires Supabase to be configured.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reset request failed.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Profile Update Handler ──────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editName.trim() || !user) return;
    setIsUpdatingProfile(true);
    setAuthError(null);
    try {
      if (isSupabaseConfigured) {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          await updateUserProfile(currentUser.id, { fullName: editName.trim() });
        }
      }
      login(user.email, editName.trim(), user.id);
      setIsEditingProfile(false);
      setAuthSuccess('Profile updated successfully!');
      setTimeout(() => setAuthSuccess(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
      setAuthError(msg);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // ── Shared Alert Banners ───────────────────────────────────────────────────
  const ErrorBanner = () => {
    if (!authError) return null;

    const isFetchFailure =
      authError.toLowerCase().includes('failed to fetch') ||
      authError.toLowerCase().includes('networkerror') ||
      authError.toLowerCase().includes('network error');

    return (
      <div className="mb-4 rounded-xl bg-rose-950/40 border border-rose-500/40 p-3.5 text-xs text-rose-300">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <span className="font-semibold block text-rose-200">
              {isFetchFailure ? 'Network Connection Failed ("Failed to fetch")' : 'Authentication Error'}
            </span>
            <p className="mt-0.5 text-rose-300/90 leading-relaxed">{authError}</p>
          </div>
        </div>

        {isFetchFailure && (
          <div className="mt-3 pt-3 border-t border-rose-500/20 text-[11px] space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono text-slate-300 flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5 text-amber-400" />
                Target: {supabaseConfig.supabaseUrl || 'https://pacejovitiwmoucyzkzy.supabase.co'}
              </span>
              <button
                type="button"
                onClick={runConnectivityCheck}
                disabled={isDiagnosing}
                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isDiagnosing ? 'animate-spin' : ''}`} />
                {isDiagnosing ? 'Testing Probe...' : 'Probe Auth Server'}
              </button>
            </div>

            {diagnosticReport && (
              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 font-mono text-[10.5px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Endpoint Health:</span>
                  <span className={diagnosticReport.reachabilityStatus === 200 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {diagnosticReport.reachabilityStatus ? `HTTP ${diagnosticReport.reachabilityStatus}` : 'BLOCKED / DROPPED'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Project Ref Match:</span>
                  <span className={diagnosticReport.isRefMatched ? 'text-emerald-400' : 'text-amber-400'}>
                    {diagnosticReport.isRefMatched ? 'Matched (pacejovitiwmoucyzkzy)' : 'Ref Check Failed'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Error Classification:</span>
                  <span className="text-amber-300 font-semibold">{diagnosticReport.errorCategory}</span>
                </div>
                {diagnosticReport.reachabilityStatus === 200 ? (
                  <p className="text-emerald-300 pt-1 font-sans">
                    ✓ Server is online and responding. The connection drop was likely transient. Try signing in again.
                  </p>
                ) : diagnosticReport.errorCategory === 'BLOCKED_BY_EXTENSIONS' ? (
                  <p className="text-amber-200 pt-1 font-sans">
                    ⚠ Blocked by Browser Extension (e.g. Brave Shields, uBlock Origin, or AdGuard). Toggle shields OFF for localhost:5173.
                  </p>
                ) : (
                  <p className="text-rose-300 pt-1 font-sans">
                    ⚠ DNS or Network Firewall blocked connection to *.supabase.co. Verify internet connectivity or VPN settings.
                  </p>
                )}
              </div>
            )}

            <div className="text-slate-400 leading-normal bg-slate-900/40 p-2 rounded-lg border border-slate-800">
              <strong className="text-slate-200 block mb-1">Common causes for "Failed to fetch":</strong>
              <ul className="list-disc pl-4 space-y-0.5 text-slate-400">
                <li>
                  <strong className="text-slate-300">Brave Shields / Adblockers:</strong> If using Brave Browser, click the lion icon in the address bar and disable Brave Shields for localhost.
                </li>
                <li>
                  <strong className="text-slate-300">Browser Extensions:</strong> Extensions like uBlock Origin or Privacy Badger can block cross-origin requests to third-party endpoints.
                </li>
                <li>
                  <strong className="text-slate-300">Network / DNS:</strong> Ensure your network can reach{' '}
                  <code className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">https://pacejovitiwmoucyzkzy.supabase.co</code>.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  };

  const SuccessBanner = () =>
    authSuccess ? (
      <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
        <span>{authSuccess}</span>
      </div>
    ) : null;

  // ── Password Field Component ───────────────────────────────────────────────
  const PasswordField = ({
    label,
    value,
    onChange,
    show,
    onToggleShow,
    placeholder = '••••••••',
    minLength = 8,
    id,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    placeholder?: string;
    minLength?: number;
    id: string;
  }) => (
    <div>
      <label htmlFor={id} className="block text-slate-300 font-medium mb-1 text-xs">
        {label}
      </label>
      <div className="relative">
        <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="glass-input w-full pl-9 pr-10 py-2.5 rounded-xl text-slate-100 placeholder:text-slate-400 text-xs"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  // ── AUTHENTICATED: Profile Card ────────────────────────────────────────────
  if (isAuthenticated && user) {
    return (
      <div className="max-w-xl mx-auto py-4 sm:py-8 space-y-6">
        <Card className="p-6 border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 via-slate-900/90 to-slate-950 shadow-glow-cyan text-center">
          <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-cyan-500 to-teal-400 p-0.5 mx-auto mb-4 shadow-glow-cyan">
            <div className="h-full w-full rounded-full bg-slate-950 flex items-center justify-center text-xl font-bold text-cyan-300">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </div>

          <SuccessBanner />

          {authError && (
            <div className="mb-4 p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{authError}</span>
            </div>
          )}

          {isEditingProfile ? (
            <div className="max-w-xs mx-auto space-y-3 mb-4">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full Name"
                className="glass-input w-full px-3 py-1.5 rounded-xl text-center text-sm font-semibold text-slate-100"
              />
              <div className="flex justify-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isUpdatingProfile}
                  onClick={handleSaveProfile}
                >
                  Save Profile
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsEditingProfile(false);
                    setEditName(user.name);
                    setAuthError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 mb-2">
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-xl font-bold text-slate-100">{user.name}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditName(user.name);
                    setIsEditingProfile(true);
                    setAuthError(null);
                    setAuthSuccess(null);
                  }}
                  title="Edit Profile"
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs font-mono text-cyan-400">{user.email}</p>
            </div>
          )}

          <div className="mt-2 flex justify-center gap-2">
            <Badge variant="teal" size="sm">{user.role}</Badge>
            <Badge variant={isSupabaseConfigured ? 'emerald' : 'demo'} size="sm">
              {isSupabaseConfigured ? 'Supabase Cloud Session' : (!import.meta.env.PROD ? 'Demo Session' : 'Offline Session')}
            </Badge>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-800 flex justify-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCurrentPage('overview')}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Go to Dashboard
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<LogOut className="h-4 w-4 text-rose-400" />}
              onClick={logout}
            >
              Sign Out
            </Button>
          </div>
        </Card>

        <SupabaseStatusCard supabaseConfig={supabaseConfig} />
      </div>
    );
  }

  // ── UNAUTHENTICATED VIEWS ──────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto py-4 sm:py-8 space-y-6">

      {/* ── FORGOT PASSWORD VIEW ─────────────────────────────────────────── */}
      {view === 'forgot_password' && (
        <Card className="p-6 sm:p-8 border-cyan-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-900/90 shadow-2xl">
          <div className="text-center mb-6">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 p-0.5 mx-auto mb-3 shadow-glow-cyan">
              <div className="h-full w-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-amber-400" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-100">Reset Your Password</h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your account email and we'll send you a reset link.
            </p>
          </div>

          <ErrorBanner />
          <SuccessBanner />

          <form onSubmit={handleForgotPassword} className="space-y-4 text-xs">
            <div>
              <label htmlFor="forgot-email" className="block text-slate-300 font-medium mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="glass-input w-full pl-9 pr-3 py-2.5 rounded-xl text-slate-100 placeholder:text-slate-400 text-xs"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full mt-2"
            >
              Send Reset Email
            </Button>
          </form>

          <div className="mt-5 text-center text-xs text-slate-400">
            <button
              onClick={() => switchView('login')}
              className="flex items-center justify-center gap-1.5 mx-auto text-cyan-400 font-semibold hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </button>
          </div>
        </Card>
      )}

      {/* ── SIGN IN VIEW ─────────────────────────────────────────────────── */}
      {view === 'login' && (
        <Card className="p-6 sm:p-8 border-cyan-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-900/90 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 p-0.5 mx-auto mb-3 shadow-glow-cyan">
              <div className="h-full w-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-cyan-400" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-100">Welcome to SmartHomeX AI</h2>
            <p className="text-xs text-slate-400 mt-1">
              Sign in to access your 4-channel ESP32 relays and telemetry stream
            </p>
          </div>

          {/* Supabase Connection Status */}
          <div className="mb-4 flex items-center justify-center">
            {isSupabaseConfigured ? (
              <Badge variant="emerald" size="sm" icon={<ShieldCheck className="h-3 w-3" />}>
                Supabase Live Authentication Active
              </Badge>
            ) : (
              <Badge variant={import.meta.env.PROD ? 'rose' : 'demo'} size="sm" icon={<ShieldAlert className="h-3 w-3 text-amber-400" />}>
                {import.meta.env.PROD ? 'Supabase Configuration Missing (Set Environment Variables in Vercel)' : 'Demo Mode (Supabase URL pending in .env.local)'}
              </Badge>
            )}
          </div>

          <ErrorBanner />
          <SuccessBanner />

          {/* Sign In Form */}
          <form onSubmit={handleSignIn} className="space-y-4 text-xs">
            <div>
              <label htmlFor="signin-email" className="block text-slate-300 font-medium mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="signin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@smarthomex.ai"
                  autoComplete="email"
                  className="glass-input w-full pl-9 pr-3 py-2.5 rounded-xl text-slate-100 placeholder:text-slate-400 text-xs"
                />
              </div>
            </div>

            <PasswordField
              id="signin-password"
              label="Password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              minLength={6}
            />

            {/* Forgot Password link */}
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => switchView('forgot_password')}
                className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full mt-1"
            >
              Sign In to SmartHomeX
            </Button>
          </form>

          <div className="mt-5 text-center text-xs text-slate-400">
            Don't have an account?{' '}
            <button
              onClick={() => switchView('signup')}
              className="text-cyan-400 font-semibold hover:underline cursor-pointer"
            >
              Create one now
            </button>
          </div>
        </Card>
      )}

      {/* ── SIGN UP VIEW ─────────────────────────────────────────────────── */}
      {view === 'signup' && (
        <Card className="p-6 sm:p-8 border-cyan-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-900/90 shadow-2xl">
          <div className="text-center mb-6">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 p-0.5 mx-auto mb-3 shadow-glow-cyan">
              <div className="h-full w-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-cyan-400" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-100">Create SmartHomeX AI Account</h2>
            <p className="text-xs text-slate-400 mt-1">
              Register your IoT dashboard identity for multi-device synchronization
            </p>
          </div>

          <div className="mb-4 flex items-center justify-center">
            {isSupabaseConfigured ? (
              <Badge variant="emerald" size="sm" icon={<ShieldCheck className="h-3 w-3" />}>
                Supabase Live Authentication Active
              </Badge>
            ) : (
              <Badge variant={import.meta.env.PROD ? 'rose' : 'demo'} size="sm" icon={<ShieldAlert className="h-3 w-3 text-amber-400" />}>
                {import.meta.env.PROD ? 'Supabase Configuration Missing (Set Environment Variables in Vercel)' : 'Demo Mode (Supabase URL pending in .env.local)'}
              </Badge>
            )}
          </div>

          <ErrorBanner />
          <SuccessBanner />

          <form onSubmit={handleSignUp} className="space-y-4 text-xs">
            {/* Full Name */}
            <div>
              <label htmlFor="signup-name" className="block text-slate-300 font-medium mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="signup-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Vance"
                  autoComplete="name"
                  className="glass-input w-full pl-9 pr-3 py-2.5 rounded-xl text-slate-100 placeholder:text-slate-400 text-xs"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="block text-slate-300 font-medium mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@smarthomex.ai"
                  autoComplete="email"
                  className="glass-input w-full pl-9 pr-3 py-2.5 rounded-xl text-slate-100 placeholder:text-slate-400 text-xs"
                />
              </div>
            </div>

            {/* Password */}
            <PasswordField
              id="signup-password"
              label="Password"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              placeholder="Minimum 8 characters"
              minLength={8}
            />

            {/* Confirm Password */}
            <PasswordField
              id="signup-confirm-password"
              label="Confirm Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirmPassword}
              onToggleShow={() => setShowConfirmPassword((v) => !v)}
              placeholder="Re-enter your password"
              minLength={8}
            />

            {/* Password strength hint */}
            {password.length > 0 && (
              <div className="flex items-center gap-2">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      password.length >= (i + 1) * 3
                        ? password.length >= 12
                          ? 'bg-emerald-500'
                          : password.length >= 8
                          ? 'bg-amber-400'
                          : 'bg-rose-500'
                        : 'bg-slate-800'
                    }`}
                  />
                ))}
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  {password.length < 8
                    ? 'Too short'
                    : password.length < 12
                    ? 'Good'
                    : 'Strong'}
                </span>
              </div>
            )}

            {/* Confirm match indicator */}
            {confirmPassword.length > 0 && (
              <p
                className={`text-[11px] -mt-1 flex items-center gap-1.5 ${
                  password === confirmPassword ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {password === confirmPassword ? (
                  <><CheckCircle2 className="h-3.5 w-3.5" /> Passwords match</>
                ) : (
                  <><AlertCircle className="h-3.5 w-3.5" /> Passwords do not match</>
                )}
              </p>
            )}

            {/* Terms & Conditions */}
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-cyan-400 cursor-pointer shrink-0"
              />
              <span className="text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed">
                I agree to the{' '}
                <span className="text-cyan-400 hover:underline cursor-pointer font-semibold">
                  Terms &amp; Conditions
                </span>{' '}
                and{' '}
                <span className="text-cyan-400 hover:underline cursor-pointer font-semibold">
                  Privacy Policy
                </span>
              </span>
            </label>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              className="w-full mt-2"
              disabled={!termsAccepted}
            >
              Create Account
            </Button>
          </form>

          <div className="mt-5 text-center text-xs text-slate-400">
            Already have an account?{' '}
            <button
              onClick={() => switchView('login')}
              className="text-cyan-400 font-semibold hover:underline cursor-pointer"
            >
              Sign In
            </button>
          </div>
        </Card>
      )}

      {/* Supabase Status Card */}
      <SupabaseStatusCard supabaseConfig={supabaseConfig} />
    </div>
  );
};

// ==============================================================================
// Supabase Cloud Integration Status Card (shared footer)
// ==============================================================================
const SupabaseStatusCard: React.FC<{ supabaseConfig: { supabaseUrl: string; isConfigured: boolean } }> = ({
  supabaseConfig,
}) => (
  <Card className="p-4 border-slate-800 text-xs text-slate-400 space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-slate-300 font-semibold">
        <Database className="h-4 w-4 text-cyan-400" />
        <span>Supabase Cloud Integration Status</span>
      </div>
      <Badge variant={supabaseConfig.isConfigured ? 'emerald' : 'cyan'} size="sm">
        {supabaseConfig.isConfigured ? 'Connected' : 'Ready (.env.local)'}
      </Badge>
    </div>
    <p className="leading-relaxed">
      {supabaseConfig.isConfigured
        ? `Connected to Supabase endpoint (${supabaseConfig.supabaseUrl}). User tokens issue signed PostgreSQL JWTs securing Row Level Security (RLS) policies. Database trigger creates profile and SmartHomeX Smart Villa home on signup.`
        : 'SmartHomeX is configured with the official @supabase/supabase-js client and full 9-table schema. Add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local to activate live cloud synchronization.'}
    </p>
  </Card>
);

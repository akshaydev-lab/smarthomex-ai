import React, { useState } from 'react';
import { 
  Settings, 
  Cpu, 
  Volume2, 
  ShieldAlert, 
  Database, 
  Save, 
  CheckCircle2, 
  Radio,
  KeyRound,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { getSupabaseConfig, getSupabaseClient } from '../lib/supabaseClient';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, isAuthenticated, user, setCurrentPage } = useSmartHome();
  const [formData, setFormData] = useState({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [mqttTesting, setMqttTesting] = useState(false);
  const [mqttStatus, setMqttStatus] = useState<string | null>(null);

  // Temporary ESP32 Device Registration State
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isRegisteringToken, setIsRegisteringToken] = useState(false);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  const FIXED_HOME_ID = 'e5ad96e9-d517-42bf-b6c6-94546ed7255e';
  const FIXED_DEVICE_NODE_ID = 'ESP32-WROOM-32-NODE-01';

  /**
   * Safely extracts and formats error messages from Supabase PostgrestError,
   * standard Error instances, or plain exception objects without masking details.
   */
  const extractSafeErrorMessage = (err: unknown): string => {
    if (!err) {
      return 'An unexpected error occurred during device token registration.';
    }

    if (typeof err === 'object' && err !== null) {
      const record = err as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim()) {
        let msg = record.message.trim();
        if (typeof record.details === 'string' && record.details.trim() && record.details.trim() !== msg) {
          msg += ` (${record.details.trim()})`;
        }
        if (typeof record.hint === 'string' && record.hint.trim()) {
          msg += ` [Hint: ${record.hint.trim()}]`;
        }
        return msg;
      }

      if (typeof record.error_description === 'string' && record.error_description.trim()) {
        return record.error_description.trim();
      }
    }

    if (typeof err === 'string' && err.trim()) {
      return err.trim();
    }

    if (err instanceof Error && err.message) {
      return err.message;
    }

    return 'Failed to register device token.';
  };

  const handleRegisterDeviceToken = async () => {
    const trimmedToken = tokenInput.trim();
    if (!trimmedToken) {
      setRegError('Please enter the ESP32 device token.');
      setRegSuccess(null);
      return;
    }

    if (trimmedToken.length < 16) {
      setRegError('Device token is too short: Minimum 16 characters required for hardware security.');
      setRegSuccess(null);
      return;
    }

    setIsRegisteringToken(true);
    setRegError(null);
    setRegSuccess(null);

    try {
      const client = getSupabaseClient();
      if (!client) {
        setRegError('Supabase client is not configured. Please check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY configuration.');
        return;
      }

      // Explicitly check for active authenticated Supabase session
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) {
        setRegError(`Authentication session error: ${sessionError.message}`);
        return;
      }

      const session = sessionData?.session;
      if (!session || !session.user) {
        setRegError('Authentication required: You must be signed in with an active Supabase user account to register an ESP32 hardware device token. Please go to the Account page to sign in.');
        return;
      }

      // Invoke register_device_token with authenticated session user ID and target parameters
      const { data, error } = await client.rpc('register_device_token', {
        p_user_id: session.user.id,
        p_home_id: FIXED_HOME_ID,
        p_device_node_id: FIXED_DEVICE_NODE_ID,
        p_raw_token: trimmedToken,
      });

      if (error) {
        setRegError(extractSafeErrorMessage(error));
        return;
      }

      setRegSuccess(`Device token registered successfully for node "${FIXED_DEVICE_NODE_ID}". (Token ID: ${data || 'verified'})`);
      setTokenInput('');
    } catch (err: unknown) {
      setRegError(extractSafeErrorMessage(err));
    } finally {
      setIsRegisteringToken(false);
    }
  };

  const supabaseConfig = getSupabaseConfig();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const testMqttConnection = () => {
    setMqttTesting(true);
    setMqttStatus(null);
    setTimeout(() => {
      setMqttTesting(false);
      setMqttStatus('MQTT Handshake Simulated: Broker reachable, ESP32 topic registered. [Demo]');
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">System & Hardware Configuration</h2>
            <p className="text-xs text-slate-400">
              Manage ESP32 network bridge, safety thresholds, and cloud parameters
            </p>
          </div>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30 animate-fade-in">
            <CheckCircle2 className="h-4 w-4" />
            <span>Settings saved successfully!</span>
          </div>
        )}
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: ESP32 Hardware Network Configuration */}
        <Card className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100">ESP32 Hardware Bridge Configuration</h3>
            </div>
            <Badge variant="teal" size="sm">Phase 2 Target</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                ESP32 Local IP Address / Hostname
              </label>
              <input
                type="text"
                value={formData.esp32IpAddress}
                onChange={(e) => setFormData({ ...formData, esp32IpAddress: e.target.value })}
                placeholder="192.168.1.185"
                className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Local Wi-Fi IP assigned by home router to the ESP32 microcontroller
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                MQTT Broker Endpoint
              </label>
              <input
                type="text"
                value={formData.mqttBroker}
                onChange={(e) => setFormData({ ...formData, mqttBroker: e.target.value })}
                placeholder="mqtt://broker.emqx.io:1883"
                className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Public or private MQTT broker URL for bidirectional publish/subscribe
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                ESP32 Base Telemetry Topic
              </label>
              <input
                type="text"
                value={formData.esp32MqttTopic}
                onChange={(e) => setFormData({ ...formData, esp32MqttTopic: e.target.value })}
                placeholder="smarthomex/main-board"
                className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
              />
            </div>

            <div className="flex flex-col justify-end">
              <Button
                type="button"
                variant="outline"
                size="md"
                isLoading={mqttTesting}
                leftIcon={<Radio className="h-4 w-4" />}
                onClick={testMqttConnection}
                className="w-full"
              >
                Test MQTT Ping [Simulated]
              </Button>
            </div>
          </div>

          {mqttStatus && (
            <div className="mt-3 p-2.5 rounded-xl bg-teal-950/40 border border-teal-500/30 text-teal-300 text-xs font-mono animate-fade-in">
              {mqttStatus}
            </div>
          )}
        </Card>

        {/* Temporary Panel: ESP32 Device Token Registration */}
        <Card className="p-5 border-amber-500/30 bg-gradient-to-br from-amber-950/15 via-slate-900/90 to-slate-950">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Temporary: ESP32 Device Token Registration
                </h3>
                <p className="text-xs text-slate-400">
                  Register hardware token in database via authenticated register_device_token RPC
                </p>
              </div>
            </div>
            <Badge variant="amber" size="sm">Temporary Utility</Badge>
          </div>

          <div className="space-y-4 text-xs">
            {/* Missing Session Explicit Notice */}
            {!isAuthenticated && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-300 block">Supabase Authentication Required</span>
                    <span className="text-slate-300 text-[11px]">
                      You must be signed in with an active Supabase user session to register an ESP32 hardware device token.
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage('auth')}
                  className="shrink-0 border-amber-500/50 hover:bg-amber-500/20 text-amber-200 text-xs whitespace-nowrap"
                >
                  Sign In to Account
                </Button>
              </div>
            )}

            {/* Authenticated Session Badge */}
            {isAuthenticated && user && (
              <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Authenticated session: <strong className="font-mono text-slate-100">{user.email || user.name}</strong>
                  </span>
                </div>
                <Badge variant="emerald" size="sm">Session Active</Badge>
              </div>
            )}

            {/* Fixed Configuration Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[11px] font-mono text-slate-400 block mb-1">Target Home ID (Fixed):</span>
                <span className="font-mono text-cyan-300 text-xs select-all break-all font-semibold">
                  {FIXED_HOME_ID}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-[11px] font-mono text-slate-400 block mb-1">Device Node ID (Fixed):</span>
                <span className="font-mono text-teal-300 text-xs select-all font-semibold">
                  {FIXED_DEVICE_NODE_ID}
                </span>
              </div>
            </div>

            {/* Token Password Input */}
            <div>
              <label htmlFor="esp32-raw-token" className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                ESP32 Device Token
              </label>
              <div className="relative">
                <input
                  id="esp32-raw-token"
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    if (regError) setRegError(null);
                  }}
                  placeholder="Enter ESP32 device token"
                  autoComplete="off"
                  className="glass-input w-full pl-3 pr-10 py-2.5 rounded-xl text-slate-100 font-mono text-xs placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Never logged or persisted in browser storage. Token is hashed directly inside PostgreSQL.
              </span>
            </div>

            {/* Error Message */}
            {regError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <span className="font-semibold block text-rose-200">Registration Error:</span>
                  <p className="font-mono text-[11px] text-rose-300 whitespace-pre-wrap break-words">{regError}</p>
                  {(regError.toLowerCase().includes('authentication required') || regError.toLowerCase().includes('session') || regError.toLowerCase().includes('auth.uid() is null')) && (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage('auth')}
                        className="border-rose-500/50 hover:bg-rose-500/20 text-rose-200 text-xs py-1 px-2.5"
                      >
                        Go to Account Sign In
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Success Message */}
            {regSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2 animate-fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">Success:</span>
                  <span>{regSuccess}</span>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                variant="primary"
                size="md"
                isLoading={isRegisteringToken}
                leftIcon={<ShieldCheck className="h-4 w-4" />}
                onClick={handleRegisterDeviceToken}
                className="bg-amber-600 hover:bg-amber-500 border-amber-500 text-white"
              >
                Register Device Token
              </Button>
            </div>
          </div>
        </Card>

        {/* Section 2: Safety Threshold Configuration */}
        <Card className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-400" />
              <h3 className="text-sm font-bold text-slate-100">Safety & Trip Thresholds</h3>
            </div>
            <Badge variant="rose" size="sm">Life Safety</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                MQ-2 Gas Evacuation Trigger (PPM)
              </label>
              <input
                type="number"
                value={formData.gasAlarmThreshold}
                onChange={(e) => setFormData({ ...formData, gasAlarmThreshold: Number(e.target.value) })}
                className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Trips Relay 4 (Exhaust) + Buzzer when exceeded
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Thermal Alarm Limit (°C)
              </label>
              <input
                type="number"
                value={formData.tempAlarmThreshold}
                onChange={(e) => setFormData({ ...formData, tempAlarmThreshold: Number(e.target.value) })}
                className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                High temperature warning point for DHT11
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Max Continuous Power Load (W)
              </label>
              <input
                type="number"
                value={formData.powerAlarmThreshold}
                onChange={(e) => setFormData({ ...formData, powerAlarmThreshold: Number(e.target.value) })}
                className="glass-input w-full px-3 py-2 rounded-xl text-slate-100 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Current overload guard via INA219
              </span>
            </div>
          </div>
        </Card>

        {/* Section 3: Audio & Simulation Toggles */}
        <Card className="p-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800 mb-4">
            <Volume2 className="h-5 w-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">Preferences & Simulation Sandbox</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-200 block">HomeX Voice Audio Feedback</span>
                <span className="text-[11px] text-slate-400">Speak vocal responses using Web SpeechSynthesis</span>
              </div>
              <input
                type="checkbox"
                checked={formData.voiceFeedbackEnabled}
                onChange={(e) => setFormData({ ...formData, voiceFeedbackEnabled: e.target.checked })}
                className="h-4 w-4 accent-cyan-500 rounded cursor-pointer"
              />
            </div>

            {!import.meta.env.PROD && (
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-200 block">Demo Telemetry Fluctuations</span>
                  <span className="text-[11px] text-slate-400">Simulate realistic micro-variations in sensor streams (Dev only)</span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.demoSimulationActive}
                  onChange={(e) => setFormData({ ...formData, demoSimulationActive: e.target.checked })}
                  className="h-4 w-4 accent-cyan-500 rounded cursor-pointer"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Section 4: Supabase Cloud Readiness */}
        <Card className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-teal-400" />
              <h3 className="text-sm font-bold text-slate-100">Supabase Backend Integration Status</h3>
            </div>
            <Badge variant={supabaseConfig.isConfigured ? 'emerald' : 'cyan'} size="sm">
              {supabaseConfig.isConfigured ? 'Live Cloud Connected' : 'Architecture & Client Ready'}
            </Badge>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Connection State:</span>
              <span className={`font-mono font-semibold ${supabaseConfig.isConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
                {supabaseConfig.isConfigured ? 'Connected to Project Endpoint' : 'Template Prepared (.env.example / .env.local)'}
              </span>
            </div>
            {supabaseConfig.isConfigured && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Project Endpoint:</span>
                <span className="text-cyan-300 font-mono text-[11px] truncate max-w-[280px]">
                  {supabaseConfig.supabaseUrl}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Security Architecture:</span>
              <span className="text-slate-300 font-mono">Row Level Security (RLS) + HMAC Command Nonces</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-1">Target PostgreSQL Schema (9 Tables):</span>
              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                {['profiles', 'homes', 'devices', 'sensor_readings', 'device_commands', 'device_schedules', 'automation_rules', 'alerts', 'device_status'].map(t => (
                  <span key={t} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Submit Bar */}
        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            variant="primary"
            size="md"
            leftIcon={<Save className="h-4 w-4" />}
          >
            Save Configuration
          </Button>
        </div>
      </form>
    </div>
  );
};

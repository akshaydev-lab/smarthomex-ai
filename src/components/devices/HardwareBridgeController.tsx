import React, { useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Cpu, 
  AlertOctagon, 
  ShieldAlert, 
  Droplets, 
  Activity, 
  Key, 
  Terminal,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export const HardwareBridgeController: React.FC = () => {
  const { 
    hardwareBridge, 
    updateHardwareBridge, 
    testAccelerateWaterMotorCutoff,
    telemetry,
    triggerGasLeakAlert,
    clearSimulatedIncident
  } = useSmartHome();

  const [expanded, setExpanded] = useState<boolean>(true);
  const isDemoMode = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';

  return (
    <Card className="mb-6 border border-cyan-500/30 bg-gradient-to-r from-slate-900/95 via-slate-950 to-slate-900/95 shadow-xl">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">
                Hardware Bridge & Failure Simulation Controller
              </h3>
              <Badge variant="cyan" size="sm">
                Supabase RLS & ESP32 Node
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              Interactive test bench for connection dropouts, hardware acknowledgment, and safety locks.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 transition-colors cursor-pointer"
          >
            {expanded ? (
              <>Less Diagnostics <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>Show Diagnostics <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Diagnostic Switches Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. ESP32 Hardware Status Toggle */}
            <div className={`p-3 rounded-xl border transition-all ${
              isDemoMode && telemetry.esp32Status === 'demo_mode'
                ? 'bg-amber-950/20 border-amber-500/30'
                : hardwareBridge.esp32Connected 
                ? 'bg-slate-900/60 border-emerald-500/30' 
                : 'bg-rose-950/20 border-rose-500/50 shadow-glow-rose'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-cyan-400" /> ESP32 Node
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  isDemoMode && telemetry.esp32Status === 'demo_mode'
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : hardwareBridge.esp32Connected 
                    ? 'bg-emerald-500/20 text-emerald-300' 
                    : 'bg-rose-500/20 text-rose-300 font-bold'
                }`}>
                  {isDemoMode && telemetry.esp32Status === 'demo_mode'
                    ? 'DEMO SIMULATION' 
                    : hardwareBridge.esp32Connected 
                    ? 'HARDWARE ONLINE' 
                    : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2.5">
                {isDemoMode && telemetry.esp32Status === 'demo_mode'
                  ? 'Running in Demo Mode. Physical ESP32 is NOT connected. Actions are emulated in browser.'
                  : hardwareBridge.esp32Connected 
                  ? 'ESP32 controller node acknowledging relay commands over gateway.'
                  : 'ESP32 node unreachable. UI will reject state flips with timeout error.'}
              </p>
              {isDemoMode && (
                <button
                  onClick={() => updateHardwareBridge({ esp32Connected: !hardwareBridge.esp32Connected })}
                  className={`w-full py-1 px-2 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                    telemetry.esp32Status === 'demo_mode'
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      : hardwareBridge.esp32Connected
                      ? 'bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border-slate-700'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  }`}
                >
                  {telemetry.esp32Status === 'demo_mode'
                    ? 'Demo Simulation Active'
                    : hardwareBridge.esp32Connected 
                    ? 'Simulate ESP32 Offline' 
                    : 'Reconnect ESP32'}
                </button>
              )}
            </div>

            {/* 2. Internet Connectivity Toggle */}
            <div className={`p-3 rounded-xl border transition-all ${
              hardwareBridge.internetConnected 
                ? 'bg-slate-900/60 border-cyan-500/30' 
                : 'bg-rose-950/20 border-rose-500/50 shadow-glow-rose'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  {hardwareBridge.internetConnected ? <Wifi className="h-4 w-4 text-cyan-400" /> : <WifiOff className="h-4 w-4 text-rose-400" />} 
                  Internet Gateway
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  hardwareBridge.internetConnected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300 font-bold'
                }`}>
                  {hardwareBridge.internetConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2.5">
                {hardwareBridge.internetConnected
                  ? 'Supabase REST/WebSockets uplink operational.'
                  : 'Internet down. Cloud API requests will fail immediately.'}
              </p>
              {isDemoMode && (
                <button
                  onClick={() => updateHardwareBridge({ internetConnected: !hardwareBridge.internetConnected })}
                  className={`w-full py-1 px-2 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                    hardwareBridge.internetConnected
                      ? 'bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border-slate-700'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                  }`}
                >
                  {hardwareBridge.internetConnected ? 'Disconnect Internet' : 'Restore Internet'}
                </button>
              )}
            </div>

            {/* 3. Force Hardware Failure Ingestion */}
            <div className={`p-3 rounded-xl border transition-all ${
              hardwareBridge.simulateFailure 
                ? 'bg-amber-950/30 border-amber-500/50 shadow-glow-amber' 
                : 'bg-slate-900/60 border-slate-800'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <AlertOctagon className="h-4 w-4 text-amber-400" /> GPIO Failure
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  hardwareBridge.simulateFailure ? 'bg-amber-500/20 text-amber-300 font-bold' : 'bg-slate-800 text-slate-400'
                }`}>
                  {hardwareBridge.simulateFailure ? 'FAIL INJECTED' : 'NORMAL'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2.5">
                {hardwareBridge.simulateFailure
                  ? 'Optocoupler readback failure injected. Commands will fail.'
                  : 'Relays coil feedback loop responding normally.'}
              </p>
              {isDemoMode && (
                <button
                  onClick={() => updateHardwareBridge({ simulateFailure: !hardwareBridge.simulateFailure })}
                  className={`w-full py-1 px-2 rounded-lg text-xs font-semibold cursor-pointer border transition-all ${
                    hardwareBridge.simulateFailure
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border-slate-700'
                  }`}
                >
                  {hardwareBridge.simulateFailure ? 'Clear Failure Injection' : 'Inject Command Failure'}
                </button>
              )}
            </div>

            {/* 4. Safety Controls: Gas Emergency & Water Cutoff */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4 text-rose-400" /> Safety Actions
                  </span>
                  <Badge variant={telemetry.gasStatus === 'danger' ? 'rose' : 'emerald'} size="sm">
                    {telemetry.gasStatus === 'danger' ? 'GAS ALERT' : 'SECURE'}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400 mb-2">
                  Test gas safety lockout (highest priority) or motor 30m cutoff.
                </p>
              </div>

              {isDemoMode && (
                <div className="flex gap-2">
                  {telemetry.gasStatus === 'danger' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-1/2 text-[10px] py-1"
                      onClick={clearSimulatedIncident}
                    >
                      Clear Gas Alert
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      className="w-1/2 text-[10px] py-1"
                      onClick={() => triggerGasLeakAlert(510, 'Kitchen & Utility Area')}
                    >
                      Trigger Gas Leak
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-1/2 text-[10px] py-1 text-blue-300 border-blue-500/30 hover:bg-blue-500/10"
                    onClick={testAccelerateWaterMotorCutoff}
                    leftIcon={<Droplets className="h-3 w-3 text-blue-400" />}
                  >
                    Trip 30m Cutoff
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Last Authenticated Command Payload Inspector */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800/80 mb-2">
              <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                <Terminal className="h-3.5 w-3.5" /> Authenticated Supabase Command Bus (Audit Log)
              </span>
              <span className="text-[11px]">HMAC SHA-256 JWT Nonce Validation</span>
            </div>

            {hardwareBridge.lastCommandSent ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1 font-bold ${
                    hardwareBridge.lastCommandSent.status === 'acknowledged' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {hardwareBridge.lastCommandSent.status === 'acknowledged' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {hardwareBridge.lastCommandSent.status.toUpperCase()}
                  </span>
                  <span className="text-slate-300">
                    Device: <strong>{hardwareBridge.lastCommandSent.deviceName}</strong> ({hardwareBridge.lastCommandSent.deviceId})
                  </span>
                  <span className="text-slate-400">
                    Action: <strong className="text-cyan-300">{hardwareBridge.lastCommandSent.action}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  {hardwareBridge.lastCommandSent.roundTripMs && (
                    <span className="flex items-center gap-1 text-slate-300">
                      <Activity className="h-3 w-3 text-cyan-400" />
                      Round-trip: {hardwareBridge.lastCommandSent.roundTripMs}ms
                    </span>
                  )}
                  <span>
                    Hardware Confirmed: <strong className={hardwareBridge.lastCommandSent.confirmedByHardware ? 'text-emerald-400' : 'text-slate-400'}>
                      {hardwareBridge.lastCommandSent.confirmedByHardware ? 'YES (ESP32 GPIO ACK)' : 'NO'}
                    </strong>
                  </span>
                  <span>{hardwareBridge.lastCommandSent.timestamp}</span>
                </div>

                {hardwareBridge.lastCommandSent.error && (
                  <div className="w-full mt-1 p-2 rounded-lg bg-rose-950/30 border border-rose-500/20 text-rose-300 text-[11px]">
                    <strong>Failure Details:</strong> {hardwareBridge.lastCommandSent.error}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 flex items-center gap-2 py-1">
                <Key className="h-3.5 w-3.5 text-slate-600" />
                No manual or automated hardware commands dispatched yet in this session. Click any device switch above to inspect round-trip telemetry.
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

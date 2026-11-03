import React, { useState } from 'react';
import { 
  Flame, 
  Volume2, 
  VolumeX, 
  MapPin, 
  Clock, 
  ZapOff, 
  Bell, 
  CheckCircle2, 
  Radio, 
  EyeOff,
  BellOff,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export const GasEmergencyModal: React.FC = () => {
  const { 
    telemetry, 
    gasSafetyState,
    isGasEmergencyModalOpen, 
    setIsGasEmergencyModalOpen, 
    isSirenMuted, 
    toggleSirenMute, 
    silenceMobileSiren,
    authorizeSafetyReset,
    pushNotificationStatus,
    requestPushPermission 
  } = useSmartHome();

  const [operatorName, setOperatorName] = useState('Lead Safety Inspector');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const [currentDateStr] = useState<string>(() => {
    return new Date().toLocaleString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  });

  const isEmergencyActive = 
    telemetry.gasStatus === 'danger' || 
    gasSafetyState.lockoutStatus === 'CRITICAL' || 
    gasSafetyState.lockoutStatus === 'SILENCED' || 
    gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET' ||
    gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' ||
    gasSafetyState.gasClearedPendingReset;

  if (!isGasEmergencyModalOpen || !isEmergencyActive) {
    return null;
  }

  const isSilenced = gasSafetyState.lockoutStatus === 'SILENCED' || gasSafetyState.isMobileSirenSilenced;
  const isClearedPendingReset = gasSafetyState.gasClearedPendingReset || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET';
  const isGasHazardPresent = telemetry.gasStatus === 'danger' || Boolean(gasSafetyState.rawAdc && gasSafetyState.rawAdc >= 1200);

  const handleExecuteSafetyReset = async () => {
    if (isGasHazardPresent) {
      setResetError('Cannot reset: Combustible gas condition is still active! Readings must return to clean air baseline.');
      return;
    }

    setResetError(null);
    await authorizeSafetyReset(operatorName || 'Authorized Safety Officer');
    setShowResetConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      {/* Background strobe / emergency glow */}
      <div className="absolute inset-0 bg-radial from-rose-900/40 via-red-950/20 to-transparent pointer-events-none animate-pulse-subtle" />

      {/* Main Alert Card */}
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-rose-950/95 via-slate-950 to-rose-950/95 border-2 border-rose-500 rounded-3xl shadow-[0_0_60px_rgba(239,68,68,0.55)] p-5 sm:p-7 text-slate-100 z-10 overflow-hidden my-auto">
        {/* Top Warning Strip */}
        <div className="flex items-center justify-between pb-4 border-b border-rose-500/30 gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-90 ${
                isClearedPendingReset ? 'bg-amber-400' : 'bg-rose-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                isClearedPendingReset ? 'bg-amber-500' : 'bg-rose-500'
              }`}></span>
            </span>
            <span className="text-xs font-mono font-bold tracking-widest text-rose-300 uppercase">
              SmartHomeX AI Emergency System
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Badge 
              variant={isSilenced ? 'amber' : isClearedPendingReset ? 'amber' : 'rose'} 
              size="sm"
              pulse={!isSilenced}
            >
              STATUS: {gasSafetyState.lockoutStatus}
            </Badge>

            {/* Mute Web Audio Siren */}
            <button
              onClick={toggleSirenMute}
              className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                isSirenMuted
                  ? 'bg-slate-900 text-slate-400 border-slate-700'
                  : 'bg-rose-500/25 text-rose-200 border-rose-500/50 shadow-glow-danger animate-pulse'
              }`}
              title={isSirenMuted ? 'Unmute Web Siren' : 'Mute Web Siren'}
            >
              {isSirenMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-rose-300" />}
            </button>
          </div>
        </div>

        {/* Center Alert Header */}
        <div className="mt-4 text-center">
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-3xl bg-gradient-to-tr from-rose-600 to-red-500 p-1 mx-auto mb-3 shadow-[0_0_40px_rgba(239,68,68,0.7)] flex items-center justify-center animate-bounce">
            <div className="h-full w-full bg-slate-950 rounded-[22px] flex items-center justify-center">
              <Flame className="h-8 w-8 sm:h-10 sm:w-10 text-rose-500" />
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white uppercase drop-shadow-[0_0_15px_rgba(244,63,94,0.9)]">
            🚨 CRITICAL GAS LEAKAGE ALERT
          </h2>
          <p className="text-sm font-semibold text-rose-300 mt-1 flex items-center justify-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            ⚠️ Possible Gas Leakage Detected!
          </p>
        </div>

        {/* Mandatory Life-Safety Live Status Panel */}
        <div className="mt-4 p-4 rounded-2xl bg-slate-950/90 border border-rose-500/50 space-y-2">
          <div className="text-xs font-mono font-bold text-rose-300 uppercase tracking-wide border-b border-rose-500/20 pb-1.5 flex items-center justify-between">
            <span>Hardware Life-Safety Interlock States:</span>
            <span className="text-[10px] text-slate-400">{currentDateStr}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Gas Sensor</span>
              <span className={`font-bold ${isGasHazardPresent ? 'text-rose-400' : 'text-emerald-400'}`}>
                MQ-2 — {isGasHazardPresent ? 'DANGER' : 'CLEAR'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Relay 1 (Light)</span>
              <span className="font-bold text-rose-400">OFF (FORCED)</span>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Relay 2 (Fan)</span>
              <span className="font-bold text-rose-400">OFF (FORCED)</span>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Relay 3 (Motor)</span>
              <span className="font-bold text-rose-400">OFF (FORCED)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono pt-1">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">DC Exhaust Fan (GPIO 27)</span>
              <span className={`font-bold ${gasSafetyState.exhaustFanActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                {gasSafetyState.exhaustFanActive ? 'ON (Safety-Approved)' : 'DISABLED (Spark Hazard)'}
              </span>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Main Contactor</span>
              <span className="font-bold text-rose-400">TRIPPED (ISOLATED)</span>
            </div>

            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Local Buzzer & Siren</span>
              <span className={`font-bold ${isSilenced ? 'text-amber-400' : 'text-rose-400'}`}>
                {isSilenced ? 'SILENCED (Active)' : 'ACTIVE (960Hz)'}
              </span>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-500/30 text-center">
            <span className="text-xs font-bold text-rose-200">
              Safety Reset: <span className="text-rose-400 underline">REQUIRED</span> before any circuits can be re-energized.
            </span>
          </div>
        </div>

        {/* Warning Directive */}
        <div className="mt-3 p-3 rounded-2xl bg-amber-950/40 border border-amber-500/50 flex items-start gap-2.5">
          <ZapOff className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200 leading-relaxed font-semibold">
            ⚠️ Do not operate electrical switches in the affected area. Electrical arcs ignite combustible gases. Follow your gas emergency procedure and evacuate the premises immediately!
          </p>
        </div>

        {/* Mobile Siren Manual Silence Banner */}
        <div className="mt-3 p-3 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-white block">
              Mobile Siren & Vibration Control:
            </span>
            <span className="text-[11px] text-slate-400">
              {isSilenced
                ? 'Siren audible alert silenced. Emergency state remains ACTIVE in background.'
                : 'Audible emergency siren is currently sounding on phone and web.'}
            </span>
          </div>

          {!isSilenced ? (
            <button
              onClick={silenceMobileSiren}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-glow-danger border border-rose-400 flex items-center gap-1.5 cursor-pointer animate-pulse"
            >
              <BellOff className="h-4 w-4" />
              <span>SILENCE SIREN</span>
            </button>
          ) : (
            <Badge variant="amber" size="md">
              SIREN SILENCED
            </Badge>
          )}
        </div>

        {/* Safety Reset Confirmation Box */}
        {showResetConfirm && (
          <div className="mt-3 p-4 rounded-2xl bg-slate-900 border-2 border-emerald-500/60 animate-fade-in space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
              <UserCheck className="h-5 w-5" />
              <span>Authorize Independent Safety Reset</span>
            </div>
            <p className="text-xs text-slate-300">
              Confirm that qualified personnel have physically inspected the affected area, verified cross-ventilation, and confirmed zero remaining gas pockets using a calibrated combustible detector.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Authorized Operator / Inspector Name"
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleExecuteSafetyReset}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow-emerald cursor-pointer"
              >
                Confirm & Re-arm
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs"
              >
                Cancel
              </button>
            </div>

            {resetError && (
              <p className="text-xs text-rose-400 font-semibold">{resetError}</p>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="mt-5 pt-4 border-t border-rose-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!showResetConfirm && (
              <Button
                variant={isGasHazardPresent ? 'outline' : 'secondary'}
                size="sm"
                leftIcon={<ShieldCheck className={`h-4 w-4 ${isGasHazardPresent ? 'text-slate-500' : 'text-emerald-400'}`} />}
                onClick={() => setShowResetConfirm(true)}
                disabled={isGasHazardPresent}
                title={isGasHazardPresent ? 'Cannot reset while gas hazard is active' : 'Authorize Safety Reset'}
              >
                {isGasHazardPresent ? 'Reset Locked (Gas Active)' : 'Authorize Safety Reset'}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<EyeOff className="h-4 w-4" />}
              onClick={() => setIsGasEmergencyModalOpen(false)}
              className="text-slate-300 border-slate-700 hover:bg-slate-800"
            >
              Dismiss Overlay
            </Button>

            <Button
              variant="danger"
              size="md"
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
              onClick={() => setIsGasEmergencyModalOpen(false)}
              className="w-full sm:w-auto"
            >
              I Have Evacuated
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  ZapOff, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  UserCheck, 
  Loader2,
  Unplug,
  Activity
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { LockoutResetUiStatus } from '../../types';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export const EmergencyLockoutResetControl: React.FC = () => {
  const { 
    telemetry, 
    gasSafetyState, 
    authorizeSafetyReset,
    hardwareBridge,
    resetLockoutUiStatus,
    resetLockoutDetail
  } = useSmartHome();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [operatorName, setOperatorName] = useState('Authorized Safety Officer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isEmergencyActive = 
    telemetry.gasStatus === 'danger' || 
    gasSafetyState.lockoutStatus === 'CRITICAL' || 
    gasSafetyState.lockoutStatus === 'SILENCED' || 
    gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET' ||
    gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' ||
    gasSafetyState.gasClearedPendingReset ||
    gasSafetyState.mainContactorTripped;

  // Only render when an emergency lockout is active
  if (!isEmergencyActive && resetLockoutUiStatus === 'LOCKOUT CLEARED') {
    return null;
  }

  const currentAdc = telemetry.gasRawAdc ?? gasSafetyState.rawAdc ?? 410;
  const isGasUnsafe = telemetry.gasStatus === 'danger' || currentAdc >= 900;
  const isSensorFault = gasSafetyState.sensorFault || currentAdc < 45 || telemetry.gasStatus === 'sensor_fault';
  const isHardwareOffline = !hardwareBridge.esp32Connected;
  const isWarmup = telemetry.gasStatus === 'warming_up';

  const canExecuteReset = !isGasUnsafe && !isSensorFault && !isHardwareOffline && !isWarmup && !isSubmitting;

  const getStatusBadgeVariant = (status: LockoutResetUiStatus) => {
    switch (status) {
      case 'LOCKOUT CLEARED':
        return 'emerald';
      case 'RESET REQUESTED':
      case 'WAITING FOR ESP32':
        return 'cyan';
      case 'RECOVERY VALIDATION':
        return 'blue';
      case 'RESET REJECTED — GAS UNSAFE':
      case 'RESET REJECTED — SENSOR FAULT':
      case 'LOCKOUT ACTIVE':
      default:
        return 'rose';
    }
  };

  const handleInitiateReset = () => {
    setLocalError(null);
    setIsConfirmOpen(true);
  };

  const handleConfirmReset = async () => {
    if (!canExecuteReset) {
      if (isGasUnsafe) {
        setLocalError('RESET REJECTED — GAS UNSAFE: Atmosphere gas concentration is at or above clearance threshold (900 ADC).');
      } else if (isSensorFault) {
        setLocalError('RESET REJECTED — SENSOR FAULT: MQ-2 sensor indicates open circuit or disconnected wire (< 45 ADC).');
      } else if (isHardwareOffline) {
        setLocalError('ESP32 node is offline. Hardware must be connected to perform independent safety reset.');
      } else if (isWarmup) {
        setLocalError('Sensor warm-up in progress. Reset prohibited until MQ-2 stabilizes.');
      }
      return;
    }

    try {
      setIsSubmitting(true);
      setLocalError(null);
      await authorizeSafetyReset(operatorName || 'Authorized Safety Officer');
      // If reset succeeded, close modal
      setIsConfirmOpen(false);
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to complete safety reset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* High-Visibility Emergency Lockout Card */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-rose-500/80 bg-gradient-to-r from-rose-950/90 via-slate-950 to-rose-950/90 p-5 sm:p-6 shadow-[0_0_40px_rgba(244,63,94,0.35)] animate-fade-in">
        {/* Glow ambient accent */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rose-600/20 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          {/* Left: Lockout details & Status */}
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="h-10 w-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-white tracking-wide uppercase flex items-center gap-2 flex-wrap">
                  <span>Emergency Safety Lockout</span>
                  <Badge 
                    variant={getStatusBadgeVariant(resetLockoutUiStatus)} 
                    size="sm"
                    pulse={isSubmitting || resetLockoutUiStatus === 'WAITING FOR ESP32' || resetLockoutUiStatus === 'RECOVERY VALIDATION'}
                  >
                    STATUS: {resetLockoutUiStatus}
                  </Badge>
                </h3>
                <p className="text-xs text-rose-200 mt-0.5">
                  Main Contactor TRIPPED. Relays isolated to prevent electrical ignition.
                </p>
              </div>
            </div>

            {/* Hardware Telemetry Metric Badges */}
            <div className="flex items-center gap-2.5 flex-wrap pt-1 font-mono text-xs">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border ${
                isGasUnsafe 
                  ? 'bg-rose-950/80 border-rose-500/50 text-rose-300' 
                  : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              }`}>
                <Activity className="h-3.5 w-3.5" />
                <span>MQ-2 ADC: {currentAdc} / 4095</span>
                <span className="text-[10px] text-slate-400">({isGasUnsafe ? '>= 900 UNSAFE' : '< 900 SAFE'})</span>
              </span>

              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border ${
                isSensorFault 
                  ? 'bg-rose-950/80 border-rose-500/50 text-rose-300' 
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}>
                <Unplug className="h-3.5 w-3.5" />
                <span>Sensor: {isSensorFault ? 'FAULT / DISCONNECTED' : 'HEALTHY'}</span>
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border bg-amber-950/80 border-amber-500/40 text-amber-300">
                <ZapOff className="h-3.5 w-3.5" />
                <span>Relays: INHIBITED (ACTIVE-LOW OFF)</span>
              </span>
            </div>

            {/* Dynamic Status Detail Message */}
            {resetLockoutDetail && (
              <p className="text-xs font-mono text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1.5 rounded-xl flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{resetLockoutDetail}</span>
              </p>
            )}
          </div>

          {/* Right: Action Button */}
          <div className="flex items-center gap-3 self-end lg:self-auto shrink-0">
            <Button
              variant={canExecuteReset ? 'danger' : 'outline'}
              size="md"
              leftIcon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              onClick={handleInitiateReset}
              disabled={isSubmitting}
              className="shadow-glow-danger font-bold text-xs sm:text-sm px-4 py-2.5"
            >
              {isSubmitting ? 'Verifying with ESP32...' : 'Reset Emergency Lockout'}
            </Button>
          </div>
        </div>
      </div>

      {/* Danger-Themed Confirmation Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="relative w-full max-w-lg bg-gradient-to-b from-rose-950 via-slate-950 to-rose-950 border-2 border-rose-500 rounded-3xl shadow-[0_0_60px_rgba(244,63,94,0.5)] p-6 text-slate-100 z-10 my-auto space-y-4">
            {/* Modal Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-rose-500/30">
              <div className="h-11 w-11 rounded-2xl bg-rose-600/30 border border-rose-500 flex items-center justify-center text-rose-300 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white uppercase tracking-wide">
                  Authorize Emergency Reset
                </h3>
                <p className="text-xs text-rose-300">
                  Strict Precondition: Clean atmosphere must be verified.
                </p>
              </div>
            </div>

            {/* Explanation & Safety Rules */}
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-rose-500/30 text-xs space-y-2 text-slate-300">
              <p className="font-semibold text-rose-300">
                ⚠️ CRITICAL LIFE-SAFETY PROTOCOL:
              </p>
              <p>
                Resetting the lockout re-arms the main electrical contactor. Reset is strictly permitted 
                <strong className="text-white"> ONLY after the gas hazard is cleared</strong>.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
                <li>The premises have been physically inspected and cross-ventilated.</li>
                <li>Zero combustible gas pockets remain in the affected area.</li>
                <li>The ESP32 hardware will independently verify continuous clean air for the required stability duration.</li>
                <li>All electrical relays will remain safely OFF during and after reset.</li>
              </ul>
            </div>

            {/* Hardware Preconditions Check List */}
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">MQ-2 Analog Reading:</span>
                <span className={isGasUnsafe ? 'text-rose-400 font-bold flex items-center gap-1' : 'text-emerald-400 font-bold flex items-center gap-1'}>
                  {isGasUnsafe ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {currentAdc} ADC (Threshold: &lt; 900)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Sensor Signal Integrity:</span>
                <span className={isSensorFault ? 'text-rose-400 font-bold flex items-center gap-1' : 'text-emerald-400 font-bold flex items-center gap-1'}>
                  {isSensorFault ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {isSensorFault ? 'FAULT / DISCONNECTED' : 'HEALTHY (>= 45 ADC)'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">ESP32 Hardware Node:</span>
                <span className={isHardwareOffline ? 'text-rose-400 font-bold flex items-center gap-1' : 'text-emerald-400 font-bold flex items-center gap-1'}>
                  {isHardwareOffline ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {isHardwareOffline ? 'OFFLINE' : 'ONLINE & RESPONSIVE'}
                </span>
              </div>
            </div>

            {/* Operator Identifier Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Authorized Safety Officer / Inspector Name:
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="Enter your name or badge number"
                  className="w-full px-3.5 py-2 pl-9 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                <UserCheck className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Error Message */}
            {localError && (
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/60 text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{localError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 border-t border-rose-500/30 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSubmitting}
                className="text-slate-300 border-slate-700 hover:bg-slate-800"
              >
                Cancel
              </Button>

              <Button
                variant={canExecuteReset ? 'danger' : 'outline'}
                size="sm"
                leftIcon={isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                onClick={handleConfirmReset}
                disabled={!canExecuteReset || isSubmitting}
                className="shadow-glow-danger font-bold text-xs"
              >
                {isSubmitting ? 'Verifying with ESP32...' : 'Confirm & Execute Reset'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

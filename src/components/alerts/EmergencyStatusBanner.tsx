import React from 'react';
import { Flame, Volume2, VolumeX, Eye, ShieldCheck, ZapOff, BellOff } from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export const EmergencyStatusBanner: React.FC = () => {
  const { 
    telemetry, 
    gasSafetyState,
    setIsGasEmergencyModalOpen, 
    isSirenMuted, 
    silenceMobileSiren,
    authorizeSafetyReset
  } = useSmartHome();

  const isEmergencyActive = 
    telemetry.gasStatus === 'danger' || 
    gasSafetyState.lockoutStatus === 'CRITICAL' || 
    gasSafetyState.lockoutStatus === 'SILENCED' || 
    gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET' ||
    gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' ||
    gasSafetyState.gasClearedPendingReset;

  if (!isEmergencyActive) {
    return null;
  }

  const isSilenced = gasSafetyState.lockoutStatus === 'SILENCED';
  const isClearedPendingReset = gasSafetyState.gasClearedPendingReset || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET';
  const canReset = !telemetry.smokeDetected && telemetry.gasStatus !== 'danger' && (!gasSafetyState.rawAdc || gasSafetyState.rawAdc < 450);

  return (
    <div className={`mb-6 rounded-2xl border-2 p-4 shadow-[0_0_35px_rgba(244,63,94,0.45)] animate-pulse-subtle ${
      isClearedPendingReset
        ? 'border-amber-500 bg-gradient-to-r from-amber-950 via-slate-950 to-amber-950'
        : 'border-rose-500 bg-gradient-to-r from-rose-950 via-red-950 to-rose-950'
    }`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Beacon and Alert details */}
        <div className="flex items-center gap-3.5">
          <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center shrink-0 animate-bounce ${
            isClearedPendingReset
              ? 'bg-amber-600/30 border-amber-500 text-amber-300'
              : 'bg-rose-600/30 border-rose-500 text-rose-300'
          }`}>
            <Flame className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-90 ${
                  isClearedPendingReset ? 'bg-amber-400' : 'bg-rose-400'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isClearedPendingReset ? 'bg-amber-500' : 'bg-rose-500'
                }`}></span>
              </span>
              <h3 className="font-extrabold text-sm sm:text-base tracking-wide text-white uppercase drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]">
                {isClearedPendingReset 
                  ? `GAS NORMALIZED — SAFETY LOCKOUT ACTIVE (${telemetry.gasPpm} PPM)`
                  : `🚨 CRITICAL GAS LEAKAGE ALERT (${telemetry.gasPpm} PPM)`}
              </h3>
              <Badge 
                variant={isSilenced ? 'amber' : isClearedPendingReset ? 'amber' : 'rose'} 
                size="sm"
                pulse={!isSilenced}
              >
                STATUS: {gasSafetyState.lockoutStatus}
              </Badge>
            </div>
            <p className="text-xs text-rose-200 mt-1 flex items-center gap-2 flex-wrap">
              <span>
                {isClearedPendingReset 
                  ? 'Gas cleared below threshold. Circuits remain isolated. Manual reset required.' 
                  : 'Evacuate immediately! Do NOT flip electrical switches in the affected area.'}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30 text-[10px]">
                <ZapOff className="h-3 w-3" /> Relays & Contactor TRIPPED
              </span>
            </p>
          </div>
        </div>

        {/* Right: Emergency Actions */}
        <div className="flex items-center gap-2 flex-wrap self-end lg:self-auto">
          {/* SILENCE SIREN BUTTON */}
          {!isSilenced && (
            <button
              onClick={silenceMobileSiren}
              className="px-3.5 py-1.5 rounded-xl border border-rose-400 bg-rose-600/40 hover:bg-rose-600/60 text-white text-xs font-bold flex items-center gap-1.5 shadow-glow-danger transition-all cursor-pointer animate-pulse"
              title="Stop acoustic sirens and mobile vibration. CRITICAL emergency state remains ACTIVE."
            >
              <BellOff className="h-4 w-4" />
              <span>SILENCE SIREN</span>
            </button>
          )}

          {isSilenced && (
            <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5">
              <VolumeX className="h-4 w-4 text-amber-400" />
              <span>Siren Silenced (Emergency Active)</span>
            </span>
          )}

          <Button
            variant="danger"
            size="sm"
            leftIcon={<Eye className="h-4 w-4" />}
            onClick={() => setIsGasEmergencyModalOpen(true)}
          >
            Emergency Screen
          </Button>

          {/* AUTHORIZE SAFETY RESET */}
          <Button
            variant={canReset ? 'secondary' : 'outline'}
            size="sm"
            disabled={!canReset}
            leftIcon={<ShieldCheck className={`h-4 w-4 ${canReset ? 'text-emerald-400' : 'text-slate-500'}`} />}
            onClick={() => {
              if (canReset) {
                authorizeSafetyReset('Dashboard Operator');
              }
            }}
            title={canReset ? 'Clear life-safety lockout and re-arm contactor' : 'Disabled: Gas hazard must be cleared before reset'}
          >
            Safety Reset
          </Button>
        </div>
      </div>
    </div>
  );
};

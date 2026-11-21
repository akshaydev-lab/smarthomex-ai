import React from 'react';
import { 
  Flame, 
  ZapOff, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  Eye, 
  Activity, 
  RotateCcw, 
  Unplug 
} from 'lucide-react';
import { SensorTelemetry } from '../../types';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { useSmartHome } from '../../hooks/useSmartHome';

export const GasSensorCard: React.FC<{ telemetry: SensorTelemetry }> = ({ telemetry }) => {
  const { 
    gasSafetyState,
    setIsGasEmergencyModalOpen, 
    isSirenMuted, 
    toggleSirenMute, 
    triggerGasLeakAlert,
    simulateGasClearance,
    simulateSensorFault,
    isAlarmTesting,
    alarmTestCountdown,
    alarmTestError,
    startAlarmTest,
    stopAlarmTest
  } = useSmartHome();

  const rawAdc = telemetry.gasRawAdc ?? gasSafetyState.rawAdc ?? null;
  const isOffline = telemetry.esp32Status === 'offline' || rawAdc == null || telemetry.gasStatus === 'offline';
  const isDanger = !isOffline && (telemetry.gasStatus === 'danger' || gasSafetyState.lockoutStatus === 'CRITICAL');
  const isWarning = !isOffline && telemetry.gasStatus === 'warning';
  const isWarmingUp = !isOffline && telemetry.gasStatus === 'warming_up';
  const isClearedPendingReset = !isOffline && (gasSafetyState.gasClearedPendingReset || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET');
  const isSensorFault = !isOffline && (telemetry.gasStatus === 'sensor_fault' || gasSafetyState.sensorFault || gasSafetyState.lockoutStatus === 'SENSOR_FAULT');

  return (
    <Card className={`relative overflow-hidden transition-all duration-300 p-5 ${
      isDanger 
        ? 'border-2 border-red-500 bg-gradient-to-br from-red-950/60 via-[#141C23] to-[#0B0F12] shadow-[0_0_35px_rgba(239,68,68,0.45)]' 
        : isSensorFault
        ? 'border-2 border-amber-500 bg-gradient-to-br from-amber-950/40 via-[#141C23] to-[#0B0F12]'
        : isWarmingUp
        ? 'border-cyan-500/40 bg-gradient-to-br from-[#141C23] to-[#0B0F12]'
        : isWarning || isClearedPendingReset
        ? 'border-amber-500/50 bg-gradient-to-br from-amber-950/30 via-[#141C23] to-[#0B0F12] shadow-[0_0_20px_rgba(245,158,11,0.2)]'
        : 'border-white/[0.08] bg-[#141C23] hover:border-emerald-500/35'
    }`}>
      {/* Sensor Title Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border transition-all ${
            isDanger 
              ? 'bg-red-500/25 border-red-500 text-red-300 animate-pulse shadow-glow-danger' 
              : isSensorFault
              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
              : isWarmingUp
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 animate-pulse'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}>
            <Flame className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-[#F8FAFC] text-base">
                MQ-2 Combustible Gas & Smoke Sensor
              </h3>
              <Badge variant={telemetry.isHardwareConnected ? 'emerald' : (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true') ? 'demo' : 'slate'} size="sm">
                {telemetry.isHardwareConnected ? 'ESP32 GPIO 34' : (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true') ? 'Demo Emulation' : 'Offline / Standby'}
              </Badge>
              {isDanger && (
                <Badge variant="rose" size="sm" pulse>CRITICAL DANGER</Badge>
              )}
              {isSensorFault && (
                <Badge variant="amber" size="sm">ADC &lt; 45 (FAULT / OPEN)</Badge>
              )}
              {isWarmingUp && (
                <Badge variant="cyan" size="sm" pulse>WARMING UP (60s PREHEAT)</Badge>
              )}
              {isClearedPendingReset && (
                <Badge variant="amber" size="sm">PENDING RESET</Badge>
              )}
            </div>
            <p className="text-xs text-[#94A3B8] font-mono mt-0.5">
              ADC1 Channel 6 • Ground-Truth Raw ADC • Kitchen Safety Zone
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDanger && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Eye className="h-4 w-4" />}
              onClick={() => setIsGasEmergencyModalOpen(true)}
            >
              Emergency Screen
            </Button>
          )}

          <Badge
            variant={
              isOffline
                ? 'slate'
                : isDanger
                ? 'rose'
                : isSensorFault
                ? 'amber'
                : isWarmingUp
                ? 'cyan'
                : isWarning || isClearedPendingReset
                ? 'amber'
                : 'emerald'
            }
            size="md"
            pulse={isDanger || isWarmingUp}
          >
            {isOffline
              ? 'OFFLINE / NO DATA'
              : isDanger 
              ? 'GAS EMERGENCY LOCKOUT' 
              : isSensorFault
              ? 'SENSOR FAULT / OPEN'
              : isWarmingUp
              ? 'WARMING UP (PREHEAT)'
              : isClearedPendingReset
              ? 'LOCKOUT PENDING RESET'
              : isWarning 
              ? 'WARNING / ELEVATED' 
              : 'ENVIRONMENT SAFE'}
          </Badge>
        </div>
      </div>

      {/* Main PPM & ADC Telemetry */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Concentration Meter */}
        <div className="p-3.5 rounded-xl bg-[#111820] border border-white/[0.08]">
          <span className="text-xs font-mono text-[#94A3B8] block mb-1">
            Indicative Gas & Smoke Index
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold font-mono tracking-tight ${
              isDanger 
                ? 'text-red-400' 
                : isSensorFault 
                ? 'text-amber-400' 
                : isWarmingUp 
                ? 'text-cyan-300' 
                : isWarning 
                ? 'text-amber-400' 
                : 'text-emerald-400'
            }`}>
              {isOffline
                ? '--'
                : isSensorFault 
                ? 'ERR' 
                : isWarmingUp 
                ? 'PREHEAT' 
                : telemetry.gasPpm != null 
                ? telemetry.gasPpm 
                : rawAdc != null 
                ? rawAdc 
                : '--'}
            </span>
            <span className="text-xs font-bold font-mono text-[#64748B]">
              {isOffline
                ? ''
                : isSensorFault 
                ? '(Fault ADC < 45)' 
                : isWarmingUp 
                ? 'STABILIZING' 
                : telemetry.gasPpm != null 
                ? 'INDEX' 
                : 'RAW ADC'}
            </span>
          </div>

          <div className="mt-2.5">
            <div className="h-2 w-full bg-[#0B0F12] rounded-full overflow-hidden p-0.5 border border-white/[0.08]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isDanger 
                    ? 'bg-gradient-to-r from-amber-500 to-red-500 shadow-glow-danger' 
                    : isWarmingUp
                    ? 'bg-cyan-400'
                    : isWarning 
                    ? 'bg-amber-400' 
                    : 'bg-emerald-400'
                }`}
                style={{ 
                  width: `${
                    isSensorFault 
                      ? 5 
                      : isWarmingUp 
                      ? 30 
                      : Math.min(100, (((telemetry.gasPpm ?? (rawAdc ? rawAdc / 4 : 0)) / 600) * 100))
                  }%` 
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-[#64748B] mt-1">
              <span>0 (Clean)</span>
              <span>Warning: 1100 ADC</span>
              <span>Trip: 1600+ ADC</span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono text-[#94A3B8]">
            <span>Raw ADC: <strong className="text-[#F8FAFC]">{rawAdc != null ? `${rawAdc} / 4095` : '-- / 4095'}</strong></span>
            <span>Voltage: <strong className="text-[#F8FAFC]">{rawAdc != null ? `${((rawAdc / 4095) * 3.3).toFixed(2)}V` : '-- V'}</strong></span>
          </div>
        </div>

        {/* Electrical Relay & Contactor Lockout */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isDanger || isClearedPendingReset
            ? 'bg-amber-950/30 border-amber-500/50'
            : 'bg-[#111820] border-white/[0.08]'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-[#94A3B8] flex items-center gap-1.5">
              <ZapOff className="h-3.5 w-3.5 text-amber-400" /> Relays & Contactor
            </span>
            <span className="text-[10px] font-mono text-[#64748B]">Spark Prevention</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <span className={`text-sm font-bold block ${
                isDanger || isClearedPendingReset ? 'text-amber-300' : isOffline ? 'text-[#64748B]' : 'text-slate-200'
              }`}>
                {isDanger ? 'ALL RELAYS FORCED OFF' : isClearedPendingReset ? 'LOCKED PENDING RESET' : isOffline ? 'CONTROLLER OFFLINE' : 'CIRCUITS ARMED'}
              </span>
              <span className="text-[11px] text-[#94A3B8]">
                {isDanger || isClearedPendingReset
                  ? 'Main Contactor TRIPPED. Light/Fan/Motor OFF.' 
                  : isOffline
                  ? 'Hardware disconnected. Relays disarmed.'
                  : 'Normal power distribution'}
              </span>
            </div>
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${
              isDanger || isClearedPendingReset
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-[#141C23] border-white/[0.08] text-[#94A3B8]'
            }`}>
              <ZapOff className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* Acoustic Warning Siren & Buzzer */}
        <div className={`p-3.5 rounded-xl border transition-all ${
          isDanger
            ? 'bg-red-950/30 border-red-500/50'
            : isAlarmTesting
            ? 'bg-gradient-to-br from-amber-950/40 via-[#141C23] to-red-950/30 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.25)]'
            : 'bg-[#111820] border-white/[0.08]'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-[#94A3B8] flex items-center gap-1.5">
              <Volume2 className={`h-3.5 w-3.5 ${isAlarmTesting ? 'text-amber-400 animate-bounce' : 'text-red-400'}`} /> Warning Siren
            </span>
            <span className="text-[10px] font-mono text-[#64748B]">960Hz Alert</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div>
              <span className={`text-sm font-bold block ${
                isDanger
                  ? (isSirenMuted ? 'MUTED' : 'PULSING SIREN')
                  : isAlarmTesting
                  ? 'text-amber-300 animate-pulse'
                  : isOffline
                  ? 'OFFLINE'
                  : 'STANDBY'
              }`}>
                {isDanger
                  ? (isSirenMuted ? 'MUTED' : 'PULSING SIREN')
                  : isAlarmTesting
                  ? `TEST ALARM ACTIVE (${alarmTestCountdown}s)`
                  : isOffline
                  ? 'OFFLINE'
                  : 'ARMED / SILENT'}
              </span>
              <span className="text-[11px] text-[#94A3B8]">
                {isDanger
                  ? 'Dual-tone acoustic siren active'
                  : isAlarmTesting
                  ? 'Local browser siren test in progress'
                  : isOffline
                  ? 'ESP32 disconnected'
                  : 'Continuous acoustic monitor'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isDanger && (
                <button
                  onClick={toggleSirenMute}
                  className={`h-8 w-8 rounded-lg flex items-center justify-center border transition-all ${
                    isSirenMuted
                      ? 'bg-[#141C23] border-white/[0.08] text-[#94A3B8] cursor-pointer'
                      : 'bg-red-500/25 border-red-500 text-red-300 animate-pulse cursor-pointer'
                  }`}
                  title={isSirenMuted ? 'Unmute Siren' : 'Mute Siren'}
                >
                  {isSirenMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}

              {/* TEST ALARM / STOP TEST BUTTON */}
              {!isDanger && (
                <button
                  type="button"
                  onClick={isAlarmTesting ? stopAlarmTest : startAlarmTest}
                  disabled={isClearedPendingReset}
                  title="Test your website emergency siren without triggering hardware."
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                    isAlarmTesting
                      ? 'bg-red-600 hover:bg-red-700 text-white border-red-400 shadow-glow-danger animate-pulse'
                      : isClearedPendingReset
                      ? 'bg-[#0B0F12] text-[#64748B] border-white/[0.06] cursor-not-allowed'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/35 hover:border-emerald-400'
                  }`}
                >
                  {isAlarmTesting ? (
                    <>
                      <VolumeX className="h-3.5 w-3.5 text-white" />
                      <span>STOP TEST</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>TEST ALARM</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {alarmTestError && (
        <div className="mt-3 p-2.5 rounded-xl bg-red-950/60 border border-red-500/50 text-xs text-red-300 flex items-center justify-between">
          <span>⚠️ {alarmTestError}</span>
        </div>
      )}

      {/* Safety Notice & Fast Diagnostic Test Strip */}
      <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#94A3B8] font-mono flex-wrap">
          <Activity className="h-4 w-4 text-emerald-400" />
          <span>Trip Threshold: 1600 Raw ADC • Warning Threshold: 1100 ADC</span>
          {isAlarmTesting && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-500/50 text-amber-300 font-bold text-[11px] animate-pulse">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              TEST ALARM ACTIVE ({alarmTestCountdown}s remaining)
            </span>
          )}
        </div>

        {/* Quick Testing Actions (Development & Demo only) */}
        {!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true' && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => triggerGasLeakAlert(485, 'Kitchen Area', false)}
              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[11px] font-mono flex items-center gap-1 cursor-pointer"
            >
              <Flame className="h-3 w-3" /> Danger Test
            </button>

            <button
              onClick={simulateGasClearance}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-mono flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" /> Gas Cleared
            </button>

            <button
              onClick={simulateSensorFault}
              className="px-2.5 py-1 rounded-lg bg-[#111820] hover:bg-[#1A242E] text-slate-300 border border-white/[0.08] text-[11px] font-mono flex items-center gap-1 cursor-pointer"
            >
              <Unplug className="h-3 w-3" /> ADC &lt; 45 Fault
            </button>
          </div>
        )}
      </div>
    </Card>
  );
};

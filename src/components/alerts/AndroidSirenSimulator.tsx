import React, { useState } from 'react';
import { 
  Smartphone, 
  Flame, 
  Volume2, 
  VolumeX, 
  BellOff, 
  ShieldAlert, 
  ShieldCheck, 
  ZapOff, 
  Clock, 
  MapPin, 
  Radio, 
  CheckCircle2, 
  Wifi, 
  BatteryMedium,
  RotateCcw
} from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { Badge } from '../common/Badge';

export const AndroidSirenSimulator: React.FC = () => {
  const {
    telemetry,
    gasSafetyState,
    isSirenMuted,
    silenceMobileSiren,
    authorizeSafetyReset,
    triggerGasLeakAlert,
    simulateGasClearance,
    settings
  } = useSmartHome();

  const [activeTab, setActiveTab] = useState<'screen' | 'notification'>('screen');
  const [operatorName, setOperatorName] = useState('Chief Safety Engineer');
  const isDemoMode = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';

  const isEmergencyActive = 
    telemetry.gasStatus === 'danger' || 
    gasSafetyState.lockoutStatus === 'CRITICAL' || 
    gasSafetyState.lockoutStatus === 'SILENCED' || 
    gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET' ||
    gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' ||
    gasSafetyState.gasClearedPendingReset;

  const isSilenced = gasSafetyState.lockoutStatus === 'SILENCED' || gasSafetyState.isMobileSirenSilenced;
  const isClearedPendingReset = gasSafetyState.gasClearedPendingReset || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET';
  const isGasHazardPresent = telemetry.gasStatus === 'danger' || Boolean(gasSafetyState.rawAdc && gasSafetyState.rawAdc >= 1200);

  const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              Android Mobile Emergency Siren & Notification App
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                FCM High-Priority Channel
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Interactive Android device emulator showing heads-up alert, looping acoustic siren, and silence controls.
            </p>
          </div>
        </div>

        {/* Simulator View Controls */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('screen')}
            className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'screen' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Red Emergency Screen
          </button>
          <button
            onClick={() => setActiveTab('notification')}
            className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'notification' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Heads-Up Notification Drawer
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Phone Mockup Frame */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="w-full max-w-sm rounded-[42px] border-4 border-slate-700 bg-slate-950 p-3 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
            {/* Phone Speaker & Camera Notch */}
            <div className="h-5 w-full flex items-center justify-between px-6 text-[10px] font-mono text-slate-400 mb-2">
              <span>{currentTime}</span>
              <div className="h-4 w-24 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-slate-700" />
              </div>
              <div className="flex items-center gap-1">
                <Wifi className="h-3 w-3 text-slate-400" />
                <BatteryMedium className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>

            {/* Android Screen Body */}
            {activeTab === 'screen' ? (
              <div className={`rounded-[32px] p-4 text-white min-h-[460px] flex flex-col justify-between transition-all ${
                isEmergencyActive
                  ? isClearedPendingReset
                    ? 'bg-gradient-to-b from-amber-950 via-slate-950 to-amber-950 border border-amber-500/50'
                    : 'bg-gradient-to-b from-rose-950 via-red-950 to-slate-950 border border-rose-500/60 shadow-glow-danger animate-pulse-subtle'
                  : 'bg-slate-900 border border-slate-800'
              }`}>
                {/* Screen Header */}
                <div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-300">
                      SmartHomeX Mobile Life-Safety
                    </span>
                    <Badge 
                      variant={!isEmergencyActive ? 'emerald' : isSilenced ? 'amber' : isClearedPendingReset ? 'amber' : 'rose'} 
                      size="sm"
                    >
                      {!isEmergencyActive ? 'NORMAL' : gasSafetyState.lockoutStatus}
                    </Badge>
                  </div>

                  {isEmergencyActive ? (
                    <div className="mt-4 text-center">
                      <div className="h-16 w-16 mx-auto rounded-3xl bg-rose-600/30 border border-rose-500 flex items-center justify-center text-rose-400 mb-2 animate-bounce">
                        <Flame className="h-9 w-9 text-rose-400" />
                      </div>
                      <h4 className="text-base font-extrabold uppercase tracking-wide drop-shadow-[0_0_10px_rgba(244,63,94,0.9)]">
                        GAS LEAKAGE DETECTED – CRITICAL EMERGENCY!
                      </h4>
                      <p className="text-xs text-rose-200 mt-1 font-semibold">
                        {settings.homeName || 'SmartHomeX Smart Villa'}
                      </p>
                      <span className="text-[10px] font-mono text-slate-300 block mt-0.5">
                        Timestamp: {currentTime}, Today • Kitchen Node #01
                      </span>
                    </div>
                  ) : (
                    <div className="mt-8 text-center text-slate-400">
                      <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-slate-200">System Normal & Armed</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        High-importance Android emergency notification channel is active and listening for ESP32 gas events.
                      </p>
                    </div>
                  )}

                  {/* Actions Taken by ESP32 */}
                  {isEmergencyActive && (
                    <div className="mt-4 p-3 rounded-2xl bg-black/60 border border-rose-500/40 text-[11px] font-mono space-y-1">
                      <div className="text-[10px] text-rose-300 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Actions Executed by ESP32:</span>
                        <span className="text-emerald-400">AUTONOMOUS</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>• Light (GPIO 14):</span>
                        <strong className="text-rose-400">FORCED OFF</strong>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>• Ceiling Fan (GPIO 25):</span>
                        <strong className="text-rose-400">FORCED OFF</strong>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>• Water Motor (GPIO 26):</span>
                        <strong className="text-rose-400">FORCED OFF</strong>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>• Exhaust Fan (GPIO 27):</span>
                        <strong className={gasSafetyState.exhaustFanActive ? 'text-emerald-400' : 'text-amber-400'}>
                          {gasSafetyState.exhaustFanActive ? 'ON (ATEX Certified)' : 'DISABLED (Spark Hazard)'}
                        </strong>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>• Main Contactor:</span>
                        <strong className="text-rose-400">TRIPPED</strong>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>• Hardware Buzzer:</span>
                        <strong className={isSilenced ? 'text-amber-400' : 'text-rose-400'}>
                          {isSilenced ? 'SILENCED' : 'ACTIVE'}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Screen Buttons */}
                <div className="space-y-2 mt-4 pt-3 border-t border-white/10">
                  {isEmergencyActive && !isSilenced && (
                    <button
                      onClick={silenceMobileSiren}
                      className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm shadow-[0_0_25px_rgba(239,68,68,0.7)] flex items-center justify-center gap-2 cursor-pointer animate-pulse"
                    >
                      <BellOff className="h-5 w-5" />
                      <span>SILENCE SIREN</span>
                    </button>
                  )}

                  {isEmergencyActive && isSilenced && (
                    <div className="p-2.5 rounded-xl bg-amber-950/70 border border-amber-500/50 text-center">
                      <span className="text-xs font-bold text-amber-300 block flex items-center justify-center gap-1">
                        <VolumeX className="h-4 w-4" /> Siren Silenced (Emergency Remains ACTIVE)
                      </span>
                      <span className="text-[10px] text-slate-300 block mt-0.5">
                        Relays remain locked out until physical safety inspection and reset.
                      </span>
                    </div>
                  )}

                  {isEmergencyActive && !isGasHazardPresent && (
                    <button
                      onClick={() => authorizeSafetyReset(operatorName)}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow-emerald flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>Authorize Safety Reset</span>
                    </button>
                  )}

                  {!isEmergencyActive && isDemoMode && (
                    <button
                      onClick={() => triggerGasLeakAlert(485, 'Kitchen Area', false)}
                      className="w-full py-2.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Flame className="h-4 w-4 text-rose-400" />
                      <span>Simulate Inbound Gas Emergency</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Heads-Up Android Notification View */
              <div className="rounded-[32px] p-4 bg-slate-900 border border-slate-800 text-white min-h-[460px] flex flex-col justify-start space-y-3">
                <div className="text-[11px] font-mono text-slate-400 pb-2 border-b border-slate-800">
                  Android Notification Drawer (Channel: High Importance)
                </div>

                {isEmergencyActive ? (
                  <div className="p-3.5 rounded-2xl bg-slate-950 border-2 border-rose-500 shadow-2xl space-y-2 animate-bounce-subtle">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                      <div className="flex items-center gap-1.5">
                        <div className="h-4 w-4 rounded bg-rose-600 flex items-center justify-center text-[10px] font-bold text-white">
                          !
                        </div>
                        <span className="font-bold text-slate-200">SmartHomeX AI Emergency</span>
                      </div>
                      <span>Just now</span>
                    </div>

                    <h5 className="font-extrabold text-sm text-rose-400 leading-tight">
                      GAS LEAKAGE DETECTED – CRITICAL EMERGENCY!
                    </h5>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      Dangerous combustible gas concentration in {settings.homeName || 'SmartHomeX Smart Villa'}. Light, Fan, Motor forced OFF. Main Contactor TRIPPED.
                    </p>

                    <div className="pt-2 flex items-center gap-2 border-t border-slate-800">
                      {!isSilenced ? (
                        <button
                          onClick={silenceMobileSiren}
                          className="flex-1 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <BellOff className="h-3.5 w-3.5" />
                          <span>SILENCE SIREN</span>
                        </button>
                      ) : (
                        <span className="flex-1 py-1 rounded-lg bg-slate-800 text-amber-300 text-[10px] font-bold text-center">
                          SIREN SILENCED (ACTIVE)
                        </span>
                      )}

                      <button
                        onClick={() => setActiveTab('screen')}
                        className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs text-center"
                      >
                        Open Emergency UI
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs font-mono">
                    No active high-priority emergency notifications in notification drawer.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Technical Explanation & Android Architecture Breakdown */}
        <div className="lg:col-span-5 space-y-3.5 text-xs text-slate-300">
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan-400" />
              Android Notification Specifications
            </h4>
            <p className="leading-relaxed text-slate-300">
              In production Android OS, standard web push notifications cannot reliably guarantee uninterrupted high-decibel audio loops or vibration when the device screen is locked or the app process is suspended.
            </p>
            <ul className="space-y-1.5 font-mono text-[11px] text-slate-300 pt-1">
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-400 font-bold">1.</span>
                <span><strong>FCM Priority High:</strong> Wakes the phone instantly from Android Doze mode.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-400 font-bold">2.</span>
                <span><strong>NotificationChannel USAGE_ALARM:</strong> Bypasses media mute restrictions.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-400 font-bold">3.</span>
                <span><strong>Foreground Service:</strong> Plays continuous looping siren until user clicks "SILENCE SIREN".</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-400 font-bold">4.</span>
                <span><strong>Silence vs Clear Distinction:</strong> "SILENCE SIREN" stops the audio/vibration only; hardware lockout remains strictly engaged until manual safety reset.</span>
              </li>
            </ul>
          </div>

          {/* Test Scenarios Panel */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <h4 className="font-bold text-white text-sm">
              Live Scenario Validation
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {isDemoMode ? (
                <button
                  onClick={() => triggerGasLeakAlert(485, 'Kitchen Area', false)}
                  className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-[11px] font-mono text-left cursor-pointer"
                >
                  <strong className="block text-white">1. Trigger Gas Leak</strong>
                  Relays OFF, Siren ON
                </button>
              ) : (
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-left">
                  <strong className="block text-slate-300">1. Gas Safety Monitor</strong>
                  {isEmergencyActive ? '🚨 HAZARD DETECTED' : 'Awaiting sensor stream'}
                </div>
              )}

              <button
                onClick={silenceMobileSiren}
                disabled={!isEmergencyActive || isSilenced}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-amber-300 border border-slate-700 text-[11px] font-mono text-left cursor-pointer"
              >
                <strong className="block text-white">2. Silence Siren</strong>
                Stops sound, keeps active
              </button>

              <button
                onClick={simulateGasClearance}
                disabled={!isEmergencyActive}
                className="p-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 disabled:opacity-50 text-amber-300 border border-amber-500/40 text-[11px] font-mono text-left cursor-pointer"
              >
                <strong className="block text-white">3. Gas Cleared</strong>
                Lockout stays active
              </button>

              <button
                onClick={() => authorizeSafetyReset(operatorName)}
                disabled={!isEmergencyActive || isGasHazardPresent}
                className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono text-left cursor-pointer"
              >
                <strong className="block text-white">4. Safety Reset</strong>
                Re-arms contactor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

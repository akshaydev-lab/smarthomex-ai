import React, { useState } from 'react';
import { 
  Lightbulb, 
  Fan, 
  Droplets, 
  Wind, 
  Power, 
  Zap, 
  MapPin, 
  Cpu, 
  Clock,
  Calendar,
  AlertTriangle,
  RotateCw,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  History,
  ShieldX
} from 'lucide-react';
import { Device, DeviceControlMode } from '../../types';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { formatWatts } from '../../lib/utils';
import { useSmartHome } from '../../hooks/useSmartHome';
import { CommandHistoryModal } from './CommandHistoryModal';

export interface DeviceCardProps {
  device: Device;
  onToggle: (id: string) => void;
  onModeChange?: (id: string, mode: DeviceControlMode) => void;
  onResumeAuto?: (id: string) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ 
  device, 
  onToggle,
  onModeChange,
  onResumeAuto
}) => {
  const { 
    setDeviceControlMode, 
    resumeAutoSchedule,
    gasSafetyState,
    setExhaustSafetyCertified
  } = useSmartHome();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const isUnusedChannel = device.type === 'unused' || device.relayChannel === 4;
  const isExhaustFan = device.type === 'exhaust_fan';

  const handleModeToggle = () => {
    if (isUnusedChannel) return;
    const nextMode: DeviceControlMode = device.controlMode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    if (onModeChange) {
      onModeChange(device.id, nextMode);
    } else {
      setDeviceControlMode(device.id, nextMode);
    }
  };

  const handleResumeAuto = () => {
    if (isUnusedChannel) return;
    if (onResumeAuto) {
      onResumeAuto(device.id);
    } else {
      resumeAutoSchedule(device.id);
    }
  };

  const getDeviceIcon = () => {
    if (isUnusedChannel) {
      return <ShieldX className="h-6 w-6 text-[#64748B]" />;
    }
    switch (device.type) {
      case 'light':
        return <Lightbulb className={`h-6 w-6 ${device.state ? 'text-amber-300 drop-shadow-[0_0_12px_rgba(253,224,71,0.8)]' : 'text-[#64748B]'}`} />;
      case 'fan':
        return <Fan className={`h-6 w-6 ${device.state ? 'text-emerald-300 animate-spin drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]' : 'text-[#64748B]'}`} style={{ animationDuration: '2s' }} />;
      case 'motor':
        return <Droplets className={`h-6 w-6 ${device.state ? 'text-blue-400 animate-pulse drop-shadow-[0_0_12px_rgba(96,165,250,0.8)]' : 'text-[#64748B]'}`} />;
      case 'exhaust_fan':
        return <Wind className={`h-6 w-6 ${device.state ? 'text-teal-300 animate-spin drop-shadow-[0_0_12px_rgba(45,212,191,0.8)]' : 'text-[#64748B]'}`} style={{ animationDuration: '1.2s' }} />;
      default:
        return <Power className="h-6 w-6 text-[#64748B]" />;
    }
  };

  const getDeviceAccentGradient = () => {
    if (isUnusedChannel) return 'bg-[#111820] border-white/[0.06] opacity-75';
    if (!device.state) return 'bg-[#141C23] border-white/[0.08] hover:border-emerald-500/35';
    switch (device.type) {
      case 'light':
        return 'bg-gradient-to-br from-amber-950/25 via-[#141C23] to-[#111820] border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]';
      case 'fan':
        return 'bg-gradient-to-br from-emerald-950/25 via-[#141C23] to-[#111820] border-emerald-500/40 shadow-glow-emerald';
      case 'motor':
        return 'bg-gradient-to-br from-blue-950/25 via-[#141C23] to-[#111820] border-blue-500/40 shadow-glow-blue';
      case 'exhaust_fan':
        return 'bg-gradient-to-br from-teal-950/25 via-[#141C23] to-[#111820] border-teal-500/40 shadow-[0_0_20px_rgba(20,184,166,0.15)]';
    }
  };

  // Motor continuous runtime calculations
  const activeRuntimeSec = device.activeRuntimeSeconds || 0;
  const maxRuntimeSec = (device.maxRuntimeMinutes || 30) * 60;
  const runtimePercent = Math.min(100, Math.round((activeRuntimeSec / maxRuntimeSec) * 100));
  const runtimeMinutes = Math.floor(activeRuntimeSec / 60);
  const runtimeSeconds = activeRuntimeSec % 60;

  return (
    <>
      <Card className={`${getDeviceAccentGradient()} transition-all duration-300 relative flex flex-col justify-between p-5`}>
        <div>
          {/* Top Header: Channel, Icon, Mode Toggle & Switch */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border transition-all ${
                isUnusedChannel
                  ? 'bg-[#0B0F12] border-white/[0.06]'
                  : device.state 
                  ? 'bg-[#111820] border-emerald-500/40' 
                  : 'bg-[#111820] border-white/[0.08]'
              }`}>
                {getDeviceIcon()}
              </div>
              <div>
                <h3 className="font-semibold text-[#F8FAFC] text-base flex items-center gap-2">
                  {device.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-[#94A3B8] mt-0.5">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-emerald-400" />
                    {device.room}
                  </span>
                  {isExhaustFan && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-teal-950/60 text-teal-300 border border-teal-500/30">
                      Single-Ch Relay (GPIO 27)
                    </span>
                  )}
                  {isUnusedChannel && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#111820] text-[#64748B] border border-white/[0.06]">
                      Unused Ch 4
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Toggle Switch or Disabled Pill */}
            {isUnusedChannel ? (
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-[#111820] text-[#64748B] border border-white/[0.08]">
                LOCKED / UNUSED
              </span>
            ) : isExhaustFan ? (
              <div className="flex flex-col items-end">
                <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border transition-all ${
                  device.state
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 animate-pulse'
                    : 'bg-[#111820] text-[#64748B] border-white/[0.08]'
                }`}>
                  {device.state ? 'VENTILATING (AUTO)' : 'STANDBY (AUTO)'}
                </span>
                <span className="text-[9px] font-mono text-teal-400/90 mt-0.5 font-semibold">
                  Automatic Control Only
                </span>
              </div>
            ) : (
              <button
                onClick={() => onToggle(device.id)}
                disabled={device.pendingCommand}
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-60 disabled:cursor-wait ${
                  device.state
                    ? 'bg-emerald-500 border-emerald-400 shadow-glow-emerald'
                    : 'bg-[#111820] border-white/[0.12]'
                }`}
                role="switch"
                aria-checked={device.state}
                aria-label={`Toggle ${device.name}`}
              >
                {device.pendingCommand ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </span>
                ) : (
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-[#0B0F12] shadow-lg ring-0 transition duration-200 ease-in-out ${
                      device.state ? 'translate-x-6.5 bg-[#0B0F12]' : 'translate-x-1 bg-[#64748B]'
                    }`}
                  />
                )}
              </button>
            )}
          </div>

          {/* Operating Mode Selector, Hardware Status & History Button */}
          <div className="mt-3.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {!isUnusedChannel && !isExhaustFan && (
                <button
                  onClick={handleModeToggle}
                  title="Click to switch between Manual Control and Scheduled Auto Automation"
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition-all cursor-pointer ${
                    device.controlMode === 'MANUAL'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 hover:bg-emerald-500/25'
                      : 'bg-blue-500/15 text-blue-300 border-blue-500/35 hover:bg-blue-500/25'
                  }`}
                >
                  <Sliders className="h-3 w-3" />
                  MODE: {device.controlMode}
                </button>
              )}
              {isExhaustFan && (
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold flex items-center gap-1 bg-teal-500/20 text-teal-300 border border-teal-500/40">
                  <Sliders className="h-3 w-3" />
                  AUTO-ONLY
                </span>
              )}

              {device.isHardwareConnected ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  <ShieldCheck className="h-3 w-3" /> ESP32 Real
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-[#94A3B8] bg-[#111820] px-2 py-0.5 rounded-md border border-white/[0.08]">
                  Hardware Offline
                </span>
              )}

              <button
                onClick={() => setIsHistoryOpen(true)}
                title="View recent command logs and hardware ACKs"
                className="px-2 py-0.5 rounded-md bg-[#111820] hover:bg-[#1A242E] text-[#94A3B8] hover:text-[#F8FAFC] text-[10px] font-mono flex items-center gap-1 border border-white/[0.08] cursor-pointer"
              >
                <History className="h-3 w-3 text-emerald-400" /> History
              </button>
            </div>

            <Badge
              variant={
                isUnusedChannel 
                  ? 'slate' 
                  : device.pendingCommand 
                  ? 'amber' 
                  : device.state 
                  ? 'emerald' 
                  : 'slate'
              }
              size="sm"
              pulse={device.pendingCommand || device.state}
            >
              {isUnusedChannel
                ? 'RESERVED'
                : device.pendingCommand
                ? 'PENDING ACK'
                : device.state
                ? 'CONFIRMED ON'
                : 'CONFIRMED OFF'}
            </Badge>
          </div>

          {/* Special Exhaust Fan Hazardous Atmosphere Safety Warning */}
          {isExhaustFan && (
            <div className={`mt-2.5 p-2.5 rounded-xl border text-[11px] leading-relaxed transition-all ${
              gasSafetyState.exhaustSafetyCertified
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Hazardous Atmosphere Exhaust Interlock:
                </span>
                <button
                  onClick={() => setExhaustSafetyCertified(!gasSafetyState.exhaustSafetyCertified)}
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border transition-colors cursor-pointer ${
                    gasSafetyState.exhaustSafetyCertified
                      ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400'
                      : 'bg-amber-500/30 text-amber-200 border-amber-400'
                  }`}
                >
                  {gasSafetyState.exhaustSafetyCertified ? 'CERTIFIED' : 'UNCERTIFIED (SAFE)'}
                </button>
              </div>
              <p className="text-[10px] text-[#94A3B8]">
                {gasSafetyState.exhaustSafetyCertified
                  ? 'ATEX/IECEx explosion-proof certified. Automatic gas emergency ventilation permitted.'
                  : 'Uncertified fan: Auto-activation strictly disabled during gas emergency to prevent relay/brush electrical spark ignition.'}
              </p>
            </div>
          )}

          {/* Unused Channel 4 Hardware Notice */}
          {isUnusedChannel && (
            <div className="mt-2.5 p-2 rounded-xl bg-[#111820] border border-white/[0.08] text-[11px] text-[#94A3B8]">
              Channel 4 of the 4-channel Active-LOW relay module is permanently reserved as unused per hardware specification.
            </div>
          )}

          {/* Manual Override Active Notice Banner */}
          {device.manualOverrideActive && !isUnusedChannel && (
            <div className="mt-2.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2 text-[11px] animate-fadeIn">
              <span className="text-amber-300 flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Manual Override Active
              </span>
              <button
                onClick={handleResumeAuto}
                className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/30 text-amber-200 hover:bg-amber-500/50 transition-colors font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className="h-3 w-3" /> Resume Auto
              </button>
            </div>
          )}

          {/* Next Scheduled Action Display */}
          {!isUnusedChannel && (
            <div className="mt-2.5 px-2.5 py-1.5 rounded-xl bg-[#111820] border border-white/[0.08] text-[11px] flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <div className="truncate flex-1">
                {device.nextScheduledAction ? (
                  <span className="text-slate-300">
                    Next: <strong className={device.nextScheduledAction.action === 'ON' ? 'text-emerald-400' : 'text-rose-400'}>Turn {device.nextScheduledAction.action}</strong> at {device.nextScheduledAction.timeIST}
                    <span className="text-[#64748B] text-[10px] block truncate">({device.nextScheduledAction.scheduleName})</span>
                  </span>
                ) : (
                  <span className="text-[#64748B]">
                    No Timer Configured • Ready for Immediate Manual Switch
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Real Command State Banners */}
          {device.pendingCommand && (
            <div className="mt-2.5 p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-[11px] text-amber-300 flex items-center gap-1.5 animate-pulse">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
              <span>Pending: Dispatched to ESP32 node. Awaiting hardware ACK...</span>
            </div>
          )}
          {device.lastCommandStatus === 'gas_inhibited' && (
            <div className="mt-2.5 p-2 rounded-xl bg-red-500/20 border border-red-500/40 text-[11px] text-red-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
              <span>Gas Safety Rejected: Relays inhibited during combustible gas alert (spark ignition prevention).</span>
            </div>
          )}
          {device.lastCommandStatus === 'timeout' && (
            <div className="mt-2.5 p-2 rounded-xl bg-orange-950/40 border border-orange-500/40 text-[11px] text-orange-300 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-orange-400" />
              <span>Device Offline / Timeout: ESP32 node did not acknowledge within 8.5 seconds.</span>
            </div>
          )}
          {device.lastCommandStatus === 'failed' && (
            <div className="mt-2.5 p-2 rounded-xl bg-red-950/40 border border-red-500/30 text-[11px] text-red-300 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
              <span className="truncate">{device.lastCommandError || 'Command failed to execute on ESP32 node.'}</span>
            </div>
          )}

          {/* Water Motor 30-Minute Continuous Run Protection Bar */}
          {device.type === 'motor' && (
            <div className="mt-3 p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/20 text-xs">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-blue-300 font-medium flex items-center gap-1">
                  <Droplets className="h-3 w-3 text-blue-400" /> Dry-Run & Max 30m Cutoff
                </span>
                <span className="font-mono text-slate-300">
                  {device.state ? `${runtimeMinutes}m ${runtimeSeconds}s / 30m` : '0m / 30m max'}
                </span>
              </div>
              <div className="w-full bg-[#111820] rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    runtimePercent > 80 ? 'bg-red-500' : runtimePercent > 50 ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                  style={{ width: `${device.state ? runtimePercent : 0}%` }}
                />
              </div>
              {device.state && runtimePercent > 80 && (
                <span className="text-[10px] text-red-400 block mt-1 font-semibold">
                  Approaching 30-minute safety cutoff threshold!
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer Metrics Row: Relay Pin & Power */}
        <div className="mt-4 pt-3 border-t border-white/[0.08]">
          <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-2">
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <Cpu className="h-3 w-3 text-emerald-400" />
              {isUnusedChannel ? '4-Ch Board Ch 4 (Reserved)' : isExhaustFan ? 'Single-Ch Relay • GPIO 27' : `Ch ${device.relayChannel} • GPIO ${device.gpioPin}`}
            </span>
            <span className="font-mono text-[11px] text-[#F8FAFC]">
              {isUnusedChannel ? '0W' : `Rated ${device.ratedWatts}W`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-[#111820] border border-white/[0.08]">
            <div>
              <span className="text-[10px] text-[#64748B] block flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-400" /> Power Draw
              </span>
              <span className="text-xs font-mono font-bold text-[#F8FAFC]">
                {formatWatts(device.state ? device.ratedWatts : 0)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#64748B] block flex items-center gap-1">
                <Clock className="h-3 w-3 text-emerald-400" /> Actuated
              </span>
              <span className="text-[11px] font-mono text-[#94A3B8] truncate block">
                {device.lastToggled}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Command History Modal */}
      <CommandHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        deviceName={device.name}
        channel={device.relayChannel}
        gpio={device.gpioPin}
        history={device.commandHistory}
      />
    </>
  );
};

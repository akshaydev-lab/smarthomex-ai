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

  const isUnusedChannel = device.type === 'unused';
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
      return <ShieldX className="h-6 w-6 text-slate-500" />;
    }
    switch (device.type) {
      case 'light':
        return <Lightbulb className={`h-6 w-6 ${device.state ? 'text-amber-300 drop-shadow-[0_0_12px_rgba(253,224,71,0.8)]' : 'text-slate-400'}`} />;
      case 'fan':
        return <Fan className={`h-6 w-6 ${device.state ? 'text-cyan-300 animate-spin drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]' : 'text-slate-400'}`} style={{ animationDuration: '2s' }} />;
      case 'motor':
        return <Droplets className={`h-6 w-6 ${device.state ? 'text-blue-400 animate-pulse drop-shadow-[0_0_12px_rgba(96,165,250,0.8)]' : 'text-slate-400'}`} />;
      case 'exhaust_fan':
        return <Wind className={`h-6 w-6 ${device.state ? 'text-teal-300 animate-spin drop-shadow-[0_0_12px_rgba(45,212,191,0.8)]' : 'text-slate-400'}`} style={{ animationDuration: '1.2s' }} />;
      default:
        return <Power className="h-6 w-6 text-slate-400" />;
    }
  };

  const getDeviceAccentGradient = () => {
    if (isUnusedChannel) return 'from-slate-950 to-slate-900 border-slate-800/50 opacity-80';
    if (!device.state) return 'from-slate-900/60 to-slate-950/80 border-slate-800/80';
    switch (device.type) {
      case 'light':
        return 'from-amber-950/30 via-slate-900/80 to-slate-950 border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.15)]';
      case 'fan':
        return 'from-cyan-950/30 via-slate-900/80 to-slate-950 border-cyan-500/40 shadow-glow-cyan';
      case 'motor':
        return 'from-blue-950/30 via-slate-900/80 to-slate-950 border-blue-500/40 shadow-glow-blue';
      case 'exhaust_fan':
        return 'from-teal-950/30 via-slate-900/80 to-slate-950 border-teal-500/40 shadow-glow-teal';
    }
  };

  const isGasSafetyInhibited = (gasSafetyState.lockoutStatus === 'CRITICAL' || gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT' || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET') && !isExhaustFan;
  const isExhaustBlocked = isExhaustFan && !gasSafetyState.exhaustSafetyCertified && (gasSafetyState.lockoutStatus === 'CRITICAL' || gasSafetyState.lockoutStatus === 'EMERGENCY_LOCKOUT');

  // Motor 30-minute runtime calculation
  const runtimeSeconds = (device.activeRuntimeSeconds || 0) % 60;
  const runtimeMinutes = Math.floor((device.activeRuntimeSeconds || 0) / 60);
  const runtimePercent = Math.min(100, Math.round(((device.activeRuntimeSeconds || 0) / (30 * 60)) * 100));

  return (
    <>
      <Card className={`bg-gradient-to-br ${getDeviceAccentGradient()} transition-all duration-300 relative flex flex-col justify-between`}>
        <div>
          {/* Top Header: Channel, Icon, Mode Toggle & Switch */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border transition-all ${
                isUnusedChannel
                  ? 'bg-slate-950 border-slate-800'
                  : device.state
                  ? 'bg-slate-900/90 border-slate-700 shadow-md'
                  : 'bg-slate-950/80 border-slate-800'
              }`}>
                {getDeviceIcon()}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-100 text-sm sm:text-base leading-snug">
                    {device.name}
                  </h3>
                  {isUnusedChannel ? (
                    <Badge variant="slate" size="sm">Channel 4 (Reserved)</Badge>
                  ) : (
                    <Badge variant="cyan" size="sm">Relay {device.relayChannel}</Badge>
                  )}
                  {device.state && !isUnusedChannel && (
                    <Badge variant="emerald" size="sm" pulse>Active</Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-slate-500" />
                    {device.room}
                  </span>
                  <span>•</span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    GPIO {device.gpioPin}
                  </span>
                </div>
              </div>
            </div>

            {/* Actuation Power Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onToggle(device.id)}
                disabled={isUnusedChannel || device.pendingCommand || isExhaustBlocked || isGasSafetyInhibited}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                  device.state
                    ? 'bg-gradient-to-r from-cyan-500 to-teal-400 shadow-glow-cyan'
                    : 'bg-slate-800 border border-slate-700'
                }`}
                aria-label={`Toggle ${device.name}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    device.state ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Device Control Mode Pills (MANUAL vs AUTO) */}
          {!isUnusedChannel && (
            <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-slate-400">Mode:</span>
                <button
                  onClick={handleModeToggle}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold border transition-all cursor-pointer ${
                    device.controlMode === 'MANUAL'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  MANUAL
                </button>
                <button
                  onClick={handleModeToggle}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold border transition-all cursor-pointer ${
                    device.controlMode === 'AUTO'
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  AUTO
                </button>
              </div>

              {/* History Button */}
              <button
                onClick={() => setIsHistoryOpen(true)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                title="View Dispatched Command History"
              >
                <History className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Pending Command Indicator */}
          {device.pendingCommand && (
            <div className="mt-2.5 p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-[11px] text-cyan-300 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-cyan-400" />
              <span>Awaiting ESP32 hardware acknowledgement (GPIO {device.gpioPin})...</span>
            </div>
          )}

          {/* Command Status Notice */}
          {device.lastCommandStatus === 'gas_inhibited' && (
            <div className="mt-2.5 p-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-[11px] text-rose-300 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
              <span>Gas Safety Rejected: Relays inhibited during combustible gas alert (spark ignition prevention).</span>
            </div>
          )}
          {device.lastCommandStatus === 'failed' && (
            <div className="mt-2.5 p-2 rounded-xl bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span className="truncate">{device.lastCommandError || 'Command failed to execute on ESP32 node.'}</span>
            </div>
          )}

          {/* Water Motor 30-Minute Protection Meter */}
          {device.type === 'motor' && (
            <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 mb-1.5">
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="h-3 w-3 text-blue-400" /> Continuous Run-Time Guard
                </span>
                <span className={runtimePercent > 80 ? 'text-rose-400 font-bold' : 'text-blue-300'}>
                  {device.state ? `${runtimeMinutes}m ${runtimeSeconds}s / 30m` : '0m / 30m max'}
                </span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    runtimePercent > 80 ? 'bg-rose-500' : runtimePercent > 50 ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                  style={{ width: `${device.state ? runtimePercent : 0}%` }}
                />
              </div>
              {device.state && runtimePercent > 80 && (
                <span className="text-[10px] text-rose-400 block mt-1 font-semibold">
                  Approaching 30-minute safety cutoff threshold!
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer Metrics Row: Relay Pin & Power */}
        <div className="mt-4 pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <Cpu className="h-3 w-3 text-cyan-400" />
              Ch {device.relayChannel} • GPIO {device.gpioPin}
            </span>
            <span className="font-mono text-[11px] text-slate-300">
              Rated {device.ratedWatts}W
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <div>
              <span className="text-[10px] text-slate-400 block flex items-center gap-1">
                <Zap className="h-3 w-3 text-amber-400" /> Power Draw
              </span>
              <span className="text-xs font-mono font-bold text-slate-100">
                {formatWatts(device.state ? device.ratedWatts : 0)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block flex items-center gap-1">
                <Clock className="h-3 w-3 text-cyan-400" /> Actuated
              </span>
              <span className="text-[11px] font-mono text-slate-300 truncate block">
                {device.lastToggled}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* History Modal */}
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

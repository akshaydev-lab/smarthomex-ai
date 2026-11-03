import React, { useState } from 'react';
import { CheckSquare, XSquare, Zap, ShieldAlert, Cpu } from 'lucide-react';
import { useSmartHome } from '../../hooks/useSmartHome';
import { formatWatts } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';

export const MasterControl: React.FC = () => {
  const { devices, setAllDevices, activeDeviceCount, telemetry, hardwareBridge } = useSmartHome();
  const [confirmModal, setConfirmModal] = useState<boolean>(false);

  const totalPossibleWatts = devices.reduce((sum, d) => sum + d.ratedWatts, 0);

  const handleAllOn = () => {
    setAllDevices(true);
    setConfirmModal(false);
  };

  const handleAllOff = () => {
    setAllDevices(false);
  };

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-cyan-500/20 mb-6 bg-gradient-to-r from-slate-900/90 via-slate-950 to-slate-900/90 shadow-glass">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Master Overview */}
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-100">
                4-Channel ESP32 Relay Master Controller
              </h2>
              <Badge
                variant={hardwareBridge.esp32Connected ? 'emerald' : (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true') ? 'demo' : 'slate'}
                size="sm"
              >
                {hardwareBridge.esp32Connected ? 'ESP32 Connected' : (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true') ? 'Demo Emulation' : 'ESP32 Offline'}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              4-Channel Active-LOW Relay: Ch 1 Light (GPIO 14), Ch 2 Fan (GPIO 25), Ch 3 Motor (GPIO 26). Channel 4 is Permanently Reserved / Unused.
            </p>
          </div>
        </div>

        {/* Center: Live Load Counter */}
        <div className="flex items-center gap-4 bg-slate-950/70 py-2 px-4 rounded-xl border border-slate-800">
          <div>
            <span className="text-[11px] font-mono text-slate-400 block">Active Relays</span>
            <span className="text-sm font-bold font-mono text-cyan-300">
              {activeDeviceCount} of {devices.length} ON
            </span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <span className="text-[11px] font-mono text-slate-400 block flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-400" /> Aggregate Load
            </span>
            <span className="text-sm font-bold font-mono text-slate-100">
              {telemetry.power != null ? `${formatWatts(telemetry.power)} / ${formatWatts(totalPossibleWatts)}` : `-- W / ${formatWatts(totalPossibleWatts)}`}
            </span>
          </div>
        </div>

        {/* Right: Master Buttons */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<CheckSquare className="h-4 w-4" />}
            onClick={() => setConfirmModal(true)}
          >
            All Devices ON
          </Button>

          <Button
            variant="secondary"
            size="sm"
            leftIcon={<XSquare className="h-4 w-4 text-rose-400" />}
            onClick={handleAllOff}
          >
            All Devices OFF
          </Button>
        </div>
      </div>

      {/* Confirmation Modal for All Devices ON */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-md w-full p-6 border border-amber-500/40 shadow-2xl animate-slide-up">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-slate-100">Activate All Relays?</h3>
            </div>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Activating all 3 active user relays engages: 45W Light (GPIO 14), 75W Fan (GPIO 25), and 750W Water Booster Pump (GPIO 26) (~870W total). Channel 4 remains permanently reserved/unused, and the separate Exhaust Fan (GPIO 27) operates under Automatic Control only.
            </p>
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 mb-5 text-[11px] text-slate-400">
              <strong>Hardware Action:</strong> Sequenced activation of active channels: Ch 1 (GPIO 14), Ch 2 (GPIO 25), Ch 3 (GPIO 26). Channel 4 is permanently reserved.
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => setConfirmModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleAllOn}>
                Confirm All ON
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

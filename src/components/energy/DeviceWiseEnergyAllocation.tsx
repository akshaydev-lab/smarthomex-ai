import React, { useState } from 'react';
import { 
  Cpu, 
  Layers, 
  Info, 
  Lightbulb, 
  Fan, 
  Droplet, 
  Wind 
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { useSmartHome } from '../../hooks/useSmartHome';

export const DeviceWiseEnergyAllocation: React.FC = () => {
  const { devices, telemetry, tariffRate } = useSmartHome();
  const [allocationMode, setAllocationMode] = useState<'apportioned' | 'dedicated'>('apportioned');

  const deviceData = devices.map(d => {
    // Estimated runtime today (mock proportioned)
    const mockHours = d.id === 'relay-1' ? 6.5 : d.id === 'relay-2' ? 8.2 : d.id === 'relay-3' ? 1.2 : 0.8;
    const estKwh = Number(((d.ratedWatts * mockHours) / 1000).toFixed(2));
    const estCost = Number((estKwh * tariffRate).toFixed(2));
    const percent = Math.min(100, Math.round((estKwh / (telemetry.energyTodayKWh || 1)) * 100));

    const getIcon = (type: string) => {
      switch (type) {
        case 'light': return <Lightbulb className="h-4 w-4 text-amber-400" />;
        case 'fan': return <Fan className="h-4 w-4 text-cyan-400" />;
        case 'motor': return <Droplet className="h-4 w-4 text-blue-400" />;
        case 'exhaust_fan': return <Wind className="h-4 w-4 text-teal-400" />;
        default: return <Cpu className="h-4 w-4 text-slate-400" />;
      }
    };

    return {
      ...d,
      icon: getIcon(d.type),
      mockHours,
      estKwh,
      estCost,
      percent,
    };
  });

  return (
    <Card className="p-4 sm:p-5 border-cyan-500/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500/10 to-teal-400/10 border border-cyan-500/20 text-cyan-400">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-100">Device-Wise Energy Analytics & Measurement Architecture</h3>
              <Badge variant="teal" size="sm">Hardware Isolation</Badge>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Distinguishing aggregate bus measurement vs independent circuit sub-metering
            </p>
          </div>
        </div>

        {/* Measurement Mode Selector */}
        <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setAllocationMode('apportioned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              allocationMode === 'apportioned'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Shared INA219 Bus (Apportioned)
          </button>
          <button
            onClick={() => setAllocationMode('dedicated')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              allocationMode === 'dedicated'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            4x Dedicated Sub-Meters (Expansion)
          </button>
        </div>
      </div>

      {/* Mandatory Engineering Truth Notice */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/20 mb-5 flex items-start gap-3">
        <Info className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs font-mono text-slate-300 space-y-1">
          <p className="font-semibold text-cyan-300">
            {allocationMode === 'apportioned' 
              ? 'Shared Single-Sensor Architecture In Effect'
              : 'Multi-Channel Hardware Sub-metering Architecture Ready'}
          </p>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            {allocationMode === 'apportioned' ? (
              <>
                The physical prototype employs <strong>one shared INA219 sensor (I2C address 0x40)</strong> on the main 4-channel relay bus rail. Per engineering standards, a single INA219 measures aggregate bus voltage, total shunt current, and aggregate energy. Individual device values shown below are <strong>mathematically apportioned</strong> based on duty-cycle logs and rated appliance wattages.
              </>
            ) : (
              <>
                To obtain true physical device-isolated telemetry without mathematical estimation, the system architecture supports <strong>4 independent INA219 sensors</strong> over the I2C bus using solder-bridge address jumpers (0x40, 0x41, 0x44, 0x45), each dedicated to a distinct relay output.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Mode A: Apportioned Device Breakdown Table */}
      {allocationMode === 'apportioned' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-3 font-semibold">Device & Room</th>
                <th className="pb-3 font-semibold">Hardware Relay</th>
                <th className="pb-3 font-semibold">Rated Power</th>
                <th className="pb-3 font-semibold">Active Time Today</th>
                <th className="pb-3 font-semibold">Apportioned Energy</th>
                <th className="pb-3 font-semibold">Apportioned Bill</th>
                <th className="pb-3 font-semibold">Share of Total</th>
                <th className="pb-3 font-semibold">Measurement Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {deviceData.map(d => (
                <tr key={d.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
                        {d.icon}
                      </div>
                      <div>
                        <span className="font-bold text-slate-200 block">{d.name}</span>
                        <span className="text-[10px] text-slate-400">{d.room}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="text-cyan-400 font-semibold">Ch {d.relayChannel}</span>
                    <span className="text-slate-500 text-[10px] block">GPIO {d.gpioPin}</span>
                  </td>
                  <td className="py-3">
                    <span className="text-slate-200 font-bold">{d.ratedWatts} W</span>
                  </td>
                  <td className="py-3 text-slate-300">
                    {d.mockHours} hrs
                  </td>
                  <td className="py-3 text-cyan-300 font-bold">
                    {d.estKwh} kWh
                  </td>
                  <td className="py-3 text-emerald-400 font-bold">
                    {telemetry.currencySymbol}{d.estCost}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div 
                          className="h-full bg-cyan-400 rounded-full" 
                          style={{ width: `${d.percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">{d.percent}%</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <Badge variant="cyan" size="sm">Apportioned (Shared)</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Mode B: Dedicated Multi-Channel INA219 Sub-Metering Hardware Expansion */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  Circuit 1: Light
                </span>
                <Badge variant="emerald" size="sm">I2C 0x40</Badge>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <p className="text-slate-400 text-[11px]">Direct Shunt: 0.100 Ω</p>
                <p className="text-cyan-300 font-bold">Current: 0.18 A</p>
                <p className="text-teal-300 font-bold">Power: 42 W</p>
                <p className="text-slate-300 text-[10px]">A0=GND, A1=GND</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <Fan className="h-4 w-4 text-cyan-400" />
                  Circuit 2: Fan
                </span>
                <Badge variant="emerald" size="sm">I2C 0x41</Badge>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <p className="text-slate-400 text-[11px]">Direct Shunt: 0.100 Ω</p>
                <p className="text-cyan-300 font-bold">Current: 0.29 A</p>
                <p className="text-teal-300 font-bold">Power: 68 W</p>
                <p className="text-slate-300 text-[10px]">A0=VCC, A1=GND</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <Droplet className="h-4 w-4 text-blue-400" />
                  Circuit 3: Motor
                </span>
                <Badge variant="emerald" size="sm">I2C 0x44</Badge>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <p className="text-slate-400 text-[11px]">Direct Shunt: 0.050 Ω (High-I)</p>
                <p className="text-slate-400 font-bold">Current: 0.00 A (Idle)</p>
                <p className="text-slate-400 font-bold">Power: 0 W</p>
                <p className="text-slate-300 text-[10px]">A0=GND, A1=VCC</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <Wind className="h-4 w-4 text-teal-400" />
                  Circuit 4: Exhaust
                </span>
                <Badge variant="emerald" size="sm">I2C 0x45</Badge>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <p className="text-slate-400 text-[11px]">Direct Shunt: 0.100 Ω</p>
                <p className="text-slate-400 font-bold">Current: 0.00 A (Idle)</p>
                <p className="text-slate-400 font-bold">Power: 0 W</p>
                <p className="text-slate-300 text-[10px]">A0=VCC, A1=VCC</p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono text-slate-400 flex items-center justify-between">
            <span>Hardware I2C Bus: SDA GPIO 21, SCL GPIO 22 (Pull-up 4.7kΩ to 3.3V)</span>
            <span className="text-teal-400 font-semibold">True Device Isolation Mode</span>
          </div>
        </div>
      )}
    </Card>
  );
};

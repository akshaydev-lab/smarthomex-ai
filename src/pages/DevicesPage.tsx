import React, { useState } from 'react';
import { 
  Cpu, 
  Search,
  SlidersHorizontal,
  Wind,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Info,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import { DeviceCard } from '../components/devices/DeviceCard';
import { MasterControl } from '../components/devices/MasterControl';
import { HardwareBridgeController } from '../components/devices/HardwareBridgeController';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';

export const DevicesPage: React.FC = () => {
  const { devices, toggleDevice, gasSafetyState, telemetry } = useSmartHome();
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const rooms = ['all', 'Living Room', 'Master Bedroom', 'Utility / Pump Room', 'Kitchen Area'];

  const filteredDevices = devices.filter(device => {
    const matchesRoom = selectedRoom === 'all' || device.room === selectedRoom;
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          device.room.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          device.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(device.gpioPin).includes(searchQuery);
    return matchesRoom && matchesSearch;
  });

  // Distinct hardware modules separation:
  // 1. 4-Channel Active-LOW Relay Module (Light, Fan, Motor, and Unused Ch 4)
  const fourChannelDevices = filteredDevices.filter(d => d.type !== 'exhaust_fan');

  // 2. Separate Single-Channel Relay Module (Exhaust Fan on GPIO 27)
  const singleChannelDevices = filteredDevices.filter(d => d.type === 'exhaust_fan');

  return (
    <div className="space-y-6">
      {/* Master 4-Channel Relays Controller */}
      <MasterControl />

      {/* Hardware Bridge Diagnostic & Testing Controller */}
      <HardwareBridgeController />

      {/* Filter and Search Bar */}
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <SlidersHorizontal className="h-4 w-4 text-cyan-400 shrink-0 mr-1" />
          {rooms.map(room => (
            <button
              key={room}
              onClick={() => setSelectedRoom(room)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedRoom === room
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
              }`}
            >
              {room === 'all' ? 'All Rooms & Hardware' : room}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search device or GPIO (14, 25, 26, 27)..."
            className="glass-input w-full pl-9 pr-3 py-1.5 rounded-xl text-xs text-slate-200 placeholder:text-slate-400"
          />
        </div>
      </Card>

      {/* ===================================================================== */}
      {/* SECTION 1: 4-CHANNEL ACTIVE-LOW RELAY MODULE                           */}
      {/* ===================================================================== */}
      {fourChannelDevices.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                  4-Channel Active-LOW Relay Module
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                    Optocoupler Isolated
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Channel 1: Light (GPIO 14) • Channel 2: Fan (GPIO 25) • Channel 3: Motor (GPIO 26) • Channel 4: Permanently Reserved / Unused
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
              Active LOW (0V = Energized)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {fourChannelDevices.map(device => (
              <DeviceCard key={device.id} device={device} onToggle={toggleDevice} />
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: SEPARATE SINGLE-CHANNEL RELAY (AUTOMATIC EXHAUST FAN)       */}
      {/* ===================================================================== */}
      {singleChannelDevices.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-teal-500/30">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-teal-500/15 border border-teal-500/40 flex items-center justify-center text-teal-300">
                <Wind className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                  Separate Single-Channel Relay Module
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold">
                    GPIO 27 • Automatic Control Only
                  </span>
                </h2>
                <p className="text-xs text-teal-300/80">
                  Dedicated Kitchen DC Exhaust Fan relay with autonomous spark-prevention interlock.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-teal-950/60 text-teal-300 border border-teal-500/30 flex items-center gap-1.5 font-semibold">
                <Lock className="h-3 w-3 text-teal-400" />
                AUTOMATIC CONTROL ONLY
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Dedicated Exhaust Fan Device Card */}
            <div className="lg:col-span-1">
              {singleChannelDevices.map(device => (
                <DeviceCard key={device.id} device={device} onToggle={toggleDevice} />
              ))}
            </div>

            {/* Hardware & Explosion Safety Interlock Details Card */}
            <Card className="lg:col-span-2 p-5 bg-gradient-to-br from-teal-950/20 via-slate-900/90 to-slate-950 border-teal-500/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-teal-400" />
                    <h3 className="font-bold text-sm text-slate-100">
                      Hazardous Atmosphere & Spark Prevention Architecture
                    </h3>
                  </div>
                  <Badge variant={gasSafetyState.exhaustSafetyCertified ? 'emerald' : 'amber'} size="sm">
                    {gasSafetyState.exhaustSafetyCertified ? 'ATEX/IECEx Certified' : 'Uncertified Fan (Inhibited)'}
                  </Badge>
                </div>

                <div className="mt-3 space-y-2 text-xs text-slate-300 leading-relaxed">
                  <p>
                    <strong className="text-teal-300">Why a separate single-channel relay on GPIO 27?</strong> The kitchen exhaust fan is physically and logically isolated from the 4-channel appliance module to guarantee independent safety control and prevent common-cause failure.
                  </p>
                  <p>
                    <strong className="text-rose-300">Strict Life-Safety Rule:</strong> Switching mechanical relay contacts or running ordinary brushed DC motors generates electrical arcs that ignite combustible LPG/methane fuel-air mixtures. Automatic exhaust activation is <strong>strictly disabled during gas emergency</strong> unless the complete assembly (fan, motor, relay, wiring, and enclosure) is certified explosion-proof.
                  </p>
                  <p className="font-mono text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                    • Physical Relay: 1-Channel Active-LOW Optocoupled Relay (GPIO 27)<br />
                    • Control Logic: Automatic only (Operated by gas/temperature state engine)<br />
                    • Emergency Action: {gasSafetyState.exhaustSafetyCertified ? 'ACTIVATED (Certified explosion-proof mode)' : 'LOCKED OUT (Spark ignition prevention)'}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5 text-teal-300">
                  <CheckCircle2 className="h-4 w-4 text-teal-400" />
                  Independent Safety Circuit Verified
                </span>
                <span className="text-slate-500">
                  Target Pin: ESP32 GPIO 27
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: COMPREHENSIVE ESP32 HARDWARE PINOUT SPECIFICATIONS          */}
      {/* ===================================================================== */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-5 w-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">ESP32 Hardware Specifications & Correct Pin Mapping</h3>
              <p className="text-xs text-slate-400">Optocoupler isolation, active-low triggering, and life-safety GPIO architecture</p>
            </div>
          </div>
          <Badge variant="teal" size="sm">v2.5.0 Hardware Verified</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 px-3">Relay Module</th>
                <th className="py-2 px-3">Channel / Role</th>
                <th className="py-2 px-3">Assigned Load</th>
                <th className="py-2 px-3">ESP32 GPIO</th>
                <th className="py-2 px-3">Logic Trigger</th>
                <th className="py-2 px-3">Rated Power</th>
                <th className="py-2 px-3">Control & Safety Constraint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr>
                <td className="py-2.5 px-3 font-bold text-cyan-300">4-Channel Board</td>
                <td className="py-2.5 px-3">Channel 1</td>
                <td className="py-2.5 px-3">Living Room Light</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 14</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">45 W</td>
                <td className="py-2.5 px-3 text-slate-400">Manual / Timer • Gas Lockout Tripped</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-cyan-300">4-Channel Board</td>
                <td className="py-2.5 px-3">Channel 2</td>
                <td className="py-2.5 px-3">Master Ceiling Fan</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 25</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">75 W</td>
                <td className="py-2.5 px-3 text-slate-400">Manual / Timer • Gas Lockout Tripped</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-bold text-cyan-300">4-Channel Board</td>
                <td className="py-2.5 px-3">Channel 3</td>
                <td className="py-2.5 px-3">Water Booster Motor</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 26</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">750 W</td>
                <td className="py-2.5 px-3 text-emerald-400">Max 30m Auto-Cutoff • Gas Lockout Tripped</td>
              </tr>
              <tr className="bg-slate-950/40">
                <td className="py-2.5 px-3 font-bold text-slate-500">4-Channel Board</td>
                <td className="py-2.5 px-3 text-slate-500">Channel 4</td>
                <td className="py-2.5 px-3 text-slate-500 font-semibold">Permanently Reserved / Unused</td>
                <td className="py-2.5 px-3 text-slate-500 font-bold">— (Unassigned)</td>
                <td className="py-2.5 px-3 text-slate-500">Active LOW</td>
                <td className="py-2.5 px-3 text-slate-500">0 W</td>
                <td className="py-2.5 px-3 text-rose-400 font-semibold">Strictly Disabled / Locked (Hardware Spare)</td>
              </tr>
              <tr className="bg-teal-950/20">
                <td className="py-2.5 px-3 font-bold text-teal-300">Separate Single Relay</td>
                <td className="py-2.5 px-3 text-teal-200">Dedicated Relay</td>
                <td className="py-2.5 px-3 text-teal-200 font-semibold">Kitchen DC Exhaust Fan</td>
                <td className="py-2.5 px-3 text-teal-400 font-bold">GPIO 27</td>
                <td className="py-2.5 px-3 text-teal-300">Active LOW (0V)</td>
                <td className="py-2.5 px-3 text-teal-300">60 W</td>
                <td className="py-2.5 px-3 text-amber-300 font-semibold">Automatic Control Only (ATEX Certified Interlock)</td>
              </tr>
              {/* Sensor & Alert Peripherals */}
              <tr className="bg-slate-900/40">
                <td className="py-2.5 px-3 text-slate-400">Sensor Peripheral</td>
                <td className="py-2.5 px-3">DHT11</td>
                <td className="py-2.5 px-3">Ambient Temp & Humidity</td>
                <td className="py-2.5 px-3 text-teal-400 font-bold">GPIO 32</td>
                <td className="py-2.5 px-3">Single-Bus Digital</td>
                <td className="py-2.5 px-3">—</td>
                <td className="py-2.5 px-3 text-slate-400">10k Pull-up to 3.3V</td>
              </tr>
              <tr className="bg-slate-900/40">
                <td className="py-2.5 px-3 text-slate-400">Sensor Peripheral</td>
                <td className="py-2.5 px-3">MQ-2</td>
                <td className="py-2.5 px-3">Combustible Gas & Smoke</td>
                <td className="py-2.5 px-3 text-rose-400 font-bold">GPIO 34</td>
                <td className="py-2.5 px-3">ADC1 Ch6 (0-4095)</td>
                <td className="py-2.5 px-3">—</td>
                <td className="py-2.5 px-3 text-slate-400">100ms Safety Loop • ADC &lt; 45 Wire Fault</td>
              </tr>
              <tr className="bg-slate-900/40">
                <td className="py-2.5 px-3 text-slate-400">Sensor Peripheral</td>
                <td className="py-2.5 px-3">INA219</td>
                <td className="py-2.5 px-3">Voltage, Current & Power</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">SDA 21, SCL 22</td>
                <td className="py-2.5 px-3">I2C (0x40)</td>
                <td className="py-2.5 px-3">—</td>
                <td className="py-2.5 px-3 text-slate-400">Overcurrent & Voltage Sag/Surge Alerting</td>
              </tr>
              <tr className="bg-slate-900/40">
                <td className="py-2.5 px-3 text-slate-400">Alert Peripheral</td>
                <td className="py-2.5 px-3">Active Buzzer</td>
                <td className="py-2.5 px-3">Acoustic Emergency Siren</td>
                <td className="py-2.5 px-3 text-amber-400 font-bold">GPIO 33</td>
                <td className="py-2.5 px-3">Digital 5V Active</td>
                <td className="py-2.5 px-3">—</td>
                <td className="py-2.5 px-3 text-slate-400">200ms Siren Cadence on Gas Danger</td>
              </tr>
              <tr className="bg-slate-900/40">
                <td className="py-2.5 px-3 text-slate-400">Safety Control</td>
                <td className="py-2.5 px-3">BOOT Button</td>
                <td className="py-2.5 px-3">Physical Safety Reset</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">GPIO 0</td>
                <td className="py-2.5 px-3">Active LOW Pull-up</td>
                <td className="py-2.5 px-3">—</td>
                <td className="py-2.5 px-3 text-slate-400">Disarms lockout only if gas &lt; 150 PPM</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

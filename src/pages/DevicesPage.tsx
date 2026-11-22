import React, { useState } from 'react';
import { 
  Cpu, 
  Search,
  SlidersHorizontal,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Info,
  CheckCircle2
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import { DeviceCard } from '../components/devices/DeviceCard';
import { MasterControl } from '../components/devices/MasterControl';
import { HardwareBridgeController } from '../components/devices/HardwareBridgeController';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';

export const DevicesPage: React.FC = () => {
  const { devices, toggleDevice, gasSafetyState } = useSmartHome();
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const rooms = ['all', 'Living Room', 'Master Bedroom', 'Utility / Pump Room', 'Outdoor / Street', 'Kitchen Area'];

  const filteredDevices = devices.filter(device => {
    const matchesRoom = selectedRoom === 'all' || device.room === selectedRoom;
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          device.room.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          device.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(device.gpioPin).includes(searchQuery);
    return matchesRoom && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Master 5-Channel Relays Controller */}
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
            placeholder="Search device or GPIO (14, 25, 26, 27, 32)..."
            className="glass-input w-full pl-9 pr-3 py-1.5 rounded-xl text-xs text-slate-200 placeholder:text-slate-400"
          />
        </div>
      </Card>

      {/* ===================================================================== */}
      {/* SECTION 1: 5-CHANNEL ESP32 ACTIVE-LOW RELAYS                          */}
      {/* ===================================================================== */}
      {filteredDevices.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                  5-Channel ESP32 Active-LOW Relay Controller
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                    Optocoupler & DC Driver Isolated
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Ch 1: Light (GPIO 25) • Ch 2: Fan (GPIO 26) • Ch 3: Motor (GPIO 27) • Ch 4: Street Light (GPIO 14) • Ch 5: Exhaust Fan (GPIO 32)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
              Active LOW (0V = Energized)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {filteredDevices.map(device => (
              <DeviceCard key={device.id} device={device} onToggle={toggleDevice} />
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: HAZARDOUS ATMOSPHERE & EXHAUST INTERLOCK ARCHITECTURE      */}
      {/* ===================================================================== */}
      <Card className="p-5 bg-gradient-to-br from-teal-950/20 via-slate-900/90 to-slate-950 border-teal-500/30 flex flex-col justify-between">
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
              <strong className="text-teal-300">Why a dedicated switching driver on GPIO 32?</strong> The kitchen DC exhaust fan is driven via an isolated DC switching driver on GPIO 32 to ensure dedicated ventilation control without burdening AC relay channels.
            </p>
            <p>
              <strong className="text-rose-300">Strict Life-Safety Rule:</strong> Switching mechanical relay contacts or running ordinary brushed DC motors generates electrical arcs that ignite combustible LPG/methane fuel-air mixtures. Automatic exhaust activation is <strong>strictly disabled during gas emergency</strong> unless the complete assembly (fan, motor, relay, wiring, and enclosure) is certified explosion-proof.
            </p>
            <p className="font-mono text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              • Physical Relay: Relay 5 Active-LOW DC Switching Driver (GPIO 32)<br />
              • Control Logic: Manual Switch / Automatic Emergency Recovery Ventilation<br />
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
            Target Pin: ESP32 GPIO 32
          </span>
        </div>
      </Card>

      {/* ===================================================================== */}
      {/* SECTION 3: COMPREHENSIVE HARDWARE PINOUT & WIRING MATRIX               */}
      {/* ===================================================================== */}
      <Card className="p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-slate-100">ESP32 GPIO Hardware Mapping & Wiring Verification</h3>
          </div>
          <Badge variant="cyan" size="sm">Active Configuration</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Board / Subsystem</th>
                <th className="py-2.5 px-3">Channel / Role</th>
                <th className="py-2.5 px-3">Device Name</th>
                <th className="py-2.5 px-3">ESP32 GPIO Pin</th>
                <th className="py-2.5 px-3">Logic Type</th>
                <th className="py-2.5 px-3">Load Rating</th>
                <th className="py-2.5 px-3">Interlock & Safety Behavior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              <tr className="bg-slate-950/40">
                <td className="py-2.5 px-3 font-bold text-slate-300">5-Channel Relays</td>
                <td className="py-2.5 px-3">Channel 1</td>
                <td className="py-2.5 px-3 text-cyan-300 font-semibold">Living Room Light</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 25</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">100 W</td>
                <td className="py-2.5 px-3 text-slate-400">Emergency Shedding • Auto-Restoration Capable</td>
              </tr>
              <tr className="bg-slate-950/40">
                <td className="py-2.5 px-3 font-bold text-slate-300">5-Channel Relays</td>
                <td className="py-2.5 px-3">Channel 2</td>
                <td className="py-2.5 px-3 text-cyan-300 font-semibold">Master Bedroom Ceiling Fan</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 26</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">75 W</td>
                <td className="py-2.5 px-3 text-slate-400">Emergency Shedding • Auto-Restoration Capable</td>
              </tr>
              <tr className="bg-slate-950/40">
                <td className="py-2.5 px-3 font-bold text-slate-300">5-Channel Relays</td>
                <td className="py-2.5 px-3">Channel 3</td>
                <td className="py-2.5 px-3 text-cyan-300 font-semibold">Water Booster Motor</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 27</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">750 W</td>
                <td className="py-2.5 px-3 text-emerald-400">Max 30m Auto-Cutoff • Gas Lockout Tripped</td>
              </tr>
              <tr className="bg-slate-950/40">
                <td className="py-2.5 px-3 font-bold text-slate-300">5-Channel Relays</td>
                <td className="py-2.5 px-3">Channel 4</td>
                <td className="py-2.5 px-3 text-cyan-300 font-semibold">Street Light</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 14</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">60 W</td>
                <td className="py-2.5 px-3 text-slate-400">Outdoor / Perimeter Security Lighting</td>
              </tr>
              <tr className="bg-teal-950/20">
                <td className="py-2.5 px-3 font-bold text-teal-300">5-Channel Relays</td>
                <td className="py-2.5 px-3 text-teal-200">Channel 5</td>
                <td className="py-2.5 px-3 text-teal-200 font-semibold">Kitchen DC Exhaust Fan</td>
                <td className="py-2.5 px-3 text-teal-400 font-bold">GPIO 32</td>
                <td className="py-2.5 px-3 text-teal-300">Active LOW (0V)</td>
                <td className="py-2.5 px-3">60 W</td>
                <td className="py-2.5 px-3 text-teal-300 font-semibold">Manual / Auto Gas Recovery Ventilation</td>
              </tr>
              {/* Sensor & Alert Peripherals */}
              <tr className="bg-slate-900/40">
                <td className="py-2.5 px-3 text-slate-400">Sensor Peripheral</td>
                <td className="py-2.5 px-3">DHT11</td>
                <td className="py-2.5 px-3">Ambient Temp & Humidity</td>
                <td className="py-2.5 px-3 text-teal-400 font-bold">GPIO 4</td>
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
                <td className="py-2.5 px-3">Reset Button</td>
                <td className="py-2.5 px-3">Physical Safety Reset</td>
                <td className="py-2.5 px-3 text-emerald-400 font-bold">GPIO 13</td>
                <td className="py-2.5 px-3">Active LOW Pull-up</td>
                <td className="py-2.5 px-3">—</td>
                <td className="py-2.5 px-3 text-slate-400">Disarms lockout only if gas is cleared</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

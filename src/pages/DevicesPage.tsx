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

  const rooms = ['all', 'Living Room', 'Master Bedroom', 'Utility / Pump Room'];

  const normalDevices = devices.filter(d => d.type !== 'exhaust_fan' && d.relayChannel <= 3);
  const exhaustDevice = devices.find(d => d.type === 'exhaust_fan' || d.gpioPin === 32);

  const filteredDevices = normalDevices.filter(device => {
    const matchesRoom = selectedRoom === 'all' || device.room === selectedRoom;
    const matchesSearch = device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          device.room.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          device.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(device.gpioPin).includes(searchQuery);
    return matchesRoom && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Master 3-Channel Relays Controller */}
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
              {room === 'all' ? 'All Rooms & Household Appliances' : room}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search appliance or GPIO (25, 26, 27)..."
            className="glass-input w-full pl-9 pr-3 py-1.5 rounded-xl text-xs text-slate-200 placeholder:text-slate-400"
          />
        </div>
      </Card>

      {/* ===================================================================== */}
      {/* SECTION 1: 3-CHANNEL ESP32 ACTIVE-LOW HOUSEHOLD RELAYS                */}
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
                  3-Channel Active-LOW Household Appliance Relays
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold">
                    Optocoupler Isolated
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Ch 1: Light (GPIO 25) • Ch 2: Fan (GPIO 26) • Ch 3: Motor (GPIO 27)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <span className="h-2 w-2 rounded-full bg-cyan-400"></span>
              Active LOW (0V = Energized)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredDevices.map(device => (
              <DeviceCard key={device.id} device={device} onToggle={toggleDevice} />
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: DEDICATED EMERGENCY SAFETY SYSTEM & EXHAUST VENTILATION    */}
      {/* ===================================================================== */}
      <Card className="p-5 bg-gradient-to-br from-teal-950/20 via-slate-900/90 to-slate-950 border-teal-500/30 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-teal-400" />
              <h3 className="font-bold text-sm text-slate-100">
                Dedicated Emergency Exhaust & Hazardous Atmosphere Safety System
              </h3>
            </div>
            <Badge variant={gasSafetyState.exhaustFanActive ? 'rose' : 'teal'} size="sm">
              {gasSafetyState.exhaustFanActive ? 'VENTILATING (GPIO 32 ON)' : 'STANDBY (GPIO 32 OFF)'}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-xs font-mono text-slate-400 block mb-1">Dedicated Exhaust Relay</span>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-bold font-mono ${gasSafetyState.exhaustFanActive ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {gasSafetyState.exhaustFanActive ? 'ACTIVE (ON)' : 'STANDBY (OFF)'}
                </span>
                <span className="text-xs text-slate-400 font-mono">GPIO 32</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Isolated DC driver for combustible gas extraction. Cannot be manually deactivated during emergency lockout.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-xs font-mono text-slate-400 block mb-1">Appliance Shedding Status</span>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-bold font-mono ${gasSafetyState.lockoutStatus === 'CRITICAL' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {gasSafetyState.lockoutStatus === 'CRITICAL' ? 'SHED & LOCKED' : 'NORMAL / ARMED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Relay 1 (25), Relay 2 (26), Relay 3 (27) cut immediately on confirmed gas detection.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
              <span className="text-xs font-mono text-slate-400 block mb-1">Auto-Recovery Sequence</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-cyan-300">
                  {gasSafetyState.recoveryStatus || 'IDLE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Restores pre-emergency states for Light, Fan, Motor after MQ-2 stabilizes below 900 ADC for 5s.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2 text-xs text-slate-300 leading-relaxed">
            <p>
              <strong className="text-teal-300">Why isolated on GPIO 32?</strong> The emergency exhaust fan is driven on dedicated GPIO 32 completely separated from household appliance controls to ensure guaranteed ventilation during gas incidents without sparking risk from general lighting and heavy motor relays.
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
                <td className="py-2.5 px-3 font-bold text-slate-300">Appliance Relays</td>
                <td className="py-2.5 px-3">Channel 1</td>
                <td className="py-2.5 px-3 text-cyan-300 font-semibold">Living Room Light</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 25</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">100 W</td>
                <td className="py-2.5 px-3 text-slate-400">Emergency Shedding • Snapshot Restoration</td>
              </tr>
              <tr className="bg-slate-950/40">
                <td className="py-2.5 px-3 font-bold text-slate-300">Appliance Relays</td>
                <td className="py-2.5 px-3">Channel 2</td>
                <td className="py-2.5 px-3 text-cyan-300 font-semibold">Master Bedroom Ceiling Fan</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 26</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">75 W</td>
                <td className="py-2.5 px-3 text-slate-400">Emergency Shedding • Snapshot Restoration</td>
              </tr>
              <tr className="bg-slate-950/40">
                <td className="py-2.5 px-3 font-bold text-slate-300">Appliance Relays</td>
                <td className="py-2.5 px-3">Channel 3</td>
                <td className="py-2.5 px-3 text-cyan-300 font-semibold">Water Booster Motor</td>
                <td className="py-2.5 px-3 text-cyan-400 font-bold">GPIO 27</td>
                <td className="py-2.5 px-3">Active LOW (0V)</td>
                <td className="py-2.5 px-3">750 W</td>
                <td className="py-2.5 px-3 text-emerald-400">Max 30m Auto-Cutoff • Emergency Shedding • Snapshot Restoration</td>
              </tr>
              <tr className="bg-teal-950/20">
                <td className="py-2.5 px-3 font-bold text-teal-300">Safety System</td>
                <td className="py-2.5 px-3 text-teal-200">Dedicated Relay</td>
                <td className="py-2.5 px-3 text-teal-200 font-semibold">Kitchen DC Exhaust Fan</td>
                <td className="py-2.5 px-3 text-teal-400 font-bold">GPIO 32</td>
                <td className="py-2.5 px-3 text-teal-300">Active LOW (0V)</td>
                <td className="py-2.5 px-3">60 W</td>
                <td className="py-2.5 px-3 text-teal-300 font-semibold">Dedicated Safety Exhaust • Auto-Ventilation on Gas Danger</td>
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

import React from 'react';
import {
  Thermometer,
  Droplet,
  Zap,
  Flame,
  Cpu,
  RotateCcw,
  Sliders,
  Activity
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import { SensorGauge } from '../components/sensors/SensorGauge';
import { GasSensorCard } from '../components/sensors/GasSensorCard';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';

export const SensorsPage: React.FC = () => {
  const {
    telemetry,
    simulateIncident,
    clearSimulatedIncident,
    triggerGasLeakAlert,
  } = useSmartHome();

  const isDemoMode = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';

  return (
    <div className="space-y-6">
      {/* Simulation Control Toolbar */}
      <Card className="border-cyan-500/20 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">Live Hardware Telemetry Stream</h3>
                <Badge variant={telemetry.isHardwareConnected ? 'emerald' : 'demo'} size="sm">
                  {telemetry.isHardwareConnected
                    ? 'Hardware Live'
                    : (!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true')
                      ? 'Demo Mode'
                      : 'Hardware Offline'}
                </Badge>
              </div>
              <p className="text-xs text-slate-400">
                {telemetry.isHardwareConnected
                  ? 'Real-time telemetry stream from ESP32 node (DHT11, MQ-2, INA219).'
                  : 'Ingests physical sensor readings via Supabase Edge Gateway when ESP32 node is online.'}
              </p>
            </div>
          </div>

          {isDemoMode && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Flame className="h-3.5 w-3.5" />}
                onClick={() => triggerGasLeakAlert(485, 'Kitchen & Utility Area')}
              >
                Simulate Gas Leak (485 PPM)
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Thermometer className="h-3.5 w-3.5 text-amber-400" />}
                onClick={() => simulateIncident('high_temp')}
              >
                Test Temp Spike (34.2°C)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RotateCcw className="h-3.5 w-3.5 text-emerald-400" />}
                onClick={clearSimulatedIncident}
              >
                Reset Sensors
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Primary Sensor Telemetry Gauges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Sensor 1: Temperature */}
        <SensorGauge
          title="Ambient Temperature"
          value={telemetry.temperature}
          unit="°C"
          sensorModel="DHT11 Digital Sensor"
          pinInfo="GPIO 32 (1-Wire)"
          icon={<Thermometer className="h-5 w-5" />}
          min={10}
          max={45}
          currentValue={telemetry.temperature}
          accentColor={telemetry.temperature != null && telemetry.temperature > 30 ? 'amber' : 'teal'}
          statusText={telemetry.temperature == null ? 'FAULT / DISCONNECTED' : telemetry.temperature > 30 ? 'ELEVATED' : 'OPTIMAL'}
          subtitle="Measures indoor environmental heat index."
          isRealHardware={telemetry.isHardwareConnected}
        />

        {/* Sensor 2: Humidity */}
        <SensorGauge
          title="Relative Humidity"
          value={telemetry.humidity}
          unit="%"
          sensorModel="DHT11 Digital Sensor"
          pinInfo="GPIO 32 (1-Wire)"
          icon={<Droplet className="h-5 w-5" />}
          min={20}
          max={90}
          currentValue={telemetry.humidity}
          accentColor="blue"
          statusText={telemetry.humidity == null ? 'FAULT / DISCONNECTED' : 'COMFORT ZONE'}
          subtitle="Relative moisture ratio in room air."
          isRealHardware={telemetry.isHardwareConnected}
        />

        {/* Sensor 3: Mains Voltage */}
        <SensorGauge
          title="Bus Voltage"
          value={telemetry.voltage}
          unit="V"
          sensorModel="INA219 Power Monitor"
          pinInfo="I2C SDA: 21, SCL: 22"
          icon={<Activity className="h-5 w-5" />}
          min={210}
          max={250}
          currentValue={telemetry.voltage}
          accentColor="cyan"
          statusText={telemetry.voltage == null ? 'FAULT / DISCONNECTED' : 'GRID STABLE'}
          subtitle="Monitored supply voltage for inductive surges."
          isRealHardware={telemetry.isHardwareConnected}
        />

        {/* Sensor 4: Instantaneous Current */}
        <SensorGauge
          title="Current Draw"
          value={telemetry.current}
          unit="A"
          sensorModel="INA219 Power Monitor"
          pinInfo="Shunt Resistor 0.1Ω"
          icon={<Zap className="h-5 w-5" />}
          min={0}
          max={6}
          currentValue={telemetry.current}
          accentColor="amber"
          statusText={telemetry.current == null ? 'FAULT / DISCONNECTED' : 'LOAD BALANCED'}
          subtitle="Proportional to active 4-channel relay states."
          isRealHardware={telemetry.isHardwareConnected}
        />

        {/* Sensor 5: Active Real-time Power */}
        <SensorGauge
          title="Aggregate Active Power"
          value={telemetry.power}
          unit="W"
          sensorModel="INA219 Integrated Math"
          pinInfo="P = V × I"
          icon={<Zap className="h-5 w-5" />}
          min={0}
          max={1200}
          currentValue={telemetry.power ?? 0}
          accentColor="emerald"
          statusText={telemetry.power == null ? 'DISCONNECTED / NO DATA' : 'NORMAL POWER'}
          subtitle="Real-time calculated wattage of all 4 circuits."
          isRealHardware={telemetry.isHardwareConnected}
        />

        {/* Sensor 6: Cumulative Energy Today */}
        <SensorGauge
          title="Cumulative Energy (Today)"
          value={telemetry.energyTodayKWh}
          unit="kWh"
          sensorModel="Firmware Accumulator"
          pinInfo="∫ Power dt"
          icon={<Activity className="h-5 w-5" />}
          min={0}
          max={10}
          currentValue={telemetry.energyTodayKWh}
          accentColor="teal"
          statusText="DAILY PROGRESS"
          subtitle="Continuous integration over 24-hour cycle."
        />
      </div>

      {/* Dedicated MQ-2 Combustible Gas & Smoke Safety Hub */}
      <GasSensorCard telemetry={telemetry} />

      {/* Hardware Pinout & Architecture Diagram Callout */}
      <Card className="p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-slate-100">ESP32 Pinout & Hardware Bus Summary</h3>
          </div>
          <Badge variant="teal" size="sm">Dual-Core 240MHz</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="font-bold text-teal-300 block mb-1">DHT11 Temp & Humidity</span>
            <p className="text-slate-400">Pin: GPIO 32</p>
            <p className="text-slate-400">Protocol: 1-Wire Single Bus</p>
            <p className="text-slate-400">Sampling Rate: 1 Hz (1 sec)</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="font-bold text-rose-300 block mb-1">MQ-2 Gas & Smoke</span>
            <p className="text-slate-400">Pin: GPIO 34 (ADC1 Ch6)</p>
            <p className="text-slate-400">Protocol: 12-bit Analog Voltage</p>
            <p className="text-slate-400">Interrupt: 100ms Safety Loop</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="font-bold text-cyan-300 block mb-1">INA219 Power Monitor</span>
            <p className="text-slate-400">SDA: GPIO 21 | SCL: GPIO 22</p>
            <p className="text-slate-400">Protocol: I2C (Address 0x40)</p>
            <p className="text-slate-400">Bus Voltage: Up to 26V / Mains</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <span className="font-bold text-amber-300 block mb-1">Piezo Buzzer & Alarm</span>
            <p className="text-slate-400">Pin: GPIO 33</p>
            <p className="text-slate-400">Protocol: Active 5V Siren Cadence</p>
            <p className="text-slate-400">Decibel: 85 dB @ 10cm</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

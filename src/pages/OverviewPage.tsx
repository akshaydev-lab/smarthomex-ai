import React from 'react';
import { 
  Zap, 
  Thermometer, 
  Droplet, 
  Flame, 
  ToggleRight, 
  Mic, 
  ShieldAlert, 
  Activity, 
  Cpu, 
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { useSmartHome } from '../hooks/useSmartHome';
import { DeviceCard } from '../components/devices/DeviceCard';
import { MasterControl } from '../components/devices/MasterControl';
import { GasSensorCard } from '../components/sensors/GasSensorCard';
import { INA219MetricsCards } from '../components/energy/INA219MetricsCards';
import { LivePowerStreamingGraph } from '../components/energy/LivePowerStreamingGraph';
import { TemperatureChart } from '../components/charts/TemperatureChart';
import { ElectricalChart } from '../components/charts/ElectricalChart';
import { AlertCard } from '../components/alerts/AlertCard';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { getHourlyTelemetryData } from '../services/sensorService';
import { formatWatts, formatVoltage, formatTemperature, formatHumidity } from '../lib/utils';

export const OverviewPage: React.FC = () => {
  const { 
    devices, 
    toggleDevice, 
    telemetry, 
    activeDeviceCount, 
    alerts, 
    acknowledgeAlert, 
    dismissAlert,
    setCurrentPage,
    hardwareBridge,
  } = useSmartHome();

  const hourlyData = getHourlyTelemetryData();
  const unreadAlerts = alerts.filter(a => !a.acknowledged);
  const normalDevices = devices.filter(d => d.type !== 'exhaust_fan' && d.relayChannel <= 3);
  const activeNormalCount = normalDevices.filter(d => d.state).length;

  return (
    <div className="space-y-6">
      {/* Top Telemetry KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Metric 1: Active Relays */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Active Relays</span>
            <ToggleRight className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-cyan-300">{activeNormalCount}</span>
            <span className="text-xs text-slate-400 font-mono">/ {normalDevices.length} ON</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">GPIO 25, 26, 27 (Appliances)</span>
        </Card>

        {/* Metric 2: Live Power Load */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Active Load</span>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {telemetry.power != null ? formatWatts(telemetry.power) : '-- W'}
          </div>
          <span className="text-[10px] text-amber-400/80 mt-1 block flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> INA219 Real-time
          </span>
        </Card>

        {/* Metric 3: DC Supply Voltage */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">DC Supply Voltage</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {formatVoltage(telemetry.voltage)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">INA219 I2C (21/22)</span>
        </Card>

        {/* Metric 4: Ambient Temp */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Ambient Temp</span>
            <Thermometer className="h-4 w-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-teal-300">
            {formatTemperature(telemetry.temperature)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">DHT11 (GPIO 4)</span>
        </Card>

        {/* Metric 5: Humidity */}
        <Card className="p-3.5">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Air Humidity</span>
            <Droplet className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300">
            {formatHumidity(telemetry.humidity)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Comfort: Optimal</span>
        </Card>

        {/* Metric 6: MQ-2 Gas */}
        {(() => {
          const isOffline = telemetry.esp32Status === 'offline' || telemetry.gasRawAdc == null || telemetry.gasStatus === 'offline';
          const isDanger = !isOffline && telemetry.gasStatus === 'danger';
          const isWarning = !isOffline && telemetry.gasStatus === 'warning';
          const isWarmingUp = !isOffline && telemetry.gasStatus === 'warming_up';
          const isFault = !isOffline && telemetry.gasStatus === 'sensor_fault';

          return (
            <Card className="p-3.5">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold">MQ-2 Gas</span>
                <Flame className={`h-4 w-4 ${isDanger ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`} />
              </div>
              <div className="text-2xl font-bold font-mono">
                {isOffline ? (
                  <span className="text-slate-400">OFFLINE</span>
                ) : isFault ? (
                  <span className="text-amber-400">FAULT</span>
                ) : isWarmingUp ? (
                  <span className="text-cyan-300">WARMUP</span>
                ) : (
                  <span className={isDanger ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-cyan-300'}>
                    {telemetry.gasRawAdc ?? '--'}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 block font-semibold ${
                isOffline ? 'text-slate-400' : isDanger ? 'text-rose-400' : isFault ? 'text-amber-400' : isWarmingUp ? 'text-cyan-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {isOffline ? 'NO DATA' : isDanger ? 'DANGER: LEAK' : isFault ? 'ADC < 45' : isWarmingUp ? 'STABILIZING' : isWarning ? 'ELEVATED' : 'SAFE'}
              </span>
            </Card>
          );
        })()}
      </div>

      {/* Master 5-Channel Relay Controller Bar */}
      <MasterControl />

      {/* 3 Dedicated Device Relay Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">3-Channel Household Appliance Relays</h2>
            <Badge variant="teal" size="sm">3 Relays Armed</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" />}
            onClick={() => setCurrentPage('devices')}
          >
            Manage All
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {normalDevices.map(device => (
            <DeviceCard key={device.id} device={device} onToggle={toggleDevice} />
          ))}
        </div>
      </div>

      {/* MQ-2 Gas & Smoke Safety Hub */}
      <GasSensorCard telemetry={telemetry} />

      {/* INA219 Live Energy Monitoring Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">INA219 Live Energy & Power Monitoring</h2>
            <Badge variant="teal" size="sm">I2C 0x40 Active</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" />}
            onClick={() => setCurrentPage('analytics')}
          >
            Full Energy Intelligence Center
          </Button>
        </div>

        {/* 5 INA219 Cards: Voltage, Current, Power, Energy (Wh/kWh), Estimated Bill */}
        <INA219MetricsCards />

        {/* Real-Time Live Power Streaming Graph */}
        <LivePowerStreamingGraph />
      </div>

      {/* Live Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TemperatureChart data={hourlyData} />
        <ElectricalChart data={hourlyData} />
      </div>

      {/* Active Alerts Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-400" />
            <h2 className="text-lg font-bold text-slate-100">System & Safety Alerts</h2>
            {unreadAlerts.length > 0 && (
              <Badge variant="rose" size="sm">{unreadAlerts.length} Unresolved</Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" />}
            onClick={() => setCurrentPage('alerts')}
          >
            View All Alerts
          </Button>
        </div>

        <div className="space-y-3">
          {alerts.length === 0 ? (
            <Card className="p-4 text-center border-dashed border-slate-800 text-slate-400 text-sm">
              No active alerts. System running nominally.
            </Card>
          ) : (
            alerts.slice(0, 2).map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={acknowledgeAlert}
                onDismiss={dismissAlert}
              />
            ))
          )}
        </div>
      </div>

      {/* HomeX AI Assistant Quick Banner */}
      <Card 
        interactive 
        onClick={() => setCurrentPage('voice')}
        className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-teal-950/30 border-cyan-500/30 p-5 flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-glow-cyan shrink-0">
            <Mic className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
              <span>HomeX AI Voice Assistant Ready</span>
              <Badge variant="teal" size="sm">Speech Recognition Active</Badge>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Control Light, Fan & Water Motor or query DHT11/MQ-2 metrics with natural voice commands. Dedicated Emergency Exhaust on GPIO 32 is auto-managed.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />}>
          Open Assistant
        </Button>
      </Card>
    </div>
  );
};

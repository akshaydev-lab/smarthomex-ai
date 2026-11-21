import React, { useState } from 'react';
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
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Play,
  Volume2,
  VolumeX,
  Square,
  CheckCircle2,
  Database,
  Server
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
    gasSafetyState,
    setIsGasEmergencyModalOpen,
    isAlarmTesting,
    alarmTestCountdown,
    startAlarmTest,
    stopAlarmTest,
    isSpeakerTesting,
    playSpeakerTestBeep,
    stopAllTestAudio,
    audioDiagnosticStatus,
    setAllDevices
  } = useSmartHome();

  const [confirmAllOnModal, setConfirmAllOnModal] = useState<boolean>(false);
  const hourlyData = getHourlyTelemetryData();
  const unreadAlerts = alerts.filter(a => !a.acknowledged);

  const rawAdc = telemetry.gasRawAdc ?? gasSafetyState.rawAdc ?? null;
  const isOffline = !hardwareBridge.esp32Connected || rawAdc == null || telemetry.gasStatus === 'offline';
  const isDanger = !isOffline && (telemetry.gasStatus === 'danger' || gasSafetyState.lockoutStatus === 'CRITICAL');
  const isWarning = !isOffline && telemetry.gasStatus === 'warning';
  const isWarmingUp = !isOffline && telemetry.gasStatus === 'warming_up';
  const isClearedPendingReset = !isOffline && (gasSafetyState.gasClearedPendingReset || gasSafetyState.lockoutStatus === 'LOCKOUT_PENDING_RESET');
  const isSensorFault = !isOffline && (telemetry.gasStatus === 'sensor_fault' || gasSafetyState.sensorFault || gasSafetyState.lockoutStatus === 'SENSOR_FAULT');

  const isAnyTestAudioActive = isAlarmTesting || isSpeakerTesting;

  // Determine Safety Card status badge & text
  const getSafetyStatus = () => {
    if (isOffline) {
      return {
        badge: 'OFFLINE / NO DATA',
        variant: 'slate' as const,
        title: 'Hardware Telemetry Offline',
        desc: 'ESP32 controller disconnected. Life-safety state cannot be confirmed. Relays fail-safe disarmed.',
        icon: AlertTriangle,
        color: 'text-[#64748B]',
        bg: 'bg-[#111820]',
      };
    }
    if (isDanger) {
      return {
        badge: 'CRITICAL GAS HAZARD',
        variant: 'rose' as const,
        title: 'Emergency Gas Leak Detected',
        desc: `Dangerous combustible gas level (${rawAdc} ADC >= 1600). Relays forced OFF. Evacuate premises immediately.`,
        icon: ShieldAlert,
        color: 'text-red-400',
        bg: 'bg-red-950/40 border-red-500/50',
      };
    }
    if (isSensorFault) {
      return {
        badge: 'SENSOR FAULT (ADC < 45)',
        variant: 'amber' as const,
        title: 'MQ-2 Cable / Circuit Fault',
        desc: 'Sensor analog reading dropped below 45 ADC (possible disconnected wire on GPIO 34). Fail-safe active.',
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-950/30 border-amber-500/40',
      };
    }
    if (isWarmingUp) {
      return {
        badge: 'WARMING UP (PREHEAT)',
        variant: 'cyan' as const,
        title: 'MQ-2 Sensor Thermal Preheating',
        desc: 'Sensor heater coil stabilizing. Allow up to 60 seconds for accurate baseline ADC telemetry.',
        icon: Activity,
        color: 'text-cyan-400',
        bg: 'bg-cyan-950/30 border-cyan-500/40',
      };
    }
    if (isClearedPendingReset) {
      return {
        badge: 'LOCKOUT PENDING RESET',
        variant: 'amber' as const,
        title: 'Atmosphere Safe • Awaiting Reset',
        desc: 'Combustible gas cleared below trip threshold. Safety interlock requires authorized manual verification reset.',
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-950/30 border-amber-500/40',
      };
    }
    if (isWarning) {
      return {
        badge: 'ELEVATED GAS (WARNING)',
        variant: 'amber' as const,
        title: 'Elevated Gas Concentrations',
        desc: `Gas concentration elevated (${rawAdc} ADC). Monitor kitchen ventilation closely.`,
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-950/30 border-amber-500/40',
      };
    }
    return {
      badge: 'ATMOSPHERE NOMINAL',
      variant: 'emerald' as const,
      title: 'Life-Safety Systems Armed & Safe',
      desc: `Combustible gas and ambient environment within safe limits (${rawAdc != null ? `${rawAdc} ADC` : 'Clean'}). Contactor armed.`,
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/20 border-emerald-500/30',
    };
  };

  const safety = getSafetyStatus();
  const SafetyIcon = safety.icon;

  return (
    <div className="space-y-6">
      {/* 1. Welcome Section & Control Center Banner */}
      <div className="relative rounded-2xl overflow-hidden p-6 sm:p-7 border border-white/[0.08] bg-gradient-to-r from-[#141C23] via-[#111820] to-[#0B0F12] shadow-glass">
        <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-emerald-500/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                Emerald Smart Control Center
              </span>
              <Badge variant={hardwareBridge.esp32Connected ? 'emerald' : 'demo'} size="sm">
                {hardwareBridge.esp32Connected ? 'ESP32 HARDWARE ONLINE' : 'DEMO MODE'}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F8FAFC]">
              SmartHomeX AI Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-1 max-w-2xl leading-relaxed">
              Industrial-grade IoT telemetry, 4-channel active-LOW relay automation, and life-safety monitoring for your home.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="p-3 rounded-xl bg-[#0B0F12] border border-white/[0.08] text-right">
              <span className="text-[10px] font-mono text-[#64748B] block uppercase">Active Relays</span>
              <span className="text-xl font-bold font-mono text-emerald-400">
                {activeDeviceCount} <span className="text-xs text-[#64748B]">/ {devices.length} ON</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#0B0F12] border border-white/[0.08] text-right">
              <span className="text-[10px] font-mono text-[#64748B] block uppercase">Current Power</span>
              <span className="text-xl font-bold font-mono text-[#F8FAFC]">
                {telemetry.power != null ? formatWatts(telemetry.power) : '-- W'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Home Safety Card */}
      <Card className={`p-5 transition-all duration-300 border ${safety.bg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border shrink-0 ${
              isDanger 
                ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse shadow-glow-danger' 
                : isSensorFault || isWarning || isClearedPendingReset
                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                : isWarmingUp
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                : isOffline
                ? 'bg-[#111820] border-white/[0.08] text-[#64748B]'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-glow-emerald'
            }`}>
              <SafetyIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#F8FAFC]">
                  {safety.title}
                </h2>
                <Badge variant={safety.variant} size="sm" pulse={isDanger || isWarmingUp}>
                  {safety.badge}
                </Badge>
              </div>
              <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                {safety.desc}
              </p>
              <div className="flex items-center gap-4 mt-2 text-[11px] font-mono text-[#64748B]">
                <span>MQ-2 ADC: <strong className="text-[#F8FAFC]">{rawAdc != null ? `${rawAdc} / 4095` : '--'}</strong></span>
                <span>Threshold: <strong className="text-slate-300">1600 ADC</strong></span>
                <span>Contactor: <strong className={gasSafetyState.mainContactorTripped ? 'text-red-400' : 'text-emerald-400'}>{gasSafetyState.mainContactorTripped ? 'TRIPPED' : 'ARMED'}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
            {isDanger && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<ShieldAlert className="h-4 w-4" />}
                onClick={() => setIsGasEmergencyModalOpen(true)}
              >
                Open Emergency UI
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              rightIcon={<ChevronRight className="h-4 w-4" />}
              onClick={() => setCurrentPage('sensors')}
            >
              Sensor Diagnostics
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. Sensor Summary Cards (6 KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Metric 1: MQ-2 Gas */}
        <Card className={`p-3.5 ${
          isOffline
            ? 'bg-[#141C23] border-white/[0.08]'
            : isDanger
            ? 'border-red-500/60 bg-red-950/20 shadow-glow-danger'
            : isWarning || isClearedPendingReset
            ? 'border-amber-500/50 bg-amber-950/20'
            : isSensorFault
            ? 'border-amber-500/40 bg-amber-950/20'
            : isWarmingUp
            ? 'border-cyan-500/40 bg-cyan-950/20'
            : 'border-white/[0.08] bg-[#141C23]'
        }`}>
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-semibold">MQ-2 Gas</span>
            <Flame className={`h-4 w-4 ${
              isDanger 
                ? 'text-red-400 animate-pulse' 
                : isWarning 
                ? 'text-amber-400' 
                : isSensorFault 
                ? 'text-amber-400'
                : isWarmingUp 
                ? 'text-cyan-400' 
                : 'text-emerald-400'
            }`} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-bold font-mono ${
              isDanger 
                ? 'text-red-400' 
                : isWarning 
                ? 'text-amber-400' 
                : isSensorFault 
                ? 'text-amber-400' 
                : isWarmingUp 
                ? 'text-cyan-300' 
                : 'text-emerald-400'
            }`}>
              {isOffline
                ? '--'
                : isSensorFault 
                ? 'ERR' 
                : isWarmingUp 
                ? 'PREHEAT' 
                : rawAdc != null 
                ? rawAdc 
                : '--'}
            </span>
            <span className="text-[10px] font-mono text-[#64748B]">
              {isOffline || isSensorFault || isWarmingUp ? '' : 'RAW ADC'}
            </span>
          </div>
          <span className="text-[10px] text-[#64748B] mt-1 block uppercase font-mono">
            {isOffline ? 'NO DATA' : telemetry.gasStatus}
          </span>
        </Card>

        {/* Metric 2: Ambient Temp */}
        <Card className="p-3.5 bg-[#141C23] border-white/[0.08]">
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-semibold">Temperature</span>
            <Thermometer className="h-4 w-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-teal-300">
            {formatTemperature(telemetry.temperature)}
          </div>
          <span className="text-[10px] text-[#64748B] mt-1 block font-mono">DHT11 GPIO 32</span>
        </Card>

        {/* Metric 3: Air Humidity */}
        <Card className="p-3.5 bg-[#141C23] border-white/[0.08]">
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-semibold">Air Humidity</span>
            <Droplet className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-cyan-300">
            {formatHumidity(telemetry.humidity)}
          </div>
          <span className="text-[10px] text-[#64748B] mt-1 block font-mono">Comfort: Optimal</span>
        </Card>

        {/* Metric 4: DC Supply Voltage */}
        <Card className="p-3.5 bg-[#141C23] border-white/[0.08]">
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-semibold">DC Rail</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300">
            {formatVoltage(telemetry.voltage)}
          </div>
          <span className="text-[10px] text-[#64748B] mt-1 block font-mono">INA219 0x40</span>
        </Card>

        {/* Metric 5: Active Power Load */}
        <Card className="p-3.5 bg-[#141C23] border-white/[0.08]">
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-semibold">Active Load</span>
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#F8FAFC]">
            {telemetry.power != null ? formatWatts(telemetry.power) : '-- W'}
          </div>
          <span className="text-[10px] text-[#64748B] mt-1 block font-mono">Real-time P = V×I</span>
        </Card>

        {/* Metric 6: Active Relays */}
        <Card className="p-3.5 bg-[#141C23] border-white/[0.08]">
          <div className="flex items-center justify-between text-[#94A3B8] mb-2">
            <span className="text-xs font-semibold">Active Relays</span>
            <ToggleRight className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-emerald-400">{activeDeviceCount}</span>
            <span className="text-xs text-[#64748B] font-mono">/ {devices.length} ON</span>
          </div>
          <span className="text-[10px] text-[#64748B] mt-1 block font-mono">GPIO 14, 25, 26, 27</span>
        </Card>
      </div>

      {/* 4. Quick Actions Panel */}
      <Card className="p-4 sm:p-5 border-white/[0.08] bg-[#141C23]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08] mb-4">
          <div className="flex items-center gap-2.5">
            <Radio className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-[#F8FAFC]">Quick Control & Acoustic Testing</h3>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-[#64748B]">
            <span>Audio Engine:</span>
            <Badge variant={audioDiagnosticStatus === 'PLAYING' ? 'rose' : audioDiagnosticStatus === 'BLOCKED' ? 'amber' : 'emerald'} size="sm">
              {audioDiagnosticStatus}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* Action 1: Master All ON */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirmAllOnModal(true)}
            disabled={isDanger || isClearedPendingReset}
            className="w-full"
          >
            All Relays ON
          </Button>

          {/* Action 2: Master All OFF */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAllDevices(false)}
            className="w-full text-red-300 hover:text-red-200"
          >
            All Relays OFF
          </Button>

          {/* Action 3: TEST SPEAKER (880Hz Chime) */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => playSpeakerTestBeep()}
            disabled={isDanger || isSpeakerTesting}
            isLoading={isSpeakerTesting}
            leftIcon={<Play className="h-3.5 w-3.5 text-emerald-400" />}
            className="w-full"
          >
            TEST SPEAKER
          </Button>

          {/* Action 4: TEST ALARM (960/770Hz Siren) */}
          <Button
            variant={isAlarmTesting ? 'danger' : 'secondary'}
            size="sm"
            onClick={isAlarmTesting ? stopAlarmTest : startAlarmTest}
            disabled={isDanger || isClearedPendingReset}
            leftIcon={isAlarmTesting ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-amber-400" />}
            className="w-full"
          >
            {isAlarmTesting ? `STOP (${alarmTestCountdown}s)` : 'TEST ALARM'}
          </Button>

          {/* Action 5: STOP SOUND */}
          <Button
            variant="secondary"
            size="sm"
            onClick={stopAllTestAudio}
            disabled={!isAnyTestAudioActive}
            leftIcon={<Square className="h-3.5 w-3.5 text-red-400" />}
            className="w-full col-span-2 sm:col-span-1"
          >
            STOP SOUND
          </Button>
        </div>
      </Card>

      {/* Confirmation Modal for All ON from Quick Actions */}
      {confirmAllOnModal && (
        <div className="fixed inset-0 z-50 bg-[#0B0F12]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="rounded-2xl max-w-md w-full p-6 border border-amber-500/40 shadow-2xl animate-slide-up bg-[#141C23]">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-base text-[#F8FAFC]">Energize All Relay Channels?</h3>
            </div>
            <p className="text-xs text-[#94A3B8] mb-4 leading-relaxed">
              This will command all active-LOW controllable relays (Light, Fan, and Water Motor) to turn ON. Life-safety interlocks remain active and will automatically inhibit execution if combustible gas hazard is detected.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmAllOnModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setAllDevices(true);
                  setConfirmAllOnModal(false);
                }}
              >
                Confirm All ON
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Master 4-Channel Relay Control Bar */}
      <MasterControl />

      {/* 6. 4 Dedicated Device Relay Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-[#F8FAFC]">ESP32 4-Channel Relays</h2>
            <Badge variant={hardwareBridge.esp32Connected ? 'emerald' : 'demo'} size="sm">
              {hardwareBridge.esp32Connected ? 'Hardware Active' : 'Demo Emulation'}
            </Badge>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {devices.map(device => (
            <DeviceCard key={device.id} device={device} onToggle={toggleDevice} />
          ))}
        </div>
      </div>

      {/* 7. System Health Panel */}
      <Card className="p-5 border-white/[0.08] bg-[#141C23]">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-[#F8FAFC]">System Health & Telemetry Status</h3>
          </div>
          <Badge variant="emerald" size="sm">Ground-Truth Live Watchdog</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Row 1: ESP32 Hardware */}
          <div className="p-3 rounded-xl bg-[#111820] border border-white/[0.06] flex items-center justify-between">
            <div>
              <span className="text-[#64748B] block text-[10px] uppercase font-mono">Microcontroller</span>
              <span className="font-semibold text-[#F8FAFC]">ESP32 DevKit (30-pin)</span>
            </div>
            <Badge variant={hardwareBridge.esp32Connected ? 'emerald' : 'slate'} size="sm">
              {hardwareBridge.esp32Connected ? 'CONNECTED' : 'OFFLINE'}
            </Badge>
          </div>

          {/* Row 2: Gas Safety */}
          <div className="p-3 rounded-xl bg-[#111820] border border-white/[0.06] flex items-center justify-between">
            <div>
              <span className="text-[#64748B] block text-[10px] uppercase font-mono">Safety Interlock</span>
              <span className="font-semibold text-[#F8FAFC]">MQ-2 Watchdog</span>
            </div>
            <Badge variant={isDanger ? 'rose' : isWarning || isClearedPendingReset ? 'amber' : isOffline ? 'slate' : 'emerald'} size="sm">
              {gasSafetyState.lockoutStatus}
            </Badge>
          </div>

          {/* Row 3: Acoustic Siren Engine */}
          <div className="p-3 rounded-xl bg-[#111820] border border-white/[0.06] flex items-center justify-between">
            <div>
              <span className="text-[#64748B] block text-[10px] uppercase font-mono">Siren Synthesizer</span>
              <span className="font-semibold text-[#F8FAFC]">Web Audio API</span>
            </div>
            <Badge variant={audioDiagnosticStatus === 'PLAYING' ? 'rose' : audioDiagnosticStatus === 'BLOCKED' ? 'amber' : 'emerald'} size="sm">
              {audioDiagnosticStatus}
            </Badge>
          </div>

          {/* Row 4: Power Intelligence */}
          <div className="p-3 rounded-xl bg-[#111820] border border-white/[0.06] flex items-center justify-between">
            <div>
              <span className="text-[#64748B] block text-[10px] uppercase font-mono">Power Monitor</span>
              <span className="font-semibold text-[#F8FAFC]">INA219 I2C 0x40</span>
            </div>
            <Badge variant={telemetry.voltage != null ? 'emerald' : 'slate'} size="sm">
              {telemetry.voltage != null ? 'STREAMING' : 'NO SENSOR'}
            </Badge>
          </div>
        </div>
      </Card>

      {/* 8. MQ-2 Gas & Smoke Safety Hub */}
      <GasSensorCard telemetry={telemetry} />

      {/* 9. INA219 Live Energy Monitoring Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-[#F8FAFC]">INA219 Live Energy & Power Monitoring</h2>
            <Badge variant="emerald" size="sm">I2C 0x40 Active</Badge>
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

      {/* 10. Live Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TemperatureChart data={hourlyData} />
        <ElectricalChart data={hourlyData} />
      </div>

      {/* 11. Active Alerts Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-400" />
            <h2 className="text-lg font-bold text-[#F8FAFC]">Recent Alerts & Logs</h2>
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
            View All Logs
          </Button>
        </div>

        <div className="space-y-3">
          {alerts.length === 0 ? (
            <Card className="p-4 text-center border-dashed border-white/[0.08] text-[#94A3B8] text-sm bg-[#141C23]">
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

      {/* 12. HomeX AI Assistant Quick Banner */}
      <Card 
        interactive 
        onClick={() => setCurrentPage('voice')}
        className="bg-gradient-to-r from-emerald-950/25 via-[#141C23] to-[#111820] border-emerald-500/30 p-5 flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-glow-emerald shrink-0">
            <Mic className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-[#F8FAFC] flex items-center gap-2">
              <span>HomeX AI Voice Assistant Ready</span>
              <Badge variant="emerald" size="sm">Speech Recognition Active</Badge>
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Control Light, Fan, Water Motor & Exhaust Fan or query DHT11/MQ-2 metrics with natural voice commands.
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

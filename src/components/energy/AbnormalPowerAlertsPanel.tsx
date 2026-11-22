import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Zap, 
  Activity, 
  CheckCircle2, 
  Flame, 
  Radio 
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { useSmartHome } from '../../hooks/useSmartHome';

export const AbnormalPowerAlertsPanel: React.FC = () => {
  const { telemetry, triggerPowerAnomaly, alerts, acknowledgeAlert } = useSmartHome();
  const [activeTest, setActiveTest] = useState<string | null>(null);

  const powerAlerts = alerts.filter(a => a.type === 'abnormal_power');

  const handleTest = (type: 'overcurrent' | 'voltage_sag' | 'voltage_surge' | 'overpower') => {
    setActiveTest(type);
    triggerPowerAnomaly(type);
    setTimeout(() => setActiveTest(null), 1200);
  };

  const isCurrentAnomalous = telemetry.current != null && telemetry.current > 5.0;
  const isVoltageAnomalous = telemetry.voltage != null && (telemetry.voltage < 215 || telemetry.voltage > 245);
  const isPowerAnomalous = telemetry.power != null && telemetry.power > 1000;

  return (
    <Card className="p-4 sm:p-5 border-rose-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-100">Abnormal Power Consumption & Anomaly Guards</h3>
              <Badge variant={isCurrentAnomalous || isVoltageAnomalous || isPowerAnomalous ? 'rose' : 'emerald'} size="sm">
                {isCurrentAnomalous || isVoltageAnomalous || isPowerAnomalous ? 'ANOMALY DETECTED' : 'ALL GUARDS ACTIVE'}
              </Badge>
              {!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true' && (
                <Badge variant="demo" size="sm">DEMO SIMULATION</Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Continuous 12-bit ADC threshold comparator watching shunt resistor & bus rail
            </p>
          </div>
        </div>
      </div>

      {/* Safety Monitors Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {/* Guard 1: Overcurrent Limit */}
        <div className={`p-3 rounded-xl border transition-all ${
          isCurrentAnomalous 
            ? 'bg-rose-950/30 border-rose-500/60 shadow-glow-danger' 
            : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className={`h-3.5 w-3.5 ${isCurrentAnomalous ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
              Overcurrent Guard
            </span>
            <Badge variant={isCurrentAnomalous ? 'rose' : 'teal'} size="sm">
              {isCurrentAnomalous ? 'TRIPPED' : '5.0A Ceiling'}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {isCurrentAnomalous 
              ? `Current at ${telemetry.current}A exceeds 5.0A safe continuous limit!`
              : `Current load: ${telemetry.current}A. Motor startup inrush monitored.`}
          </p>
        </div>

        {/* Guard 2: Voltage Bounds Guard */}
        <div className={`p-3 rounded-xl border transition-all ${
          isVoltageAnomalous 
            ? 'bg-rose-950/30 border-rose-500/60 shadow-glow-danger' 
            : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Activity className={`h-3.5 w-3.5 ${isVoltageAnomalous ? 'text-rose-400 animate-pulse' : 'text-cyan-400'}`} />
              Voltage Window Guard
            </span>
            <Badge variant={isVoltageAnomalous ? 'rose' : 'teal'} size="sm">
              {isVoltageAnomalous ? 'OUT OF BOUNDS' : '215V - 245V'}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {isVoltageAnomalous
              ? `Voltage at ${telemetry.voltage}V outside safe grid envelope!`
              : `Mains at ${telemetry.voltage}V. Grid brownouts and transient surges filtered.`}
          </p>
        </div>

        {/* Guard 3: Overpower Ceiling */}
        <div className={`p-3 rounded-xl border transition-all ${
          isPowerAnomalous 
            ? 'bg-rose-950/30 border-rose-500/60 shadow-glow-danger' 
            : 'bg-slate-950/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Flame className={`h-3.5 w-3.5 ${isPowerAnomalous ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
              Overpower Thermal Guard
            </span>
            <Badge variant={isPowerAnomalous ? 'rose' : 'teal'} size="sm">
              {isPowerAnomalous ? 'OVERHEAT RISK' : '1000W Max'}
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {isPowerAnomalous
              ? `Active power at ${telemetry.power}W exceeds 1000W thermal dissipation!`
              : `Current active draw: ${telemetry.power != null ? `${telemetry.power}W.` : '-- W.'}`}
          </p>
        </div>
      </div>

      {/* Interactive Anomaly Test Runner (Development & Demo only) */}
      {!import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true' && (
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-4">
          <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
            <span className="text-xs font-semibold text-slate-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-cyan-400" />
              Interactive Hardware Anomaly Simulator (Demo Testing)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Dispatches simulated INA219 sensor faults
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="glass"
              size="sm"
              onClick={() => handleTest('overcurrent')}
              isLoading={activeTest === 'overcurrent'}
              className="text-xs border-amber-500/30 hover:bg-amber-500/10 text-amber-300"
            >
              ⚡ Test Overcurrent (5.85A)
            </Button>

            <Button
              variant="glass"
              size="sm"
              onClick={() => handleTest('overpower')}
              isLoading={activeTest === 'overpower'}
              className="text-xs border-rose-500/30 hover:bg-rose-500/10 text-rose-300"
            >
              🔥 Test Overpower (1380W)
            </Button>

            <Button
              variant="glass"
              size="sm"
              onClick={() => handleTest('voltage_sag')}
              isLoading={activeTest === 'voltage_sag'}
              className="text-xs border-blue-500/30 hover:bg-blue-500/10 text-blue-300"
            >
              📉 Test Voltage Sag (198V)
            </Button>

            <Button
              variant="glass"
              size="sm"
              onClick={() => handleTest('voltage_surge')}
              isLoading={activeTest === 'voltage_surge'}
              className="text-xs border-purple-500/30 hover:bg-purple-500/10 text-purple-300"
            >
              📈 Test Voltage Surge (254V)
            </Button>
          </div>
        </div>
      )}

      {/* Recent Anomaly Log */}
      {powerAlerts.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-mono text-slate-400 uppercase font-semibold block">
            Recent Power Anomaly Incidents ({powerAlerts.length})
          </span>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {powerAlerts.slice(0, 3).map(a => (
              <div 
                key={a.id} 
                className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <span className="font-bold text-amber-400 block">{a.title}</span>
                  <span className="text-[11px] text-slate-400">{a.description}</span>
                </div>
                {!a.acknowledged ? (
                  <button
                    onClick={() => acknowledgeAlert(a.id)}
                    className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px] cursor-pointer"
                  >
                    Ack
                  </button>
                ) : (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Logged
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

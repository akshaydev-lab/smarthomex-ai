import React, { useState } from 'react';
import { 
  Zap, 
  Activity, 
  Gauge, 
  Receipt, 
  Clock, 
  Settings2, 
  Check, 
  X,
  ShieldCheck
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { useSmartHome } from '../../hooks/useSmartHome';

export const INA219MetricsCards: React.FC = () => {
  const { telemetry, tariffRate, setTariffRate } = useSmartHome();
  const [isEditingTariff, setIsEditingTariff] = useState<boolean>(false);
  const [tempTariff, setTempTariff] = useState<string>(tariffRate.toFixed(2));

  const handleSaveTariff = () => {
    const val = parseFloat(tempTariff);
    if (!isNaN(val) && val > 0) {
      setTariffRate(val);
      setIsEditingTariff(false);
    }
  };

  // Bus Voltage status
  const getVoltageStatus = (v?: number | null) => {
    if (v == null || isNaN(v)) return { text: 'FAULT / NO DATA', color: 'slate' as const, note: 'INA219 Disconnected' };
    if (v < 215) return { text: 'VOLTAGE SAG', color: 'rose' as const, note: 'Under-voltage alert' };
    if (v > 245) return { text: 'VOLTAGE SURGE', color: 'rose' as const, note: 'Over-voltage transient' };
    return { text: 'GRID STABLE', color: 'cyan' as const, note: 'Nominal 220-240V AC' };
  };

  const vStatus = getVoltageStatus(telemetry.voltage);

  // Current status
  const getCurrentStatus = (a?: number | null) => {
    if (a == null || isNaN(a)) return { text: 'DISCONNECTED', color: 'slate' as const };
    if (a > 5.0) return { text: 'OVERLOAD DANGER', color: 'rose' as const };
    if (a > 3.0) return { text: 'HIGH LOAD', color: 'amber' as const };
    return { text: 'BALANCED', color: 'emerald' as const };
  };

  const cStatus = getCurrentStatus(telemetry.current);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Bus Voltage Card */}
      <Card className="p-4 relative overflow-hidden border-cyan-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            Bus Voltage
          </span>
          <Badge variant={vStatus.color} size="sm">{vStatus.text}</Badge>
        </div>

        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-3xl font-bold font-mono text-cyan-300">
            {telemetry.voltage != null && !isNaN(telemetry.voltage) ? telemetry.voltage.toFixed(1) : '--'}
          </span>
          <span className="text-sm font-mono text-slate-400">V</span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400">Shunt Drop:</span>
          <span className="text-cyan-400 font-semibold">
            {telemetry.shuntVoltageMv != null && !isNaN(telemetry.shuntVoltageMv) ? `${telemetry.shuntVoltageMv.toFixed(1)} mV` : '-- mV'}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>INA219 I2C 0x40</span>
          <span>{vStatus.note}</span>
        </div>
      </Card>

      {/* 2. Current Monitoring Card */}
      <Card className="p-4 relative overflow-hidden border-amber-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-amber-400" />
            Live Current
          </span>
          <Badge variant={cStatus.color} size="sm">{cStatus.text}</Badge>
        </div>

        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-3xl font-bold font-mono text-amber-300">
            {telemetry.current != null && !isNaN(telemetry.current) ? telemetry.current.toFixed(2) : '--'}
          </span>
          <span className="text-sm font-mono text-slate-400">A</span>
          <span className="text-xs font-mono text-slate-500 ml-1">
            ({telemetry.currentMa != null && !isNaN(telemetry.currentMa) ? telemetry.currentMa : '--'} mA)
          </span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400">Shunt Resistor:</span>
          <span className="text-amber-400 font-semibold">0.100 Ω (1%)</span>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Rated Continuous: 3.2A</span>
          <span>Peak: 5.0A</span>
        </div>
      </Card>

      {/* 3. Live Active Power Card */}
      <Card className="p-4 relative overflow-hidden border-teal-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-teal-400" />
            Active Power
          </span>
          <Badge variant="teal" size="sm">P = V × I</Badge>
        </div>

        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-3xl font-bold font-mono text-teal-300">
            {telemetry.power != null && !isNaN(telemetry.power) ? telemetry.power : '--'}
          </span>
          <span className="text-sm font-mono text-slate-400">W</span>
          <span className="text-xs font-mono text-slate-500 ml-1">
            ({telemetry.powerMw != null && !isNaN(telemetry.powerMw) ? `${(telemetry.powerMw / 1000).toFixed(0)}k mW` : '--'})
          </span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400">Standby Floor:</span>
          <span className="text-slate-300 font-semibold">12 W (ESP32)</span>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Thermal Load: Normal</span>
          <span className="text-teal-400 flex items-center gap-0.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400 animate-ping" />
            Live Actuating
          </span>
        </div>
      </Card>

      {/* 4. Energy Consumption Card (Wh & kWh) */}
      <Card className="p-4 relative overflow-hidden border-cyan-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            Energy Accumulated
          </span>
          <Badge variant="cyan" size="sm">∫ P dt</Badge>
        </div>

        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-3xl font-bold font-mono text-cyan-300">
            {telemetry.energyTodayKWh != null && !isNaN(telemetry.energyTodayKWh) ? telemetry.energyTodayKWh.toFixed(3) : '--'}
          </span>
          <span className="text-sm font-mono text-slate-400">kWh</span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400">Precision Wh:</span>
          <span className="text-cyan-400 font-semibold">
            {telemetry.energyWh != null && !isNaN(telemetry.energyWh) ? `${telemetry.energyWh.toFixed(1)} Wh` : '-- Wh'}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Actual Elapsed Time</span>
          <span className="text-emerald-400 flex items-center gap-0.5">
            <ShieldCheck className="h-3 w-3" /> Anti-Double Count
          </span>
        </div>
      </Card>

      {/* 5. Electricity Bill Estimation Card */}
      <Card className="p-4 relative overflow-hidden border-emerald-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950/90">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-emerald-400" />
            Electricity Bill
          </span>
          {!isEditingTariff ? (
            <button
              onClick={() => setIsEditingTariff(true)}
              className="text-[10px] text-slate-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700 transition-colors"
              title="Configure tariff per kWh"
            >
              <Settings2 className="h-3 w-3" />
              {telemetry.currencySymbol}{tariffRate}/kWh
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={tempTariff}
                onChange={e => setTempTariff(e.target.value)}
                className="w-14 px-1 py-0.5 text-xs bg-slate-900 border border-emerald-500 rounded text-slate-100 font-mono text-right"
              />
              <button
                onClick={handleSaveTariff}
                className="p-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/40 cursor-pointer"
                title="Save"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={() => setIsEditingTariff(false)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:bg-slate-700 cursor-pointer"
                title="Cancel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-2xl font-bold font-mono text-emerald-300">
            {telemetry.currencySymbol}{telemetry.estimatedBillToday != null && !isNaN(telemetry.estimatedBillToday) ? telemetry.estimatedBillToday.toFixed(2) : '--'}
          </span>
          <span className="text-xs font-mono text-slate-400">/ today</span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span className="text-slate-400">Monthly Proj.:</span>
          <span className="text-emerald-400 font-semibold">
            {telemetry.currencySymbol}{telemetry.estimatedBillMonth != null && !isNaN(telemetry.estimatedBillMonth) ? telemetry.estimatedBillMonth.toFixed(2) : '--'}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Tier 1 Domestic</span>
          <span>Rate: {telemetry.currencySymbol}{tariffRate.toFixed(2)}/kWh</span>
        </div>
      </Card>
    </div>
  );
};

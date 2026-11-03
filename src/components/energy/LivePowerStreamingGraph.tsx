import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Zap, Cpu } from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { useSmartHome } from '../../hooks/useSmartHome';

export const LivePowerStreamingGraph: React.FC = () => {
  const { ina219Readings, telemetry } = useSmartHome();

  const validPowerReadings = ina219Readings.filter(r => r.powerW != null);
  const peakPower = validPowerReadings.length > 0 
    ? validPowerReadings.reduce((max, r) => Math.max(max, r.powerW!), 0) 
    : null;
  const minPower = validPowerReadings.length > 0 
    ? validPowerReadings.reduce((min, r) => Math.min(min, r.powerW!), 9999) 
    : null;
  const avgPower = validPowerReadings.length > 0 
    ? Math.round(validPowerReadings.reduce((sum, r) => sum + r.powerW!, 0) / validPowerReadings.length)
    : null;

  const hasDemoReadings = ina219Readings.some(r => r.isDemo);

  return (
    <Card className="p-4 sm:p-5 border-cyan-500/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-teal-400/20 border border-cyan-500/30 text-cyan-400 shadow-glow-cyan">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-100">Live Power Consumption Stream</h3>
              <Badge variant="teal" size="sm" className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-teal-400 animate-ping" />
                Live 4s Sampling
              </Badge>
              {hasDemoReadings && (
                <Badge variant="demo" size="sm">DEMO DATA</Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Instantaneous active load P = V_bus × I from INA219 (I2C 0x40)
            </p>
          </div>
        </div>

        {/* Live Quick Stats Strip */}
        <div className="flex items-center gap-3 bg-slate-900/80 p-2 rounded-xl border border-slate-800 text-xs font-mono">
          <div>
            <span className="text-[10px] text-slate-400 block">Peak Load</span>
            <span className="font-bold text-amber-400">{peakPower != null ? `${peakPower} W` : '--'}</span>
          </div>
          <div className="h-6 w-px bg-slate-800" />
          <div>
            <span className="text-[10px] text-slate-400 block">Min Standby</span>
            <span className="font-bold text-slate-300">
              {minPower != null ? `${minPower === 9999 ? 0 : minPower} W` : '--'}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-800" />
          <div>
            <span className="text-[10px] text-slate-400 block">Average</span>
            <span className="font-bold text-cyan-300">{avgPower != null ? `${avgPower} W` : '--'}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full relative">
        {ina219Readings.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
            <Zap className="h-8 w-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No telemetry readings available</p>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Waiting for live sensor data from ESP32 node
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ina219Readings} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="powerStreamGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis 
                dataKey="timeLabel" 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis 
                stroke="#64748b" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                domain={['auto', 'auto']}
                unit="W"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-xl glass-panel p-3 border border-cyan-500/30 text-xs shadow-2xl">
                        <p className="font-mono text-slate-400 mb-1 flex items-center justify-between gap-4">
                          <span>Sample Time:</span>
                          <span className="text-slate-200">{label}</span>
                        </p>
                        <div className="space-y-1 font-mono">
                          <p className="font-bold text-cyan-300 flex items-center justify-between gap-4">
                            <span>Active Power:</span>
                            <span>{data.powerW != null ? `${data.powerW} W` : '--'}</span>
                          </p>
                          <p className="text-amber-400 flex items-center justify-between gap-4">
                            <span>Current Draw:</span>
                            <span>{data.currentA != null ? `${data.currentA} A` : '--'} ({data.currentMa != null ? `${data.currentMa} mA` : '--'})</span>
                          </p>
                          <p className="text-slate-300 flex items-center justify-between gap-4">
                            <span>Bus Voltage:</span>
                            <span>{data.busVoltageV != null ? `${data.busVoltageV} V` : '--'}</span>
                          </p>
                          <p className="text-slate-400 text-[10px] flex items-center justify-between gap-4 pt-1 border-t border-slate-800">
                            <span>Shunt Drop:</span>
                            <span>{data.shuntVoltageMv != null ? `${data.shuntVoltageMv} mV` : '--'}</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="powerW" 
                stroke="#06b6d4" 
                strokeWidth={2.5} 
                fillOpacity={1} 
                fill="url(#powerStreamGradient)" 
                dot={{ fill: '#06b6d4', r: 2 }}
                activeDot={{ r: 5, stroke: '#22d3ee', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-slate-300">
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
            ESP32 ADC Calibration: ±0.1% Full Scale
          </span>
          <span className="hidden sm:inline text-slate-600">•</span>
          <span className="hidden sm:inline">Bus Range: 0-26V DC / 0-250V via Isolated Divider</span>
        </div>
        <span className="text-teal-400 font-semibold">
          Active Load: {telemetry.power != null ? `${telemetry.power} W` : '-- W'}
        </span>
      </div>
    </Card>
  );
};

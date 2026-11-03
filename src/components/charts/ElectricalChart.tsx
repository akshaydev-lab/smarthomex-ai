import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { EnergyHourlyData } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Zap } from 'lucide-react';

export const ElectricalChart: React.FC<{ data: EnergyHourlyData[] }> = ({ data }) => {
  const isDemoMode = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">INA219 Voltage & Current Telemetry</h3>
            <p className="text-[11px] text-slate-400 font-mono">I2C Address: 0x40 (SDA 21 / SCL 22)</p>
          </div>
        </div>
        {isDemoMode && <Badge variant="demo" size="sm">Sample Metrics</Badge>}
      </div>

      <div className="h-72 w-full">
        {!data || data.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-slate-400 text-xs font-mono">
            <Zap className="h-8 w-8 text-slate-600 mb-2" />
            <p className="font-semibold text-slate-300">No electrical telemetry history available</p>
            <p className="text-[10px] text-slate-500 mt-1">Awaiting live sensor readings from ESP32 INA219</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#64748b" 
                fontSize={11} 
                tickLine={false} 
                axisLine={{ stroke: '#334155' }}
              />
              {/* Left Axis: Voltage */}
              <YAxis 
                yAxisId="left" 
                stroke="#06b6d4" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                domain={[225, 238]}
                unit="V"
              />
              {/* Right Axis: Current */}
              <YAxis 
                yAxisId="right" 
                orientation="right" 
                stroke="#f59e0b" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                domain={[0, 5]}
                unit="A"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-xl glass-panel p-3 border border-cyan-500/30 text-xs shadow-2xl">
                        <p className="font-mono text-slate-400 mb-1.5">{label}</p>
                        <div className="space-y-1">
                          <p className="font-mono font-bold text-cyan-300 flex items-center justify-between gap-4">
                            <span>Voltage (V):</span>
                            <span>{payload[0].value} V</span>
                          </p>
                          <p className="font-mono font-bold text-amber-400 flex items-center justify-between gap-4">
                            <span>Current (A):</span>
                            <span>{payload[1].value} A</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '10px' }}
                formatter={(value) => <span className="text-xs font-mono text-slate-300">{value}</span>}
              />
              <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="voltage" 
                name="Voltage (V)" 
                stroke="#06b6d4" 
                strokeWidth={2.5} 
                dot={{ fill: '#06b6d4', r: 3 }} 
                activeDot={{ r: 5, stroke: '#22d3ee', strokeWidth: 2 }}
              />
              <Line 
                yAxisId="right" 
                type="monotone" 
                dataKey="current" 
                name="Current (A)" 
                stroke="#f59e0b" 
                strokeWidth={2.5} 
                dot={{ fill: '#f59e0b', r: 3 }}
                activeDot={{ r: 5, stroke: '#fbbf24', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};

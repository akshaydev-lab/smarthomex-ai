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
import { EnergyHourlyData } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Droplet } from 'lucide-react';

export const HumidityChart: React.FC<{ data: EnergyHourlyData[] }> = ({ data }) => {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Droplet className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Relative Humidity History</h3>
            <p className="text-[11px] text-slate-400 font-mono">DHT11 Sensor (GPIO 4)</p>
          </div>
        </div>
        <Badge variant="demo" size="sm">Sample 24h Telemetry</Badge>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="humGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              fontSize={11} 
              tickLine={false} 
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={11} 
              tickLine={false} 
              axisLine={false}
              domain={[30, 80]}
              unit="%"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-xl glass-panel p-2.5 border border-blue-500/30 text-xs shadow-xl">
                      <p className="font-mono text-slate-400">{label}</p>
                      <p className="font-mono font-bold text-blue-300 mt-1">
                        Humidity: {payload[0].value}%
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area 
              type="monotone" 
              dataKey="humidity" 
              stroke="#3b82f6" 
              strokeWidth={2.5}
              fillOpacity={1} 
              fill="url(#humGradient)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

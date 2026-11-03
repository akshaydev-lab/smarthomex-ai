import React, { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { EnergyDailyData, EnergyWeeklyData } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { BarChart3, TrendingDown, DollarSign } from 'lucide-react';

export const EnergyChart: React.FC<{
  dailyData: EnergyDailyData[];
  weeklyData: EnergyWeeklyData[];
}> = ({ dailyData, weeklyData }) => {
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');

  const totalDailyKwh = dailyData.reduce((sum, d) => sum + d.kwh, 0);
  const totalCost = dailyData.reduce((sum, d) => sum + d.costEstimate, 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-100">Energy Consumption Analytics</h3>
              <Badge variant="demo" size="sm">Sample Billing Data</Badge>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Cumulative kWh & tariff cost estimates calculated from INA219 load integrator
            </p>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setViewMode('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === 'daily'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Daily (7 Days)
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === 'weekly'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Weekly (4 Weeks)
          </button>
        </div>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-mono block">7-Day Total Energy</span>
          <span className="text-lg font-bold font-mono text-cyan-300">
            {totalDailyKwh.toFixed(2)} kWh
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-mono block flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-emerald-400" /> Est. Cost ($0.15/kWh)
          </span>
          <span className="text-lg font-bold font-mono text-emerald-400">
            ${totalCost.toFixed(2)}
          </span>
        </div>
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 col-span-2 sm:col-span-1">
          <span className="text-[11px] text-slate-400 font-mono block flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-teal-400" /> Eco Mode Savings
          </span>
          <span className="text-lg font-bold font-mono text-teal-300">
            -18.4% vs Baseline
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'daily' ? (
            <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis 
                dataKey="day" 
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
                unit=" kWh"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as EnergyDailyData;
                    return (
                      <div className="rounded-xl glass-panel p-3 border border-cyan-500/30 text-xs shadow-2xl">
                        <p className="font-mono text-slate-400 mb-1">{label}</p>
                        <p className="font-mono font-bold text-cyan-300">
                          Consumption: {item.kwh} kWh
                        </p>
                        <p className="font-mono text-emerald-400 mt-0.5">
                          Cost: ${item.costEstimate.toFixed(2)}
                        </p>
                        <p className="font-mono text-amber-400 mt-0.5">
                          Peak Load: {item.peakWatts} W
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="kwh" 
                name="Daily kWh" 
                fill="url(#barGradient)" 
                radius={[6, 6, 0, 0]} 
              />
            </BarChart>
          ) : (
            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="weekGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="targetGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#64748b" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#334155" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis 
                dataKey="week" 
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
                unit=" kWh"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as EnergyWeeklyData;
                    return (
                      <div className="rounded-xl glass-panel p-3 border border-teal-500/30 text-xs shadow-2xl">
                        <p className="font-mono text-slate-400 mb-1">{label}</p>
                        <p className="font-mono font-bold text-teal-300">
                          Actual: {item.kwh} kWh
                        </p>
                        <p className="font-mono text-slate-400">
                          Target Budget: {item.targetKwh} kWh
                        </p>
                        <p className="font-mono text-emerald-400 font-semibold mt-1">
                          Efficiency Gain: +{item.savingsPercent}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '8px' }}
                formatter={(val) => <span className="text-xs font-mono text-slate-300">{val}</span>}
              />
              <Bar dataKey="kwh" name="Actual kWh" fill="url(#weekGradient)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="targetKwh" name="Target Budget kWh" fill="url(#targetGradient)" radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

import React, { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { BarChart3, TrendingDown, DollarSign } from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { useSmartHome } from '../../hooks/useSmartHome';
import { EnergyDailyData, EnergyWeeklyData, EnergyMonthlyData } from '../../types';

export const INA219UsageReportsChart: React.FC<{
  dailyData: EnergyDailyData[];
  weeklyData: EnergyWeeklyData[];
  monthlyData: EnergyMonthlyData[];
}> = ({ dailyData, weeklyData, monthlyData }) => {
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const { tariffRate, telemetry } = useSmartHome();

  const totalDailyKwh = dailyData.reduce((sum, d) => sum + d.kwh, 0);
  const totalDailyCost = totalDailyKwh * tariffRate;

  const totalWeeklyKwh = weeklyData.reduce((sum, d) => sum + d.kwh, 0);
  const totalWeeklyCost = totalWeeklyKwh * tariffRate;

  const totalMonthlyKwh = monthlyData.reduce((sum, d) => sum + d.kwh, 0);
  const totalMonthlyCost = totalMonthlyKwh * tariffRate;

  const currentKwh = viewMode === 'daily' 
    ? totalDailyKwh 
    : viewMode === 'weekly' 
    ? totalWeeklyKwh 
    : totalMonthlyKwh;

  const currentCost = viewMode === 'daily' 
    ? totalDailyCost 
    : viewMode === 'weekly' 
    ? totalWeeklyCost 
    : totalMonthlyCost;

  return (
    <Card className="p-4 sm:p-5 border-cyan-500/20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-100">Daily, Weekly & Monthly Energy Reports</h3>
              <Badge variant="demo" size="sm">DEMO DATA</Badge>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Accumulated kWh & tariff billing reports computed from INA219 sensor integration
            </p>
          </div>
        </div>

        {/* View Mode Switcher (Daily, Weekly, Monthly) */}
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
          <button
            onClick={() => setViewMode('monthly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              viewMode === 'monthly'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Monthly (12 Months)
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-mono block">
            {viewMode === 'daily' ? '7-Day Total' : viewMode === 'weekly' ? '4-Week Total' : 'Annual Total'}
          </span>
          <span className="text-lg font-bold font-mono text-cyan-300">
            {currentKwh.toFixed(1)} kWh
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-mono block flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-emerald-400" /> Bill @ {telemetry.currencySymbol}{tariffRate}/kWh
          </span>
          <span className="text-lg font-bold font-mono text-emerald-400">
            {telemetry.currencySymbol}{currentCost.toFixed(2)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-mono block">Daily Avg. Load</span>
          <span className="text-lg font-bold font-mono text-slate-200">
            {viewMode === 'daily' 
              ? (totalDailyKwh / 7).toFixed(2) 
              : viewMode === 'weekly' 
              ? (totalWeeklyKwh / 28).toFixed(2) 
              : (totalMonthlyKwh / 365).toFixed(2)} kWh/day
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
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
                <linearGradient id="dailyBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#334155' }} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} unit=" kWh" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const kwh = Number(payload[0].value);
                    const cost = kwh * tariffRate;
                    return (
                      <div className="rounded-xl glass-panel p-3 border border-cyan-500/30 text-xs shadow-2xl">
                        <p className="font-mono font-bold text-slate-200 mb-1">{label}</p>
                        <p className="font-mono text-cyan-300 font-bold">Energy: {kwh} kWh</p>
                        <p className="font-mono text-emerald-400">Est. Bill: {telemetry.currencySymbol}{cost.toFixed(2)}</p>
                        <p className="font-mono text-slate-400 text-[10px] mt-1">Peak Load: {payload[0].payload.peakWatts} W</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="kwh" name="Energy (kWh)" fill="url(#dailyBarGradient)" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : viewMode === 'weekly' ? (
            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="weeklyBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#0f766e" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="week" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#334155' }} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} unit=" kWh" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-xl glass-panel p-3 border border-teal-500/30 text-xs shadow-2xl">
                        <p className="font-mono font-bold text-slate-200 mb-1">{label}</p>
                        <p className="font-mono text-teal-300 font-bold">Actual: {data.kwh} kWh</p>
                        <p className="font-mono text-slate-400">Budget Target: {data.targetKwh} kWh</p>
                        <p className="font-mono text-emerald-400 mt-1">Savings: -{data.savingsPercent}%</p>
                        <p className="font-mono text-slate-300 text-[10px]">Est. Cost: {telemetry.currencySymbol}{(data.kwh * tariffRate).toFixed(2)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="kwh" name="Energy (kWh)" fill="url(#weeklyBarGradient)" radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : (
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="monthlyBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: '#334155' }} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} unit=" kWh" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-xl glass-panel p-3 border border-sky-500/30 text-xs shadow-2xl">
                        <p className="font-mono font-bold text-slate-200 mb-1">{label}</p>
                        <p className="font-mono text-sky-300 font-bold">Monthly: {data.kwh} kWh</p>
                        <p className="font-mono text-emerald-400">Bill: {telemetry.currencySymbol}{(data.kwh * tariffRate).toFixed(2)}</p>
                        <p className="font-mono text-slate-400 text-[10px] mt-1">Avg: {data.avgDailyKwh} kWh/day | Peak: {data.peakWatts} W</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="kwh" name="Energy (kWh)" fill="url(#monthlyBarGradient)" radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

import React from 'react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';

export interface SensorGaugeProps {
  title: string;
  value?: string | number | null;
  unit: string;
  sensorModel: string;
  pinInfo: string;
  icon: React.ReactNode;
  min: number;
  max: number;
  currentValue?: number | null;
  accentColor?: 'cyan' | 'teal' | 'blue' | 'amber' | 'rose' | 'emerald';
  statusText?: string;
  subtitle?: string;
  isRealHardware?: boolean;
}

export const SensorGauge: React.FC<SensorGaugeProps> = ({
  title,
  value,
  unit,
  sensorModel,
  pinInfo,
  icon,
  min,
  max,
  currentValue,
  accentColor = 'cyan',
  statusText,
  subtitle,
  isRealHardware,
}) => {
  // Compute percentage clamped between 0 and 100 with NaN and division by zero protection
  const safeCurrent = typeof currentValue === 'number' && !isNaN(currentValue) ? currentValue : min;
  const range = max - min || 1;
  const percentage = Math.min(100, Math.max(0, ((safeCurrent - min) / range) * 100));

  const colorMap = {
    cyan: {
      bar: 'from-cyan-500 to-teal-400',
      glow: 'shadow-glow-cyan',
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bg: 'bg-cyan-500/10',
    },
    teal: {
      bar: 'from-teal-500 to-emerald-400',
      glow: 'shadow-glow-teal',
      text: 'text-teal-400',
      border: 'border-teal-500/30',
      bg: 'bg-teal-500/10',
    },
    blue: {
      bar: 'from-blue-500 to-cyan-400',
      glow: 'shadow-glow-blue',
      text: 'text-blue-400',
      border: 'border-blue-500/30',
      bg: 'bg-blue-500/10',
    },
    amber: {
      bar: 'from-amber-500 to-yellow-400',
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
    },
    rose: {
      bar: 'from-rose-500 to-red-400',
      glow: 'shadow-glow-danger',
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      bg: 'bg-rose-500/10',
    },
    emerald: {
      bar: 'from-emerald-500 to-teal-400',
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
    },
  };

  const theme = colorMap[accentColor];

  return (
    <Card className="hover:border-cyan-500/30">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`p-2.5 rounded-xl ${theme.bg} ${theme.border} border ${theme.text}`}>
            {icon}
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-300 block">{title}</span>
            <span className="text-[10px] font-mono text-slate-400 block">{sensorModel} • {pinInfo}</span>
          </div>
        </div>
        <Badge variant={isRealHardware ? 'emerald' : 'demo'} size="sm">
          {isRealHardware ? 'ESP32 Real' : 'Demo'}
        </Badge>
      </div>

      {/* Primary Value Display */}
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-100">
          {value !== undefined && value !== null && !Number.isNaN(value) ? value : '--'}
        </span>
        <span className={`text-base font-bold font-mono ${theme.text}`}>
          {unit}
        </span>
      </div>

      {/* Progress Bar Gauge */}
      <div className="mt-3">
        <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
          <span>{min} {unit}</span>
          <span className="text-slate-300 font-medium">{statusText || `${percentage.toFixed(0)}% Range`}</span>
          <span>{max} {unit}</span>
        </div>
        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${theme.bar} transition-all duration-500 ease-out`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {subtitle && (
        <p className="mt-3 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
          {subtitle}
        </p>
      )}
    </Card>
  );
};

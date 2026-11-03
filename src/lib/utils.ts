import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatWatts(watts?: number | null): string {
  if (watts == null || isNaN(watts)) return '-- W';
  if (watts >= 1000) {
    return `${(watts / 1000).toFixed(2)} kW`;
  }
  return `${Math.round(watts)} W`;
}

export function formatTemperature(celsius?: number | null): string {
  if (celsius == null || isNaN(celsius)) return '-- °C';
  return `${celsius.toFixed(1)}°C`;
}

export function formatHumidity(percent?: number | null): string {
  if (percent == null || isNaN(percent)) return '-- %';
  return `${Math.round(percent)}%`;
}

export function formatVoltage(volts?: number | null): string {
  if (volts == null || isNaN(volts)) return '-- V';
  return `${volts.toFixed(1)} V`;
}

export function formatCurrent(amperes?: number | null): string {
  if (amperes == null || isNaN(amperes)) return '-- A';
  return `${amperes.toFixed(2)} A`;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function getGasStatusColor(status?: 'safe' | 'warning' | 'danger' | 'warming_up' | 'sensor_fault' | string): {
  bg: string;
  text: string;
  border: string;
  glow: string;
} {
  switch (status) {
    case 'danger':
      return {
        bg: 'bg-rose-500/10',
        text: 'text-rose-400',
        border: 'border-rose-500/30',
        glow: 'shadow-glow-danger',
      };
    case 'warning':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]',
      };
    case 'sensor_fault':
      return {
        bg: 'bg-rose-950/20',
        text: 'text-rose-400',
        border: 'border-rose-500/40',
        glow: 'shadow-[0_0_15px_rgba(244,63,94,0.25)]',
      };
    case 'warming_up':
      return {
        bg: 'bg-amber-950/20',
        text: 'text-amber-300',
        border: 'border-amber-500/30',
        glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]',
      };
    case 'safe':
    default:
      return {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
        glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]',
      };
  }
}

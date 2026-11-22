import React from 'react';
import { 
  Clock, 
  Lightbulb, 
  Fan, 
  Droplets, 
  Wind, 
  Calendar, 
  Edit3, 
  Trash2, 
  Play, 
  Repeat, 
  Power,
  MapPin,
  Cpu
} from 'lucide-react';
import type { DeviceSchedule, Device } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { formatTimeIST, getNextExecutionDisplay } from '../../services/scheduleService';

export interface ScheduleCardProps {
  schedule: DeviceSchedule;
  device?: Device;
  onEdit: (schedule: DeviceSchedule) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onExecuteNow: (id: string) => void;
}

export const ScheduleCard: React.FC<ScheduleCardProps> = ({
  schedule,
  device,
  onEdit,
  onDelete,
  onToggle,
  onExecuteNow,
}) => {
  const getDeviceIcon = () => {
    switch (device?.type) {
      case 'light':
        return <Lightbulb className="h-5 w-5 text-amber-300" />;
      case 'fan':
        return <Fan className="h-5 w-5 text-cyan-300" />;
      case 'motor':
        return <Droplets className="h-5 w-5 text-blue-400" />;
      case 'exhaust_fan':
        return <Wind className="h-5 w-5 text-teal-300" />;
      default:
        return <Power className="h-5 w-5 text-slate-400" />;
    }
  };

  const nextExecution = getNextExecutionDisplay(schedule);
  const isTurnOn = schedule.action === 'ON';

  const allWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <Card className={`transition-all duration-300 ${
      schedule.enabled 
        ? 'border-cyan-500/25 bg-gradient-to-br from-slate-900/90 to-slate-950' 
        : 'border-slate-800/80 bg-slate-950/60 opacity-75'
    }`}>
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${
            schedule.enabled
              ? isTurnOn 
                ? 'bg-emerald-500/15 border-emerald-500/30' 
                : 'bg-rose-500/15 border-rose-500/30'
              : 'bg-slate-850 border-slate-700'
          }`}>
            {getDeviceIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-slate-100">{schedule.name}</h4>
              <Badge
                variant={isTurnOn ? 'emerald' : 'slate'}
                size="sm"
                pulse={schedule.enabled && isTurnOn}
              >
                {schedule.action === 'ON' ? 'TURN ON' : 'TURN OFF'}
              </Badge>
              <Badge variant="demo" size="sm">Demo IST</Badge>
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
              <span className="font-medium text-slate-300">{device?.name || 'Assigned Device'}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-cyan-400" />
                {device?.room || 'Living Area'}
              </span>
            </div>
          </div>
        </div>

        {/* Enable / Disable Toggle Switch */}
        <button
          onClick={() => onToggle(schedule.id)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out mt-1 ${
            schedule.enabled
              ? 'bg-cyan-500 border-cyan-400'
              : 'bg-slate-800 border-slate-700'
          }`}
          role="switch"
          aria-checked={schedule.enabled}
          aria-label={`Toggle schedule ${schedule.name}`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow-md ring-0 transition duration-200 ease-in-out mt-0.5 ${
              schedule.enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Time & Recurrence Info Box */}
      <div className="mt-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-[11px] font-mono text-slate-400 block mb-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3 text-cyan-400" /> Scheduled Time (IST)
          </span>
          <span className="text-base font-extrabold font-mono text-cyan-300">
            {formatTimeIST(schedule.scheduledTime)}
          </span>
          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
            Repeat: <strong className="capitalize text-slate-300">{schedule.repeatType}</strong>
          </span>
        </div>

        <div>
          <span className="text-[11px] font-mono text-slate-400 block mb-0.5 flex items-center gap-1">
            <Calendar className="h-3 w-3 text-teal-400" /> Next Execution (IST)
          </span>
          <span className={`text-xs font-mono font-bold block mt-1 ${
            schedule.enabled ? 'text-teal-300' : 'text-slate-400'
          }`}>
            {nextExecution}
          </span>
          {schedule.lastExecutedAt && (
            <span className="text-[10px] font-mono text-slate-400 block mt-0.5 truncate">
              Last: {schedule.lastExecutedAt.split('(')[0]}
            </span>
          )}
        </div>
      </div>

      {/* Weekday Indicator Pills */}
      {schedule.repeatType !== 'once' && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-slate-400 mr-1 flex items-center gap-1">
            <Repeat className="h-3 w-3" /> Days:
          </span>
          {allWeekdays.map((day) => {
            const isDayActive = schedule.repeatDays?.includes(day as any);
            return (
              <span
                key={day}
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  isDayActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-900/40 text-slate-600 border border-slate-800/40'
                }`}
              >
                {day}
              </span>
            );
          })}
        </div>
      )}

      {/* Bottom Action Toolbar */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          <Cpu className="h-3 w-3 text-cyan-400" />
          <span>Relay Ch {device?.relayChannel || 1} (GPIO {device?.gpioPin || 16})</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Test Run Button */}
          <button
            onClick={() => onExecuteNow(schedule.id)}
            className="px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 font-medium transition-colors cursor-pointer text-[11px]"
            title="Execute schedule action now in demo mode"
          >
            <Play className="h-3 w-3" />
            <span>Test Run</span>
          </button>

          {/* Edit Button */}
          <button
            onClick={() => onEdit(schedule)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Edit Schedule"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>

          {/* Delete Button */}
          <button
            onClick={() => onDelete(schedule.id)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Delete Schedule"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
};

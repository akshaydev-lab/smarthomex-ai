import React from 'react';
import { 
  Calendar, 
  Clock, 
  Lightbulb, 
  Fan, 
  Droplets, 
  Wind, 
  Power 
} from 'lucide-react';
import type { DeviceSchedule, Device, WeekdayShort } from '../../types';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { 
  ALL_WEEKDAYS, 
  getCurrentIST 
} from '../../services/scheduleService';

export const CalendarScheduleOverview: React.FC<{
  schedules: DeviceSchedule[];
  devices: Device[];
  onSelectSchedule: (schedule: DeviceSchedule) => void;
}> = ({ schedules, devices, onSelectSchedule }) => {
  const currentIST = getCurrentIST();

  const getDeviceIcon = (deviceId: string) => {
    const dev = devices.find(d => d.id === deviceId);
    switch (dev?.type) {
      case 'light': return <Lightbulb className="h-3.5 w-3.5 text-amber-300" />;
      case 'fan': return <Fan className="h-3.5 w-3.5 text-cyan-300" />;
      case 'motor': return <Droplets className="h-3.5 w-3.5 text-blue-400" />;
      case 'exhaust_fan': return <Wind className="h-3.5 w-3.5 text-teal-300" />;
      default: return <Power className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  // Group schedules by weekday
  const getSchedulesForDay = (day: WeekdayShort) => {
    return schedules
      .filter(s => {
        if (!s.enabled) return false;
        if (s.repeatType === 'daily') return true;
        if (s.repeatType === 'once') {
          // If once, check if the date falls on this day
          return true; // Shown for completeness
        }
        return s.repeatDays?.includes(day);
      })
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  };

  return (
    <Card className="p-4 sm:p-5 border-cyan-500/25 bg-gradient-to-br from-slate-900/90 to-slate-950">
      {/* Calendar Header with live IST Clock */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-100">
                Weekly Schedule Calendar Timeline
              </h3>
              <Badge variant="teal" size="sm">IST Timeline</Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live scheduled trigger events mapped across the 7-day operational cycle
            </p>
          </div>
        </div>

        {/* Live IST Clock Badge */}
        <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono">
          <Clock className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
          <span className="text-slate-400">Current IST:</span>
          <span className="text-cyan-300 font-bold">{currentIST.formattedDisplay}</span>
        </div>
      </div>

      {/* 7 Days Columns Grid */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {ALL_WEEKDAYS.map(day => {
          const isToday = currentIST.dayOfWeek === day;
          const daySchedules = getSchedulesForDay(day);

          return (
            <div
              key={day}
              className={`rounded-2xl p-2.5 flex flex-col border transition-all ${
                isToday
                  ? 'bg-gradient-to-b from-cyan-950/40 via-slate-900/90 to-slate-950 border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/30'
                  : 'bg-slate-950/60 border-slate-800/80'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
                <span className={`text-xs font-mono font-bold uppercase ${
                  isToday ? 'text-cyan-300' : 'text-slate-400'
                }`}>
                  {day}
                </span>
                {isToday && (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    TODAY
                  </span>
                )}
              </div>

              {/* Day Events */}
              <div className="space-y-1.5 flex-1 min-h-[90px]">
                {daySchedules.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[10px] text-slate-400 font-mono italic">
                    No runs
                  </div>
                ) : (
                  daySchedules.map(sched => {
                    const isTurnOn = sched.action === 'ON';
                    return (
                      <div
                        key={sched.id}
                        onClick={() => onSelectSchedule(sched)}
                        className={`p-1.5 rounded-xl border text-[11px] cursor-pointer hover:scale-[1.02] transition-all group ${
                          isTurnOn
                            ? 'bg-emerald-950/25 border-emerald-500/30 hover:border-emerald-400/60'
                            : 'bg-rose-950/25 border-rose-500/30 hover:border-rose-400/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-mono font-bold text-slate-200 text-[10px]">
                            {sched.scheduledTime}
                          </span>
                          <span className={`text-[9px] font-mono font-extrabold px-1 rounded ${
                            isTurnOn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {sched.action}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                          {getDeviceIcon(sched.deviceId)}
                          <span className="truncate group-hover:text-cyan-300 transition-colors">
                            {sched.name}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

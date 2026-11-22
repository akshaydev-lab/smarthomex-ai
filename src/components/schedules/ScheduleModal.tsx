import React, { useState, useEffect } from 'react';
import { 
  X, 
  CalendarClock, 
  Save, 
  Clock, 
  Calendar 
} from 'lucide-react';
import type { DeviceSchedule, ScheduleRepeatType, WeekdayShort, Device } from '../../types';
import { Button } from '../common/Button';
import { 
  ALL_WEEKDAYS, 
  WEEKDAYS_ONLY, 
  WEEKENDS_ONLY, 
  formatTimeIST, 
  getCurrentIST 
} from '../../services/scheduleService';

export interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (scheduleData: Omit<DeviceSchedule, 'id' | 'createdAt' | 'status'>) => void;
  editingSchedule?: DeviceSchedule | null;
  devices: Device[];
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingSchedule,
  devices,
}) => {
  const currentIST = getCurrentIST();

  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState(devices[0]?.id || 'relay-1');
  const [action, setAction] = useState<'ON' | 'OFF'>('ON');
  const [scheduledTime, setScheduledTime] = useState('07:00');
  const [scheduledDate, setScheduledDate] = useState(currentIST.dateStr);
  const [repeatType, setRepeatType] = useState<ScheduleRepeatType>('daily');
  const [repeatDays, setRepeatDays] = useState<WeekdayShort[]>([...ALL_WEEKDAYS]);
  const [enabled, setEnabled] = useState(true);

  // Load editing schedule data if supplied
  useEffect(() => {
    if (editingSchedule) {
      setName(editingSchedule.name);
      setDeviceId(editingSchedule.deviceId);
      setAction(editingSchedule.action);
      setScheduledTime(editingSchedule.scheduledTime);
      setScheduledDate(editingSchedule.scheduledDate || currentIST.dateStr);
      setRepeatType(editingSchedule.repeatType);
      setRepeatDays(editingSchedule.repeatDays || [...ALL_WEEKDAYS]);
      setEnabled(editingSchedule.enabled);
    } else {
      // Defaults for new schedule
      setName('');
      setDeviceId(devices[0]?.id || 'relay-1');
      setAction('ON');
      setScheduledTime('07:00');
      setScheduledDate(currentIST.dateStr);
      setRepeatType('daily');
      setRepeatDays([...ALL_WEEKDAYS]);
      setEnabled(true);
    }
  }, [editingSchedule, devices, isOpen, currentIST.dateStr]);

  // Adjust days automatically based on repeatType
  const handleRepeatTypeChange = (type: ScheduleRepeatType) => {
    setRepeatType(type);
    if (type === 'daily') {
      setRepeatDays([...ALL_WEEKDAYS]);
    } else if (type === 'weekdays') {
      setRepeatDays([...WEEKDAYS_ONLY]);
    } else if (type === 'weekends') {
      setRepeatDays([...WEEKENDS_ONLY]);
    } else if (type === 'once') {
      setRepeatDays([]);
    }
  };

  const toggleDay = (day: WeekdayShort) => {
    setRepeatType('custom');
    if (repeatDays.includes(day)) {
      setRepeatDays(repeatDays.filter(d => d !== day));
    } else {
      setRepeatDays([...repeatDays, day]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      deviceId,
      action,
      scheduledTime,
      scheduledDate: repeatType === 'once' ? scheduledDate : undefined,
      repeatType,
      repeatDays: repeatType === 'once' ? [] : repeatDays,
      enabled,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
      <div className="glass-panel rounded-3xl max-w-xl w-full p-5 sm:p-7 border border-cyan-500/30 shadow-2xl my-auto text-slate-100 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-100">
                {editingSchedule ? 'Edit Device Schedule' : 'Create New Device Schedule'}
              </h3>
              <p className="text-xs text-slate-400">Timezone: Asia/Kolkata (IST)</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          {/* Schedule Name */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Schedule Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning Water Pump Fill, Evening Porch Light"
              className="glass-input w-full px-3.5 py-2.5 rounded-xl text-slate-100 text-xs font-medium"
            />
          </div>

          {/* Device Selection & Action Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Select Target Device
              </label>
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="glass-input w-full px-3.5 py-2.5 rounded-xl text-slate-100 bg-slate-900 text-xs font-medium"
              >
                {devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.room} - Ch {d.relayChannel})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Target Action
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAction('ON')}
                  className={`py-2 px-3 rounded-xl font-bold transition-all border cursor-pointer ${
                    action === 'ON'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  TURN ON
                </button>
                <button
                  type="button"
                  onClick={() => setAction('OFF')}
                  className={`py-2 px-3 rounded-xl font-bold transition-all border cursor-pointer ${
                    action === 'OFF'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  TURN OFF
                </button>
              </div>
            </div>
          </div>

          {/* Start Time & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                <span>Start Time (IST)</span>
                <span className="text-cyan-400 font-mono text-[11px] font-bold">
                  {formatTimeIST(scheduledTime)}
                </span>
              </label>
              <div className="relative">
                <Clock className="h-4 w-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="time"
                  required
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="glass-input w-full pl-9 pr-3 py-2.5 rounded-xl text-slate-100 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Date (For One-Time Run)
              </label>
              <div className="relative">
                <Calendar className="h-4 w-4 text-teal-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  disabled={repeatType !== 'once'}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="glass-input w-full pl-9 pr-3 py-2.5 rounded-xl text-slate-100 font-mono text-xs disabled:opacity-40"
                />
              </div>
            </div>
          </div>

          {/* Repeat Frequency */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Repeat Frequency
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'daily', label: 'Daily' },
                { id: 'weekdays', label: 'Weekdays' },
                { id: 'weekends', label: 'Weekends' },
                { id: 'custom', label: 'Custom' },
                { id: 'once', label: 'Once' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleRepeatTypeChange(opt.id as ScheduleRepeatType)}
                  className={`py-2 px-2 rounded-xl text-center font-medium transition-all border text-xs cursor-pointer ${
                    repeatType === opt.id
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Weekday Selection Chips (if not Once) */}
          {repeatType !== 'once' && (
            <div>
              <label className="block text-slate-400 font-medium mb-1.5 flex items-center justify-between">
                <span>Select Specific Days of Week</span>
                <span className="text-[11px] text-cyan-400 font-mono">
                  {repeatDays.length} of 7 Selected
                </span>
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {ALL_WEEKDAYS.map(day => {
                  const isSelected = repeatDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`flex-1 py-1.5 px-2 rounded-xl text-center text-xs font-mono font-bold transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400 shadow-glow-cyan'
                          : 'bg-slate-900/40 text-slate-500 border-slate-800 hover:text-slate-300'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Enable / Disable Checkbox */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-200 block">Enable Schedule</span>
              <span className="text-[11px] text-slate-400">
                Immediately arms this schedule for automated execution in IST
              </span>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              leftIcon={<Save className="h-4 w-4" />}
            >
              {editingSchedule ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

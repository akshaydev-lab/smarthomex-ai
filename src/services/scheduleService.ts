import type { DeviceSchedule, WeekdayShort, NextScheduledActionInfo } from '../types';

export const TIMEZONE_IST = 'Asia/Kolkata';

export const ALL_WEEKDAYS: WeekdayShort[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const WEEKDAYS_ONLY: WeekdayShort[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const WEEKENDS_ONLY: WeekdayShort[] = ['Sat', 'Sun'];

export const INITIAL_SCHEDULES: DeviceSchedule[] = [
  {
    id: 'sched-1',
    name: 'Morning Water Pump Automation',
    deviceId: 'relay-3', // Water Booster Motor
    action: 'ON',
    scheduledTime: '06:30',
    repeatType: 'daily',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true,
    lastExecutedAt: 'Today at 06:30 AM IST',
    createdAt: '2026-10-25T10:00:00Z',
    status: 'upcoming',
  },
  {
    id: 'sched-2',
    name: 'Dry-Run Motor Auto Cut-off',
    deviceId: 'relay-3', // Water Booster Motor
    action: 'OFF',
    scheduledTime: '07:00',
    repeatType: 'daily',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true,
    lastExecutedAt: 'Today at 07:00 AM IST',
    createdAt: '2026-10-25T10:05:00Z',
    status: 'upcoming',
  },
  {
    id: 'sched-3',
    name: 'Evening Living Room Lighting',
    deviceId: 'relay-1', // Light
    action: 'ON',
    scheduledTime: '18:45',
    repeatType: 'weekdays',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    enabled: true,
    lastExecutedAt: 'Yesterday at 06:45 PM IST',
    createdAt: '2026-10-26T12:00:00Z',
    status: 'upcoming',
  },
  {
    id: 'sched-4',
    name: 'Night Eco Standby Power-Down',
    deviceId: 'relay-1', // Light
    action: 'OFF',
    scheduledTime: '23:30',
    repeatType: 'daily',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: true,
    createdAt: '2026-10-27T14:30:00Z',
    status: 'upcoming',
  },
  {
    id: 'sched-5',
    name: 'Kitchen Post-Cooking Ventilation',
    deviceId: 'relay-4', // Exhaust Fan
    action: 'ON',
    scheduledTime: '21:00',
    repeatType: 'daily',
    repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    enabled: false,
    createdAt: '2026-10-28T09:15:00Z',
    status: 'disabled',
  },
];

/**
 * Returns current timestamp details specifically formatted in Asia/Kolkata (IST)
 */
export function getCurrentIST() {
  const now = new Date();
  
  // Format time in 24-hr HH:MM in Asia/Kolkata
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  // Format date YYYY-MM-DD in Asia/Kolkata
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Short day name in Asia/Kolkata (Mon, Tue, etc.)
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE_IST,
    weekday: 'short',
  });

  const fullDisplayFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: TIMEZONE_IST,
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return {
    timeStr: timeFormatter.format(now),
    dateStr: dateFormatter.format(now),
    dayOfWeek: dayFormatter.format(now) as WeekdayShort,
    formattedDisplay: fullDisplayFormatter.format(now) + ' IST',
  };
}

/**
 * Formats a 24-hr "HH:MM" string into friendly 12-hr format with AM/PM IST
 */
export function formatTimeIST(time24: string): string {
  if (!time24) return '';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  
  const hourNum = parseInt(parts[0], 10);
  const minute = parts[1];
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const hour12 = hourNum % 12 || 12;
  const padHour = hour12 < 10 ? `0${hour12}` : `${hour12}`;
  
  return `${padHour}:${minute} ${ampm} IST`;
}

/**
 * Calculates human-readable next execution time in IST
 */
export function getNextExecutionDisplay(schedule: DeviceSchedule): string {
  if (!schedule.enabled) {
    return 'Disabled';
  }

  const { timeStr, dateStr, dayOfWeek } = getCurrentIST();

  if (schedule.repeatType === 'once') {
    if (schedule.scheduledDate) {
      if (schedule.scheduledDate < dateStr || (schedule.scheduledDate === dateStr && schedule.scheduledTime <= timeStr)) {
        return 'Execution Completed';
      }
      return `${schedule.scheduledDate} at ${formatTimeIST(schedule.scheduledTime)}`;
    }
    return `Today at ${formatTimeIST(schedule.scheduledTime)}`;
  }

  if (schedule.repeatType === 'daily') {
    if (schedule.scheduledTime > timeStr) {
      return `Today at ${formatTimeIST(schedule.scheduledTime)}`;
    }
    return `Tomorrow at ${formatTimeIST(schedule.scheduledTime)}`;
  }

  // Weekdays / Weekends / Custom
  const applicableDays = schedule.repeatDays || [];
  if (applicableDays.length === 0) return 'No days selected';

  if (applicableDays.includes(dayOfWeek) && schedule.scheduledTime > timeStr) {
    return `Today at ${formatTimeIST(schedule.scheduledTime)}`;
  }

  // Find next upcoming day
  const order: WeekdayShort[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayIdx = order.indexOf(dayOfWeek);

  for (let i = 1; i <= 7; i++) {
    const nextDay = order[(todayIdx + i) % 7];
    if (applicableDays.includes(nextDay)) {
      const dayLabel = i === 1 ? 'Tomorrow' : nextDay;
      return `${dayLabel} at ${formatTimeIST(schedule.scheduledTime)}`;
    }
  }

  return `Next run: ${formatTimeIST(schedule.scheduledTime)}`;
}

/**
 * Checks if schedule should execute at current moment (idempotent, prevents duplicate runs within same minute)
 */
export function checkScheduleDue(
  schedule: DeviceSchedule,
  currentIST: { timeStr: string; dateStr: string; dayOfWeek: WeekdayShort }
): boolean {
  if (!schedule.enabled) return false;

  // Exact minute match
  if (schedule.scheduledTime !== currentIST.timeStr) {
    return false;
  }

  // Prevent duplicate execution within the exact same minute/date
  const executionKey = `${currentIST.dateStr}_${currentIST.timeStr}`;
  if (schedule.lastExecutedAt?.includes(executionKey)) {
    return false;
  }

  // Check Repeat Type conditions
  if (schedule.repeatType === 'once') {
    if (schedule.scheduledDate && schedule.scheduledDate !== currentIST.dateStr) {
      return false;
    }
    return true;
  }

  if (schedule.repeatType === 'daily') {
    return true;
  }

  if (schedule.repeatDays && schedule.repeatDays.includes(currentIST.dayOfWeek)) {
    return true;
  }

  return false;
}

/**
 * Calculates the next upcoming scheduled action for a given device ID
 */
export function getNextScheduledActionForDevice(
  deviceId: string,
  schedules: DeviceSchedule[]
): NextScheduledActionInfo | null {
  const activeSchedules = schedules.filter(s => s.deviceId === deviceId && s.enabled);
  if (activeSchedules.length === 0) return null;

  let soonestSched: DeviceSchedule | null = null;
  let soonestDisplayText = '';

  for (const sched of activeSchedules) {
    const display = getNextExecutionDisplay(sched);
    if (display && display !== 'Disabled' && display !== 'Execution Completed') {
      if (!soonestSched) {
        soonestSched = sched;
        soonestDisplayText = display;
      } else if (display.startsWith('Today') && !soonestDisplayText.startsWith('Today')) {
        soonestSched = sched;
        soonestDisplayText = display;
      }
    }
  }

  if (!soonestSched) return null;

  return {
    action: soonestSched.action,
    timeIST: soonestDisplayText,
    scheduleName: soonestSched.name,
    scheduleId: soonestSched.id,
  };
}

/**
 * Supabase PostgreSQL DDL migration string for Phase 2 backend integration
 */
export const SUPABASE_SCHEDULES_TABLE_SQL = `-- SmartHomeX AI Schedules Table Definition
-- Compatible with Supabase PostgreSQL & Row Level Security (RLS)

CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('ON', 'OFF')),
  scheduled_time TIME NOT NULL,
  scheduled_date DATE,
  repeat_type TEXT NOT NULL CHECK (repeat_type IN ('once', 'daily', 'weekdays', 'weekends', 'custom')),
  repeat_days TEXT[] DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for rapid schedule resolution
CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON public.schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled_time ON public.schedules(enabled, scheduled_time);

-- Row Level Security (RLS)
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own device schedules"
  ON public.schedules
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Dedicated backend pg_cron or Supabase Edge Function execution
-- Real hardware commands dispatch via MQTT to ESP32 without relying on browser tabs.
`;

import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient';
import type { Device, DeviceSchedule, SystemAlert, INA219Reading } from '../types';

// ==============================================================================
// SmartHomeX AI - Supabase Database Synchronization Service
// Safe fallback to local/demo memory when backend credentials are not set
// ==============================================================================

export interface UserProfileRecord {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl?: string;
  updatedAt?: string;
}

/**
 * Fetch the user's primary home_id from Supabase.
 * Required for inserts into sensor_readings and alerts (home_id NOT NULL).
 */
export async function fetchUserHomeId(userId: string): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('homes')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Supabase fetchUserHomeId error:', error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (err) {
    console.error('Failed to fetch home_id from Supabase:', err);
    return null;
  }
}

/**
 * Fetch the authenticated user's profile from Supabase
 */
export async function fetchUserProfile(userId: string): Promise<UserProfileRecord | null> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Supabase fetchUserProfile error:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      email: data.email,
      fullName: data.full_name || '',
      role: data.role || 'IoT Administrator',
      avatarUrl: data.avatar_url || undefined,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    console.error('Failed to query Supabase user profile:', err);
    return null;
  }
}

/**
 * Update authenticated user's profile in Supabase
 */
export async function updateUserProfile(
  userId: string,
  updates: { fullName?: string; avatarUrl?: string }
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return false;

  try {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.fullName !== undefined) payload.full_name = updates.fullName;
    if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;

    const { error } = await client
      .from('profiles')
      .update(payload)
      .eq('id', userId);

    if (error) {
      console.warn('Supabase updateUserProfile error:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Failed to update Supabase user profile:', err);
    return false;
  }
}

/**
 * Fetch all registered devices for the current user
 */
export async function fetchDevicesFromSupabase(userId: string): Promise<Device[] | null> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('devices')
      .select('*')
      .eq('user_id', userId)
      .order('relay_channel', { ascending: true });

    if (error) {
      console.warn('Supabase fetchDevices error:', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    return data.map(row => ({
      id: row.device_slug,
      name: row.name,
      type: row.type,
      relayChannel: row.relay_channel,
      gpioPin: row.gpio_pin,
      state: row.state,
      room: row.room,
      powerWatts: Number(row.power_watts || 0),
      ratedWatts: Number(row.rated_watts || 45),
      lastToggled: 'Just now',
      isHardwareConnected: row.is_hardware_connected,
      controlMode: row.control_mode,
      manualOverrideActive: row.manual_override_active,
      maxRuntimeMinutes: row.max_runtime_minutes || undefined,
      activeRuntimeSeconds: row.active_runtime_seconds || 0,
    }));
  } catch (err) {
    console.error('Failed to query Supabase devices:', err);
    return null;
  }
}

/**
 * Record a dispatched device command in the Supabase audit table
 */
export async function logDeviceCommandToSupabase(params: {
  userId: string;
  deviceId: string;
  action: 'ON' | 'OFF';
  source: 'manual' | 'schedule' | 'master' | 'safety_override' | 'ai_voice';
  status: 'pending' | 'acknowledged' | 'failed' | 'timeout' | 'rejected_gas_safety';
  nonce: string;
  errorMessage?: string;
  roundTripMs?: number;
}) {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data: deviceRecord } = await client
      .from('devices')
      .select('id')
      .eq('user_id', params.userId)
      .eq('device_slug', params.deviceId)
      .maybeSingle();

    if (!deviceRecord) return null;

    const { data, error } = await client
      .from('device_commands')
      .insert({
        user_id: params.userId,
        device_id: deviceRecord.id,
        action: params.action,
        source: params.source,
        status: params.status,
        error_message: params.errorMessage || null,
        round_trip_ms: params.roundTripMs || null,
        nonce: params.nonce,
        auth_token_signature: `shx_${params.nonce}_hmac`,
        acknowledged_at: params.status === 'acknowledged' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      console.warn('Error inserting command to Supabase:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.warn('Supabase device command insert skipped:', err);
    return null;
  }
}

/**
 * Fetch user schedules from Supabase
 */
export async function fetchSchedulesFromSupabase(userId: string): Promise<DeviceSchedule[] | null> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('device_schedules')
      .select('*, devices(device_slug)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetchSchedules error:', error.message);
      return null;
    }

    if (!data) return null;

    return data.map(row => ({
      id: row.id,
      name: row.name,
      deviceId: row.devices?.device_slug || 'relay-1',
      action: row.action,
      scheduledTime: row.scheduled_time.substring(0, 5), // HH:MM
      scheduledDate: row.scheduled_date || undefined,
      repeatType: row.repeat_type,
      repeatDays: row.repeat_days || [],
      enabled: row.enabled,
      lastExecutedAt: row.last_executed_at || undefined,
      createdAt: row.created_at,
      status: row.status,
    }));
  } catch (err) {
    console.error('Failed to fetch schedules from Supabase:', err);
    return null;
  }
}

/**
 * Save or update a schedule in Supabase
 */
export async function saveScheduleToSupabase(userId: string, sched: DeviceSchedule) {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data: deviceRecord } = await client
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .eq('device_slug', sched.deviceId)
      .maybeSingle();

    if (!deviceRecord) return null;

    const payload = {
      user_id: userId,
      device_id: deviceRecord.id,
      name: sched.name,
      action: sched.action,
      scheduled_time: sched.scheduledTime,
      scheduled_date: sched.scheduledDate || null,
      repeat_type: sched.repeatType,
      repeat_days: sched.repeatDays,
      enabled: sched.enabled,
      status: sched.status,
    };

    const { data, error } = await client
      .from('device_schedules')
      .upsert({ ...payload, id: sched.id })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Failed to save schedule to Supabase:', err);
    return null;
  }
}

/**
 * Delete a schedule from Supabase
 */
export async function deleteScheduleFromSupabase(scheduleId: string) {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { error } = await client
      .from('device_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Failed to delete schedule in Supabase:', err);
    return false;
  }
}

/**
 * Stream an INA219 energy telemetry reading to Supabase.
 * BUG 9 FIX: sensor_readings.home_id is NOT NULL — fetch it before insert.
 */
export async function insertSensorTelemetryToSupabase(userId: string, reading: INA219Reading) {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    // Resolve home_id — required by NOT NULL schema constraint
    const homeId = await fetchUserHomeId(userId);
    if (!homeId) {
      console.warn('insertSensorTelemetryToSupabase: no home found for user, insert skipped.');
      return false;
    }

    const { error } = await client
      .from('sensor_readings')
      .insert({
        user_id: userId,
        home_id: homeId,
        bus_voltage_v: reading.busVoltageV,
        shunt_voltage_mv: reading.shuntVoltageMv,
        current_ma: reading.currentMa,
        current_a: reading.currentA,
        power_w: reading.powerW,
        energy_wh: reading.energyWh,
        anomaly: reading.anomaly || 'normal',
        is_demo: reading.isDemo,
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Telemetry insert skipped:', err);
    return false;
  }
}

/**
 * Record a critical incident alert in Supabase.
 * BUG 10 FIX: alerts.home_id is NOT NULL — fetch it before insert.
 */
export async function insertAlertToSupabase(userId: string, alert: SystemAlert) {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    // Resolve home_id — required by NOT NULL schema constraint
    const homeId = await fetchUserHomeId(userId);
    if (!homeId) {
      console.warn('insertAlertToSupabase: no home found for user, insert skipped.');
      return false;
    }

    const { error } = await client
      .from('alerts')
      .insert({
        user_id: userId,
        home_id: homeId,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        source: alert.source,
        action_taken: alert.actionTaken,
        gas_ppm: alert.gasPpm || null,
        room: alert.room || null,
        evacuation_advised: alert.evacuationAdvised || false,
        acknowledged: alert.acknowledged,
        is_demo: alert.isDemo,
      });

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Alert insert to Supabase skipped:', err);
    return false;
  }
}

/**
 * Fetch the latest real sensor telemetry from Supabase.
 */
export async function fetchLatestSensorTelemetry(userId: string) {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('sensor_readings')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('fetchLatestSensorTelemetry error:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Failed to query Supabase sensor_readings:', err);
    return null;
  }
}

/**
 * Fetch the latest device status / heartbeat for the ESP32 controller.
 */
export async function fetchLatestDeviceStatus(userId: string) {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('device_status')
      .select('*, devices(device_slug, relay_channel)')
      .eq('user_id', userId)
      .order('last_heartbeat', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('fetchLatestDeviceStatus error:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Failed to query Supabase device_status:', err);
    return null;
  }
}

/**
 * Fetch the latest real alerts from the Supabase alerts table for the authenticated user.
 */
export async function fetchAlertsFromSupabase(
  userId: string,
  limit: number = 50
): Promise<SystemAlert[] | null> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('fetchAlertsFromSupabase error:', error.message);
      return null;
    }

    if (!data || data.length === 0) return [];

    return data.map(row => {
      const createdAt = row.created_at || new Date().toISOString();
      const formattedTimestamp =
        new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', Today';

      return {
        id: String(row.id),
        deviceId: row.device_id || undefined,
        type: row.type || 'gas_leak',
        severity: row.severity || 'warning',
        emergencyStatus: row.severity === 'danger' ? 'CRITICAL' : 'NORMAL',
        category: row.severity === 'danger' ? 'critical' : 'device',
        title: row.title || 'System Alert',
        description: row.description || '',
        sensorReading: row.gas_ppm != null ? `${row.gas_ppm} PPM` : undefined,
        timestamp: formattedTimestamp,
        isDemo: Boolean(row.is_demo ?? false),
        acknowledged: Boolean(row.acknowledged ?? false),
        source: row.source || 'ESP32 Hardware Node',
        actionTaken: row.action_taken || undefined,
        gasPpm: row.gas_ppm != null ? Number(row.gas_ppm) : undefined,
        room: row.room || undefined,
        evacuationAdvised: Boolean(row.evacuation_advised ?? false),
      };
    });
  } catch (err) {
    console.error('Failed to query Supabase alerts:', err);
    return null;
  }
}

/**
 * Fetch the latest 20-30 real sensor_readings records for chart history.
 * Preserves null values for disconnected sensors and orders chronologically (oldest -> newest).
 */
export async function fetchRecentSensorTelemetry(
  userId: string,
  limit: number = 30
): Promise<INA219Reading[] | null> {
  const client = getSupabaseClient();
  if (!client || !isSupabaseConfigured) return null;

  try {
    const { data, error } = await client
      .from('sensor_readings')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('fetchRecentSensorTelemetry error:', error.message);
      return null;
    }

    if (!data || data.length === 0) return [];

    const readings: INA219Reading[] = data
      .map(row => {
        const recTime = row.recorded_at || new Date().toISOString();
        const timeLabel = new Date(recTime).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        const pWatts = row.power_w != null ? Number(row.power_w) : null;
        const eWh = row.energy_wh != null ? Number(row.energy_wh) : null;

        return {
          id: String(row.id),
          timestamp: recTime,
          timeLabel,
          busVoltageV: row.bus_voltage_v != null ? Number(row.bus_voltage_v) : null,
          shuntVoltageMv: row.shunt_voltage_mv != null ? Number(row.shunt_voltage_mv) : null,
          currentMa: row.current_ma != null ? Number(row.current_ma) : null,
          currentA: row.current_a != null ? Number(row.current_a) : null,
          powerW: pWatts,
          powerMw: pWatts != null ? pWatts * 1000 : null,
          energyWh: eWh,
          energyKWh: eWh != null ? Number((eWh / 1000).toFixed(3)) : null,
          isDemo: Boolean(row.is_demo ?? false),
          anomaly: (row.anomaly as INA219Reading['anomaly']) || 'normal',
        };
      })
      .reverse();

    return readings;
  } catch (err) {
    console.error('Failed to query Supabase recent sensor_readings:', err);
    return null;
  }
}

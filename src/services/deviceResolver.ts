import type { SupabaseClient } from '@supabase/supabase-js';
import type { Device } from '../types';

/**
 * Validates whether a given string is a valid UUID (v1-v5).
 * Prevents PostgreSQL 22P02 "invalid input syntax for type uuid" errors
 * by ensuring non-UUID values (e.g. 'motor', 'light', 'relay-1') are never
 * passed to database UUID equality filters.
 */
export function isUuid(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

/**
 * Evaluates whether a hardware command must be inhibited due to life-safety gas emergency.
 *
 * CRITICAL SAFETY REQUIREMENTS:
 * 1. Real hardware gas danger (gasStatus = 'danger') or active real lockout strictly blocks relay energization.
 * 2. Demo alerts / simulated lockout (isSimulatedLockout = true) must NEVER activate the physical hardware interlock.
 * 3. De-energizing relays (targetState = false / OFF) is never blocked during an emergency.
 */
export function evaluateGasSafetyLockout(
  gasStatus: string,
  lockoutStatus?: string,
  isSimulatedLockout: boolean = false
): { isBlocked: boolean; statusCode?: number; statusText?: string; reason?: string } {
  const isLockoutActive = 
    gasStatus === 'danger' || 
    ((lockoutStatus === 'EMERGENCY_LOCKOUT' || lockoutStatus === 'LOCKOUT_PENDING_RESET' || lockoutStatus === 'CRITICAL') && !isSimulatedLockout);

  if (isLockoutActive) {
    const reasonMsg = lockoutStatus === 'LOCKOUT_PENDING_RESET'
      ? 'COMMAND REJECTED: System is in LOCKOUT_PENDING_RESET. Combustible gas cleared below threshold, but manual safety verification and reset is required before circuits can be energized.'
      : 'COMMAND BLOCKED: Electrical relay activation is inhibited during combustible gas alert (spark ignition hazard).';

    return {
      isBlocked: true,
      statusCode: 403,
      statusText: 'SAFETY_INTERLOCK_ACTIVATED',
      reason: reasonMsg,
    };
  }

  return { isBlocked: false };
}

export interface ResolvedDatabaseDevice {
  id: string; // The primary key UUID in public.devices
  home_id: string;
  device_slug: string;
  name: string;
  relay_channel: number;
  type: string;
  gpio_pin: number;
  user_id: string;
}

/**
 * Resolves a frontend Device reference to the exact registered row in public.devices.
 * 
 * Strict Guarantees:
 * 1. Enforces user ownership (`user_id = userId`) on every query for RLS compliance.
 * 2. Never passes non-UUID strings to UUID columns (`id.eq`), preventing PostgreSQL 22P02 fatal syntax errors.
 * 3. Resolves seamlessly across:
 *    - Direct database UUID (`device.dbId` or `device.id` if UUID)
 *    - Canonical device slugs ('light', 'fan', 'motor')
 *    - Legacy UI identifiers ('relay-1', 'relay-2', 'relay-3')
 *    - Physical relay channels (1, 2, 3, 4)
 *    - Device type ('light', 'fan', 'motor')
 */
export async function resolveDeviceInDatabase(
  client: SupabaseClient | any,
  userId: string,
  device: Partial<Device> & { id: string; name?: string; relayChannel?: number; type?: string; dbId?: string; deviceSlug?: string }
): Promise<ResolvedDatabaseDevice | null> {
  if (!client || !userId) return null;

  const SELECT_COLS = 'id, home_id, device_slug, name, relay_channel, type, gpio_pin, user_id';

  // -------------------------------------------------------------------------
  // Strategy 1: Direct UUID Match
  // Only executed if dbId or id is a syntactically valid UUID string
  // -------------------------------------------------------------------------
  const candidateUuid = isUuid(device.dbId) 
    ? device.dbId 
    : isUuid(device.id) 
    ? device.id 
    : null;

  if (candidateUuid) {
    const { data, error } = await client
      .from('devices')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('id', candidateUuid)
      .maybeSingle();

    if (!error && data) {
      return data as ResolvedDatabaseDevice;
    }
  }

  // -------------------------------------------------------------------------
  // Strategy 2: Match by exact device_slug or mapped alias
  // -------------------------------------------------------------------------
  const candidateSlugs: string[] = [];

  // Primary slugs from device object
  const rawSlug = typeof device.deviceSlug === 'string' ? device.deviceSlug.trim() : '';
  if (rawSlug && !isUuid(rawSlug)) {
    candidateSlugs.push(rawSlug.toLowerCase());
  }

  const rawId = typeof device.id === 'string' ? device.id.trim() : '';
  if (rawId && !isUuid(rawId)) {
    candidateSlugs.push(rawId.toLowerCase());
  }

  // Canonical hardware aliases mapping
  const normalizedId = (device.id || '').toLowerCase();
  const normalizedSlug = (device.deviceSlug || '').toLowerCase();
  const channel = device.relayChannel;
  const type = device.type;

  if (channel === 1 || type === 'light' || normalizedId === 'light' || normalizedId === 'relay-1' || normalizedSlug === 'light') {
    candidateSlugs.push('light', 'relay-1', 'smart-light');
  }
  if (channel === 2 || type === 'fan' || normalizedId === 'fan' || normalizedId === 'relay-2' || normalizedSlug === 'fan') {
    candidateSlugs.push('fan', 'relay-2', 'smart-fan');
  }
  if (channel === 3 || type === 'motor' || normalizedId === 'motor' || normalizedId === 'relay-3' || normalizedSlug === 'motor') {
    candidateSlugs.push('motor', 'relay-3', 'smart-motor', 'water-motor');
  }
  if (channel === 4 || normalizedId === 'relay-4' || normalizedSlug === 'relay-4') {
    candidateSlugs.push('relay-4', 'ch4');
  }
  if (channel === 5 || type === 'exhaust_fan' || normalizedId === 'relay-exhaust') {
    candidateSlugs.push('relay-exhaust', 'exhaust_fan', 'exhaust');
  }

  // Deduplicate candidate slugs
  const uniqueSlugs = Array.from(new Set(candidateSlugs.filter(Boolean)));

  for (const slug of uniqueSlugs) {
    const { data, error } = await client
      .from('devices')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('device_slug', slug)
      .maybeSingle();

    if (!error && data) {
      return data as ResolvedDatabaseDevice;
    }
  }

  // -------------------------------------------------------------------------
  // Strategy 3: Fallback by Relay Channel (1 to 4)
  // Each physical relay channel on the 4-channel module is unique per controller
  // -------------------------------------------------------------------------
  if (device.relayChannel && device.relayChannel >= 1 && device.relayChannel <= 4) {
    const { data, error } = await client
      .from('devices')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('relay_channel', device.relayChannel)
      .maybeSingle();

    if (!error && data) {
      return data as ResolvedDatabaseDevice;
    }
  }

  // -------------------------------------------------------------------------
  // Strategy 4: Fallback by Device Type ('light', 'fan', 'motor')
  // -------------------------------------------------------------------------
  if (device.type && device.type !== 'unused') {
    const { data, error } = await client
      .from('devices')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .eq('type', device.type)
      .maybeSingle();

    if (!error && data) {
      return data as ResolvedDatabaseDevice;
    }
  }

  return null;
}

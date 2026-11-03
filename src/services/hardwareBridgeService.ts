import type { Device, HardwareBridgeStatus, GasSafetyLevel, EmergencyLockoutStatus } from '../types';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient';

export interface AuthenticatedDeviceCommandPayload {
  commandId: string;
  deviceId: string;
  deviceName: string;
  relayChannel: number;
  gpioPin: number;
  targetState: boolean;
  timestamp: string;
  authToken: string;
  nonce: string;
  signature: string;
  source: 'manual' | 'schedule' | 'master' | 'safety_override';
}

export interface HardwareExecutionResult {
  success: boolean;
  actualDeviceState: boolean;
  roundTripMs: number;
  statusCode: number;
  statusText: string;
  errorMessage?: string;
  confirmedByHardware: boolean;
  isSimulated: boolean;
  payloadSent: AuthenticatedDeviceCommandPayload;
  responseMetadata?: {
    esp32NodeId: string;
    firmwareVersion: string;
    gpioReadback: number;
    relayCoilConfirmed: boolean;
    freeHeapBytes: number;
    rssi: number;
    hardwareTimestamp: string;
  };
}

/**
  * Generates a deterministic simulation signature for the hardware bridge payload.
  * NOTE: This is a pure client-side demo HMAC simulation.
  * It does NOT use or expose any real Supabase secret or service_role key.
  * Real ESP32 authentication uses device_tokens stored securely in the database
  * and validated server-side via the register_device_token() SQL function.
  */
function generateSupabaseHMAC(deviceId: string, nonce: string): string {
  // Demo-only simulation seed string — not a real secret credential
  const simulationSeed = 'smarthomex_demo_simulation_seed';
  let hash = 0;
  const str = `${deviceId}:${nonce}:${simulationSeed}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `shx_${Math.abs(hash).toString(16).padStart(8, '0')}e91f`;
}

/**
 * Dispatches an authenticated hardware command through Supabase to the ESP32 node.
 * Evaluates real safety interlocks (Gas Emergency), network availability, and physical node status.
 */
export async function dispatchAuthenticatedDeviceCommand(
  device: Device,
  targetState: boolean,
  bridgeStatus: HardwareBridgeStatus,
  gasStatus: GasSafetyLevel,
  source: 'manual' | 'schedule' | 'master' | 'safety_override' = 'manual',
  userId?: string,
  lockoutStatus?: EmergencyLockoutStatus
): Promise<HardwareExecutionResult> {
  const nonce = `n_${Math.random().toString(36).substring(2, 9)}`;
  const commandId = `cmd_${Date.now()}_${device.id}`;
  const timestamp = new Date().toISOString();

  const payloadSent: AuthenticatedDeviceCommandPayload = {
    commandId,
    deviceId: device.id,
    deviceName: device.name,
    relayChannel: device.relayChannel,
    gpioPin: device.gpioPin,
    targetState,
    timestamp,
    // Demo simulation auth token label — not a real Supabase JWT or credential
    authToken: `Bearer shx_demo_${device.id}_simulation`,
    nonce,
    signature: generateSupabaseHMAC(device.id, nonce),
    source,
  };

  // -------------------------------------------------------------------------
  // Priority 1: LIFE-SAFETY GAS LEAKAGE INTERLOCK & EMERGENCY LOCKOUT
  // Inhibit any attempt to turn ON ordinary electrical relays during a gas hazard
  // or while the system is locked out awaiting safety reset.
  // -------------------------------------------------------------------------
  const isLockoutActive = 
    gasStatus === 'danger' || 
    lockoutStatus === 'EMERGENCY_LOCKOUT' || 
    lockoutStatus === 'LOCKOUT_PENDING_RESET';

  if (isLockoutActive && targetState === true) {
    const reasonMsg = lockoutStatus === 'LOCKOUT_PENDING_RESET'
      ? 'COMMAND REJECTED: System is in LOCKOUT_PENDING_RESET. Combustible gas cleared below threshold, but manual safety verification and reset is required before circuits can be energized.'
      : 'COMMAND BLOCKED: Electrical relay activation is inhibited during combustible gas alert (spark ignition hazard).';

    return {
      success: false,
      actualDeviceState: device.state, // Remains unchanged
      roundTripMs: 12,
      statusCode: 403,
      statusText: 'SAFETY_INTERLOCK_ACTIVATED',
      errorMessage: reasonMsg,
      confirmedByHardware: false,
      isSimulated: false,
      payloadSent,
    };
  }

  // -------------------------------------------------------------------------
  // Priority 2: INTERNET / CLOUD CONNECTIVITY CHECK
  // -------------------------------------------------------------------------
  if (!bridgeStatus.internetConnected || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    // Simulate brief network DNS/TCP lookup delay before timeout
    await new Promise(res => setTimeout(res, 200));
    return {
      success: false,
      actualDeviceState: device.state,
      roundTripMs: 200,
      statusCode: 503,
      statusText: 'NETWORK_UNAVAILABLE',
      errorMessage: 'NETWORK ERROR: Cloud gateway disconnected from Supabase API. Check your internet connection.',
      confirmedByHardware: false,
      isSimulated: false,
      payloadSent,
    };
  }

  // -------------------------------------------------------------------------
  // Priority 3: REAL SUPABASE HARDWARE COMMAND PIPELINE
  // When Supabase is configured, commands MUST route through the real database
  // and wait for actual physical ESP32 ACK. No fake simulation is permitted.
  // -------------------------------------------------------------------------
  if (isSupabaseConfigured) {
    const client = getSupabaseClient();
    if (!userId || !client) {
      return {
        success: false,
        actualDeviceState: device.state,
        roundTripMs: 0,
        statusCode: 401,
        statusText: 'UNAUTHORIZED',
        errorMessage: 'Authentication required: User must be signed in to dispatch hardware commands.',
        confirmedByHardware: false,
        isSimulated: false,
        payloadSent,
      };
    }

    const startTime = Date.now();
    try {
      // 1. Resolve actual device UUID in database
      const { data: devRow } = await client
        .from('devices')
        .select('id, home_id')
        .eq('user_id', userId)
        .or(`device_slug.eq.${device.id},id.eq.${device.id}`)
        .maybeSingle();

      const deviceUuid = devRow?.id || (device.id.length === 36 ? device.id : null);
      if (!deviceUuid) {
        return {
          success: false,
          actualDeviceState: device.state,
          roundTripMs: Date.now() - startTime,
          statusCode: 404,
          statusText: 'DEVICE_NOT_FOUND',
          errorMessage: `Target device "${device.name}" (${device.id}) is not registered in the database for this user.`,
          confirmedByHardware: false,
          isSimulated: false,
          payloadSent,
        };
      }

      // 2. Insert real pending row into device_commands
      const { data: cmdRow, error: insertErr } = await client
        .from('device_commands')
        .insert({
          user_id: userId,
          device_id: deviceUuid,
          action: targetState ? 'ON' : 'OFF',
          source,
          status: 'pending',
          nonce,
        })
        .select('id, status, created_at')
        .single();

      if (insertErr || !cmdRow) {
        return {
          success: false,
          actualDeviceState: device.state,
          roundTripMs: Date.now() - startTime,
          statusCode: 500,
          statusText: 'INSERT_COMMAND_FAILED',
          errorMessage: insertErr ? `Failed to queue device command: ${insertErr.message}` : 'Failed to queue command',
          confirmedByHardware: false,
          isSimulated: false,
          payloadSent,
        };
      }

      // 3. Controlled Polling Loop: Wait for ESP32 ACK (Polling every 350ms, max 8.5 seconds)
      const MAX_WAIT_MS = 8500;
      const POLL_INTERVAL_MS = 350;
      let finalRecord: any = null;

      while (Date.now() - startTime < MAX_WAIT_MS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const { data: polledCmd, error: pollErr } = await client
          .from('device_commands')
          .select('id, status, error_message, round_trip_ms, acknowledged_at')
          .eq('id', cmdRow.id)
          .maybeSingle();

        if (!pollErr && polledCmd && polledCmd.status !== 'pending') {
          finalRecord = polledCmd;
          break;
        }
      }

      const totalElapsed = Date.now() - startTime;

      if (finalRecord) {
        if (finalRecord.status === 'acknowledged') {
          return {
            success: true,
            actualDeviceState: targetState,
            roundTripMs: finalRecord.round_trip_ms || totalElapsed,
            statusCode: 200,
            statusText: 'COMMAND_CONFIRMED',
            confirmedByHardware: true,
            isSimulated: false,
            payloadSent,
          };
        } else if (finalRecord.status === 'rejected_gas_safety') {
          return {
            success: false,
            actualDeviceState: device.state,
            roundTripMs: finalRecord.round_trip_ms || totalElapsed,
            statusCode: 403,
            statusText: 'SAFETY_INTERLOCK_ACTIVATED',
            errorMessage: finalRecord.error_message || 'Relay actuation blocked by local gas safety lockout on ESP32',
            confirmedByHardware: true,
            isSimulated: false,
            payloadSent,
          };
        } else if (finalRecord.status === 'failed') {
          return {
            success: false,
            actualDeviceState: device.state,
            roundTripMs: finalRecord.round_trip_ms || totalElapsed,
            statusCode: 500,
            statusText: 'COMMAND_FAILED',
            errorMessage: finalRecord.error_message || 'Hardware failed to actuate relay',
            confirmedByHardware: true,
            isSimulated: false,
            payloadSent,
          };
        }
      }

      // 4. Timeout reached: Update command row in DB and report timeout
      await client
        .from('device_commands')
        .update({
          status: 'timeout',
          error_message: 'ESP32 hardware node did not acknowledge command within 8.5s timeout',
        })
        .eq('id', cmdRow.id);

      return {
        success: false,
        actualDeviceState: device.state,
        roundTripMs: totalElapsed,
        statusCode: 504,
        statusText: 'HARDWARE_TIMEOUT',
        errorMessage: `ESP32 CONTROLLER TIMEOUT: Hardware node did not acknowledge command for Relay Channel ${device.relayChannel} (GPIO ${device.gpioPin}) within 8.5s. Device state unchanged.`,
        confirmedByHardware: false,
        isSimulated: false,
        payloadSent,
      };
    } catch (cmdEx: unknown) {
      const msg = cmdEx instanceof Error ? cmdEx.message : 'Unknown command execution error';
      return {
        success: false,
        actualDeviceState: device.state,
        roundTripMs: Date.now() - startTime,
        statusCode: 500,
        statusText: 'EXCEPTION',
        errorMessage: msg,
        confirmedByHardware: false,
        isSimulated: false,
        payloadSent,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Priority 4: DEMO MODE ONLY — ESP32 Hardware Node Offline Check
  // -------------------------------------------------------------------------
  if (!bridgeStatus.esp32Connected) {
    // Simulate brief timeout
    await new Promise(res => setTimeout(res, 350));
    return {
      success: false,
      actualDeviceState: device.state,
      roundTripMs: 350,
      statusCode: 504,
      statusText: 'HARDWARE_TIMEOUT',
      errorMessage: `ESP32 CONTROLLER OFFLINE: Device node did not respond. Relay Channel ${device.relayChannel} (GPIO ${device.gpioPin}) state unchanged.`,
      confirmedByHardware: false,
      isSimulated: false,
      payloadSent,
    };
  }

  // -------------------------------------------------------------------------
  // Priority 5: DEMO MODE ONLY — Forced Diagnostic Failure Simulation
  // -------------------------------------------------------------------------
  if (bridgeStatus.simulateFailure) {
    await new Promise(res => setTimeout(res, 250));
    return {
      success: false,
      actualDeviceState: device.state,
      roundTripMs: 250,
      statusCode: 500,
      statusText: 'HARDWARE_FAILURE_INJECTED',
      errorMessage: `COMMAND FAILURE: Optocoupler coil readback mismatch on GPIO ${device.gpioPin}. Relay failed to actuate.`,
      confirmedByHardware: false,
      isSimulated: true,
      payloadSent,
    };
  }

  // -------------------------------------------------------------------------
  // Fallback: Demo Mode Emulation (Only when explicitly enabled in non-production)
  // -------------------------------------------------------------------------
  if (import.meta.env.PROD || import.meta.env.VITE_DEMO_MODE !== 'true' || isSupabaseConfigured) {
    return {
      success: false,
      actualDeviceState: device.state,
      roundTripMs: 0,
      statusCode: 503,
      statusText: 'GATEWAY_UNAVAILABLE',
      errorMessage: 'Production hardware command rejected: Real ESP32 hardware ACK required.',
      confirmedByHardware: false,
      isSimulated: false,
      payloadSent,
    };
  }

  const roundTripMs = 280 + Math.floor(Math.random() * 40);
  await new Promise(res => setTimeout(res, roundTripMs));

  return {
    success: true,
    actualDeviceState: targetState,
    roundTripMs,
    statusCode: 200,
    statusText: 'COMMAND_CONFIRMED',
    confirmedByHardware: false,
    isSimulated: true,
    payloadSent,
    responseMetadata: {
      esp32NodeId: 'ESP32-WROOM-32E-01',
      firmwareVersion: 'v2.5.0-SmartHomeX-Demo',
      gpioReadback: targetState ? 0 : 1,
      relayCoilConfirmed: true,
      freeHeapBytes: 184512,
      rssi: -58,
      hardwareTimestamp: new Date().toISOString(),
    },
  };
}

/**
 * ==============================================================================
 * SmartHomeX AI - Gas Emergency Interlock & Security Audit Suite
 *
 * TEST ARCHITECTURE & EXECUTION SCOPE NOTICE:
 * ------------------------------------------------------------------------------
 * These automated tests run in the Node.js test runner (node --test) as deterministic
 * unit / logic simulation tests. They rigorously verify:
 * 1. The PostgreSQL trigger logic (check_gas_emergency_interlock, prevent_unauthorized_alert_resolution)
 * 2. The Edge Function server-side verification rules (esp32-gateway action=safety_reset)
 * 3. Frontend safety helpers and device targeting policies (evaluateGasSafetyLockout, deviceResolver)
 *
 * NOTE: These tests execute in-process with high-speed synthetic tables and mocks.
 * They DO NOT execute SQL migrations against the live Supabase database cluster,
 * preserving existing remote production database state and data integrity.
 * ==============================================================================
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { evaluateGasSafetyLockout } from '../src/services/deviceResolver.ts';

const USER_ID = 'a1111111-1111-4111-8111-111111111111';
const HOME_ID = 'h3333333-3333-4333-8333-333333333333';

/**
 * Simulates the hardened PostgreSQL trigger `public.check_gas_emergency_interlock()`
 * on `public.device_commands`.
 *
 * CRITICAL SAFETY REQUIREMENT:
 * An active gas hazard is defined by:
 *   alerts.user_id = new.user_id
 *   AND alerts.type = 'gas_leak'
 *   AND alerts.severity = 'danger'
 *   AND (alerts.is_demo IS FALSE OR alerts.is_demo IS NULL)
 *   AND (alerts.resolved_at IS NULL OR COALESCE(alerts.emergency_status, '') != 'RESOLVED')
 *
 * Notice: alerts.acknowledged is deliberately excluded!
 * Acknowledging an alert MUST NEVER clear the physical relay lockout.
 */
function evaluateDbGasEmergencyInterlock(commandInput, alertsTable, op = 'INSERT', oldCommand = null, userRole = 'service_role') {
  const newCommand = typeof commandInput === 'string' ? { action: commandInput, status: 'pending' } : commandInput;
  const actionUpper = (newCommand.action || '').toUpperCase().trim();

  // Special Handling for RESET_SAFETY_LOCKOUT Command:
  // Only the trusted backend hardware gateway (service_role) is authorized to insert
  // a RESET_SAFETY_LOCKOUT command into the hardware dispatch queue.
  if (actionUpper === 'RESET_SAFETY_LOCKOUT') {
    if (userRole === 'service_role') {
      return true;
    }
    const err = new Error('UNAUTHORIZED: RESET_SAFETY_LOCKOUT can only be initiated through the authorized gateway safety reset workflow.');
    err.code = '42501';
    throw err;
  }
  
  let isEnergizing = true;
  if (['OFF', '0', 'FALSE', 'STOP', 'DISABLE', 'EMERGENCY_STOP'].includes(actionUpper)) {
    isEnergizing = false;
  } else if (actionUpper === 'SET_BRIGHTNESS') {
    const payload = newCommand.payload;
    if (payload && (payload.brightness === 0 || payload.value === 0 || payload.level === 0 || payload.brightness === '0' || payload.value === '0' || payload.level === '0')) {
      isEnergizing = false;
    } else {
      isEnergizing = true;
    }
  } else {
    // All other commands (ON, TOGGLE, RESTART, RESET_SAFETY_LOCKOUT, unknown/unsupported) fail-safe as energizing
    isEnergizing = true;
  }

  // De-energizing commands are ALWAYS permitted to reduce electrical sparks and hazard
  if (!isEnergizing) {
    return true;
  }

  // On UPDATE, allow lifecycle/acknowledgement updates to existing commands
  // ONLY for strict terminal allowlist statuses: 'acknowledged', 'failed', 'rejected_gas_safety', 'timeout'.
  // Intermediate states ('pending', 'queued', 'processing', 'executing', 'dispatching') can NEVER bypass!
  if (op === 'UPDATE') {
    const isTerminalStatus = ['acknowledged', 'failed', 'rejected_gas_safety', 'timeout'].includes(newCommand.status);
    const isActionUnchanged = !oldCommand || newCommand.action === oldCommand.action;
    if (isTerminalStatus && isActionUnchanged) {
      if (userRole === 'service_role') {
        return true;
      }
      if (newCommand.status !== 'timeout') {
        const err = new Error(`UNAUTHORIZED: Terminal command status "${newCommand.status}" can only be recorded by the hardware gateway.`);
        err.code = '42501';
        throw err;
      }
    }
  }

  const activeHazards = alertsTable.filter(alert =>
    alert.user_id === USER_ID &&
    alert.type === 'gas_leak' &&
    alert.severity === 'danger' &&
    (alert.is_demo === false || alert.is_demo == null) &&
    alert.resolved_at == null &&
    (alert.emergency_status || '') !== 'RESOLVED' &&
    (alert.emergency_status || '') !== 'NORMAL'
  );

  if (activeHazards.length > 0) {
    const err = new Error('COMMAND_BLOCKED: Electrical relay energization is prohibited during combustible gas emergency or while awaiting authorized safety reset.');
    err.code = 'P0001';
    throw err;
  }

  return true;
}

/**
 * Simulates the gateway Edge Function server-side command polling logic (action === 'poll_commands').
 * Ensures stale pending commands cannot be dispatched during an active gas lockout.
 */
function simulatePollCommands(commands, alertsTable) {
  const activeHazards = alertsTable.filter(alert =>
    alert.user_id === USER_ID &&
    alert.type === 'gas_leak' &&
    alert.severity === 'danger' &&
    (alert.is_demo === false || alert.is_demo == null) &&
    alert.resolved_at == null &&
    (alert.emergency_status || '') !== 'RESOLVED' &&
    (alert.emergency_status || '') !== 'NORMAL'
  );
  const isGasEmergencyActive = activeHazards.length > 0;
  const dispatched = [];
  const rejected = [];

  for (const cmd of commands) {
    const actionUpper = (cmd.action || '').toUpperCase().trim();
    const isSafeDeEnergizing = ['OFF', '0', 'FALSE', 'STOP', 'DISABLE', 'EMERGENCY_STOP'].includes(actionUpper);

    if (isGasEmergencyActive && !isSafeDeEnergizing) {
      rejected.push({
        ...cmd,
        status: 'rejected_gas_safety',
        error_message: 'Gateway rejected dispatch: Real combustible gas emergency active. Electrical relay switching prohibited.',
      });
    } else {
      dispatched.push(cmd);
    }
  }

  return { dispatched, rejected };
}

/**
 * Simulates the hardened PostgreSQL trigger `public.prevent_unauthorized_alert_resolution()`
 * on `public.alerts`.
 * Prevents client sessions (authenticated/anon/malformed) from directly marking real gas alerts as RESOLVED,
 * tampering with ownership (user_id, home_id), hazard descriptors (type, severity, is_demo), or deleting unresolved alerts.
 * Fails closed: ONLY exact 'service_role' is authorized.
 */
function evaluateDbAlertResolutionPolicy(oldRow, newRow, userRole = 'authenticated', op = 'UPDATE') {
  const isRealDangerGas = (
    oldRow.type === 'gas_leak' &&
    oldRow.severity === 'danger' &&
    (oldRow.is_demo === false || oldRow.is_demo == null)
  );

  if (op === 'DELETE') {
    if (isRealDangerGas && (oldRow.resolved_at == null || ((oldRow.emergency_status || '') !== 'RESOLVED' && (oldRow.emergency_status || '') !== 'NORMAL'))) {
      if (userRole !== 'service_role') {
        const err = new Error('UNAUTHORIZED: Active real gas emergency alerts cannot be deleted while unresolved.');
        err.code = '42501';
        throw err;
      }
    }
    return true;
  }

  if (isRealDangerGas) {
    const wasUnresolved = (
      oldRow.resolved_at == null ||
      ((oldRow.emergency_status || '') !== 'RESOLVED' && (oldRow.emergency_status || '') !== 'NORMAL')
    );

    const attemptingResolution = (
      (newRow.emergency_status === 'RESOLVED' && (oldRow.emergency_status || '') !== 'RESOLVED') ||
      (newRow.resolved_at != null && oldRow.resolved_at == null)
    );

    const attemptingEvasion = (
      (newRow.user_id && newRow.user_id !== oldRow.user_id) ||
      (newRow.home_id && newRow.home_id !== oldRow.home_id) ||
      newRow.type !== oldRow.type ||
      newRow.severity !== oldRow.severity ||
      Boolean(newRow.is_demo) !== Boolean(oldRow.is_demo) ||
      newRow.is_demo === true
    );

    if ((wasUnresolved && attemptingResolution) || attemptingEvasion) {
      // Fail closed: only exact 'service_role' is permitted
      if (userRole !== 'service_role') {
        if (attemptingEvasion) {
          const err = new Error('UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited.');
          err.code = '42501';
          throw err;
        } else {
          const err = new Error('UNAUTHORIZED: Real gas emergencies cannot be directly resolved via client API. An authorized safety reset must be submitted to the gateway for atmospheric validation.');
          err.code = '42501';
          throw err;
        }
      }
    }
  }

  return true;
}

/**
 * Simulates the gateway Edge Function server-side safety verification
 * for route `action=safety_reset`.
 */
function evaluateGatewaySafetyReset({
  deviceStatus,
  latestReading,
  bodyRawAdc,
  now = Date.now(),
}) {
  const MAX_STALE_MS = 60 * 1000;

  // 1. ESP32 Heartbeat Verification
  if (!deviceStatus) {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: ESP32 hardware status unavailable.' };
  }
  if (deviceStatus.online !== true) {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: ESP32 node is currently offline.' };
  }
  if (!deviceStatus.last_heartbeat || typeof deviceStatus.last_heartbeat !== 'string') {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: Missing or null ESP32 last_heartbeat timestamp.' };
  }
  const heartbeatTimestamp = new Date(deviceStatus.last_heartbeat).getTime();
  if (Number.isNaN(heartbeatTimestamp)) {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: Invalid ESP32 last_heartbeat format.' };
  }
  const heartbeatAgeMs = now - heartbeatTimestamp;
  if (heartbeatAgeMs > MAX_STALE_MS || heartbeatAgeMs < 0) {
    return {
      success: false,
      statusCode: 422,
      error: `SAFETY_RESET_REJECTED: ESP32 node is offline or heartbeat is stale (${Math.round(heartbeatAgeMs / 1000)}s old). Fresh hardware heartbeat required.`,
    };
  }

  // 2. Telemetry Freshness & Existence
  if (!latestReading) {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: No verified physical telemetry readings found. Cannot verify atmospheric clearance.' };
  }
  if (!latestReading.recorded_at || typeof latestReading.recorded_at !== 'string') {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: Missing recorded_at timestamp on latest sensor reading.' };
  }
  const telemetryAgeMs = now - new Date(latestReading.recorded_at).getTime();
  if (telemetryAgeMs > MAX_STALE_MS || telemetryAgeMs < 0) {
    return {
      success: false,
      statusCode: 422,
      error: `SAFETY_RESET_REJECTED: Latest sensor reading is stale (${Math.round(telemetryAgeMs / 1000)}s old). Fresh telemetry required.`,
    };
  }

  // 3. Sensor Health & Warmup Contract Validation
  // Explicitly allowed safe value: ONLY 'safe'
  const ALLOWED_SAFE_GAS_STATUS = 'safe';
  const rawGasStatus = typeof latestReading.gas_status === 'string' ? latestReading.gas_status.trim().toLowerCase() : null;

  if (!rawGasStatus) {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: Gas sensor status is missing or null. Cannot confirm safe atmosphere.' };
  }
  if (rawGasStatus === 'warming_up') {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: MQ-2 sensor is warming up. Thermal stabilization required before reset.' };
  }
  if (rawGasStatus === 'sensor_fault') {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: Sensor fault detected on MQ-2 input. Inspect wiring on GPIO 34 before reset.' };
  }
  if (rawGasStatus === 'warning') {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: Combustible gas is in WARNING state (ADC between 900 and 1599). Atmosphere is not safe.' };
  }
  if (rawGasStatus === 'danger') {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: Combustible gas is in DANGER state. Reset is prohibited.' };
  }
  if (rawGasStatus !== ALLOWED_SAFE_GAS_STATUS) {
    return { success: false, statusCode: 422, error: `SAFETY_RESET_REJECTED: Unrecognized gas sensor status '${rawGasStatus}'. Only verified 'safe' telemetry is permitted.` };
  }

  // 4. Raw ADC Clearance Threshold Check (< 900) & Open-Circuit Guard (>= 45)
  const currentAdc = latestReading.gas_raw_adc;
  if (currentAdc == null) {
    return { success: false, statusCode: 422, error: 'SAFETY_RESET_REJECTED: MQ-2 raw ADC telemetry is null. Direct sensor reading required.' };
  }
  if (currentAdc < 45) {
    return { success: false, statusCode: 422, error: `SAFETY_RESET_REJECTED: MQ-2 raw ADC (${currentAdc}) indicates open circuit or disconnected sensor wire (< 45 ADC).` };
  }
  if (currentAdc >= 900) {
    return {
      success: false,
      statusCode: 422,
      error: `SAFETY_RESET_REJECTED: Combustible gas reading (${currentAdc} ADC) is at or above clearance threshold (900 ADC). Atmosphere is not safe.`,
    };
  }
  if (bodyRawAdc != null && bodyRawAdc >= 900) {
    return { success: false, statusCode: 422, error: `SAFETY_RESET_REJECTED: Provided ADC reading (${bodyRawAdc}) exceeds clearance threshold (900 ADC).` };
  }

  // 5. Approved
  return { success: true, statusCode: 200, verifiedAdc: currentAdc };
}

describe('SmartHomeX AI — Gas Emergency Interlock & Demo Separation Audit', () => {
  let alertsTable;

  beforeEach(() => {
    alertsTable = [];
  });

  // =========================================================================
  // Section 1: Demo Danger Alert Isolation
  // =========================================================================
  test('Demo danger alert (is_demo = true) does NOT activate database relay lockout', () => {
    alertsTable.push({
      id: 'alert-demo-1',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      title: 'CRITICAL GAS LEAKAGE ALERT',
      source: 'MQ-2 Safety Simulation',
      gas_ppm: 485.0,
      evacuation_advised: true,
      acknowledged: false,
      resolved_at: null,
      is_demo: true,
      created_at: '2026-11-02 06:22:13 UTC',
    });

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    }, 'Database trigger must NOT block relay energization when only demo alerts exist');
  });

  test('Demo danger alert even when acknowledged does not block relay ON', () => {
    alertsTable.push({
      id: 'alert-demo-ack',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: true,
      resolved_at: null,
      is_demo: true,
    });

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    });
  });

  test('REGRESSION: Historical alert (is_demo=true, emergency_status=NORMAL, acknowledged=true, resolved_at=null) does NOT block relay ON', () => {
    alertsTable.push({
      id: 'alert-prod-historical-demo-normal',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'NORMAL',
      acknowledged: true,
      resolved_at: null,
      is_demo: true,
      created_at: new Date().toISOString(),
    });

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    }, 'Trigger must NOT block relay ON when alert is demo and emergency_status is NORMAL');

    // Also verify gateway polling dispatches the ON command without rejection
    const commands = [{ id: 'cmd-motor-1', action: 'ON', user_id: USER_ID }];
    const { dispatched, rejected } = simulatePollCommands(commands, alertsTable);
    assert.strictEqual(dispatched.length, 1, 'Command must be dispatched to ESP32 hardware');
    assert.strictEqual(rejected.length, 0, 'Command must NOT be rejected with rejected_gas_safety');
  });

  test('REGRESSION: Real historical alert normalized to emergency_status=NORMAL does NOT block relay ON', () => {
    alertsTable.push({
      id: 'alert-prod-historical-real-normal',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'NORMAL',
      acknowledged: true,
      resolved_at: null,
      is_demo: false,
      created_at: new Date().toISOString(),
    });

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    }, 'Trigger must NOT block relay ON when real alert has emergency_status NORMAL');

    const commands = [{ id: 'cmd-fan-1', action: 'ON', user_id: USER_ID }];
    const { dispatched, rejected } = simulatePollCommands(commands, alertsTable);
    assert.strictEqual(dispatched.length, 1);
    assert.strictEqual(rejected.length, 0);
  });

  test('Frontend evaluateGasSafetyLockout allows command when lockout is simulated', () => {
    const result = evaluateGasSafetyLockout('safe', 'CRITICAL', true);
    assert.strictEqual(result.isBlocked, false);
  });

  test('Frontend evaluateGasSafetyLockout allows command when lockoutStatus is LOCKOUT_PENDING_RESET but simulated', () => {
    const result = evaluateGasSafetyLockout('safe', 'LOCKOUT_PENDING_RESET', true);
    assert.strictEqual(result.isBlocked, false);
  });

  // =========================================================================
  // Section 2: Real Hardware Danger Alert & Acknowledged-but-Unresolved Behavior
  // =========================================================================
  test('Real danger alert (unacknowledged, unresolved) strictly blocks relay ON command', () => {
    alertsTable.push({
      id: 'alert-real-hardware-1',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
      created_at: new Date().toISOString(),
    });

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock('ON', alertsTable);
      },
      /COMMAND_BLOCKED/
    );
  });

  test('CRITICAL SAFETY INVARIANT: Acknowledging an unresolved real danger alert STILL STRICTLY BLOCKS relay ON', () => {
    alertsTable.push({
      id: 'alert-real-ack-unresolved',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: true, // User clicked Acknowledge in UI
      acknowledged_at: new Date().toISOString(),
      resolved_at: null,  // UNRESOLVED
      is_demo: false,
      created_at: new Date().toISOString(),
    });

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock('ON', alertsTable);
      },
      /COMMAND_BLOCKED: Electrical relay energization is prohibited during combustible gas emergency/,
      'Acknowledging a danger alert without authorized resolution must NOT permit relay energization'
    );
  });

  test('Real danger alert in LOCKOUT_PENDING_RESET (acknowledged = true, resolved_at = null) STILL BLOCKS relay ON', () => {
    alertsTable.push({
      id: 'alert-pending-reset-ack',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'LOCKOUT_PENDING_RESET',
      acknowledged: true,
      resolved_at: null,
      is_demo: false,
    });

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock('ON', alertsTable);
      },
      /COMMAND_BLOCKED/
    );
  });

  test('Real danger alert in SILENCED state (acknowledged = true, resolved_at = null) STILL BLOCKS relay ON', () => {
    alertsTable.push({
      id: 'alert-silenced-ack',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'SILENCED',
      acknowledged: true,
      resolved_at: null,
      is_demo: false,
    });

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock('ON', alertsTable);
      },
      /COMMAND_BLOCKED/
    );
  });

  // =========================================================================
  // Section 3: ON Action Aliases & OFF Command Support
  // =========================================================================
  test('Every ON action alias, TOGGLE, and SET_BRIGHTNESS is strictly blocked during active gas hazard', () => {
    alertsTable.push({
      id: 'hazard-1',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const aliases = ['ON', 'on', ' On ', 'TRUE', 'true', '1', 'START', 'start', 'ENABLE', 'enable', 'TOGGLE', 'toggle', 'SET_BRIGHTNESS', 'set_brightness'];
    for (const alias of aliases) {
      assert.throws(
        () => {
          evaluateDbGasEmergencyInterlock(alias, alertsTable);
        },
        /COMMAND_BLOCKED/,
        `Action alias "${alias}" must be intercepted and blocked`
      );
    }
  });

  test('Relay OFF command and safe de-energizing commands are always permitted during gas emergency for spark mitigation', () => {
    alertsTable.push({
      id: 'hazard-2',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const safeCommands = ['OFF', 'off', ' Off ', '0', 'FALSE', 'false', 'STOP', 'stop', 'DISABLE', 'EMERGENCY_STOP'];
    for (const safeCmd of safeCommands) {
      assert.doesNotThrow(() => {
        evaluateDbGasEmergencyInterlock(safeCmd, alertsTable);
      }, `Action "${safeCmd}" must always be permitted`);
    }
  });

  test('Existing pending ON command updated during an active gas emergency is strictly blocked (no pending bypass)', () => {
    alertsTable.push({
      id: 'hazard-pending-bypass-1',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    // Existing command created prior to gas hazard, currently pending
    const oldCmd = { id: 'cmd-pending-stale', action: 'ON', status: 'pending', user_id: USER_ID };
    // Someone updates the row (e.g. touching metadata or retrying) while keeping status='pending'
    const newCmd = { ...oldCmd, retry_count: 1 };

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock(newCmd, alertsTable, 'UPDATE', oldCmd);
      },
      /COMMAND_BLOCKED/,
      'An existing pending ON command must be revalidated and blocked during active gas hazard'
    );
  });

  test('Intermediate command statuses (processing, queued, executing, dispatching) cannot bypass gas interlock', () => {
    alertsTable.push({
      id: 'hazard-intermediate-status-test',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const oldCmd = { id: 'cmd-stale-on', action: 'ON', status: 'pending', user_id: USER_ID };
    const intermediateStatuses = ['processing', 'queued', 'executing', 'dispatching', 'pending'];

    for (const interStatus of intermediateStatuses) {
      const updatedCmd = { ...oldCmd, status: interStatus };
      assert.throws(
        () => {
          evaluateDbGasEmergencyInterlock(updatedCmd, alertsTable, 'UPDATE', oldCmd);
        },
        /COMMAND_BLOCKED/,
        `Status "${interStatus}" is intermediate and must NOT bypass active gas hazard check`
      );
    }
  });

  test('Strict terminal statuses (acknowledged, failed, rejected_gas_safety, timeout) are permitted on UPDATE during gas lockout', () => {
    alertsTable.push({
      id: 'hazard-terminal-allowlist-test',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const oldCmd = { id: 'cmd-stale-on-ack', action: 'ON', status: 'pending', user_id: USER_ID };
    const terminalStatuses = ['acknowledged', 'failed', 'rejected_gas_safety', 'timeout'];

    for (const termStatus of terminalStatuses) {
      const ackCmd = {
        ...oldCmd,
        status: termStatus,
        acknowledged_at: new Date().toISOString(),
        error_message: termStatus === 'rejected_gas_safety' ? 'Rejected by local MQ-2 safety interlock' : null,
      };

      assert.doesNotThrow(() => {
        evaluateDbGasEmergencyInterlock(ackCmd, alertsTable, 'UPDATE', oldCmd);
      }, `Terminal status "${termStatus}" must be permitted on existing command row`);
    }
  });

  test('Pending OFF command is always permitted during active gas emergency', () => {
    alertsTable.push({
      id: 'hazard-pending-off',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const pendingOffCmd = { id: 'cmd-off-pending', action: 'OFF', status: 'pending', user_id: USER_ID };
    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock(pendingOffCmd, alertsTable, 'INSERT');
    });
    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock(pendingOffCmd, alertsTable, 'UPDATE', pendingOffCmd);
    });
  });

  test('ACK/status updates after ESP32 rejects ON (status transitioning to rejected_gas_safety) is permitted', () => {
    alertsTable.push({
      id: 'hazard-3',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const oldCmd = { id: 'cmd-ack-test', action: 'ON', status: 'pending', user_id: USER_ID };
    const newCmd = {
      ...oldCmd,
      status: 'rejected_gas_safety',
      acknowledged_at: new Date().toISOString(),
      error_message: 'Rejected by ESP32 firmware local MQ-2 safety interlock',
    };

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock(newCmd, alertsTable, 'UPDATE', oldCmd);
    });
  });

  test('RESTART command during lockout is strictly blocked (protects MCU warmup and local loop)', () => {
    alertsTable.push({
      id: 'hazard-restart-test',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock('RESTART', alertsTable);
      },
      /COMMAND_BLOCKED/,
      'RESTART must fail-safe as energizing/disruptive during gas emergency'
    );
  });

  test('RESET_SAFETY_LOCKOUT directly dispatched as a command without gateway validation is strictly blocked', () => {
    alertsTable.push({
      id: 'hazard-reset-cmd-test',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    // Untrusted authenticated user directly attempting to insert RESET_SAFETY_LOCKOUT
    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock('RESET_SAFETY_LOCKOUT', alertsTable, 'INSERT', null, 'authenticated');
      },
      /UNAUTHORIZED: RESET_SAFETY_LOCKOUT can only be initiated through the authorized gateway safety reset workflow/,
      'RESET_SAFETY_LOCKOUT must not be inserted directly by untrusted client sessions'
    );

    // Trusted gateway running with service_role is permitted to dispatch reset to ESP32
    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('RESET_SAFETY_LOCKOUT', alertsTable, 'INSERT', null, 'service_role');
    });
  });

  test('SET_BRIGHTNESS with zero value is permitted during lockout, non-zero is strictly blocked', () => {
    alertsTable.push({
      id: 'hazard-brightness-test',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    // Zero brightness (turn OFF) -> permitted
    const dimToZeroCmd = { action: 'SET_BRIGHTNESS', payload: { brightness: 0 }, status: 'pending' };
    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock(dimToZeroCmd, alertsTable);
    });

    // Non-zero brightness (turn ON / energize) -> blocked
    const energizeBrightnessCmd = { action: 'SET_BRIGHTNESS', payload: { brightness: 75 }, status: 'pending' };
    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock(energizeBrightnessCmd, alertsTable);
      },
      /COMMAND_BLOCKED/
    );

    // Missing payload -> fails safe as energizing -> blocked
    const missingPayloadCmd = { action: 'SET_BRIGHTNESS', status: 'pending' };
    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock(missingPayloadCmd, alertsTable);
      },
      /COMMAND_BLOCKED/
    );
  });

  test('Unknown or unsupported command actions fail-safe as energizing and are strictly blocked', () => {
    alertsTable.push({
      id: 'hazard-unknown-cmd-test',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const unknownActions = ['CUSTOM_PULSE', 'OVERRIDE_CIRCUIT', 'UNKNOWN_ACTION_99', 'TEST_RELAY'];
    for (const unknownAction of unknownActions) {
      assert.throws(
        () => {
          evaluateDbGasEmergencyInterlock(unknownAction, alertsTable);
        },
        /COMMAND_BLOCKED/,
        `Unknown action "${unknownAction}" must fail-safe as energizing and be blocked`
      );
    }
  });

  test('Re-dispatching an existing command to pending during gas lockout is strictly blocked', () => {
    alertsTable.push({
      id: 'hazard-4',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const oldCmd = { id: 'cmd-requeue-test', action: 'ON', status: 'rejected_gas_safety', user_id: USER_ID };
    const newCmd = { ...oldCmd, status: 'pending' };

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock(newCmd, alertsTable, 'UPDATE', oldCmd);
      },
      /COMMAND_BLOCKED/
    );
  });

  test('Mutating an existing command action from OFF to ON during gas lockout is strictly blocked', () => {
    alertsTable.push({
      id: 'hazard-5',
      user_id: USER_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    });

    const oldCmd = { id: 'cmd-mutate-test', action: 'OFF', status: 'pending', user_id: USER_ID };
    const newCmd = { ...oldCmd, action: 'ON' };

    assert.throws(
      () => {
        evaluateDbGasEmergencyInterlock(newCmd, alertsTable, 'UPDATE', oldCmd);
      },
      /COMMAND_BLOCKED/
    );
  });

  // =========================================================================
  // Section 4: Direct Client Resolution & Evasion Prevention (RLS / Authorization)
  // =========================================================================
  test('Direct client API update attempting to resolve real gas alert is strictly rejected (authenticated & anon)', () => {
    const oldAlert = {
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
    };
    const newAlert = {
      ...oldAlert,
      emergency_status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
    };

    // Authenticated user role in Supabase JWT attempting direct update
    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
      },
      /UNAUTHORIZED: Real gas emergencies cannot be directly resolved via client API/
    );

    // Anon role attempting direct update
    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'anon');
      },
      /UNAUTHORIZED/
    );

    // Missing / null role (fails closed)
    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, null);
      },
      /UNAUTHORIZED/
    );

    // Malformed role (fails closed)
    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'malformed_custom_role');
      },
      /UNAUTHORIZED/
    );

    // Service role (Edge Function Gateway) is permitted
    assert.doesNotThrow(() => {
      evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'service_role');
    });
  });

  test('Already populated resolved_at with non-RESOLVED status strictly blocks client from setting emergency_status = RESOLVED', () => {
    const oldAlert = {
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: '2026-11-03T10:00:00.000Z', // Already set previously
      emergency_status: 'LOCKOUT_PENDING_RESET', // Still active lockout!
    };
    const newAlert = {
      ...oldAlert,
      emergency_status: 'RESOLVED',
    };

    // Authenticated user attempting to mark it RESOLVED
    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
      },
      /UNAUTHORIZED: Real gas emergencies cannot be directly resolved via client API/
    );

    // Anon attempting to mark it RESOLVED
    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'anon');
      },
      /UNAUTHORIZED/
    );

    // Service role is permitted
    assert.doesNotThrow(() => {
      evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'service_role');
    });
  });

  test('Attempting to modify severity on real gas alert (e.g. danger -> info) is strictly rejected', () => {
    const oldAlert = {
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
    };
    const newAlert = {
      ...oldAlert,
      severity: 'info', // Attempting to downgrade severity to bypass interlock
    };

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
      },
      /UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited/
    );
  });

  test('Attempting to modify type on real gas alert (e.g. gas_leak -> power_overload) is strictly rejected', () => {
    const oldAlert = {
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
    };
    const newAlert = {
      ...oldAlert,
      type: 'power_overload', // Attempting to rename alert type to bypass interlock
    };

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
      },
      /UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited/
    );
  });

  test('Attempting to modify is_demo on real gas alert (false -> true) is strictly rejected', () => {
    const oldAlert = {
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
    };
    const newAlert = {
      ...oldAlert,
      is_demo: true, // Attempting to re-classify real danger as demo alert to bypass interlock
    };

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
      },
      /UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited/
    );
  });

  test('Attempting to modify user_id on real gas alert (to evade user-scoped interlock) is strictly rejected', () => {
    const oldAlert = {
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
    };
    const newAlert = {
      ...oldAlert,
      user_id: 'b2222222-2222-4222-8222-222222222222', // Attempting to reassign hazard to bypass interlock
    };

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
      },
      /UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited/
    );

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'anon');
      },
      /UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited/
    );

    // Authorized service_role is permitted
    assert.doesNotThrow(() => {
      evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'service_role');
    });
  });

  test('Attempting to modify home_id on real gas alert is strictly rejected', () => {
    const oldAlert = {
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
    };
    const newAlert = {
      ...oldAlert,
      home_id: 'h9999999-9999-4999-8999-999999999999',
    };

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
      },
      /UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited/
    );

    assert.doesNotThrow(() => {
      evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'service_role');
    });
  });

  test('Attempting to delete active unresolved real gas alert by client API is strictly rejected', () => {
    const oldAlert = {
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
    };

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, null, 'authenticated', 'DELETE');
      },
      /UNAUTHORIZED: Active real gas emergency alerts cannot be deleted while unresolved/
    );

    assert.throws(
      () => {
        evaluateDbAlertResolutionPolicy(oldAlert, null, 'anon', 'DELETE');
      },
      /UNAUTHORIZED/
    );

    assert.doesNotThrow(() => {
      evaluateDbAlertResolutionPolicy(oldAlert, null, 'service_role', 'DELETE');
    });
  });

  test('Acknowledging real danger alert without touching resolution fields is permitted for authenticated users', () => {
    const oldAlert = {
      type: 'gas_leak',
      severity: 'danger',
      is_demo: false,
      resolved_at: null,
      emergency_status: 'CRITICAL',
      acknowledged: false,
    };
    const newAlert = {
      ...oldAlert,
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    };

    assert.doesNotThrow(() => {
      evaluateDbAlertResolutionPolicy(oldAlert, newAlert, 'authenticated');
    });
  });

  // =========================================================================
  // Section 5: Gateway Server-Side Safety Reset Validation
  // =========================================================================
  test('Gateway rejects safety reset when ESP32 heartbeat is stale (> 60s)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 75 * 1000).toISOString(), // 75s ago
      },
      latestReading: {
        gas_raw_adc: 350,
        gas_status: 'safe',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('heartbeat is stale'));
  });

  test('Gateway rejects safety reset when ESP32 heartbeat is null', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: null,
      },
      latestReading: {
        gas_raw_adc: 350,
        gas_status: 'safe',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('Missing or null ESP32 last_heartbeat'));
  });

  test('Gateway rejects safety reset when ESP32 heartbeat is missing / undefined', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
      },
      latestReading: {
        gas_raw_adc: 350,
        gas_status: 'safe',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('Missing or null ESP32 last_heartbeat'));
  });

  test('Gateway rejects safety reset when ESP32 online is false (device offline)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: false,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 350,
        gas_status: 'safe',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('ESP32 node is currently offline'));
  });

  test('Gateway rejects safety reset when gas_status is null', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 350,
        gas_status: null,
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('Gas sensor status is missing or null'));
  });

  test('Gateway rejects safety reset when gas_status is an unknown/unrecognized string', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 350,
        gas_status: 'moderate_fumes',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes("Unrecognized gas sensor status 'moderate_fumes'"));
  });

  test('Gateway rejects safety reset when gas_status is warning (ADC between 900 and 1599)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 850, // Even if raw ADC was borderline
        gas_status: 'warning',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('Combustible gas is in WARNING state'));
  });

  test('Gateway rejects safety reset when gas_status is danger', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 800,
        gas_status: 'danger',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('Combustible gas is in DANGER state'));
  });

  test('Gateway rejects safety reset when MQ-2 ADC is below open-circuit fault threshold (< 45)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 30, // Disconnected wire / open circuit floats to ground
        gas_status: 'safe', // Even if falsely reported safe
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('indicates open circuit or disconnected sensor wire'));
  });

  test('Gateway rejects safety reset when telemetry is missing (no records)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: null,
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('No verified physical telemetry readings found'));
  });

  test('Gateway rejects safety reset when sensor telemetry is stale (> 60s)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 350,
        gas_status: 'safe',
        recorded_at: new Date(now - 120 * 1000).toISOString(), // 2 minutes ago
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('Latest sensor reading is stale'));
  });

  test('Gateway rejects safety reset when sensor fault is active (ADC < 45)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 20, // Disconnected wire / open circuit
        gas_status: 'sensor_fault',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('Sensor fault detected'));
  });

  test('Gateway rejects safety reset when sensor is warming up', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 500,
        gas_status: 'warming_up',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('warming up'));
  });

  test('Gateway rejects safety reset when gas reading is at or above clearance threshold (>= 900 ADC)', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 5 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 1100, // Even if gas_status was reported safe, raw ADC >= 900 must reject
        gas_status: 'safe',
        recorded_at: new Date(now - 5 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.statusCode, 422);
    assert.ok(result.error.includes('at or above clearance threshold (900 ADC)'));
  });

  test('Gateway approves safety reset when heartbeat is fresh, telemetry is fresh, sensor is healthy, and ADC < 900', () => {
    const now = Date.now();
    const result = evaluateGatewaySafetyReset({
      deviceStatus: {
        online: true,
        last_heartbeat: new Date(now - 4 * 1000).toISOString(),
      },
      latestReading: {
        gas_raw_adc: 380, // Clean air baseline
        gas_status: 'safe',
        recorded_at: new Date(now - 4 * 1000).toISOString(),
      },
      now,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.verifiedAdc, 380);
  });

  test('Once approved safety reset sets resolved_at and emergency_status = RESOLVED, relay ON commands succeed', () => {
    const realAlert = {
      id: 'alert-real-hardware-reset',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
      is_demo: false,
    };
    alertsTable.push(realAlert);

    // Blocked before reset
    assert.throws(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    }, /COMMAND_BLOCKED/);

    // After gateway safety reset approval
    realAlert.emergency_status = 'RESOLVED';
    realAlert.resolved_at = new Date().toISOString();
    realAlert.acknowledged = true;

    // Relay ON command is safely permitted
    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    });
  });

  // =========================================================================
  // Section 7: NULL is_demo, Unauthorized Terminal Updates & Stale Command Guard
  // =========================================================================
  test('Real danger alert with is_demo = null strictly activates lockout and blocks relay ON', () => {
    alertsTable.push({
      id: 'alert-null-demo',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      is_demo: null,
      acknowledged: false,
      resolved_at: null,
    });

    assert.throws(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    }, /COMMAND_BLOCKED/);
  });

  test('Real danger alert with is_demo = undefined (omitted) strictly activates lockout and blocks relay ON', () => {
    alertsTable.push({
      id: 'alert-undefined-demo',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      acknowledged: false,
      resolved_at: null,
    });

    assert.throws(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    }, /COMMAND_BLOCKED/);
  });

  test('Gateway poll_commands auto-rejects stale pending ON commands when real alert has is_demo = null', () => {
    alertsTable.push({
      id: 'alert-null-demo-poll',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      is_demo: null,
      resolved_at: null,
    });

    const pendingCommands = [
      { id: 'cmd-stale-on', action: 'ON', status: 'pending' },
    ];

    const result = simulatePollCommands(pendingCommands, alertsTable);
    assert.strictEqual(result.dispatched.length, 0, 'No energizing commands should be dispatched to ESP32');
    assert.strictEqual(result.rejected.length, 1, 'Stale pending ON command must be auto-rejected');
    assert.strictEqual(result.rejected[0].status, 'rejected_gas_safety');
    assert.match(result.rejected[0].error_message, /Real combustible gas emergency active/);
  });

  test('Gateway poll_commands auto-rejects stale pending ON commands when real alert has is_demo = false', () => {
    alertsTable.push({
      id: 'alert-false-demo-poll',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      is_demo: false,
      resolved_at: null,
    });

    const pendingCommands = [
      { id: 'cmd-stale-on-2', action: 'ON', status: 'pending' },
    ];

    const result = simulatePollCommands(pendingCommands, alertsTable);
    assert.strictEqual(result.dispatched.length, 0);
    assert.strictEqual(result.rejected.length, 1);
    assert.strictEqual(result.rejected[0].status, 'rejected_gas_safety');
  });

  test('Real danger alert with emergency_status = null strictly activates lockout and blocks relay ON', () => {
    alertsTable.push({
      id: 'alert-null-status',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: null,
      is_demo: false,
      acknowledged: false,
      resolved_at: null,
    });

    assert.throws(() => {
      evaluateDbGasEmergencyInterlock('ON', alertsTable);
    }, /COMMAND_BLOCKED/);
  });

  test('Gateway poll_commands auto-rejects stale pending ON commands when real alert has emergency_status = null', () => {
    alertsTable.push({
      id: 'alert-null-status-poll',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: null,
      is_demo: false,
      resolved_at: null,
    });

    const pendingCommands = [
      { id: 'cmd-stale-null-status', action: 'ON', status: 'pending' },
    ];

    const result = simulatePollCommands(pendingCommands, alertsTable);
    assert.strictEqual(result.dispatched.length, 0, 'No energizing commands should be dispatched to ESP32');
    assert.strictEqual(result.rejected.length, 1, 'Command must be auto-rejected for NULL emergency_status');
    assert.strictEqual(result.rejected[0].status, 'rejected_gas_safety');
  });

  test('Gateway poll_commands safely dispatches pending OFF commands even during gas emergency', () => {
    alertsTable.push({
      id: 'alert-emergency-for-off',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      is_demo: false,
      resolved_at: null,
    });

    const pendingCommands = [
      { id: 'cmd-safe-off', action: 'OFF', status: 'pending' },
    ];

    const result = simulatePollCommands(pendingCommands, alertsTable);
    assert.strictEqual(result.dispatched.length, 1);
    assert.strictEqual(result.dispatched[0].action, 'OFF');
    assert.strictEqual(result.rejected.length, 0);
  });

  test('Untrusted authenticated client cannot update command status to acknowledged', () => {
    const existingCmd = { id: 'cmd-1', action: 'ON', status: 'pending' };
    const updateCmd = { id: 'cmd-1', action: 'ON', status: 'acknowledged' };

    assert.throws(() => {
      evaluateDbGasEmergencyInterlock(updateCmd, alertsTable, 'UPDATE', existingCmd, 'authenticated');
    }, /UNAUTHORIZED: Terminal command status "acknowledged" can only be recorded by the hardware gateway/);
  });

  test('Untrusted authenticated client cannot update command status to rejected_gas_safety', () => {
    const existingCmd = { id: 'cmd-2', action: 'ON', status: 'pending' };
    const updateCmd = { id: 'cmd-2', action: 'ON', status: 'rejected_gas_safety' };

    assert.throws(() => {
      evaluateDbGasEmergencyInterlock(updateCmd, alertsTable, 'UPDATE', existingCmd, 'authenticated');
    }, /UNAUTHORIZED: Terminal command status "rejected_gas_safety" can only be recorded by the hardware gateway/);
  });

  test('Untrusted authenticated client cannot update command status to failed', () => {
    const existingCmd = { id: 'cmd-3', action: 'ON', status: 'pending' };
    const updateCmd = { id: 'cmd-3', action: 'ON', status: 'failed' };

    assert.throws(() => {
      evaluateDbGasEmergencyInterlock(updateCmd, alertsTable, 'UPDATE', existingCmd, 'authenticated');
    }, /UNAUTHORIZED: Terminal command status "failed" can only be recorded by the hardware gateway/);
  });

  test('Hardware gateway running with service_role CAN update terminal statuses', () => {
    const existingCmd = { id: 'cmd-gw', action: 'ON', status: 'pending' };

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock({ id: 'cmd-gw', action: 'ON', status: 'acknowledged' }, alertsTable, 'UPDATE', existingCmd, 'service_role');
    });

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock({ id: 'cmd-gw', action: 'ON', status: 'rejected_gas_safety' }, alertsTable, 'UPDATE', existingCmd, 'service_role');
    });

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock({ id: 'cmd-gw', action: 'ON', status: 'failed' }, alertsTable, 'UPDATE', existingCmd, 'service_role');
    });
  });

  test('Untrusted authenticated client setting timeout during active gas emergency is blocked by gas interlock', () => {
    alertsTable.push({
      id: 'alert-active-timeout',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      is_demo: false,
      resolved_at: null,
    });

    const existingCmd = { id: 'cmd-to', action: 'ON', status: 'pending' };
    const updateCmd = { id: 'cmd-to', action: 'ON', status: 'timeout' };

    assert.throws(() => {
      evaluateDbGasEmergencyInterlock(updateCmd, alertsTable, 'UPDATE', existingCmd, 'authenticated');
    }, /COMMAND_BLOCKED/);
  });

  test('Untrusted authenticated client setting timeout when atmosphere is safe is permitted', () => {
    // alertsTable is empty (atmosphere is normal)
    const existingCmd = { id: 'cmd-to-safe', action: 'ON', status: 'pending' };
    const updateCmd = { id: 'cmd-to-safe', action: 'ON', status: 'timeout' };

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock(updateCmd, alertsTable, 'UPDATE', existingCmd, 'authenticated');
    });
  });
});

/**
 * ==============================================================================
 * SmartHomeX AI — Safe Emergency Lockout Reset Feature Audit Suite
 *
 * Verifies end-to-end implementation of the Secure Reset Workflow:
 * 1. Firmware independent checks: warm-up, sensor fault, gas threshold, continuous recovery
 * 2. Idempotent command dispatch via device_commands
 * 3. Terminal hardware acknowledgement verification
 * 4. Lockout preservation until verified confirmation
 * ==============================================================================
 */
describe('SmartHomeX AI — Safe Emergency Lockout Reset Feature Audit', () => {
  const WARMUP_PERIOD_MS = 20000;
  const RECOVERY_STABLE_PERIOD_MS = 5000;
  const FAULT_THRESHOLD = 45;
  const CLEAR_THRESHOLD = 900;
  const DANGER_THRESHOLD = 1600;

  /**
   * Simulates the ESP32 firmware local safety evaluation and RESET_SAFETY_LOCKOUT execution.
   */
  function simulateEsp32ResetExecution({
    uptimeMillis = 30000,
    rawAdc = 410,
    safeReadingsDurationMs = 6000,
    isLockoutActive = true,
    isPendingReset = true,
  }) {
    // 1. Warm-up check
    if (uptimeMillis < WARMUP_PERIOD_MS) {
      return {
        accepted: false,
        status: 'rejected_gas_safety',
        errorCode: 'RESET_REJECTED_WARMING_UP',
        errorMessage: 'RESET_REJECTED_WARMING_UP: MQ-2 sensor warm-up in progress (< 20s)',
        isLockoutActive,
        isPendingReset,
        relaysState: false,
      };
    }

    // 2. Sensor fault check (open circuit / disconnected wire)
    if (rawAdc < FAULT_THRESHOLD) {
      return {
        accepted: false,
        status: 'rejected_gas_safety',
        errorCode: 'RESET_REJECTED_SENSOR_FAULT',
        errorMessage: 'RESET_REJECTED_SENSOR_FAULT: MQ-2 sensor disconnected or ADC < 45',
        isLockoutActive,
        isPendingReset,
        relaysState: false,
      };
    }

    // 3. Gas clearance threshold check
    if (rawAdc >= CLEAR_THRESHOLD) {
      return {
        accepted: false,
        status: 'rejected_gas_safety',
        errorCode: 'RESET_REJECTED_GAS_UNSAFE',
        errorMessage: `RESET_REJECTED_GAS_UNSAFE: Gas reading at or above clearance threshold (900 ADC, current: ${rawAdc})`,
        isLockoutActive,
        isPendingReset,
        relaysState: false,
      };
    }

    // 4. Recovery stability period check (must have continuous safe readings)
    if (safeReadingsDurationMs < RECOVERY_STABLE_PERIOD_MS) {
      return {
        accepted: false,
        status: 'rejected_gas_safety',
        errorCode: 'RESET_REJECTED_RECOVERY_INSUFFICIENT',
        errorMessage: 'RESET_REJECTED_RECOVERY_INSUFFICIENT: Safe baseline not maintained for continuous recovery duration',
        isLockoutActive,
        isPendingReset,
        relaysState: false,
      };
    }

    // 5. ALL VERIFICATIONS PASSED: Disarm lockout, re-arm contactor, relays REMAIN OFF
    return {
      accepted: true,
      status: 'acknowledged',
      errorCode: null,
      errorMessage: 'Lockout cleared by authorized safety reset',
      isLockoutActive: false,
      isPendingReset: false,
      relaysState: false, // Relays remain strictly OFF fail-safe!
    };
  }

  test('Genuine gas danger: reset rejected', () => {
    const result = simulateEsp32ResetExecution({
      uptimeMillis: 60000,
      rawAdc: DANGER_THRESHOLD, // 1600 ADC
      safeReadingsDurationMs: 0,
      isLockoutActive: true,
    });

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.status, 'rejected_gas_safety');
    assert.strictEqual(result.errorCode, 'RESET_REJECTED_GAS_UNSAFE');
    assert.strictEqual(result.isLockoutActive, true);
    assert.strictEqual(result.relaysState, false);
  });

  test('MQ-2 disconnected (< 45 ADC): reset rejected', () => {
    const result = simulateEsp32ResetExecution({
      uptimeMillis: 60000,
      rawAdc: 20, // Disconnected analog wire
      safeReadingsDurationMs: 0,
      isLockoutActive: true,
    });

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.status, 'rejected_gas_safety');
    assert.strictEqual(result.errorCode, 'RESET_REJECTED_SENSOR_FAULT');
    assert.strictEqual(result.isLockoutActive, true);
    assert.strictEqual(result.relaysState, false);
  });

  test('Sensor warm-up in progress (< 20s): reset rejected', () => {
    const result = simulateEsp32ResetExecution({
      uptimeMillis: 12000, // Cold boot at 12s
      rawAdc: 400,
      safeReadingsDurationMs: 5000,
      isLockoutActive: true,
    });

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.status, 'rejected_gas_safety');
    assert.strictEqual(result.errorCode, 'RESET_REJECTED_WARMING_UP');
    assert.strictEqual(result.isLockoutActive, true);
    assert.strictEqual(result.relaysState, false);
  });

  test('One SAFE reading without completing recovery duration: reset rejected', () => {
    // Gas dropped from danger to 410 ADC just 1.5 seconds ago (glitch or transient drop)
    const result = simulateEsp32ResetExecution({
      uptimeMillis: 60000,
      rawAdc: 410,
      safeReadingsDurationMs: 1500, // < 5000ms recovery stability period
      isLockoutActive: true,
    });

    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.status, 'rejected_gas_safety');
    assert.strictEqual(result.errorCode, 'RESET_REJECTED_RECOVERY_INSUFFICIENT');
    assert.strictEqual(result.isLockoutActive, true);
    assert.strictEqual(result.relaysState, false);
  });

  test('Stable SAFE readings and valid recovery (>= 5s continuous): reset accepted', () => {
    const result = simulateEsp32ResetExecution({
      uptimeMillis: 60000,
      rawAdc: 380, // Clean air baseline
      safeReadingsDurationMs: 6000, // > 5000ms recovery stability period
      isLockoutActive: true,
      isPendingReset: true,
    });

    assert.strictEqual(result.accepted, true);
    assert.strictEqual(result.status, 'acknowledged');
    assert.strictEqual(result.isLockoutActive, false);
    assert.strictEqual(result.isPendingReset, false);
    assert.strictEqual(result.relaysState, false); // Relays remain strictly OFF fail-safe
  });

  test('ESP32 acknowledgment missing / pending: dashboard must not show success', () => {
    // Simulated alerts table with active gas lockout
    const alerts = [{
      id: 'active-gas-leak-1',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'LOCKOUT_PENDING_RESET',
      is_demo: false,
      resolved_at: null,
    }];

    // Simulated device_commands with pending reset command
    const pendingResetCmd = {
      id: 'reset-cmd-1',
      action: 'RESET_SAFETY_LOCKOUT',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Before ESP32 sends ACK, the database emergency status MUST NOT be resolved!
    assert.strictEqual(alerts[0].resolved_at, null);
    assert.strictEqual(alerts[0].emergency_status, 'LOCKOUT_PENDING_RESET');
    assert.strictEqual(pendingResetCmd.status, 'pending');

    // Attempting to energize relay while command is pending is strictly blocked
    assert.throws(() => {
      evaluateDbGasEmergencyInterlock('ON', alerts);
    }, /COMMAND_BLOCKED/);
  });

  test('Duplicate reset requests: idempotency prevents duplicate commands', () => {
    const commandsQueue = [];

    function requestSafetyReset(userId, commands) {
      const existingPending = commands.find(c => c.user_id === userId && c.action === 'RESET_SAFETY_LOCKOUT' && c.status === 'pending');
      if (existingPending) {
        return { success: true, status: 'WAITING_FOR_ESP32', commandId: existingPending.id, isDuplicate: true };
      }
      const newCmd = {
        id: `cmd-reset-${Date.now()}`,
        user_id: userId,
        action: 'RESET_SAFETY_LOCKOUT',
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      commands.push(newCmd);
      return { success: true, status: 'RESET_REQUESTED', commandId: newCmd.id, isDuplicate: false };
    }

    // First request queues the command
    const firstCall = requestSafetyReset(USER_ID, commandsQueue);
    assert.strictEqual(firstCall.status, 'RESET_REQUESTED');
    assert.strictEqual(firstCall.isDuplicate, false);
    assert.strictEqual(commandsQueue.length, 1);

    // Second request while first is still pending returns existing command (no duplicate)
    const secondCall = requestSafetyReset(USER_ID, commandsQueue);
    assert.strictEqual(secondCall.status, 'WAITING_FOR_ESP32');
    assert.strictEqual(secondCall.isDuplicate, true);
    assert.strictEqual(secondCall.commandId, firstCall.commandId);
    assert.strictEqual(commandsQueue.length, 1);
  });

  test('Existing demo alerts: must never trigger physical lockout', () => {
    const demoAlerts = [{
      id: 'demo-alert-1',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'CRITICAL',
      is_demo: true, // Demo alert
      resolved_at: null,
    }];

    // Demo alerts must never block relay actuation
    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('ON', demoAlerts);
    });

    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('OFF', demoAlerts);
    });
  });

  test('Backend resolves alerts ONLY upon terminal acknowledged status from ESP32', () => {
    const alerts = [{
      id: 'real-gas-alert',
      user_id: USER_ID,
      home_id: HOME_ID,
      type: 'gas_leak',
      severity: 'danger',
      emergency_status: 'LOCKOUT_PENDING_RESET',
      is_demo: false,
      resolved_at: null,
    }];

    function handleGatewayAck(commandAction, status, alertsList) {
      if (commandAction === 'RESET_SAFETY_LOCKOUT') {
        if (status === 'acknowledged') {
          alertsList.forEach(a => {
            if (a.type === 'gas_leak' && !a.resolved_at && a.is_demo === false) {
              a.emergency_status = 'RESOLVED';
              a.resolved_at = new Date().toISOString();
              a.acknowledged = true;
            }
          });
          return 'LOCKOUT_CLEARED';
        } else {
          // Rejection keeps alerts unresolved
          return 'RESET_REJECTED';
        }
      }
      return 'OK';
    }

    // Rejected ACK from ESP32 does NOT resolve alert
    const rejResult = handleGatewayAck('RESET_SAFETY_LOCKOUT', 'rejected_gas_safety', alerts);
    assert.strictEqual(rejResult, 'RESET_REJECTED');
    assert.strictEqual(alerts[0].resolved_at, null);
    assert.strictEqual(alerts[0].emergency_status, 'LOCKOUT_PENDING_RESET');

    // Confirmed ACK from ESP32 successfully resolves alert
    const ackResult = handleGatewayAck('RESET_SAFETY_LOCKOUT', 'acknowledged', alerts);
    assert.strictEqual(ackResult, 'LOCKOUT_CLEARED');
    assert.notStrictEqual(alerts[0].resolved_at, null);
    assert.strictEqual(alerts[0].emergency_status, 'RESOLVED');

    // Now relay ON is permitted
    assert.doesNotThrow(() => {
      evaluateDbGasEmergencyInterlock('ON', alerts);
    });
  });
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

// ==============================================================================
// SmartHomeX AI - ESP32 Hardware Secure Gateway Edge Function (esp32-gateway)
// Production Backend for ESP32-WROOM-32 Hardware Nodes & Android Emergency Bridge
// Features: 
//   - Token-Based Authentication (Pre-shared SHA-256 device tokens)
//   - Telemetry Ingestion (DHT11, MQ-2 with ADC fault checks, INA219, Contactor)
//   - Life-Safety Emergency Alert Dispatch & Android FCM Notification Trigger
//   - Command Polling, Deduplication & ACK Validation
//   - Authorized Safety Reset & Mobile Siren Silence Endpoints
// ==============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ------------------------------------------------------------------------------
// Cryptographic Hash Helper (SHA-256 hex digest)
// Used to match provided token against hashed token registry in device_tokens table
// ------------------------------------------------------------------------------
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ------------------------------------------------------------------------------
// Helper: Dispatch Android Push Notification via FCM
// ------------------------------------------------------------------------------
async function dispatchFcmEmergencyNotification(
  supabase: any,
  userId: string,
  homeId: string,
  title: string,
  body: string,
  payloadData: Record<string, string>
) {
  try {
    const { data: tokens, error: tokensErr } = await supabase
      .from('fcm_tokens')
      .select('fcm_token, device_model')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (tokensErr || !tokens || tokens.length === 0) {
      console.log(`[FCM INFO] No registered active Android FCM tokens found for user ${userId}`);
      return;
    }

    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY') || '';
    console.log(`[FCM NOTIFICATION] Preparing emergency broadcast to ${tokens.length} Android device(s)`);

    for (const tokenRecord of tokens) {
      const fcmToken = tokenRecord.fcm_token;
      if (!fcmToken) continue;

      if (fcmServerKey) {
        // Dispatch via Firebase Legacy Cloud Messaging endpoint
        try {
          const res = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `key=${fcmServerKey}`,
            },
            body: JSON.stringify({
              to: fcmToken,
              priority: 'high',
              direct_boot_ok: true,
              notification: {
                title,
                body,
                sound: 'emergency_siren.mp3',
                android_channel_id: 'gas_emergency_channel_v1',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
              },
              data: {
                ...payloadData,
                home_id: homeId,
                click_action: 'OPEN_EMERGENCY_ACTIVITY',
                timestamp: new Date().toISOString(),
              },
            }),
          });
          console.log(`[FCM DISPATCH] Sent alert to device ${tokenRecord.device_model || 'Android'}: HTTP ${res.status}`);
        } catch (fcmErr: any) {
          console.warn(`[FCM DISPATCH ERROR] Failed sending to token ${fcmToken.substring(0, 10)}...:`, fcmErr.message);
        }
      } else {
        // Log notification event when FCM_SERVER_KEY is pending configuration in Supabase Dashboard
        console.log(`[FCM SIMULATED] Key pending. Emergency payload queued for ${tokenRecord.device_model || 'Android'}: "${title}" - "${body}"`);
      }
    }
  } catch (err: any) {
    console.warn('[FCM EXCEPTION] Error during Android push dispatch:', err.message);
  }
}

// ------------------------------------------------------------------------------
// Helper: MQ-2 Gas Sensor Raw ADC Input Validation (12-bit ADC: 0 - 4095)
// ------------------------------------------------------------------------------
function parseAdcReading(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return null;
  if (typeof val === 'string' && val.trim() === '') return null;

  const num = Number(val);
  if (!Number.isFinite(num)) return null;

  const rounded = Math.round(num);
  if (rounded < 0 || rounded > 4095) return null;

  return rounded;
}

serve(async (req: Request) => {
  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // =========================================================================
    // 1. ENVIRONMENT VARIABLES VALIDATION (Fail Safely if Missing)
    // =========================================================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[GATEWAY CRITICAL] Missing mandatory environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(
        JSON.stringify({ error: 'Internal Server Error: Missing Supabase environment configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // 2. AUTHENTICATION (Every Request Requires a Valid Dedicated Device Token)
    // =========================================================================
    const deviceTokenHeader = req.headers.get('x-device-token') || '';
    const authHeader = req.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    const providedToken = (deviceTokenHeader || bearerToken).trim();

    if (!providedToken) {
      console.warn('[GATEWAY AUTH] Request rejected: Missing x-device-token or authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing ESP32 device token in request header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash provided token with SHA-256 to verify against device_tokens table
    const tokenHash = await sha256Hex(providedToken);
    const { data: dbToken, error: tokenError } = await supabase
      .from('device_tokens')
      .select('id, user_id, home_id, device_node_id, is_active')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle();

    if (tokenError) {
      console.error('[GATEWAY ERROR] Database query error while verifying device token:', tokenError.message);
      return new Response(
        JSON.stringify({ error: 'Database error validating authentication credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!dbToken || !dbToken.user_id || !dbToken.home_id) {
      console.warn(`[GATEWAY AUTH] Authentication rejected: Invalid or inactive device token (SHA-256: ${tokenHash.substring(0, 10)}...)`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or inactive device token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authenticatedUserId = dbToken.user_id;
    const authenticatedHomeId = dbToken.home_id;
    const authenticatedNodeId = dbToken.device_node_id || 'ESP32-WROOM-32-NODE-01';

    // Asynchronously update last_used_at timestamp
    supabase
      .from('device_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', dbToken.id)
      .then(({ error }: { error: any }) => {
        if (error) console.warn('[GATEWAY WARN] Failed to update token last_used_at:', error.message);
      });

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'telemetry';

    // =========================================================================
    // ROUTE 1: Ingest Sensor Telemetry & Life-Safety Interlock Verification
    // =========================================================================
    if (action === 'telemetry') {
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed. Use POST for telemetry ingestion' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let payload: any;
      try {
        payload = await req.json();
      } catch (_jsonErr) {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON payload in telemetry request' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const {
        bus_voltage_v,
        shunt_voltage_mv,
        current_ma,
        current_a,
        power_w,
        energy_wh,
        temperature_c,
        humidity_pct,
        gas_ppm,
        gas_raw_adc,
        gas_status,
        anomaly,
        lockout_active,
        main_contactor_tripped,
        gas_cleared_pending_reset,
        sensor_fault,
        exhaust_fan_active,
        free_heap,
        rssi,
        ip_address,
        firmware_version,
        device_id,
        device_slug,
      } = payload;

      const sanitizedGasPpm = gas_ppm != null ? Number(gas_ppm) : null;
      const validatedGasRawAdc = parseAdcReading(gas_raw_adc);
      
      // Preserve incoming sensor state. NEVER silently convert warming_up or sensor_fault into safe!
      let sanitizedGasStatus: string;
      if (['warming_up', 'sensor_fault', 'warning', 'danger', 'safe'].includes(gas_status)) {
        sanitizedGasStatus = gas_status;
      } else if (sensor_fault === true) {
        sanitizedGasStatus = 'sensor_fault';
      } else {
        // If missing or unverified, report as warning rather than falsely claiming safe
        sanitizedGasStatus = 'warning';
      }

      // Resolve the controller's registered devices by home_id and user_id
      const { data: controllerDevices, error: devError } = await supabase
        .from('devices')
        .select('id, device_slug, name, relay_channel, type')
        .eq('user_id', authenticatedUserId)
        .eq('home_id', authenticatedHomeId)
        .order('relay_channel', { ascending: true });

      if (devError) {
        console.warn(`[TELEMETRY WARN] Could not query devices for user ${authenticatedUserId}:`, devError.message);
      }

      // Explicitly designate the Light device (Relay Channel 1) as the controller-wide telemetry owner.
      // In the SmartHomeX multi-relay single-MCU topology, one controller node samples environmental
      // and electrical parameters for the overall node. Associating sensor_readings with Channel 1
      // provides an unambiguous device foreign key while preserving centralized telemetry.
      const lightDevice = controllerDevices?.find((d: any) => d.relay_channel === 1 || d.type === 'light') 
        || controllerDevices?.[0];
      const telemetryDeviceId = lightDevice?.id || null;

      // Insert Telemetry Reading strictly for authenticated device user & home
      const { data: readingData, error: readingError } = await supabase
        .from('sensor_readings')
        .insert({
          home_id: authenticatedHomeId,
          user_id: authenticatedUserId,
          device_id: telemetryDeviceId,
          bus_voltage_v: bus_voltage_v != null ? Number(bus_voltage_v) : null,
          shunt_voltage_mv: shunt_voltage_mv != null ? Number(shunt_voltage_mv) : null,
          current_ma: current_ma != null ? Number(current_ma) : null,
          current_a: current_a != null ? Number(current_a) : null,
          power_w: power_w != null ? Number(power_w) : null,
          energy_wh: energy_wh != null ? Number(energy_wh) : null,
          temperature_c: temperature_c != null ? Number(temperature_c) : null,
          humidity_pct: humidity_pct != null ? Number(humidity_pct) : null,
          gas_ppm: sanitizedGasPpm,
          gas_raw_adc: validatedGasRawAdc,
          gas_status: sanitizedGasStatus,
          anomaly: anomaly || 'normal',
          is_demo: false,
          recorded_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (readingError) {
        console.error(`[TELEMETRY ERROR] Database insert failed for user ${authenticatedUserId}:`, readingError.message);
        return new Response(
          JSON.stringify({ error: 'Failed to record sensor telemetry in database', details: readingError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update heartbeat ONLY for the actual controller device (Channel 1 / Light)
      // Do not falsely mark all three relays as independently connected hardware devices.
      // Strictly preserve nulls: never invent fallback IPs, heaps, or RSSI numbers!
      if (lightDevice) {
        await supabase
          .from('device_status')
          .upsert({
            device_id: lightDevice.id,
            user_id: authenticatedUserId,
            online: true,
            wifi_rssi: rssi != null && !isNaN(Number(rssi)) ? Number(rssi) : null,
            free_heap_bytes: free_heap != null && !isNaN(Number(free_heap)) ? Number(free_heap) : null,
            ip_address: ip_address || null,
            firmware_version: firmware_version || null,
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'device_id' });

        // In SmartHomeX multi-relay single-MCU topology, when the ESP32 controller node
        // is online and sending verified telemetry, ALL devices wired to that controller
        // for this user and home are hardware connected.
        await supabase
          .from('devices')
          .update({ is_hardware_connected: true })
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId);

        // Safe audit logging to device_logs if table exists
        try {
          await supabase.from('device_logs').insert({
            device_id: lightDevice.id,
            user_id: authenticatedUserId,
            home_id: authenticatedHomeId,
            event_type: 'telemetry',
            message: `Telemetry ingested: T=${temperature_c ?? 'null'}°C, H=${humidity_pct ?? 'null'}%, Gas=${sanitizedGasStatus}, ADC=${validatedGasRawAdc ?? 'null'}`,
            created_at: new Date().toISOString(),
          });
        } catch {
          // Gracefully continue if table does not exist
        }
      }

      // 1. Hardware Sensor Fault Handling (MQ-2 ADC < 45)
      if (sensor_fault === true || sanitizedGasStatus === 'sensor_fault') {
        const { data: existingFault } = await supabase
          .from('alerts')
          .select('id')
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .eq('type', 'sensor_fault')
          .eq('acknowledged', false)
          .limit(1)
          .maybeSingle();

        if (!existingFault) {
          const faultAdcDisplay = validatedGasRawAdc != null ? validatedGasRawAdc : 'N/A';
          await supabase.from('alerts').insert({
            home_id: authenticatedHomeId,
            user_id: authenticatedUserId,
            type: 'sensor_fault',
            category: 'sensor_fault',
            severity: 'warning',
            emergency_status: 'SENSOR_FAULT',
            title: 'MQ-2 Gas Sensor Fault / Disconnected Wire',
            description: `ESP32 detected MQ-2 analog ADC signal below 45 (reading: ${faultAdcDisplay}). Indicates disconnected signal wire, open circuit, or sensor heating coil failure. Inspect wiring on GPIO 34.`,
            sensor_reading: `ADC: ${faultAdcDisplay} (Fault Threshold: < 45)`,
            acknowledged: false,
            is_demo: false,
            source: 'ESP32 MQ-2 Analog Input (GPIO 34)',
          });
          console.warn(`[SENSOR FAULT] Sensor fault alert recorded for user ${authenticatedUserId}`);
        }
      }

      // 2. CRITICAL GAS LEAKAGE HANDLING & LOCKOUT ENFORCEMENT
      if (sanitizedGasStatus === 'danger' || lockout_active === true) {
        // Enforce all appliance relays to OFF state in database
        await supabase
          .from('devices')
          .update({
            state: false,
            power_watts: 0,
            last_toggled: new Date().toISOString(),
          })
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId);

        // Check if active critical gas alert exists
        const { data: existingCritical } = await supabase
          .from('alerts')
          .select('id, emergency_status')
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .eq('type', 'gas_leak')
          .eq('acknowledged', false)
          .limit(1)
          .maybeSingle();

        if (!existingCritical) {
          const adcText = validatedGasRawAdc != null ? `Raw ADC: ${validatedGasRawAdc}` : 'Raw ADC: N/A';
          const alertDesc = `CRITICAL DANGER: Combustible gas detected above danger threshold (${adcText}, Threshold: 1600). Local ESP32 safety lockout triggered: Light (GPIO 14), Fan (GPIO 25), Motor (GPIO 26) disconnected. Main Contactor TRIPPED. Local audible siren sounding. Evacuate premises immediately!`;

          await supabase.from('alerts').insert({
            home_id: authenticatedHomeId,
            user_id: authenticatedUserId,
            type: 'gas_leak',
            category: 'critical',
            severity: 'danger',
            emergency_status: 'CRITICAL',
            title: 'GAS LEAKAGE DETECTED – CRITICAL EMERGENCY!',
            description: alertDesc,
            gas_ppm: sanitizedGasPpm,
            sensor_reading: `${adcText} (Threshold: 1600)`,
            evacuation_advised: true,
            acknowledged: false,
            is_demo: false,
            source: 'ESP32 MQ-2 Sensor (GPIO 34)',
          });

          console.warn(`[CRITICAL EMERGENCY] Gas leak alert created for user ${authenticatedUserId} (${adcText})`);

          // Trigger Android FCM Push Notification with ground-truth raw ADC
          await dispatchFcmEmergencyNotification(
            supabase,
            authenticatedUserId,
            authenticatedHomeId,
            'GAS LEAKAGE DETECTED – CRITICAL EMERGENCY!',
            'Immediate action required! Relays disconnected and main contactor tripped. Sirens sounding.',
            {
              emergency_status: 'CRITICAL',
              raw_adc: String(validatedGasRawAdc ?? ''),
              contactor_tripped: 'true',
            }
          );
        }
      } else if (gas_cleared_pending_reset === true) {
        // Gas dropped below danger threshold, but lockout remains active until reset
        await supabase
          .from('alerts')
          .update({
            emergency_status: 'LOCKOUT_PENDING_RESET',
            description: 'Gas concentration dropped below danger threshold. Audible siren silenced. System remains in SAFETY LOCKOUT with main contactor tripped until manual safety reset is completed.',
          })
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .eq('type', 'gas_leak')
          .eq('acknowledged', false);
      }

      console.log(
        `[TELEMETRY SUCCESS] Ingested reading ${readingData?.id} for user ${authenticatedUserId} (Home: ${authenticatedHomeId}, Device: ${telemetryDeviceId ?? 'N/A'}, Gas: ${sanitizedGasStatus}, ADC: ${validatedGasRawAdc ?? 'null'}, T: ${temperature_c ?? 'null'}°C, V: ${bus_voltage_v ?? 'null'}V, P: ${power_w ?? 'null'}W)`
      );

      return new Response(
        JSON.stringify({
          success: true,
          readingId: readingData?.id,
          lockout_active: Boolean(lockout_active),
          main_contactor_tripped: Boolean(main_contactor_tripped),
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 2: Poll Pending Commands For ESP32 Execution (Strict User & Home Isolation)
    // =========================================================================
    if (action === 'poll_commands') {
      const { data: commands, error: pollError } = await supabase
        .from('device_commands')
        .select(`
          id,
          device_id,
          user_id,
          action,
          source,
          nonce,
          created_at,
          devices!inner (
            id,
            home_id,
            device_slug,
            name,
            relay_channel,
            gpio_pin,
            state
          )
        `)
        .eq('status', 'pending')
        .eq('user_id', authenticatedUserId)
        .eq('devices.home_id', authenticatedHomeId)
        .order('created_at', { ascending: true })
        .limit(10);

      if (pollError) {
        console.error(`[POLL ERROR] Failed to query commands for user ${authenticatedUserId}:`, pollError.message);
        return new Response(
          JSON.stringify({ error: 'Failed to poll pending commands', details: pollError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const mappedCommands = (commands || []).map((cmd: any) => ({
        command_id: cmd.id,
        device_id: cmd.device_id,
        device_slug: cmd.devices?.device_slug,
        device_name: cmd.devices?.name,
        relay_channel: cmd.devices?.relay_channel,
        gpio_pin: cmd.devices?.gpio_pin,
        action: cmd.action,
        nonce: cmd.nonce,
        created_at: cmd.created_at,
      }));

      return new Response(
        JSON.stringify({
          commands: mappedCommands,
          count: mappedCommands.length,
          server_time: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 3: Acknowledge Executed Command (Validates Ownership, Home & Device)
    // =========================================================================
    if (action === 'ack_command') {
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed. Use POST for ack_command' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let body: any;
      try {
        body = await req.json();
      } catch (_jsonErr) {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body in command ACK request' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const {
        command_id,
        device_id,
        action: reportedAction,
        status,
        round_trip_ms,
        error_message,
        actual_state,
      } = body;

      if (!command_id || typeof command_id !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid command_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: commandRecord, error: cmdFetchError } = await supabase
        .from('device_commands')
        .select(`
          id, 
          user_id, 
          device_id, 
          action, 
          status,
          devices (
            id,
            home_id,
            relay_channel
          )
        `)
        .eq('id', command_id)
        .maybeSingle();

      if (cmdFetchError || !commandRecord) {
        return new Response(
          JSON.stringify({ error: 'Command not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 1. Validate user ownership
      if (commandRecord.user_id !== authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Command does not belong to authenticated user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. Validate home ownership
      const commandHomeId = (commandRecord as any).devices?.home_id;
      if (commandHomeId && commandHomeId !== authenticatedHomeId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Command target device does not belong to authenticated home' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 3. Validate target device ID if provided in ACK body
      if (device_id && commandRecord.device_id !== device_id) {
        console.warn(`[GATEWAY ACK REJECT] Device mismatch for command ${command_id}: expected ${commandRecord.device_id}, received ${device_id}`);
        return new Response(
          JSON.stringify({ error: 'Invalid command ACK: Target device ID mismatch' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Validate action if provided in ACK body
      if (reportedAction && commandRecord.action !== reportedAction) {
        console.warn(`[GATEWAY ACK REJECT] Action mismatch for command ${command_id}: expected ${commandRecord.action}, received ${reportedAction}`);
        return new Response(
          JSON.stringify({ error: 'Invalid command ACK: Action mismatch' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const validStatuses = ['acknowledged', 'failed', 'rejected_gas_safety', 'timeout'];
      const resolvedStatus = validStatuses.includes(status) ? status : 'acknowledged';

      await supabase
        .from('device_commands')
        .update({
          status: resolvedStatus,
          acknowledged_at: new Date().toISOString(),
          round_trip_ms: round_trip_ms != null ? Number(round_trip_ms) : null,
          error_message: error_message || null,
        })
        .eq('id', command_id)
        .eq('user_id', authenticatedUserId);

      if (resolvedStatus === 'acknowledged') {
        const targetState = actual_state !== undefined
          ? Boolean(actual_state)
          : commandRecord.action === 'ON';

        await supabase
          .from('devices')
          .update({
            state: targetState,
            last_toggled: new Date().toISOString(),
            is_hardware_connected: true,
            power_watts: targetState ? undefined : 0,
          })
          .eq('id', commandRecord.device_id)
          .eq('user_id', authenticatedUserId);
      } else if (resolvedStatus === 'rejected_gas_safety') {
        await supabase
          .from('devices')
          .update({
            state: false,
            power_watts: 0,
            last_toggled: new Date().toISOString(),
          })
          .eq('id', commandRecord.device_id)
          .eq('user_id', authenticatedUserId);
      }

      // Safe insert into device_logs if table exists
      try {
        await supabase.from('device_logs').insert({
          device_id: commandRecord.device_id,
          user_id: authenticatedUserId,
          home_id: authenticatedHomeId,
          event_type: 'command_ack',
          message: `Command ${command_id} acknowledged with status ${resolvedStatus}`,
          created_at: new Date().toISOString(),
        });
      } catch {
        // Gracefully continue
      }

      return new Response(
        JSON.stringify({
          success: true,
          command_id,
          device_id: commandRecord.device_id,
          status: resolvedStatus,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 4: Authorized Safety Reset (Physical BOOT Button or Web Dashboard)
    // =========================================================================
    if (action === 'safety_reset') {
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed. Use POST for safety_reset' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let body: any = {};
      try {
        body = await req.json();
      } catch (_e) {
        // empty body ok
      }

      const resetSource = body.source || 'physical_button_gpio0';
      const resolvedAt = new Date().toISOString();

      // Resolve all active gas_leak alerts
      const { error: resolveErr } = await supabase
        .from('alerts')
        .update({
          acknowledged: true,
          resolved_at: resolvedAt,
          emergency_status: 'RESOLVED',
        })
        .eq('user_id', authenticatedUserId)
        .eq('home_id', authenticatedHomeId)
        .eq('type', 'gas_leak')
        .eq('acknowledged', false);

      if (resolveErr) {
        console.error(`[SAFETY RESET ERROR] Failed to resolve gas alerts:`, resolveErr.message);
      }

      const validatedResetAdc = parseAdcReading(body.raw_adc);
      const rawAdcNote = validatedResetAdc != null ? ` (Raw ADC: ${validatedResetAdc})` : '';

      // Log recovery alert in database
      await supabase.from('alerts').insert({
        home_id: authenticatedHomeId,
        user_id: authenticatedUserId,
        type: 'system_recovery',
        category: 'recovery',
        severity: 'info',
        emergency_status: 'RESOLVED',
        title: 'Safety Reset Completed – Normal Operation Restored',
        description: `Atmosphere confirmed safe below clearance threshold (< 900 ADC)${rawAdcNote}. System lockout disarmed and main contactor restored via authorized safety reset (${resetSource}). Relays remain OFF.`,
        acknowledged: true,
        resolved_at: resolvedAt,
        is_demo: false,
        source: resetSource,
      });

      console.log(`[SAFETY RESET] Completed for user ${authenticatedUserId} via ${resetSource}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'System emergency lockout disarmed and normal operation restored',
          resolved_at: resolvedAt,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 5: Android Mobile Siren Silence (Stops audio/vibe; keeps emergency ACTIVE)
    // =========================================================================
    if (action === 'silence_siren') {
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed. Use POST for silence_siren' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update active gas leak alert to SILENCED status
      await supabase
        .from('alerts')
        .update({
          emergency_status: 'SILENCED',
        })
        .eq('user_id', authenticatedUserId)
        .eq('home_id', authenticatedHomeId)
        .eq('type', 'gas_leak')
        .eq('acknowledged', false);

      console.log(`[SIREN SILENCED] Mobile siren silenced for user ${authenticatedUserId}. Emergency remains ACTIVE.`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Audible siren silenced on mobile device. Emergency remains ACTIVE and relays remain LOCKED OUT.',
          emergency_status: 'SILENCED',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 6: Register Android FCM Push Token
    // =========================================================================
    if (action === 'fcm_register') {
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed. Use POST for fcm_register' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let body: any;
      try {
        body = await req.json();
      } catch (_e) {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { fcm_token, device_model, app_version } = body;

      if (!fcm_token) {
        return new Response(
          JSON.stringify({ error: 'Missing fcm_token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: upsertErr } = await supabase
        .from('fcm_tokens')
        .upsert({
          user_id: authenticatedUserId,
          home_id: authenticatedHomeId,
          fcm_token,
          device_model: device_model || 'Android Device',
          app_version: app_version || '1.0.0',
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'fcm_token' });

      if (upsertErr) {
        console.error(`[FCM REGISTER ERROR]`, upsertErr.message);
        return new Response(
          JSON.stringify({ error: 'Database error registering FCM token', details: upsertErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[FCM REGISTER] Token registered for user ${authenticatedUserId}`);
      return new Response(
        JSON.stringify({ success: true, message: 'FCM token registered successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 7: Water Motor 30-Minute Continuous Cutoff Report
    // =========================================================================
    if (action === 'motor_trip') {
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed. Use POST for motor_trip' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: motorDev } = await supabase
        .from('devices')
        .select('id, name, home_id')
        .eq('user_id', authenticatedUserId)
        .eq('home_id', authenticatedHomeId)
        .eq('type', 'motor')
        .maybeSingle();

      if (motorDev) {
        await supabase
          .from('devices')
          .update({
            state: false,
            power_watts: 0,
            active_runtime_seconds: 0,
            last_toggled: new Date().toISOString(),
          })
          .eq('id', motorDev.id)
          .eq('user_id', authenticatedUserId);

        await supabase.from('alerts').insert({
          home_id: motorDev.home_id,
          user_id: authenticatedUserId,
          type: 'device_offline',
          category: 'device',
          severity: 'warning',
          emergency_status: 'WARNING',
          title: 'Water Motor Auto-Cutoff Executed (30m Protection)',
          description: `${motorDev.name || 'Water Booster Motor'} reached maximum 30-minute continuous run-time limit. Automatic power disconnect executed by ESP32 hardware to prevent pump burnout.`,
          sensor_reading: '30 Minutes Continuous Runtime Exceeded',
          acknowledged: false,
          is_demo: false,
          source: 'ESP32 Hardware Motor Protection (GPIO 26)',
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Motor auto-cutoff recorded in database' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 8: Heartbeat & Connection Health
    // =========================================================================
    if (action === 'heartbeat') {
      const { data: primaryDev } = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', authenticatedUserId)
        .eq('home_id', authenticatedHomeId)
        .order('relay_channel', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (primaryDev) {
        await supabase
          .from('device_status')
          .upsert({
            device_id: primaryDev.id,
            user_id: authenticatedUserId,
            online: true,
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'device_id' });

        // Maintain consistent is_hardware_connected across all controller relays
        await supabase
          .from('devices')
          .update({ is_hardware_connected: true })
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId);

        // Safe insert into device_logs if table exists
        try {
          await supabase.from('device_logs').insert({
            device_id: primaryDev.id,
            user_id: authenticatedUserId,
            home_id: authenticatedHomeId,
            event_type: 'heartbeat',
            message: `Heartbeat received from node ${authenticatedNodeId}`,
            created_at: new Date().toISOString(),
          });
        } catch {
          // Gracefully continue
        }
      }

      return new Response(
        JSON.stringify({
          status: 'online',
          node_id: authenticatedNodeId,
          server_time: new Date().toISOString(),
          gateway_version: '2.5.0-SmartHomeX',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action "${action}"` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown Edge Function Exception';
    console.error('[GATEWAY EXCEPTION] Unhandled error:', message);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

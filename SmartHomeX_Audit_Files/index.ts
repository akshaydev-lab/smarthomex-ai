import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

// ==============================================================================
// SmartHomeX AI - ESP32 Hardware Secure Gateway Edge Function (esp32-gateway)
// Production Backend for ESP32-WROOM-32 Hardware Nodes
// Features: Token-Based Authentication, Telemetry Ingestion, Command Queue & ACK,
// Life-Safety Alert Logging, and Heartbeat Synchronization
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

    // Initialize Supabase Admin client with service_role key within secure Edge Runtime
    // The service_role key is NEVER exposed to the client or returned in any response.
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

    // Asynchronously refresh last_used_at on the token record
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
    // ROUTE 1: Ingest Sensor Telemetry (DHT11, MQ-2, INA219, Single-Device Heartbeat)
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
        gas_status,
        anomaly,
        free_heap,
        rssi,
        ip_address,
        firmware_version,
        device_id,
        device_slug,
      } = payload;

      // REQUIREMENT 6: Remove fabricated 500 PPM fallback.
      // MQ-2 analog reading is an indicative index; never fabricate PPM.
      const sanitizedGasPpm = gas_ppm != null ? Number(gas_ppm) : null;
      const sanitizedGasStatus = gas_status === 'danger' || gas_status === 'warning' ? gas_status : 'safe';

      // Insert Telemetry Reading strictly for authenticated device user & home
      const { data: readingData, error: readingError } = await supabase
        .from('sensor_readings')
        .insert({
          home_id: authenticatedHomeId,
          user_id: authenticatedUserId,
          bus_voltage_v: bus_voltage_v != null ? Number(bus_voltage_v) : null,
          shunt_voltage_mv: shunt_voltage_mv != null ? Number(shunt_voltage_mv) : null,
          current_ma: current_ma != null ? Number(current_ma) : null,
          current_a: current_a != null ? Number(current_a) : null,
          power_w: power_w != null ? Number(power_w) : null,
          energy_wh: energy_wh != null ? Number(energy_wh) : null,
          temperature_c: temperature_c != null ? Number(temperature_c) : null,
          humidity_pct: humidity_pct != null ? Number(humidity_pct) : null,
          gas_ppm: sanitizedGasPpm,
          gas_status: sanitizedGasStatus,
          anomaly: anomaly || 'normal',
          is_demo: false, // Flagged as verified hardware telemetry
          recorded_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      // REQUIREMENT 4: Return HTTP 500 if database insert fails
      if (readingError) {
        console.error(`[TELEMETRY ERROR] Database insert failed for user ${authenticatedUserId}:`, readingError.message);
        return new Response(
          JSON.stringify({ error: 'Failed to record sensor telemetry in database', details: readingError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[TELEMETRY INFO] Ingested reading ${readingData?.id} for user ${authenticatedUserId} (Gas: ${sanitizedGasStatus})`);

      // REQUIREMENT 5: Update heartbeat ONLY for the authenticated device, not all devices
      let targetDevice: { id: string } | null = null;

      if (device_id) {
        const { data } = await supabase
          .from('devices')
          .select('id')
          .eq('id', device_id)
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .maybeSingle();
        targetDevice = data;
      } else if (device_slug) {
        const { data } = await supabase
          .from('devices')
          .select('id')
          .eq('device_slug', device_slug)
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .maybeSingle();
        targetDevice = data;
      } else {
        // Fallback to primary controller relay device (Channel 1) for this home
        const { data } = await supabase
          .from('devices')
          .select('id')
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .order('relay_channel', { ascending: true })
          .limit(1)
          .maybeSingle();
        targetDevice = data;
      }

      if (targetDevice) {
        const { error: heartbeatErr } = await supabase
          .from('device_status')
          .upsert({
            device_id: targetDevice.id,
            user_id: authenticatedUserId,
            online: true,
            wifi_rssi: rssi != null ? Number(rssi) : -60,
            free_heap_bytes: free_heap != null ? Number(free_heap) : 160000,
            ip_address: ip_address || '192.168.1.185',
            firmware_version: firmware_version || 'v2.4.1-SmartHomeX-ESP32',
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'device_id' });

        if (heartbeatErr) {
          console.warn(`[HEARTBEAT WARN] Failed to update heartbeat for device ${targetDevice.id}:`, heartbeatErr.message);
        }
      }

      // REQUIREMENT 6 & 8: Life-Safety Gas Alert (Gas safety lockout is kept local to ESP32)
      if (sanitizedGasStatus === 'danger') {
        const { data: existingActive } = await supabase
          .from('alerts')
          .select('id')
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .eq('type', 'gas_leak')
          .eq('severity', 'danger')
          .eq('acknowledged', false)
          .limit(1)
          .maybeSingle();

        if (!existingActive) {
          const alertDescription = sanitizedGasPpm != null
            ? `Combustible gas concentration exceeded critical threshold (Sensor relative reading: ${sanitizedGasPpm}). Local ESP32 hardware safety lockout activated. Relays locked out locally to eliminate spark ignition hazards.`
            : 'Combustible gas detected above critical threshold. Local ESP32 hardware safety lockout activated. Relays locked out locally to eliminate spark ignition hazards.';

          await supabase.from('alerts').insert({
            home_id: authenticatedHomeId,
            user_id: authenticatedUserId,
            type: 'gas_leak',
            severity: 'danger',
            title: 'CRITICAL: Gas Leak Detected by ESP32 (MQ-2)',
            description: alertDescription,
            gas_ppm: sanitizedGasPpm,
            evacuation_advised: true,
            acknowledged: false,
            is_demo: false,
            source: 'ESP32 MQ-2 Sensor (GPIO 34)',
          });
          console.warn(`[SAFETY ALERT] Critical gas leak alert logged for user ${authenticatedUserId}`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          readingId: readingData?.id,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 2: Poll Pending Commands For ESP32 Execution (Strict User Isolation)
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
          devices (
            id,
            device_slug,
            name,
            relay_channel,
            gpio_pin,
            state
          )
        `)
        .eq('status', 'pending')
        .eq('user_id', authenticatedUserId)
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

      console.log(`[POLL INFO] Polled ${mappedCommands.length} pending command(s) for user ${authenticatedUserId}`);
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
    // ROUTE 3: Acknowledge Executed Command
    // REQUIREMENT 7: Validate command ownership, device ID and action before ACK
    // REQUIREMENT 8: Keep gas safety lockout local to ESP32
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
        status, // 'acknowledged', 'failed', 'rejected_gas_safety', 'timeout'
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

      // Step A: Fetch command record to validate existence and ownership
      const { data: commandRecord, error: cmdFetchError } = await supabase
        .from('device_commands')
        .select('id, user_id, device_id, action, status')
        .eq('id', command_id)
        .maybeSingle();

      if (cmdFetchError) {
        console.error(`[ACK ERROR] Failed to fetch command ${command_id}:`, cmdFetchError.message);
        return new Response(
          JSON.stringify({ error: 'Database error fetching command', details: cmdFetchError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!commandRecord) {
        console.warn(`[ACK WARN] Command not found: ${command_id}`);
        return new Response(
          JSON.stringify({ error: 'Command not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step B: Validate Command Ownership (must match authenticated user)
      if (commandRecord.user_id !== authenticatedUserId) {
        console.warn(`[ACK SECURITY] Forbidden: Command ${command_id} belongs to user ${commandRecord.user_id}, not authenticated user ${authenticatedUserId}`);
        return new Response(
          JSON.stringify({ error: 'Forbidden: Command does not belong to the authenticated device user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step C: Validate Device ID (must match command's target device)
      if (device_id && device_id !== commandRecord.device_id) {
        console.warn(`[ACK WARN] Device ID mismatch for command ${command_id}: expected ${commandRecord.device_id}, received ${device_id}`);
        return new Response(
          JSON.stringify({
            error: `Device ID mismatch: Command ${command_id} is for device ${commandRecord.device_id}, but ACK specified ${device_id}`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step D: Validate Action (must match command action if provided)
      if (reportedAction && reportedAction !== commandRecord.action) {
        console.warn(`[ACK WARN] Action mismatch for command ${command_id}: expected ${commandRecord.action}, received ${reportedAction}`);
        return new Response(
          JSON.stringify({
            error: `Action mismatch: Command ${command_id} requested action ${commandRecord.action}, but ACK specified ${reportedAction}`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step E: Normalize status to schema-allowed values
      const validStatuses = ['acknowledged', 'failed', 'rejected_gas_safety', 'timeout'];
      const resolvedStatus = validStatuses.includes(status) ? status : 'acknowledged';

      // Step F: Update command record
      const { error: updateCmdError } = await supabase
        .from('device_commands')
        .update({
          status: resolvedStatus,
          acknowledged_at: new Date().toISOString(),
          round_trip_ms: round_trip_ms != null ? Number(round_trip_ms) : null,
          error_message: error_message || null,
        })
        .eq('id', command_id)
        .eq('user_id', authenticatedUserId);

      if (updateCmdError) {
        console.error(`[ACK ERROR] Failed to update command status for ${command_id}:`, updateCmdError.message);
        return new Response(
          JSON.stringify({ error: 'Failed to update command audit record', details: updateCmdError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step G: Update device state
      // REQUIREMENT 8: Keep gas safety lockout local to ESP32.
      // If status is 'rejected_gas_safety', do NOT energize relay. State remains OFF.
      if (resolvedStatus === 'acknowledged') {
        const targetState = actual_state !== undefined
          ? Boolean(actual_state)
          : commandRecord.action === 'ON';

        const { error: devUpdateError } = await supabase
          .from('devices')
          .update({
            state: targetState,
            last_toggled: new Date().toISOString(),
            is_hardware_connected: true,
            power_watts: targetState ? undefined : 0,
          })
          .eq('id', commandRecord.device_id)
          .eq('user_id', authenticatedUserId);

        if (devUpdateError) {
          console.error(`[ACK ERROR] Failed to update device ${commandRecord.device_id} state:`, devUpdateError.message);
        }
      } else if (resolvedStatus === 'rejected_gas_safety') {
        console.warn(`[SAFETY] Command ${command_id} rejected by local ESP32 gas safety lockout. Enforcing device OFF state.`);
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

      console.log(`[ACK INFO] Command ${command_id} confirmed as "${resolvedStatus}"`);
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
    // ROUTE 4: Water Motor 30-Minute Continuous Cutoff Report
    // =========================================================================
    if (action === 'motor_trip') {
      if (req.method !== 'POST') {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed. Use POST for motor_trip' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: motorDev, error: motorDevErr } = await supabase
        .from('devices')
        .select('id, name, home_id')
        .eq('user_id', authenticatedUserId)
        .eq('home_id', authenticatedHomeId)
        .eq('type', 'motor')
        .maybeSingle();

      if (motorDevErr) {
        console.error(`[MOTOR ERROR] Failed to query motor device:`, motorDevErr.message);
        return new Response(
          JSON.stringify({ error: 'Database error finding motor device', details: motorDevErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
          severity: 'warning',
          title: 'Water Motor Auto-Cutoff Executed (30m Protection)',
          description: `${motorDev.name || 'Water Booster Motor'} reached maximum 30-minute continuous run-time limit. Automatic power disconnect executed by ESP32 hardware to prevent pump burnout.`,
          acknowledged: false,
          is_demo: false,
          source: 'ESP32 Hardware Motor Protection (GPIO 26)',
        });
        console.log(`[MOTOR INFO] Recorded motor cutoff for device ${motorDev.id}`);
      } else {
        console.warn(`[MOTOR WARN] No motor device found for user ${authenticatedUserId}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Motor auto-cutoff recorded in database' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 5: Heartbeat & Connection Health
    // =========================================================================
    if (action === 'heartbeat') {
      // Update single authenticated device status
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
      }

      console.log(`[HEARTBEAT INFO] Heartbeat confirmed for node "${authenticatedNodeId}"`);
      return new Response(
        JSON.stringify({
          status: 'online',
          node_id: authenticatedNodeId,
          server_time: new Date().toISOString(),
          gateway_version: '2.4.1-SmartHomeX',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback for unknown action
    console.warn(`[GATEWAY WARN] Unknown action requested: "${action}"`);
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

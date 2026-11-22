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
// Firebase Cloud Messaging (FCM) HTTP v1 Dispatcher with OAuth2 Web Crypto
// ------------------------------------------------------------------------------
interface FirebaseCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface FcmDispatchResult {
  status: 'sent' | 'failed' | 'unconfigured' | 'no_tokens';
  sentCount: number;
  failedCount: number;
  messageIds: string[];
  error?: string;
}

function getFirebaseCredentials(): FirebaseCredentials | null {
  const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson);
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key,
        };
      }
    } catch (_e) {}
  }

  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY');

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  return null;
}

function base64UrlEncode(strOrBytes: string | Uint8Array): string {
  let base64: string;
  if (typeof strOrBytes === 'string') {
    base64 = btoa(strOrBytes);
  } else {
    let binary = '';
    const len = strOrBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(strOrBytes[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): Uint8Array {
  const clean = pem
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binaryStr = atob(clean);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

let cachedOAuthToken: { token: string; expiresAt: number } | null = null;

async function getGoogleOAuth2AccessToken(creds: FirebaseCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedOAuthToken && cachedOAuthToken.expiresAt > now + 60) {
    return cachedOAuthToken.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const derKey = pemToPkcs8(creds.privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    derKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signedJwt = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 token exchange failed HTTP ${tokenRes.status}: ${errText}`);
  }

  const tokenJson = await tokenRes.json();
  cachedOAuthToken = {
    token: tokenJson.access_token,
    expiresAt: now + (tokenJson.expires_in || 3600),
  };

  return tokenJson.access_token;
}

async function dispatchFcmEmergencyNotification(
  supabase: any,
  userId: string,
  homeId: string,
  title: string,
  body: string,
  payloadData: Record<string, string>
): Promise<FcmDispatchResult> {
  try {
    const { data: tokens, error: tokensErr } = await supabase
      .from('fcm_tokens')
      .select('fcm_token, device_model')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (tokensErr || !tokens || tokens.length === 0) {
      console.log(`[FCM INFO] No registered active Android FCM tokens found for user ${userId}`);
      return { status: 'no_tokens', sentCount: 0, failedCount: 0, messageIds: [] };
    }

    const creds = getFirebaseCredentials();
    if (!creds) {
      console.warn('[FCM HTTP v1 UNCONFIGURED] Firebase service account credentials not found in Edge Function secrets (FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID + FIREBASE_PRIVATE_KEY).');
      return { status: 'unconfigured', sentCount: 0, failedCount: 0, messageIds: [], error: 'FCM service account credentials unconfigured' };
    }

    let accessToken: string;
    try {
      accessToken = await getGoogleOAuth2AccessToken(creds);
    } catch (authErr: any) {
      console.error('[FCM AUTH ERROR] Failed to obtain OAuth2 token for FCM v1:', authErr.message);
      return { status: 'failed', sentCount: 0, failedCount: tokens.length, messageIds: [], error: authErr.message };
    }

    console.log(`[FCM HTTP v1] Preparing emergency broadcast to ${tokens.length} Android device(s) [Project: ${creds.projectId}]`);
    const endpoint = `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`;
    const messageIds: string[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const tokenRecord of tokens) {
      const fcmToken = tokenRecord.fcm_token;
      if (!fcmToken) continue;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token: fcmToken,
              notification: {
                title,
                body,
              },
              data: {
                ...payloadData,
                home_id: homeId,
                click_action: 'OPEN_EMERGENCY_ACTIVITY',
                timestamp: new Date().toISOString(),
              },
              android: {
                priority: 'HIGH',
                direct_boot_ok: true,
                notification: {
                  sound: 'emergency_siren.mp3',
                  channel_id: 'gas_emergency_channel_v1',
                  click_action: 'FLUTTER_NOTIFICATION_CLICK',
                },
              },
            },
          }),
        });

        if (res.ok) {
          const resJson = await res.json();
          sentCount++;
          if (resJson.name) {
            messageIds.push(resJson.name);
          }
          console.log(`[FCM HTTP v1 SENT] Alert dispatched to ${tokenRecord.device_model || 'Android'}: ${resJson.name || 'HTTP 200'}`);
        } else {
          failedCount++;
          const errBody = await res.text();
          console.warn(`[FCM HTTP v1 ERROR] Dispatch failed for ${tokenRecord.device_model || 'Android'} (HTTP ${res.status}): ${errBody}`);
        }
      } catch (fcmErr: any) {
        failedCount++;
        console.warn(`[FCM HTTP v1 EXCEPTION] Failed sending to token ${fcmToken.substring(0, 10)}...:`, fcmErr.message);
      }
    }

    const finalStatus = sentCount > 0 ? 'sent' : (failedCount > 0 ? 'failed' : 'no_tokens');
    return {
      status: finalStatus,
      sentCount,
      failedCount,
      messageIds,
    };
  } catch (err: any) {
    console.warn('[FCM EXCEPTION] Error during Android push dispatch:', err.message);
    return { status: 'failed', sentCount: 0, failedCount: 0, messageIds: [], error: err.message };
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

    let authenticatedUserId = '';
    let authenticatedHomeId = '';
    let authenticatedNodeId = 'ESP32-WROOM-32-NODE-01';

    // 1. Try Device Token Authentication (Hardware ESP32 Node)
    const tokenHash = await sha256Hex(providedToken);
    const { data: dbToken } = await supabase
      .from('device_tokens')
      .select('id, user_id, home_id, device_node_id, is_active')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle();

    if (dbToken?.user_id && dbToken?.home_id) {
      authenticatedUserId = dbToken.user_id;
      authenticatedHomeId = dbToken.home_id;
      authenticatedNodeId = dbToken.device_node_id || 'ESP32-WROOM-32-NODE-01';

      // Asynchronously update last_used_at timestamp
      supabase
        .from('device_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', dbToken.id)
        .then(({ error }: { error: any }) => {
          if (error) console.warn('[GATEWAY WARN] Failed to update token last_used_at:', error.message);
        });
    } else {
      // 2. Try User JWT Authentication (e.g. Authorized Operator on Web Dashboard)
      const { data: userData, error: userError } = await supabase.auth.getUser(providedToken);
      if (userData?.user?.id && !userError) {
        authenticatedUserId = userData.user.id;
        const { data: homeData } = await supabase
          .from('homes')
          .select('id')
          .eq('user_id', authenticatedUserId)
          .limit(1)
          .maybeSingle();

        if (homeData?.id) {
          authenticatedHomeId = homeData.id;
          authenticatedNodeId = 'WEB-DASHBOARD-OPERATOR';
        }
      }
    }

    if (!authenticatedUserId || !authenticatedHomeId) {
      console.warn(`[GATEWAY AUTH] Authentication rejected: Invalid device token or user session`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid device token or user session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
        emergency_cycle_id,
        demo_mode,
        event_type,
        restoration_completed,
        buzzer_active,
        separate_siren_active,
        state_light,
        state_fan,
        state_motor,
        state_street_light,
        state_exhaust,
        pre_light,
        pre_fan,
        pre_motor,
        pre_street_light,
        pre_exhaust,
        snapshot_saved,
      } = payload;

      const parseNumeric = (val: unknown): number | null => {
        if (val === null || val === undefined || val === '') return null;
        const num = Number(val);
        return Number.isFinite(num) ? num : null;
      };

      const sanitizedGasPpm = parseNumeric(gas_ppm);
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

      // Sanitize electrical anomaly classification according to schema check constraint allowlist
      const ALLOWED_ANOMALIES = ['normal', 'overcurrent', 'overpower', 'voltage_sag', 'voltage_surge', 'sensor_fault'];
      let sanitizedAnomaly = 'normal';
      if (typeof anomaly === 'string') {
        const normalized = anomaly.trim().toLowerCase();
        if (ALLOWED_ANOMALIES.includes(normalized)) {
          sanitizedAnomaly = normalized;
        }
      } else if (payload.ina219_fault === true) {
        sanitizedAnomaly = 'sensor_fault';
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
          bus_voltage_v: parseNumeric(bus_voltage_v),
          shunt_voltage_mv: parseNumeric(shunt_voltage_mv),
          current_ma: parseNumeric(current_ma),
          current_a: parseNumeric(current_a),
          power_w: parseNumeric(power_w),
          energy_wh: parseNumeric(energy_wh),
          temperature_c: parseNumeric(temperature_c),
          humidity_pct: parseNumeric(humidity_pct),
          gas_ppm: sanitizedGasPpm,
          gas_raw_adc: validatedGasRawAdc,
          gas_status: sanitizedGasStatus,
          anomaly: sanitizedAnomaly,
          gas_emergency: sanitizedGasStatus === 'danger',
          gas_warmup: sanitizedGasStatus === 'warming_up',
          gas_sensor_fault: sensor_fault === true || sanitizedGasStatus === 'sensor_fault',
          emergency_lockout: Boolean(lockout_active),
          is_demo: Boolean(demo_mode),
          demo_mode: Boolean(demo_mode),
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
          .is('resolved_at', null)
          .eq('is_demo', false)
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

      // Synchronize 5 physical relay states strictly from verified hardware feedback
      if (state_light !== undefined) {
        await supabase.from('devices').update({ state: Boolean(state_light), is_hardware_connected: true, last_toggled: new Date().toISOString() }).eq('home_id', authenticatedHomeId).eq('relay_channel', 1);
      }
      if (state_fan !== undefined) {
        await supabase.from('devices').update({ state: Boolean(state_fan), is_hardware_connected: true, last_toggled: new Date().toISOString() }).eq('home_id', authenticatedHomeId).eq('relay_channel', 2);
      }
      if (state_motor !== undefined) {
        await supabase.from('devices').update({ state: Boolean(state_motor), is_hardware_connected: true, last_toggled: new Date().toISOString() }).eq('home_id', authenticatedHomeId).eq('relay_channel', 3);
      }
      if (state_street_light !== undefined) {
        await supabase.from('devices').update({ state: Boolean(state_street_light), is_hardware_connected: true, last_toggled: new Date().toISOString() }).eq('home_id', authenticatedHomeId).eq('relay_channel', 4);
      }
      if (state_exhaust !== undefined) {
        await supabase.from('devices').update({ state: Boolean(state_exhaust), is_hardware_connected: true, last_toggled: new Date().toISOString() }).eq('home_id', authenticatedHomeId).eq('relay_channel', 5);
      }

      const isDemo = Boolean(demo_mode);

      // 2. CRITICAL GAS LEAKAGE HANDLING & LOCKOUT ENFORCEMENT
      if (sanitizedGasStatus === 'danger' || event_type === 'gas_detected') {
        // Dedicated emergency event tracking in emergency_events
        try {
          const { data: activeEvent } = await supabase
            .from('emergency_events')
            .select('event_id, emergency_cycle_id')
            .eq('home_id', authenticatedHomeId)
            .is('completed_at', null)
            .order('emergency_started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!activeEvent) {
            const preStates = snapshot_saved ? {
              light: Boolean(pre_light),
              fan: Boolean(pre_fan),
              motor: Boolean(pre_motor),
              street_light: Boolean(pre_street_light),
              exhaust_fan: Boolean(pre_exhaust),
            } : null;

            await supabase.from('emergency_events').insert({
              home_id: authenticatedHomeId,
              user_id: authenticatedUserId,
              emergency_cycle_id: emergency_cycle_id || null,
              event_type: 'gas_detected',
              demo_mode: isDemo,
              gas_raw_adc: validatedGasRawAdc,
              gas_status: 'danger',
              gas_emergency: true,
              emergency_lockout: true,
              emergency_started_at: new Date().toISOString(),
              pre_emergency_relay_states: preStates,
              notification_status: 'sent',
            });

            // Insert 5-channel cutoff history into relay_state_history
            const channels = [
              { ch: 1, name: 'Light', pin: 25, prev: Boolean(pre_light), req: false, rep: Boolean(state_light) },
              { ch: 2, name: 'Fan', pin: 26, prev: Boolean(pre_fan), req: false, rep: Boolean(state_fan) },
              { ch: 3, name: 'Motor', pin: 27, prev: Boolean(pre_motor), req: false, rep: Boolean(state_motor) },
              { ch: 4, name: 'Street Light', pin: 14, prev: Boolean(pre_street_light), req: false, rep: Boolean(state_street_light) },
              { ch: 5, name: 'Exhaust Fan', pin: 32, prev: Boolean(pre_exhaust), req: true, rep: Boolean(state_exhaust) },
            ];

            for (const ch of channels) {
              const dev = controllerDevices?.find((d: any) => d.relay_channel === ch.ch);
              await supabase.from('relay_state_history').insert({
                home_id: authenticatedHomeId,
                user_id: authenticatedUserId,
                device_id: dev?.id || null,
                emergency_cycle_id: emergency_cycle_id || null,
                relay_channel: ch.ch,
                device_name: ch.name,
                gpio_pin: ch.pin,
                previous_state: ch.prev,
                requested_state: ch.req,
                reported_state: ch.rep,
                event_source: 'emergency_cutoff',
                demo_mode: isDemo,
                timestamp: new Date().toISOString(),
              });
            }
          }
        } catch (_evErr) {
          // Gracefully continue if table does not yet exist
        }

        // Notification A: GAS DETECTED
        const titleA = isDemo ? '⚠️ GAS DETECTED — DEMO EMERGENCY' : 'GAS LEAKAGE DETECTED – CRITICAL EMERGENCY!';
        const messageA = isDemo 
          ? 'Gas sensor threshold exceeded. Previously ON normal devices were switched OFF, Exhaust Fan was requested ON, and emergency alarms were activated.'
          : 'Immediate action required! Combustible gas detected above danger threshold. Software safety lockout latched. Sirens sounding. Evacuate premises!';
        const alertTypeA = isDemo ? 'gas_detected_demo' : 'gas_leak';

        // Check idempotency per cycle
        let existingCritical = null;
        if (emergency_cycle_id) {
          const { data } = await supabase
            .from('alerts')
            .select('id')
            .eq('user_id', authenticatedUserId)
            .eq('home_id', authenticatedHomeId)
            .eq('emergency_cycle_id', emergency_cycle_id)
            .eq('type', alertTypeA)
            .maybeSingle();
          existingCritical = data;
        } else {
          const { data } = await supabase
            .from('alerts')
            .select('id')
            .eq('user_id', authenticatedUserId)
            .eq('home_id', authenticatedHomeId)
            .eq('type', alertTypeA)
            .is('resolved_at', null)
            .maybeSingle();
          existingCritical = data;
        }

        if (!existingCritical) {
          const adcText = validatedGasRawAdc != null ? `Raw ADC: ${validatedGasRawAdc}` : 'Raw ADC: N/A';
          const { data: newAlert } = await supabase.from('alerts').insert({
            home_id: authenticatedHomeId,
            user_id: authenticatedUserId,
            emergency_cycle_id: emergency_cycle_id || null,
            type: alertTypeA,
            category: 'critical',
            severity: 'danger',
            emergency_status: 'CRITICAL',
            title: titleA,
            description: messageA,
            gas_ppm: sanitizedGasPpm,
            sensor_reading: `${adcText} (Threshold: 1600)`,
            evacuation_advised: true,
            acknowledged: false,
            is_demo: isDemo,
            demo_mode: isDemo,
            notification_provider: 'FCM HTTP v1 / Supabase Realtime',
            dispatch_status: 'pending',
            delivered_at: null,
            source: isDemo ? 'ESP32 DEMO Automation (GPIO 34)' : 'ESP32 MQ-2 Sensor (GPIO 34)',
          }).select('id').maybeSingle();

          console.warn(`[GAS EMERGENCY] Alert created for user ${authenticatedUserId} (${adcText}) [Cycle: ${emergency_cycle_id || 'N/A'}]`);

          const fcmRes = await dispatchFcmEmergencyNotification(
            supabase,
            authenticatedUserId,
            authenticatedHomeId,
            titleA,
            messageA,
            {
              emergency_status: 'CRITICAL',
              raw_adc: String(validatedGasRawAdc ?? ''),
              emergency_cycle_id: String(emergency_cycle_id ?? ''),
              demo_mode: String(isDemo),
            }
          );

          if (newAlert?.id) {
            await supabase.from('alerts').update({
              dispatch_status: fcmRes.status,
              delivered_at: fcmRes.status === 'sent' ? new Date().toISOString() : null,
              delivery_notes: fcmRes.messageIds.length > 0 ? fcmRes.messageIds.join(', ') : (fcmRes.error || null),
            }).eq('id', newAlert.id);
          }

          if (emergency_cycle_id) {
            try {
              await supabase.from('emergency_events').update({
                notification_status: fcmRes.status,
              }).eq('emergency_cycle_id', emergency_cycle_id);
            } catch (_notifErr) {}
          }
        }
      } else if (event_type === 'gas_recovery_started') {
        try {
          if (emergency_cycle_id) {
            await supabase
              .from('emergency_events')
              .update({
                recovery_started_at: new Date().toISOString(),
                event_type: 'gas_recovery_started',
              })
              .eq('emergency_cycle_id', emergency_cycle_id)
              .is('recovery_started_at', null);
          }
        } catch (_recErr) {}
      } else if (event_type === 'gas_cleared' || restoration_completed === true) {
        const completedAt = new Date().toISOString();

        // 1. Update emergency_events record
        try {
          if (emergency_cycle_id) {
            await supabase
              .from('emergency_events')
              .update({
                completed_at: completedAt,
                restoration_completed: true,
                emergency_lockout: false,
                gas_emergency: false,
                gas_status: 'safe',
                event_type: 'automatic_restoration_completed',
              })
              .eq('emergency_cycle_id', emergency_cycle_id);
          }
        } catch (_clearErr) {}

        // 2. Insert 5-channel restoration history into relay_state_history
        try {
          const restoreRelays = [
            { ch: 1, name: 'Light', pin: 25, prev: false, req: Boolean(pre_light), rep: Boolean(state_light) },
            { ch: 2, name: 'Fan', pin: 26, prev: false, req: Boolean(pre_fan), rep: Boolean(state_fan) },
            { ch: 3, name: 'Motor', pin: 27, prev: false, req: Boolean(pre_motor), rep: Boolean(state_motor) },
            { ch: 4, name: 'Street Light', pin: 14, prev: false, req: Boolean(pre_street_light), rep: Boolean(state_street_light) },
            { ch: 5, name: 'Exhaust Fan', pin: 32, prev: true, req: false, rep: Boolean(state_exhaust) },
          ];

          for (const ch of restoreRelays) {
            const dev = controllerDevices?.find((d: any) => d.relay_channel === ch.ch);
            await supabase.from('relay_state_history').insert({
              home_id: authenticatedHomeId,
              user_id: authenticatedUserId,
              device_id: dev?.id || null,
              emergency_cycle_id: emergency_cycle_id || null,
              relay_channel: ch.ch,
              device_name: ch.name,
              gpio_pin: ch.pin,
              previous_state: ch.prev,
              requested_state: ch.req,
              reported_state: ch.rep,
              event_source: 'restoration',
              demo_mode: isDemo,
              timestamp: completedAt,
            });
          }
        } catch (_rstErr) {}

        // 3. Resolve active emergency alerts for this cycle
        if (emergency_cycle_id) {
          await supabase
            .from('alerts')
            .update({
              acknowledged: true,
              resolved_at: completedAt,
              emergency_status: 'RESOLVED',
            })
            .eq('user_id', authenticatedUserId)
            .eq('home_id', authenticatedHomeId)
            .eq('emergency_cycle_id', emergency_cycle_id)
            .is('resolved_at', null);
        }

        // 4. Notification B: GAS CLEARED
        const titleB = '✅ GAS CLEARED — SYSTEM RESTORED';
        const messageB = 'Gas readings remained below the configured clear threshold. Exhaust Fan was switched OFF and previously ON devices were restored.';
        const alertTypeB = 'gas_cleared_demo';

        let existingAlertB = null;
        if (emergency_cycle_id) {
          const { data } = await supabase
            .from('alerts')
            .select('id')
            .eq('user_id', authenticatedUserId)
            .eq('home_id', authenticatedHomeId)
            .eq('emergency_cycle_id', emergency_cycle_id)
            .eq('type', alertTypeB)
            .maybeSingle();
          existingAlertB = data;
        }

        if (!existingAlertB) {
          const adcText = validatedGasRawAdc != null ? `Raw ADC: ${validatedGasRawAdc}` : 'Raw ADC: N/A';
          const { data: newAlertB } = await supabase.from('alerts').insert({
            home_id: authenticatedHomeId,
            user_id: authenticatedUserId,
            emergency_cycle_id: emergency_cycle_id || null,
            type: alertTypeB,
            category: 'recovery',
            severity: 'info',
            emergency_status: 'RESOLVED',
            title: titleB,
            description: messageB,
            gas_ppm: sanitizedGasPpm,
            sensor_reading: `${adcText} (Clear Threshold: 900)`,
            evacuation_advised: false,
            acknowledged: true,
            resolved_at: completedAt,
            is_demo: isDemo,
            demo_mode: isDemo,
            notification_provider: 'FCM HTTP v1 / Supabase Realtime',
            dispatch_status: 'pending',
            delivered_at: null,
            source: 'ESP32 DEMO Automatic Recovery',
          }).select('id').maybeSingle();

          console.log(`[GAS CLEARED] Notification B created for user ${authenticatedUserId} [Cycle: ${emergency_cycle_id || 'N/A'}]`);

          const fcmResB = await dispatchFcmEmergencyNotification(
            supabase,
            authenticatedUserId,
            authenticatedHomeId,
            titleB,
            messageB,
            {
              emergency_status: 'RESOLVED',
              raw_adc: String(validatedGasRawAdc ?? ''),
              emergency_cycle_id: String(emergency_cycle_id ?? ''),
              demo_mode: String(isDemo),
            }
          );

          if (newAlertB?.id) {
            await supabase.from('alerts').update({
              dispatch_status: fcmResB.status,
              delivered_at: fcmResB.status === 'sent' ? new Date().toISOString() : null,
              delivery_notes: fcmResB.messageIds.length > 0 ? fcmResB.messageIds.join(', ') : (fcmResB.error || null),
            }).eq('id', newAlertB.id);
          }

          if (emergency_cycle_id) {
            try {
              await supabase.from('emergency_events').update({
                notification_status: fcmResB.status,
              }).eq('emergency_cycle_id', emergency_cycle_id);
            } catch (_notifErrB) {}
          }
        }
      } else if (lockout_active === true || gas_cleared_pending_reset === true) {
        // Record recovery detection timestamp in emergency_events if event active
        try {
          await supabase
            .from('emergency_events')
            .update({ emergency_recovery_detected_at: new Date().toISOString() })
            .eq('home_id', authenticatedHomeId)
            .is('emergency_recovery_detected_at', null);
        } catch (_evErr2) {
          // Gracefully continue
        }

        // Gas dropped below danger threshold, but lockout remains active until reset
        await supabase
          .from('alerts')
          .update({
            emergency_status: 'LOCKOUT_PENDING_RESET',
            description: 'Gas concentration dropped below danger threshold. Audible siren silenced. System remains in SAFETY LOCKOUT until manual safety reset is completed on GPIO 13 or web dashboard.',
          })
          .eq('user_id', authenticatedUserId)
          .eq('home_id', authenticatedHomeId)
          .eq('type', 'gas_leak')
          .is('resolved_at', null)
          .or('is_demo.is.null,is_demo.eq.false');
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
          devices (
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
        .order('created_at', { ascending: true })
        .limit(10);

      if (pollError) {
        console.error(`[POLL ERROR] Failed to query commands for user ${authenticatedUserId}:`, pollError.message);
        return new Response(
          JSON.stringify({ error: 'Failed to poll pending commands', details: pollError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Life-Safety Gate: Check if an active unresolved real gas hazard or demo lockout exists for this user
      const { data: activeGasHazards } = await supabase
        .from('alerts')
        .select('id, emergency_status, resolved_at, is_demo, emergency_cycle_id')
        .eq('user_id', authenticatedUserId)
        .eq('severity', 'danger')
        .is('resolved_at', null)
        .limit(10);

      const isGasEmergencyActive = Boolean(
        activeGasHazards?.some(
          a => 
            !a.resolved_at && 
            a.emergency_status !== 'RESOLVED' && 
            a.emergency_status !== 'NORMAL'
        )
      );

      const dispatchedCommands: any[] = [];

      for (const cmd of (commands || [])) {
        const actionUpper = (cmd.action || '').toUpperCase().trim();
        const isSafeDeEnergizing = ['OFF', '0', 'FALSE', 'STOP', 'DISABLE', 'EMERGENCY_STOP'].includes(actionUpper);
        const isResetCommand = actionUpper === 'RESET_SAFETY_LOCKOUT';

        if (isGasEmergencyActive && !isSafeDeEnergizing && !isResetCommand) {
          // Auto-reject stale or pending energizing commands during active gas emergency or demo lockout
          const activeCycle = activeGasHazards?.find((a: any) => a.emergency_cycle_id)?.emergency_cycle_id || null;
          console.warn(`[GATEWAY INTERLOCK] Auto-rejecting pending command ${cmd.id} (${cmd.action}) due to active gas lockout`);
          await supabase
            .from('device_commands')
            .update({
              status: 'rejected_gas_safety',
              acknowledged_at: new Date().toISOString(),
              error_message: 'Gateway rejected dispatch: Gas emergency lockout active. Electrical relay switching prohibited.',
              rejection_reason: 'Gas emergency lockout active. Electrical relay switching prohibited.',
              emergency_cycle_id: activeCycle,
            })
            .eq('id', cmd.id)
            .eq('user_id', authenticatedUserId);

          try {
            await supabase.from('device_logs').insert({
              device_id: cmd.device_id,
              user_id: authenticatedUserId,
              home_id: authenticatedHomeId,
              event_type: 'command_rejected',
              message: `Rejected command ${cmd.action} on channel ${(cmd as any).devices?.relay_channel || 'N/A'}: Gas emergency lockout active (Cycle: ${activeCycle || 'N/A'})`,
              created_at: new Date().toISOString(),
            });
          } catch {}
          continue;
        }

        const dev = Array.isArray(cmd.devices) ? cmd.devices[0] : (cmd.devices || {});
        if (dev?.home_id && authenticatedHomeId && dev.home_id !== authenticatedHomeId) {
          continue;
        }

        const relayChannel = Number(dev?.relay_channel) || 1;
        const gpioPin = Number(dev?.gpio_pin) || (relayChannel === 1 ? 25 : relayChannel === 2 ? 26 : relayChannel === 3 ? 27 : relayChannel === 4 ? 14 : relayChannel === 5 ? 32 : -1);

        dispatchedCommands.push({
          command_id: cmd.id,
          device_id: cmd.device_id,
          device_slug: dev?.device_slug,
          device_name: dev?.name,
          relay_channel: relayChannel,
          gpio_pin: gpioPin,
          action: cmd.action,
          nonce: cmd.nonce,
          created_at: cmd.created_at,
        });
      }

      return new Response(
        JSON.stringify({
          commands: dispatchedCommands,
          count: dispatchedCommands.length,
          gas_lockout_active: isGasEmergencyActive,
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
      const devRecord = Array.isArray((commandRecord as any).devices)
        ? (commandRecord as any).devices[0]
        : (commandRecord as any).devices;
      const commandHomeId = devRecord?.home_id;
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

      // Handle RESET_SAFETY_LOCKOUT command acknowledgement from ESP32
      if (commandRecord.action === 'RESET_SAFETY_LOCKOUT') {
        if (resolvedStatus === 'acknowledged') {
          const resolvedAt = new Date().toISOString();
          console.log(`[RESET CONFIRMED BY HARDWARE] ESP32 confirmed safety reset for user ${authenticatedUserId}. Resolving gas alerts...`);
          
          await supabase
            .from('alerts')
            .update({
              acknowledged: true,
              resolved_at: resolvedAt,
              emergency_status: 'RESOLVED',
            })
            .eq('user_id', authenticatedUserId)
            .eq('type', 'gas_leak')
            .is('resolved_at', null)
            .or('is_demo.is.null,is_demo.eq.false');

          // Log verified recovery alert
          await supabase.from('alerts').insert({
            home_id: authenticatedHomeId,
            user_id: authenticatedUserId,
            type: 'system_recovery',
            category: 'recovery',
            severity: 'info',
            emergency_status: 'RESOLVED',
            title: 'Safety Reset Confirmed by Hardware – Normal Operation Restored',
            description: 'ESP32 hardware node independently verified stable clean atmosphere and disarmed local safety lockout. Relays remain safely OFF.',
            acknowledged: true,
            resolved_at: resolvedAt,
            is_demo: false,
            source: 'ESP32 Hardware Verification',
          });
        } else {
          console.warn(`[RESET REJECTED BY HARDWARE] ESP32 rejected reset for command ${command_id}: ${error_message || 'Hardware safety check failed'}`);
          // Lockout remains ACTIVE in database; alerts remain UNRESOLVED.
        }
      } else if (resolvedStatus === 'acknowledged') {
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

      // Safe insert into relay_state_history if table exists
      try {
        const devRecord = Array.isArray((commandRecord as any).devices)
          ? (commandRecord as any).devices[0]
          : (commandRecord as any).devices;

        await supabase.from('relay_state_history').insert({
          home_id: authenticatedHomeId,
          user_id: authenticatedUserId,
          device_id: commandRecord.device_id,
          relay_channel: devRecord?.relay_channel || 1,
          device_name: devRecord?.name || 'Device',
          previous_state: devRecord?.state,
          new_state: resolvedStatus === 'acknowledged' ? (actual_state !== undefined ? Boolean(actual_state) : commandRecord.action === 'ON') : false,
          event_source: commandRecord.action === 'RESET_SAFETY_LOCKOUT' ? 'emergency_cutoff' : 'cloud',
        });
      } catch (_histErr) {
        // Gracefully continue
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
      const now = Date.now();
      const MAX_STALE_MS = 60 * 1000; // 60 seconds

      // 1. Verify ESP32 Heartbeat Freshness from device_status
      const { data: statusRows, error: statusErr } = await supabase
        .from('device_status')
        .select('online, last_heartbeat')
        .eq('user_id', authenticatedUserId)
        .order('last_heartbeat', { ascending: false })
        .limit(1);

      const latestStatus = statusRows?.[0];
      if (statusErr || !latestStatus) {
        console.warn(`[SAFETY RESET REJECTED] No device status found for user ${authenticatedUserId}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: ESP32 hardware status unavailable. Cannot confirm device health.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Explicitly require online === true (reject false, null, undefined)
      if (latestStatus.online !== true) {
        console.warn(`[SAFETY RESET REJECTED] ESP32 node is offline (device_status.online is not true)`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: ESP32 node is currently offline. Hardware must be connected and active to perform safety reset.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Explicitly require valid, non-null last_heartbeat timestamp (no fallback to updated_at)
      if (!latestStatus.last_heartbeat || typeof latestStatus.last_heartbeat !== 'string') {
        console.warn(`[SAFETY RESET REJECTED] ESP32 last_heartbeat is null or missing`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: Missing or null ESP32 last_heartbeat timestamp. Cannot confirm node connectivity.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const heartbeatTimestamp = new Date(latestStatus.last_heartbeat).getTime();
      if (Number.isNaN(heartbeatTimestamp)) {
        console.warn(`[SAFETY RESET REJECTED] ESP32 last_heartbeat is an invalid date string`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: Invalid ESP32 last_heartbeat format. Cannot verify node health.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const heartbeatAgeMs = now - heartbeatTimestamp;
      if (heartbeatAgeMs > MAX_STALE_MS || heartbeatAgeMs < 0) {
        console.warn(`[SAFETY RESET REJECTED] ESP32 heartbeat is stale (${Math.round(heartbeatAgeMs / 1000)}s old)`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `SAFETY_RESET_REJECTED: ESP32 heartbeat is stale (${Math.round(heartbeatAgeMs / 1000)}s old). Fresh hardware heartbeat (≤ 60s) required.`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 2. Verify Fresh Real Telemetry from sensor_readings
      const { data: readingRows, error: readingErr } = await supabase
        .from('sensor_readings')
        .select('gas_raw_adc, gas_status, recorded_at')
        .eq('user_id', authenticatedUserId)
        .eq('home_id', authenticatedHomeId)
        .eq('is_demo', false)
        .order('recorded_at', { ascending: false })
        .limit(1);

      const latestReading = readingRows?.[0];
      if (readingErr || !latestReading) {
        console.warn(`[SAFETY RESET REJECTED] No verified physical sensor readings found for user ${authenticatedUserId}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: No verified physical telemetry readings found. Cannot verify atmospheric clearance.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!latestReading.recorded_at || typeof latestReading.recorded_at !== 'string') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: Missing recorded_at timestamp on latest sensor reading.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const telemetryAgeMs = now - new Date(latestReading.recorded_at).getTime();
      if (telemetryAgeMs > MAX_STALE_MS || telemetryAgeMs < 0) {
        console.warn(`[SAFETY RESET REJECTED] Sensor telemetry is stale (${Math.round(telemetryAgeMs / 1000)}s old)`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `SAFETY_RESET_REJECTED: Latest sensor reading is stale (${Math.round(telemetryAgeMs / 1000)}s old). Fresh telemetry required.`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 3. Validate gas_status against explicitly allowed healthy/safe contract
      // Firmware telemetry contract: 'warming_up' | 'sensor_fault' | 'warning' | 'danger' | 'safe'
      // ONLY 'safe' is allowed for authorized safety reset. Reject null, unknown, warning, danger, warming_up, sensor_fault.
      const ALLOWED_SAFE_GAS_STATUS = 'safe';
      const rawGasStatus = typeof latestReading.gas_status === 'string' ? latestReading.gas_status.trim().toLowerCase() : null;

      if (!rawGasStatus) {
        console.warn(`[SAFETY RESET REJECTED] Telemetry gas_status is null or missing`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: Gas sensor status is missing or null. Cannot confirm safe atmosphere.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rawGasStatus === 'warming_up') {
        console.warn(`[SAFETY RESET REJECTED] MQ-2 sensor is still warming up`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: MQ-2 sensor is warming up. Thermal stabilization required before reset.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rawGasStatus === 'sensor_fault') {
        console.warn(`[SAFETY RESET REJECTED] MQ-2 sensor fault active`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: Sensor fault detected on MQ-2 input. Inspect wiring on GPIO 34 before reset.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rawGasStatus === 'warning') {
        console.warn(`[SAFETY RESET REJECTED] MQ-2 sensor is in warning state`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: Combustible gas is in WARNING state (ADC between 900 and 1599). Atmosphere is not safe.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rawGasStatus === 'danger') {
        console.warn(`[SAFETY RESET REJECTED] MQ-2 sensor is in danger state`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: Combustible gas is in DANGER state. Reset is prohibited.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rawGasStatus !== ALLOWED_SAFE_GAS_STATUS) {
        console.warn(`[SAFETY RESET REJECTED] Unknown gas_status: ${rawGasStatus}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `SAFETY_RESET_REJECTED: Unrecognized gas sensor status '${rawGasStatus}'. Only verified 'safe' telemetry is permitted.`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Verify MQ-2 ADC is Strictly Below Clearance Threshold (< 900) and Valid (>= 45)
      const currentAdc = latestReading.gas_raw_adc;
      if (currentAdc == null) {
        console.warn(`[SAFETY RESET REJECTED] MQ-2 gas_raw_adc is null`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: MQ-2 raw ADC telemetry is null. Direct sensor reading required.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (currentAdc < 45) {
        console.warn(`[SAFETY RESET REJECTED] MQ-2 raw ADC (${currentAdc}) below open-circuit fault threshold (45)`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `SAFETY_RESET_REJECTED: MQ-2 raw ADC (${currentAdc}) indicates open circuit or disconnected sensor wire (< 45 ADC).`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (currentAdc >= 900) {
        console.warn(`[SAFETY RESET REJECTED] Combustible gas ADC (${currentAdc}) is at or above clearance threshold (900)`);
        return new Response(
          JSON.stringify({
            success: false,
            error: `SAFETY_RESET_REJECTED: Combustible gas reading (${currentAdc} ADC) is at or above clearance threshold (900 ADC). Atmosphere is not safe.`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Also validate request body ADC if provided
      const bodyAdc = parseAdcReading(body.raw_adc);
      if (bodyAdc != null && bodyAdc >= 900) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `SAFETY_RESET_REJECTED: Provided ADC reading (${bodyAdc}) exceeds clearance threshold (900 ADC).`,
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 5. Verification Passed: Differentiate Physical Button vs Remote Dashboard Reset
      if (resetSource === 'physical_button_gpio0' || resetSource === 'physical_button_gpio13') {
        // Physical Button on GPIO 0 or GPIO 13 was pressed: ESP32 hardware already verified clean air locally
        // and cleared local lockout variables prior to reporting this event.
        const resolvedAt = new Date().toISOString();

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
          .is('resolved_at', null)
          .or('is_demo.is.null,is_demo.eq.false');

        if (resolveErr) {
          console.error(`[SAFETY RESET ERROR] Failed to resolve gas alerts:`, resolveErr.message);
        }

        // Log recovery alert in database
        await supabase.from('alerts').insert({
          home_id: authenticatedHomeId,
          user_id: authenticatedUserId,
          type: 'system_recovery',
          category: 'recovery',
          severity: 'info',
          emergency_status: 'RESOLVED',
          title: 'Physical Safety Reset Completed – Normal Operation Restored',
          description: `Atmosphere independently verified safe (< 900 ADC, latest reading: ${currentAdc} ADC). System lockout disarmed via physical button on ${resetSource === 'physical_button_gpio13' ? 'GPIO 13' : 'GPIO 0'}. Relays remain OFF until commanded.`,
          acknowledged: true,
          resolved_at: resolvedAt,
          is_demo: false,
          source: resetSource,
        });

        // Record manual reset in emergency_events
        try {
          await supabase
            .from('emergency_events')
            .update({
              manual_reset_at: resolvedAt,
              reset_authorized_by: resetSource,
              emergency_lockout: false,
            })
            .eq('home_id', authenticatedHomeId)
            .is('manual_reset_at', null);
        } catch (_evErrReset) {
          // Gracefully continue
        }

        console.log(`[SAFETY RESET APPROVED] Completed for user ${authenticatedUserId} via ${resetSource} (Verified ADC: ${currentAdc})`);

        return new Response(
          JSON.stringify({
            success: true,
            status: 'LOCKOUT_CLEARED',
            message: 'Physical safety reset confirmed by hardware. System emergency lockout disarmed.',
            resolved_at: resolvedAt,
            verified_raw_adc: currentAdc,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Remote / Dashboard Reset Request:
      // DO NOT resolve alerts directly! Follow the Secure Reset Workflow:
      // Create a dedicated RESET_SAFETY_LOCKOUT command in device_commands, dispatch to ESP32,
      // and resolve the emergency ONLY after receiving hardware acknowledgement!
      
      // Check if an active unresolved real gas hazard exists
      const { data: activeGasHazards } = await supabase
        .from('alerts')
        .select('id, emergency_status')
        .eq('user_id', authenticatedUserId)
        .eq('type', 'gas_leak')
        .eq('severity', 'danger')
        .is('resolved_at', null)
        .or('is_demo.is.null,is_demo.eq.false')
        .limit(5);

      const hasActiveHazard = Boolean(
        activeGasHazards?.some(
          a => a.emergency_status !== 'RESOLVED' && a.emergency_status !== 'NORMAL'
        )
      );

      if (!hasActiveHazard) {
        return new Response(
          JSON.stringify({
            success: true,
            status: 'LOCKOUT_CLEARED',
            message: 'No active gas hazard or lockout pending reset.',
            verified_raw_adc: currentAdc,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Idempotency Guard: Prevent duplicate pending reset commands
      const { data: existingCmd } = await supabase
        .from('device_commands')
        .select('id, status, created_at')
        .eq('user_id', authenticatedUserId)
        .eq('action', 'RESET_SAFETY_LOCKOUT')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCmd) {
        console.log(`[SAFETY RESET IDEMPOTENT] Existing pending reset command found: ${existingCmd.id}`);
        return new Response(
          JSON.stringify({
            success: true,
            status: 'WAITING_FOR_ESP32',
            command_id: existingCmd.id,
            message: 'Reset request is already queued. Awaiting ESP32 hardware safety verification.',
            verified_raw_adc: currentAdc,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find user's target device to attach the command
      const { data: targetDevice, error: devErr } = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', authenticatedUserId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (devErr || !targetDevice) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'SAFETY_RESET_REJECTED: No target device registered for user account.',
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Queue dedicated RESET_SAFETY_LOCKOUT command in device_commands
      const { data: newCmd, error: insertErr } = await supabase
        .from('device_commands')
        .insert({
          device_id: targetDevice.id,
          user_id: authenticatedUserId,
          action: 'RESET_SAFETY_LOCKOUT',
          status: 'pending',
          source: 'safety_override',
          nonce: crypto.randomUUID(),
          payload: {
            source: resetSource,
            operator: body.operator || 'Authorized Operator',
            requested_at: new Date().toISOString(),
            verified_adc: currentAdc,
          },
        })
        .select('id, created_at')
        .single();

      if (insertErr || !newCmd) {
        console.error('[SAFETY RESET ERROR] Failed to insert reset command:', insertErr?.message);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to queue safety reset command: ${insertErr?.message || 'Database error'}`,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[SAFETY RESET QUEUED] Dispatched RESET_SAFETY_LOCKOUT command ${newCmd.id} for ESP32 verification.`);

      return new Response(
        JSON.stringify({
          success: true,
          status: 'RESET_REQUESTED',
          command_id: newCmd.id,
          message: 'Reset command dispatched to ESP32. Awaiting independent hardware safety verification.',
          verified_raw_adc: currentAdc,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ROUTE 4b: Check Reset Command Status (For Polling Reset Progression)
    // =========================================================================
    if (action === 'check_reset_status') {
      const url = new URL(req.url);
      const commandId = url.searchParams.get('command_id');
      if (!commandId) {
        return new Response(
          JSON.stringify({ error: 'Missing command_id query parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: cmdRecord, error: cmdErr } = await supabase
        .from('device_commands')
        .select('id, action, status, error_message, acknowledged_at, created_at')
        .eq('id', commandId)
        .eq('user_id', authenticatedUserId)
        .maybeSingle();

      if (cmdErr || !cmdRecord) {
        return new Response(
          JSON.stringify({ error: 'Command not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          command_id: cmdRecord.id,
          action: cmdRecord.action,
          status: cmdRecord.status,
          error_message: cmdRecord.error_message,
          acknowledged_at: cmdRecord.acknowledged_at,
          created_at: cmdRecord.created_at,
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
        .is('resolved_at', null)
        .or('is_demo.is.null,is_demo.eq.false');

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

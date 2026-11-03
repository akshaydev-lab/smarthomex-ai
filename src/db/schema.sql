-- ==============================================================================
-- SmartHomeX AI - Production PostgreSQL Database Schema & Row Level Security
-- PostgreSQL 15+ / Supabase Compatible
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- Table 1: profiles (User Profile Data linked to auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'IoT Administrator',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on email
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ==============================================================================
-- Table 2: homes (Smart Home Estate / Property Entity)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'SmartHomeX Smart Villa',
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homes_user_id ON public.homes(user_id);

-- ==============================================================================
-- Table 3: devices (4-Channel Relays & Connected IoT Loads)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_slug TEXT NOT NULL, -- e.g. 'relay-1', 'relay-2', 'relay-3', 'relay-4'
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('light', 'fan', 'motor', 'exhaust_fan')),
  relay_channel INT NOT NULL CHECK (relay_channel BETWEEN 1 AND 4),
  gpio_pin INT NOT NULL,
  state BOOLEAN NOT NULL DEFAULT false,
  control_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK (control_mode IN ('MANUAL', 'AUTO')),
  manual_override_active BOOLEAN NOT NULL DEFAULT false,
  manual_override_expires_at TIMESTAMPTZ,
  max_runtime_minutes INT DEFAULT NULL, -- 30 min auto-cutoff protection for pump
  active_runtime_seconds INT NOT NULL DEFAULT 0,
  room TEXT NOT NULL,
  power_watts NUMERIC(8,2) NOT NULL DEFAULT 0,
  rated_watts NUMERIC(8,2) NOT NULL,
  last_toggled TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_hardware_connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_device_slug UNIQUE (user_id, device_slug)
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_home_id ON public.devices(home_id);
CREATE INDEX IF NOT EXISTS idx_devices_channel ON public.devices(relay_channel);

-- ==============================================================================
-- Table 4: sensor_readings (Time-Series Telemetry: INA219, DHT11, MQ-2)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  bus_voltage_v NUMERIC(6,2),
  shunt_voltage_mv NUMERIC(6,2),
  current_ma NUMERIC(8,2),
  current_a NUMERIC(6,2),
  power_w NUMERIC(8,2),
  energy_wh NUMERIC(12,2),
  temperature_c NUMERIC(4,1),
  humidity_pct NUMERIC(4,1),
  gas_ppm NUMERIC(6,1), -- Indicative relative gas index (MQ-2 uncalibrated analog estimate, not certified laboratory PPM)
  gas_raw_adc INT, -- MQ-2 Raw 12-bit ADC (0 - 4095) from ESP32 GPIO 34
  gas_status TEXT CHECK (gas_status IN ('safe', 'warning', 'danger', 'warming_up', 'sensor_fault')) DEFAULT 'warming_up',
  anomaly TEXT CHECK (anomaly IN ('normal', 'overcurrent', 'overpower', 'voltage_sag', 'voltage_surge')) DEFAULT 'normal',
  is_demo BOOLEAN NOT NULL DEFAULT true,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_user_recorded ON public.sensor_readings(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_gas ON public.sensor_readings(gas_status);

-- ==============================================================================
-- Table 5: device_commands (Secure Command Queue & Hardware Acknowledgements)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('ON', 'OFF')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'schedule', 'master', 'safety_override', 'ai_voice')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'acknowledged', 'failed', 'timeout', 'rejected_gas_safety')) DEFAULT 'pending',
  error_message TEXT,
  round_trip_ms INT,
  nonce TEXT NOT NULL,
  auth_token_signature TEXT,
  payload JSONB,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_commands_device_status ON public.device_commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_device_commands_created ON public.device_commands(created_at DESC);

-- ==============================================================================
-- Table 6: device_schedules (Device Timers & Scheduling Automation)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.device_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('ON', 'OFF')),
  scheduled_time TIME NOT NULL,
  scheduled_date DATE,
  repeat_type TEXT NOT NULL CHECK (repeat_type IN ('once', 'daily', 'weekdays', 'weekends', 'custom')),
  repeat_days TEXT[] DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_executed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_user_enabled ON public.device_schedules(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_device ON public.device_schedules(device_id);

-- ==============================================================================
-- Table 7: automation_rules (Event-Driven Rules & Firmware Local Triggers)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('safety', 'comfort', 'energy')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('sensor_threshold', 'time_schedule', 'device_state')),
  condition_json JSONB NOT NULL DEFAULT '{}',
  action_json JSONB NOT NULL DEFAULT '{}',
  target_device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  action_state BOOLEAN,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_esp32_local_rule BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_user ON public.automation_rules(user_id, enabled);

-- ==============================================================================
-- Table 8: alerts (Incident Notifications & Evacuation Safety Log)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gas_leak', 'smoke', 'high_temp', 'device_offline', 'abnormal_power')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'danger')),
  emergency_status TEXT CHECK (emergency_status IN ('NORMAL', 'WARNING', 'CRITICAL', 'SILENCED', 'RESOLVED', 'SENSOR_FAULT', 'DEVICE_OFFLINE', 'EMERGENCY_LOCKOUT', 'LOCKOUT_PENDING_RESET')) DEFAULT 'NORMAL',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT,
  action_taken TEXT,
  gas_ppm NUMERIC(6,1),
  sensor_reading TEXT,
  room TEXT,
  evacuation_advised BOOLEAN DEFAULT false,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_acknowledged ON public.alerts(user_id, acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON public.alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_emergency_status ON public.alerts(user_id, emergency_status, created_at DESC);

-- ==============================================================================
-- Table 9: device_status (Realtime Node Heartbeats & Telemetry Health)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.device_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL UNIQUE REFERENCES public.devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  online BOOLEAN NOT NULL DEFAULT false,
  wifi_rssi INT,
  free_heap_bytes INT,
  ip_address TEXT,
  firmware_version TEXT,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_status_device_id ON public.device_status(device_id);

-- ==============================================================================
-- Enable Row Level Security (RLS) On All 9 Tables
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_status ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS Policies (Users Can Only Access Their Own Data)
-- ==============================================================================

-- Profiles Policy
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Homes Policy
CREATE POLICY "Users can manage own homes" ON public.homes
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Devices Policy
CREATE POLICY "Users can manage own devices" ON public.devices
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Sensor Readings Policy
CREATE POLICY "Users can view own sensor readings" ON public.sensor_readings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sensor readings" ON public.sensor_readings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Device Commands Policy
CREATE POLICY "Users can view own device commands" ON public.device_commands
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can dispatch device commands" ON public.device_commands
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.devices WHERE devices.id = device_id AND devices.user_id = auth.uid())
  );

CREATE POLICY "Users can update command acknowledgements" ON public.device_commands
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE devices.id = device_commands.device_id
        AND devices.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    status = 'timeout' AND
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE devices.id = device_commands.device_id
        AND devices.user_id = auth.uid()
    )
  );

-- ==============================================================================
-- Table 10: device_tokens (Hardware Node Authentication & Token Registry)
-- Every hardware device possesses a unique token, stored as a cryptographic SHA-256 hash.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  device_node_id TEXT NOT NULL DEFAULT 'ESP32-WROOM-32-NODE-01',
  token_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash of device token
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_hash ON public.device_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_node ON public.device_tokens(device_node_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.device_tokens TO service_role;
REVOKE ALL ON public.device_tokens FROM anon;
REVOKE ALL ON public.device_tokens FROM authenticated;
REVOKE ALL ON public.device_tokens FROM PUBLIC;

GRANT SELECT (id, user_id, home_id, device_node_id, is_active, last_used_at, created_at)
  ON public.device_tokens TO authenticated;
GRANT UPDATE (is_active)
  ON public.device_tokens TO authenticated;
GRANT DELETE
  ON public.device_tokens TO authenticated;

REVOKE SELECT (token_hash) ON public.device_tokens FROM PUBLIC, anon, authenticated;

CREATE POLICY "Users can view own device token metadata" ON public.device_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update own device token status" ON public.device_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own device tokens" ON public.device_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Client-Safe View: user_device_tokens (Omits token_hash entirely)
CREATE OR REPLACE VIEW public.user_device_tokens 
WITH (security_invoker = true) AS
  SELECT id, user_id, home_id, device_node_id, is_active, last_used_at, created_at
  FROM public.device_tokens
  WHERE user_id = auth.uid();

GRANT SELECT ON public.user_device_tokens TO authenticated;
REVOKE ALL ON public.user_device_tokens FROM anon, PUBLIC;

-- ------------------------------------------------------------------------------
-- Dual Secure Device Registration Functions
-- ------------------------------------------------------------------------------

-- Function A: Authenticated User Self-Registration
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_home_id UUID,
  p_device_node_id TEXT,
  p_raw_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_token_hash TEXT;
  v_token_id UUID;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.homes 
    WHERE id = p_home_id AND user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Invalid home_id: Home record does not exist or does not belong to the authenticated user';
  END IF;

  IF p_raw_token IS NULL OR length(trim(p_raw_token)) < 16 THEN
    RAISE EXCEPTION 'Device token too short: Minimum 16 characters required for hardware security';
  END IF;

  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  INSERT INTO public.device_tokens (
    user_id,
    home_id,
    device_node_id,
    token_hash,
    is_active
  ) VALUES (
    v_caller_id,
    p_home_id,
    COALESCE(p_device_node_id, 'ESP32-WROOM-32-NODE-01'),
    v_token_hash,
    true
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

-- Function B: Backend / Service-Role Registration
CREATE OR REPLACE FUNCTION public.admin_register_device_token(
  p_user_id UUID,
  p_home_id UUID,
  p_device_node_id TEXT,
  p_raw_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_current_role TEXT;
  v_token_hash TEXT;
  v_token_id UUID;
BEGIN
  v_current_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_user
  );

  IF v_current_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: admin_register_device_token can only be executed by service_role (caller role: %)', v_current_role;
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id cannot be NULL';
  END IF;

  IF p_home_id IS NULL THEN
    RAISE EXCEPTION 'p_home_id cannot be NULL';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Invalid user_id: Profile record does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.homes 
    WHERE id = p_home_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Invalid home_id: Home does not exist or does not belong to specified user';
  END IF;

  IF p_raw_token IS NULL OR length(trim(p_raw_token)) < 16 THEN
    RAISE EXCEPTION 'Device token too short: Minimum 16 characters required for hardware security';
  END IF;

  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  INSERT INTO public.device_tokens (
    user_id,
    home_id,
    device_node_id,
    token_hash,
    is_active
  ) VALUES (
    p_user_id,
    p_home_id,
    COALESCE(p_device_node_id, 'ESP32-WROOM-32-NODE-01'),
    v_token_hash,
    true
  )
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_device_token(UUID, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_device_token(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_register_device_token(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_device_token(UUID, UUID, TEXT, TEXT) TO service_role;

-- Device Schedules Policy
CREATE POLICY "Users can manage own schedules" ON public.device_schedules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Automation Rules Policy
CREATE POLICY "Users can manage own automations" ON public.automation_rules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Alerts Policy
CREATE POLICY "Users can manage own alerts" ON public.alerts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Device Status Policy
CREATE POLICY "Users can view own device status" ON public.device_status
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- Trigger: Automatic Profile Creation On User Signup
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'IoT Administrator'
  );

  -- Create default home estate
  INSERT INTO public.homes (user_id, name, timezone)
  VALUES (new.id, 'SmartHomeX Smart Villa', 'Asia/Kolkata');

  RETURN new;
END;
$$;

-- Trigger execution
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- Trigger: Gas Emergency Safety Interlock (Database Level Protection)
-- Blocks any command that attempts to turn ON a relay if danger gas alert exists
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_gas_emergency_interlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_action_upper TEXT;
  v_is_energizing BOOLEAN := false;
  v_active_hazard_count INT := 0;
  v_role TEXT := NULL;
  v_raw_claims TEXT;
BEGIN
  v_action_upper := UPPER(TRIM(COALESCE(NEW.action, '')));

  IF v_action_upper IN ('OFF', '0', 'FALSE', 'STOP', 'DISABLE', 'EMERGENCY_STOP') THEN
    v_is_energizing := false;
  ELSIF v_action_upper = 'SET_BRIGHTNESS' THEN
    BEGIN
      IF (to_jsonb(NEW) -> 'payload') IS NOT NULL AND (
           ((to_jsonb(NEW) -> 'payload') ->> 'brightness') = '0' 
           OR ((to_jsonb(NEW) -> 'payload') ->> 'value') = '0'
           OR ((to_jsonb(NEW) -> 'payload') ->> 'level') = '0'
         ) THEN
        v_is_energizing := false;
      ELSE
        v_is_energizing := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_is_energizing := true;
    END;
  ELSE
    v_is_energizing := true;
  END IF;

  IF NOT v_is_energizing THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.status IN ('acknowledged', 'failed', 'rejected_gas_safety', 'timeout')) 
       AND (NEW.action IS NOT DISTINCT FROM OLD.action) THEN
      
      v_role := NULLIF(TRIM(current_setting('request.jwt.claim.role', true)), '');
      IF v_role IS NULL THEN
        v_raw_claims := NULLIF(TRIM(current_setting('request.jwt.claims', true)), '');
        IF v_raw_claims IS NOT NULL THEN
          BEGIN
            v_role := NULLIF(TRIM(v_raw_claims::jsonb ->> 'role'), '');
          EXCEPTION WHEN OTHERS THEN
            v_role := NULL;
          END;
        END IF;
      END IF;

      IF v_role = 'service_role' THEN
        RETURN NEW;
      END IF;

      IF NEW.status != 'timeout' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Terminal command status "%" can only be recorded by the hardware gateway.', NEW.status;
      END IF;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_active_hazard_count
  FROM public.alerts
  WHERE alerts.user_id = NEW.user_id
    AND alerts.type = 'gas_leak'
    AND alerts.severity = 'danger'
    AND (alerts.is_demo IS FALSE OR alerts.is_demo IS NULL)
    AND alerts.resolved_at IS NULL
    AND COALESCE(alerts.emergency_status, '') NOT IN ('RESOLVED', 'NORMAL');

  IF v_active_hazard_count > 0 THEN
    RAISE EXCEPTION 'COMMAND_BLOCKED: Electrical relay energization is prohibited during combustible gas emergency or while awaiting authorized safety reset.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gas_safety_lockout ON public.device_commands;
CREATE TRIGGER trg_gas_safety_lockout
  BEFORE INSERT OR UPDATE ON public.device_commands
  FOR EACH ROW EXECUTE FUNCTION public.check_gas_emergency_interlock();

-- ==============================================================================
-- Trigger: Prevent Unauthorized Direct Resolution of Real Gas Emergencies
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_alert_resolution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role TEXT := NULL;
  v_raw_claims TEXT;
  v_is_real_danger_gas BOOLEAN;
  v_was_unresolved BOOLEAN;
  v_attempting_resolution BOOLEAN;
  v_attempting_evasion BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'gas_leak' 
       AND OLD.severity = 'danger' 
       AND (OLD.is_demo IS FALSE OR OLD.is_demo IS NULL) 
       AND OLD.resolved_at IS NULL
       AND COALESCE(OLD.emergency_status, '') NOT IN ('RESOLVED', 'NORMAL') THEN
      
      v_role := NULLIF(TRIM(current_setting('request.jwt.claim.role', true)), '');
      IF v_role IS NULL THEN
        v_raw_claims := NULLIF(TRIM(current_setting('request.jwt.claims', true)), '');
        IF v_raw_claims IS NOT NULL THEN
          BEGIN
            v_role := NULLIF(TRIM(v_raw_claims::jsonb ->> 'role'), '');
          EXCEPTION WHEN OTHERS THEN
            v_role := NULL;
          END;
        END IF;
      END IF;

      IF v_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active real gas emergency alerts cannot be deleted while unresolved.';
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  v_is_real_danger_gas := (
    OLD.type = 'gas_leak' 
    AND OLD.severity = 'danger' 
    AND (OLD.is_demo IS FALSE OR OLD.is_demo IS NULL)
  );

  IF v_is_real_danger_gas THEN
    v_was_unresolved := (
      OLD.resolved_at IS NULL 
      AND COALESCE(OLD.emergency_status, '') NOT IN ('RESOLVED', 'NORMAL')
    );

    v_attempting_resolution := (
      (NEW.emergency_status = 'RESOLVED' AND COALESCE(OLD.emergency_status, '') != 'RESOLVED')
      OR (NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL)
    );

    v_attempting_evasion := (
      NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.home_id IS DISTINCT FROM OLD.home_id
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.severity IS DISTINCT FROM OLD.severity
      OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
      OR NEW.is_demo IS TRUE
    );

    IF (v_was_unresolved AND v_attempting_resolution) OR v_attempting_evasion THEN
      v_role := NULLIF(TRIM(current_setting('request.jwt.claim.role', true)), '');
      IF v_role IS NULL THEN
        v_raw_claims := NULLIF(TRIM(current_setting('request.jwt.claims', true)), '');
        IF v_raw_claims IS NOT NULL THEN
          BEGIN
            v_role := NULLIF(TRIM(v_raw_claims::jsonb ->> 'role'), '');
          EXCEPTION WHEN OTHERS THEN
            v_role := NULL;
          END;
        END IF;
      END IF;

      IF v_role IS DISTINCT FROM 'service_role' THEN
        IF v_attempting_evasion THEN
          RAISE EXCEPTION 'UNAUTHORIZED: Modifying user_id, home_id, type, severity, or is_demo on real gas emergency alerts is prohibited.';
        ELSE
          RAISE EXCEPTION 'UNAUTHORIZED: Real gas emergencies cannot be directly resolved via client API. An authorized safety reset must be submitted to the gateway for atmospheric validation.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_alert_resolution ON public.alerts;
CREATE TRIGGER trg_prevent_unauthorized_alert_resolution
  BEFORE UPDATE OR DELETE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unauthorized_alert_resolution();

-- ==============================================================================
-- Supabase Realtime Publication Setup
-- ==============================================================================
-- Enable realtime for tables requiring live dashboard streaming
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_status;

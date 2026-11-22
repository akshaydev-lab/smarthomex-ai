-- ==============================================================================
-- SmartHomeX AI - Five Relay System & MQ-2 Emergency Event History Migration
-- Migration: 20261122000000_five_relay_and_emergency_system.sql
-- ==============================================================================

-- 1. Ensure public.devices supports five relay channels with standard canonical naming
-- Channels:
--   1: Light        (GPIO 25)
--   2: Fan          (GPIO 26)
--   3: Motor        (GPIO 27)
--   4: Street Light (GPIO 14)
--   5: Exhaust Fan  (GPIO 32)

-- Drop existing relay_channel constraints if any to ensure 1-5 range
ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS devices_relay_channel_check;

ALTER TABLE public.devices
  ADD CONSTRAINT devices_relay_channel_check
  CHECK (relay_channel BETWEEN 1 AND 5);

-- 2. Enhance sensor_readings with MQ-2 Emergency and Status Flag Columns
ALTER TABLE public.sensor_readings
  ADD COLUMN IF NOT EXISTS gas_emergency BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gas_warmup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gas_sensor_fault BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_lockout BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN DEFAULT false;

-- 3. Dedicated Emergency Event History Table
CREATE TABLE IF NOT EXISTS public.emergency_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_cycle_id TEXT,
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'gas_emergency',
  demo_mode BOOLEAN DEFAULT false,
  gas_raw_adc INT,
  gas_status TEXT NOT NULL DEFAULT 'danger',
  gas_emergency BOOLEAN DEFAULT false,
  emergency_lockout BOOLEAN NOT NULL DEFAULT true,
  emergency_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovery_started_at TIMESTAMPTZ,
  emergency_recovery_detected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  manual_reset_at TIMESTAMPTZ,
  reset_authorized_by TEXT,
  pre_emergency_relay_states JSONB,
  restoration_completed BOOLEAN DEFAULT false,
  notification_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was already created
ALTER TABLE public.emergency_events
  ADD COLUMN IF NOT EXISTS emergency_cycle_id TEXT,
  ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gas_emergency BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restoration_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_status TEXT;

CREATE INDEX IF NOT EXISTS idx_emergency_events_user ON public.emergency_events(user_id, emergency_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_events_home ON public.emergency_events(home_id, emergency_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_events_cycle ON public.emergency_events(emergency_cycle_id);

ALTER TABLE public.emergency_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'emergency_events' AND policyname = 'Users can view own emergency events'
  ) THEN
    CREATE POLICY "Users can view own emergency events" ON public.emergency_events
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'emergency_events' AND policyname = 'Service role full access on emergency events'
  ) THEN
    CREATE POLICY "Service role full access on emergency events" ON public.emergency_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.emergency_events TO authenticated;
GRANT ALL ON public.emergency_events TO service_role;

-- 4. Dedicated Relay State Change & Pre-Emergency History Table
CREATE TABLE IF NOT EXISTS public.relay_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_cycle_id TEXT,
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  relay_channel INT NOT NULL CHECK (relay_channel BETWEEN 1 AND 5),
  device_name TEXT NOT NULL,
  gpio_pin INT,
  previous_state BOOLEAN,
  requested_state BOOLEAN,
  reported_state BOOLEAN,
  new_state BOOLEAN NOT NULL DEFAULT false,
  event_source TEXT NOT NULL DEFAULT 'hardware', -- 'hardware', 'cloud', 'schedule', 'emergency_cutoff', 'restoration'
  demo_mode BOOLEAN DEFAULT false,
  emergency_event_id UUID REFERENCES public.emergency_events(event_id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was already created
ALTER TABLE public.relay_state_history
  ADD COLUMN IF NOT EXISTS emergency_cycle_id TEXT,
  ADD COLUMN IF NOT EXISTS gpio_pin INT,
  ADD COLUMN IF NOT EXISTS requested_state BOOLEAN,
  ADD COLUMN IF NOT EXISTS reported_state BOOLEAN,
  ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_relay_history_device ON public.relay_state_history(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_relay_history_user ON public.relay_state_history(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_relay_history_cycle ON public.relay_state_history(emergency_cycle_id);

ALTER TABLE public.relay_state_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'relay_state_history' AND policyname = 'Users can view own relay history'
  ) THEN
    CREATE POLICY "Users can view own relay history" ON public.relay_state_history
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'relay_state_history' AND policyname = 'Service role full access on relay history'
  ) THEN
    CREATE POLICY "Service role full access on relay history" ON public.relay_state_history
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.relay_state_history TO authenticated;
GRANT ALL ON public.relay_state_history TO service_role;

-- 5. Extend device_commands Action Check Constraint and Rejection Logging
ALTER TABLE public.device_commands 
  DROP CONSTRAINT IF EXISTS device_commands_action_check;

ALTER TABLE public.device_commands 
  ADD CONSTRAINT device_commands_action_check 
  CHECK (action IN ('ON', 'OFF', 'RESET_SAFETY_LOCKOUT', 'RESTORE_PRE_EMERGENCY_STATES'));

ALTER TABLE public.device_commands
  ADD COLUMN IF NOT EXISTS emergency_cycle_id TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_device_commands_cycle ON public.device_commands(emergency_cycle_id);

-- 6. Enhance alerts Table with Emergency Cycle Idempotency and Tracking
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS emergency_cycle_id TEXT,
  ADD COLUMN IF NOT EXISTS notification_provider TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_response_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_cycle_type ON public.alerts (emergency_cycle_id, type) WHERE emergency_cycle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_cycle ON public.alerts(emergency_cycle_id);

-- 7. Seed / Synchronize 5 Standard Devices for Existing Homes
DO $$
DECLARE
  home_row RECORD;
BEGIN
  FOR home_row IN SELECT id, user_id FROM public.homes LOOP
    -- Channel 1: Light (GPIO 25)
    INSERT INTO public.devices (home_id, user_id, name, device_slug, type, relay_channel, gpio_pin, state, control_mode)
    VALUES (home_row.id, home_row.user_id, 'Light', 'light', 'light', 1, 25, false, 'MANUAL')
    ON CONFLICT (home_id, device_slug) DO UPDATE
      SET name = 'Light', type = 'light', relay_channel = 1, gpio_pin = 25;

    -- Channel 2: Fan (GPIO 26)
    INSERT INTO public.devices (home_id, user_id, name, device_slug, type, relay_channel, gpio_pin, state, control_mode)
    VALUES (home_row.id, home_row.user_id, 'Fan', 'fan', 'fan', 2, 26, false, 'MANUAL')
    ON CONFLICT (home_id, device_slug) DO UPDATE
      SET name = 'Fan', type = 'fan', relay_channel = 2, gpio_pin = 26;

    -- Channel 3: Motor (GPIO 27)
    INSERT INTO public.devices (home_id, user_id, name, device_slug, type, relay_channel, gpio_pin, state, control_mode)
    VALUES (home_row.id, home_row.user_id, 'Motor', 'motor', 'motor', 3, 27, false, 'MANUAL')
    ON CONFLICT (home_id, device_slug) DO UPDATE
      SET name = 'Motor', type = 'motor', relay_channel = 3, gpio_pin = 27;

    -- Channel 4: Street Light (GPIO 14)
    INSERT INTO public.devices (home_id, user_id, name, device_slug, type, relay_channel, gpio_pin, state, control_mode)
    VALUES (home_row.id, home_row.user_id, 'Street Light', 'street-light', 'light', 4, 14, false, 'MANUAL')
    ON CONFLICT (home_id, device_slug) DO UPDATE
      SET name = 'Street Light', type = 'light', relay_channel = 4, gpio_pin = 14;

    -- Channel 5: Exhaust Fan (GPIO 32)
    INSERT INTO public.devices (home_id, user_id, name, device_slug, type, relay_channel, gpio_pin, state, control_mode)
    VALUES (home_row.id, home_row.user_id, 'Exhaust Fan', 'exhaust-fan', 'exhaust_fan', 5, 32, false, 'AUTO')
    ON CONFLICT (home_id, device_slug) DO UPDATE
      SET name = 'Exhaust Fan', type = 'exhaust_fan', relay_channel = 5, gpio_pin = 32;
  END LOOP;
END $$;

-- ==============================================================================
-- ROLLBACK SCRIPT (Execute only if migration needs to be reversed):
-- ==============================================================================
-- DROP INDEX IF EXISTS public.idx_alerts_cycle_type;
-- DROP INDEX IF EXISTS public.idx_alerts_cycle;
-- DROP INDEX IF EXISTS public.idx_device_commands_cycle;
-- DROP INDEX IF EXISTS public.idx_relay_history_cycle;
-- DROP INDEX IF EXISTS public.idx_emergency_events_cycle;
-- DROP TABLE IF EXISTS public.relay_state_history CASCADE;
-- DROP TABLE IF EXISTS public.emergency_events CASCADE;
-- ALTER TABLE public.alerts
--   DROP COLUMN IF EXISTS emergency_cycle_id,
--   DROP COLUMN IF EXISTS notification_provider,
--   DROP COLUMN IF EXISTS dispatch_status,
--   DROP COLUMN IF EXISTS provider_response_id,
--   DROP COLUMN IF EXISTS delivered_at,
--   DROP COLUMN IF EXISTS demo_mode;
-- ALTER TABLE public.device_commands
--   DROP COLUMN IF EXISTS emergency_cycle_id,
--   DROP COLUMN IF EXISTS rejection_reason;
-- ALTER TABLE public.sensor_readings
--   DROP COLUMN IF EXISTS gas_emergency,
--   DROP COLUMN IF EXISTS gas_warmup,
--   DROP COLUMN IF EXISTS gas_sensor_fault,
--   DROP COLUMN IF EXISTS emergency_lockout,
--   DROP COLUMN IF EXISTS demo_mode;
-- DELETE FROM public.devices WHERE relay_channel IN (4, 5);
-- ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_relay_channel_check;
-- ALTER TABLE public.devices ADD CONSTRAINT devices_relay_channel_check CHECK (relay_channel BETWEEN 1 AND 3);
-- ==============================================================================

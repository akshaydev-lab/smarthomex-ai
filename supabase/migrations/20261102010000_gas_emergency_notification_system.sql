-- ==============================================================================
-- SmartHomeX AI - Gas Leakage Emergency & Notification System Migration
-- Migration: 20261102010000_gas_emergency_notification_system.sql
-- ==============================================================================

-- 1. Extend alerts table with emergency life-safety lifecycle states and metadata
ALTER TABLE public.alerts 
  ADD COLUMN IF NOT EXISTS emergency_status TEXT 
  CHECK (emergency_status IN ('NORMAL', 'WARNING', 'CRITICAL', 'SILENCED', 'RESOLVED', 'SENSOR_FAULT', 'DEVICE_OFFLINE')) 
  DEFAULT 'NORMAL';

ALTER TABLE public.alerts 
  ADD COLUMN IF NOT EXISTS sensor_reading TEXT;

ALTER TABLE public.alerts 
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE public.alerts 
  ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL;

-- Index for querying active emergency alerts by status
CREATE INDEX IF NOT EXISTS idx_alerts_emergency_status ON public.alerts(user_id, emergency_status, created_at DESC);

-- 2. Android Mobile Device Registration Table (FCM Push Notifications)
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'Android Device',
  device_model TEXT,
  fcm_token TEXT UNIQUE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios', 'web')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON public.fcm_tokens(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token ON public.fcm_tokens(fcm_token);

-- Enable RLS on fcm_tokens
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fcm_tokens
CREATE POLICY "Users can manage own fcm tokens" ON public.fcm_tokens
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.fcm_tokens TO authenticated;
GRANT ALL ON public.fcm_tokens TO service_role;
REVOKE ALL ON public.fcm_tokens FROM anon, PUBLIC;

-- 3. Enhance device_commands table with retry tracking
ALTER TABLE public.device_commands 
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

ALTER TABLE public.device_commands 
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

-- 4. Gas Emergency Safety Interlock Trigger Enhancement
-- Ensures commands with action 'ON' are rejected if any CRITICAL or SILENCED gas alert exists
CREATE OR REPLACE FUNCTION public.check_gas_emergency_interlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  active_hazard_count INT;
BEGIN
  IF UPPER(TRIM(new.action)) IN ('ON', 'TRUE', '1', 'START', 'ENABLE') THEN
    SELECT COUNT(*) INTO active_hazard_count
    FROM public.alerts
    WHERE alerts.user_id = new.user_id
      AND alerts.type = 'gas_leak'
      AND alerts.severity = 'danger'
      AND alerts.emergency_status IN ('CRITICAL', 'SILENCED', 'NORMAL')
      AND alerts.acknowledged = false;

    IF active_hazard_count > 0 THEN
      RAISE EXCEPTION 'COMMAND_BLOCKED: Electrical relay energization is strictly prohibited during combustible gas emergency or while awaiting authorized manual safety reset.';
    END IF;
  END IF;

  RETURN new;
END;
$$;


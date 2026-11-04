-- ==============================================================================
-- Migration: 20261104000000_safe_emergency_lockout_reset.sql
-- Description: Implement Secure Emergency Lockout Reset Workflow & Action Check
--
-- Features:
-- 1. Updates public.device_commands action constraint to permit 'RESET_SAFETY_LOCKOUT'.
-- 2. Hardens public.check_gas_emergency_interlock() trigger:
--    - RESET_SAFETY_LOCKOUT commands are permitted ONLY from the trusted backend
--      gateway (service_role). Untrusted client sessions (authenticated/anon)
--      cannot forge or insert RESET_SAFETY_LOCKOUT directly.
--    - RESET_SAFETY_LOCKOUT is dispatched to the ESP32 for independent hardware
--      validation (warm-up, sensor health, and continuous recovery stability).
--    - Relay-energizing commands (ON, TOGGLE, etc.) remain strictly blocked
--      during active gas emergency or while awaiting reset.
--    - Safe de-energizing commands (OFF, STOP, etc.) remain strictly permitted.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Update public.device_commands Action Constraint
-- ------------------------------------------------------------------------------
ALTER TABLE public.device_commands 
  DROP CONSTRAINT IF EXISTS device_commands_action_check;

ALTER TABLE public.device_commands 
  ADD CONSTRAINT device_commands_action_check 
  CHECK (action IN ('ON', 'OFF', 'RESET_SAFETY_LOCKOUT'));

-- ------------------------------------------------------------------------------
-- 2. Enhanced Gas Emergency Safety Interlock Trigger Function on device_commands
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_gas_emergency_interlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_action_upper TEXT;
  v_is_energizing BOOLEAN;
  v_active_hazard_count INT;
  v_role TEXT := NULL;
  v_raw_claims TEXT;
BEGIN
  v_action_upper := UPPER(TRIM(COALESCE(NEW.action, '')));

  -- Safely extract JWT role (fail closed)
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

  -- 1. Special Handling for RESET_SAFETY_LOCKOUT Command:
  -- Only the trusted backend hardware gateway (service_role) is authorized to insert
  -- a RESET_SAFETY_LOCKOUT command into the hardware dispatch queue.
  -- Direct authenticated / anon clients cannot insert RESET_SAFETY_LOCKOUT directly.
  IF v_action_upper = 'RESET_SAFETY_LOCKOUT' THEN
    IF v_role = 'service_role' THEN
      -- Trusted backend dispatching reset command to ESP32 for hardware validation.
      -- Does NOT energize any relay; relays remain strictly OFF.
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'UNAUTHORIZED: RESET_SAFETY_LOCKOUT can only be initiated through the authorized gateway safety reset workflow.';
    END IF;
  END IF;

  -- 2. Conservative Command Classification:
  -- Safe de-energizing commands that strictly reduce electrical load and spark risk:
  -- OFF, 0, FALSE, STOP, DISABLE, EMERGENCY_STOP
  IF v_action_upper IN ('OFF', '0', 'FALSE', 'STOP', 'DISABLE', 'EMERGENCY_STOP') THEN
    v_is_energizing := false;

  -- SET_BRIGHTNESS: Inspect payload. Only explicit zero brightness (e.g. {"brightness": 0})
  -- is treated as de-energizing. Non-zero, missing, or malformed payloads fail-safe as energizing.
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
      v_is_energizing := true; -- Malformed JSON fails-safe as energizing
    END;

  -- All other actions fail-safe and are treated as potentially energizing:
  -- - ON, TRUE, 1, START, ENABLE, TOGGLE
  -- - RESTART (reboots MCU, resetting GPIOs and warm-up cycles during gas hazard)
  -- - Any unknown or unsupported command action
  ELSE
    v_is_energizing := true;
  END IF;

  -- De-energizing commands are ALWAYS permitted to reduce spark and fire hazard
  IF NOT v_is_energizing THEN
    RETURN NEW;
  END IF;

  -- 3. Strict Terminal Allowlist on UPDATE (No Intermediate / Pending Bypass):
  -- Only allow recording verified terminal execution results and hardware ACKs
  -- from the strict allowlist: 'acknowledged', 'failed', 'rejected_gas_safety', 'timeout'.
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.status IN ('acknowledged', 'failed', 'rejected_gas_safety', 'timeout')) 
       AND (NEW.action IS NOT DISTINCT FROM OLD.action) THEN
      
      -- Trusted hardware gateway running with service_role is permitted to record terminal statuses
      IF v_role = 'service_role' THEN
        RETURN NEW;
      END IF;

      -- Non-service_role callers (authenticated / anon):
      -- Terminal statuses 'acknowledged', 'failed', and 'rejected_gas_safety' represent
      -- verified hardware/gateway execution results and CANNOT be forged by client sessions.
      IF NEW.status != 'timeout' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Terminal command status "%" can only be recorded by the hardware gateway.', NEW.status;
      END IF;
    END IF;
  END IF;

  -- 4. Check for active, unresolved, genuine gas emergency hazards for this user
  -- Excludes demo alerts (is_demo = true) and resolved/normal alerts (emergency_status = 'RESOLVED' or 'NORMAL', or resolved_at IS NOT NULL)
  -- Real alerts with (is_demo IS FALSE OR is_demo IS NULL) strictly activate lockout
  -- Acknowledged real alerts CONTINUE blocking until explicitly marked resolved
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

-- Ensure trigger is attached to public.device_commands (for both INSERT and UPDATE)
DROP TRIGGER IF EXISTS trg_gas_safety_lockout ON public.device_commands;
CREATE TRIGGER trg_gas_safety_lockout
  BEFORE INSERT OR UPDATE ON public.device_commands
  FOR EACH ROW EXECUTE FUNCTION public.check_gas_emergency_interlock();


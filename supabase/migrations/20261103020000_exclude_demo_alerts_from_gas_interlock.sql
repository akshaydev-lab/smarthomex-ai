-- ==============================================================================
-- SmartHomeX AI - Migration 20261103020000
-- Life-Safety Gas Emergency Interlock & Authorized Resolution Guard (Fail-Safe Hardened)
--
-- Safety Invariants & Rules:
-- 1. Separates alert acknowledgement from emergency resolution:
--    - alerts.acknowledged = true indicates an operator/user saw the notification.
--    - Acknowledging an alert MUST NEVER clear the physical gas safety lockout!
--    - Relay energization commands remain strictly BLOCKED as long as an active
--      real danger alert is unresolved (resolved_at IS NULL OR emergency_status != 'RESOLVED').
-- 2. Strictly excludes demo simulation alerts (is_demo = true) from the physical
--    hardware lockout.
-- 3. Relay OFF commands (and safe de-energizing actions) are ALWAYS permitted.
-- 4. Conservative Command Classification:
--    - Safe de-energizing: OFF, 0, FALSE, STOP, DISABLE, EMERGENCY_STOP.
--    - SET_BRIGHTNESS: Only explicit zero brightness is permitted; non-zero,
--      missing, or malformed payloads fail-safe as energizing.
--    - All other actions (ON, TOGGLE, RESTART, RESET_SAFETY_LOCKOUT, unknown actions)
--      fail-safe and are prohibited during active gas emergencies.
-- 5. Strict Terminal Allowlist on UPDATE (No Intermediate / Pending Bypass):
--    - Only verified terminal / ACK statuses ('acknowledged', 'failed', 'rejected_gas_safety', 'timeout')
--      are permitted to bypass revalidation on existing command rows.
--    - Intermediate states ('pending', 'queued', 'processing', 'executing', 'dispatching')
--      can NEVER bypass the gas hazard check.
--    - Terminal statuses ('acknowledged', 'failed', 'rejected_gas_safety') require trusted
--      gateway 'service_role' authority and cannot be forged by untrusted client sessions.
--    - Authenticated users can only record client-side polling timeouts ('timeout').
-- 6. Hardened Server-Side Resolution Protection (Fail-Closed):
--    - Client API sessions (authenticated or anon) CANNOT resolve real gas alerts.
--    - Only the gateway running with verified 'service_role' JWT can resolve real hazards.
--    - Prevents resolution even when resolved_at was already populated if emergency_status != 'RESOLVED'.
--    - Never uses current_user as fallback inside SECURITY DEFINER functions.
--    - Safely parses JWT claims without allowing malformed JSON to bypass authorization.
--    - Prohibits evasion mutation of user_id, home_id, type, severity, or is_demo.
--    - Prohibits deleting active unresolved real gas alerts.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure required lifecycle columns exist on public.alerts & public.device_commands
-- ------------------------------------------------------------------------------
ALTER TABLE public.alerts 
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE public.alerts 
  ADD COLUMN IF NOT EXISTS emergency_status TEXT DEFAULT 'NORMAL';

ALTER TABLE public.device_commands 
  ADD COLUMN IF NOT EXISTS payload JSONB;

-- Normalize any non-conforming emergency_status values prior to applying constraint
UPDATE public.alerts 
SET emergency_status = 'NORMAL' 
WHERE emergency_status IS NULL 
   OR emergency_status NOT IN ('NORMAL', 'WARNING', 'CRITICAL', 'SILENCED', 'RESOLVED', 'SENSOR_FAULT', 'DEVICE_OFFLINE', 'EMERGENCY_LOCKOUT', 'LOCKOUT_PENDING_RESET');

-- Re-apply check constraint cleanly without swallowing exceptions
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_emergency_status_check;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_emergency_status_check 
  CHECK (emergency_status IN ('NORMAL', 'WARNING', 'CRITICAL', 'SILENCED', 'RESOLVED', 'SENSOR_FAULT', 'DEVICE_OFFLINE', 'EMERGENCY_LOCKOUT', 'LOCKOUT_PENDING_RESET'));

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
  v_is_energizing BOOLEAN := false;
  v_active_hazard_count INT := 0;
  v_role TEXT := NULL;
  v_raw_claims TEXT;
BEGIN
  -- Normalize action string safely
  v_action_upper := UPPER(TRIM(COALESCE(NEW.action, '')));

  -- 1. Conservative Command Classification:
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
  -- - RESET_SAFETY_LOCKOUT (requires authorized gateway safety reset, not an unvalidated command)
  -- - Any unknown or unsupported command action
  ELSE
    v_is_energizing := true;
  END IF;

  -- De-energizing commands are ALWAYS permitted to reduce spark and fire hazard
  IF NOT v_is_energizing THEN
    RETURN NEW;
  END IF;

  -- 2. Strict Terminal Allowlist on UPDATE (No Intermediate / Pending Bypass):
  -- Only allow recording verified terminal execution results and hardware ACKs
  -- from the strict allowlist: 'acknowledged', 'failed', 'rejected_gas_safety', 'timeout'.
  --
  -- CRITICAL SECURITY REQUIREMENT:
  -- Never allow intermediate or active states such as 'pending', 'queued', 'processing',
  -- 'executing', or 'dispatching' to bypass the gas interlock!
  -- Any command transitioning into or remaining in an intermediate/dispatching state
  -- MUST be revalidated against active gas hazards.
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.status IN ('acknowledged', 'failed', 'rejected_gas_safety', 'timeout')) 
       AND (NEW.action IS NOT DISTINCT FROM OLD.action) THEN
      
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

  -- 3. Check for active, unresolved, genuine gas emergency hazards for this user
  -- Excludes demo alerts (is_demo = true)
  -- Real alerts with (is_demo IS FALSE OR is_demo IS NULL) strictly activate lockout
  -- Acknowledged real alerts CONTINUE blocking until explicitly marked resolved
  SELECT COUNT(*) INTO v_active_hazard_count
  FROM public.alerts
  WHERE alerts.user_id = NEW.user_id
    AND alerts.type = 'gas_leak'
    AND alerts.severity = 'danger'
    AND (alerts.is_demo IS FALSE OR alerts.is_demo IS NULL)
    AND (alerts.resolved_at IS NULL OR COALESCE(alerts.emergency_status, '') != 'RESOLVED');

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

-- ------------------------------------------------------------------------------
-- 3. Prevent Unauthorized Direct Resolution / Tampering of Real Gas Emergencies
-- ------------------------------------------------------------------------------
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
  -- Handle DELETE attempt on active real gas emergency alert
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'gas_leak' 
       AND OLD.severity = 'danger' 
       AND (OLD.is_demo IS FALSE OR OLD.is_demo IS NULL) 
       AND (OLD.resolved_at IS NULL OR COALESCE(OLD.emergency_status, '') != 'RESOLVED') THEN
      
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

      IF v_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active real gas emergency alerts cannot be deleted while unresolved.';
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  -- Handle UPDATE attempt
  -- 1. Identify if OLD record is a real danger gas alert
  v_is_real_danger_gas := (
    OLD.type = 'gas_leak' 
    AND OLD.severity = 'danger' 
    AND (OLD.is_demo IS FALSE OR OLD.is_demo IS NULL)
  );

  IF v_is_real_danger_gas THEN
    -- Check if OLD was unresolved (either resolved_at IS NULL OR emergency_status != 'RESOLVED')
    v_was_unresolved := (
      OLD.resolved_at IS NULL 
      OR COALESCE(OLD.emergency_status, '') != 'RESOLVED'
    );

    -- Check if NEW attempts to transition into a resolved state
    -- Covers:
    -- - setting emergency_status = 'RESOLVED' when previously not 'RESOLVED'
    -- - setting resolved_at when previously NULL
    -- - setting emergency_status = 'RESOLVED' even when resolved_at was already populated
    v_attempting_resolution := (
      (NEW.emergency_status = 'RESOLVED' AND COALESCE(OLD.emergency_status, '') != 'RESOLVED')
      OR (NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL)
    );

    -- Check if NEW attempts to evade lockout by mutating ownership or core hazard descriptors
    v_attempting_evasion := (
      NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.home_id IS DISTINCT FROM OLD.home_id
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.severity IS DISTINCT FROM OLD.severity
      OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
      OR NEW.is_demo IS TRUE
    );

    -- If resolving an unresolved hazard or attempting evasion, strictly require service_role
    IF (v_was_unresolved AND v_attempting_resolution) OR v_attempting_evasion THEN
      -- Safely extract JWT role without allowing malformed claims to bypass authorization
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

      -- FAIL CLOSED: ONLY exact 'service_role' is permitted.
      -- Notice: current_user is intentionally NOT used as a fallback inside SECURITY DEFINER!
      -- Authenticated, anon, NULL, empty, malformed, or fallback roles are strictly rejected.
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

-- Ensure trigger is attached to public.alerts for both UPDATE and DELETE
DROP TRIGGER IF EXISTS trg_prevent_unauthorized_alert_resolution ON public.alerts;
CREATE TRIGGER trg_prevent_unauthorized_alert_resolution
  BEFORE UPDATE OR DELETE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_unauthorized_alert_resolution();

-- ------------------------------------------------------------------------------
-- 4. Strengthen device_commands RLS Policies for UPDATE
-- ------------------------------------------------------------------------------
-- Ensure untrusted authenticated clients can NEVER update terminal statuses
-- ('acknowledged', 'failed', 'rejected_gas_safety').
-- Only client-side poll timeout ('timeout') is permitted for authenticated users.
DROP POLICY IF EXISTS "Users can update command acknowledgements" ON public.device_commands;
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

COMMENT ON FUNCTION public.check_gas_emergency_interlock() IS 
  'Enforces hardware relay safety lockout during genuine unresolved gas hazards (resolved_at IS NULL OR emergency_status != RESOLVED) while excluding demo/simulation alerts (is_demo = true). Treats is_demo IS NULL as real hazard. Acknowledged alerts continue blocking until explicitly resolved. Enforces strict terminal allowlist (acknowledged, failed, rejected_gas_safety, timeout) on UPDATE with service_role verification. Blocks RESTART, RESET_SAFETY_LOCKOUT, and energizing SET_BRIGHTNESS during gas lockout. Allows OFF commands.';

COMMENT ON FUNCTION public.prevent_unauthorized_alert_resolution() IS 
  'Guards real gas emergency alerts against unauthorized resolution, evasion mutation (user_id, home_id, type, severity, is_demo), or deletion by non-service_role callers. Fails closed against missing or malformed JWT claims.';

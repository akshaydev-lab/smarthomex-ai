-- ==============================================================================
-- Migration: 20261102000000_device_tokens_and_security_hardening.sql
-- SmartHomeX AI - Production Database Migration & Security Hardening
-- Target: Supabase PostgreSQL 15+
--
-- Security & Hardening Guarantees:
-- 1. Dual Registration Architecture with Explicit Role Enforcement:
--    - public.register_device_token: authenticated-only, locks user_id to auth.uid().
--    - public.admin_register_device_token: service_role-only, verifies caller role is service_role.
-- 2. Fixed search_path & Fully Qualified References:
--    All SECURITY DEFINER routines enforce SET search_path = public, extensions, pg_temp
--    with fully qualified object references.
-- 3. Strict Token Hash Concealment:
--    token_hash is completely inaccessible to anon, authenticated, and PUBLIC.
--    Only service_role can read token_hash.
--    Safe view public.user_device_tokens uses WITH (security_invoker = true) and
--    explicit user_id = auth.uid() filtering.
-- 4. Multi-Tenant Cross-Device RLS Hardening:
--    device_commands INSERT and UPDATE policies enforce BOTH USING and WITH CHECK,
--    verifying that user_id = auth.uid() AND the target device is owned by auth.uid().
-- 5. Comprehensive Relay Energization Interlock:
--    check_gas_emergency_interlock() protects against any relay-energizing command
--    ('ON', 'TRUE', '1', 'START', 'ENABLE') on both INSERT and UPDATE OF action.
-- 6. Strict Idempotent Reconciliation & Fail-Safe Validation:
--    Validates primary key on 'id', columns, constraints, foreign keys, and unique hashes.
--    Fails safely with a clear descriptive exception if legacy dirty data exists.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Enable Required Cryptographic Extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. Table Definition: device_tokens (Fresh Database Safe)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  device_node_id TEXT NOT NULL DEFAULT 'ESP32-WROOM-32-NODE-01',
  token_hash TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 3. Populated Database Safe Column Reconciliation & Strict Constraint Validation
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_null_count INT;
  v_pk_col TEXT;
BEGIN
  -- A. Ensure column: id exists, backfill NULLs
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN id UUID DEFAULT gen_random_uuid();
  END IF;

  UPDATE public.device_tokens SET id = gen_random_uuid() WHERE id IS NULL;

  -- Verify primary key is specifically on 'id'
  SELECT ccu.column_name INTO v_pk_col
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu 
    ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
  WHERE tc.table_schema = 'public' 
    AND tc.table_name = 'device_tokens' 
    AND tc.constraint_type = 'PRIMARY KEY'
  LIMIT 1;

  IF v_pk_col IS NULL THEN
    ALTER TABLE public.device_tokens ADD PRIMARY KEY (id);
  ELSIF v_pk_col <> 'id' THEN
    RAISE EXCEPTION 'MIGRATION_HALTED: Existing primary key on device_tokens is on column "%", expected "id".', v_pk_col;
  END IF;

  -- B. Ensure column: device_node_id exists, backfill default, enforce NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'device_node_id'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN device_node_id TEXT DEFAULT 'ESP32-WROOM-32-NODE-01';
  END IF;

  UPDATE public.device_tokens SET device_node_id = 'ESP32-WROOM-32-NODE-01' WHERE device_node_id IS NULL;
  ALTER TABLE public.device_tokens ALTER COLUMN device_node_id SET NOT NULL;

  -- C. Ensure column: is_active exists, backfill default, enforce NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;

  UPDATE public.device_tokens SET is_active = true WHERE is_active IS NULL;
  ALTER TABLE public.device_tokens ALTER COLUMN is_active SET NOT NULL;

  -- D. Ensure column: created_at exists, backfill default, enforce NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;

  UPDATE public.device_tokens SET created_at = now() WHERE created_at IS NULL;
  ALTER TABLE public.device_tokens ALTER COLUMN created_at SET NOT NULL;

  -- E. Ensure column: last_used_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'last_used_at'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN last_used_at TIMESTAMPTZ;
  END IF;

  -- F. Ensure column: token_hash exists and validate existing data before NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'token_hash'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN token_hash TEXT;
  END IF;

  SELECT COUNT(*) INTO v_null_count FROM public.device_tokens WHERE token_hash IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_HALTED: Table device_tokens contains % row(s) with NULL token_hash. Required security constraint cannot be applied.', v_null_count;
  END IF;
  ALTER TABLE public.device_tokens ALTER COLUMN token_hash SET NOT NULL;

  -- G. Ensure column: user_id exists and validate existing data before NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN user_id UUID;
  END IF;

  SELECT COUNT(*) INTO v_null_count FROM public.device_tokens WHERE user_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_HALTED: Table device_tokens contains % row(s) with NULL user_id. Required security constraint cannot be applied.', v_null_count;
  END IF;
  ALTER TABLE public.device_tokens ALTER COLUMN user_id SET NOT NULL;

  -- H. Ensure column: home_id exists and validate existing data before NOT NULL
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'home_id'
  ) THEN
    ALTER TABLE public.device_tokens ADD COLUMN home_id UUID;
  END IF;

  SELECT COUNT(*) INTO v_null_count FROM public.device_tokens WHERE home_id IS NULL;
  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_HALTED: Table device_tokens contains % row(s) with NULL home_id. Required security constraint cannot be applied.', v_null_count;
  END IF;
  ALTER TABLE public.device_tokens ALTER COLUMN home_id SET NOT NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Foreign Key & Unique Constraint Reconciliation by Column and Target Table
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_orphan_count INT;
  v_dup_count INT;
  v_mismatch_count INT;
BEGIN
  -- Foreign Key 1: user_id -> public.profiles(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'device_tokens'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'user_id'
      AND ccu.table_name = 'profiles'
      AND ccu.column_name = 'id'
  ) THEN
    SELECT COUNT(*) INTO v_orphan_count 
    FROM public.device_tokens dt
    LEFT JOIN public.profiles p ON dt.user_id = p.id
    WHERE dt.user_id IS NOT NULL AND p.id IS NULL;

    IF v_orphan_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION_HALTED: Found % orphaned user_id record(s) in device_tokens referencing non-existent profiles.', v_orphan_count;
    END IF;

    ALTER TABLE public.device_tokens
      ADD CONSTRAINT fk_device_tokens_user
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  -- Foreign Key 2: home_id -> public.homes(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'device_tokens'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'home_id'
      AND ccu.table_name = 'homes'
      AND ccu.column_name = 'id'
  ) THEN
    SELECT COUNT(*) INTO v_orphan_count 
    FROM public.device_tokens dt
    LEFT JOIN public.homes h ON dt.home_id = h.id
    WHERE dt.home_id IS NOT NULL AND h.id IS NULL;

    IF v_orphan_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION_HALTED: Found % orphaned home_id record(s) in device_tokens referencing non-existent homes.', v_orphan_count;
    END IF;

    ALTER TABLE public.device_tokens
      ADD CONSTRAINT fk_device_tokens_home
      FOREIGN KEY (home_id) REFERENCES public.homes(id) ON DELETE CASCADE;
  END IF;

  -- Unique Constraint: token_hash
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'device_tokens'
      AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
      AND kcu.column_name = 'token_hash'
  ) THEN
    SELECT COUNT(*) INTO v_dup_count FROM (
      SELECT token_hash FROM public.device_tokens 
      WHERE token_hash IS NOT NULL 
      GROUP BY token_hash HAVING COUNT(*) > 1
    ) sub;

    IF v_dup_count > 0 THEN
      RAISE EXCEPTION 'MIGRATION_HALTED: Found % duplicate token_hash group(s) in device_tokens. Unique hardware credentials required.', v_dup_count;
    END IF;

    ALTER TABLE public.device_tokens ADD CONSTRAINT uq_device_tokens_hash UNIQUE (token_hash);
  END IF;

  -- Ownership Integrity Check: Confirm home_id belongs to the referenced user_id
  SELECT COUNT(*) INTO v_mismatch_count
  FROM public.device_tokens dt
  JOIN public.homes h ON dt.home_id = h.id
  WHERE dt.user_id <> h.user_id;

  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_HALTED: Found % device_tokens record(s) where home_id does not belong to user_id (cross-tenant ownership violation).', v_mismatch_count;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. Performance Indexes (Idempotent)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_device_tokens_hash ON public.device_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_node ON public.device_tokens(device_node_id);

-- ------------------------------------------------------------------------------
-- 6. Privilege Separation & RLS: Complete Concealment of token_hash
-- ------------------------------------------------------------------------------
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Grant complete administrative access exclusively to Edge Function backend
GRANT ALL ON public.device_tokens TO service_role;

-- Revoke all table-level access from anon, authenticated, and PUBLIC
REVOKE ALL ON public.device_tokens FROM anon;
REVOKE ALL ON public.device_tokens FROM authenticated;
REVOKE ALL ON public.device_tokens FROM PUBLIC;

-- Grant column-level access ONLY on non-sensitive metadata columns
GRANT SELECT (id, user_id, home_id, device_node_id, is_active, last_used_at, created_at)
  ON public.device_tokens TO authenticated;
GRANT UPDATE (is_active)
  ON public.device_tokens TO authenticated;
GRANT DELETE
  ON public.device_tokens TO authenticated;

-- Explicitly revoke SELECT on token_hash from PUBLIC, anon, and authenticated
REVOKE SELECT (token_hash) ON public.device_tokens FROM PUBLIC, anon, authenticated;

-- RLS Policies for Authenticated Users
DROP POLICY IF EXISTS "Users can view own device token metadata" ON public.device_tokens;
CREATE POLICY "Users can view own device token metadata" ON public.device_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own device token status" ON public.device_tokens;
CREATE POLICY "Users can update own device token status" ON public.device_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own device tokens" ON public.device_tokens;
CREATE POLICY "Users can delete own device tokens" ON public.device_tokens
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Client-Safe View: user_device_tokens (Omits token_hash entirely)
-- Uses WITH (security_invoker = true) to enforce caller RLS in PostgreSQL 15+
-- and includes explicit WHERE user_id = auth.uid() as defense-in-depth.
CREATE OR REPLACE VIEW public.user_device_tokens 
WITH (security_invoker = true) AS
  SELECT id, user_id, home_id, device_node_id, is_active, last_used_at, created_at
  FROM public.device_tokens
  WHERE user_id = auth.uid();

GRANT SELECT ON public.user_device_tokens TO authenticated;
REVOKE ALL ON public.user_device_tokens FROM anon, PUBLIC;

-- ------------------------------------------------------------------------------
-- 7. Dual Registration Functions (Strict Authorization & Fixed search_path)
-- ------------------------------------------------------------------------------

-- Function 7A: Authenticated User Self-Registration
-- auth.uid() MUST NOT BE NULL. Automatically binds user_id to auth.uid().
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

  -- 1. Strictly require an authenticated session
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is NULL';
  END IF;

  -- 2. Verify home exists and explicitly belongs to the authenticated user
  IF NOT EXISTS (
    SELECT 1 FROM public.homes 
    WHERE id = p_home_id AND user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Invalid home_id: Home record does not exist or does not belong to the authenticated user';
  END IF;

  -- 3. Enforce token complexity (minimum 16 characters)
  IF p_raw_token IS NULL OR length(trim(p_raw_token)) < 16 THEN
    RAISE EXCEPTION 'Device token too short: Minimum 16 characters required for hardware security';
  END IF;

  -- 4. Compute cryptographic SHA-256 hash
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  -- 5. Insert token record
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

-- Function 7B: Backend-Only / Service-Role Registration
-- Explicitly validates caller role is service_role. Revoked from PUBLIC, anon, and authenticated.
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
  -- 1. Explicit Role Enforcement: Verify executing role is service_role or admin
  v_current_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL 
          THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'role') 
          ELSE NULL END),
    current_user
  );

  IF v_current_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: admin_register_device_token can only be executed by service_role (caller role: %)', v_current_role;
  END IF;

  -- 2. Validate parameters
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id cannot be NULL';
  END IF;

  IF p_home_id IS NULL THEN
    RAISE EXCEPTION 'p_home_id cannot be NULL';
  END IF;

  -- 3. Verify user profile exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Invalid user_id: Profile record does not exist';
  END IF;

  -- 4. Verify home exists and belongs explicitly to p_user_id
  IF NOT EXISTS (
    SELECT 1 FROM public.homes 
    WHERE id = p_home_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Invalid home_id: Home does not exist or does not belong to specified user';
  END IF;

  -- 5. Enforce token complexity
  IF p_raw_token IS NULL OR length(trim(p_raw_token)) < 16 THEN
    RAISE EXCEPTION 'Device token too short: Minimum 16 characters required for hardware security';
  END IF;

  -- 6. Compute SHA-256 hash
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  -- 7. Insert token record
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

-- Strict Execution Privileges for Function 7A (User Self-Registration)
REVOKE EXECUTE ON FUNCTION public.register_device_token(UUID, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_device_token(UUID, TEXT, TEXT) TO authenticated;

-- Strict Execution Privileges for Function 7B (Backend Admin Only)
REVOKE EXECUTE ON FUNCTION public.admin_register_device_token(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_device_token(UUID, UUID, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 8. Strengthen device_commands RLS Policies (Both USING and WITH CHECK)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can dispatch device commands" ON public.device_commands;
CREATE POLICY "Users can dispatch device commands" ON public.device_commands
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE devices.id = device_id
        AND devices.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own device commands" ON public.device_commands;
CREATE POLICY "Users can view own device commands" ON public.device_commands
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

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
    EXISTS (
      SELECT 1 FROM public.devices
      WHERE devices.id = device_commands.device_id
        AND devices.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- 9. Comprehensive Gas Emergency Safety Interlock Trigger
--    Catches all relay-energizing command paths ('ON', 'TRUE', '1', 'START', 'ENABLE')
--    on both INSERT and UPDATE OF action on device_commands.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_gas_emergency_interlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  active_hazard_count INT;
BEGIN
  -- Evaluate all possible relay-energizing command actions
  IF UPPER(TRIM(new.action)) IN ('ON', 'TRUE', '1', 'START', 'ENABLE') THEN
    SELECT COUNT(*) INTO active_hazard_count
    FROM public.alerts
    WHERE alerts.user_id = new.user_id
      AND alerts.type = 'gas_leak'
      AND alerts.severity = 'danger'
      AND alerts.acknowledged = false;

    IF active_hazard_count > 0 THEN
      RAISE EXCEPTION 'COMMAND_BLOCKED: Electrical relay energization is prohibited during combustible gas emergency.';
    END IF;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_gas_safety_lockout ON public.device_commands;
CREATE TRIGGER trg_gas_safety_lockout
  BEFORE INSERT OR UPDATE OF action ON public.device_commands
  FOR EACH ROW EXECUTE FUNCTION public.check_gas_emergency_interlock();

-- ------------------------------------------------------------------------------
-- 10. Enable Supabase Realtime Publication for device_tokens (Idempotent)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'device_tokens'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.device_tokens;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 11. Final Validation Gate: Fail Safely If Any Required Object or Constraint Missing
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_missing_items TEXT := '';
BEGIN
  -- Check table
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'device_tokens') THEN
    v_missing_items := v_missing_items || ' [Table: device_tokens]';
  END IF;

  -- Check primary key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' AND table_name = 'device_tokens' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    v_missing_items := v_missing_items || ' [Primary Key on device_tokens]';
  END IF;

  -- Check foreign keys (validate by actual column relationship and referenced table, not hardcoded constraint names)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'device_tokens'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'user_id'
      AND ccu.table_name = 'profiles'
      AND ccu.column_name = 'id'
  ) THEN
    v_missing_items := v_missing_items || ' [FK: device_tokens.user_id -> profiles.id]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'device_tokens'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'home_id'
      AND ccu.table_name = 'homes'
      AND ccu.column_name = 'id'
  ) THEN
    v_missing_items := v_missing_items || ' [FK: device_tokens.home_id -> homes.id]';
  END IF;

  -- Check unique constraint or unique index on token_hash (validate by column, not hardcoded constraint name)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'device_tokens'
      AND tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
      AND kcu.column_name = 'token_hash'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = 'public'
      AND c.relname = 'device_tokens'
      AND a.attname = 'token_hash'
      AND i.indisunique = true
  ) THEN
    v_missing_items := v_missing_items || ' [Unique: device_tokens.token_hash]';
  END IF;

  -- Check functions
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'register_device_token') THEN
    v_missing_items := v_missing_items || ' [Function: register_device_token]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'admin_register_device_token') THEN
    v_missing_items := v_missing_items || ' [Function: admin_register_device_token]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_gas_emergency_interlock') THEN
    v_missing_items := v_missing_items || ' [Function: check_gas_emergency_interlock]';
  END IF;

  -- Check view
  IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'user_device_tokens') THEN
    v_missing_items := v_missing_items || ' [View: user_device_tokens]';
  END IF;

  IF length(v_missing_items) > 0 THEN
    RAISE EXCEPTION 'MIGRATION_VALIDATION_FAILED: The following required schema objects are missing:%', v_missing_items;
  END IF;

  RAISE NOTICE 'SmartHomeX AI Migration 20261102 completed and fully validated successfully.';
END $$;

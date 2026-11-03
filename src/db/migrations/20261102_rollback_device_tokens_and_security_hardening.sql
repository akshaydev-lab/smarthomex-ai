-- ==============================================================================
-- Migration: 20261102_rollback_device_tokens_and_security_hardening.sql
-- SmartHomeX AI - Non-Destructive Safe Rollback Script
-- Target: Supabase PostgreSQL 15+
--
-- Rollback Guarantees:
-- 1. Zero Data Loss: NEVER drops the device_tokens table; all historical records preserved.
-- 2. Non-Destructive: Drops only helper views and custom RPC registration functions.
-- 3. Cross-Tenant Protection Preserved: Does NOT weaken device_commands or device_tokens RLS.
--    Users remain strictly constrained to devices they personally own across INSERT and UPDATE.
-- 4. Safe & Idempotent: Can be run repeatedly without errors.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Remove Client-Safe View (user_device_tokens)
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.user_device_tokens;

-- ------------------------------------------------------------------------------
-- 2. Remove Custom Token Registration Functions
--    (Removes both single-tenant user RPC and backend-only admin RPC)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_device_token(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_register_device_token(UUID, UUID, TEXT, TEXT);
-- Clean up any legacy function signature if previously present
DROP FUNCTION IF EXISTS public.register_device_token(UUID, UUID, TEXT, TEXT);

-- ------------------------------------------------------------------------------
-- 3. Remove device_tokens from Supabase Realtime Publication (If Present)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'device_tokens'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.device_tokens;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. Maintain Hardened Cross-Tenant RLS on device_commands
--    CRITICAL: Preserves strict cross-tenant verification (devices.user_id = auth.uid()).
--    Enforces BOTH USING and WITH CHECK to prevent unauthorized command injection or hijacking.
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
-- 5. Preserve device_tokens Table & Data with Secure Tenant Isolation
--    CRITICAL: device_tokens is PRESERVED. Records and token hashes are kept intact.
--    Row Level Security is maintained so users can only manage their own devices.
-- ------------------------------------------------------------------------------
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

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

-- Explicitly ensure token_hash remains protected
REVOKE SELECT (token_hash) ON public.device_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.device_tokens TO service_role;

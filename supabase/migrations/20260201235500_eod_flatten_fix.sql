-- ============================================================
-- FIX: End-of-day position flatten was not closing positions
-- because it relied on get_active_trading_configs() which
-- only returns users with auto_trading_enabled=true.
-- If daily loss limit or manual stop disabled auto trading,
-- positions stayed open overnight.
-- ============================================================

-- NEW: Function that returns ALL trading configs regardless of auto_trading_enabled
-- Used ONLY for EOD flatten — positions must ALWAYS close at end of day
CREATE OR REPLACE FUNCTION get_all_trading_configs()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  api_key_id TEXT,
  secret_key TEXT,
  is_paper_trading BOOLEAN,
  selected_strategy TEXT,
  auto_trading_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.id,
    tc.user_id,
    decrypt_secret(tc.api_key_id) as api_key_id,
    decrypt_secret(tc.secret_key) as secret_key,
    tc.is_paper_trading,
    tc.selected_strategy,
    tc.auto_trading_enabled
  FROM trading_configurations tc;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION get_all_trading_configs() TO postgres, service_role;

-- ============================================================
-- ADD: Dedicated EOD flatten cron jobs
-- Runs at 3:55 PM, 4:00 PM, 4:05 PM, and 4:15 PM ET
-- (20:55, 21:00, 21:05, 21:15 UTC during EST)
-- Multiple runs = safety net — if one fails, the next catches it
-- ============================================================

-- Unschedule if exists (for re-running migration)
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
  'eod_flatten_355pm',
  'eod_flatten_400pm', 
  'eod_flatten_405pm',
  'eod_flatten_415pm'
);

-- 3:55 PM ET (20:55 UTC during EST / 19:55 UTC during EDT)
-- Pre-close: cancel all open orders before market close
SELECT cron.schedule(
  'eod_flatten_355pm',
  '55 20 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/auto-trade',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{"forceEODFlatten": true}'::jsonb
  );
  $$
);

-- 4:00 PM ET (21:00 UTC during EST)
-- Market close: flatten everything
SELECT cron.schedule(
  'eod_flatten_400pm',
  '0 21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/auto-trade',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{"forceEODFlatten": true}'::jsonb
  );
  $$
);

-- 4:05 PM ET (21:05 UTC during EST)
-- Safety net #1
SELECT cron.schedule(
  'eod_flatten_405pm',
  '5 21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/auto-trade',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{"forceEODFlatten": true}'::jsonb
  );
  $$
);

-- 4:15 PM ET (21:15 UTC during EST)
-- Safety net #2 (final sweep)
SELECT cron.schedule(
  'eod_flatten_415pm',
  '15 21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/auto-trade',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{"forceEODFlatten": true}'::jsonb
  );
  $$
);

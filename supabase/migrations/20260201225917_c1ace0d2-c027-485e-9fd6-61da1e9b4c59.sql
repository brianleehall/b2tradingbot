-- Create a helper function to get the service role key
CREATE OR REPLACE FUNCTION public.get_service_role_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key TEXT;
BEGIN
  -- Try vault first
  BEGIN
    SELECT decrypted_secret INTO key 
    FROM vault.decrypted_secrets 
    WHERE name = 'service_role_key' 
    LIMIT 1;
    IF key IS NOT NULL THEN
      RETURN key;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  
  -- Try app settings
  key := current_setting('app.settings.service_role_key', true);
  IF key IS NOT NULL AND key != '' THEN
    RETURN key;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Unschedule existing jobs if they exist (to allow re-running migration)
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
  'auto_trade_every_minute', 
  'orb_scanner_morning', 
  'daily_performance_report', 
  'cleanup_old_cron_runs'
);

-- Job 1: Auto-trade every minute during market hours (weekdays, 13:00-21:59 UTC = 8/9 AM - 4/5 PM ET)
SELECT cron.schedule(
  'auto_trade_every_minute',
  '* 13-21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/auto-trade',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Job 2: ORB stock selector at 9 AM ET daily (13:00 UTC covers both EST and EDT)
SELECT cron.schedule(
  'orb_scanner_morning',
  '0 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/orb-stock-selector',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Job 3: Daily performance report at 4:30 PM ET (21:30 UTC)
SELECT cron.schedule(
  'daily_performance_report',
  '30 21 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/send-daily-performance',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Job 4: Cleanup old cron run details (daily at midnight UTC)
SELECT cron.schedule(
  'cleanup_old_cron_runs',
  '0 0 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < NOW() - INTERVAL '7 days';$$
);

-- Grant execute on helper function
GRANT EXECUTE ON FUNCTION public.get_service_role_key() TO postgres, service_role;
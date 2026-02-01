-- Add morning ORB email cron job at 8:30 AM ET
-- 13:30 UTC = 8:30 AM EST (Nov-Mar) / 9:30 AM EDT (Mar-Nov)
-- During EDT this shifts to 9:30 AM, still before primary trading window

-- Remove if exists (safe re-run)
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'morning_orb_email';

-- Schedule morning ORB email at 13:30 UTC (8:30 AM EST / 9:30 AM EDT)
SELECT cron.schedule(
  'morning_orb_email',
  '30 13 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ksegdaxqffkycxxqkrdi.supabase.co/functions/v1/send-orb-email',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzZWdkYXhxZmZreWN4eHFrcmRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMzQwMDEsImV4cCI6MjA4MDkxMDAwMX0.rRtWaDqzeGGFTyOYYWHCjSMrhMzoidmAqHMa06JWs3w"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

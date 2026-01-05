-- Schedule invoice payment reminder to run daily at 8:00 AM UTC
-- This sends reminders for invoices due in 2 days or less
SELECT cron.schedule(
  'send-invoice-reminders-daily',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hjecjqyonxvrrvprbvgr.supabase.co/functions/v1/send-invoice-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
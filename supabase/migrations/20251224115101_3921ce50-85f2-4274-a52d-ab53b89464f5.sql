-- Schedule trial reminder to run daily at 9:00 AM UTC
SELECT cron.schedule(
  'send-trial-reminder-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hjecjqyonxvrrvprbvgr.supabase.co/functions/v1/send-trial-reminder',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqZWNqcXlvbnh2cnJ2cHJidmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5ODk5NTYsImV4cCI6MjA4MTU2NTk1Nn0.cB01oGHO3q74AnOkq6phN8cLGepUFfE5mos6x8XSg4Q"}'::jsonb,
    body := '{"reminderDays": 3}'::jsonb
  ) AS request_id;
  $$
);
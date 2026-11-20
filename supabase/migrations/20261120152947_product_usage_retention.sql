-- Daily traffic is not required for expiry. Each run deletes only usage data.
-- The one-hour margin keeps the hourly purge within the announced 90 days.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'product-usage-retention',
  '17 * * * *',
  $$delete from lead.product_usage_sessions where created_at < now() - interval '89 days 23 hours'$$
);

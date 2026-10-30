-- MK07 now has a documented catalogue body. No activation value is created.
-- The detection directory (schema 1.9/1.10) remains optional on older installs.
do $$
begin
 if to_regclass('lead.detection_sensor_allow') is not null then
   update lead.detection_sensor_allow set guide_only = false where sensor_family = 'MK07';
   if exists (select 1 from information_schema.columns where table_schema='lead' and table_name='detection_sensor_allow' and column_name='shape') then
     update lead.detection_sensor_allow set shape = 'tubular' where sensor_family = 'MK07';
   end if;
 end if;
end $$;

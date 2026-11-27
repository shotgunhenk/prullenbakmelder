-- Prullenbakmelder: dagelijkse mail met de meldingen (eenmalig uitvoeren in Supabase → SQL Editor → Run)
-- Eerst de Edge Function "dagmail" aanmaken en de secrets zetten (zie supabase/functions/dagmail/index.ts).
-- Vul hieronder <ANON-SLEUTEL> (staat in config.js) en <GEHEIM> (zelfde als secret DAGMAIL_GEHEIM) in.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- oude versie van de taak weghalen (mag ook als die nog niet bestaat)
select cron.unschedule(jobid) from cron.job where jobname = 'dagmail';

-- elk uur om 16:00 en 17:00 UTC aanroepen; de functie verstuurt alleen om 18:00 Nederlandse tijd
-- (zo klopt het in zomer- én wintertijd). Geen meldingen op een dag = geen mail.
select cron.schedule('dagmail', '0 16,17 * * *', $$
  select net.http_post(
    url := 'https://lbaxybsosehpdhakgtel.supabase.co/functions/v1/dagmail',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON-SLEUTEL>',
      'x-dagmail-geheim', '<GEHEIM>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- PROBEREN (los uitvoeren): stuurt meteen de mail van vandaag
-- select net.http_post(url := 'https://lbaxybsosehpdhakgtel.supabase.co/functions/v1/dagmail?test=1',
--   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ANON-SLEUTEL>','x-dagmail-geheim','<GEHEIM>'),
--   body := '{}'::jsonb, timeout_milliseconds := 120000);
-- en na een halve minuut het antwoord bekijken:
-- select status_code, content from net._http_response order by id desc limit 1;

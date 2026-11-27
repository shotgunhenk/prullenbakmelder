-- Prullenbakmelder: dagelijkse mail met de meldingen (eenmalig uitvoeren in Supabase → SQL Editor → Run)
-- Eerst de Edge Function "dagmail" aanmaken en de secrets zetten (zie supabase/functions/dagmail/index.ts).
-- Er staat geen geheim in dit script: de anon-sleutel is openbaar (staat ook in config.js).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- logboek: welke dagen zijn al gemaild (zo gaat de mail nooit twee keer op één dag)
create table if not exists public.dagmail_log (
  dag date primary key,
  verstuurd_at timestamptz not null default now()
);
alter table public.dagmail_log enable row level security;   -- geen policies: alleen de functie (service role) mag erbij
grant select on public.meldingen to service_role;                     -- standaardrechten ontbreken in dit project
grant select, insert, delete on public.dagmail_log to service_role;

-- oude versie van de taak weghalen (mag ook als die nog niet bestaat)
select cron.unschedule(jobid) from cron.job where jobname = 'dagmail';

-- om 13:00 en 14:00 UTC aanroepen; de functie verstuurt alleen om 15:00 Nederlandse tijd
-- (zo klopt het in zomer- én wintertijd). Geen meldingen op een dag = geen mail.
select cron.schedule('dagmail', '0 13,14 * * *', $$
  select net.http_post(
    url := 'https://lbaxybsosehpdhakgtel.supabase.co/functions/v1/dagmail',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXh5YnNvc2VocGRoYWtndGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MzQwMjEsImV4cCI6MjExMTExMDAyMX0.LVaRWCY95i-x6FP7n3MDXqEFpSJNALGJ_8Vc43u9pTI'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- controleren:
select jobid, jobname, schedule, active from cron.job where jobname = 'dagmail';

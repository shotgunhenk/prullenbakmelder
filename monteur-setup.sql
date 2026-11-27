-- Prullenbakmelder: "Stuur naar monteur" (eenmalig uitvoeren in Supabase → SQL Editor → Run)

-- 1. bij elke melding onthouden naar welke monteur hij is gestuurd en wanneer
alter table public.meldingen add column if not exists monteur text;
alter table public.meldingen add column if not exists monteur_at timestamptz;

-- 2. lijst met monteurs, gedeeld door iedereen op kantoor
create table if not exists public.monteurs (
  id          uuid primary key default gen_random_uuid(),
  naam        text not null,
  email       text not null default '',
  telefoon    text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.monteurs enable row level security;
grant select, insert, update, delete on public.monteurs to authenticated;
drop policy if exists "team monteurs" on public.monteurs;
create policy "team monteurs" on public.monteurs for all to authenticated using (true) with check (true);

select column_name from information_schema.columns where table_name = 'meldingen' and column_name like 'monteur%';

-- Prullenbakmelder: eenmalig uitvoeren in Supabase → SQL Editor → New query → Run

-- 1. Tabel met meldingen
create table if not exists public.meldingen (
  id          uuid primary key,
  user_id     uuid default auth.uid() references auth.users on delete set null,
  melder      text not null default '',
  ts          timestamptz not null,
  dag         date not null,
  soorten     text[] not null default '{}',
  tekst       text not null default '',
  nummer      text not null default '',
  adres       text not null default '',
  lat         double precision,
  lon         double precision,
  acc         real,
  fotos       jsonb not null default '[]',   -- [{path, w, h}] in bucket "fotos"
  verstuurd   boolean not null default false,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists meldingen_dag_idx on public.meldingen (dag);

-- 2. Alleen ingelogde gebruikers (het team) mogen lezen en schrijven
alter table public.meldingen enable row level security;
drop policy if exists "team leest" on public.meldingen;
drop policy if exists "team voegt toe" on public.meldingen;
drop policy if exists "team wijzigt" on public.meldingen;
drop policy if exists "team verwijdert" on public.meldingen;
create policy "team leest"      on public.meldingen for select to authenticated using (true);
create policy "team voegt toe"  on public.meldingen for insert to authenticated with check (true);
create policy "team wijzigt"    on public.meldingen for update to authenticated using (true) with check (true);
create policy "team verwijdert" on public.meldingen for delete to authenticated using (true);

-- 3. Afgeschermde opslag voor de foto's
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "team fotos lezen" on storage.objects;
drop policy if exists "team fotos uploaden" on storage.objects;
drop policy if exists "team fotos wijzigen" on storage.objects;
drop policy if exists "team fotos verwijderen" on storage.objects;
create policy "team fotos lezen"       on storage.objects for select to authenticated using (bucket_id = 'fotos');
create policy "team fotos uploaden"    on storage.objects for insert to authenticated with check (bucket_id = 'fotos');
create policy "team fotos wijzigen"    on storage.objects for update to authenticated using (bucket_id = 'fotos');
create policy "team fotos verwijderen" on storage.objects for delete to authenticated using (bucket_id = 'fotos');

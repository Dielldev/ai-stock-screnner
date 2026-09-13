-- AI Portfolio Tracker — Supabase schema
-- Run in the Supabase Dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null check (ticker = upper(ticker) and length(ticker) between 1 and 10),
  shares double precision not null check (shares > 0),
  avg_price double precision not null check (avg_price >= 0),
  created_at timestamptz not null default now(),
  -- One row per user per ticker; the API upserts on this constraint.
  unique (user_id, ticker)
);

create index if not exists portfolios_user_id_idx on public.portfolios (user_id);

alter table public.portfolios enable row level security;

create policy "Users can view their own holdings"
  on public.portfolios for select
  using (auth.uid() = user_id);

create policy "Users can insert their own holdings"
  on public.portfolios for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own holdings"
  on public.portfolios for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own holdings"
  on public.portfolios for delete
  using (auth.uid() = user_id);

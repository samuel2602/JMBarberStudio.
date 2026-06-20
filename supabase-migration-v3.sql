-- Ejecuta esto en Supabase SQL Editor (v3: dia cerrado + push notifications).

alter table day_schedules
  add column if not exists closed boolean not null default false;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references client_users(id) on delete cascade,
  phone text not null,
  role text not null default 'client' check (role in ('client', 'barber')),
  player_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_phone_idx on push_subscriptions(phone);
create index if not exists push_subscriptions_role_idx on push_subscriptions(role);

alter table push_subscriptions enable row level security;

grant select, insert, update, delete on push_subscriptions to anon, authenticated;

drop policy if exists "public push subscriptions access" on push_subscriptions;
create policy "public push subscriptions access"
on push_subscriptions
for all
to anon, authenticated
using (true)
with check (true);

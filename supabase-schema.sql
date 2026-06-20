create table if not exists client_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique not null,
  password_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references client_users(id) on delete set null,
  name text not null,
  phone text not null,
  date date not null,
  time text not null,
  service text not null default 'Corte',
  price integer not null default 16000,
  created_at timestamptz not null default now(),
  unique (date, time)
);

create index if not exists appointments_date_idx on appointments(date);
create index if not exists client_users_status_idx on client_users(status);

-- Demo simple desde HTML/JS: permite que la publishable key use estas tablas.
-- Para produccion real, lo ideal es migrar a Supabase Auth y politicas por usuario.
alter table client_users enable row level security;
alter table appointments enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on client_users to anon, authenticated;
grant select, insert, update, delete on appointments to anon, authenticated;

drop policy if exists "public client users access" on client_users;
drop policy if exists "public appointments access" on appointments;

create policy "public client users access"
on client_users
for all
to anon, authenticated
using (true)
with check (true);

create policy "public appointments access"
on appointments
for all
to anon, authenticated
using (true)
with check (true);

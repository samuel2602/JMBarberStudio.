-- Ejecuta esto en Supabase SQL Editor si ya tenias el esquema anterior.

create table if not exists blocked_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time text not null,
  note text default 'Bloqueado por barbero',
  created_at timestamptz not null default now(),
  unique (date, time)
);

create table if not exists day_schedules (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  hours text[] not null,
  updated_at timestamptz not null default now()
);

create table if not exists vip_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references client_users(id) on delete cascade,
  name text not null,
  phone text not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  time text not null,
  frequency text not null default 'weekly' check (frequency in ('weekly', 'biweekly')),
  start_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists vip_exceptions (
  id uuid primary key default gen_random_uuid(),
  vip_schedule_id uuid references vip_schedules(id) on delete cascade,
  original_date date not null,
  action text not null check (action in ('skip', 'reschedule')),
  new_date date,
  new_time text,
  created_at timestamptz not null default now(),
  unique (vip_schedule_id, original_date)
);

create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  message text not null,
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  related_date date,
  related_time text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists blocked_slots_date_idx on blocked_slots(date);
create index if not exists day_schedules_date_idx on day_schedules(date);
create index if not exists vip_schedules_user_idx on vip_schedules(user_id);
create index if not exists vip_exceptions_date_idx on vip_exceptions(original_date);
create index if not exists notification_log_status_idx on notification_log(status);

alter table blocked_slots enable row level security;
alter table day_schedules enable row level security;
alter table vip_schedules enable row level security;
alter table vip_exceptions enable row level security;
alter table notification_log enable row level security;

grant select, insert, update, delete on blocked_slots to anon, authenticated;
grant select, insert, update, delete on day_schedules to anon, authenticated;
grant select, insert, update, delete on vip_schedules to anon, authenticated;
grant select, insert, update, delete on vip_exceptions to anon, authenticated;
grant select, insert, update, delete on notification_log to anon, authenticated;

drop policy if exists "public blocked slots access" on blocked_slots;
drop policy if exists "public day schedules access" on day_schedules;
drop policy if exists "public vip schedules access" on vip_schedules;
drop policy if exists "public vip exceptions access" on vip_exceptions;
drop policy if exists "public notification log access" on notification_log;

create policy "public blocked slots access" on blocked_slots for all to anon, authenticated using (true) with check (true);
create policy "public day schedules access" on day_schedules for all to anon, authenticated using (true) with check (true);
create policy "public vip schedules access" on vip_schedules for all to anon, authenticated using (true) with check (true);
create policy "public vip exceptions access" on vip_exceptions for all to anon, authenticated using (true) with check (true);
create policy "public notification log access" on notification_log for all to anon, authenticated using (true) with check (true);

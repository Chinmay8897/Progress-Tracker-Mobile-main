create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type public.app_role as enum ('head_manager', 'admin_lite', 'project_lead', 'developer', 'support_agent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('critical', 'high', 'medium', 'low');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('open', 'in_progress', 'blocked', 'done', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.execution_status as enum ('pending', 'succeeded', 'failed', 'cancelled', 'needs_info');
exception when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email citext not null unique,
  password_hash text,
  phone_number text check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  role public.app_role not null default 'developer',
  avatar_color text not null default '#1a6cf5',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'open',
  deadline date not null,
  created_by uuid not null references public.users(id) on delete restrict,
  tags text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  target_user uuid not null references public.users(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_logs (
  id uuid primary key default gen_random_uuid(),
  raw_command text not null,
  parsed_intent text,
  execution_status public.execution_status not null,
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  performed_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_role on public.users(role);
create index if not exists idx_tasks_created_by on public.tasks(created_by);
create index if not exists idx_tasks_deadline on public.tasks(deadline);
create index if not exists idx_tasks_status_deadline on public.tasks(status, deadline);
create index if not exists idx_tasks_priority on public.tasks(priority);
create index if not exists idx_task_assignments_task on public.task_assignments(task_id);
create index if not exists idx_task_assignments_user on public.task_assignments(user_id);
create index if not exists idx_notifications_target_created on public.notifications(target_user, created_at desc);
create index if not exists idx_voice_logs_created_by_created on public.voice_logs(created_by, created_at desc);
create index if not exists idx_audit_logs_performed_by_timestamp on public.audit_logs(performed_by, timestamp desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_head_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'head_manager', false)
$$;

alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.notifications enable row level security;
alter table public.voice_logs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "users can read team profiles" on public.users;
create policy "users can read team profiles"
on public.users for select
to authenticated
using (true);

drop policy if exists "head managers manage users" on public.users;
create policy "head managers manage users"
on public.users for all
to authenticated
using (public.is_head_manager())
with check (public.is_head_manager());

drop policy if exists "users read accessible tasks" on public.tasks;
create policy "users read accessible tasks"
on public.tasks for select
to authenticated
using (
  public.is_head_manager()
  or created_by = auth.uid()
  or exists (
    select 1 from public.task_assignments ta
    where ta.task_id = tasks.id and ta.user_id = auth.uid()
  )
);

drop policy if exists "head managers manage all tasks" on public.tasks;
create policy "head managers manage all tasks"
on public.tasks for all
to authenticated
using (public.is_head_manager())
with check (public.is_head_manager());

drop policy if exists "assigned users update limited tasks" on public.tasks;
create policy "assigned users update limited tasks"
on public.tasks for update
to authenticated
using (
  exists (
    select 1 from public.task_assignments ta
    where ta.task_id = tasks.id and ta.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.task_assignments ta
    where ta.task_id = tasks.id and ta.user_id = auth.uid()
  )
);

drop policy if exists "users read accessible assignments" on public.task_assignments;
create policy "users read accessible assignments"
on public.task_assignments for select
to authenticated
using (public.is_head_manager() or user_id = auth.uid());

drop policy if exists "head managers manage assignments" on public.task_assignments;
create policy "head managers manage assignments"
on public.task_assignments for all
to authenticated
using (public.is_head_manager())
with check (public.is_head_manager());

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
on public.notifications for select
to authenticated
using (public.is_head_manager() or target_user = auth.uid());

drop policy if exists "authenticated users create notification records" on public.notifications;
create policy "authenticated users create notification records"
on public.notifications for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "users create own voice logs" on public.voice_logs;
create policy "users create own voice logs"
on public.voice_logs for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "head managers read voice logs" on public.voice_logs;
create policy "head managers read voice logs"
on public.voice_logs for select
to authenticated
using (public.is_head_manager() or created_by = auth.uid());

drop policy if exists "head managers read audit logs" on public.audit_logs;
create policy "head managers read audit logs"
on public.audit_logs for select
to authenticated
using (public.is_head_manager());

do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.task_assignments;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

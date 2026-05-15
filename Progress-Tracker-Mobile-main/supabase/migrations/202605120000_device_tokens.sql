create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safely add columns if the table already existed but was missing them from a previous run
alter table public.device_tokens 
  add column if not exists platform text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Safely add unique constraint if it doesn't exist
do $$ 
begin
  if not exists (
    select 1 
    from pg_constraint 
    where conname = 'device_tokens_user_id_token_key'
  ) then
    alter table public.device_tokens add constraint device_tokens_user_id_token_key unique(user_id, token);
  end if;
end $$;

create index if not exists idx_device_tokens_user on public.device_tokens(user_id);

drop trigger if exists set_device_tokens_updated_at on public.device_tokens;
create trigger set_device_tokens_updated_at
before update on public.device_tokens
for each row execute function public.set_updated_at();

alter table public.device_tokens enable row level security;

drop policy if exists "users manage own device tokens" on public.device_tokens;
create policy "users manage own device tokens"
on public.device_tokens for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.business_ledger (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null default '{"employees":[],"attendance":{},"loans":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users (id)
);

create table if not exists public.bookkeeping_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  title text not null,
  employee_count integer not null check (employee_count >= 0),
  total_loan_amount numeric(14, 0) not null check (total_loan_amount >= 0),
  total_repaid numeric(14, 0) not null check (total_repaid >= 0),
  total_outstanding numeric(14, 0) not null check (total_outstanding >= 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);

create index if not exists bookkeeping_reports_created_at_idx
  on public.bookkeeping_reports (created_at desc);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.set_business_ledger_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_ledger_updated_at on public.business_ledger;
create trigger business_ledger_updated_at
  before update on public.business_ledger
  for each row execute function public.set_business_ledger_updated_at();

alter table public.business_ledger enable row level security;
alter table public.bookkeeping_reports enable row level security;
alter table public.app_admins enable row level security;

revoke all on public.app_admins from anon, authenticated;

drop policy if exists "Authenticated users manage the business ledger"
  on public.business_ledger;
create policy "Authenticated users manage the business ledger"
  on public.business_ledger
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "Authenticated users read bookkeeping reports"
  on public.bookkeeping_reports;
create policy "Authenticated users read bookkeeping reports"
  on public.bookkeeping_reports
  for select
  to authenticated
  using (public.is_app_admin());

drop policy if exists "Authenticated users create bookkeeping reports"
  on public.bookkeeping_reports;
create policy "Authenticated users create bookkeeping reports"
  on public.bookkeeping_reports
  for insert
  to authenticated
  with check (public.is_app_admin() and auth.uid() = created_by);

grant select, insert, update, delete on public.business_ledger to authenticated;
grant select, insert on public.bookkeeping_reports to authenticated;

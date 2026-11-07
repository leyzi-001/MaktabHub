begin;
alter table public.app_users add column if not exists auth_user_id uuid references auth.users(id);
create unique index if not exists app_users_auth_user_id_key on public.app_users(auth_user_id);
-- app_users contains password hashes. Only the backend service role may access it.
alter table public.app_users enable row level security;
revoke all on public.app_users from anon, authenticated;
create table if not exists public.mh_auth_limits (key text primary key, starts_at timestamptz not null, attempts integer not null);
alter table public.mh_auth_limits enable row level security;
revoke all on public.mh_auth_limits from anon, authenticated;
create or replace function public.mh_consume_auth_limit(p_key text, p_seconds integer, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_seconds < 1 or p_limit < 1 then return false; end if;
  insert into public.mh_auth_limits as l(key, starts_at, attempts) values (p_key, clock_timestamp(), 1)
  on conflict (key) do update set
    attempts = case when l.starts_at <= clock_timestamp() - make_interval(secs => p_seconds) then 1 else least(l.attempts + 1, p_limit + 1) end,
    starts_at = case when l.starts_at <= clock_timestamp() - make_interval(secs => p_seconds) then clock_timestamp() else l.starts_at end
  returning attempts into n;
  return n <= p_limit;
end $$;
create or replace function public.mh_auth_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) and deleted_at is null limit 1;
$$;
revoke all on function public.mh_consume_auth_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.mh_auth_id_by_email(text) from public, anon, authenticated;
grant execute on function public.mh_consume_auth_limit(text, integer, integer) to service_role;
grant execute on function public.mh_auth_id_by_email(text) to service_role;
-- Protected writes must pass the backend's verification middleware.
alter table public.posts enable row level security;
revoke insert, update, delete on public.posts from anon, authenticated;
grant all on public.mh_auth_limits to service_role;
commit;
-- Optional daily Supabase Cron cleanup:
-- delete from public.mh_auth_limits where starts_at < now() - interval '2 days';

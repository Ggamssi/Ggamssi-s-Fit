-- Fresh installations only. For existing tables, run migrations/20261013_public_local.sql then migrations/20261013_team_wod.sql.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.exercise_records') is not null
     or to_regclass('public.exercises') is not null
     or to_regclass('public.excercise_records') is not null then
    raise exception 'Existing table found. Review metadata and backup, then use the migration; do not drop/recreate tables.';
  end if;
end $$;

create table public.exercise_records (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workout_date date not null check (workout_date <= (now() at time zone 'Asia/Seoul')::date),
  name text not null check (char_length(trim(name)) between 1 and 100),
  category text not null check (category in ('역도', '웨이트', '유산소', '맨몸', '스트레칭', '기타')),
  body_parts text[] not null check (cardinality(body_parts) between 1 and 7 and body_parts <@ array['전신', '하체', '등', '가슴', '어깨', '팔', '코어']::text[] and array_position(body_parts, null) is null),
  duration numeric check (duration > 0 and duration <= 1440),
  weight numeric check (weight > 0 and weight <= 2000),
  sets integer check (sets > 0 and sets <= 1000),
  reps integer check (reps > 0 and reps <= 100000),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.exercise_records add column if not exists record_type text not null default 'exercise' check (record_type in ('exercise', 'wod'));
alter table public.exercise_records add column if not exists wod jsonb;
alter table public.exercise_records add column if not exists set_entries jsonb;
alter table public.exercise_records add column if not exists wod_mode text not null default 'individual';
alter table public.exercise_records add column if not exists team_size integer not null default 1;
alter table public.exercise_records add column if not exists team_partners text not null default '';
alter table public.exercise_records add column if not exists team_rules text[] not null default '{}';
alter table public.exercise_records add constraint exercise_records_team_wod_check check (
  wod_mode in ('individual', 'team')
  and char_length(team_partners) <= 500
  and team_rules <@ array['partition', 'you_go_i_go', 'synchro']::text[]
  and cardinality(team_rules) between 0 and 3
  -- Counting distinct allowed values rejects both duplicates and NULL elements.
  and cardinality(team_rules) = (
    case when team_rules @> array['partition']::text[] then 1 else 0 end
    + case when team_rules @> array['you_go_i_go']::text[] then 1 else 0 end
    + case when team_rules @> array['synchro']::text[] then 1 else 0 end
  )
  and (
    (wod_mode = 'individual' and team_size = 1 and team_partners = '' and cardinality(team_rules) = 0)
    or (wod_mode = 'team' and record_type = 'wod' and team_size between 2 and 20)
  )
);
alter table public.exercise_records drop constraint if exists exercise_records_category_check;
alter table public.exercise_records add constraint exercise_records_category_check check (category in ('역도', '웨이트', '유산소', '맨몸', '스트레칭', '기타', '크로스핏 와드'));
alter table public.exercise_records drop constraint if exists exercise_records_wod_check;
alter table public.exercise_records add constraint exercise_records_wod_check check (
  (record_type = 'exercise' and category <> '크로스핏 와드' and wod is null)
  or (record_type = 'wod' and category = '크로스핏 와드' and weight is null and sets is null and reps is null and coalesce(
    jsonb_typeof(wod) = 'object'
    and wod->>'type' in ('AMRAP', 'EMOM', 'FOR TIME', '기타')
    and wod->>'scaling' in ('Rx', 'Scaled')
    and jsonb_typeof(wod->'prescription') = 'string'
    and char_length(trim(wod->>'prescription')) between 1 and 3000
    and jsonb_typeof(wod->'modifications') = 'string'
    and char_length(wod->>'modifications') <= 3000
    and (wod->>'scaling' = 'Rx' or char_length(trim(wod->>'modifications')) > 0), false))
);

create or replace function public.valid_set_entries(entries jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
declare
  entry jsonb;
  weight_value numeric;
  reps_value numeric;
begin
  if entries is null then
    return true;
  end if;
  if jsonb_typeof(entries) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(entries) > 1000 then
    return false;
  end if;
  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry) <> 'object' then
      return false;
    end if;
    if not (entry ?& array['weight', 'reps', 'completed'])
       or entry - array['weight', 'reps', 'completed'] <> '{}'::jsonb then
      return false;
    end if;
    if jsonb_typeof(entry->'weight') not in ('number', 'null')
       or jsonb_typeof(entry->'reps') <> 'number'
       or jsonb_typeof(entry->'completed') <> 'boolean' then
      return false;
    end if;
    if jsonb_typeof(entry->'weight') = 'number' then
      weight_value := (entry->>'weight')::numeric;
      if weight_value < 0 or weight_value > 2000 then
        return false;
      end if;
    end if;
    reps_value := (entry->>'reps')::numeric;
    if reps_value < 1 or reps_value > 100000 or reps_value <> trunc(reps_value) then
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke all privileges on function public.valid_set_entries(jsonb) from public, anon, authenticated;
grant execute on function public.valid_set_entries(jsonb) to anon, authenticated;

alter table public.exercise_records add constraint exercise_records_set_entries_check check (
  set_entries is null
  or (record_type = 'exercise' and weight is null and sets is null and reps is null
      and public.valid_set_entries(set_entries))
) not valid;
alter table public.exercise_records validate constraint exercise_records_set_entries_check;

create index if not exists exercise_records_user_date on public.exercise_records (user_id, workout_date desc);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  category varchar(50) not null,
  target_parts text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index exercises_name_idx on public.exercises (name);
create index exercises_category_idx on public.exercises (category);

alter table public.exercise_records enable row level security;
alter table public.exercises enable row level security;

-- Remove ALL existing policies, not only known names: permissive policies combine with OR.
do $$
declare
  p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('exercise_records', 'exercises') loop
    raise notice 'Removing policy %.%: %', p.schemaname, p.tablename, p.policyname;
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "Members read own exercises" on public.exercise_records for select to authenticated using ((select auth.uid())::text = user_id);
create policy "Members insert own exercises" on public.exercise_records for insert to authenticated with check ((select auth.uid())::text = user_id);
create policy "Members delete own exercises" on public.exercise_records for delete to authenticated using ((select auth.uid())::text = user_id);
create policy "Public read local exercises" on public.exercise_records for select to anon using (user_id = 'local');
create policy "Public insert local exercises" on public.exercise_records for insert to anon with check (user_id = 'local');
create policy "Public delete local exercises" on public.exercise_records for delete to anon using (user_id = 'local');
create policy "Read exercise catalog" on public.exercises for select to anon, authenticated using (true);

-- Table REVOKE alone does not clear independent column-level grants (including defaults).
revoke all privileges on table public.exercise_records, public.exercises from public, anon, authenticated;
do $$
declare
  c record;
begin
  for c in select table_name, column_name from information_schema.columns
           where table_schema = 'public' and table_name in ('exercise_records', 'exercises') loop
    execute format('revoke all privileges (%I) on table public.%I from public, anon, authenticated', c.column_name, c.table_name);
  end loop;
end $$;
grant usage on schema public to anon, authenticated;
grant select, insert, delete on public.exercise_records to anon;
grant select, insert, delete on public.exercise_records to authenticated;
grant select on public.exercises to anon, authenticated;

-- Abort if inherited role grants still permit forbidden operations. Never change other roles here.
do $$
declare
  r text;
  t text;
  c record;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['exercise_records', 'exercises'] loop
      if has_table_privilege(r, 'public.' || t, 'UPDATE')
         or has_table_privilege(r, 'public.' || t, 'TRUNCATE')
         or has_table_privilege(r, 'public.' || t, 'REFERENCES')
         or has_table_privilege(r, 'public.' || t, 'TRIGGER')
         or (t = 'exercises' and (has_table_privilege(r, 'public.' || t, 'INSERT') or has_table_privilege(r, 'public.' || t, 'DELETE'))) then
        raise exception 'Unexpected inherited table privileges for % on %. Roll back and review role memberships/grants.', r, t;
      end if;
      for c in select column_name from information_schema.columns where table_schema = 'public' and table_name = t loop
        if has_column_privilege(r, 'public.' || t, c.column_name, 'UPDATE')
           or has_column_privilege(r, 'public.' || t, c.column_name, 'REFERENCES')
           or has_column_privilege(r, 'public.' || t, c.column_name, 'SELECT WITH GRANT OPTION')
           or has_column_privilege(r, 'public.' || t, c.column_name, 'INSERT WITH GRANT OPTION')
           or (t = 'exercises' and has_column_privilege(r, 'public.' || t, c.column_name, 'INSERT')) then
          raise exception 'Unexpected inherited column privileges for % on %.%. Roll back and review grants.', r, t, c.column_name;
        end if;
      end loop;
      if has_table_privilege(r, 'public.' || t, 'SELECT WITH GRANT OPTION')
         or (t = 'exercise_records' and (has_table_privilege(r, 'public.' || t, 'INSERT WITH GRANT OPTION') or has_table_privilege(r, 'public.' || t, 'DELETE WITH GRANT OPTION'))) then
        raise exception 'Unexpected inherited grant option for % on %. Review grants before retrying.', r, t;
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = r and (rolsuper or rolbypassrls))
       or exists (select 1 from pg_class where oid in ('public.exercise_records'::regclass, 'public.exercises'::regclass) and pg_has_role(r, relowner, 'USAGE')) then
      raise exception 'Role % can bypass RLS or act as table owner. Review roles before retrying.', r;
    end if;
  end loop;
end $$;

commit;

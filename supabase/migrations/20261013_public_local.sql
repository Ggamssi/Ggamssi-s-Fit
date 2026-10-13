-- Existing installations only. SQL Editor compatible; no includes or server writes outside this transaction.
-- Review README metadata queries, DDL authorization and a restorable backup BEFORE execution.
begin;
set local lock_timeout = '5s';

do $$
declare
  records oid := to_regclass('public.exercise_records');
  catalog oid := to_regclass('public.exercises');
  user_column smallint;
  user_type oid;
  c record;
begin
  if records is null or to_regclass('public.excercise_records') is not null then
    raise exception 'Expected only public.exercise_records. Missing/alternate table: stop and review metadata; never rename or drop automatically.';
  end if;
  if exists (select 1 from pg_class where oid in (records, catalog) and (relkind <> 'r' or relispartition))
     or exists (select 1 from pg_inherits where inhrelid in (records, catalog) or inhparent in (records, catalog)) then
    raise exception 'Unexpected table kind/partition/inheritance. Stop and review dependencies with an administrator.';
  end if;
  -- Lock before inspecting dependencies so concurrent DDL cannot invalidate the checks.
  lock table public.exercise_records in access exclusive mode;
  if catalog is not null then
    lock table public.exercises in access exclusive mode;
  end if;
  select attnum, atttypid into user_column, user_type from pg_attribute
    where attrelid = records and attname = 'user_id' and not attisdropped;
  if user_column is null or user_type not in ('uuid'::regtype, 'text'::regtype)
     or not exists (select 1 from pg_attribute where attrelid = records and attnum = user_column and attnotnull and attgenerated = '' and attidentity = '')
     or exists (select 1 from pg_attrdef where adrelid = records and adnum = user_column) then
    raise exception 'Expected NOT NULL user_id uuid/text without default/generated expression. Stop; review type/default and backup before a dedicated migration.';
  end if;

  -- Required existing record columns; optional WOD columns are added below if missing.
  for c in select * from (values
    ('id', 'uuid'), ('workout_date', 'date'), ('name', 'text'), ('category', 'text'),
    ('body_parts', 'text[]'), ('duration', 'numeric'), ('weight', 'numeric'),
    ('sets', 'integer'), ('reps', 'integer'), ('notes', 'text'), ('created_at', 'timestamp with time zone')
  ) as expected(column_name, data_type) loop
    if not exists (select 1 from pg_attribute where attrelid = records and attname = c.column_name
                   and not attisdropped and format_type(atttypid, atttypmod) = c.data_type) then
      raise exception 'Unexpected exercise_records column/type: %. Stop and review the existing contract.', c.column_name;
    end if;
  end loop;
  if exists (select 1 from pg_attribute where attrelid = records and not attisdropped
             and ((attname = 'record_type' and atttypid <> 'text'::regtype) or (attname = 'wod' and atttypid <> 'jsonb'::regtype))) then
    raise exception 'Unexpected record_type/wod type. Stop and review the existing WOD contract.';
  end if;
  if exists (
    select 1 from pg_attribute a
    where a.attrelid = records and a.attname = 'set_entries' and not a.attisdropped
      and (a.atttypid <> 'jsonb'::regtype or a.attnotnull or a.attgenerated <> '' or a.attidentity <> ''
           or exists (select 1 from pg_attrdef d where d.adrelid = records and d.adnum = a.attnum))
  ) then
    raise exception 'Expected nullable set_entries jsonb without default/generated expression. Stop and review the set contract.';
  end if;
  if catalog is not null then
    for c in select * from (values
      ('id', 'uuid'), ('name', 'character varying(255)'), ('category', 'character varying(50)'),
      ('target_parts', 'text[]'), ('created_at', 'timestamp with time zone')
    ) as expected(column_name, data_type) loop
      if not exists (select 1 from pg_attribute where attrelid = catalog and attname = c.column_name
                     and not attisdropped and format_type(atttypid, atttypmod) = c.data_type) then
        raise exception 'Unexpected exercises column/type: %. Stop; do not recreate the catalog.', c.column_name;
      end if;
    end loop;
  end if;

  -- Only the single-column exercise_records.user_id -> auth.users.id FK may be removed.
  -- Any inbound FK, composite FK, catalog FK or other table FK needs a separate reviewed plan.
  if exists (
    select 1 from pg_constraint fk
    where fk.contype = 'f' and (fk.conrelid in (records, catalog) or fk.confrelid in (records, catalog))
      and not (fk.conrelid = records and fk.confrelid = 'auth.users'::regclass
               and fk.conkey = array[user_column]::smallint[]
               and fk.confkey = array[(select attnum from pg_attribute where attrelid = 'auth.users'::regclass and attname = 'id' and not attisdropped)]::smallint[])
  ) then
    raise exception 'Unexpected foreign key (including another table dependency). Stop and inspect pg_constraint; no CASCADE or table recreation is allowed.';
  end if;
  if exists (select 1 from pg_trigger where tgrelid in (records, catalog) and not tgisinternal) then
    raise exception 'Unexpected application trigger. Review side effects before enabling public writes.';
  end if;
  -- Policies are explicitly replaced; ordinary simple indexes and the approved FK are safe.
  -- Views, rules, expressions, checks/unique constraints on user_id, etc. must be reviewed first.
  if exists (
    select 1 from pg_depend d
    where d.refclassid = 'pg_class'::regclass and d.refobjid = records and d.refobjsubid = user_column
      and not (
        (d.classid = 'pg_policy'::regclass and exists (
          select 1 from pg_policy p where p.oid = d.objid and p.polrelid in (records, catalog)))
        or (d.classid = 'pg_constraint'::regclass and exists (
          select 1 from pg_constraint fk where fk.oid = d.objid and fk.contype = 'f'
            and fk.conrelid = records and fk.confrelid = 'auth.users'::regclass and fk.conkey = array[user_column]::smallint[]))
        or (d.classid = 'pg_class'::regclass and exists (
          select 1 from pg_index i where i.indexrelid = d.objid and i.indrelid = records
            and i.indexprs is null and i.indpred is null and not i.indisunique))
      )
  ) then
    raise exception 'Unexpected user_id dependency. Inspect pg_depend and definitions with an administrator; do not use CASCADE.';
  end if;
end $$;

-- Inspect/log and remove ALL existing policies before changing user_id or granting anon access.
-- Leaving even one permissive PUBLIC policy could expose UUID-owned historical records.
do $$
declare
  p record;
begin
  for p in select * from pg_policies
           where schemaname = 'public' and tablename in ('exercise_records', 'exercises') loop
    raise notice 'Removing policy %.%: %, roles %, command %, USING %, CHECK %',
      p.schemaname, p.tablename, p.policyname, p.roles, p.cmd, p.qual, p.with_check;
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

do $$
declare
  fk record;
begin
  for fk in select conname from pg_constraint
  where conrelid = 'public.exercise_records'::regclass and contype = 'f'
              and confrelid = 'auth.users'::regclass
              and conkey = array[(select attnum from pg_attribute where attrelid = 'public.exercise_records'::regclass and attname = 'user_id' and not attisdropped)]::smallint[] loop
    execute format('alter table public.exercise_records drop constraint %I', fk.conname);
  end loop;
  -- UUID values become the same UUID string, never 'local'; existing rows and IDs are preserved.
  alter table public.exercise_records alter column user_id type text using user_id::text;
exception when others then
  raise exception 'user_id conversion failed; transaction must be rolled back. Review dependent objects; do not drop tables or use CASCADE. Cause: %', SQLERRM;
end $$;

alter table public.exercise_records add column if not exists record_type text not null default 'exercise' check (record_type in ('exercise', 'wod'));
alter table public.exercise_records add column if not exists wod jsonb;
alter table public.exercise_records add column if not exists set_entries jsonb;
alter table public.exercise_records alter column record_type set not null;
alter table public.exercise_records drop constraint if exists exercise_records_record_type_check;
alter table public.exercise_records add constraint exercise_records_record_type_check check (record_type in ('exercise', 'wod'));
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

alter table public.exercise_records drop constraint if exists exercise_records_set_entries_check;
alter table public.exercise_records add constraint exercise_records_set_entries_check check (
  set_entries is null
  or (record_type = 'exercise' and weight is null and sets is null and reps is null
      and public.valid_set_entries(set_entries))
) not valid;
alter table public.exercise_records validate constraint exercise_records_set_entries_check;

create index if not exists exercise_records_user_date on public.exercise_records (user_id, workout_date desc);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  category varchar(50) not null,
  target_parts text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists exercises_name_idx on public.exercises (name);
create index if not exists exercises_category_idx on public.exercises (category);
do $$
declare
  c text;
begin
  foreach c in array array['name', 'category'] loop
    if not exists (
      select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attname = c
      where i.indexrelid = to_regclass('public.exercises_' || c || '_idx')
        and i.indrelid = 'public.exercises'::regclass and i.indisvalid
        and i.indnatts = 1 and i.indkey::text = a.attnum::text and i.indpred is null and i.indexprs is null
    ) then
      raise exception 'Unexpected catalog index name/definition for %. Stop and review indexes.', c;
    end if;
  end loop;
end $$;

alter table public.exercise_records enable row level security;
alter table public.exercises enable row level security;
create policy "Members read own exercises" on public.exercise_records for select to authenticated using ((select auth.uid())::text = user_id);
create policy "Members insert own exercises" on public.exercise_records for insert to authenticated with check ((select auth.uid())::text = user_id);
create policy "Members delete own exercises" on public.exercise_records for delete to authenticated using ((select auth.uid())::text = user_id);
create policy "Public read local exercises" on public.exercise_records for select to anon using (user_id = 'local');
create policy "Public insert local exercises" on public.exercise_records for insert to anon with check (user_id = 'local');
create policy "Public delete local exercises" on public.exercise_records for delete to anon using (user_id = 'local');
create policy "Read exercise catalog" on public.exercises for select to anon, authenticated using (true);

-- Table REVOKE alone does not clear independent column-level grants.
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
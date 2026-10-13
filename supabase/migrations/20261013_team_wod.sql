-- Run AFTER 20261013_public_local.sql on existing installations.
-- Review metadata and a restorable backup before execution. Existing RLS/grants are unchanged.
begin;
set local lock_timeout = '5s';

-- Serialize DDL and validation; timeout or any invalid existing data rolls back all changes.
lock table public.exercise_records in access exclusive mode;

do $$
declare
  c record;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.exercise_records'::regclass
      and attname = 'record_type' and not attisdropped
      and atttypid = 'text'::regtype and attnotnull
  ) then
    raise exception 'Expected record_type text NOT NULL. Run 20261013_public_local.sql first.';
  end if;
  for c in
    select a.attname, a.atttypid, a.atttypmod, a.attgenerated, a.attidentity, expected.type_oid
    from pg_attribute a
    join (values
      ('wod_mode', 'text'::regtype),
      ('team_size', 'integer'::regtype),
      ('team_partners', 'text'::regtype),
      ('team_rules', 'text[]'::regtype)
    ) as expected(column_name, type_oid) on a.attname = expected.column_name
    where a.attrelid = 'public.exercise_records'::regclass and not a.attisdropped
  loop
    if c.atttypid <> c.type_oid or c.atttypmod <> -1
       or c.attgenerated <> '' or c.attidentity <> '' then
      raise exception 'Unexpected definition for %. Review metadata; no automatic type conversion.', c.attname;
    end if;
  end loop;
end $$;

-- Defaults keep all historical exercise/WOD rows compatible without rewriting their payloads.
alter table public.exercise_records
  add column if not exists wod_mode text not null default 'individual',
  add column if not exists team_size integer not null default 1,
  add column if not exists team_partners text not null default '',
  add column if not exists team_rules text[] not null default '{}';

-- Reassert the contract on retries; pre-existing NULL/invalid values abort rather than being erased.
alter table public.exercise_records
  alter column wod_mode set default 'individual',
  alter column wod_mode set not null,
  alter column team_size set default 1,
  alter column team_size set not null,
  alter column team_partners set default '',
  alter column team_partners set not null,
  alter column team_rules set default '{}',
  alter column team_rules set not null;

alter table public.exercise_records drop constraint if exists exercise_records_team_wod_check;
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
) not valid;
alter table public.exercise_records validate constraint exercise_records_team_wod_check;

commit;
create table if not exists public.exercise_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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

create index if not exists exercise_records_user_date on public.exercise_records (user_id, workout_date desc);
alter table public.exercise_records enable row level security;

drop policy if exists "Members read own exercises" on public.exercise_records;
create policy "Members read own exercises" on public.exercise_records for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Members insert own exercises" on public.exercise_records;
create policy "Members insert own exercises" on public.exercise_records for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Members delete own exercises" on public.exercise_records;
create policy "Members delete own exercises" on public.exercise_records for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.exercise_records to authenticated;

# Ggamssi`s-Fit 운동 다이어리

Vue 3 + JavaScript + Vite로 만든 개인 운동 기록 웹입니다. 앱 화면과 기록 로직은 JavaScript이며, 기존 Vite 도구 설정과 부트스트랩은 TypeScript 설정을 유지합니다.

## 제공 기능

- 날짜별 운동 이름, 종류(역도·웨이트·유산소·맨몸·스트레칭·기타), 여러 운동 부위 기록
- 선택 입력: 운동 시간(분), 중량(kg), 세트 수, 세트당 횟수, 메모
- 일반 운동 세트별 중량·반복 수·완료 여부 계약 추가 (Step3 앱·테스트 개발 및 검증 진행 중). 구형 요약 기록은 유지하고 와드에는 세트 배열을 저장하지 않습니다.
- 일반 운동 / 크로스핏 와드 선택, 와드 이름(생략 시 오늘의 와드), 자유텍스트 처방 구성과 Rx/Scaled 실제 변경 내용
- AMRAP: 제한 시간·완료 라운드·추가 반복 수·마지막 진행량 / EMOM: 총 시간·목표 달성 구간 수·수행 상태·미달 내용
- FOR TIME: 목표 라운드·타임캡(선택), 완주 시간(분/초) 또는 타임캡 도달·중도 종료 진행량 / 기타: 자유텍스트 결과
- 월별 운동 일수·운동 수·입력 시간 합계·선택 부위별 횟수
- 종류 필터, 날짜 캘린더, 기록 삭제, 모바일 화면
- 회원가입·로그인 창 제공 (실제 인증 기능은 일시 중단)

부위는 사용자가 직접 선택합니다. 부위별 집계는 실제 운동 효과, 건강 상태, 운동 강도를 판정하지 않습니다. WOD 조회와 관리자 화면은 현재 범위에 포함하지 않습니다.

와드는 구성 전체가 운동 1개로 집계됩니다. 누적 시간은 직접 입력한 운동 시간만 합산하며, 제한 시간·타임캡·완주 시간을 자동으로 더하지 않습니다. 같은 와드 동작을 일반 운동으로도 중복 기록하지 마세요. EMOM은 1분을 한 구간으로 기록합니다. 기존 브라우저의 일반 운동 기록은 그대로 읽습니다. 최고 기록 자동 비교는 제공하지 않으며, 비교 시에는 같은 구성·중량·수행 기준인지 확인해야 합니다.

## 로컬 실행

Node.js 24.15 이상인 24 LTS 버전을 권장합니다.

```powershell
npm install
npm run dev
```

인증은 일시 중단 상태입니다. 회원가입·로그인 창은 유지하지만 인증 요청과 기존 세션 복원은 실행하지 않습니다. 아래 SQL은 Step1 공용 DB 전환과 Step3 세트 계약까지 포함한 최종 적용본입니다. 앱·테스트 작업은 별도로 진행 중이며 Step3 검증 전에는 통합 완료로 판단하지 않습니다. SQL 준비만으로 서버에 적용되거나 앱이 공용 DB에 연결되지는 않습니다.

기존 브라우저 localStorage 기록은 그대로 두며 자동 업로드·계정 이전·삭제하지 않습니다. 공용 DB 실패 시 localStorage에 대신 저장하거나 두 저장소를 합치는 fallback도 사용하지 않는 것이 전환 계약입니다. 기존 로컬 기록은 기기 간 동기화되지 않고 브라우저 데이터를 지우면 사라집니다.

## Supabase 연결

### 현재 확인 범위와 공용 DB 계약

2026-10-13 읽기 전용 확인에서 실제 `public.exercise_records`와 `public.exercises`는 존재하고, 오타 이름 `public.excercise_records`는 없습니다. 공개키로 metadata root 접근은 거부되었으며 관리 연결도 없습니다. **이 SQL은 실제 서버에 아직 적용하지 않았고, 실제 컬럼·FK·정책·권한 전체 및 RLS 동작은 검증하지 못했습니다.** 테이블 존재나 공개키의 읽기 성공은 쓰기 준비 완료의 증거가 아닙니다.

- 실제 기록 테이블은 `public.exercise_records` 하나로 고정합니다. 기존 테이블 삭제·재생성·오타 이름 fallback은 하지 않습니다.
- `user_id`는 `text`입니다. 기존 UUID 값은 `USING user_id::text`로 보존하며 기존 행을 `local`로 바꾸지 않습니다. `user_id`의 단일 `auth.users(id)` FK만 제거합니다.
- `anon`은 `user_id = 'local'`인 공용 기록만 SELECT/INSERT/DELETE 가능합니다. 로그인 기능 중단과 공용 DB 연결은 독립적이며, 공용 사용을 위해 인증을 재개할 필요가 없습니다.
- 기존 회원 기록은 `authenticated`의 `auth.uid()::text = user_id` SELECT/INSERT/DELETE 정책으로 유지합니다. `anon`은 기존 UUID 소유 기록을 읽거나 삭제할 수 없습니다.
- `exercises`는 `anon`과 `authenticated` 모두 SELECT만 가능합니다. 새 카탈로그는 UUID `id`, `name varchar(255)`, `category varchar(50)`, `target_parts text[]`, `created_at timestamptz`와 이름/종류 인덱스로 만듭니다.
- 양쪽 테이블의 RLS를 유지합니다. 기록 UPDATE, 카탈로그 INSERT/UPDATE/DELETE, TRUNCATE 등을 허용하지 않습니다. 기존 **모든 정책을 제거**한 뒤 위 정책만 생성하고 `PUBLIC`, `anon`, `authenticated`의 기존 테이블/컬럼 단위 권한을 회수하여 필요한 권한만 재부여합니다.
- 일반 운동 및 `record_type`/`wod` 계약은 유지합니다. nullable `set_entries jsonb`를 추가하며 SQL NULL인 구형 기록은 기존 `weight`/`sets`/`reps`와 함께 그대로 보존합니다. 기존 행 변환·덮어쓰기는 하지 않습니다.
- `set_entries`가 SQL NULL이 아니면 일반 운동(`record_type = 'exercise'`)에서만 허용하며 기존 요약 필드 `weight`/`sets`/`reps`는 모두 SQL NULL이어야 합니다. 와드는 항상 `set_entries`가 SQL NULL이어야 합니다. JSON `null`은 SQL NULL과 달리 허용하지 않습니다.
- 세트 배열은 빈 배열을 포함해 최대 1000개 객체입니다. 각 객체는 `weight`, `reps`, `completed` 세 키만 반드시 가져야 합니다. `weight`는 JSON 숫자 0..2000 또는 JSON `null`, `reps`는 JSON 숫자인 정수 1..100000, `completed`는 JSON boolean입니다. 누락·추가 키, 문자열 숫자, 잘못된 타입은 거절합니다.
- `public.valid_set_entries(jsonb)`는 고정 `search_path = pg_catalog`의 `IMMUTABLE`, `SECURITY INVOKER` 검증 함수이며 타입을 확인한 뒤에만 숫자로 변환합니다. 세트 CHECK는 `NOT VALID`로 추가한 뒤 같은 트랜잭션에서 `VALIDATE CONSTRAINT`로 기존 행까지 검사합니다. 위반 데이터가 있으면 전체 적용이 실패하며 자동 수정·삭제하지 않습니다.

**공용 위험:** `local`은 개인이나 기기별 소유자 구분이 아닙니다. 공개키를 가진 누구나 모든 `local` 기록을 조회·추가·삭제할 수 있으며, 필터나 UI는 접근 통제가 아닙니다. 민감정보를 기록하지 마세요. 개인별 격리·악의적 삭제 방지·남용 제한이 필요한 운영에는 이 모델을 사용하지 마세요.

### 환경변수

프로젝트 루트의 `.env.local`과 배포 환경에 다음 값을 설정합니다. 로컬 파일은 Git에 포함하지 않습니다. 제공된 로컬 연결 정보가 있더라도 배포 환경에는 별도로 등록해야 합니다.

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

이 두 값은 프론트엔드에 공개됩니다. `service_role`, secret key, 관리 DB 비밀번호는 절대 넣지 마세요. 설정 변경 후 개발 서버 재시작 또는 재배포가 필요합니다. 공용 DB 전환 시 환경변수가 없거나 유효하지 않으면 쓰기를 차단하고 설정 오류를 알리는 계약이며, 로컬 저장으로 전환하지 않습니다. 앱 측 차단 구현과 검증은 별도 단계입니다.

### SQL Editor 적용 절차 (관리자 승인 후 수동 수행)

1. 아래 읽기 전용 metadata SQL을 **대상 프로젝트의 관리자 SQL Editor**에서 실행해 실제 테이블 이름/형식, 컬럼, FK와 의존 객체, 모든 정책과 테이블/컬럼 ACL, 역할 상속을 확인합니다. 공개키 REST metadata 응답으로 대신 판단하지 마세요.
2. 운영 DDL 변경 승인과 작업 시간 확보, 쓰기/동시 DDL 중지, 데이터 및 정책·권한·의존 객체를 포함한 백업의 복원 가능 여부를 먼저 확인합니다. 두 테이블 소유자 또는 승인된 관리 역할의 DDL/정책/GRANT 권한이 필요합니다. 정책 전면 교체를 승인하지 못하면 적용하지 않습니다. 제공된 SQL은 다른 역할이나 전역 default privileges를 변경하지 않습니다. 앞으로 추가되는 테이블/컬럼은 권한을 별도 점검해야 합니다.
3. **새 설치:** 두 테이블이 모두 없을 때만 `supabase/schema.sql` 전체를 실행합니다. 기존 테이블 또는 오타 테이블이 있으면 이 파일은 중단합니다.
4. **기존 설치 (현재 확인된 환경):** Step3 검증과 관리자 승인 후 최종 `supabase/migrations/20261013_public_local.sql` 전체를 실행합니다. 이전 Step1 적용본을 이미 실행한 환경도 최종본 전체를 다시 적용하여 세트 계약을 추가합니다. 실제 `exercise_records`는 필수이며, 기존 `exercises`는 보존하고 없을 때만 생성합니다. 두 파일은 각각 SQL Editor에서 독립 실행 가능한 `BEGIN`/`COMMIT` 트랜잭션이며, psql include가 없습니다. 일부 문장만 선택 실행하거나 기존 설치에 `schema.sql`을 실행하지 마세요.
5. 예상 밖 `user_id` 타입/기본값, 컬럼 타입, 다른 테이블 FK, user_id 의존 뷰·식·제약, 사용자 트리거, 상속 권한 등이 발견되면 중단합니다. 잠금은 최대 5초 기다리며 UUID→text는 테이블/인덱스 재작성 비용이 있을 수 있습니다. 오류가 나면 `ROLLBACK`으로 트랜잭션을 종료하고 관리자가 원인을 검토해야 합니다. `CASCADE`, 테이블 재생성, 임의 제약 삭제로 우회하지 마세요. 기존 데이터가 계약 제약을 위반해도 전체 적용은 실패해야 합니다.
6. 적용 후 같은 metadata SQL로 RLS 활성화, 정책 6개(기록) + 1개(카탈로그), `user_id text`, FK 제거, 허용/금지 권한과 인덱스를 확인하고 백업 대비 행 수·ID·UUID 소유값·WOD·구형 요약 데이터가 보존되었는지 대조합니다. `set_entries`의 nullable jsonb 타입, 검증 함수 정의·권한, `exercise_records_set_entries_check`의 `convalidated = true`도 확인합니다. 이후 **별도 승인된 검증 단계**에서 실제 anon 및 서로 다른 회원 토큰으로 소유권 경계, INSERT/DELETE, UPDATE 및 카탈로그 쓰기 거절과 세트 경계값·잘못된 타입/키·요약 충돌·WOD 세트 거절을 검증해야 합니다. 관리자/`service_role` 조회는 RLS 검증이 아닙니다. 이번 단계에서는 서버 쓰기나 DDL 및 이 검증을 수행하지 않습니다.

### 쓰기 준비 확인용 읽기 전용 metadata SQL

아래 쿼리는 앱 데이터와 서버 설정을 변경하지 않습니다. 적용 전후 결과를 관리자와 검토하세요. 결과가 없거나 권한이 거절되면 **준비 상태 불명**이며 쓰기 가능으로 간주하지 않습니다. 메타데이터만으로 실제 RLS 요청 성공/거절이 입증되지는 않습니다.

```sql
begin read only;

select current_database(), current_user, version();
select name, to_regclass(name) as actual_relation
from (values ('public.exercise_records'), ('public.excercise_records'), ('public.exercises')) as expected(name);

select c.oid::regclass as table_name, c.relkind, c.relispartition,
       pg_get_userbyid(c.relowner) as owner, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
where c.oid in (to_regclass('public.exercise_records'), to_regclass('public.exercises'));

select a.attrelid::regclass as table_name, a.attname,
       format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid) as column_default, a.attgenerated, a.attidentity
from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid in (to_regclass('public.exercise_records'), to_regclass('public.exercises'))
  and a.attnum > 0 and not a.attisdropped
order by table_name, a.attnum;

select conrelid::regclass as source_table, conname, contype,
       confrelid::regclass as referenced_table, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (to_regclass('public.exercise_records'), to_regclass('public.exercises'))
   or confrelid in (to_regclass('public.exercise_records'), to_regclass('public.exercises'));

select p.oid::regprocedure as function_name, p.provolatile, p.prosecdef, p.proconfig,
       p.proacl, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.oid = to_regprocedure('public.valid_set_entries(jsonb)');

select pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object, d.deptype
from pg_depend d join pg_attribute a
  on d.refclassid = 'pg_class'::regclass and d.refobjid = a.attrelid and d.refobjsubid = a.attnum
where a.attrelid = to_regclass('public.exercise_records') and a.attname = 'user_id' and not a.attisdropped;
select tgrelid::regclass as table_name, tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid in (to_regclass('public.exercise_records'), to_regclass('public.exercises')) and not tgisinternal;
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in ('exercise_records', 'exercises');
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('exercise_records', 'exercises');

-- Raw table ACLs include PUBLIC (grantee 0); column ACLs are independent.
select c.oid::regclass as table_name,
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       pg_get_userbyid(x.grantor) as grantor, x.privilege_type, x.is_grantable
from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
where c.oid in (to_regclass('public.exercise_records'), to_regclass('public.exercises'));
select a.attrelid::regclass as table_name, a.attname,
       case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type, x.is_grantable
from pg_attribute a cross join lateral aclexplode(a.attacl) x
where a.attrelid in (to_regclass('public.exercise_records'), to_regclass('public.exercises')) and not a.attisdropped;

select rolname, rolsuper, rolbypassrls, rolinherit from pg_roles where rolname in ('anon', 'authenticated');
select pg_get_userbyid(member) as member, pg_get_userbyid(roleid) as inherited_role, admin_option
from pg_auth_members;
-- Effective privileges include inherited and PUBLIC grants, not only direct ACLs.
select r.role_name, c.oid::regclass as table_name, p.privilege,
       has_table_privilege(r.role_name, c.oid, p.privilege) as allowed
from (values ('anon'), ('authenticated')) r(role_name)
cross join pg_class c
cross join (values ('SELECT'), ('INSERT'), ('DELETE'), ('UPDATE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(privilege)
where c.oid in (to_regclass('public.exercise_records'), to_regclass('public.exercises'));
select r.role_name, a.attrelid::regclass as table_name, a.attname, p.privilege,
       has_column_privilege(r.role_name, a.attrelid, a.attnum, p.privilege) as allowed
from (values ('anon'), ('authenticated')) r(role_name)
cross join pg_attribute a cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege)
where a.attrelid in (to_regclass('public.exercise_records'), to_regclass('public.exercises'))
  and a.attnum > 0 and not a.attisdropped;

commit;
```

## Vercel 배포

1. Git 저장소를 Vercel에 연결하고 Framework Preset으로 Vite를 선택합니다.
2. Build Command: `npm run build`, Output Directory: `dist`.
3. 위 환경변수 두 개를 Vercel의 환경변수 설정에 추가하고 배포합니다. 값 변경 후에는 재배포가 필요합니다.
4. SQL 적용·RLS 검증이 끝나기 전에는 공용 DB 쓰기가 준비되었다고 가정하지 마세요. 인증을 별도로 재개할 경우에만 Supabase Authentication의 Site URL/Redirect URLs를 배포 도메인과 일치시킵니다.

외부 Google Fonts를 사용할 수 없을 경우 시스템 글꼴로 표시됩니다. 데이터베이스 연결과 실제 배포는 본인의 Supabase/Vercel 프로젝트 설정이 필요합니다.

## 검증

```powershell
npm test
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\node_modules\.cache\playwright"
npx playwright install chromium --only-shell
npm run test:e2e
```

기존 단위 테스트는 날짜·필수값·수치 검증, 로컬 저장·복원·삭제, 요약을 확인합니다. 기존 브라우저 테스트는 로컬 기록 흐름과 인증 창 전환·제출 차단 등을 확인합니다. 공용 DB 앱 연결과 세트 기능·관련 테스트는 별도 작업 중이며, Step3 검증 전에 통합 완료로 판단하지 않습니다. 어떤 앱 테스트도 실제 클라우드 RLS 및 SQL 세트 제약 검증을 대체하지 않습니다. 이번 SQL/문서 단계에서는 테스트·빌드와 실제 DB 변경을 실행하지 않았습니다.

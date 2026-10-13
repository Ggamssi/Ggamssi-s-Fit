# Ggamssi`s-Fit 운동 다이어리

Vue 3 + JavaScript + Vite로 만든 개인 운동 기록 웹입니다. 앱 화면과 기록 로직은 JavaScript이며, 기존 Vite 도구 설정과 부트스트랩은 TypeScript 설정을 유지합니다.

## 제공 기능

- 날짜별 운동 이름, 종류(역도·웨이트·유산소·맨몸·스트레칭·기타), 여러 운동 부위 기록
- 선택 입력: 운동 시간(분), 중량(kg), 세트 수, 세트당 횟수, 메모
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

현재는 Supabase 환경변수 유무와 관계없이 로컬 체험 모드로 실행됩니다. 회원가입·로그인 창은 유지하지만 인증 요청과 기존 세션 복원은 실행하지 않습니다. 기록은 해당 브라우저의 localStorage에 저장됩니다. 기기 간 동기화되지 않으며, 브라우저 데이터를 지우면 사라집니다. 체험 데이터는 계정에 자동 이전되지 않습니다. 공용 기기에서는 사용에 주의하세요.

## Supabase 연결

아래는 인증 기능 재개 시 사용할 설정입니다. 현재 `src/lib/supabase.js`의 `authEnabled`가 `false`이므로 연결 정보와 기존 클라우드 기록은 유지하되 사용하지 않습니다.

1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/schema.sql`을 실행합니다.
   기존 테이블이 있는 경우에도 다시 실행하면 와드 저장 컬럼과 종류 제약이 추가됩니다. 기존 일반 기록은 유지됩니다. 실제 프로젝트에는 자동으로 적용되지 않습니다.
2. `.env.example`을 참고하여 프로젝트 루트에 `.env.local`을 만들고 프로젝트 URL과 publishable key를 설정합니다.
3. 개발 서버를 재시작합니다. 회원가입 후 인증 메일을 확인하고 로그인합니다.
4. Supabase Authentication의 Site URL을 배포 주소로 설정하고, Redirect URLs에 로컬 개발 주소와 배포 주소를 등록합니다.

현재 로컬 환경에는 제공된 프로젝트 URL과 publishable key를 `.env.local`에 설정했습니다. 이 파일은 Git에 포함되지 않으므로 Vercel에도 환경변수를 별도로 등록해야 합니다. 연결 정보 설정만으로 데이터베이스 테이블과 RLS 정책이 생성되지는 않습니다.

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

이 두 값은 프론트엔드에 공개됩니다. `service_role` 또는 secret key는 절대 넣지 마세요. SQL에는 RLS 정책이 포함되어 로그인한 회원이 자신의 기록만 조회·추가·삭제할 수 있습니다. SQL은 한국 날짜 기준으로 미래 운동일을 거절합니다. 실제 Supabase 프로젝트에서 다른 두 계정으로 기록 격리를 확인한 후 운영하세요.

## Vercel 배포

1. Git 저장소를 Vercel에 연결하고 Framework Preset으로 Vite를 선택합니다.
2. Build Command: `npm run build`, Output Directory: `dist`.
3. 위 환경변수 두 개를 Vercel의 환경변수 설정에 추가하고 배포합니다. 값 변경 후에는 재배포가 필요합니다.
4. Supabase의 인증 URL을 배포 도메인과 일치시킵니다.

외부 Google Fonts를 사용할 수 없을 경우 시스템 글꼴로 표시됩니다. 데이터베이스 연결과 실제 배포는 본인의 Supabase/Vercel 프로젝트 설정이 필요합니다.

## 검증

```powershell
npm test
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\node_modules\.cache\playwright"
npx playwright install chromium --only-shell
npm run test:e2e
```

단위 테스트는 날짜·필수값·수치 검증, 저장·복원·삭제, 요약을 확인합니다. 브라우저 테스트는 테스트용 Supabase 환경변수가 있는 별도 개발 서버에서 데스크톱·모바일의 로컬 기록 흐름과 인증 창 전환, 제출 차단, Supabase 요청이 발생하지 않는지 확인합니다. 실제 클라우드 인증 및 RLS 검증을 대체하지 않습니다.

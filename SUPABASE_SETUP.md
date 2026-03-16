# Supabase 마이그레이션 설정 가이드

## 1단계: Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com)에 접속하여 로그인
2. "New Project" 클릭
3. 프로젝트 이름: `dongkuk-dashboard`
4. Region: `Asia Pacific (Seoul)` 권장
5. Database Password 설정 (안전한 비밀번호 필수)
6. 프로젝트 생성 완료 대기 (약 2-3분)

## 2단계: 데이터베이스 스키마 생성

**Supabase 대시보드의 SQL Editor에서 다음 SQL을 순서대로 실행:**

### 2-1. 테이블 생성

```sql
-- 1. PROFILES (사용자 프로필)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  app_id      text unique not null,   -- 'dongkuk1' 형태의 로그인 ID
  name        text not null,
  dept        text not null default '원료기획팀',
  position    text,
  email       text,
  phone       text,
  role        text not null default 'user' check (role in ('admin','user')),
  status      text not null default 'active' check (status in ('active','inactive')),
  created_at  timestamptz not null default now()
);

-- 2. NOTICES (공지사항)
create table public.notices (
  id         text primary key,
  title      text not null,
  content    text not null default '',
  author     text not null default '관리자',
  password   text,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. SCHEDULES (일정/캘린더)
create table public.schedules (
  id         text primary key,
  member     text not null,
  type       text not null,
  start_date date not null,
  end_date   date,
  memo       text
);

-- 4. SUPPLIER_ADMINS (공급업체 관리)
create table public.supplier_admins (
  code             text primary key,
  name             text not null,
  region           text,
  owner            text,
  phone            text,
  monthly_capacity numeric not null default 0,
  yearly_supply    numeric not null default 0,
  trust_grade      text not null default 'B',
  performance_rate numeric not null default 0
);

-- 5. GRADE_MAPPINGS (등급 매핑 - 싱글턴)
create table public.grade_mappings (
  id         integer primary key default 1 check (id = 1),
  mappings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 6. PLAN_DATA (수급계획 데이터 - 연도별)
create table public.plan_data (
  year      text primary key,
  pasted_at timestamptz,
  monthly   jsonb not null default '[]'::jsonb
);

-- 7. TRANSACTIONS (거래 데이터 - 고용량)
create table public.transactions (
  id             bigserial primary key,
  year           smallint not null,
  date           date not null,
  month          smallint not null check (month between 1 and 12),
  supplier       text not null,
  detailed_grade text not null,
  macro          text not null default '기타',
  unit_price     numeric not null default 0,
  amount         numeric not null default 0,
  qty            integer not null default 0
);

-- 인덱스 생성 (성능 최적화)
create index transactions_year_idx on public.transactions(year);
create index transactions_year_month_idx on public.transactions(year, month);
```

### 2-2. Row Level Security (RLS) 정책 설정

```sql
-- 모든 테이블에 RLS 활성화
alter table public.profiles enable row level security;
alter table public.notices enable row level security;
alter table public.schedules enable row level security;
alter table public.supplier_admins enable row level security;
alter table public.grade_mappings enable row level security;
alter table public.plan_data enable row level security;
alter table public.transactions enable row level security;

-- PROFILES 정책
-- 모든 인증 사용자가 읽기 가능
create policy "profiles_select" on public.profiles for select to authenticated using (true);

-- 자신의 프로필만 수정 가능
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid());

-- 관리자만 신규 사용자 생성 가능
create policy "profiles_admin_insert" on public.profiles for insert to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 관리자만 사용자 삭제 가능
create policy "profiles_admin_delete" on public.profiles for delete to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- 나머지 테이블: 인증된 사용자 전체 허용 (내부 업무용)
create policy "notices_all" on public.notices for all to authenticated using (true) with check (true);
create policy "schedules_all" on public.schedules for all to authenticated using (true) with check (true);
create policy "supplier_admins_all" on public.supplier_admins for all to authenticated using (true) with check (true);
create policy "grade_mappings_all" on public.grade_mappings for all to authenticated using (true) with check (true);
create policy "plan_data_all" on public.plan_data for all to authenticated using (true) with check (true);
create policy "transactions_all" on public.transactions for all to authenticated using (true) with check (true);
```

## 3단계: 초기 사용자 생성

### 3-1. Supabase Auth에 사용자 추가

1. 대시보드 좌측 메뉴 → **Authentication** 클릭
2. **Users** 탭에서 **Add user** 클릭
3. 다음 정보 입력:
   - Email: `dongkuk1@dk.internal`
   - Password: `1234` (테스트용, 실제 사용 시 변경 권장)
4. **Create user** 클릭

### 3-2. Profiles 테이블에 사용자 정보 삽입

**SQL Editor에서 실행:**

```sql
-- dongkuk1 사용자 프로필 (auth.users에서 생성된 UUID로 대체 필요)
-- 먼저 dongkuk1 계정의 UUID를 확인:
-- SELECT id, email FROM auth.users WHERE email = 'dongkuk1@dk.internal';

-- UUID를 xxxx-xxxx-xxxx-xxxx 형태로 확인하고 다음 쿼리 실행:
INSERT INTO public.profiles (id, app_id, name, dept, position, email, phone, role, status)
VALUES (
  'UUID_HERE',  -- 위에서 확인한 UUID로 교체
  'dongkuk1',
  '이돈석',
  '원료기획팀',
  '팀장',
  'dongkuk1@dk.internal',
  '02-317-1001',
  'admin',
  'active'
);

-- dongkuk2 사용자도 추가할 경우
-- 먼저 dongkuk2@dk.internal 계정을 Auth에서 생성한 후:
INSERT INTO public.profiles (id, app_id, name, dept, position, email, phone, role, status)
VALUES (
  'UUID_HERE',  -- dongkuk2의 UUID
  'dongkuk2',
  '박영수',
  '원료기획팀',
  '대리',
  'dongkuk2@dk.internal',
  '02-317-1002',
  'user',
  'active'
);
```

## 4단계: Supabase 키 확인 및 환경 설정

1. 대시보드 좌측 → **Settings** → **API**
2. 다음 정보 복사:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`

3. **프로젝트 코드에 설정:**
   - `js/supabase-storage.js`의 상단에 다음 추가:
   ```javascript
   const SUPABASE_URL = 'https://xxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGc...';
   ```

## 5단계: 테스트

1. 앱 시작:
   ```bash
   python3 -m http.server 8787 --bind 127.0.0.1
   ```

2. http://127.0.0.1:8787/login.html 접속

3. 로그인 시도:
   - 아이디: `dongkuk1`
   - 비밀번호: `1234`

4. 예상 결과:
   - 로그인 성공 → 대시보드 진입
   - 다른 PC/브라우저에서도 동일한 데이터 표시 (Supabase 동기화)

## 주의사항

- **SUPABASE_ANON_KEY는 공개해도 안전**: RLS 정책으로 보호됨
- **사용자 추가 시 Supabase 대시보드에서만 생성**: 앱에서 직접 생성 불가 (서비스 롤 키 필요)
- **기존 로컬 데이터**: 첫 로그인 시 "데이터를 클라우드로 업로드" 배너 표시
- **오프라인 사용**: 네트워크 없을 경우 IndexedDB fallback으로 작동

## 문제 해결

### 로그인 실패
- `dongkuk1@dk.internal` 계정이 Supabase Auth에 존재하는지 확인
- `profiles` 테이블에 해당 사용자의 프로필 행이 있는지 확인

### 데이터가 동기화되지 않음
- 브라우저 개발자도구 → Network 탭에서 Supabase API 호출 확인
- Console 탭에서 에러 메시지 확인

### RLS 정책 오류
- "42501 permission denied" 오류: RLS 정책이 제대로 적용되지 않음
- SQL Editor에서 정책 재확인 및 재실행

---

## 추가 참고

- Supabase 공식 문서: https://supabase.com/docs
- JS 클라이언트 API: https://supabase.com/docs/reference/javascript
- 마이그레이션 가이드: 앱 코드에서 자동 처리

-- ============================================================
-- Supabase 테이블 생성 스크립트 (사용자별 데이터 격리)
-- ============================================================

-- 1. profiles 테이블 (Supabase Auth와 연동)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  app_id text unique not null,  -- 앱에서 사용할 ID (dongkuk1, 등)
  name text not null,
  dept text default '원료기획팀',
  position text,
  role text default 'user',  -- 'user' or 'admin'
  status text default 'active',  -- 'active' or 'inactive'
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- 2. dashboard_data (사용자별 데이터)
create table if not exists dashboard_data (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  data_key text not null,  -- 'planClipboardDataByYear', 'rawTransactionDataByYear', 등
  data_value jsonb not null,
  updated_at timestamp default now(),
  constraint uq_user_data_key unique (user_id, data_key)
);

-- 3. notices (사용자별)
create table if not exists notices (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  content text,
  author text,
  password text,
  pinned boolean default false,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- 4. schedules (사용자별)
create table if not exists schedules (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  member text,
  type text,
  start_date text,
  end_date text,
  memo text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- 5. supplier_admins (사용자별)
create table if not exists supplier_admins (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  code text not null,
  name text not null,
  region text,
  owner text,
  phone text,
  monthly_capacity numeric,
  yearly_supply numeric,
  trust_grade text,
  performance_rate numeric,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- 6. grade_mappings (사용자별)
create table if not exists grade_mappings (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  mappings jsonb not null,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  constraint uq_user_grade unique (user_id)
);

-- 7. plan_data (사용자별)
create table if not exists plan_data (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  year text not null,
  pasted_at text,
  monthly jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  constraint uq_user_year unique (user_id, year)
);

-- 8. transactions (사용자별, 대량 데이터)
create table if not exists transactions (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  year integer not null,
  date text,
  month integer,
  supplier text,
  detailed_grade text,
  macro text,
  unit_price numeric,
  amount numeric,
  qty numeric,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ============================================================
-- 인덱스 (성능 최적화)
-- ============================================================

create index if not exists idx_dashboard_data_user_id on dashboard_data(user_id);
create index if not exists idx_notices_user_id on notices(user_id);
create index if not exists idx_schedules_user_id on schedules(user_id);
create index if not exists idx_supplier_admins_user_id on supplier_admins(user_id);
create index if not exists idx_grade_mappings_user_id on grade_mappings(user_id);
create index if not exists idx_plan_data_user_id on plan_data(user_id);
create index if not exists idx_transactions_user_id on transactions(user_id);
create index if not exists idx_transactions_year on transactions(year);

-- ============================================================
-- 기본 사용자 계정 생성 (테스트용)
-- 참고: 실제 사용자는 로그인/회원가입 시 자동 생성됨
-- ============================================================

-- (선택사항) 직접 생성하려면:
-- INSERT INTO auth.users 시작할 때 Supabase 콘솔에서 수동 생성 권장

# Supabase 크로스 디바이스 동기화 구현 가이드

## 📋 문제점 분석

**기존 문제:**
- PC A에서 저장한 데이터 → localStorage(PC A 전용)
- PC B에서 접속 → 빈 상태 (다른 localStorage)
- **결과: 데이터가 다른 PC에서 보이지 않음**

**근본 원인:**
1. 모든 사용자가 동일한 localStorage 사용 (사용자 격리 없음)
2. 데이터가 로컬에만 저장되고 Supabase에 동기화 안 됨

---

## ✅ 솔루션: Supabase 기반 사용자별 데이터 저장

### 새로운 아키텍처

```
┌─────────────────────┐
│   로그인 (Supabase) │
│  + 사용자 ID 획득   │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────┐
│  app.js 초기화                   │
│  - appStorage.setUserId(userId)  │
│  - 메인 앱 실행                  │
└──────────┬───────────────────────┘
           │
           ▼
┌────────────────────────┐
│ supabase-storage.js    │
│ - 모든 CRUD 수행       │
│ - 사용자별 데이터 격리 │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│  Supabase Tables       │
│  (사용자별 격리)       │
│  - user_id 필터링      │
│  - 동기화 완료!        │
└────────────────────────┘
```

---

## 🔧 설정 단계

### Step 1: Supabase 테이블 생성

1. **Supabase 콘솔 접속**
   - https://app.supabase.com → 프로젝트 선택

2. **SQL Editor에서 `SUPABASE_SETUP.sql` 실행**
   - 프로젝트 > SQL Editor
   - 새 쿼리 > 파일의 전체 SQL 복사 → 실행

3. **생성되는 테이블:**
   - `profiles` — 사용자 정보 (Supabase Auth와 연동)
   - `dashboard_data` — 범용 데이터 (key-value)
   - `notices`, `schedules`, `supplier_admins` — 관리 데이터
   - `grade_mappings`, `plan_data` — 계획 데이터
   - `transactions` — 거래 데이터

### Step 2: 테스트 사용자 계정 생성

1. **Supabase 콘솔 > Authentication > Users**

2. **사용자 추가 (dongkuk1 테스트 계정)**
   - Email: `dongkuk1@dk.internal`
   - Password: `1234`
   - Confirm password: `1234`
   - ✓ Auto Confirm User 체크

3. **profiles 테이블에 프로필 추가**
   - Supabase Console > Table Editor > profiles
   - 새 행 삽입:
     ```
     id: [위에서 생성한 사용자 UUID]
     app_id: dongkuk1
     name: 이돈석
     dept: 원료기획팀
     position: 팀장
     role: admin
     status: active
     ```

### Step 3: Vercel 환경변수 설정

1. **Vercel 프로젝트 대시보드**
   - Settings > Environment Variables

2. **변수 추가:**
   ```
   SUPABASE_URL = https://your-project.supabase.co
   SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

   > Supabase에서 찾기:
   > - Settings > API > Project URL: `SUPABASE_URL`
   > - Settings > API > Project API Keys (anon/public): `SUPABASE_ANON_KEY`

3. **Redeploy**
   - Deployments > 최신 배포 우측의 "..." > Redeploy

### Step 4: 브라우저 테스트

**PC A:**
1. https://raw-po-poc-codex.vercel.app/login → dongkuk1 / 1234 로그인
2. 데이터 입력 및 저장 (예: 계획 붙여넣기, 공지사항 등록)
3. 브라우저 개발자 도구에서 네트워크 탭으로 Supabase API 호출 확인

**PC B (다른 PC):**
1. 동일하게 로그인
2. **✅ PC A에서 저장한 데이터가 보임!**

---

## 📝 코드 변경 사항 요약

### `supabase-storage.js` (새로 작성)
- **사용자별 데이터 격리**
  ```javascript
  // 모든 쿼리에 user_id 필터 추가
  .eq("user_id", userId)
  ```
- **API 호환성**
  ```javascript
  appStorage.setUserId(userId)  // 사용자 ID 설정
  appStorage.ready              // 준비 완료 대기
  appStorage.set(key, val)      // Supabase에 저장
  appStorage.get(key)           // Supabase에서 조회
  ```

### `app.js` (수정)
- **async 초기화 함수 추가**
  ```javascript
  (async function initializeApp() {
    await appStorage.ready;
    const userInfo = JSON.parse(sessionStorage.getItem("loggedInUser"));
    appStorage.setUserId(userInfo.id);  // ← 핵심!
    runMainApp();
  })();
  ```

### `index.html` (변경 없음)
- 이미 올바른 script 로드 순서:
  ```html
  <script type="module" src="js/supabase-storage.js"></script>
  <script src="js/dashboard-data.js"></script>
  <script src="js/app.js"></script>
  ```

---

## 🔍 동작 원리

### 데이터 저장 흐름

```
사용자 입력 (예: 계획 붙여넣기)
  ↓
app.js: appStorage.set("planClipboardDataByYear", data)
  ↓
supabase-storage.js:
  1. 캐시 업데이트 (즉시)
  2. IndexedDB 저장 (비동기)
  3. Supabase에 upsert (비동기, user_id 포함)
  ↓
Supabase: plan_data 테이블에 저장
  - user_id = 현재 로그인 사용자
  - year = 연도
  - monthly = 계획 데이터
```

### 데이터 조회 흐름

```
다른 PC에서 로그인 후 접속
  ↓
app.js: appStorage.setUserId(userId) + appStorage.ready 대기
  ↓
supabase-storage.js: _prefetch()
  1. Supabase에서 모든 데이터 조회
  2. WHERE user_id = [현재 사용자]
  3. 캐시에 로드
  ↓
app.js: getRawTransactionsForYear() 호출
  ↓
캐시에서 데이터 반환 (동기)
  ↓
UI 렌더링
```

---

## ⚙️ Supabase 테이블 스키마 (요약)

| 테이블 | 사용자 격리 | 설명 |
|--------|-----------|------|
| `profiles` | - | Supabase Auth와 연동된 사용자 프로필 |
| `notices` | ✅ user_id | 공지사항 (사용자별) |
| `schedules` | ✅ user_id | 일정 (사용자별) |
| `supplier_admins` | ✅ user_id | 거래처 관리 (사용자별) |
| `grade_mappings` | ✅ user_id | 등급 매핑 (사용자별) |
| `plan_data` | ✅ user_id | 계획 데이터 (사용자별, 연도별) |
| `transactions` | ✅ user_id | 거래 데이터 (사용자별, 연도별) |

---

## 🐛 문제 해결

### "데이터가 여전히 동기화 안 됨"
1. **Vercel 환경변수 확인**
   - `vercel env ls` → SUPABASE_URL, SUPABASE_ANON_KEY 있는지 확인
   - 없으면 다시 추가 후 Redeploy

2. **브라우저 개발자 도구 확인**
   - Console에서 `window.appStorage` 존재 확인
   - Network > Fetch/XHR에서 `/api/config` 호출 확인
   - 응답: `SUPABASE_URL`, `SUPABASE_ANON_KEY` 포함되어야 함

3. **Supabase 권한 확인**
   - Database > policies > 테이블별 RLS 비활성화 (테스트 환경)
   - 또는 RLS 활성화하려면 정책 설정 필요

### "userId가 설정되지 않음"
- `sessionStorage.getItem("loggedInUser")` 에서 `id` 필드 확인
- login.html에서 `profile.app_id` 가 저장되는지 확인

### "느린 네트워크에서 데이터 미로드"
- supabase-storage.js의 prefetch() 함수가 완료될 때까지 기다림
- `appStorage.ready` Promise 필수

---

## 📊 테스트 시나리오

### 시나리오 1: 기본 동기화 테스트
```
PC A: 계획 데이터 입력 → 저장
PC B: 새로고침 → 동일 데이터 표시 ✅
```

### 시나리오 2: 사용자 격리 테스트
```
dongkuk1 로그인 (PC A): 데이터 A 저장
dongkuk2 로그인 (PC A): 데이터 B 보임 (A가 아닌 자신의 데이터) ✅
```

### 시나리오 3: 오프라인 모드 테스트
```
인터넷 끊김: IndexedDB에서 데이터 읽음 ✅
인터넷 복구: Supabase와 동기화 ✅
```

---

## 📌 주의사항

1. **RLS (Row Level Security)**
   - 프로덕션에서는 RLS 정책을 반드시 설정하세요
   - 현재 테스트 환경에서는 비활성화되어 있음

2. **환경변수 노출**
   - `SUPABASE_ANON_KEY`는 클라이언트에 노출되는 것이 정상 (anon 제한)
   - 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`는 절대 노출하면 안 됨

3. **대용량 거래 데이터**
   - `transactions` 테이블은 대량의 행이 있을 수 있음
   - `prefetchTransactionsForYear(year)` 로 연도별 lazy-load
   - 처음부터 모든 거래를 로드하지 않음

---

## ✨ 결과

**Before:** PC별 로컬 저장 → 동기화 불가
**After:** Supabase 클라우드 저장 → 모든 PC에서 실시간 동기화 ✅


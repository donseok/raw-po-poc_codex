# Vercel 자동 배포 가이드

## 1단계: Vercel 계정 설정

1. [vercel.com](https://vercel.com)에 접속
2. GitHub 계정으로 로그인 또는 회원가입
3. "New Project" 클릭
4. GitHub 저장소 선택: `raw-po-poc_codex_db`
5. Import 클릭

## 2단계: Vercel 프로젝트 환경 변수 설정

**Vercel 대시보드 → Settings → Environment Variables**

다음 환경 변수를 추가하세요:

| 변수명 | 값 | 비고 |
|--------|-----|------|
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | `eyJhbGc...` | Supabase 익명 키 |

### 환경 변수 값 찾는 방법:
1. [supabase.com](https://supabase.com) 대시보드 접속
2. 프로젝트 선택
3. Settings → API 클릭
4. **Project URL**과 **anon public** 값 복사

## 3단계: 배포 설정 확인

`vercel.json`이 이미 프로젝트에 포함되어 있으며 다음을 설정합니다:

- **빌드**: 정적 파일만 (빌드 단계 없음)
- **출력**: 루트 디렉토리 전체
- **캐시**: No-cache (항상 최신 데이터)
- **보안 헤더**: XSS/Clickjacking 방지

## 4단계: 자동 배포 활성화

Vercel은 기본적으로 GitHub 푸시 시 자동 배포합니다:

```bash
# 로컬에서 변경사항 커밋
git add .
git commit -m "Update dashboard"
git push origin main
```

**→ Vercel에서 자동으로 배포 시작 (1-2분)**

## 5단계: 배포 확인

### Vercel 대시보드에서
1. Deployments 탭 확인
2. 최신 배포의 상태 확인 (Ready = 배포 완료)
3. Preview URL 또는 Production URL 클릭

### 배포된 앱 접속
```
https://YOUR_PROJECT.vercel.app/login.html
```

**테스트 로그인:**
- 아이디: `dongkuk1`
- 비밀번호: `1234`

## 6단계: 커스텀 도메인 설정 (선택)

**Settings → Domains**

1. "Add Domain" 클릭
2. 원하는 도메인 입력 (예: `dashboard.dongkuk.co`)
3. DNS 레코드 설정 (안내에 따름)

## 배포 워크플로우

```
GitHub (main branch)
       ↓
    [Push]
       ↓
Vercel [자동 감지]
       ↓
  [테스트 배포]
       ↓
  [배포 완료]
       ↓
Production URL 업데이트
```

## 주의사항

### 데이터 빌드 (Python 스크립트)
만약 XLSX 파일에서 데이터를 새로 생성해야 한다면:

```bash
# 로컬에서만 실행
python3 scripts/build_dashboard_data.py --source data.xlsx

# 생성된 파일 커밋
git add js/dashboard-data.js
git commit -m "Update dashboard data from XLSX"
git push origin main
```

**→ 자동으로 Vercel에 배포됨**

### Supabase 환경 변수
- 프로덕션과 미리보기 배포에 동일한 환경 변수 적용
- Supabase ANON_KEY는 RLS 정책으로 보호됨 (안전함)

### 캐시 정책
- 현재 캐시 설정: `max-age=0` (항상 최신)
- 성능이 필요하면 각 파일 타입별로 캐시 조정 가능

## 배포 롤백

이전 버전으로 되돌려야 하면:

**Vercel 대시보드 → Deployments**
1. 이전 배포의 "Promote to Production" 클릭
2. 또는 GitHub에서 커밋 되돌린 후 푸시

## 문제 해결

### 배포 실패
1. Vercel Logs 확인
2. 환경 변수 설정 확인
3. GitHub 연동 상태 확인

### Supabase 연결 오류
```
Error: Invalid Supabase credentials
```
→ SUPABASE_URL, SUPABASE_ANON_KEY 확인

### 페이지가 로드되지 않음
1. 브라우저 개발자도구 → Console 확인
2. Vercel 배포 로그 확인
3. 환경 변수 다시 설정

## 추가 최적화

### 1. 보안 헤더 강화 (필요시)
`vercel.json`의 `headers` 섹션 수정

### 2. API 라우트 (Vercel Functions)
만약 API가 필요하면:
```
api/
  └── notify.js
```

### 3. 분석 추가
Vercel Analytics 활성화:
- Vercel 대시보드 → Analytics

## 문의

문제가 발생하면:
1. Vercel 대시보드 Support 채팅
2. GitHub Issues
3. Supabase 문서 참고

---

**배포 완료!** 🚀 이제 팀원들이 `https://YOUR_PROJECT.vercel.app`에서 대시보드를 접속할 수 있습니다.

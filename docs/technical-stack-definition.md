# 기술스택 정의서

## 1. 문서 목적

본 문서는 `raw-po-poc_codex` 프로젝트에서 실제 사용 중인 기술스택을 정의하고, 각 기술의 역할, 적용 범위, 설계 판단 근거를 명확히 하기 위해 작성한다.

---

## 2. 시스템 개요

본 시스템은 동국제강 원료기획팀의 부재료 조달 실적을 모니터링하는 정적 웹 대시보드이다. 별도 백엔드 애플리케이션이나 서버 DB 없이, 브라우저에서 `login.html`과 `index.html`을 열어 로그인, 대시보드 조회, 데이터 입력, 보고서 내보내기, 공지/일정/사용자 관리를 수행한다.

**데이터 파이프라인**: `XLSX 원본 → build_dashboard_data.py → js/dashboard-data.js → app.js → DOM`

---

## 3. 기술스택 요약

| 구분 | 기술 | 버전/범위 | 용도 |
| --- | --- | --- | --- |
| 프론트엔드 마크업 | HTML5 | 표준 | 로그인 화면, 대시보드 화면, 모달 7종, 챗봇 UI |
| 프론트엔드 스타일 | CSS3 | 표준 | 레이아웃, 컴포넌트, 디자인 토큰, 반응형, 인쇄 |
| 프론트엔드 로직 | Vanilla JavaScript | ES6+ | 화면 렌더링, 이벤트 처리, 데이터 가공, 차트, NLP 챗봇 |
| 차트 라이브러리 | Chart.js | `4.4.1` | KPI/추이/비교/배분 시각화 (7종 차트) |
| 문서 출력 | docx | `8.5.0` | DOCX 보고서 생성 (커버 + 4개 섹션) |
| 브라우저 저장소 | IndexedDB | 브라우저 내장 | 운영 데이터 영속 저장의 기본 저장소 |
| 브라우저 저장소 | localStorage | 브라우저 내장 | IndexedDB 미지원 시 대체 저장소 |
| 세션 관리 | sessionStorage | 브라우저 내장 | 로그인 사용자 세션 유지 |
| 데이터 번들 | JavaScript 데이터 파일 | `js/dashboard-data.js` | 기본 대시보드 데이터 공급 (`window.dashboardData`) |
| 데이터 생성 | Python 3 | 표준 라이브러리 | XLSX 원본 → 대시보드 데이터 파일 생성 |
| 실행 환경 | 정적 파일 서버 | `python -m http.server` | 로컬/사내 환경에서 웹 페이지 제공 |

---

## 4. 계층별 상세 정의

### 4.1 화면 계층

#### login.html
- 로그인 UI: 아이디/비밀번호 입력, 비밀번호 표시/숨김 토글 (SVG 눈 아이콘)
- 테스트 계정 바로 입장 버튼 (`dongkuk1` 계정 자동 로그인)
- 기존 세션 자동 리다이렉트: `sessionStorage.loggedInUser` 존재 시 `index.html`로 즉시 이동
- 사용자 조회 우선순위: `appStorage(IndexedDB)` → `localStorage` → 하드코딩 폴백 (2명)
- 비활성 계정 차단: `user.status === "inactive"` → `{blocked: true}` 반환
- 세션 저장: `JSON.stringify({id, name, dept, role})` → `sessionStorage.loggedInUser`

#### index.html
- 메인 대시보드: 탭 메뉴 5개, 콘텐츠 섹션 6개 (`tab-allocation`은 전용 탭 없이 존재)
- 모달 7종: 사용자, 거래처, 공지작성, 공지보기, 공지삭제확인, 일정등록, 일정상세
- 챗봇 UI: FAB 버튼 (DK 로봇 SVG), 팝업, 메시지 영역, 추천 질문 칩
- 접힘 패널 3종: 계획 입력, 원본 실적 입력, 등급 매핑 (아코디언 패턴)
- 인증 가드: `<head>` 인라인 스크립트에서 `sessionStorage.loggedInUser` 부재 시 `login.html`로 리다이렉트
- 데이터 배너: 분석 기준 연도, 조직, 원본 파일, 생성시점, 포함 섹션 표시

**정의**:
- 서버 사이드 렌더링은 사용하지 않는다.
- 프레임워크 기반 SPA가 아니라 정적 HTML 문서와 브라우저 스크립트 조합으로 동작한다.

### 4.2 스타일 계층

| 파일 | 역할 | 주요 토큰/특성 |
| --- | --- | --- |
| `css/variables.css` | 디자인 토큰 | `--primary: #1a237e`, `--accent: #ff8f00`, `--radius: 12px`, 그레이 10단계, 그림자 2단계 |
| `css/layout.css` | 레이아웃 | 헤더(sticky, z:100), 탭 네비(sticky, z:90), 그리드, 반응형 |
| `css/components.css` | 컴포넌트 | 카드, 버튼, 표, 모달, 배지, 진행바, 토스트, 챗봇, 캘린더 |

#### 반응형 브레이크포인트

| 폭 | 변화 |
| --- | --- |
| ≤ 1100px | 2열/3열 그리드 → 1열 |
| ≤ 860px | 헤더 세로 배치, 여백 16px, 탭 네비 top 148px, 챗봇 팝업 92vw |
| ≤ 480px | 챗봇 팝업 위치 재조정 |

#### 인쇄 스타일 (`@media print`)

헤더, 탭 네비게이션, 툴바 액션, 페이지 노트, 푸터 노트, 정보 배너 자동 숨김.

#### 다크 모드

현재 다크 모드는 구현되어 있지 않다. `@media (prefers-color-scheme: dark)` 규칙 없음.

**정의**:
- CSS 전처리기(Sass, Less)는 사용하지 않는다.
- 디자인 시스템 빌드 도구 없이 순수 CSS 파일로 관리한다.

### 4.3 애플리케이션 로직 계층

#### js/app.js (~4,300줄, IIFE)

| 기능 영역 | 주요 함수/패턴 |
| --- | --- |
| 초기화 | `init()` → 10단계 순차 설정, `appStorage.ready` 후 실행 |
| 데이터 정규화 | `normalizeDashboardData()` — 신규/레거시 데이터 형식 자동 처리 |
| 상태 관리 | 단일 `state` 객체 (연도, 계획오버라이드, 거래처, 트랜잭션, 매핑, 페이징) |
| 캐싱 | 2단계 캐시 (`_txCache`, `_aggCache`), 버전 기반 키, 자동 무효화 |
| 차트 | 7종 차트, 커스텀 `valueLabelPlugin`, `destroyChart()` 패턴 |
| 계획 입력 | 스마트 파싱 (월 헤더 탐색, 행 식별, 4행 폴백) |
| 원본 입력 | 동기/비동기 파싱, 2만 행 기준 자동 전환, 페이징 (100행/페이지) |
| 등급 매핑 | 5대분류 체계, 버전 카운터, 캐시 연동 |
| 거래처 관리 | CRUD, 코드 자동 생성, 성과율 자동 계산 |
| DOCX 내보내기 | 탭 임시 활성화 → 차트 캡처 → 5섹션 조립 → Blob 다운로드 |
| 챗봇 | NLP 쿼리 파서, 7개 의도, 점수 기반 라우팅, 응답 검증 |
| 탭 네비게이션 | URL 해시/쿼리 파라미터 기반 라우팅, `history.replaceState` |
| 표 정렬 | 월/숫자/퍼센트/텍스트 자동 인식, 토글 방식 |

#### js/admin-features.js (~1,155줄, IIFE)

| 기능 영역 | 주요 특성 |
| --- | --- |
| 공지사항 | 기본 5건 하드코딩 + 사용자 생성분 별도 저장, 비밀번호 보호, 필독 핀, 10건/페이지 |
| 팀 일정 | 10종 일정 유형 (색상 매핑), 6주 캘린더 그리드, 다중일 지원 (휴가/교육/출장) |
| 사용자 관리 | 기본 2명 폴백, 7개 부서/7개 직급 선택, ID 유효성 검사, 자기 삭제 방지 |
| 토스트 알림 | success/error/info 3종, 슬라이드업 애니메이션, 2.5초 자동 해제 |
| 저장 패턴 | `readStoredData`/`writeStoredData` 통일 패턴, `{data, timestamp}` 봉투 |

#### js/storage.js (~217줄)

| 기능 | 설명 |
| --- | --- |
| DB 초기화 | IndexedDB `dongkuk_dashboard` v1, 스토어 `kv` (keyPath: "key") |
| 인메모리 캐시 | 모든 레코드를 `_cache` 객체에 로드, `getSync()` 제공 |
| 폴백 모드 | IDB `open()` 실패 시 `_fallbackMode = true` → localStorage 전용 |
| 마이그레이션 | `__idb_migrated` 플래그, 7개 키 자동 이전, 개별 실패 무시 |
| 쓰기 전략 | 캐시 먼저 갱신 → 비동기 IDB put (fire-and-forget, 에러 무시) |

**정의**:
- 상태 관리는 React, Vue, Redux 없이 JavaScript 객체와 함수로 직접 구현한다.
- 모듈 번들러(Webpack, Vite) 없이 브라우저에서 직접 로드되는 스크립트 구조를 사용한다.

### 4.4 데이터 저장 계층

#### 저장소 구조

| 저장소 | 대상 | 접근 방식 |
| --- | --- | --- |
| IndexedDB `dongkuk_dashboard` / `kv` | 운영 데이터 7종 | `appStorage` API |
| localStorage | 마이그레이션 전 레거시 / IDB 폴백 | `appStorage` 또는 직접 접근 |
| sessionStorage | `loggedInUser` 세션 | `JSON.parse/stringify` |

#### 주요 저장 키

| 키 | 설명 | 기본값 출처 |
| --- | --- | --- |
| `planClipboardDataByYear` | 연도별 계획/실적 붙여넣기 데이터 | 사용자 입력 |
| `rawTransactionDataByYear` | 연도별 원본 실적 데이터 | 사용자 입력 |
| `gradeMacroMappings` | 검수 등급 매핑 데이터 | app.js 하드코딩 (~30개) |
| `supplierAdminItems` | 거래처 관리 데이터 | app.js 하드코딩 (8건) |
| `noticesData` | 공지사항 (사용자 생성분만) | admin-features.js (5건 기본) |
| `schedulesData` | 일정 데이터 | 사용자 입력 |
| `usersData` | 사용자 데이터 | login.html 하드코딩 (2건) |
| `loggedInUser` | 로그인 세션 (sessionStorage) | 로그인 시 생성 |
| `__idb_migrated` | 마이그레이션 완료 플래그 (localStorage) | 마이그레이션 시 설정 |

**정의**:
- 중앙 DBMS(MySQL, PostgreSQL, MongoDB)는 사용하지 않는다.
- 서버 동기화 기능은 없다.
- 데이터는 현재 브라우저 프로필 기준으로 격리 저장된다.

### 4.5 시각화 계층

#### Chart.js `4.4.1`

CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`

| 차트 ID | 유형 | 용도 | 특수 설정 |
| --- | --- | --- | --- |
| `planChart` | Bar | 월별 계획 vs 실적 | 2 데이터셋, tooltip `mode:"index"` |
| `supplierTrendChart` | Line (fill) | 상위 3 거래처 추이 | `tension: 0.35`, 3색 팔레트 |
| `purchaseTrendChart` | Bar + Line | 구매량 + 입고금액 | 이중 Y축 (y=수량, y1=금액) |
| `incheonAllocationChart` | Doughnut | 인천 등급 구성 | `cutout: "54%"`, 수량+% 툴팁 |
| `pohangAllocationChart` | Doughnut | 포항 등급 구성 | 동일 구조, 주황 팔레트 |
| `gradeMixChart` | Bar + Line | 등급별 구매량 + 금액 | 이중 Y축 |
| `gradeRatioChart` | Doughnut | 인천 등급 비율 | `cutout: "54%"`, 범례 우측 |

**전역 설정**:
- `Chart.defaults.animation = false` — 모든 차트 애니메이션 비활성화
- 커스텀 `valueLabelPlugin` 전역 등록 — 막대 위/도넛 내부에 데이터 라벨 표시
- `chartInstances` 객체로 인스턴스 추적, `destroyChart(key)` 후 재생성 패턴
- 탭 전환 시 `refreshCharts()` — 이중 `requestAnimationFrame`으로 리사이즈 + 업데이트

**정의**:
- 차트는 Canvas 기반으로 생성한다.
- 별도 BI 도구나 SVG 차트 프레임워크는 사용하지 않는다.

### 4.6 문서 출력 계층

#### docx `8.5.0`

CDN: `https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js`

**DOCX 생성 아키텍처**:

1. 숨겨진 탭 임시 활성화 (CSS `visibility:hidden; position:absolute`)
2. Chart.js 캔버스 렌더링 대기 (2× `requestAnimationFrame`)
3. `chart.toBase64Image("image/png")`로 7개 차트 캡처
4. 원래 탭 상태 복원
5. 커버 페이지 + 4개 데이터 섹션 조립
6. `URL.createObjectURL(blob)` → 자동 다운로드

**DOCX 디자인 시스템** (`DOCX_COLORS`):

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| Navy | `#1A237E` | 헤더, 제목, 강조 텍스트 |
| NavyLight | `#283593` | 소제목, 보조 강조 |
| Accent | `#FF8F00` | 구분선, 포인트 요소 |

**헬퍼 함수 7종**: `docxKpiTable`, `docxDataTable`, `docxSectionTitle`, `docxSubHeading`, `docxChartImage`, `docxCaption`, 커버 빌더.

**정의**:
- 보고서 포맷은 DOCX이며 PDF 생성 기능은 현재 포함하지 않는다.

### 4.7 NLP 챗봇 엔진

#### 아키텍처

순수 JavaScript 기반 규칙 엔진으로, 외부 AI API 없이 동작한다.

| 단계 | 함수 | 설명 |
| --- | --- | --- |
| 파싱 | `parseVerifiedChatQuery()` | 월/범위/분기/반기 추출, 7개 의도 플래그, 거래처명/공장명 탐지 |
| 점수 산정 | `getVerifiedChatIntentOrder()` | 플래그 기반 가중치 점수 → 의도 우선순위 배열 |
| 응답 생성 | `buildVerified*Answer()` | 7개 의도별 전용 빌더 (계획/구매/등급/수입/거래처/배분/개요) |
| 검증 | `verifyGeneratedChatAnswer()` | `undefined`/`null`/`NaN` 문자열 포함 시 실패 처리 |
| 폴백 | 오류 응답 | 8개 예시 질문 포함 안내 메시지 |

**지원 키워드 영역**: 계획/목표/수급, 실적/달성, 누계/누적, 거래처/납품, 구매/매입, 등급/비중, 수입/선적, 배분/공장, 비교/최대/최소, 현황/요약, 추이/추세

**기간 인식**: 단월, 범위(`N~M월`), 분기(1~4분기), 반기(상/하), 전체/연간/올해

### 4.8 데이터 생성 계층

#### scripts/build_dashboard_data.py (~561줄)

| 기능 | 구현 |
| --- | --- |
| XLSX 파싱 | `zipfile` + `xml.etree.ElementTree` (ZIP 내 XML 직접 파싱) |
| 공유 문자열 | `xl/sharedStrings.xml`의 `<si>/<t>` 텍스트 해소 |
| 시트 읽기 | `read_sheet()` → 셀 좌표 → 값 딕셔너리 리스트 |
| 날짜 변환 | `excel_serial_to_date()`: `datetime(1899,12,30) + timedelta(days)` |
| 등급 매핑 | `build_grade_mapping()`: sheet3 열 7(대분류), 열 8(상세등급) |
| 거래처 성과 | `build_supplier_summary()`: 성과율 = 실적 / (피크월 × 활동월수) |
| 신뢰등급 | ≥85%→A, ≥80%→A-, ≥75%→B+, 기타→B |
| 출력 | `window.dashboardData = {...};\n` (UTF-8, JSON) |

**시트 매핑** (하드코딩):

| 시트 | 역할 | 행/열 범위 |
| --- | --- | --- |
| `sheet3.xml` | 계획/배분 | 행 2~13, 열 6~17 (12개월) |
| `sheet4.xml` | 2024 거래 | 열 1~5 |
| `sheet5.xml` | 2023 거래 | 열 1~5 |

**사용 라이브러리**: `argparse`, `json`, `math`, `re`, `zipfile`, `datetime`, `xml.etree.ElementTree`, `collections.defaultdict` (모두 표준 라이브러리).

**정의**:
- 별도 Python 패키지 설치 없이 표준 라이브러리만으로 동작한다.
- 기본 경로가 macOS 기준으로 설정되어 있어, 다른 OS에서는 `--source`와 `--output` 인자를 반드시 지정해야 한다.

### 4.9 성능 최적화 계층

| 기법 | 적용 위치 | 효과 |
| --- | --- | --- |
| `Float64Array` | 월별 수량 집계 | 타입 지정 배열로 수치 연산 최적화 |
| `for` 루프 | 데이터 처리 핫패스 | `forEach`/`map` 대비 GC 부담 감소 |
| 2단계 캐시 | 트랜잭션/집계 | 탭 전환/연도 변경 시 반복 계산 방지 |
| 청크 파싱 | 2만 행 초과 데이터 | `setTimeout(0)` 기반 비동기, UI 블로킹 방지 |
| In-place 변환 | 등급 매핑 적용 | 객체 복제 없이 원본 행에 직접 적용 |
| 인스턴스 재사용 | Chart.js | `destroyChart()` 후 재생성, 메모리 누수 방지 |
| 인메모리 캐시 | storage.js | IDB 비동기 읽기 없이 동기 캐시 반환 |

---

## 5. 외부 의존성 정의

| 라이브러리 | 버전 | 로드 방식 | CDN URL | 사용 위치 |
| --- | --- | --- | --- | --- |
| Chart.js | `4.4.1` | CDN (`<head>`) | `cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` | `index.html` |
| docx | `8.5.0` | CDN (`<body>` 하단) | `cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js` | `index.html` |

**정의**:
- `npm`, `package.json`, `node_modules` 기반 의존성 관리는 사용하지 않는다.
- 주요 외부 의존성은 CDN 직접 참조 방식으로 관리한다.
- 폐쇄망 운영 시 CDN 파일을 로컬에 배치하고 `index.html`의 `<script src>` 경로를 수정해야 한다.

---

## 6. 실행 환경 정의

### 6.1 개발/검증 실행 방식

```bash
python -m http.server 8787 --bind 127.0.0.1
```

접속 경로: `http://127.0.0.1:8787/login.html`

### 6.2 브라우저 요구사항

| 기능 | 용도 |
| --- | --- |
| IndexedDB | 운영 데이터 영속 저장 |
| localStorage / sessionStorage | 폴백 저장 / 세션 유지 |
| ES6+ JavaScript | `class`, `Promise`, `Map`, `Set`, `arrow function`, `template literal`, `Float64Array` |
| Canvas 2D | Chart.js 차트 렌더링 + base64 이미지 캡처 |
| `URL`, `Blob` | DOCX 파일 다운로드 |
| `requestAnimationFrame` | 차트 렌더링 동기화 |
| `history.replaceState` | 탭 URL 라우팅 |
| CSS Custom Properties | 디자인 토큰 시스템 |

**정의**: 최신 Chromium 계열 브라우저(Chrome, Edge) 사용을 권장한다. IE는 지원하지 않는다.

---

## 7. 스크립트 로드 순서

`index.html` 하단에서 다음 순서로 로드되며, 순서가 바뀌면 동작하지 않는다.

| 순서 | 파일 | 전역 노출 | 의존 |
| --- | --- | --- | --- |
| 1 | `js/storage.js` | `window.appStorage` | 없음 |
| 2 | `js/dashboard-data.js` | `window.dashboardData` | 없음 |
| 3 | `js/admin-features.js` | 모달/CRUD 함수 전역 | `window.appStorage` |
| 4 | `js/app.js` | 없음 (IIFE) | `window.dashboardData`, `window.appStorage` |

`app.js`의 IIFE는 `appStorage.ready` Promise가 resolve된 후에 `init()`을 호출한다. `dashboardData`가 없으면 초기화를 중단한다.

---

## 8. 인증 및 세션 아키텍처

| 단계 | 구현 |
| --- | --- |
| 로그인 | `login.html` → `findUser(id, pw)` → `sessionStorage` 저장 |
| 세션 형식 | `{id, name, dept, role}` JSON 문자열 |
| 인증 가드 | `index.html` `<head>` 인라인 스크립트에서 세션 확인 |
| 자동 리다이렉트 | `login.html` 접속 시 세션 존재 → `index.html` |
| 로그아웃 | `sessionStorage.removeItem("loggedInUser")` → `login.html` |
| 표시 이름 | `동국제강 {dept} \| {name}{position}님` 형식 |
| 세션 갱신 | 사용자 수정 시 `window.refreshLoggedInUserDisplay` 호출 |

**레거시 호환**: 과거 평문 문자열로 저장된 세션도 자동 변환 처리.

**정의**: 서버 측 인증(JWT, OAuth)은 없다. 세션은 브라우저 탭 생명주기를 따른다.

---

## 9. 적용 제외 기술

현재 프로젝트에는 다음 기술을 사용하지 않는다.

| 범주 | 제외 기술 |
| --- | --- |
| 프론트엔드 프레임워크 | React, Vue, Angular, Svelte |
| 빌드 시스템 | Webpack, Vite, Parcel, Rollup |
| 타입 시스템 | TypeScript |
| CSS 프레임워크 | Bootstrap, Tailwind, Styled Components |
| CSS 전처리기 | Sass, Less, PostCSS |
| 서버 | Node.js, Express, Django, Flask |
| API | REST API, GraphQL, gRPC |
| 데이터베이스 | MySQL, PostgreSQL, MongoDB, SQLite |
| 패키지 관리 | npm, yarn, pnpm |
| 컨테이너 | Docker, Kubernetes |
| CI/CD | GitHub Actions, Jenkins |
| 테스트 | Jest, Vitest, Cypress, Playwright |
| 린터/포매터 | ESLint, Prettier |
| 다크 모드 | `prefers-color-scheme` 미지원 |
| PDF | 보고서 PDF 출력 기능 없음 |
| 서버 인증 | JWT, OAuth, SAML 없음 |

---

## 10. 기술스택 선택 기준

### 10.1 선택 배경

- 빠른 시제품 구축이 필요함
- 정적 파일만으로 배포 가능한 구조가 필요함
- 서버 인프라 없이 로컬 실행과 데모가 가능해야 함
- 사용자가 엑셀 기반 데이터를 직접 반영할 수 있어야 함
- 외부 패키지 의존성을 최소화해야 함

### 10.2 장점

| 항목 | 설명 |
| --- | --- |
| 구축/배포 단순성 | 정적 파일 서버만으로 즉시 실행 가능 |
| 서버 불필요 | 인프라 구축/운영 비용 없음 |
| 수정 용이성 | 소스 파일 직접 수정 → 새로고침으로 즉시 반영 |
| 낮은 운영 비용 | 브라우저 저장소 기반, 추가 서비스 불필요 |
| 오프라인 가능 | CDN 파일을 로컬 배치하면 완전 오프라인 운영 가능 |
| 진입 장벽 낮음 | HTML/CSS/JS 기본 지식만으로 유지보수 가능 |

### 10.3 한계

| 항목 | 설명 |
| --- | --- |
| 데이터 격리 | 브라우저/프로필별 로컬 데이터 분리 |
| 권한 제어 미흡 | UI 수준의 메뉴 표시 차이만 존재, 실제 접근 제한 없음 |
| 백업/동기화 없음 | 중앙 데이터 저장소 부재 |
| CDN 의존성 | Chart.js, docx 라이브러리의 인터넷 접근 필요 |
| 보안 취약 | 비밀번호 평문 저장, 클라이언트 사이드 인증만 존재 |
| 확장성 제한 | 대규모 데이터나 다중 사용자 환경에 부적합 |
| 코드 규모 | app.js ~4,300줄 단일 파일로 모듈 분리 없음 |

---

## 11. 유지보수 기준

| 변경 대상 | 검토 파일 |
| --- | --- |
| UI 구조 변경 | `index.html`, `css/*`, `js/app.js` |
| 운영 기능 변경 | `js/admin-features.js`, 저장 키 영향 범위 |
| 데이터 구조 변경 | `scripts/build_dashboard_data.py` → `js/dashboard-data.js` → `js/app.js` 순서 |
| 차트 추가/변경 | `js/app.js` (차트 생성 함수 + `chartInstances` + DOCX 캡처) |
| 챗봇 기능 변경 | `js/app.js` (`parseVerifiedChatQuery` + 의도 빌더 함수들) |
| 외부 라이브러리 변경 | `index.html` CDN 경로 + 브라우저 호환성 검증 |
| 저장 키 추가 | `js/storage.js` 마이그레이션 목록 + `admin-features.js` 저장 패턴 |
| 모달 추가 | `index.html` DOM + `js/app.js` 또는 `js/admin-features.js` 이벤트 |

---

## 12. 알려진 기술 부채

| 항목 | 설명 |
| --- | --- |
| `tab-allocation` 고아 섹션 | HTML에 존재하나 전용 탭 버튼 없음 |
| 수입 선적 하드코딩 | `getImportShipmentRows()`가 데이터 번들 대신 하드코딩 값 사용 |
| 푸터 오타 | "Copywright" → "Copyright" |
| macOS 기본 경로 | `build_dashboard_data.py`의 기본 `--source`/`--output` 경로가 macOS 전용 |
| 단일 파일 규모 | `app.js` ~4,300줄, 모듈 분리 없음 |
| 비밀번호 평문 | 계정/공지 비밀번호가 암호화 없이 저장 |

---

## 13. 결론

본 프로젝트의 기술스택은 **"정적 웹 + Vanilla JavaScript + 브라우저 저장소 + 최소 외부 라이브러리(CDN 2개) + 규칙 기반 NLP 챗봇 + Python 데이터 파이프라인"** 구조로 정의한다. 빠른 구축과 쉬운 배포에 적합하지만, 다중 사용자 운영, 보안, 중앙 데이터 관리가 필요한 정식 업무 시스템으로 확장하려면 서버 아키텍처 보강이 필요하다.

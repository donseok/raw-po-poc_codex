# 기술스택 정의서

## 1. 문서 목적
본 문서는 `raw-po-poc_codex` 프로젝트에서 실제 사용 중인 기술스택을 정의하고, 각 기술의 역할과 적용 범위를 명확히 하기 위해 작성한다.

## 2. 시스템 개요
본 시스템은 별도 백엔드 애플리케이션 없이 동작하는 정적 웹 대시보드이다. 사용자는 브라우저에서 `login.html`과 `index.html`을 열어 로그인, 대시보드 조회, 데이터 입력, 공지/일정/사용자 관리를 수행한다.

## 3. 기술스택 요약

| 구분 | 기술 | 버전/범위 | 용도 |
| --- | --- | --- | --- |
| 프론트엔드 마크업 | HTML5 | 표준 | 로그인 화면, 대시보드 화면, 모달, 표, 폼 구성 |
| 프론트엔드 스타일 | CSS3 | 표준 | 레이아웃, 컴포넌트, 테마 변수 정의 |
| 프론트엔드 로직 | Vanilla JavaScript | ES6+ 수준 | 화면 렌더링, 이벤트 처리, 데이터 가공, 차트 제어 |
| 차트 라이브러리 | Chart.js | `4.4.1` | KPI/추이/비교 시각화 |
| 문서 출력 | docx | `8.5.0` | DOCX 보고서 생성 |
| 브라우저 저장소 | IndexedDB | 브라우저 내장 | 운영 데이터 영속 저장의 기본 저장소 |
| 브라우저 저장소 | localStorage | 브라우저 내장 | IndexedDB 미지원 시 대체 저장소 |
| 세션 관리 | sessionStorage | 브라우저 내장 | 로그인 사용자 세션 유지 |
| 데이터 번들 | JavaScript 데이터 파일 | `js/dashboard-data.js` | 기본 대시보드 데이터 공급 |
| 데이터 생성 스크립트 | Python 3 | 표준 라이브러리 기반 | XLSX 원본을 읽어 대시보드 데이터 파일 생성 |
| 실행 방식 | 정적 파일 서버 | 예: `python -m http.server` | 로컬/사내 환경에서 웹 페이지 제공 |

## 4. 계층별 상세 정의

### 4.1 화면 계층
- `login.html`
  - 로그인 UI와 테스트 계정 진입 기능 제공
  - 사용자 인증 결과를 `sessionStorage`에 저장
- `index.html`
  - 메인 대시보드, 탭 메뉴, 차트, 테이블, 모달, 챗봇 UI 제공

정의:
- 서버 사이드 렌더링은 사용하지 않는다.
- 프레임워크 기반 SPA가 아니라 정적 HTML 문서와 브라우저 스크립트 조합으로 동작한다.

### 4.2 스타일 계층
- `css/variables.css`
  - 색상, 공통 변수 정의
- `css/layout.css`
  - 헤더, 탭, 카드, 그리드 등 화면 레이아웃 정의
- `css/components.css`
  - 버튼, 표, 모달, 배지, 챗봇 등 컴포넌트 스타일 정의

정의:
- CSS 전처리기(Sass, Less)는 사용하지 않는다.
- 디자인 시스템 빌드 도구 없이 순수 CSS 파일로 관리한다.

### 4.3 애플리케이션 로직 계층
- `js/app.js`
  - 대시보드 렌더링
  - 연도 전환
  - 표 정렬
  - 원본 데이터 붙여넣기 처리
  - 거래처 관리
  - 등급 매핑 관리
  - DOCX 내보내기
  - 챗봇 응답 생성
- `js/admin-features.js`
  - 공지사항 관리
  - 팀 일정 관리
  - 사용자 관리
- `js/storage.js`
  - IndexedDB/localStorage 접근 추상화

정의:
- 상태 관리는 React, Vue, Redux 같은 외부 라이브러리 없이 JavaScript 객체와 함수로 직접 구현한다.
- 모듈 번들러(Webpack, Vite, Parcel) 없이 브라우저에서 직접 로드되는 스크립트 구조를 사용한다.

### 4.4 데이터 저장 계층
기본 저장 구조는 브라우저 저장소 기반이다.

- 기본 저장소: IndexedDB
- 대체 저장소: localStorage
- 세션 저장소: sessionStorage

주요 저장 키:

| 키 | 설명 |
| --- | --- |
| `planClipboardDataByYear` | 연도별 계획/실적 붙여넣기 데이터 |
| `rawTransactionDataByYear` | 연도별 원본 실적 데이터 |
| `gradeMacroMappings` | 검수 등급 매핑 데이터 |
| `supplierAdminItems` | 거래처 관리 데이터 |
| `noticesData` | 공지사항 데이터 |
| `schedulesData` | 일정 데이터 |
| `usersData` | 사용자 데이터 |
| `loggedInUser` | 로그인 세션 정보 |

정의:
- 중앙 DBMS(MySQL, PostgreSQL, MSSQL, MongoDB)는 사용하지 않는다.
- 서버 동기화 기능은 없다.
- 데이터는 현재 브라우저 프로필 기준으로 저장된다.

### 4.5 시각화 계층
- Chart.js `4.4.1`
  - CDN으로 로드
  - 월별 실적, 거래처 추이, 구매량, 등급 비교, 배분 현황 차트 렌더링

정의:
- 차트는 Canvas 기반으로 생성한다.
- 별도의 BI 도구 또는 SVG 기반 차트 프레임워크는 사용하지 않는다.

### 4.6 문서 출력 계층
- docx `8.5.0`
  - CDN으로 로드
  - 현재 화면의 차트 이미지를 캡처해 DOCX 보고서로 생성

정의:
- 보고서 포맷은 DOCX이며, PDF 생성 기능은 현재 포함하지 않는다.

### 4.7 데이터 생성 계층
- `scripts/build_dashboard_data.py`
  - Python 3 기반 스크립트
  - `xlsx` 원본을 읽어 `js/dashboard-data.js` 생성
  - `argparse`, `json`, `math`, `re`, `zipfile`, `datetime`, `xml.etree.ElementTree` 등 표준 라이브러리 사용

정의:
- 별도 Python 패키지 설치 없이 표준 라이브러리 중심으로 동작한다.
- 데이터 전처리는 런타임 브라우저가 아니라 사전 생성 스크립트와 브라우저 내 후처리 로직이 분담한다.

## 5. 외부 의존성 정의

| 라이브러리 | 버전 | 로드 방식 | 사용 위치 |
| --- | --- | --- | --- |
| Chart.js | `4.4.1` | CDN | [index.html](C:/Users/donse/raw-po-poc_codex/index.html) |
| docx | `8.5.0` | CDN | [index.html](C:/Users/donse/raw-po-poc_codex/index.html) |

정의:
- `npm`, `package.json`, `node_modules` 기반 의존성 관리는 사용하지 않는다.
- 주요 외부 의존성은 CDN 직접 참조 방식으로 관리한다.

## 6. 실행 환경 정의

### 6.1 개발/검증 실행 방식
- 정적 파일 서버 실행 예시

```bash
python -m http.server 8787 --bind 127.0.0.1
```

- 접속 경로
  - `http://127.0.0.1:8787/login.html`

### 6.2 브라우저 요구사항
다음 브라우저 기능이 필요하다.

- IndexedDB
- localStorage / sessionStorage
- ES6+ JavaScript 실행
- Canvas 렌더링
- `URL`, `Promise`, `requestAnimationFrame` 등 현대 브라우저 API

정의:
- 최신 Chromium 계열 브라우저(예: Chrome, Edge) 사용을 권장한다.

## 7. 적용 제외 기술
현재 프로젝트에는 다음 기술을 사용하지 않는다.

- React, Vue, Angular
- Node.js 기반 프론트엔드 빌드 시스템
- REST API / GraphQL API 서버
- 관계형/비관계형 서버 DB
- Docker, Kubernetes
- CI/CD 파이프라인 정의 파일
- TypeScript
- CSS 프레임워크(Bootstrap, Tailwind 등)

## 8. 기술스택 선택 기준

### 8.1 선택 배경
- 빠른 시제품 구축이 필요함
- 정적 파일만으로 배포 가능한 구조가 필요함
- 서버 인프라 없이 로컬 실행과 데모가 가능해야 함
- 사용자가 엑셀 기반 데이터를 직접 반영할 수 있어야 함

### 8.2 장점
- 구축과 배포가 단순함
- 서버 없이도 화면 동작 가능
- 데이터 구조와 화면 로직이 직접적이어서 수정이 빠름
- 브라우저 저장소 기반이라 운영 준비 비용이 낮음

### 8.3 한계
- 브라우저별 로컬 저장 데이터가 분리됨
- 사용자/권한 제어가 UI 수준에 머뭄
- 중앙 백업과 동기화가 없음
- CDN 의존성이 있어 완전한 폐쇄망 운영 시 별도 조치가 필요함

## 9. 유지보수 기준
- UI 구조 변경 시 `index.html`, `css/*`, `js/app.js`를 함께 검토한다.
- 운영 기능 변경 시 `js/admin-features.js`와 저장 키 영향 범위를 함께 검토한다.
- 원본 엑셀 구조가 변경되면 `scripts/build_dashboard_data.py`를 우선 수정한다.
- 외부 라이브러리 버전 변경 시 CDN 경로와 브라우저 호환성을 함께 검증한다.

## 10. 결론
본 프로젝트의 기술스택은 "정적 웹 + Vanilla JavaScript + 브라우저 저장소 + 최소 외부 라이브러리" 구조로 정의한다. 이는 빠른 구축과 쉬운 배포에는 적합하지만, 다중 사용자 운영·보안·중앙 데이터 관리가 필요한 정식 업무 시스템으로 확장하려면 별도의 서버 아키텍처 보강이 필요하다.

# 보고서 내보내기 DOCX 디자인 스킬

이 스킬은 대시보드의 "보고서 내보내기" 버튼 클릭 시 생성되는 DOCX 파일의 디자인과 내용을 세련되게 개선합니다.

## 실행 조건

- `js/app.js` 파일의 DOCX 보고서 내보내기 관련 함수들을 수정
- docx.js 라이브러리 (CDN) 기반으로 동작
- 변경 대상 함수: `docxSpacer`, `docxSubHeading`, `docxNoData`, `docxKpiTable`, `docxDataTable`, `docxChartImage`, `buildDocxPlanSection`, `buildDocxPurchasesSection`, `buildDocxAllocationSection`, `buildDocxGradeImportSection`, `exportDocx`

## 디자인 시스템

### 1. 컬러 팔레트
```
PRIMARY_NAVY    = "1A237E"   — 제목, 헤더, 강조
PRIMARY_LIGHT   = "283593"   — 서브헤딩, 보조 강조
ACCENT_ORANGE   = "FF8F00"   — 액센트, 구분선, 하이라이트
SUCCESS_GREEN   = "2E7D32"   — 달성/초과 지표
WARNING_AMBER   = "F57F17"   — 주의/경고 지표
DANGER_RED      = "C62828"   — 미달/위험 지표
TEXT_DARK       = "212121"   — 본문 텍스트
TEXT_MEDIUM     = "555555"   — 부제, 설명
TEXT_LIGHT      = "888888"   — 캡션, 날짜
BG_LIGHT        = "F8F9FA"   — KPI 카드 배경
BG_STRIPE       = "F0F2F8"   — 테이블 줄무늬
BORDER_LIGHT    = "E0E0E0"   — 테이블 테두리
```

### 2. 타이포그래피 (half-point 단위, 1pt = 2 half-points)
```
표지 메인 타이틀:    size: 48, bold, color: PRIMARY_NAVY
표지 서브 타이틀:    size: 36, bold, color: PRIMARY_NAVY
표지 연도:          size: 32, color: TEXT_DARK
표지 날짜/발행자:   size: 24, color: TEXT_MEDIUM

섹션 타이틀:        size: 32, bold, color: PRIMARY_NAVY
서브 헤딩:          size: 28, bold, color: PRIMARY_LIGHT
KPI 라벨:          size: 18, color: TEXT_MEDIUM
KPI 값:            size: 26, bold, color: PRIMARY_NAVY
테이블 헤더:        size: 18, bold, color: "FFFFFF" (배경: PRIMARY_NAVY)
테이블 본문:        size: 18, color: TEXT_DARK
캡션/주석:          size: 16, italics, color: TEXT_LIGHT
```

### 3. 레이아웃 규칙
```
페이지 여백:        top: 1080, right: 1080, bottom: 1080, left: 1080 (0.75인치)
표지 여백:          top: 1440, right: 1440, bottom: 1440, left: 1440 (1인치)
섹션 간격:          spacing.before: 360, spacing.after: 200
서브헤딩 간격:      spacing.before: 300, spacing.after: 120
KPI 카드 셀 마진:   top: 80, bottom: 80, left: 100, right: 100
테이블 셀 마진:     top: 40, bottom: 40, left: 60, right: 60
차트 이미지 크기:   width: 560, height: 280 (가로), 360x280 (도넛)
```

### 4. 표지 구조
```
[여백 3600 twips]
────────────────────────────────────
     동국제강 원료기획팀              (size:48, bold, NAVY, center)
────────────────────────────────────
     원료 조달 실적 모니터링 보고서    (size:36, bold, NAVY, center)
                                      spacing.after: 400
     ─────── (오렌지 구분선) ───────

     {year}년 보고서                  (size:32, TEXT_DARK, center)
                                      spacing.after: 200
     보고서 생성일: {today}            (size:24, TEXT_MEDIUM, center)
     발행: {userName}                  (size:24, TEXT_DARK, center)
────────────────────────────────────
```

### 5. KPI 카드 디자인
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  라벨(회색)  │  라벨(회색)  │  라벨(회색)  │  라벨(회색)  │
│  값(네이비)  │  값(네이비)  │  값(네이비)  │  값(네이비)  │
│  [굵은 큰글씨] │           │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┘
- 배경색: BG_LIGHT (#F8F9FA)
- 셀 상하좌우 마진 확보
- 테두리 없음 (깔끔한 카드 느낌)
- 각 셀 width: 25%
```

### 6. 데이터 테이블 디자인
```
┌────────┬──────────┬──────────┬──────────┐  ← 헤더: PRIMARY_NAVY 배경, 흰색 글씨
│   월   │   계획   │   실적   │  달성률  │
├────────┼──────────┼──────────┼──────────┤
│  1월   │ 220,000  │ 228,500  │ 103.86%  │  ← 홀수행: 흰색
├────────┼──────────┼──────────┼──────────┤
│  2월   │ 230,000  │ 231,200  │  99.95%  │  ← 짝수행: BG_STRIPE (#F0F2F8)
└────────┴──────────┴──────────┴──────────┘
- 첫번째 열: 왼쪽 정렬
- 나머지 열: 오른쪽 정렬
- 줄무늬(stripe) 배경으로 가독성 확보
- 테두리: BORDER_LIGHT (#E0E0E0)
```

### 7. 섹션 헤더 디자인
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. 부재료실적 모니터링              (size:32, bold, NAVY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 하단 오렌지 보더 (bottom border: ACCENT_ORANGE, sz:12)
- spacing.before: 120, spacing.after: 240
```

### 8. 서브 헤딩 디자인
```
  ■ 계획 대비 실적 추이               (size:28, bold, PRIMARY_LIGHT)
- 좌측에 네이비 사각 불릿(■) 포함
- spacing.before: 300, spacing.after: 120
```

## 실행 지침

1. `js/app.js` 파일에서 `/* ── DOCX 보고서 내보내기 ── */` 주석부터 `exportDocx()` 함수 끝까지를 찾는다
2. 위 디자인 시스템을 적용하여 다음을 수정한다:
   - `docxSubHeading()`: ■ 불릿 추가, PRIMARY_LIGHT 색상, spacing 조정
   - `docxKpiTable()`: BG_LIGHT 배경, 마진 확대, 테두리 제거, 값 크기 확대
   - `docxDataTable()`: 줄무늬 배경 추가, 테두리색 BORDER_LIGHT, 열 정렬 유지
   - `exportDocx()` 내 표지: 오렌지 구분선 추가, 타이포그래피 크기 조정
   - 각 `buildDocx*Section()`: 섹션 타이틀에 하단 보더 추가

3. 변경 시 기존 데이터 로직(`getActivePlanData`, `getPurchasesData`, `getGradeImportData`, `getSectionData`, `captureAllChartImages` 등)은 절대 수정하지 않는다

4. 변경 후 `node -c js/app.js`로 문법 검사를 수행한다

## 보고서 구성 (섹션 순서)

```
[표지]
  → 동국제강 원료기획팀
  → 원료 조달 실적 모니터링 보고서
  → {year}년 보고서
  → 생성일 / 발행자

[섹션 1: 부재료실적 모니터링]
  → KPI 카드 4개 (연간목표, 누계실적, 달성률, 거래처평균성과율)
  → 계획 대비 실적 추이 차트
  → 거래처별 입고 추이 차트
  → 월별 실적 테이블
  → 거래처 관리 현황 테이블

[섹션 2: 구매실적]
  → KPI 카드 4개 (누계구매량, 누계입고금액, 평균매입단가, 월평균거래처수)
  → 월별 구매 추이 차트
  → 구매실적 테이블

[섹션 3: 공장배분]
  → KPI 카드 4개 (인천계획/실적, 인천달성률, 포항계획/실적, 포항달성률)
  → 인천공장 등급 배분 도넛 차트
  → 포항공장 등급 배분 도넛 차트
  → 월별 배분 테이블

[섹션 4: 등급별현황/수입관리]
  → KPI 카드 (구매량/입고금액비율, 국고하+선반설비율)
  → 등급 비중 비교 차트
  → 집중 등급 비율 추이 차트
```

## 품질 기준

- 표지에서 전문적인 기업 보고서 느낌이 나야 함
- KPI 카드는 한눈에 핵심 지표가 파악되어야 함
- 테이블은 줄무늬로 행 구분이 명확해야 함
- 차트 이미지는 적절한 크기로 페이지에 잘 맞아야 함
- 섹션 간 시각적 구분이 명확해야 함 (구분선, 간격)
- 전체적으로 네이비+오렌지 컬러 테마가 일관되게 적용되어야 함

# 계산 수식 정리 보고서

## 1. 범위

- 포함 범위: 현재 프로젝트에서 화면 표시, 보고서 내보내기, 챗봇 응답, 붙여넣기 재계산에 실제로 사용되는 업무 지표/파생값 수식
- 주요 소스: `scripts/build_dashboard_data.py`, `js/app.js`
- 제외 범위: 페이지네이션, 날짜 표시, 정렬 인덱스, 차트 스타일, DOM 레이아웃처럼 업무 지표와 무관한 UI 계산

## 2. 공통 계산 규칙

| 항목 | 수식 | 사용 위치 |
| --- | --- | --- |
| 반올림(Python) | `round_number(value, d) = floor(value * 10^d + 0.5) / 10^d` | `scripts/build_dashboard_data.py` |
| 반올림(JS) | `roundNumber(value, d) = Math.round(Number(value) * 10^d) / 10^d` | `js/app.js` |
| 백분율 | `percent(part, whole) = whole ? (part / whole) * 100 : 0` | Python/JS 공통 |
| 억 단위 표시 | `display = value / 100000000` | `compact_number`, `formatCompact`, 구매/등급 차트 |
| 만 단위 표시 | `display = value / 10000` | `compact_number`, `formatCompact` |

참고:

- Python/JS 반올림 구현은 모두 양수 데이터 기준으로 일반적인 사사오입 형태로 동작합니다.
- 본 프로젝트의 실적/금액/비율 계산은 대부분 위 `percent`, `round_number`, `roundNumber`를 공통 기반으로 사용합니다.

## 3. 원본 엑셀 번들 생성 수식

소스: `scripts/build_dashboard_data.py`

### 3.1 계획 대비 실적

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 월 총계획 | `total_plan[m] = incheon_plan[m] + pohang_plan[m]` | `build_dashboard_data()` |
| 월 총실적 | `total_actual[m] = incheon_actual[m] + pohang_actual[m]` | `build_dashboard_data()` |
| 누계 계획 | `cumulative_plan[m] = sum(total_plan[1..m])` | `build_dashboard_data()` |
| 누계 실적 | `cumulative_actual[m] = sum(total_actual[1..m])` | `build_dashboard_data()` |
| 누계 달성률 | `achievement_rate[m] = cumulative_actual[m] / cumulative_plan[m] * 100` | `build_dashboard_data()` |
| 연간 목표 | `annual_target = sum(total_plan)` | `build_overview()` 호출부 |
| 연간 누계 실적 | `cumulative_actual_year = sum(total_actual)` | `build_overview()` 호출부 |
| 연간 달성률 | `attainment_rate = sum(total_actual) / sum(total_plan) * 100` | `build_overview()` 호출부 |

### 3.2 구매실적

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 월 입고량 | `monthly_qty[m] = sum(tx.qty where tx.month = m)` | `build_monthly_purchase_summary()` |
| 월 입고금액 | `monthly_amount[m] = sum(tx.amount where tx.month = m)` | `build_monthly_purchase_summary()` |
| 월 평균 단가 | `monthly_avg_unit_price[m] = monthly_amount[m] / monthly_qty[m]` | `build_monthly_purchase_summary()` |
| 월 거래처 수 | `supplier_count[m] = distinct_count(tx.supplier where tx.month = m)` | `build_monthly_purchase_summary()` |
| 연간 총 입고량 | `total_qty = sum(tx.qty)` | `build_dashboard_data()` |
| 연간 총 입고금액 | `total_amount = sum(tx.amount)` | `build_dashboard_data()` |
| 연간 평균 단가 | `avg_unit_price = total_amount / total_qty` | `build_dashboard_data()` |

### 3.3 거래처 성과

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 거래처 총 입고량 | `supplier_qty = sum(tx.qty for supplier)` | `build_supplier_summary()` |
| 거래처 총 입고금액 | `supplier_amount = sum(tx.amount for supplier)` | `build_supplier_summary()` |
| 거래처 평균 단가 | `supplier_avg_unit_price = supplier_amount / supplier_qty` | `build_supplier_summary()` |
| 거래처 점유율 | `supplier_share = supplier_qty / total_qty * 100` | `build_supplier_summary()` |
| 월별 거래처 실적 | `monthly_series[m] = sum(tx.qty where supplier and month = m)` | `build_supplier_summary()` |
| 최대 월 실적 | `peak_month_qty = max(monthly_series)` | `build_supplier_summary()` |
| 활동 월 수 | `months_active = count(months with qty > 0)` | `build_supplier_summary()` |
| 납품 성과율 | `performance_rate = supplier_qty / (peak_month_qty * months_active) * 100` | `build_supplier_summary()` |
| 주력 등급 | `dominant_macro = argmax(sum(tx.qty by macro))` | `build_supplier_summary()` |
| 공급사 평균 성과율 | `supplier_performance_avg = avg(supplier.performance_rate)` | `build_dashboard_data()` |

신뢰등급 판정:

- `performance_rate >= 85` -> `A`
- `performance_rate >= 80` -> `A-`
- `performance_rate >= 75` -> `B+`
- 그 외 -> `B`

### 3.4 등급별 현황 / 수입관리

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 대분류별 물량 | `macro_qty = sum(tx.qty by macro)` | `build_macro_mix()` |
| 대분류 비중 | `macro_share = macro_qty / total_qty * 100` | `build_macro_mix()` |
| 월별 국고하+선반설 비율 | `focused_ratio[m] = focused_qty[m] / total_qty[m] * 100` | `build_macro_ratio_by_month()` |
| 저회전 비율 | `low_turning_ratio = sum(macro_share where macro in {"국고하", "선반설"})` | `build_dashboard_data()` |
| 전년 비중 차이 | `diff_share = share_2024 - share_2023` | `build_category_comparison()` |
| 저회전 비율 증감 | `delta_share = current_ratio - compare_ratio` | `build_grade_import_bundle()` |

### 3.5 공장 배분

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 인천 연간 계획 | `incheon_plan_total = sum(incheon_plan)` | `build_dashboard_data()` |
| 인천 연간 실적 | `incheon_actual_total = sum(incheon_actual)` | `build_dashboard_data()` |
| 인천 달성률 | `incheon_rate = sum(incheon_actual) / sum(incheon_plan) * 100` | `build_dashboard_data()` |
| 포항 연간 계획 | `pohang_plan_total = sum(pohang_plan)` | `build_dashboard_data()` |
| 포항 연간 실적 | `pohang_actual_total = sum(pohang_actual)` | `build_dashboard_data()` |
| 포항 달성률 | `pohang_rate = sum(pohang_actual) / sum(pohang_plan) * 100` | `build_dashboard_data()` |
| 공장 등급 물량 | `grade_qty = sum(sheet row 12개월 값)` | `build_dashboard_data()` |
| 공장 등급 비중 | `grade_share = grade_qty / sum(all grade_qty) * 100` | `build_dashboard_data()` |
| 월 인천 달성률 | `incheon_rate[m] = incheon_actual[m] / incheon_plan[m] * 100` | `build_dashboard_data()` |
| 월 포항 달성률 | `pohang_rate[m] = pohang_actual[m] / pohang_plan[m] * 100` | `build_dashboard_data()` |

### 3.6 원본 거래 데이터 파생 규칙

| 항목 | 수식/규칙 | 함수 |
| --- | --- | --- |
| 거래 월 | `month = excel_serial_to_date(row[1]).month` | `build_transactions()` |
| 상세등급 -> 대분류 | `macro = grade_mapping[grade] or "기타"` | `build_transactions()` |
| 수량/금액 원천 | `qty = row[4]`, `amount = row[5]` | `build_transactions()` |

## 4. 브라우저 런타임 재계산 수식

소스: `js/app.js`

### 4.1 계획 데이터 붙여넣기

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 월 총계획 | `plan[m] = incheonPlan[m] + pohangPlan[m]` | `buildPlanOverrideDataset()` |
| 월 총실적 | `actual[m] = incheonActual[m] + pohangActual[m]` | `buildPlanOverrideDataset()` |
| 누계 계획 | `cumulativePlan[m] = sum(plan[1..m])` | `buildPlanOverrideDataset()` |
| 누계 실적 | `cumulativeActual[m] = sum(actual[1..m])` | `buildPlanOverrideDataset()` |
| 누계 달성률 | `achievementRate[m] = cumulativeActual[m] / cumulativePlan[m] * 100` | `buildPlanOverrideDataset()` |

### 4.2 원본 실적 붙여넣기

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 거래 월 | `month = Number(dateText.substring(5, 7))` | `parseRawTransactionText()`, `parseRawTransactionTextAsync()` |
| 상세등급 -> 대분류 | `macro = gradeMap[detailedGrade] or "기타"` | `parseRawTransactionText()`, `parseRawTransactionTextAsync()` |
| 수량 재산출 | `qty = round(amount / unitPrice)` | `parseRawTransactionText()`, `parseRawTransactionTextAsync()` |

현재 구현의 실제 수량 반올림 방식:

`qty = unitPrice ? (amount / unitPrice + 0.5) | 0 : 0`

즉, 원본 붙여넣기 경로에서는 엑셀 수량 열을 직접 쓰지 않고 `금액 / 단가`로 정수 수량을 다시 계산합니다.

### 4.3 원본 실적 기반 구매실적 재집계

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 월 입고량 | `monthly_qty[m] = sum(tx.qty)` | `buildPurchasesDatasetFromTransactions()` |
| 월 입고금액 | `monthly_amount[m] = sum(tx.amount)` | `buildPurchasesDatasetFromTransactions()` |
| 월 평균 단가 | `monthly_avg_unit_price[m] = monthly_amount[m] / monthly_qty[m]` | `buildPurchasesDatasetFromTransactions()` |
| 월 거래처 수 | `supplier_count[m] = distinct_count(tx.supplier)` | `buildPurchasesDatasetFromTransactions()` |
| 연간 총 입고량 | `total_qty = sum(monthly_qty)` | `buildPurchasesDatasetFromTransactions()` |
| 연간 총 입고금액 | `total_amount = sum(monthly_amount)` | `buildPurchasesDatasetFromTransactions()` |
| 연간 평균 단가 | `avg_unit_price = total_amount / total_qty` | `buildPurchasesDatasetFromTransactions()` |

### 4.4 원본 실적 기반 거래처 추이 재집계

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 거래처별 월 실적 | `monthly_series[m] = sum(tx.qty where supplier and month = m)` | `buildSupplierDatasetFromTransactions()` |
| 거래처 총 실적 | `total_qty = sum(monthly_series)` | `buildSupplierDatasetFromTransactions()` |
| 차트 반영 대상 | `top3_suppliers = top 3 by total_qty` | `buildSupplierDatasetFromTransactions()` |

주의:

- 원본 실적 붙여넣기 후 거래처 탭의 `추이 차트`는 재계산되지만, 거래처 `table/shareChart`는 기존 번들 데이터를 그대로 사용합니다.

### 4.5 원본 실적 기반 등급 비교 재계산

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 대분류 물량 | `macro_qty = sum(tx.qty by macro)` | `buildGradeImportDatasetFromTransactions()` |
| 대분류 비중 | `macro_share = macro_qty / total_qty * 100` | `buildGradeImportDatasetFromTransactions()` |
| 월별 국고하+선반설 비율 | `focused_ratio[m] = focused_qty[m] / month_total_qty[m] * 100` | `buildGradeImportDatasetFromTransactions()` |
| 현재 저회전 비율 | `lowTurningRatio = sum(share where macro in {"국고하", "선반설"})` | `buildGradeImportDatasetFromTransactions()` |
| 비교 저회전 비율 | `compareLowTurningRatio = same formula on compare year` | `buildGradeImportDatasetFromTransactions()` |
| 비중 차이 | `diffShare = currentShare - compareShare` | `buildGradeImportDatasetFromTransactions()` |
| 저회전 증감 | `deltaShare = lowTurningRatio - compareLowTurningRatio` | `getGradeImportData()` |

비교년도 원본 실적이 없을 때:

- 현재년도는 붙여넣기 raw data 기준으로 계산
- 비교년도는 `window.dashboardData.years[compareYear].gradeImport`의 기존 번들 값을 사용
- 이때도 `diffShare`, `deltaShare`는 `현재 계산값 - 비교 번들값`으로 다시 계산

### 4.6 인천공장 등급 믹스 재구성

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 등급 물량 | `macro_qty = sum(tx.qty by macro)` | `buildMacroGradeMix()` |
| 등급 비중 | `macro_share = macro_qty / total_qty * 100` | `buildMacroGradeMix()` |
| 인천 달성률 fallback | `base.achievementRate` 우선, 없으면 `totalQty / base.plan * 100`, 그것도 없으면 `100` | `getIncheonAllocationData()` |

주의:

- 원본 실적이 존재할 때 인천공장 등급 도넛 차트는 raw data의 대분류 기준으로 다시 그립니다.
- 현재 정적 `allocation.incheon` 스키마는 `planTotal`, `actualTotal`을 쓰고, fallback 코드는 `base.plan`, `base.actual`을 참고합니다. 따라서 현재 구현상 raw data가 있을 때 달성률은 보통 기존 `allocation.incheon.achievementRate`를 그대로 사용합니다.

### 4.7 거래처 관리 탭

| 지표 | 수식 | 함수 |
| --- | --- | --- |
| 성과율 자동 보정 | `performanceRate = clamp(round((yearlySupply / monthlyCapacity) * 12), 1, 99)` | `normalizeSupplierAdminItem()` |
| 평균 납품실적 | `averagePerformance = avg(item.performanceRate)` | `getSupplierAdminAveragePerformance()` |
| 총 월 처리능력 | `totalMonthlyCapacity = sum(item.monthlyCapacity)` | `getSupplierAdminSummary()` |
| 총 연간 납품량 | `totalYearlySupply = sum(item.yearlySupply)` | `getSupplierAdminSummary()` |
| 최대 납품 거래처 | `topSupplier = argmax(item.yearlySupply)` | `getSupplierAdminSummary()` |

## 5. 화면별 KPI / 하이라이트 수식

### 5.1 부재료실적 모니터링 탭

소스: `renderPlan()`

| 지표 | 수식 |
| --- | --- |
| 연간 목표 | `annualTarget = sum(row.plan)` |
| 누계 실적 | `cumulativeActual = lastRow.cumulativeActual` |
| 계획 대비 달성률 | `attainmentRate = lastRow.achievementRate` |
| 거래처 평균 성과율 | `avgSupplierPerformance = avg(supplierAdmin.performanceRate)` |
| 상단 변동 월 | `bestMonth = argmax(row.actual)` |
| 주의 구간 | `weakestMonth = argmin(row.achievementRate)` |
| 계획 미달 월 수 | `underTargetCount = count(row.actual < row.plan)` |
| 상단 변동 월 차이 | `monthlyGap = bestMonth.actual - bestMonth.plan` |
| 주의 구간 차이 | `weakestGap = weakestMonth.actual - weakestMonth.plan` |

주의:

- 이 탭의 `거래처 평균 성과율`은 공급사 raw summary가 아니라 거래처 관리 탭 데이터(`state.supplierAdminItems`)의 평균입니다.

### 5.2 구매실적 카드

소스: `renderPurchases()`

| 지표 | 수식 |
| --- | --- |
| 누계 구매량 | `totalQty` |
| 누계 입고금액 | `totalAmount` |
| 평균 매입 단가 | `avgUnitPrice = totalAmount / totalQty` |
| 월 평균 거래처 수 | `averageSupplierCount = avg(monthly.supplierCount)` |
| 최대 구매량 월 | `argmax(monthly.qty)` |
| 최소 구매량 월 | `argmin(monthly.qty)` |
| 최고 평균 단가 월 | `argmax(monthly.avgUnitPrice)` |
| 최저 평균 단가 월 | `argmin(monthly.avgUnitPrice)` |

참고:

- 화면 부제 텍스트에는 `누계 구매량 / 누계 입고금액`이라고 적혀 있지만, 실제 계산식은 코드상 `누계 입고금액 / 누계 구매량`입니다.

### 5.3 공장배분 카드

소스: `renderAllocation()`

| 지표 | 수식 |
| --- | --- |
| 국고하+선반설 비율 | `sum(item.share where item.name matches /국고\\s*하|선반설/)` |
| 전년 대비 증감 | `lowRatioDelta = currentLowRatio - prevYearLowRatio` |
| 진행바 폭 | `progressWidth = min(achievementRate, 100)%` |

### 5.4 등급별현황/수입관리 탭

소스: `renderGradeImport()`

| 지표 | 수식 |
| --- | --- |
| 월별 구매량 총합 | `totalPurchaseQty = sum(gradeData.mix.qty)` |
| 누계 입고금액 | `purchasesData.totalAmount` |
| 구매량/입고금액 비율 | `totalPurchaseQty / (totalAmount / 1000000)` |
| 국고하+선반설 비율 | `gradeData.lowTurningRatio` |
| 전년 대비 증감 | `gradeData.lowTurningRatio - gradeData.compareLowTurningRatio` |
| 차트 금액(억원) | `amount_in_uk = round(amount / 100000000, 1)` |

### 5.5 수입 현황 요약

소스: `buildVerifiedImportAnswer()`

| 지표 | 수식 |
| --- | --- |
| 수입량 | `totalQty = sum(row.qty)` |
| 평균 CFR | `avgCfr = avg(row.cfr)` |
| 상태별 건수 | `statusCount[status] = count(rows by status)` |

## 6. 챗봇 응답에서 재사용하는 집계 수식

소스: `buildVerifiedPlanAnswer()`, `buildVerifiedPurchaseAnswer()`, `buildVerifiedGradeAnswer()`, `buildVerifiedImportAnswer()`, `buildVerifiedSupplierAnswer()`, `buildVerifiedAllocationAnswer()`

챗봇은 기본적으로 화면 수식을 그대로 재사용하되, 월/기간 필터가 들어오면 아래처럼 구간 집계를 다시 계산합니다.

| 영역 | 수식 |
| --- | --- |
| 계획/실적 구간 합계 | `sumPlan = sum(row.plan)`, `sumActual = sum(row.actual)`, `rate = sumActual / sumPlan * 100` |
| 단월 계획 달성률 | `monthRate = row.actual / row.plan * 100` |
| 구매실적 구간 합계 | `sumQty = sum(row.qty)`, `sumAmt = sum(row.amount)`, `avgPrice = sumAmt / sumQty` |
| 등급 비중 차이 | `diff = currentShare - compareShare` |
| 거래처 총 납품량 | `totalSupply = sum(item.yearlySupply)` |
| 공장배분 구간 달성률 | `sumActual / sumPlan * 100` |

## 7. 현재 구현 기준 주의사항

1. 수량 원천이 경로별로 다릅니다.
   `scripts/build_dashboard_data.py`는 엑셀의 수량 열(`row[4]`)을 그대로 사용하고, `js/app.js`의 raw paste는 `금액 / 단가`로 수량을 다시 계산합니다.

2. raw paste 반영 범위가 완전히 동일하지 않습니다.
   구매실적, 등급별현황/수입관리, 거래처 추이 차트는 raw paste 재계산을 반영하지만, 거래처 테이블과 share chart는 기존 번들 데이터를 유지합니다.

3. 2023 overview는 계획 데이터가 없습니다.
   따라서 `years["2023"].overview.cumulativeActual`은 계획 대비 실적이 아니라 `2023 total_qty`를 넣는 fallback 구조입니다.

4. 인천공장 raw 재계산은 등급 믹스 중심입니다.
   raw data가 있을 때 인천공장 도넛 차트는 재계산되지만, 달성률은 현재 정적 allocation 데이터의 기존 값을 우선 사용합니다.

## 8. 확인한 소스 파일

- `scripts/build_dashboard_data.py`
- `js/app.js`
- `js/dashboard-data.js`


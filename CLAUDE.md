# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean-language raw materials procurement dashboard for Dongkuk Steel (동국제강 원료기획팀). Static web app with no framework — vanilla JS, HTML, CSS, and Chart.js (CDN). Python script generates the data bundle from Excel files.

## Running the App

```bash
python3 -m http.server 8787 --bind 127.0.0.1
# Open http://127.0.0.1:8787/login.html
# Test credentials: dongkuk1 / 1234
```

## Regenerating Data

```bash
python3 scripts/build_dashboard_data.py [--source path/to/file.xlsx] [--output js/dashboard-data.js]
```

Reads an XLSX workbook (parsed as zipped XML, stdlib only — no pandas/openpyxl) and emits `js/dashboard-data.js` as a `window.dashboardData` global.

## Architecture

**Data pipeline:** `XLSX → build_dashboard_data.py → js/dashboard-data.js → app.js → DOM`

**Script load order in index.html** (order matters):
1. `js/dashboard-data.js` — generated data bundle (`window.dashboardData`)
2. `js/storage.js` — IndexedDB/localStorage hybrid persistence layer
3. `js/admin-features.js` — notice/user/schedule/supplier CRUD
4. `js/app.js` — main app logic (IIFE, ~4200 lines), charts, tables, state management

**IIFE pattern:** `app.js` wraps all logic in a single IIFE. No globals are exported except through `window.dashboardData` (data bundle) and `window.appStorage` (storage API). The IIFE validates `dashboardData` exists before initializing.

**Authentication:** sessionStorage-based. `login.html` validates against localStorage user list (falls back to hardcoded defaults).

## State & Caching

**State:** Single `state` object inside the IIFE in `app.js`. Key properties:
- `selectedYear` — active dashboard year
- `rawTransactionsByYear` — user-pasted transaction data keyed by year
- `planOverrides` — manual plan edits by year
- `gradeMappings` — grade-to-macro category mappings
- `supplierAdminItems` — supplier CRUD buffer

**Persistent storage keys** (localStorage/IndexedDB): `planClipboardDataByYear`, `rawTransactionDataByYear`, `gradeMacroMappings`, `noticesData`, `schedulesData`, `usersData`.

**Two-tier cache system:**
- `_txCache` — caches `getRawTransactionsForYear()` result (in-place macro-mapped rows)
- `_aggCache` — caches derived datasets: `suppliers`, `purchases`, `gradeImport`
- Cache key format: `"${year}:${rowCount}:${_gradeMappingsVersion}"`
- `_invalidateTxCache()` wipes both tiers — called on year change, data reset, or mapping change

## Data Flow: Paste → Render

1. User pastes Excel data → paste event handler parses tab-separated text
2. For >20k rows: async chunked parsing (`parseRawTransactionTextAsync`, 20k rows/chunk via `setTimeout(0)`)
3. For ≤20k rows: sync `parseRawTransactionText()`
4. Stored in `state.rawTransactionsByYear[year]`, persisted to IndexedDB
5. On render, `getRawTransactionsForYear()` applies grade mappings in-place (no clone)
6. Three dataset builders aggregate on demand (called by chart/table renderers):
   - `buildSupplierDatasetFromTransactions()` — groups by supplier+month
   - `buildPurchasesDatasetFromTransactions()` — sums by month
   - `buildGradeImportDatasetFromTransactions()` — macro grade mix, current vs compare year

## Storage Layer (js/storage.js)

`window.appStorage` — hybrid IndexedDB + localStorage wrapper:
- `appStorage.ready` — Promise: DB init + migration complete
- `appStorage.getSync(key)` — synchronous in-memory cache read
- `appStorage.set(key, val)` — cache-first write, async IDB persist
- Auto-migrates legacy localStorage data to IndexedDB on first run
- Falls back to localStorage-only if IndexedDB unavailable

## Tab Structure (6 sections)

1. 부재료실적 모니터링 — plan vs actual, supplier management, plan paste grid, grade mappings
2. 구매실적 — monthly purchase trends
3. 공장배분 — Incheon/Pohang factory allocation with grade mix doughnuts
4. 등급별현황/수입관리 — grade mix comparison, import shipments
5. 공지사항 — notices and team calendar
6. 사용자관리 — user CRUD (admin only)

## DOCX Report Export

Triggered by `exportBtn` → `exportDocx()`. Flow:
1. Temporarily activates hidden tabs to render all charts
2. `captureAllChartImages()` — captures Chart.js canvases as base64 PNG
3. Four section builders compose docx elements: `buildDocxPlanSection`, `buildDocxPurchasesSection`, `buildDocxAllocationSection`, `buildDocxGradeImportSection`
4. Cover page + sections assembled into `docx.Document`, downloaded as blob

Design system defined in `.claude/commands/export-report.md` — use `/export-report` skill when redesigning DOCX output.

## Key Conventions

- **UI language is Korean.** All user-facing text, labels, and messages must be in Korean.
- **CSS classes:** kebab-case. **HTML IDs:** camelCase. **JS:** camelCase.
- **CSS custom properties** defined in `css/variables.css` (colors, spacing, shadows).
- **Chart.js** animations are disabled globally (`Chart.defaults.animation = false`). Chart instances tracked in `chartInstances` object; always call `destroyChart()` before re-creating.
- **Tables** use `data-export` attributes for Excel export and sortable headers.
- **Tab content** uses `#tab-{name}` ID pattern; navigation uses `data-tab` attributes.
- **Grade system:** 5 macro categories (국고상, 국고중, 국고하, 선반설, 기타) with configurable grade-to-macro mappings via UI. Source data may use spaces (e.g., "국고 하") — use regex `/국고\s*하/` for matching.
- **Number formatting:** `formatNumber()` for locale display, `formatCompact()` for abbreviated values (만/억).
- **Performance hot paths** use `for` loops (not `forEach`/`map`) and `Float64Array` for typed numeric accumulation.

## CSS Architecture

- `variables.css` — design tokens (primary: #1a237e, accent: #ff8f00)
- `layout.css` — app shell, header, nav tabs, grid, modals
- `components.css` — cards, buttons, forms, tables, badges, progress bars

## No Build Tools or Tests

There is no bundler, linter, test runner, or package manager. Files are served as-is via any static HTTP server. Validate syntax with `node -c js/app.js`.

# currentDate
Today's date is 2026-03-14.

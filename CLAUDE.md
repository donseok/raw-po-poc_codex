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
1. `js/dashboard-data.js` — generated data bundle
2. `js/admin-features.js` — notice/user/schedule CRUD, localStorage persistence
3. `js/app.js` — main app logic, charts, tables, state management

**Authentication:** sessionStorage-based. `login.html` validates against localStorage user list (falls back to hardcoded defaults).

**State:** Single `state` object inside an IIFE in `app.js`. Persistent data stored in localStorage under keys: `planClipboardDataByYear`, `rawTransactionDataByYear`, `gradeMacroMappings`, `noticesData`, `schedulesData`, `usersData`.

## Tab Structure (6 sections)

1. 부재료실적 모니터링 — plan vs actual, supplier management, plan paste grid, grade mappings
2. 구매실적 — monthly purchase trends
3. 공장배분 — Incheon/Pohang factory allocation
4. 등급/수입관리 — grade mix comparison
5. 공지사항 — notices and team calendar
6. 사용자관리 — user CRUD (admin only)

## Key Conventions

- **UI language is Korean.** All user-facing text, labels, and messages must be in Korean.
- **CSS classes:** kebab-case. **HTML IDs:** camelCase. **JS:** camelCase.
- **CSS custom properties** defined in `css/variables.css` (colors, spacing, shadows).
- **Chart.js** animations are disabled globally (`Chart.defaults.animation = false`). Chart instances tracked in `chartInstances` object; always call `destroyChart()` before re-creating.
- **Tables** use `data-export` attributes for Excel export and sortable headers.
- **Tab content** uses `#tab-{name}` ID pattern; navigation uses `data-tab` attributes.
- **Grade system:** 5 macro categories (국고상, 국고중, 국고하, 선반설, 기타) with configurable grade-to-macro mappings via UI.
- **Number formatting:** `formatNumber()` for locale display, `formatCompact()` for abbreviated values (만/억).

## CSS Architecture

- `variables.css` — design tokens (primary: #1a237e, accent: #ff8f00)
- `layout.css` — app shell, header, nav tabs, grid, modals
- `components.css` — cards, buttons, forms, tables, badges, progress bars

## No Build Tools or Tests

There is no bundler, linter, test runner, or package manager. Files are served as-is via any static HTTP server.

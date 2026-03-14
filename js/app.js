(function () {
  const rawData = window.dashboardData;
  if (!rawData) {
    document.body.innerHTML = "<p style='padding:24px'>대시보드 데이터를 불러오지 못했습니다.</p>";
    return;
  }

  function inferLegacyPrimaryYear(source) {
    if (source?.meta?.defaultYear) {
      return String(source.meta.defaultYear);
    }

    const yearMatches = JSON.stringify(source.gradeImport || {}).match(/20\d{2}/g) || [];
    if (yearMatches.length) {
      return yearMatches.sort().slice(-1)[0];
    }

    return String(new Date().getFullYear());
  }

  function inferLegacyCompareYear(source, primaryYear) {
    const yearMatches = [...new Set(JSON.stringify(source.gradeImport || {}).match(/20\d{2}/g) || [])]
      .filter((year) => year !== primaryYear)
      .sort();
    if (yearMatches.length) {
      return yearMatches.slice(-1)[0];
    }
    return String(Number(primaryYear) - 1);
  }

  function buildLegacyGradeImportDataset(gradeImport, currentYear, compareYear) {
    if (!gradeImport) {
      return null;
    }

    const currentKey = String(currentYear);
    const compareKey = String(compareYear);
    const currentIsPrimary = /2024$/.test(`mix${currentKey}`) || currentKey === inferLegacyPrimaryYear({ gradeImport });
    const currentQtyKey = currentIsPrimary ? "qty2024" : "qty2023";
    const currentShareKey = currentIsPrimary ? "share2024" : "share2023";
    const compareQtyKey = currentIsPrimary ? "qty2023" : "qty2024";
    const compareShareKey = currentIsPrimary ? "share2023" : "share2024";
    const currentRatioKey = currentIsPrimary ? "lowTurningRatio2024" : "lowTurningRatio2023";
    const compareRatioKey = currentIsPrimary ? "lowTurningRatio2023" : "lowTurningRatio2024";
    const currentMixKey = currentIsPrimary ? "mix2024" : "mix2023";
    const compareMixKey = currentIsPrimary ? "mix2023" : "mix2024";
    const currentMonthlyKey = currentIsPrimary
      ? "monthlyFocusedRatio2024"
      : "monthlyFocusedRatio2023";
    const compareMonthlyKey = currentIsPrimary
      ? "monthlyFocusedRatio2023"
      : "monthlyFocusedRatio2024";

    return {
      currentYear: currentKey,
      compareYear: compareKey,
      lowTurningRatio: gradeImport[currentRatioKey] ?? null,
      compareLowTurningRatio: gradeImport[compareRatioKey] ?? null,
      deltaShare:
        gradeImport[currentRatioKey] !== undefined && gradeImport[compareRatioKey] !== undefined
          ? Number((gradeImport[currentRatioKey] - gradeImport[compareRatioKey]).toFixed(2))
          : null,
      mix: gradeImport[currentMixKey] || [],
      compareMix: gradeImport[compareMixKey] || [],
      monthlyFocusedRatio: gradeImport[currentMonthlyKey] || [],
      compareMonthlyFocusedRatio: gradeImport[compareMonthlyKey] || [],
      comparisonTable: (gradeImport.comparisonTable || []).map((row) => ({
        category: row.category,
        currentQty: row[currentQtyKey] ?? 0,
        currentShare: row[currentShareKey] ?? 0,
        compareQty: row[compareQtyKey] ?? 0,
        compareShare: row[compareShareKey] ?? 0,
        diffShare:
          currentIsPrimary
            ? row.diffShare ?? ((row.share2024 || 0) - (row.share2023 || 0))
            : -1 * (row.diffShare ?? ((row.share2024 || 0) - (row.share2023 || 0)))
      }))
    };
  }

  function normalizeDashboardData(source) {
    const fixedAvailableYears = Array.from({ length: 7 }, (_, index) => String(2024 + index));
    if (source.years && typeof source.years === "object") {
      return {
        ...source,
        meta: {
          ...source.meta,
          defaultYear: "2024",
          availableYears: fixedAvailableYears
        }
      };
    }

    const primaryYear = inferLegacyPrimaryYear(source);
    const compareYear = inferLegacyCompareYear(source, primaryYear);
    const years = {
      [primaryYear]: {
        overview: source.overview || null,
        plan: source.plan || null,
        suppliers: source.suppliers || null,
        purchases: source.purchases || null,
        allocation: source.allocation || null,
        gradeImport: buildLegacyGradeImportDataset(source.gradeImport, primaryYear, compareYear)
      }
    };

    if (source.gradeImport) {
      years[compareYear] = {
        overview: null,
        plan: null,
        suppliers: null,
        purchases: null,
        allocation: null,
        gradeImport: buildLegacyGradeImportDataset(source.gradeImport, compareYear, primaryYear)
      };
    }

    return {
      meta: {
        ...(source.meta || {}),
        defaultYear: "2024",
        availableYears: fixedAvailableYears
      },
      years
    };
  }

  const data = normalizeDashboardData(rawData);

  const chartInstances = {};
  const DEFAULT_USER_DISPLAY = "동국제강 원료기획팀 | 이돈석 팀장님";
  const LEGACY_USER_DISPLAY = "동국제강 원료기획팀 | 이동석 팀장님";
  const PLAN_PASTE_STORAGE_KEY = "planClipboardDataByYear";
  const RAW_TRANSACTION_STORAGE_KEY = "rawTransactionDataByYear";
  const GRADE_MAPPING_STORAGE_KEY = "gradeMacroMappings";
  const PLAN_GRID_ROWS = ["incheonPlan", "incheonActual", "pohangPlan", "pohangActual"];
  const colors = {
    primary: "#1a237e",
    primaryLight: "#283593",
    accent: "#ff8f00",
    accentLight: "#ffa726",
    success: "#2e7d32",
    warning: "#f57f17",
    info: "#1565c0",
    blue: "#1976d2",
    teal: "#00897b",
    violet: "#5e35b1",
    lightBlue: "#42a5f5",
    slate: "#90a4ae",
    red: "#c62828"
  };

  const DEFAULT_GRADE_MAPPINGS = {
    국고상: ["생철A", "생철B", "생철AL", "슈레디B"],
    국고중: ["중량B", "중량AS", "중량A", "중량 ALC(가위)", "중량BS", "모터블럭", "경량B", "경량A", "경량TC", "경량S"],
    국고하: ["길로틴A", "길로틴B", "선반C", "중량BLS", "중량C", "경량C", "경량TC", "중량BLC", "중량D", "압축B"],
    선반설: ["선반A", "선반C", "압축C", "압축D"],
    기타: []
  };

  const state = {
    supplierQuery: "",
    supplierGrade: "all",
    tableSort: {},
    selectedYear: String(data.meta.defaultYear),
    planOverrides: {},
    supplierAdminItems: [],
    rawTransactionsByYear: {},
    gradeMappings: cloneMappings(DEFAULT_GRADE_MAPPINGS)
  };

  const tabLabels = {
    plan: "부재료실적 모니터링",
    purchases: "구매실적",
    allocation: "공장배분",
    gradeImport: "등급/수입관리",
    notice: "공지사항",
    user: "사용자관리"
  };

  const valueLabelPlugin = {
    id: "valueLabelPlugin",
    afterDatasetsDraw(chart, args, pluginOptions) {
      if (!pluginOptions || pluginOptions.enabled === false) {
        return;
      }

      const { ctx } = chart;
      ctx.save();
      ctx.font = "11px Segoe UI";
      ctx.fillStyle = pluginOptions.color || "#616161";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden || dataset.valueLabelSkip) {
          return;
        }

        if (chart.config.type === "doughnut") {
          meta.data.forEach((arc, index) => {
            const value = dataset.data[index];
            if (!value) {
              return;
            }
            const angle = (arc.startAngle + arc.endAngle) / 2;
            const radius = (arc.outerRadius + arc.innerRadius) / 2;
            const x = arc.x + Math.cos(angle) * radius;
            const y = arc.y + Math.sin(angle) * radius;
            const label =
              pluginOptions.format === "percent"
                ? `${Number(value).toFixed(1)}%`
                : formatCompact(value);
            ctx.fillStyle = "#37474f";
            ctx.fillText(label, x, y);
          });
          return;
        }

        if (meta.type === "bar") {
          meta.data.forEach((bar, index) => {
            const value = dataset.data[index];
            if (value === null || value === undefined) {
              return;
            }
            const label =
              pluginOptions.format === "percent"
                ? `${Number(value).toFixed(1)}%`
                : formatCompact(value);
            ctx.fillStyle = dataset.borderColor || pluginOptions.color || "#37474f";
            ctx.fillText(label, bar.x, bar.y - 6);
          });
        }
      });

      ctx.restore();
    }
  };

  Chart.register(valueLabelPlugin);
  Chart.defaults.animation = false;

  function formatNumber(value, digits = 0) {
    return Number(value).toLocaleString("ko-KR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatPercent(value, digits = 1) {
    return `${formatNumber(value, digits)}%`;
  }

  function formatCompact(value) {
    const num = Number(value);
    if (Math.abs(num) >= 100000000) {
      return `${formatNumber(num / 100000000, 1)}억`;
    }
    if (Math.abs(num) >= 10000) {
      return `${formatNumber(num / 10000, 1)}만`;
    }
    return formatNumber(num, 0);
  }

  function roundNumber(value, digits = 0) {
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  }

  function percent(part, whole) {
    return whole ? (part / whole) * 100 : 0;
  }

  function cloneMappings(source) {
    return JSON.parse(JSON.stringify(source));
  }

  function getDetailedToMacroMap() {
    const result = {};
    Object.entries(state.gradeMappings || {}).forEach(([macro, items]) => {
      items.forEach((item) => {
        result[String(item).trim()] = macro;
      });
    });
    return result;
  }

  function normalizeGradeMappings(payload) {
    const normalized = cloneMappings(DEFAULT_GRADE_MAPPINGS);
    if (!payload || typeof payload !== "object") {
      return normalized;
    }

    Object.keys(normalized).forEach((macro) => {
      const list = Array.isArray(payload[macro]) ? payload[macro] : [];
      normalized[macro] = [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right, "ko")
      );
    });
    return normalized;
  }

  function loadGradeMappings() {
    try {
      const raw = localStorage.getItem(GRADE_MAPPING_STORAGE_KEY);
      state.gradeMappings = raw ? normalizeGradeMappings(JSON.parse(raw)) : cloneMappings(DEFAULT_GRADE_MAPPINGS);
    } catch {
      state.gradeMappings = cloneMappings(DEFAULT_GRADE_MAPPINGS);
    }
  }

  function saveGradeMappings() {
    localStorage.setItem(GRADE_MAPPING_STORAGE_KEY, JSON.stringify(state.gradeMappings));
  }

  function parseRawTransactionText(rawText) {
    const gradeMap = getDetailedToMacroMap();
    const rows = rawText
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((cell) => normalizeClipboardCell(cell)))
      .filter((cells) => cells.some(Boolean));

    const parsed = [];
    rows.forEach((cells) => {
      if (cells.length < 5) {
        return;
      }
      const [dateText, supplier, detailedGrade, unitPriceText, amountText] = cells;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        return;
      }
      const unitPrice = parseClipboardNumber(unitPriceText);
      const amount = parseClipboardNumber(amountText);
      if (!supplier || !detailedGrade || unitPrice === null || amount === null) {
        return;
      }
      const month = Number(dateText.split("-")[1]);
      parsed.push({
        date: dateText,
        month,
        supplier,
        detailedGrade,
        macro: gradeMap[detailedGrade] || "기타",
        unitPrice,
        amount,
        qty: unitPrice ? roundNumber(amount / unitPrice, 0) : 0
      });
    });

    if (!parsed.length) {
      throw new Error("붙여넣은 내용에서 유효한 원본 실적 행을 찾지 못했습니다.");
    }

    return parsed;
  }

  function normalizeRawTransactions(payload) {
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .map((item) => ({
        date: String(item.date || ""),
        month: Number(item.month),
        supplier: String(item.supplier || "").trim(),
        detailedGrade: String(item.detailedGrade || "").trim(),
        macro: String(item.macro || "기타").trim(),
        unitPrice: Number(item.unitPrice) || 0,
        amount: Number(item.amount) || 0,
        qty: Number(item.qty) || 0
      }))
      .filter((item) => item.date && item.supplier && item.detailedGrade && item.month >= 1 && item.month <= 12);
  }

  function loadRawTransactions() {
    try {
      const raw = localStorage.getItem(RAW_TRANSACTION_STORAGE_KEY);
      if (!raw) {
        state.rawTransactionsByYear = {};
        return;
      }
      const parsed = JSON.parse(raw);
      state.rawTransactionsByYear = Object.fromEntries(
        Object.entries(parsed || {}).map(([year, rows]) => [year, normalizeRawTransactions(rows)])
      );
    } catch {
      state.rawTransactionsByYear = {};
    }
  }

  function saveRawTransactions() {
    localStorage.setItem(RAW_TRANSACTION_STORAGE_KEY, JSON.stringify(state.rawTransactionsByYear || {}));
  }

  function getRawTransactionsForYear(year = getSelectedYear()) {
    const rows = state.rawTransactionsByYear?.[String(year)] || [];
    const gradeMap = getDetailedToMacroMap();
    return rows.map((row) => ({
      ...row,
      macro: gradeMap[row.detailedGrade] || "기타"
    }));
  }

  function buildSupplierDatasetFromTransactions(transactions) {
    const monthlyBySupplier = new Map();
    transactions.forEach((tx) => {
      if (!monthlyBySupplier.has(tx.supplier)) {
        monthlyBySupplier.set(tx.supplier, Array.from({ length: 12 }, () => 0));
      }
      monthlyBySupplier.get(tx.supplier)[tx.month - 1] += tx.qty;
    });

    const ranked = [...monthlyBySupplier.entries()]
      .map(([name, monthlySeries]) => ({
        name,
        monthlySeries: monthlySeries.map((value) => roundNumber(value, 0)),
        totalQty: monthlySeries.reduce((sum, value) => sum + value, 0)
      }))
      .sort((left, right) => right.totalQty - left.totalQty)
      .slice(0, 3);

    return {
      labels: Array.from({ length: 12 }, (_, index) => `${index + 1}월`),
      series: ranked.map((item) => ({
        name: item.name,
        data: item.monthlySeries
      }))
    };
  }

  function buildPurchasesDatasetFromTransactions(transactions) {
    const monthly = Array.from({ length: 12 }, (_, index) => ({
      month: `${index + 1}월`,
      qty: 0,
      amount: 0,
      avgUnitPrice: 0,
      supplierCount: 0
    }));
    const monthlySuppliers = Array.from({ length: 12 }, () => new Set());

    transactions.forEach((tx) => {
      const bucket = monthly[tx.month - 1];
      bucket.qty += tx.qty;
      bucket.amount += tx.amount;
      monthlySuppliers[tx.month - 1].add(tx.supplier);
    });

    monthly.forEach((bucket, index) => {
      bucket.qty = roundNumber(bucket.qty, 0);
      bucket.amount = roundNumber(bucket.amount, 0);
      bucket.avgUnitPrice = bucket.qty ? roundNumber(bucket.amount / bucket.qty, 1) : 0;
      bucket.supplierCount = monthlySuppliers[index].size;
    });

    const totalQty = roundNumber(monthly.reduce((sum, row) => sum + row.qty, 0), 0);
    const totalAmount = roundNumber(monthly.reduce((sum, row) => sum + row.amount, 0), 0);
    return {
      totalQty,
      totalAmount,
      avgUnitPrice: totalQty ? roundNumber(totalAmount / totalQty, 1) : 0,
      totalQtyDisplay: formatCompact(totalQty),
      totalAmountDisplay: formatCompact(totalAmount),
      avgUnitPriceDisplay: formatNumber(totalQty ? totalAmount / totalQty : 0, 1),
      monthly
    };
  }

  function buildGradeImportDatasetFromTransactions(currentYear, currentTransactions, compareYear, compareTransactions) {
    const summarizeMix = (transactions) => {
      const totalQty = transactions.reduce((sum, tx) => sum + tx.qty, 0);
      const macroTotals = {};
      transactions.forEach((tx) => {
        macroTotals[tx.macro] = (macroTotals[tx.macro] || 0) + tx.qty;
      });
      return Object.entries(macroTotals)
        .map(([name, qty]) => ({
          name,
          qty: roundNumber(qty, 0),
          share: roundNumber(percent(qty, totalQty), 2)
        }))
        .sort((left, right) => right.qty - left.qty);
    };

    const summarizeMonthlyRatio = (transactions) =>
      Array.from({ length: 12 }, (_, index) => {
        const monthRows = transactions.filter((tx) => tx.month === index + 1);
        const totalQty = monthRows.reduce((sum, tx) => sum + tx.qty, 0);
        const focusedQty = monthRows
          .filter((tx) => ["국고하", "선반설"].includes(tx.macro))
          .reduce((sum, tx) => sum + tx.qty, 0);
        return {
          month: `${index + 1}월`,
          ratio: roundNumber(percent(focusedQty, totalQty), 2)
        };
      });

    const currentMix = summarizeMix(currentTransactions);
    const compareMix = summarizeMix(compareTransactions);
    const allCategories = [...new Set([...currentMix.map((row) => row.name), ...compareMix.map((row) => row.name)])];
    const currentMap = Object.fromEntries(currentMix.map((row) => [row.name, row]));
    const compareMap = Object.fromEntries(compareMix.map((row) => [row.name, row]));

    return {
      currentYear: String(currentYear),
      compareYear: String(compareYear),
      lowTurningRatio: roundNumber(
        currentMix.filter((row) => ["국고하", "선반설"].includes(row.name)).reduce((sum, row) => sum + row.share, 0),
        2
      ),
      compareLowTurningRatio: roundNumber(
        compareMix.filter((row) => ["국고하", "선반설"].includes(row.name)).reduce((sum, row) => sum + row.share, 0),
        2
      ),
      deltaShare: 0,
      mix: currentMix,
      compareMix,
      monthlyFocusedRatio: summarizeMonthlyRatio(currentTransactions),
      compareMonthlyFocusedRatio: summarizeMonthlyRatio(compareTransactions),
      comparisonTable: allCategories.map((name) => ({
        category: name,
        currentQty: currentMap[name]?.qty || 0,
        currentShare: currentMap[name]?.share || 0,
        compareQty: compareMap[name]?.qty || 0,
        compareShare: compareMap[name]?.share || 0,
        diffShare: roundNumber((currentMap[name]?.share || 0) - (compareMap[name]?.share || 0), 2)
      }))
    };
  }

  function parseSortValue(text) {
    const value = text.trim();
    const monthMatch = value.match(/^(\d+)월$/);
    if (monthMatch) {
      return Number(monthMatch[1]);
    }

    const sanitized = value.replace(/,/g, "").replace(/%p/g, "").replace(/%/g, "");
    if (/[0-9]/.test(sanitized)) {
      const numberValue = Number(sanitized.replace(/[^\d.-]/g, ""));
      if (!Number.isNaN(numberValue)) {
        return numberValue;
      }
    }

    return value.toLowerCase();
  }

  function compareSortValues(left, right) {
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    return String(left).localeCompare(String(right), "ko");
  }

  function kpiCard(label, value, sub, modifier) {
    return `
      <article class="kpi-card ${modifier || ""}">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}</div>
        <div class="kpi-sub">${sub}</div>
      </article>
    `;
  }

  function getComparisonIndicator(actual, target) {
    if (!Number.isFinite(actual) || !Number.isFinite(target) || actual === target) {
      return "";
    }
    if (actual > target) {
      return '<span class="kpi-value-trend over" aria-label="초과 달성">▲ 초과</span>';
    }
    return '<span class="kpi-value-trend under" aria-label="미달">▼ 미달</span>';
  }

  function getAttainmentIndicator(rate) {
    if (!Number.isFinite(rate)) {
      return "";
    }
    return getComparisonIndicator(rate, 100);
  }

  function miniStat(name, meta, value) {
    return `
      <div class="mini-stat">
        <div>
          <div class="name">${name}</div>
          <div class="meta">${meta}</div>
        </div>
        <div class="value">${value}</div>
      </div>
    `;
  }

  function badgeClass(grade) {
    if (grade === "A") {
      return "badge badge-green";
    }
    if (grade === "A-") {
      return "badge badge-blue";
    }
    if (grade === "B+") {
      return "badge badge-orange";
    }
    return "badge badge-gray";
  }

  function destroyChart(key) {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  }

  function makeBarChart(key, canvasId, config) {
    destroyChart(key);
    chartInstances[key] = new Chart(document.getElementById(canvasId), config);
  }

  function refreshCharts() {
    Object.values(chartInstances).forEach((chart) => {
      chart.resize();
      chart.update("none");
    });
  }

  function applyTableSort(table) {
    if (!table || !table.tBodies.length) {
      return;
    }

    const key = table.dataset.export || table.id;
    const sortState = state.tableSort[key];
    const headers = [...table.tHead.rows[0].cells];

    headers.forEach((header, index) => {
      header.classList.remove("sort-asc", "sort-desc", "no-sort");
      if (sortState && index === sortState.index) {
        header.classList.add(sortState.direction === "asc" ? "sort-asc" : "sort-desc");
      }
    });

    if (!sortState) {
      return;
    }

    const body = table.tBodies[0];
    const rows = [...body.rows];
    if (!rows.length || rows[0].classList.contains("empty-row")) {
      return;
    }

    rows.sort((leftRow, rightRow) => {
      const leftValue = parseSortValue(leftRow.cells[sortState.index].textContent);
      const rightValue = parseSortValue(rightRow.cells[sortState.index].textContent);
      const result = compareSortValues(leftValue, rightValue);
      return sortState.direction === "asc" ? result : -result;
    });

    rows.forEach((row) => body.appendChild(row));
  }

  function setupSortableTables() {
    document.querySelectorAll(".sortable-table").forEach((table) => {
      const headers = [...table.tHead.rows[0].cells];
      headers.forEach((header, index) => {
        header.addEventListener("click", () => {
          const key = table.dataset.export || table.id;
          const current = state.tableSort[key];
          const nextDirection =
            current && current.index === index && current.direction === "asc" ? "desc" : "asc";
          state.tableSort[key] = { index, direction: nextDirection };
          applyTableSort(table);
        });
      });
    });
  }

  const SUPPLIER_ADMIN_STORAGE_KEY = "supplierAdminItems";
  const DEFAULT_SUPPLIER_ADMIN_ITEMS = [
    { code: "S001", name: "현대스크랩", region: "인천", owner: "박정수", phone: "032-812-5500", monthlyCapacity: 25000, yearlySupply: 58200, trustGrade: "A", performanceRate: 97 },
    { code: "S002", name: "포스코리사이클링", region: "포항", owner: "이동현", phone: "054-220-3500", monthlyCapacity: 20000, yearlySupply: 45000, trustGrade: "A", performanceRate: 96 },
    { code: "S003", name: "삼영금속", region: "경기 안산", owner: "김영호", phone: "031-492-7700", monthlyCapacity: 18000, yearlySupply: 41300, trustGrade: "A", performanceRate: 94 },
    { code: "S004", name: "대한자원", region: "충남 당진", owner: "최민기", phone: "041-355-2200", monthlyCapacity: 15000, yearlySupply: 35800, trustGrade: "B+", performanceRate: 91 },
    { code: "S005", name: "한국메탈", region: "부산", owner: "정태영", phone: "051-632-4400", monthlyCapacity: 12000, yearlySupply: 28900, trustGrade: "B+", performanceRate: 89 },
    { code: "S006", name: "동부스크랩", region: "경기 시흥", owner: "송현우", phone: "031-318-6600", monthlyCapacity: 10000, yearlySupply: 22100, trustGrade: "B", performanceRate: 87 },
    { code: "S007", name: "영남자원", region: "경북 경주", owner: "한승규", phone: "054-741-8800", monthlyCapacity: 8000, yearlySupply: 18400, trustGrade: "B", performanceRate: 85 },
    { code: "S008", name: "서해금속", region: "인천", owner: "윤석진", phone: "032-765-1100", monthlyCapacity: 7000, yearlySupply: 15200, trustGrade: "B", performanceRate: 84 }
  ];

  function setupPlanPasteToggle() {
    [
      ["planPasteToggle", "planPastePanel"],
      ["rawPasteToggle", "rawPastePanel"],
      ["mappingToggle", "mappingPanel"]
    ].forEach(([toggleId, panelId]) => {
      const toggle = document.getElementById(toggleId);
      const panel = document.getElementById(panelId);
      if (!toggle || !panel) {
        return;
      }

      toggle.addEventListener("click", () => {
        const isExpanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!isExpanded));
        panel.hidden = isExpanded;
      });
    });
  }

  function getAvailableYears() {
    return data.meta.availableYears || [];
  }

  function getSelectedYear() {
    return String(state.selectedYear);
  }

  function getSelectedYearLabel() {
    return `${getSelectedYear()}년`;
  }

  function getSelectedYearData() {
    return data.years?.[getSelectedYear()] || {};
  }

  function getSectionData(sectionKey) {
    return getSelectedYearData()?.[sectionKey] || null;
  }

  function getSuppliersData() {
    const rawTransactions = getRawTransactionsForYear();
    if (rawTransactions.length) {
      return {
        ...(getSectionData("suppliers") || {}),
        trendChart: buildSupplierDatasetFromTransactions(rawTransactions)
      };
    }
    return getSectionData("suppliers");
  }

  function getPurchasesData() {
    const rawTransactions = getRawTransactionsForYear();
    if (rawTransactions.length) {
      return buildPurchasesDatasetFromTransactions(rawTransactions);
    }
    return getSectionData("purchases");
  }

  function getGradeImportData() {
    const currentYear = getSelectedYear();
    const currentTransactions = getRawTransactionsForYear(currentYear);
    const base = getSectionData("gradeImport");
    if (!currentTransactions.length) {
      return base;
    }

    const compareYear = base?.compareYear || String(Number(currentYear) - 1);
    const compareTransactions = getRawTransactionsForYear(compareYear);
    const compareBase = data.years?.[compareYear]?.gradeImport || null;
    const derived = buildGradeImportDatasetFromTransactions(
      currentYear,
      currentTransactions,
      compareYear,
      compareTransactions
    );
    if (!compareTransactions.length && compareBase) {
      derived.compareLowTurningRatio = compareBase.lowTurningRatio;
      derived.compareMix = compareBase.mix || [];
      derived.compareMonthlyFocusedRatio = compareBase.monthlyFocusedRatio || [];
      const compareMap = Object.fromEntries((compareBase.comparisonTable || []).map((row) => [row.category, row]));
      derived.comparisonTable = derived.comparisonTable.map((row) => ({
        ...row,
        compareQty: compareMap[row.category]?.currentQty || compareMap[row.category]?.qty2023 || 0,
        compareShare: compareMap[row.category]?.currentShare || compareMap[row.category]?.share2023 || 0,
        diffShare: roundNumber(row.currentShare - (compareMap[row.category]?.currentShare || compareMap[row.category]?.share2023 || 0), 2)
      }));
    }
    derived.deltaShare = roundNumber(derived.lowTurningRatio - derived.compareLowTurningRatio, 2);
    return derived;
  }

  function getYearOverview() {
    return getSectionData("overview");
  }

  function getActivePlanData() {
    return state.planOverrides[getSelectedYear()] || getSectionData("plan");
  }

  function makeUnavailableRow(colspan, message) {
    return `<tr class="empty-row"><td colspan="${colspan}">${message}</td></tr>`;
  }

  function setEmptyChartMessage(canvasId, message) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) {
      return;
    }
    canvas.style.display = "none";
    let empty = canvas.parentElement.querySelector(".chart-empty");
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "empty-state chart-empty";
      canvas.parentElement.appendChild(empty);
    }
    empty.textContent = message;
  }

  function clearEmptyChartMessage(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.parentElement) {
      return;
    }
    canvas.style.display = "";
    const empty = canvas.parentElement.querySelector(".chart-empty");
    if (empty) {
      empty.remove();
    }
  }

  function normalizeSupplierAdminItem(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const code = String(item.code || "").trim();
    const name = String(item.name || "").trim();
    if (!code || !name) {
      return null;
    }
    const performanceRate = Number(item.performanceRate);
    return {
      code,
      name,
      region: String(item.region || "").trim(),
      owner: String(item.owner || "").trim(),
      phone: String(item.phone || "").trim(),
      monthlyCapacity: Number(item.monthlyCapacity) || 0,
      yearlySupply: Number(item.yearlySupply) || 0,
      trustGrade: String(item.trustGrade || "B").trim(),
      performanceRate: Number.isFinite(performanceRate)
        ? performanceRate
        : Math.min(99, Math.max(1, Math.round(((Number(item.yearlySupply) || 0) / Math.max(Number(item.monthlyCapacity) || 1, 1)) * 12)))
    };
  }

  function loadSupplierAdminItems() {
    try {
      const raw = localStorage.getItem(SUPPLIER_ADMIN_STORAGE_KEY);
      if (!raw) {
        state.supplierAdminItems = DEFAULT_SUPPLIER_ADMIN_ITEMS.map((item) => ({ ...item }));
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("Invalid supplier items");
      }
      state.supplierAdminItems = parsed.map(normalizeSupplierAdminItem).filter(Boolean);
      if (!state.supplierAdminItems.length) {
        state.supplierAdminItems = DEFAULT_SUPPLIER_ADMIN_ITEMS.map((item) => ({ ...item }));
      }
    } catch {
      state.supplierAdminItems = DEFAULT_SUPPLIER_ADMIN_ITEMS.map((item) => ({ ...item }));
    }
  }

  function saveSupplierAdminItems() {
    localStorage.setItem(SUPPLIER_ADMIN_STORAGE_KEY, JSON.stringify(state.supplierAdminItems));
  }

  function supplierAdminGradeClass(grade) {
    const normalized = String(grade || "").toLowerCase().replace("+", "plus");
    return `supplier-admin-grade grade-${normalized || "b"}`;
  }

  function supplierPerformanceClass(rate) {
    if (rate >= 90) {
      return "good";
    }
    if (rate >= 85) {
      return "mid";
    }
    return "low";
  }

  function getSupplierAdminAveragePerformance() {
    const performanceRates = state.supplierAdminItems
      .map((item) => Number(item.performanceRate))
      .filter((value) => Number.isFinite(value));

    if (!performanceRates.length) {
      return 0;
    }
    return roundNumber(
      performanceRates.reduce((sum, value) => sum + value, 0) / performanceRates.length,
      1
    );
  }

  function normalizeClipboardCell(value) {
    return String(value ?? "").replace(/\r/g, "").trim();
  }

  function parseMonthHeader(value) {
    const normalized = normalizeClipboardCell(value).replace(/\s+/g, "");
    const match = normalized.match(/(\d{1,2})월$/);
    if (!match) {
      return null;
    }
    const month = Number(match[1]);
    return month >= 1 && month <= 12 ? month : null;
  }

  function parseClipboardNumber(value) {
    const normalized = normalizeClipboardCell(value).replace(/,/g, "").replace(/\s+/g, "");
    if (!normalized) {
      return null;
    }
    if (!/[0-9]/.test(normalized)) {
      return null;
    }
    const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function extractMonthColumns(rows) {
    let bestMatch = null;

    rows.forEach((cells, rowIndex) => {
      const found = [];
      cells.forEach((cell, colIndex) => {
        const month = parseMonthHeader(cell);
        if (month !== null) {
          found.push({ month, colIndex });
        }
      });

      const uniqueByMonth = [];
      const seenMonths = new Set();
      found
        .sort((left, right) => left.colIndex - right.colIndex)
        .forEach((item) => {
          if (!seenMonths.has(item.month)) {
            seenMonths.add(item.month);
            uniqueByMonth.push(item);
          }
        });

      if (!bestMatch || uniqueByMonth.length > bestMatch.columns.length) {
        bestMatch = { rowIndex, columns: uniqueByMonth };
      }
    });

    return bestMatch && bestMatch.columns.length >= 6 ? bestMatch.columns : null;
  }

  function identifyPlanPasteRows(rows) {
    const result = {
      incheonPlan: null,
      incheonActual: null,
      pohangPlan: null,
      pohangActual: null
    };
    let currentPlant = "";

    rows.forEach((cells) => {
      const metaTexts = cells
        .map(normalizeClipboardCell)
        .filter(Boolean)
        .filter((cell) => parseMonthHeader(cell) === null && parseClipboardNumber(cell) === null);
      if (!metaTexts.length) {
        return;
      }

      const metaText = metaTexts.join(" ");
      if (metaText.includes("인천")) {
        currentPlant = "incheon";
      } else if (metaText.includes("포항")) {
        currentPlant = "pohang";
      }

      const rowType = metaText.includes("계획") ? "Plan" : metaText.includes("실적") ? "Actual" : "";
      if (!currentPlant || !rowType) {
        return;
      }

      result[`${currentPlant}${rowType}`] = cells;
    });

    return result;
  }

  function extractPlanRowValues(cells, monthColumns) {
    if (!cells) {
      return null;
    }

    if (monthColumns) {
      const values = monthColumns.slice(0, 12).map(({ colIndex }) => parseClipboardNumber(cells[colIndex]));
      return values.every((value) => value !== null) ? values : null;
    }

    const numericValues = cells
      .map((cell) => parseClipboardNumber(cell))
      .filter((value) => value !== null);
    if (numericValues.length < 12) {
      return null;
    }
    return numericValues.slice(-12);
  }

  function buildPlanOverrideDataset(parsedRows) {
    let cumulativePlan = 0;
    let cumulativeActual = 0;
    const monthly = parsedRows.map((row, index) => {
      const plan = row.incheonPlan + row.pohangPlan;
      const actual = row.incheonActual + row.pohangActual;
      cumulativePlan += plan;
      cumulativeActual += actual;
      return {
        month: `${index + 1}월`,
        incheonPlan: row.incheonPlan,
        incheonActual: row.incheonActual,
        pohangPlan: row.pohangPlan,
        pohangActual: row.pohangActual,
        plan,
        actual,
        cumulativePlan,
        cumulativeActual,
        achievementRate: cumulativePlan ? (cumulativeActual / cumulativePlan) * 100 : 0
      };
    });

    return {
      pastedAt: new Date().toISOString(),
      monthly,
      chart: {
        labels: monthly.map((row) => row.month),
        plan: monthly.map((row) => row.plan),
        actual: monthly.map((row) => row.actual)
      }
    };
  }

  function parsePlanPasteText(rawText) {
    const rows = rawText
      .split(/\r?\n/)
      .map((line) => line.split("\t").map(normalizeClipboardCell))
      .filter((cells) => cells.some(Boolean));

    if (!rows.length) {
      throw new Error("붙여넣은 내용이 없습니다.");
    }

    const monthColumns = extractMonthColumns(rows);
    if (monthColumns) {
      const orderedMonths = monthColumns.slice(0, 12).map((item) => item.month);
      const validMonths =
        orderedMonths.length === 12 && orderedMonths.every((month, index) => month === index + 1);
      if (!validMonths) {
        throw new Error("월 헤더에서 1월부터 12월까지를 찾지 못했습니다.");
      }
    }

    const identifiedRows = identifyPlanPasteRows(rows);
    const missingRows = [
      !identifiedRows.incheonPlan && "인천 계획",
      !identifiedRows.incheonActual && "인천 실적",
      !identifiedRows.pohangPlan && "포항 계획",
      !identifiedRows.pohangActual && "포항 실적"
    ].filter(Boolean);

    if (missingRows.length) {
      const numericRows = rows
        .map((cells) => cells.map((cell) => parseClipboardNumber(cell)).filter((value) => value !== null))
        .filter((values) => values.length >= 12)
        .slice(0, 4);
      if (numericRows.length === 4) {
        return buildPlanOverrideDataset(
          Array.from({ length: 12 }, (_, index) => ({
            incheonPlan: numericRows[0][index],
            incheonActual: numericRows[1][index],
            pohangPlan: numericRows[2][index],
            pohangActual: numericRows[3][index]
          }))
        );
      }
      throw new Error(`${missingRows.join(", ")} 행을 찾지 못했습니다.`);
    }

    const incheonPlan = extractPlanRowValues(identifiedRows.incheonPlan, monthColumns);
    const incheonActual = extractPlanRowValues(identifiedRows.incheonActual, monthColumns);
    const pohangPlan = extractPlanRowValues(identifiedRows.pohangPlan, monthColumns);
    const pohangActual = extractPlanRowValues(identifiedRows.pohangActual, monthColumns);

    if (!incheonPlan || !incheonActual || !pohangPlan || !pohangActual) {
      throw new Error("월별 수량 12개를 정확히 읽지 못했습니다. 엑셀 범위를 다시 확인해주세요.");
    }

    return buildPlanOverrideDataset(
      Array.from({ length: 12 }, (_, index) => ({
        incheonPlan: incheonPlan[index],
        incheonActual: incheonActual[index],
        pohangPlan: pohangPlan[index],
        pohangActual: pohangActual[index]
      }))
    );
  }

  function normalizePlanOverrideData(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.monthly) || !payload.chart) {
      return null;
    }

    const monthly = payload.monthly.map((row, index) => {
      const month = normalizeClipboardCell(row.month) || `${index + 1}월`;
      const numericKeys = [
        "incheonPlan",
        "incheonActual",
        "pohangPlan",
        "pohangActual",
        "plan",
        "actual",
        "cumulativePlan",
        "cumulativeActual",
        "achievementRate"
      ];
      const normalizedRow = { month };
      for (const key of numericKeys) {
        const value = Number(row[key]);
        if (!Number.isFinite(value)) {
          return null;
        }
        normalizedRow[key] = value;
      }
      return normalizedRow;
    });

    if (monthly.length !== 12 || monthly.some((row) => !row)) {
      return null;
    }

    return {
      pastedAt: payload.pastedAt || new Date().toISOString(),
      monthly,
      chart: {
        labels: monthly.map((row) => row.month),
        plan: monthly.map((row) => row.plan),
        actual: monthly.map((row) => row.actual)
      }
    };
  }

  function loadPlanOverride() {
    try {
      const raw = localStorage.getItem(PLAN_PASTE_STORAGE_KEY);
      if (!raw) {
        state.planOverrides = {};
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        state.planOverrides = {};
        localStorage.removeItem(PLAN_PASTE_STORAGE_KEY);
        return;
      }
      state.planOverrides = Object.fromEntries(
        Object.entries(parsed)
          .map(([year, dataset]) => [String(year), normalizePlanOverrideData(dataset)])
          .filter(([, dataset]) => dataset)
      );
    } catch {
      localStorage.removeItem(PLAN_PASTE_STORAGE_KEY);
      state.planOverrides = {};
    }
  }

  function savePlanOverride(dataset) {
    state.planOverrides[getSelectedYear()] = dataset;
    localStorage.setItem(PLAN_PASTE_STORAGE_KEY, JSON.stringify(state.planOverrides));
  }

  function clearPlanOverride() {
    delete state.planOverrides[getSelectedYear()];
    if (Object.keys(state.planOverrides).length) {
      localStorage.setItem(PLAN_PASTE_STORAGE_KEY, JSON.stringify(state.planOverrides));
      return;
    }
    localStorage.removeItem(PLAN_PASTE_STORAGE_KEY);
  }

  function getPlanPasteCell(rowKey, monthIndex) {
    return document.querySelector(
      `.plan-paste-cell[data-row="${rowKey}"][data-month="${monthIndex}"]`
    );
  }

  function setPlanPasteCellValue(rowKey, monthIndex, value) {
    const input = getPlanPasteCell(rowKey, monthIndex);
    if (!input) {
      return;
    }
    const hasValue = Number.isFinite(value);
    input.value = hasValue ? formatNumber(value) : "";
    input.classList.toggle("has-value", hasValue);
  }

  function fillPlanPasteGrid(dataset) {
    if (!dataset || !Array.isArray(dataset.monthly)) {
      return;
    }
    dataset.monthly.forEach((row, monthIndex) => {
      setPlanPasteCellValue("incheonPlan", monthIndex, row.incheonPlan);
      setPlanPasteCellValue("incheonActual", monthIndex, row.incheonActual);
      setPlanPasteCellValue("pohangPlan", monthIndex, row.pohangPlan);
      setPlanPasteCellValue("pohangActual", monthIndex, row.pohangActual);
    });
  }

  function clearPlanPasteGrid() {
    document.querySelectorAll(".plan-paste-cell").forEach((input) => {
      input.value = "";
      input.classList.remove("has-value");
    });
  }

  function readPlanPasteGrid() {
    const gridValues = {
      incheonPlan: [],
      incheonActual: [],
      pohangPlan: [],
      pohangActual: []
    };

    for (const rowKey of PLAN_GRID_ROWS) {
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const input = getPlanPasteCell(rowKey, monthIndex);
        const value = parseClipboardNumber(input ? input.value : "");
        if (value === null) {
          return {
            error: `${monthIndex + 1}월 ${rowKey === "incheonPlan"
              ? "인천 계획"
              : rowKey === "incheonActual"
                ? "인천 실적"
                : rowKey === "pohangPlan"
                  ? "포항 계획"
                  : "포항 실적"} 값이 비어 있습니다.`
          };
        }
        gridValues[rowKey].push(value);
      }
    }

    return buildPlanOverrideDataset(
      Array.from({ length: 12 }, (_, monthIndex) => ({
        incheonPlan: gridValues.incheonPlan[monthIndex],
        incheonActual: gridValues.incheonActual[monthIndex],
        pohangPlan: gridValues.pohangPlan[monthIndex],
        pohangActual: gridValues.pohangActual[monthIndex]
      }))
    );
  }

  function markPlanPasteCell(input) {
    if (!input) {
      return;
    }
    const parsed = parseClipboardNumber(input.value);
    if (parsed === null) {
      input.value = "";
      input.classList.remove("has-value");
      return;
    }
    input.value = formatNumber(parsed);
    input.classList.add("has-value");
  }

  function updatePlanPasteStatus() {
    const status = document.getElementById("planPasteStatus");
    if (!status) {
      return;
    }

    const activeOverride = state.planOverrides[getSelectedYear()];
    if (!activeOverride) {
      status.textContent = `${getSelectedYearLabel()} 기준 기본 수급계획 데이터를 사용 중입니다.`;
      return;
    }

    const pastedAt = new Date(activeOverride.pastedAt);
    status.textContent =
      `${getSelectedYearLabel()} 최근 붙여넣기 적용: ${pastedAt.toLocaleString("ko-KR")} | 인천/포항 계획·실적 4개 행을 월별 합산해 반영했습니다.`;
  }

  function applyPlanPasteInput() {
    const gridDataset = readPlanPasteGrid();
    if (gridDataset.error) {
      if (window.showToast) {
        window.showToast(gridDataset.error, "error");
      }
      return;
    }

    savePlanOverride(gridDataset);
    fillPlanPasteGrid(gridDataset);
    updatePlanPasteStatus();
    renderPlan();
    if (window.showToast) {
      window.showToast("그리드의 월별 계획/실적을 수급계획에 반영했습니다.", "success");
    }
  }

  function resetPlanPasteInput() {
    clearPlanPasteGrid();
    clearPlanOverride();
    updatePlanPasteStatus();
    renderPlan();
    if (window.showToast) {
      window.showToast("수급계획을 기본 데이터로 복원했습니다.", "success");
    }
  }

  function handlePlanGridPaste(event) {
    const rawText = event.clipboardData?.getData("text/plain")?.trim();
    if (!rawText) {
      return;
    }

    event.preventDefault();

    try {
      const parsed = parsePlanPasteText(rawText);
      fillPlanPasteGrid(parsed);
      const status = document.getElementById("planPasteStatus");
      if (status) {
        status.textContent = "붙여넣기 완료. 값이 그리드에 채워졌습니다. 붙여넣은 값 적용 버튼을 누르면 수급계획에 반영됩니다.";
      }
      if (window.showToast) {
        window.showToast("엑셀 값을 입력 그리드에 채웠습니다.", "success");
      }
    } catch (error) {
      if (window.showToast) {
        window.showToast(error.message || "엑셀 형식을 읽지 못했습니다.", "error");
      }
    }
  }

  function setupPlanPaste() {
    loadPlanOverride();
    const applyButton = document.getElementById("applyPlanPasteBtn");
    const resetButton = document.getElementById("resetPlanPasteBtn");
    const grid = document.getElementById("planPasteGrid");

    if (applyButton) {
      applyButton.addEventListener("click", applyPlanPasteInput);
    }
    if (resetButton) {
      resetButton.addEventListener("click", resetPlanPasteInput);
    }
    if (grid) {
      grid.addEventListener("paste", handlePlanGridPaste);
    }

    document.querySelectorAll(".plan-paste-cell").forEach((input) => {
      input.addEventListener("focus", () => input.select());
      input.addEventListener("blur", () => {
        markPlanPasteCell(input);
        const status = document.getElementById("planPasteStatus");
        if (status) {
          status.textContent = "그리드 값을 수정했습니다. 붙여넣은 값 적용 버튼을 누르면 수급계획에 반영됩니다.";
        }
      });
      input.addEventListener("input", () => {
        input.classList.toggle("has-value", Boolean(normalizeClipboardCell(input.value)));
        const status = document.getElementById("planPasteStatus");
        if (status) {
          status.textContent = "그리드 값을 수정했습니다. 붙여넣은 값 적용 버튼을 누르면 수급계획에 반영됩니다.";
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          input.blur();
        }
      });
    });

    syncPlanPasteGridForYear();
  }

  function syncPlanPasteGridForYear() {
    clearPlanPasteGrid();
    const activeOverride = state.planOverrides[getSelectedYear()];
    if (activeOverride) {
      fillPlanPasteGrid(activeOverride);
    }
    updatePlanPasteStatus();

    if (!activeOverride) {
      document.querySelectorAll(".plan-paste-cell").forEach((input) => {
        input.classList.remove("has-value");
      });
    }
  }

  function renderSupplierAdminTable() {
    const tbody = document.getElementById("supplierAdminTable");
    if (!tbody) {
      return;
    }

    const items = [...state.supplierAdminItems].sort((left, right) => left.code.localeCompare(right.code, "ko"));
    if (!items.length) {
      tbody.innerHTML = makeUnavailableRow(9, "등록된 거래처가 없습니다.");
      return;
    }

    tbody.innerHTML = items
      .map(
        (item) => `
          <tr>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td>${item.region}</td>
            <td>${item.owner}</td>
            <td>${item.phone}</td>
            <td class="text-right">${formatNumber(item.monthlyCapacity)}</td>
            <td class="text-right">${formatNumber(item.yearlySupply)}</td>
            <td><span class="${supplierAdminGradeClass(item.trustGrade)}">${item.trustGrade}</span></td>
            <td class="text-right">
              <div class="supplier-admin-performance">
                <div class="supplier-admin-performance-bar">
                  <div class="supplier-admin-performance-fill ${supplierPerformanceClass(item.performanceRate)}" style="width: ${Math.min(item.performanceRate, 100)}%"></div>
                </div>
                <span>${formatPercent(item.performanceRate, 0)}</span>
              </div>
            </td>
          </tr>
        `
      )
      .join("");

    applyTableSort(document.querySelector('table[data-export="suppliers"]'));
  }

  function resetSupplierForm() {
    document.getElementById("supplierFormTitle").textContent = "거래처 등록";
    document.getElementById("supplierCode").value = "";
    document.getElementById("supplierName").value = "";
    document.getElementById("supplierRegion").value = "";
    document.getElementById("supplierOwner").value = "";
    document.getElementById("supplierPhone").value = "";
    document.getElementById("supplierTrust").value = "A";
    document.getElementById("supplierMonthlyCapacity").value = "";
    document.getElementById("supplierYearlySupply").value = "";
  }

  function getNextSupplierCode() {
    const maxCode = state.supplierAdminItems.reduce((max, item) => {
      const num = Number(String(item.code).replace(/[^\d]/g, ""));
      return Number.isFinite(num) ? Math.max(max, num) : max;
    }, 0);
    return `S${String(maxCode + 1).padStart(3, "0")}`;
  }

  function openSupplierForm() {
    resetSupplierForm();
    document.getElementById("supplierCode").value = getNextSupplierCode();
    if (window.showModal) {
      window.showModal("supplierModal");
    }
  }

  function submitSupplier() {
    const item = normalizeSupplierAdminItem({
      code: document.getElementById("supplierCode").value,
      name: document.getElementById("supplierName").value,
      region: document.getElementById("supplierRegion").value,
      owner: document.getElementById("supplierOwner").value,
      phone: document.getElementById("supplierPhone").value,
      trustGrade: document.getElementById("supplierTrust").value,
      monthlyCapacity: document.getElementById("supplierMonthlyCapacity").value,
      yearlySupply: document.getElementById("supplierYearlySupply").value
    });

    if (!item || !item.region || !item.owner || !item.phone) {
      window.showToast?.("코드, 거래처명, 지역, 대표자, 연락처를 모두 입력해주세요.", "error");
      return;
    }

    if (state.supplierAdminItems.some((supplier) => supplier.code === item.code)) {
      window.showToast?.("이미 존재하는 거래처 코드입니다.", "error");
      return;
    }

    state.supplierAdminItems.push(item);
    saveSupplierAdminItems();
    renderSupplierAdminTable();
    renderPlan();
    window.hideModal?.("supplierModal");
    window.showToast?.("거래처가 등록되었습니다.", "success");
  }

  function setupSupplierAdmin() {
    loadSupplierAdminItems();
    renderSupplierAdminTable();

    const addButton = document.getElementById("supplierAddBtn");
    const submitButton = document.getElementById("supplierSubmitBtn");
    if (addButton) {
      addButton.addEventListener("click", openSupplierForm);
    }
    if (submitButton) {
      submitButton.addEventListener("click", submitSupplier);
    }
  }

  function setupSupplierFilters() {
    return;
  }

  function updateRawPasteStatus() {
    const status = document.getElementById("rawPasteStatus");
    if (!status) {
      return;
    }
    const rows = getRawTransactionsForYear();
    if (!rows.length) {
      status.textContent = `${getSelectedYearLabel()} 원본 실적 데이터가 아직 입력되지 않았습니다.`;
      return;
    }
    status.textContent = `${getSelectedYearLabel()} 원본 실적 ${formatNumber(rows.length)}건이 저장되어 있습니다. 거래처 추이, 구매실적, 등급/수입관리에 반영됩니다.`;
  }

  function createRawPasteGridRow(row = {}) {
    return `
      <tr>
        <td><input class="raw-paste-grid-input" data-key="date" value="${row.date || ""}"></td>
        <td><input class="raw-paste-grid-input" data-key="supplier" value="${row.supplier || ""}"></td>
        <td><input class="raw-paste-grid-input" data-key="detailedGrade" value="${row.detailedGrade || ""}"></td>
        <td><input class="raw-paste-grid-input text-right" data-key="unitPrice" value="${row.unitPrice ? formatNumber(row.unitPrice) : ""}"></td>
        <td><input class="raw-paste-grid-input text-right" data-key="amount" value="${row.amount ? formatNumber(row.amount) : ""}"></td>
      </tr>
    `;
  }

  function ensureRawPasteEmptyRows() {
    const body = document.getElementById("rawPasteGridBody");
    if (!body) {
      return;
    }
    const currentRows = body.querySelectorAll("tr").length;
    const targetRows = Math.max(18, currentRows);
    for (let index = currentRows; index < targetRows; index += 1) {
      body.insertAdjacentHTML("beforeend", createRawPasteGridRow());
    }
  }

  function syncRawPasteInputForYear() {
    const body = document.getElementById("rawPasteGridBody");
    if (!body) {
      return;
    }
    const rows = getRawTransactionsForYear();
    body.innerHTML = rows.map((row) => createRawPasteGridRow(row)).join("");
    ensureRawPasteEmptyRows();
    updateRawPasteStatus();
  }

  function readRawPasteGrid() {
    const body = document.getElementById("rawPasteGridBody");
    if (!body) {
      return [];
    }
    return [...body.querySelectorAll("tr")]
      .map((row) => {
        const cells = Object.fromEntries(
          [...row.querySelectorAll(".raw-paste-grid-input")].map((input) => [input.dataset.key, normalizeClipboardCell(input.value)])
        );
        if (!cells.date && !cells.supplier && !cells.detailedGrade && !cells.unitPrice && !cells.amount) {
          return null;
        }
        return {
          date: cells.date,
          supplier: cells.supplier,
          detailedGrade: cells.detailedGrade,
          unitPrice: parseClipboardNumber(cells.unitPrice),
          amount: parseClipboardNumber(cells.amount)
        };
      })
      .filter(Boolean);
  }

  function renderMappingGroups() {
    const container = document.getElementById("mappingGroups");
    if (!container) {
      return;
    }
    container.innerHTML = Object.entries(state.gradeMappings)
      .map(
        ([macro, items]) => `
          <div class="mapping-group">
            <div class="mapping-group-head">${macro}</div>
            <div class="mapping-chip-list">
              ${items.length
                ? items
                    .map(
                      (item) => `
                        <span class="mapping-chip">
                          ${item}
                          <button type="button" data-macro="${macro}" data-grade="${item}" class="mapping-delete-btn">삭제</button>
                        </span>
                      `
                    )
                    .join("")
                : '<span class="mapping-chip">매핑 없음</span>'}
            </div>
          </div>
        `
      )
      .join("");

    container.querySelectorAll(".mapping-delete-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const macro = button.dataset.macro;
        const grade = button.dataset.grade;
        state.gradeMappings[macro] = state.gradeMappings[macro].filter((item) => item !== grade);
        saveGradeMappings();
        renderMappingGroups();
        renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
      });
    });
  }

  function applyRawPasteInput() {
    try {
      const gridRows = readRawPasteGrid();
      const rawText = gridRows
        .map((row) => [row.date, row.supplier, row.detailedGrade, row.unitPrice || "", row.amount || ""].join("\t"))
        .join("\n");
      const parsed = parseRawTransactionText(rawText);
      state.rawTransactionsByYear[getSelectedYear()] = parsed;
      saveRawTransactions();
      syncRawPasteInputForYear();
      updateRawPasteStatus();
      renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
      window.showToast?.("원본 실적 데이터를 반영했습니다.", "success");
    } catch (error) {
      window.showToast?.(error.message || "원본 실적 데이터를 읽지 못했습니다.", "error");
    }
  }

  function resetRawPasteInput() {
    delete state.rawTransactionsByYear[getSelectedYear()];
    saveRawTransactions();
    syncRawPasteInputForYear();
    renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
    window.showToast?.("선택 연도의 원본 실적 데이터를 초기화했습니다.", "success");
  }

  function setupMasterData() {
    loadGradeMappings();
    loadRawTransactions();
    renderMappingGroups();
    syncRawPasteInputForYear();

    const addMappingButton = document.getElementById("addMappingBtn");
    const applyRawButton = document.getElementById("applyRawPasteBtn");
    const resetRawButton = document.getElementById("resetRawPasteBtn");

    addMappingButton?.addEventListener("click", () => {
      const macro = document.getElementById("mappingMacroCategory").value;
      const gradeName = normalizeClipboardCell(document.getElementById("mappingGradeName").value);
      if (!gradeName) {
        window.showToast?.("상세 검수등급명을 입력해주세요.", "error");
        return;
      }
      if (!state.gradeMappings[macro].includes(gradeName)) {
        state.gradeMappings[macro].push(gradeName);
        state.gradeMappings[macro].sort((left, right) => left.localeCompare(right, "ko"));
        saveGradeMappings();
        renderMappingGroups();
        document.getElementById("mappingGradeName").value = "";
        renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
        window.showToast?.("매핑을 추가했습니다.", "success");
      }
    });

    applyRawButton?.addEventListener("click", applyRawPasteInput);
    resetRawButton?.addEventListener("click", resetRawPasteInput);

    const grid = document.getElementById("rawPasteGrid");
    grid?.addEventListener("paste", (event) => {
      const rawText = event.clipboardData?.getData("text/plain")?.trim();
      if (!rawText) {
        return;
      }
      event.preventDefault();
      const rows = rawText
        .split(/\r?\n/)
        .map((line) => line.split("\t").map((cell) => normalizeClipboardCell(cell)))
        .filter((cells) => cells.some(Boolean));
      const body = document.getElementById("rawPasteGridBody");
      if (!body) {
        return;
      }
      body.innerHTML = rows
        .map((cells) =>
          createRawPasteGridRow({
            date: cells[0] || "",
            supplier: cells[1] || "",
            detailedGrade: cells[2] || "",
            unitPrice: parseClipboardNumber(cells[3] || ""),
            amount: parseClipboardNumber(cells[4] || "")
          })
        )
        .join("");
      ensureRawPasteEmptyRows();
      updateRawPasteStatus();
      window.showToast?.("엑셀 값을 입력 그리드에 붙여넣었습니다. 필요한 셀은 직접 수정할 수 있습니다.", "success");
    });

    grid?.addEventListener("focusout", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains("raw-paste-grid-input")) {
        return;
      }
      if (input.dataset.key === "unitPrice" || input.dataset.key === "amount") {
        const parsed = parseClipboardNumber(input.value);
        input.value = parsed === null ? "" : formatNumber(parsed);
      }
    });
  }

  function readStoredUsers() {
    try {
      const raw = localStorage.getItem("usersData");
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.data) ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function getUserDisplayText() {
    const storedUser = sessionStorage.getItem("loggedInUser");
    if (!storedUser) {
      return DEFAULT_USER_DISPLAY;
    }
    if (storedUser === LEGACY_USER_DISPLAY) {
      sessionStorage.setItem("loggedInUser", DEFAULT_USER_DISPLAY);
      return DEFAULT_USER_DISPLAY;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser && typeof parsedUser === "object") {
        const users = readStoredUsers();
        const matchedUser = Array.isArray(users)
          ? users.find((user) => user.id === parsedUser.id)
          : null;
        if (matchedUser) {
          const dept = matchedUser.dept || "원료기획팀";
          const position = matchedUser.position ? ` ${matchedUser.position}` : "";
          return `동국제강 ${dept} | ${matchedUser.name}${position}님`;
        }

        const dept = typeof parsedUser.dept === "string" && parsedUser.dept.trim()
          ? parsedUser.dept.trim()
          : "원료기획팀";
        const name = typeof parsedUser.name === "string" ? parsedUser.name.trim() : "";
        if (name) {
          return `동국제강 ${dept} | ${name.endsWith("님") ? name : `${name}님`}`;
        }
      }
    } catch {
      // Legacy plain-string session values are handled by the fallback below.
    }

    return storedUser;
  }

  function setDateAndUser() {
    const date = new Date();
    document.getElementById("currentDate").textContent = date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    });
    document.getElementById("userDisplay").textContent = getUserDisplayText();
  }

  function setBanner() {
    const generatedAt = new Date(data.meta.generatedAt);
    const selectedYearData = getSelectedYearData();
    const availableSections = ["plan", "suppliers", "purchases", "allocation", "gradeImport"].filter(
      (key) => selectedYearData?.[key]
    );
    document.getElementById("dataBanner").innerHTML = `
      <strong>분석 기준</strong><br>
      조회 연도: ${getSelectedYearLabel()}<br>
      대상 조직: 동국제강 원료기획팀<br>
      원본 파일: 첨부 엑셀 및 요청 슬라이드 기준<br>
      생성 시각: ${generatedAt.toLocaleString("ko-KR")}<br>
      가용 데이터: ${availableSections.length ? availableSections.join(", ") : "없음"}<br>
      ${data.meta.displayNote}
    `;
    document.getElementById("footerNote").textContent =
      "참고 사이트의 헤더/탭/카드/차트 스타일을 유지하고, 첨부 파일에 없는 거래처 메타 정보는 raw data 기반 파생 지표로 대체했습니다.";
  }

  function setupYearSelector() {
    const selector = document.getElementById("yearSelector");
    if (!selector) {
      return;
    }
    selector.innerHTML = getAvailableYears()
      .map((year) => `<option value="${year}">${year}년</option>`)
      .join("");
    selector.value = getSelectedYear();

    selector.addEventListener("change", (event) => {
      state.selectedYear = event.target.value;
      syncPlanPasteGridForYear();
      syncRawPasteInputForYear();
      setBanner();
      renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
    });
  }

  function renderPlan() {
    const planData = getActivePlanData();
    const suppliersData = getSuppliersData();
    const supplierAdminAveragePerformance = getSupplierAdminAveragePerformance();
    document.getElementById("planDetailHint").textContent =
      `${getSelectedYearLabel()} 기준 월간 목표, 월 실적, 누계 달성률을 계산합니다.`;

    if (!planData?.monthly?.length) {
      document.getElementById("planKpis").innerHTML = [
        kpiCard("연도 상태", `${getSelectedYearLabel()}<small></small>`, "수급계획 데이터가 없습니다.", ""),
        kpiCard("입력 안내", "엑셀 붙여넣기<small></small>", "상단 입력 패널로 해당 연도 데이터를 직접 반영할 수 있습니다.", "accent")
      ].join("");
      document.getElementById("planLatestRate").innerHTML = `<strong>${getSelectedYearLabel()}</strong> 데이터 없음`;
      document.getElementById("planHighlights").innerHTML = `<div class="empty-state">${getSelectedYearLabel()} 수급계획 데이터가 없습니다.</div>`;
      document.getElementById("planTable").innerHTML = makeUnavailableRow(6, `${getSelectedYearLabel()} 수급계획 데이터가 없습니다.`);
      setEmptyChartMessage("planChart", `${getSelectedYearLabel()} 차트 데이터가 없습니다.`);
      setEmptyChartMessage("supplierTrendChart", `${getSelectedYearLabel()} 거래처 추이 데이터가 없습니다.`);
      return;
    }

    clearEmptyChartMessage("planChart");
    const planRows = planData.monthly;
    const annualTarget = planRows.reduce((sum, row) => sum + row.plan, 0);
    const cumulativeActual = planRows[planRows.length - 1].cumulativeActual;
    const attainmentRate = planRows[planRows.length - 1].achievementRate;
    const bestMonth = [...planRows].sort((left, right) => right.actual - left.actual)[0];
    const weakestMonth = [...planRows].sort(
      (left, right) => left.achievementRate - right.achievementRate
    )[0];
    const underTargetCount = planRows.filter((row) => row.actual < row.plan).length;

    document.getElementById("planKpis").innerHTML = [
      kpiCard(
        "연간 목표",
        `${formatCompact(annualTarget)}<small>톤</small>`,
        state.planOverrides[getSelectedYear()]
          ? `${getSelectedYearLabel()} 엑셀 복붙 기준 연간 계획 합계`
          : `${getSelectedYearLabel()} 연간 계획 합계`,
        ""
      ),
      kpiCard(
        "누계 실적",
        `${formatCompact(cumulativeActual)}<small>톤</small>${getComparisonIndicator(cumulativeActual, annualTarget)}`,
        state.planOverrides[getSelectedYear()] ? "붙여넣은 실적 누계" : `${getSelectedYearLabel()} 실적 누계`,
        "accent"
      ),
      kpiCard(
        "계획 대비 달성률",
        `${formatPercent(attainmentRate, 1)}<small></small>${getAttainmentIndicator(attainmentRate)}`,
        "월 누계 계획 대비 누계 실적",
        "success"
      ),
      kpiCard(
        "거래처 평균 성과율",
        `${formatPercent(supplierAdminAveragePerformance, 1)}<small></small>`,
        "거래처 관리 표의 납품실적% 평균",
        "warning"
      )
    ].join("");

    document.getElementById("planLatestRate").innerHTML = `<strong>${planRows[planRows.length - 1].month} 누계</strong> ${formatPercent(
      planRows[planRows.length - 1].achievementRate,
      1
    )}`;

    const monthlyGap = bestMonth.actual - bestMonth.plan;
    const weakestGap = weakestMonth.actual - weakestMonth.plan;
    document.getElementById("planHighlights").innerHTML = [
      miniStat(
        "상단 변동 월",
        `${bestMonth.month} 실적이 가장 높고 계획 대비 ${formatCompact(monthlyGap)}톤 차이입니다.`,
        `${formatCompact(bestMonth.actual)}톤`
      ),
      miniStat(
        "주의 구간",
        `${weakestMonth.month} 누계 달성률이 가장 낮고 계획 대비 ${formatCompact(weakestGap)}톤 부족합니다.`,
        formatPercent(weakestMonth.achievementRate, 1)
      ),
      miniStat(
        "계획 미달 월",
        "월 실적이 계획보다 낮았던 구간 수입니다.",
        `${underTargetCount}개월`
      ),
      miniStat(
        "최종 누계 상태",
        `${planRows[planRows.length - 1].month} 누계 기준 최종 달성률입니다.`,
        formatPercent(planRows[planRows.length - 1].achievementRate, 1)
      )
    ].join("");

    document.getElementById("planTable").innerHTML = planRows
      .map(
        (row) => `
          <tr>
            <td>${row.month}</td>
            <td class="text-right">${formatNumber(row.plan)}</td>
            <td class="text-right">${formatNumber(row.actual)}</td>
            <td class="text-right">${formatNumber(row.cumulativePlan)}</td>
            <td class="text-right">${formatNumber(row.cumulativeActual)}</td>
            <td class="text-right">${formatPercent(row.achievementRate, 2)}</td>
          </tr>
        `
      )
      .join("");
    applyTableSort(document.querySelector('table[data-export="plan"]'));

    makeBarChart("planChart", "planChart", {
      type: "bar",
      data: {
        labels: planData.chart.labels,
        datasets: [
          {
            label: "실적",
            data: planData.chart.actual,
            backgroundColor: "rgba(255, 143, 0, 0.72)",
            borderColor: colors.accent,
            borderRadius: 8,
            order: 1
          },
          {
            label: "계획",
            data: planData.chart.plan,
            backgroundColor: "rgba(26, 35, 126, 0.1)",
            borderColor: colors.primary,
            borderWidth: 2,
            borderRadius: 8,
            order: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          tooltip: { mode: "index", intersect: false },
          valueLabelPlugin: { enabled: true, format: "number" }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: (value) => formatCompact(value)
            }
          }
        }
      }
    });

    if (!suppliersData?.trendChart?.series?.length) {
      setEmptyChartMessage("supplierTrendChart", `${getSelectedYearLabel()} 거래처 추이 데이터가 없습니다.`);
      return;
    }

    clearEmptyChartMessage("supplierTrendChart");
    makeBarChart("supplierTrendChart", "supplierTrendChart", {
      type: "line",
      data: {
        labels: suppliersData.trendChart.labels,
        datasets: suppliersData.trendChart.series.map((series, index) => {
          const palette = [colors.blue, colors.accent, colors.success];
          return {
            label: series.name,
            data: series.data,
            borderColor: palette[index],
            backgroundColor: `${palette[index]}22`,
            pointRadius: 4,
            pointHoverRadius: 5,
            pointBackgroundColor: "#ffffff",
            pointBorderColor: palette[index],
            pointBorderWidth: 2,
            borderWidth: 3,
            tension: 0.35,
            fill: true
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              boxWidth: 36,
              boxHeight: 12,
              usePointStyle: false,
              padding: 14
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: "rgba(148, 163, 184, 0.18)"
            }
          },
          y: {
            grid: {
              color: "rgba(148, 163, 184, 0.18)"
            },
            ticks: {
              callback: (value) => formatNumber(value)
            }
          }
        }
      }
    });
  }

  function renderPurchases() {
    const purchasesData = getPurchasesData();
    document.getElementById("purchaseDetailHint").textContent =
      `${getSelectedYearLabel()} 월별 입고량/입고금액 raw data 합계입니다.`;

    if (!purchasesData?.monthly?.length) {
      document.getElementById("purchaseKpis").innerHTML = kpiCard(
        "연도 상태",
        `${getSelectedYearLabel()}<small></small>`,
        "구매실적 데이터가 없습니다.",
        ""
      );
      document.getElementById("purchaseHighlights").innerHTML = `<div class="empty-state">${getSelectedYearLabel()} 구매실적 데이터가 없습니다.</div>`;
      document.getElementById("purchaseTable").innerHTML = makeUnavailableRow(5, `${getSelectedYearLabel()} 구매실적 데이터가 없습니다.`);
      setEmptyChartMessage("purchaseTrendChart", `${getSelectedYearLabel()} 구매 추이 데이터가 없습니다.`);
      return;
    }

    clearEmptyChartMessage("purchaseTrendChart");
    const monthly = purchasesData.monthly;
    const peakMonth = [...monthly].sort((left, right) => right.qty - left.qty)[0];
    const lowMonth = [...monthly].sort((left, right) => left.qty - right.qty)[0];
    const highestPrice = [...monthly].sort((left, right) => right.avgUnitPrice - left.avgUnitPrice)[0];
    const lowestPrice = [...monthly].sort((left, right) => left.avgUnitPrice - right.avgUnitPrice)[0];
    const averageSupplierCount =
      monthly.reduce((sum, row) => sum + row.supplierCount, 0) / monthly.length;

    document.getElementById("purchaseKpis").innerHTML = [
      kpiCard("누계 구매량", `${purchasesData.totalQtyDisplay}<small></small>`, `${getSelectedYearLabel()} 구매량의 합`, ""),
      kpiCard(
        "누계 입고금액",
        `${purchasesData.totalAmountDisplay}<small></small>`,
        "4번 화면 금액의 누계",
        "accent"
      ),
      kpiCard(
        "평균 매입 단가",
        `${purchasesData.avgUnitPriceDisplay}<small></small>`,
        "누계 구매량 / 누계 입고금액",
        "success"
      ),
      kpiCard(
        "월 평균 거래처 수",
        `${formatNumber(averageSupplierCount, 1)}<small>곳</small>`,
        `${getSelectedYearLabel()} 월별 raw data 기준`,
        "warning"
      )
    ].join("");

    document.getElementById("purchaseHighlights").innerHTML = [
      miniStat("최대 구매량 월", `${peakMonth.month} raw data 합계`, formatCompact(peakMonth.qty)),
      miniStat("최소 구매량 월", `${lowMonth.month} raw data 합계`, formatCompact(lowMonth.qty)),
      miniStat(
        "최고 평균 단가",
        `${highestPrice.month} 월 평균 단가`,
        formatNumber(highestPrice.avgUnitPrice, 1)
      ),
      miniStat(
        "최저 평균 단가",
        `${lowestPrice.month} 월 평균 단가`,
        formatNumber(lowestPrice.avgUnitPrice, 1)
      )
    ].join("");

    document.getElementById("purchaseTable").innerHTML = monthly
      .map(
        (row) => `
          <tr>
            <td>${row.month}</td>
            <td class="text-right">${formatNumber(row.qty)}</td>
            <td class="text-right">${formatNumber(row.amount)}</td>
            <td class="text-right">${formatNumber(row.avgUnitPrice, 1)}</td>
            <td class="text-right">${formatNumber(row.supplierCount)}</td>
          </tr>
        `
      )
      .join("");
    applyTableSort(document.querySelector('table[data-export="purchases"]'));

    makeBarChart("purchaseTrendChart", "purchaseTrendChart", {
      type: "bar",
      data: {
        labels: monthly.map((row) => row.month),
        datasets: [
          {
            type: "bar",
            label: "구매량",
            data: monthly.map((row) => row.qty),
            backgroundColor: "rgba(94, 53, 177, 0.72)",
            borderRadius: 8,
            yAxisID: "y"
          },
          {
            type: "line",
            label: "입고금액",
            data: monthly.map((row) => row.amount),
            borderColor: colors.accent,
            backgroundColor: colors.accent,
            pointRadius: 4,
            pointHoverRadius: 4,
            tension: 0.25,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" }
        },
        scales: {
          y: {
            position: "left",
            ticks: {
              callback: (value) => formatCompact(value)
            }
          },
          y1: {
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: {
              callback: (value) => formatCompact(value)
            }
          }
        }
      }
    });
  }

  function renderAllocation() {
    const allocation = getSectionData("allocation");
    if (!allocation?.monthly?.length) {
      document.getElementById("allocationKpis").innerHTML = kpiCard(
        "연도 상태",
        `${getSelectedYearLabel()}<small></small>`,
        "공장배분 데이터가 없습니다.",
        ""
      );
      document.getElementById("incheonRatePill").innerHTML = `<strong>${getSelectedYearLabel()}</strong> 데이터 없음`;
      document.getElementById("pohangRatePill").innerHTML = `<strong>${getSelectedYearLabel()}</strong> 데이터 없음`;
      document.getElementById("allocationTable").innerHTML = makeUnavailableRow(7, `${getSelectedYearLabel()} 공장배분 데이터가 없습니다.`);
      setEmptyChartMessage("incheonAllocationChart", `${getSelectedYearLabel()} 인천공장 배분 데이터가 없습니다.`);
      setEmptyChartMessage("pohangAllocationChart", `${getSelectedYearLabel()} 포항공장 배분 데이터가 없습니다.`);
      return;
    }

    clearEmptyChartMessage("incheonAllocationChart");
    clearEmptyChartMessage("pohangAllocationChart");
    document.getElementById("allocationKpis").innerHTML = [
      kpiCard(
        "인천 계획/실적",
        `${formatCompact(allocation.incheon.planTotal)}<small> / ${formatCompact(
          allocation.incheon.actualTotal
        )}</small>`,
        `${getSelectedYearLabel()} 인천공장 연간 합계`,
        ""
      ),
      kpiCard(
        "인천 달성률",
        `${formatPercent(allocation.incheon.achievementRate, 1)}<small></small>`,
        "계획 대비 누계 실적",
        "accent"
      ),
      kpiCard(
        "포항 계획/실적",
        `${formatCompact(allocation.pohang.planTotal)}<small> / ${formatCompact(
          allocation.pohang.actualTotal
        )}</small>`,
        `${getSelectedYearLabel()} 포항공장 연간 합계`,
        "success"
      ),
      kpiCard(
        "포항 달성률",
        `${formatPercent(allocation.pohang.achievementRate, 1)}<small></small>`,
        "계획 대비 누계 실적",
        "warning"
      )
    ].join("");

    document.getElementById("incheonRatePill").innerHTML = `<strong>달성률</strong> ${formatPercent(
      allocation.incheon.achievementRate,
      1
    )}`;
    document.getElementById("pohangRatePill").innerHTML = `<strong>달성률</strong> ${formatPercent(
      allocation.pohang.achievementRate,
      1
    )}`;

    const incheonProgress = document.getElementById("incheonProgress");
    incheonProgress.style.width = `${Math.min(allocation.incheon.achievementRate, 100)}%`;
    incheonProgress.textContent = formatPercent(allocation.incheon.achievementRate, 1);

    const pohangProgress = document.getElementById("pohangProgress");
    pohangProgress.style.width = `${Math.min(allocation.pohang.achievementRate, 100)}%`;
    pohangProgress.textContent = formatPercent(allocation.pohang.achievementRate, 1);

    document.getElementById("allocationTable").innerHTML = allocation.monthly
      .map(
        (row) => `
          <tr>
            <td>${row.month}</td>
            <td class="text-right">${formatNumber(row.incheonPlan)}</td>
            <td class="text-right">${formatNumber(row.incheonActual)}</td>
            <td class="text-right">${formatPercent(row.incheonRate, 2)}</td>
            <td class="text-right">${formatNumber(row.pohangPlan)}</td>
            <td class="text-right">${formatNumber(row.pohangActual)}</td>
            <td class="text-right">${formatPercent(row.pohangRate, 2)}</td>
          </tr>
        `
      )
      .join("");
    applyTableSort(document.querySelector('table[data-export="allocation"]'));

    const makeAllocationChart = (key, canvasId, gradeMix, palette) => {
      makeBarChart(key, canvasId, {
        type: "doughnut",
        data: {
          labels: gradeMix.map((item) => item.name),
          datasets: [
            {
              data: gradeMix.map((item) => item.share),
              backgroundColor: palette,
              borderColor: "#ffffff",
              borderWidth: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "54%",
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                label: (context) =>
                  `${context.label}: ${formatPercent(context.raw, 1)} / ${formatNumber(
                    gradeMix[context.dataIndex].qty
                  )}`
              }
            },
            valueLabelPlugin: {
              enabled: false
            }
          }
        }
      });
    };

    makeAllocationChart(
      "incheonAllocationChart",
      "incheonAllocationChart",
      allocation.incheon.gradeMix,
      [colors.blue, colors.primaryLight, colors.lightBlue, colors.slate]
    );
    makeAllocationChart(
      "pohangAllocationChart",
      "pohangAllocationChart",
      allocation.pohang.gradeMix,
      [colors.accent, colors.accentLight, "#f6bf69", "#ffe0b2"]
    );
  }

  function renderGradeImport() {
    const gradeData = getGradeImportData();
    if (!gradeData?.comparisonTable?.length) {
      document.getElementById("gradeImportKpis").innerHTML = kpiCard(
        "연도 상태",
        `${getSelectedYearLabel()}<small></small>`,
        "등급/수입 비교 데이터가 없습니다.",
        ""
      );
      document.getElementById("gradeImportTable").innerHTML = makeUnavailableRow(6, `${getSelectedYearLabel()} 등급/수입 비교 데이터가 없습니다.`);
      setEmptyChartMessage("gradeMixChart", `${getSelectedYearLabel()} 등급 비중 비교 데이터가 없습니다.`);
      setEmptyChartMessage("gradeRatioChart", `${getSelectedYearLabel()} 집중 등급 비율 데이터가 없습니다.`);
      return;
    }

    clearEmptyChartMessage("gradeMixChart");
    clearEmptyChartMessage("gradeRatioChart");
    document.getElementById("gradeImportTitle").textContent = `${gradeData.currentYear} / ${gradeData.compareYear} 등급별 비교`;
    document.getElementById("gradeImportHint").textContent =
      `${gradeData.currentYear}년을 기준으로 ${gradeData.compareYear}년과 비교한 거시 등급 데이터입니다.`;
    document.getElementById("gradeImportCurrentQtyHeader").textContent = `${gradeData.currentYear} 입고량`;
    document.getElementById("gradeImportCurrentShareHeader").textContent = `${gradeData.currentYear} 비중`;
    document.getElementById("gradeImportCompareQtyHeader").textContent = `${gradeData.compareYear} 입고량`;
    document.getElementById("gradeImportCompareShareHeader").textContent = `${gradeData.compareYear} 비중`;

    const primaryCategory = [...gradeData.mix].sort((left, right) => right.qty - left.qty)[0];
    const deltaClass = gradeData.deltaShare >= 0 ? "up" : "down";

    document.getElementById("gradeImportKpis").innerHTML = [
      kpiCard(
        "국고하 + 선반설 비율",
        `${formatPercent(gradeData.lowTurningRatio, 2)}<small></small>`,
        `${gradeData.currentYear} raw data 기준`,
        ""
      ),
      kpiCard(
        "전년도 동일 비율",
        `${formatPercent(gradeData.compareLowTurningRatio, 2)}<small></small>`,
        `${gradeData.compareYear} raw data 기준`,
        "accent"
      ),
      kpiCard(
        "전년 대비 증감",
        `${formatNumber(gradeData.deltaShare, 2)}<small>%p</small>`,
        `요청 슬라이드의 증감 지표 <span class="${deltaClass}">${
          gradeData.deltaShare >= 0 ? "상승" : "하락"
        }</span>`,
        "success"
      ),
      kpiCard(
        "주력 등급",
        `${primaryCategory.name}<small></small>`,
        `${gradeData.currentYear} 비중 ${formatPercent(primaryCategory.share, 2)}`,
        "warning"
      )
    ].join("");

    document.getElementById("gradeImportTable").innerHTML = gradeData.comparisonTable
      .map(
        (row) => `
          <tr>
            <td>${row.category}</td>
            <td class="text-right">${formatNumber(row.currentQty)}</td>
            <td class="text-right">${formatPercent(row.currentShare, 2)}</td>
            <td class="text-right">${formatNumber(row.compareQty)}</td>
            <td class="text-right">${formatPercent(row.compareShare, 2)}</td>
            <td class="text-right">${formatPercent(row.diffShare, 2)}</td>
          </tr>
        `
      )
      .join("");
    applyTableSort(document.querySelector('table[data-export="gradeImport"]'));

    makeBarChart("gradeMixChart", "gradeMixChart", {
      type: "bar",
      data: {
        labels: gradeData.comparisonTable.map((row) => row.category),
        datasets: [
          {
            label: `${gradeData.currentYear} 비중`,
            data: gradeData.comparisonTable.map((row) => row.currentShare),
            backgroundColor: "rgba(26, 35, 126, 0.72)",
            borderRadius: 8
          },
          {
            label: `${gradeData.compareYear} 비중`,
            data: gradeData.comparisonTable.map((row) => row.compareShare),
            backgroundColor: "rgba(255, 143, 0, 0.72)",
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          valueLabelPlugin: { enabled: true, format: "percent" }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        }
      }
    });

    makeBarChart("gradeRatioChart", "gradeRatioChart", {
      type: "line",
      data: {
        labels: gradeData.monthlyFocusedRatio.map((row) => row.month),
        datasets: [
          {
            label: `${gradeData.currentYear} 비율`,
            data: gradeData.monthlyFocusedRatio.map((row) => row.ratio),
            borderColor: colors.primary,
            backgroundColor: "rgba(26, 35, 126, 0.15)",
            pointRadius: 4,
            tension: 0.25
          },
          {
            label: `${gradeData.compareYear} 비율`,
            data: gradeData.compareMonthlyFocusedRatio.map((row) => row.ratio),
            borderColor: colors.accent,
            backgroundColor: "rgba(255, 143, 0, 0.15)",
            pointRadius: 4,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        }
      }
    });
  }

  function renderActiveTab(tabName) {
    if (tabName === "plan") {
      renderPlan();
      return;
    }
    if (tabName === "purchases") {
      renderPurchases();
      return;
    }
    if (tabName === "allocation") {
      renderAllocation();
      return;
    }
    if (tabName === "gradeImport") {
      renderGradeImport();
      return;
    }
    if (tabName === "notice") {
      if (window.adminFeatures) {
        window.adminFeatures.renderNotices();
        window.adminFeatures.renderCalendar();
      }
      return;
    }
    if (tabName === "user") {
      if (window.adminFeatures) {
        window.adminFeatures.loadUsersFromStorage();
        window.adminFeatures.renderUsers();
      }
      setDateAndUser();
    }
  }

  function setActiveTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-content").forEach((section) => {
      section.classList.toggle("active", section.id === `tab-${tabName}`);
    });
    history.replaceState(null, "", `#${tabName}`);
    requestAnimationFrame(() => {
      requestAnimationFrame(refreshCharts);
    });
  }

  /* ── DOCX 보고서 내보내기 ── */

  function docxSpacer() {
    return new docx.Paragraph({ spacing: { after: 120 } });
  }

  function docxSubHeading(text) {
    return new docx.Paragraph({
      children: [new docx.TextRun({ text, bold: true, size: 26, color: "1A237E" })],
      spacing: { before: 240, after: 120 }
    });
  }

  function docxNoData(name) {
    return new docx.Paragraph({
      children: [new docx.TextRun({ text: `${name} 데이터가 없습니다.`, italics: true, color: "888888" })],
      spacing: { after: 120 }
    });
  }

  function docxKpiTable(kpis) {
    return new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      rows: [
        new docx.TableRow({
          children: kpis.map((kpi) =>
            new docx.TableCell({
              width: { size: 25, type: docx.WidthType.PERCENTAGE },
              shading: { fill: "F5F5F5" },
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: kpi.label, size: 18, color: "666666" })]
                }),
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: kpi.value, bold: true, size: 22, color: "1A237E" })]
                })
              ]
            })
          )
        })
      ]
    });
  }

  function docxDataTable(headers, rows) {
    const headerRow = new docx.TableRow({
      tableHeader: true,
      children: headers.map((h) =>
        new docx.TableCell({
          shading: { fill: "1A237E" },
          margins: { top: 40, bottom: 40, left: 60, right: 60 },
          children: [
            new docx.Paragraph({
              children: [new docx.TextRun({ text: h, bold: true, size: 18, color: "FFFFFF" })],
              alignment: docx.AlignmentType.CENTER
            })
          ]
        })
      )
    });
    const dataRows = rows.map((cells) =>
      new docx.TableRow({
        children: cells.map((cell, idx) =>
          new docx.TableCell({
            margins: { top: 30, bottom: 30, left: 60, right: 60 },
            children: [
              new docx.Paragraph({
                children: [new docx.TextRun({ text: String(cell), size: 18 })],
                alignment: idx === 0 ? docx.AlignmentType.LEFT : docx.AlignmentType.RIGHT
              })
            ]
          })
        )
      })
    );
    return new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows]
    });
  }

  function docxChartImage(base64, title, w, h) {
    if (!base64) {
      return docxNoData(title);
    }
    const rawData = base64.replace(/^data:image\/png;base64,/, "");
    return new docx.Paragraph({
      children: [
        new docx.ImageRun({
          data: Uint8Array.from(atob(rawData), (c) => c.charCodeAt(0)),
          transformation: { width: w, height: h },
          type: "png"
        })
      ],
      spacing: { before: 120, after: 120 }
    });
  }

  function captureAllChartImages() {
    const images = {};
    const keys = [
      "planChart", "supplierTrendChart", "purchaseTrendChart",
      "incheonAllocationChart", "pohangAllocationChart",
      "gradeMixChart", "gradeRatioChart"
    ];
    keys.forEach((key) => {
      try {
        if (chartInstances[key]) {
          images[key] = chartInstances[key].toBase64Image("image/png");
        }
      } catch {
        images[key] = null;
      }
    });
    return images;
  }

  function buildDocxPlanSection(images) {
    const children = [];
    const planData = getActivePlanData();
    const supplierAdminAvg = getSupplierAdminAveragePerformance();

    if (!planData?.monthly?.length) {
      children.push(docxNoData("부재료실적 모니터링"));
      return children;
    }

    const rows = planData.monthly;
    const annualTarget = rows.reduce((sum, r) => sum + r.plan, 0);
    const cumActual = rows[rows.length - 1].cumulativeActual;
    const attRate = rows[rows.length - 1].achievementRate;

    children.push(docxKpiTable([
      { label: "연간 목표", value: `${formatCompact(annualTarget)}톤` },
      { label: "누계 실적", value: `${formatCompact(cumActual)}톤` },
      { label: "달성률", value: formatPercent(attRate, 1) },
      { label: "거래처 평균 성과율", value: formatPercent(supplierAdminAvg, 1) }
    ]));
    children.push(docxSpacer());

    children.push(docxSubHeading("계획 대비 실적 추이"));
    children.push(docxChartImage(images.planChart, "계획 대비 실적 차트", 560, 280));

    children.push(docxSubHeading("거래처별 입고 추이"));
    children.push(docxChartImage(images.supplierTrendChart, "거래처 추이 차트", 560, 280));

    children.push(docxSubHeading("월별 실적 테이블"));
    children.push(docxDataTable(
      ["월", "계획", "실적", "누계 계획", "누계 실적", "달성률"],
      rows.map((r) => [r.month, formatNumber(r.plan), formatNumber(r.actual),
        formatNumber(r.cumulativePlan), formatNumber(r.cumulativeActual), formatPercent(r.achievementRate, 2)])
    ));
    children.push(docxSpacer());

    children.push(docxSubHeading("거래처 관리 현황"));
    const suppliers = [...state.supplierAdminItems].sort((a, b) => a.code.localeCompare(b.code, "ko"));
    if (suppliers.length) {
      children.push(docxDataTable(
        ["코드", "거래처명", "지역", "담당자", "월 가용량", "연 공급량", "신뢰등급", "납품실적%"],
        suppliers.map((s) => [s.code, s.name, s.region, s.owner,
          formatNumber(s.monthlyCapacity), formatNumber(s.yearlySupply), s.trustGrade, formatPercent(s.performanceRate, 1)])
      ));
    } else {
      children.push(docxNoData("거래처"));
    }

    return children;
  }

  function buildDocxPurchasesSection(images) {
    const children = [];
    const pData = getPurchasesData();

    if (!pData?.monthly?.length) {
      children.push(docxNoData("구매실적"));
      return children;
    }

    const monthly = pData.monthly;
    const avgSupplierCount = monthly.reduce((s, r) => s + r.supplierCount, 0) / monthly.length;

    children.push(docxKpiTable([
      { label: "누계 구매량", value: pData.totalQtyDisplay },
      { label: "누계 입고금액", value: pData.totalAmountDisplay },
      { label: "평균 매입 단가", value: pData.avgUnitPriceDisplay },
      { label: "월 평균 거래처 수", value: `${formatNumber(avgSupplierCount, 1)}곳` }
    ]));
    children.push(docxSpacer());

    children.push(docxSubHeading("월별 구매 추이"));
    children.push(docxChartImage(images.purchaseTrendChart, "구매 추이 차트", 560, 280));

    children.push(docxSubHeading("구매실적 테이블"));
    children.push(docxDataTable(
      ["월", "구매량", "입고금액", "평균 단가", "거래처 수"],
      monthly.map((r) => [r.month, formatNumber(r.qty), formatNumber(r.amount),
        formatNumber(r.avgUnitPrice, 1), formatNumber(r.supplierCount)])
    ));

    return children;
  }

  function buildDocxAllocationSection(images) {
    const children = [];
    const alloc = getSectionData("allocation");

    if (!alloc?.monthly?.length) {
      children.push(docxNoData("공장배분"));
      return children;
    }

    children.push(docxKpiTable([
      { label: "인천 계획/실적", value: `${formatCompact(alloc.incheon.planTotal)} / ${formatCompact(alloc.incheon.actualTotal)}` },
      { label: "인천 달성률", value: formatPercent(alloc.incheon.achievementRate, 1) },
      { label: "포항 계획/실적", value: `${formatCompact(alloc.pohang.planTotal)} / ${formatCompact(alloc.pohang.actualTotal)}` },
      { label: "포항 달성률", value: formatPercent(alloc.pohang.achievementRate, 1) }
    ]));
    children.push(docxSpacer());

    children.push(docxSubHeading("인천공장 등급 배분"));
    children.push(docxChartImage(images.incheonAllocationChart, "인천 배분 차트", 360, 280));

    children.push(docxSubHeading("포항공장 등급 배분"));
    children.push(docxChartImage(images.pohangAllocationChart, "포항 배분 차트", 360, 280));

    children.push(docxSubHeading("월별 배분 테이블"));
    children.push(docxDataTable(
      ["월", "인천 계획", "인천 실적", "인천 달성률", "포항 계획", "포항 실적", "포항 달성률"],
      alloc.monthly.map((r) => [r.month, formatNumber(r.incheonPlan), formatNumber(r.incheonActual),
        formatPercent(r.incheonRate, 2), formatNumber(r.pohangPlan), formatNumber(r.pohangActual), formatPercent(r.pohangRate, 2)])
    ));

    return children;
  }

  function buildDocxGradeImportSection(images) {
    const children = [];
    const gData = getGradeImportData();

    if (!gData?.comparisonTable?.length) {
      children.push(docxNoData("등급/수입관리"));
      return children;
    }

    const primaryCat = [...gData.mix].sort((a, b) => b.qty - a.qty)[0];
    children.push(docxKpiTable([
      { label: "국고하+선반설 비율", value: formatPercent(gData.lowTurningRatio, 2) },
      { label: `${gData.compareYear} 동일 비율`, value: formatPercent(gData.compareLowTurningRatio, 2) },
      { label: "전년 대비 증감", value: `${formatNumber(gData.deltaShare, 2)}%p` },
      { label: "주력 등급", value: primaryCat.name }
    ]));
    children.push(docxSpacer());

    children.push(docxSubHeading("등급 비중 비교"));
    children.push(docxChartImage(images.gradeMixChart, "등급 비중 차트", 560, 280));

    children.push(docxSubHeading("집중 등급 비율 추이"));
    children.push(docxChartImage(images.gradeRatioChart, "집중 등급 비율 차트", 560, 280));

    children.push(docxSubHeading(`${gData.currentYear} / ${gData.compareYear} 등급별 비교`));
    children.push(docxDataTable(
      ["등급", `${gData.currentYear} 입고량`, `${gData.currentYear} 비중`, `${gData.compareYear} 입고량`, `${gData.compareYear} 비중`, "증감"],
      gData.comparisonTable.map((r) => [r.category, formatNumber(r.currentQty), formatPercent(r.currentShare, 2),
        formatNumber(r.compareQty), formatPercent(r.compareShare, 2), formatPercent(r.diffShare, 2)])
    ));

    return children;
  }

  async function exportDocx() {
    if (!window.docx) {
      alert("DOCX 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 해주세요.");
      return;
    }

    const exportBtn = document.getElementById("exportBtn");
    const originalLabel = exportBtn.textContent;
    exportBtn.textContent = "내보내는 중...";
    exportBtn.disabled = true;

    try {
      const currentActiveTab = document.querySelector(".tab-btn.active")?.dataset.tab || "plan";
      const dataTabs = ["plan", "purchases", "allocation", "gradeImport"];

      for (const tab of dataTabs) {
        const section = document.getElementById(`tab-${tab}`);
        if (section && !section.classList.contains("active")) {
          section.classList.add("active");
          section.style.visibility = "hidden";
          section.style.position = "absolute";
          section.style.pointerEvents = "none";
        }
        renderActiveTab(tab);
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const images = captureAllChartImages();

      for (const tab of dataTabs) {
        const section = document.getElementById(`tab-${tab}`);
        if (tab !== currentActiveTab && section) {
          section.classList.remove("active");
          section.style.visibility = "";
          section.style.position = "";
          section.style.pointerEvents = "";
        }
      }
      setActiveTab(currentActiveTab);
      renderActiveTab(currentActiveTab);

      const year = getSelectedYear();
      const today = new Date().toISOString().slice(0, 10);

      const coverSection = {
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
        },
        children: [
          new docx.Paragraph({ spacing: { before: 3600 } }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "동국제강 원료기획팀", size: 36, bold: true, color: "1A237E" })],
            alignment: docx.AlignmentType.CENTER
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "실적 모니터링 대시보드", size: 32, bold: true, color: "1A237E" })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: `${year}년 보고서`, size: 28, color: "333333" })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 200 }
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: `생성일: ${today}`, size: 22, color: "666666" })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 400 }
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: `발행자: ${getUserDisplayText()}`, size: 22, color: "333333" })],
            alignment: docx.AlignmentType.CENTER
          })
        ]
      };

      const sectionDefs = [
        { title: "1. 부재료실적 모니터링", builder: buildDocxPlanSection },
        { title: "2. 구매실적", builder: buildDocxPurchasesSection },
        { title: "3. 공장배분", builder: buildDocxAllocationSection },
        { title: "4. 등급/수입관리", builder: buildDocxGradeImportSection }
      ];

      const sections = [coverSection];
      for (const def of sectionDefs) {
        const sectionChildren = [
          new docx.Paragraph({
            children: [new docx.TextRun({ text: def.title, bold: true, size: 30, color: "1A237E" })],
            spacing: { after: 200 }
          }),
          ...def.builder(images)
        ];
        sections.push({
          properties: {
            page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } }
          },
          children: sectionChildren
        });
      }

      const doc = new docx.Document({
        creator: "동국제강 원료기획팀 대시보드",
        title: `${year}년 실적 모니터링 보고서`,
        sections
      });

      const blob = await docx.Packer.toBlob(doc);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `동국제강_원료기획팀_${year}년_보고서_${today}.docx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error("DOCX export error:", err);
      alert("보고서 생성 중 오류가 발생했습니다. 콘솔을 확인해 주세요.");
    } finally {
      exportBtn.textContent = originalLabel;
      exportBtn.disabled = false;
    }
  }

  function attachEvents() {
    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveTab(button.dataset.tab);
        renderActiveTab(button.dataset.tab);
      });
    });

    document.getElementById("exportBtn").addEventListener("click", () => exportDocx());
    document.getElementById("logoutBtn").addEventListener("click", () => {
      sessionStorage.removeItem("loggedInUser");
      location.href = "login.html";
    });
  }

  function init() {
    window.refreshLoggedInUserDisplay = setDateAndUser;
    setupPlanPaste();
    setupPlanPasteToggle();
    setupYearSelector();
    setupMasterData();
    setDateAndUser();
    setBanner();
    setupSortableTables();
    setupSupplierFilters();
    setupSupplierAdmin();
    attachEvents();

    const url = new URL(location.href);
    const requestedTab =
      url.searchParams.get("tab") || location.hash.replace("#", "");
    const initialTab = tabLabels[requestedTab] ? requestedTab : "plan";
    setActiveTab(initialTab);
    renderActiveTab(initialTab);
  }

  init();
})();

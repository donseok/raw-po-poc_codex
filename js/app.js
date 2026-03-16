// ── 앱 초기화: Supabase 저장소 연결 ──
(async function initializeApp() {
  // 0. supabase-storage.js 모듈 로딩 대기 (type="module"은 deferred)
  if (window.__appStorageReady) {
    await window.__appStorageReady;
  }

  // 1. 로그인 사용자 정보에서 ID 추출 + Supabase userId 설정
  //    setUserId()가 내부적으로 prefetch → ready resolve를 처리함
  const loggedInUser = sessionStorage.getItem("loggedInUser");
  if (loggedInUser && window.appStorage?.setUserId) {
    try {
      const userInfo = JSON.parse(loggedInUser);
      await window.appStorage.setUserId(userInfo.uid || userInfo.id);
    } catch (e) {
      console.warn("Failed to parse loggedInUser:", e);
    }
  } else if (window.appStorage?.resolveWithoutUser) {
    // 비로그인 상태: IDB 캐시만으로 ready resolve
    window.appStorage.resolveWithoutUser();
  }

  // 2. Supabase 저장소 준비 대기 (setUserId 없이도 IDB 캐시는 이미 로드됨)
  if (window.appStorage?.ready) {
    await window.appStorage.ready;
  }

  // 3. 메인 앱 실행
  runMainApp();
})();

// ── 메인 앱 로직 (기존 IIFE를 함수로 변경) ──
function runMainApp() {
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
    const fixedAvailableYears = Array.from({ length: 8 }, (_, index) => String(2023 + index));
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
  const PLAN_GRID_ROW_ORDER = ["incheonPlan", "incheonActual", "pohangPlan", "pohangActual"];
  const RAW_PASTE_PAGE_SIZE = 100;
  let _gradeMappingsVersion = 0;
  const _txCache = { key: null, data: null };
  const _aggCache = { suppliers: { key: null, data: null }, purchases: { key: null, data: null }, gradeImport: { key: null, data: null } };
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

  const gradeColorMap = {
    "국고상": "#7986cb",
    "국고중": "#1a237e",
    "국고하": "#c62828",
    "선반설": "#42a5f5",
    "기타": "#90a4ae"
  };

  function getGradePalette(gradeMix) {
    return gradeMix.map(function(item) {
      return gradeColorMap[item.name] || "#bdbdbd";
    });
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function getSurfaceColor() {
    return getCssVar("--surface") || "#ffffff";
  }

  const DEFAULT_GRADE_MAPPINGS = {
    국고상: ["생철A", "생철B", "생철AL", "슈레더B"],
    국고중: ["중량A", "중량AS", "중AL", "중량 ALC(가위)", "중량BS", "모터블럭"],
    국고하: ["중량B", "경량A", "경량B", "경량L", "길로틴A", "길로틴B", "절단S", "압축A", "압축B", "슈레더C", "중량BLS", "중량C", "경량C", "경량T", "경량TC", "경량S", "중량BLC", "중BL"],
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
    supplierFormMode: "create",
    supplierEditingCode: "",
    rawTransactionsByYear: {},
    gradeMappings: cloneMappings(DEFAULT_GRADE_MAPPINGS),
    rawPastePage: 0
  };

  const tabLabels = {
    plan: "부재료실적 모니터링",
    supplier: "거래처 관리",
    gradeImport: "등급별현황/수입관리",
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
      const themeText = getCssVar("--text") || "#616161";
      ctx.save();
      ctx.font = "11px Segoe UI";
      ctx.fillStyle = pluginOptions.color || themeText;
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
            ctx.fillStyle = themeText;
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
            ctx.fillStyle = pluginOptions.color || themeText;
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
      const stored = window.appStorage ? window.appStorage.getSync(GRADE_MAPPING_STORAGE_KEY) : undefined;
      if (stored !== undefined) {
        state.gradeMappings = normalizeGradeMappings(stored);
      } else {
        const raw = localStorage.getItem(GRADE_MAPPING_STORAGE_KEY);
        state.gradeMappings = raw ? normalizeGradeMappings(JSON.parse(raw)) : cloneMappings(DEFAULT_GRADE_MAPPINGS);
      }
    } catch {
      state.gradeMappings = cloneMappings(DEFAULT_GRADE_MAPPINGS);
    }
  }

  function saveGradeMappings() {
    _gradeMappingsVersion += 1;
    _invalidateTxCache();
    if (window.appStorage) {
      window.appStorage.set(GRADE_MAPPING_STORAGE_KEY, state.gradeMappings);
    } else {
      localStorage.setItem(GRADE_MAPPING_STORAGE_KEY, JSON.stringify(state.gradeMappings));
    }
  }

  function parseRawTransactionText(rawText) {
    const gradeMap = getDetailedToMacroMap();
    const lines = rawText.split(/\r?\n/);
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const parsed = [];

    for (let i = 0, len = lines.length; i < len; i++) {
      const cells = lines[i].split("\t");
      if (cells.length < 5) continue;
      const dateText = normalizeClipboardCell(cells[0]);
      if (!dateRegex.test(dateText)) continue;
      const supplier = normalizeClipboardCell(cells[1]);
      const detailedGrade = normalizeClipboardCell(cells[2]);
      const unitPrice = parseClipboardNumber(cells[3]);
      const amount = parseClipboardNumber(cells[4]);
      if (!supplier || !detailedGrade || unitPrice === null || amount === null) continue;
      const month = Number(dateText.substring(5, 7));
      parsed.push({
        date: dateText,
        month,
        supplier,
        detailedGrade,
        macro: gradeMap[detailedGrade] || "기타",
        unitPrice,
        amount,
        qty: unitPrice ? (amount / unitPrice + 0.5) | 0 : 0
      });
    }

    if (!parsed.length) {
      throw new Error("붙여넣은 내용에서 유효한 원본 실적 행을 찾지 못했습니다.");
    }

    return parsed;
  }

  function parseRawTransactionTextAsync(rawText, progressCallback) {
    return new Promise((resolve, reject) => {
      const gradeMap = getDetailedToMacroMap();
      const lines = rawText.split(/\r?\n/);
      const totalLines = lines.length;
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const parsed = [];
      const CHUNK = 20000;
      let offset = 0;

      function processChunk() {
        const end = Math.min(offset + CHUNK, totalLines);
        for (let i = offset; i < end; i++) {
          const cells = lines[i].split("\t");
          if (cells.length < 5) continue;
          const dateText = normalizeClipboardCell(cells[0]);
          if (!dateRegex.test(dateText)) continue;
          const supplier = normalizeClipboardCell(cells[1]);
          const detailedGrade = normalizeClipboardCell(cells[2]);
          const unitPrice = parseClipboardNumber(cells[3]);
          const amount = parseClipboardNumber(cells[4]);
          if (!supplier || !detailedGrade || unitPrice === null || amount === null) continue;
          const month = Number(dateText.substring(5, 7));
          parsed.push({
            date: dateText,
            month,
            supplier,
            detailedGrade,
            macro: gradeMap[detailedGrade] || "기타",
            unitPrice,
            amount,
            qty: unitPrice ? (amount / unitPrice + 0.5) | 0 : 0
          });
        }
        offset = end;
        if (progressCallback) progressCallback(Math.min(offset / totalLines, 1));
        if (offset < totalLines) {
          setTimeout(processChunk, 0);
        } else {
          if (!parsed.length) {
            reject(new Error("붙여넣은 내용에서 유효한 원본 실적 행을 찾지 못했습니다."));
          } else {
            resolve(parsed);
          }
        }
      }
      processChunk();
    });
  }

  function normalizeRawTransactions(payload) {
    if (!Array.isArray(payload)) {
      return [];
    }
    const result = [];
    for (let i = 0, len = payload.length; i < len; i++) {
      const item = payload[i];
      const date = String(item.date || "");
      const month = Number(item.month);
      const supplier = String(item.supplier || "").trim();
      const detailedGrade = String(item.detailedGrade || "").trim();
      if (!date || !supplier || !detailedGrade || month < 1 || month > 12) continue;
      result.push({
        date,
        month,
        supplier,
        detailedGrade,
        macro: String(item.macro || "기타").trim(),
        unitPrice: Number(item.unitPrice) || 0,
        amount: Number(item.amount) || 0,
        qty: Number(item.qty) || 0
      });
    }
    return result;
  }

  function loadRawTransactions() {
    try {
      const stored = window.appStorage ? window.appStorage.getSync(RAW_TRANSACTION_STORAGE_KEY) : undefined;
      const parsed = stored !== undefined ? stored : (() => {
        const raw = localStorage.getItem(RAW_TRANSACTION_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      })();
      if (!parsed) {
        state.rawTransactionsByYear = {};
        return;
      }
      state.rawTransactionsByYear = Object.fromEntries(
        Object.entries(parsed || {}).map(([year, rows]) => [year, normalizeRawTransactions(rows)])
      );
    } catch {
      state.rawTransactionsByYear = {};
    }
  }

  async function saveRawTransactions() {
    const data = state.rawTransactionsByYear || {};
    if (window.appStorage) {
      await window.appStorage.set(RAW_TRANSACTION_STORAGE_KEY, data);
    } else {
      try {
        localStorage.setItem(RAW_TRANSACTION_STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        console.warn("localStorage 저장 실패 (용량 초과 가능):", e.message);
      }
    }
  }

  function _makeTxCacheKey(year) {
    const rows = state.rawTransactionsByYear?.[String(year)] || [];
    return `${year}:${rows.length}:${_gradeMappingsVersion}`;
  }

  function getRawTransactionsForYear(year = getSelectedYear()) {
    const key = _makeTxCacheKey(year);
    if (_txCache.key === key && _txCache.year === String(year)) {
      return _txCache.data;
    }
    const rows = state.rawTransactionsByYear?.[String(year)] || [];
    const gradeMap = getDetailedToMacroMap();
    for (let i = 0, len = rows.length; i < len; i++) {
      rows[i].macro = gradeMap[rows[i].detailedGrade] || "기타";
    }
    if (String(year) === getSelectedYear()) {
      _txCache.key = key;
      _txCache.year = String(year);
      _txCache.data = rows;
    }
    return rows;
  }

  function _invalidateTxCache() {
    _txCache.key = null;
    _txCache.data = null;
    _txCache.year = null;
    _aggCache.suppliers.key = null;
    _aggCache.suppliers.data = null;
    _aggCache.purchases.key = null;
    _aggCache.purchases.data = null;
    _aggCache.gradeImport.key = null;
    _aggCache.gradeImport.data = null;
  }

  function buildSupplierDatasetFromTransactions(transactions) {
    const monthlyBySupplier = new Map();
    for (let i = 0, len = transactions.length; i < len; i++) {
      const tx = transactions[i];
      let arr = monthlyBySupplier.get(tx.supplier);
      if (!arr) {
        arr = new Float64Array(12);
        monthlyBySupplier.set(tx.supplier, arr);
      }
      arr[tx.month - 1] += tx.qty;
    }

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

    for (let i = 0, len = transactions.length; i < len; i++) {
      const tx = transactions[i];
      const bucket = monthly[tx.month - 1];
      bucket.qty += tx.qty;
      bucket.amount += tx.amount;
      monthlySuppliers[tx.month - 1].add(tx.supplier);
    }

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
      let totalQty = 0;
      const macroTotals = {};
      for (let i = 0, len = transactions.length; i < len; i++) {
        const tx = transactions[i];
        totalQty += tx.qty;
        macroTotals[tx.macro] = (macroTotals[tx.macro] || 0) + tx.qty;
      }
      return Object.entries(macroTotals)
        .map(([name, qty]) => ({
          name,
          qty: roundNumber(qty, 0),
          share: roundNumber(percent(qty, totalQty), 2)
        }))
        .sort((left, right) => right.qty - left.qty);
    };

    const summarizeMonthlyRatio = (transactions) => {
      const monthTotal = new Float64Array(12);
      const monthFocused = new Float64Array(12);
      for (let i = 0, len = transactions.length; i < len; i++) {
        const tx = transactions[i];
        const idx = tx.month - 1;
        monthTotal[idx] += tx.qty;
        if (tx.macro === "국고하" || tx.macro === "선반설") {
          monthFocused[idx] += tx.qty;
        }
      }
      return Array.from({ length: 12 }, (_, index) => ({
        month: `${index + 1}월`,
        ratio: roundNumber(percent(monthFocused[index], monthTotal[index]), 2)
      }));
    };

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
    // Add top padding for bar/line charts with value labels to prevent clipping
    if (config.type !== "doughnut" && config.options?.plugins?.valueLabelPlugin?.enabled) {
      if (!config.options.layout) config.options.layout = {};
      if (!config.options.layout.padding) config.options.layout.padding = {};
      if (config.options.layout.padding.top === undefined) config.options.layout.padding.top = 22;
    }
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
        if (header.classList.contains("no-sort")) {
          return;
        }
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
    const cacheKey = _makeTxCacheKey(getSelectedYear());
    if (_aggCache.suppliers.key === cacheKey) {
      return _aggCache.suppliers.data;
    }
    const rawTransactions = getRawTransactionsForYear();
    let result;
    if (rawTransactions.length) {
      result = {
        ...(getSectionData("suppliers") || {}),
        trendChart: buildSupplierDatasetFromTransactions(rawTransactions)
      };
    } else {
      result = getSectionData("suppliers");
    }
    _aggCache.suppliers.key = cacheKey;
    _aggCache.suppliers.data = result;
    return result;
  }

  function getPurchasesData() {
    const cacheKey = _makeTxCacheKey(getSelectedYear());
    if (_aggCache.purchases.key === cacheKey) {
      return _aggCache.purchases.data;
    }
    const rawTransactions = getRawTransactionsForYear();
    let result;
    if (rawTransactions.length) {
      result = buildPurchasesDatasetFromTransactions(rawTransactions);
    } else {
      result = getSectionData("purchases");
    }
    _aggCache.purchases.key = cacheKey;
    _aggCache.purchases.data = result;
    return result;
  }

  function getGradeImportData() {
    const currentYear = getSelectedYear();
    const base = getSectionData("gradeImport");
    const compareYear = base?.compareYear || String(Number(currentYear) - 1);
    const cacheKey = `${_makeTxCacheKey(currentYear)}|${_makeTxCacheKey(compareYear)}`;
    if (_aggCache.gradeImport.key === cacheKey) {
      return _aggCache.gradeImport.data;
    }
    const currentTransactions = getRawTransactionsForYear(currentYear);
    if (!currentTransactions.length) {
      _aggCache.gradeImport.key = cacheKey;
      _aggCache.gradeImport.data = base;
      return base;
    }

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
    _aggCache.gradeImport.key = cacheKey;
    _aggCache.gradeImport.data = derived;
    return derived;
  }

  function getYearOverview() {
    return getSectionData("overview");
  }

  function buildMacroGradeMix(transactions) {
    let totalQty = 0;
    const macroTotals = {};
    for (let i = 0, len = transactions.length; i < len; i++) {
      const tx = transactions[i];
      totalQty += tx.qty;
      macroTotals[tx.macro] = (macroTotals[tx.macro] || 0) + tx.qty;
    }
    return Object.entries(macroTotals)
      .map(([name, qty]) => ({
        name,
        qty: roundNumber(qty, 0),
        share: roundNumber(percent(qty, totalQty), 2)
      }))
      .sort((left, right) => right.qty - left.qty);
  }

  function getIncheonAllocationData() {
    const allocation = getSectionData("allocation");
    const rawTransactions = getRawTransactionsForYear();

    if (rawTransactions.length) {
      const gradeMix = buildMacroGradeMix(rawTransactions);
      const totalQty = gradeMix.reduce((sum, row) => sum + row.qty, 0);
      const base = allocation?.incheon || {};
      return {
        plan: base.plan || totalQty,
        actual: base.actual || totalQty,
        achievementRate: base.achievementRate || (base.plan ? roundNumber(percent(totalQty, base.plan), 1) : 100),
        gradeMix
      };
    }

    if (!allocation?.incheon) {
      return null;
    }

    const detailedToMacro = getDetailedToMacroMap();
    const grouped = new Map();
    (allocation.incheon.gradeMix || []).forEach((item) => {
      const sourceName = String(item.name || "").trim();
      const macro = detailedToMacro[sourceName] || sourceName || "기타";
      const current = grouped.get(macro) || { name: macro, qty: 0, share: 0 };
      current.qty += Number(item.qty) || 0;
      current.share += Number(item.share) || 0;
      grouped.set(macro, current);
    });

    const gradeMix = [...grouped.values()]
      .map((item) => ({
        ...item,
        share: roundNumber(item.share, 2)
      }))
      .sort((left, right) => right.qty - left.qty);

    return {
      ...allocation.incheon,
      gradeMix
    };
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
      const stored = window.appStorage ? window.appStorage.getSync(SUPPLIER_ADMIN_STORAGE_KEY) : undefined;
      const parsed = stored !== undefined ? stored : (() => {
        const raw = localStorage.getItem(SUPPLIER_ADMIN_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      })();
      if (!parsed) {
        state.supplierAdminItems = DEFAULT_SUPPLIER_ADMIN_ITEMS.map((item) => ({ ...item }));
        return;
      }
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
    if (window.appStorage) {
      window.appStorage.set(SUPPLIER_ADMIN_STORAGE_KEY, state.supplierAdminItems);
    } else {
      localStorage.setItem(SUPPLIER_ADMIN_STORAGE_KEY, JSON.stringify(state.supplierAdminItems));
    }
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

  function getSupplierAdminSummary() {
    const items = state.supplierAdminItems || [];
    const totalMonthlyCapacity = items.reduce((sum, item) => sum + (Number(item.monthlyCapacity) || 0), 0);
    const totalYearlySupply = items.reduce((sum, item) => sum + (Number(item.yearlySupply) || 0), 0);
    const averagePerformance = getSupplierAdminAveragePerformance();
    const topSupplier =
      items
        .slice()
        .sort((left, right) => (Number(right.yearlySupply) || 0) - (Number(left.yearlySupply) || 0))[0] || null;

    return {
      count: items.length,
      totalMonthlyCapacity,
      totalYearlySupply,
      averagePerformance,
      topSupplier
    };
  }

  function getImportShipmentStatusBadge(status) {
    if (status === "도착") {
      return "badge badge-green";
    }
    if (status === "운송중") {
      return "badge badge-blue";
    }
    if (status === "선적") {
      return "badge badge-orange";
    }
    return "badge badge-gray";
  }

  function getImportShipmentRows(year) {
    const selectedYear = Number(year) || 2024;
    return [
      { seq: "001", country: "일본", supplier: "Toyota Tsusho", grade: "HMS1", qty: 15000, cfr: 368, fx: 1382, shipDate: `${selectedYear}-01-15`, eta: `${selectedYear}-02-02`, status: "도착" },
      { seq: "002", country: "일본", supplier: "Hanwa Co.", grade: "Shredded", qty: 12000, cfr: 375, fx: 1385, shipDate: `${selectedYear}-01-28`, eta: `${selectedYear}-02-15`, status: "도착" },
      { seq: "003", country: "러시아", supplier: "NLMK Trading", grade: "HMS2", qty: 20000, cfr: 358, fx: 1380, shipDate: `${selectedYear}-02-05`, eta: `${selectedYear}-03-01`, status: "도착" },
      { seq: "004", country: "일본", supplier: "Mitsui & Co.", grade: "HMS1", qty: 18000, cfr: 372, fx: 1388, shipDate: `${selectedYear}-02-20`, eta: `${selectedYear}-03-08`, status: "운송중" },
      { seq: "005", country: "러시아", supplier: "Metalloinvest", grade: "HMS2", qty: 22000, cfr: 355, fx: 1383, shipDate: `${selectedYear}-03-01`, eta: `${selectedYear}-03-25`, status: "운송중" },
      { seq: "006", country: "일본", supplier: "Toyota Tsusho", grade: "Shredded", qty: 14000, cfr: 380, fx: 1390, shipDate: `${selectedYear}-03-10`, eta: `${selectedYear}-03-28`, status: "선적" },
      { seq: "007", country: "러시아", supplier: "Severstal Export", grade: "HMS1", qty: 16000, cfr: 362, fx: 1385, shipDate: `${selectedYear}-03-20`, eta: `${selectedYear}-04-12`, status: "계약" },
      { seq: "008", country: "일본", supplier: "Hanwa Co.", grade: "HMS1", qty: 10400, cfr: 378, fx: 1387, shipDate: `${selectedYear}-04-01`, eta: `${selectedYear}-04-18`, status: "계약" }
    ].map((row) => ({
      ...row,
      contractNo: `IMP-${selectedYear}-${row.seq}`
    }));
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
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.monthly)) {
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
      const stored = window.appStorage ? window.appStorage.getSync(PLAN_PASTE_STORAGE_KEY) : undefined;
      const parsed = stored !== undefined ? stored : (() => {
        const raw = localStorage.getItem(PLAN_PASTE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      })();
      if (!parsed) {
        state.planOverrides = {};
        return;
      }
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        state.planOverrides = {};
        if (window.appStorage) { window.appStorage.remove(PLAN_PASTE_STORAGE_KEY); }
        else { localStorage.removeItem(PLAN_PASTE_STORAGE_KEY); }
        return;
      }
      state.planOverrides = Object.fromEntries(
        Object.entries(parsed)
          .map(([year, dataset]) => [String(year), normalizePlanOverrideData(dataset)])
          .filter(([, dataset]) => dataset)
      );
    } catch {
      if (window.appStorage) { window.appStorage.remove(PLAN_PASTE_STORAGE_KEY); }
      else { localStorage.removeItem(PLAN_PASTE_STORAGE_KEY); }
      state.planOverrides = {};
    }
  }

  async function savePlanOverride(dataset) {
    state.planOverrides[getSelectedYear()] = dataset;
    if (window.appStorage) {
      await window.appStorage.set(PLAN_PASTE_STORAGE_KEY, state.planOverrides);
    } else {
      localStorage.setItem(PLAN_PASTE_STORAGE_KEY, JSON.stringify(state.planOverrides));
    }
  }

  async function clearPlanOverride() {
    const year = getSelectedYear();
    delete state.planOverrides[year];

    // Supabase에서 해당 연도 행 직접 DELETE
    if (window.appStorage && window.appStorage.supabaseClient) {
      try {
        await window.appStorage.supabaseClient
          .from("plan_data")
          .delete()
          .eq("year", year);
      } catch (err) {
        console.error("clearPlanOverride: Supabase delete failed", err);
      }
    }

    // 로컬 저장소 동기화
    if (Object.keys(state.planOverrides).length) {
      if (window.appStorage) {
        await window.appStorage.set(PLAN_PASTE_STORAGE_KEY, state.planOverrides);
      } else {
        localStorage.setItem(PLAN_PASTE_STORAGE_KEY, JSON.stringify(state.planOverrides));
      }
      return;
    }
    if (window.appStorage) {
      await window.appStorage.remove(PLAN_PASTE_STORAGE_KEY);
    } else {
      localStorage.removeItem(PLAN_PASTE_STORAGE_KEY);
    }
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

  function updatePlanPasteRowTotals() {
    document.querySelectorAll("[data-row-total]").forEach(function(cell) {
      var rowKey = cell.getAttribute("data-row-total");
      var sum = 0;
      var hasAny = false;
      for (var m = 0; m < 12; m++) {
        var input = getPlanPasteCell(rowKey, m);
        if (input && input.value.trim()) {
          var v = parseClipboardNumber(input.value);
          if (v !== null) { sum += v; hasAny = true; }
        }
      }
      cell.textContent = hasAny ? formatNumber(sum) : "";
    });
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
    updatePlanPasteRowTotals();
  }

  function clearPlanPasteGrid() {
    document.querySelectorAll(".plan-paste-cell").forEach((input) => {
      input.value = "";
      input.classList.remove("has-value");
    });
    updatePlanPasteRowTotals();
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

    // 로컬 state 업데이트 (DB 저장 없이)
    state.planOverrides[getSelectedYear()] = gridDataset;

    // UI 업데이트
    fillPlanPasteGrid(gridDataset);
    updatePlanPasteStatus();
    renderPlan();

    state._planAppliedButNotSaved = true;

    if (window.showToast) {
      window.showToast("적용 완료. 저장 버튼을 눌러 DB에 반영하세요.", "info");
    }
  }

  async function savePlanToDB() {
    if (!state._planAppliedButNotSaved) {
      if (window.showToast) {
        window.showToast("먼저 '붙여넣은 값 적용' 버튼을 눌러주세요.", "error");
      }
      return;
    }

    try {
      if (window.showToast) {
        window.showToast("데이터를 저장 중입니다...", "info");
      }

      await savePlanOverride(state.planOverrides[getSelectedYear()]);

      state._planAppliedButNotSaved = false;

      if (window.showToast) {
        window.showToast("저장 되었습니다.", "success");
      }
    } catch (error) {
      console.error("Plan DB save error:", error);
      if (window.showToast) {
        window.showToast("데이터 저장 중 오류가 발생했습니다: " + (error.message || "Unknown error"), "error");
      }
    }
  }

  async function resetPlanPasteInput() {
    try {
      if (window.showToast) {
        window.showToast("기본 데이터로 복원 중입니다...", "info");
      }

      await clearPlanOverride();
      clearPlanPasteGrid();
      updatePlanPasteStatus();
      renderPlan();

      state._planAppliedButNotSaved = false;

      if (window.showToast) {
        window.showToast("수급계획을 기본 데이터로 복원하고 데이터베이스에서 삭제했습니다.", "success");
      }
    } catch (error) {
      console.error("Plan paste reset error:", error);
      if (window.showToast) {
        window.showToast("데이터 저장 중 오류가 발생했습니다: " + (error.message || "Unknown error"), "error");
      }
    }
  }

  function handlePlanCellPaste(event) {
    var rawText = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
    rawText = rawText ? rawText.trim() : "";
    if (!rawText) {
      return;
    }

    var rows = rawText.split(/\r?\n/).map(function(line) {
      return line.split("\t").map(normalizeClipboardCell);
    }).filter(function(cells) {
      return cells.some(Boolean);
    });

    if (!rows.length) {
      return;
    }

    // Single value (1x1): let the browser handle it natively
    if (rows.length === 1 && rows[0].length === 1) {
      return;
    }

    event.preventDefault();

    // Try full grid paste (4 rows x 12 cols) first
    var isFullGrid = rows.length >= 4 && rows.every(function(r) {
      return r.filter(Boolean).length >= 12;
    });
    if (isFullGrid) {
      try {
        var parsed = parsePlanPasteText(rawText);
        fillPlanPasteGrid(parsed);
        var status = document.getElementById("planPasteStatus");
        if (status) {
          status.textContent = "붙여넣기 완료. 값이 그리드에 채워졌습니다. 붙여넣은 값 적용 버튼을 누르면 수급계획에 반영됩니다.";
        }
        if (window.showToast) {
          window.showToast("엑셀 값을 입력 그리드에 채웠습니다.", "success");
        }
        return;
      } catch (_) {
        // Fall through to cell-based paste
      }
    }

    // Cell-based paste: start from focused cell
    var target = event.target;
    var startRow = target.getAttribute("data-row");
    var startMonthAttr = target.getAttribute("data-month");
    if (!startRow || startMonthAttr === null) {
      return;
    }
    var startRowIndex = PLAN_GRID_ROW_ORDER.indexOf(startRow);
    var startMonth = parseInt(startMonthAttr, 10);
    if (startRowIndex < 0 || isNaN(startMonth)) {
      return;
    }

    var filledCount = 0;
    for (var r = 0; r < rows.length; r++) {
      var rowIndex = startRowIndex + r;
      if (rowIndex >= PLAN_GRID_ROW_ORDER.length) break;
      var rowKey = PLAN_GRID_ROW_ORDER[rowIndex];
      for (var c = 0; c < rows[r].length; c++) {
        var monthIndex = startMonth + c;
        if (monthIndex > 11) break;
        var cellValue = parseClipboardNumber(rows[r][c]);
        if (cellValue !== null) {
          var input = getPlanPasteCell(rowKey, monthIndex);
          if (input) {
            input.value = formatNumber(cellValue);
            markPlanPasteCell(input);
            filledCount++;
          }
        }
      }
    }

    updatePlanPasteRowTotals();

    var statusEl = document.getElementById("planPasteStatus");
    if (statusEl) {
      statusEl.textContent = filledCount + "개 셀에 값을 채웠습니다. 붙여넣은 값 적용 버튼을 누르면 수급계획에 반영됩니다.";
    }
    if (window.showToast) {
      window.showToast(filledCount + "개 셀에 값을 붙여넣었습니다.", "success");
    }
  }

  function setupPlanPaste() {
    loadPlanOverride();
    const applyButton = document.getElementById("applyPlanPasteBtn");
    const saveButton = document.getElementById("savePlanToDBBtn");
    const resetButton = document.getElementById("resetPlanPasteBtn");
    const grid = document.getElementById("planPasteGrid");

    if (applyButton) {
      applyButton.addEventListener("click", applyPlanPasteInput);
    }
    if (saveButton) {
      saveButton.addEventListener("click", savePlanToDB);
    }
    if (resetButton) {
      resetButton.addEventListener("click", resetPlanPasteInput);
    }

    document.querySelectorAll(".plan-paste-cell").forEach((input) => {
      input.addEventListener("paste", handlePlanCellPaste);
      input.addEventListener("focus", () => input.select());
      input.addEventListener("blur", () => {
        markPlanPasteCell(input);
        updatePlanPasteRowTotals();
        const status = document.getElementById("planPasteStatus");
        if (status) {
          status.textContent = "그리드 값을 수정했습니다. 붙여넣은 값 적용 버튼을 누르면 수급계획에 반영됩니다.";
        }
      });
      input.addEventListener("input", () => {
        input.classList.toggle("has-value", Boolean(normalizeClipboardCell(input.value)));
        updatePlanPasteRowTotals();
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
    updatePlanPasteRowTotals();

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
      tbody.innerHTML = makeUnavailableRow(10, "등록된 거래처가 없습니다.");
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
            <td class="text-center">
              <div class="table-actions">
                <button class="btn btn-outline btn-sm" type="button" data-supplier-edit="${item.code}">수정</button>
                <button class="btn btn-outline btn-sm table-action-danger" type="button" data-supplier-delete="${item.code}">삭제</button>
              </div>
            </td>
          </tr>
        `
      )
      .join("");

    applyTableSort(document.querySelector('table[data-export="suppliers"]'));
    tbody.querySelectorAll("[data-supplier-edit]").forEach((button) => {
      button.addEventListener("click", () => openSupplierForm(button.dataset.supplierEdit));
    });
    tbody.querySelectorAll("[data-supplier-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteSupplier(button.dataset.supplierDelete));
    });
  }

  function renderSupplierAdminKpis() {
    const container = document.getElementById("supplierAdminKpis");
    if (!container) {
      return;
    }

    const summary = getSupplierAdminSummary();
    container.innerHTML = [
      kpiCard("등록 거래처", `${formatNumber(summary.count)}<small>개사</small>`, "현재 등록된 거래처 수", ""),
      kpiCard("월 공급능력 합계", `${formatCompact(summary.totalMonthlyCapacity)}<small></small>`, "거래처 기준 월 가용 물량", "accent"),
      kpiCard("금년 납품량 합계", `${formatCompact(summary.totalYearlySupply)}<small></small>`, "거래처 관리 기준 누적 납품량", "success"),
      kpiCard(
        "대표 거래처",
        `${summary.topSupplier ? summary.topSupplier.name : "-"}<small></small>`,
        summary.topSupplier
          ? `평균 납품실적 ${formatPercent(summary.averagePerformance, 1)} / 최대 납품량 ${formatCompact(summary.topSupplier.yearlySupply)}`
          : "등록된 거래처가 없습니다.",
        "warning"
      )
    ].join("");

    const hint = document.getElementById("supplierAdminHint");
    if (hint) {
      hint.textContent = summary.count
        ? `평균 납품실적 ${formatPercent(summary.averagePerformance, 1)} / 최대 납품 ${summary.topSupplier?.name || "-"}`
        : "등록된 거래처가 없습니다.";
    }
  }

  function resetSupplierForm() {
    state.supplierFormMode = "create";
    state.supplierEditingCode = "";
    document.getElementById("supplierFormTitle").textContent = "거래처 등록";
    document.getElementById("supplierSubmitBtn").textContent = "저장";
    document.getElementById("supplierCode").removeAttribute("readonly");
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

  function openSupplierForm(code = "") {
    resetSupplierForm();
    if (code) {
      const found = state.supplierAdminItems.find((item) => item.code === code);
      if (!found) {
        window.showToast?.("선택한 거래처를 찾을 수 없습니다.", "error");
        return;
      }
      state.supplierFormMode = "edit";
      state.supplierEditingCode = found.code;
      document.getElementById("supplierFormTitle").textContent = "거래처 수정";
      document.getElementById("supplierSubmitBtn").textContent = "수정";
      document.getElementById("supplierCode").value = found.code;
      document.getElementById("supplierCode").setAttribute("readonly", "readonly");
      document.getElementById("supplierName").value = found.name;
      document.getElementById("supplierRegion").value = found.region;
      document.getElementById("supplierOwner").value = found.owner;
      document.getElementById("supplierPhone").value = found.phone;
      document.getElementById("supplierTrust").value = found.trustGrade;
      document.getElementById("supplierMonthlyCapacity").value = found.monthlyCapacity;
      document.getElementById("supplierYearlySupply").value = found.yearlySupply;
    } else {
      document.getElementById("supplierCode").value = getNextSupplierCode();
    }
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

    const isEditMode = state.supplierFormMode === "edit";
    if (!isEditMode && state.supplierAdminItems.some((supplier) => supplier.code === item.code)) {
      window.showToast?.("이미 존재하는 거래처 코드입니다.", "error");
      return;
    }

    if (isEditMode) {
      const targetIndex = state.supplierAdminItems.findIndex((supplier) => supplier.code === state.supplierEditingCode);
      if (targetIndex === -1) {
        window.showToast?.("수정할 거래처를 찾을 수 없습니다.", "error");
        return;
      }
      state.supplierAdminItems[targetIndex] = item;
    } else {
      state.supplierAdminItems.push(item);
    }
    saveSupplierAdminItems();
    renderSupplierManagement();
    renderPlan();
    window.hideModal?.("supplierModal");
    resetSupplierForm();
    window.showToast?.(isEditMode ? "거래처 정보를 수정했습니다." : "거래처가 등록되었습니다.", "success");
  }

  function deleteSupplier(code) {
    const found = state.supplierAdminItems.find((item) => item.code === code);
    if (!found) {
      window.showToast?.("삭제할 거래처를 찾을 수 없습니다.", "error");
      return;
    }
    if (!window.confirm(`'${found.name}' 거래처를 삭제하시겠습니까?`)) {
      return;
    }
    state.supplierAdminItems = state.supplierAdminItems.filter((item) => item.code !== code);
    saveSupplierAdminItems();
    renderSupplierManagement();
    renderPlan();
    window.showToast?.("거래처를 삭제했습니다.", "success");
  }

  function setupSupplierAdmin() {
    loadSupplierAdminItems();
    renderSupplierManagement();

    const addButton = document.getElementById("supplierAddBtn");
    const submitButton = document.getElementById("supplierSubmitBtn");
    if (addButton) {
      addButton.addEventListener("click", () => openSupplierForm());
    }
    if (submitButton) {
      submitButton.addEventListener("click", submitSupplier);
    }
  }

  function renderSupplierManagement() {
    renderSupplierAdminKpis();
    renderSupplierAdminTable();
  }

  function setupSupplierFilters() {
    return;
  }

  function updateRawPasteStatus() {
    const status = document.getElementById("rawPasteStatus");
    if (!status) {
      return;
    }
    const rowCount = (state.rawTransactionsByYear?.[getSelectedYear()] || []).length;
    if (!rowCount) {
      status.textContent = `${getSelectedYearLabel()} 원본 실적 데이터가 아직 입력되지 않았습니다.`;
      return;
    }
    status.textContent = `${getSelectedYearLabel()} 원본 실적 ${formatNumber(rowCount)}건이 저장되어 있습니다. 거래처 추이, 구매실적, 등급별현황/수입관리에 반영됩니다.`;
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

  function _getRawPasteAllRows() {
    return state.rawTransactionsByYear?.[getSelectedYear()] || [];
  }

  function _getRawPasteTotalPages() {
    const total = _getRawPasteAllRows().length;
    if (total === 0) return 1;
    return Math.ceil(total / RAW_PASTE_PAGE_SIZE);
  }

  function _renderRawPastePagination() {
    const container = document.getElementById("rawPastePagination");
    if (!container) return;
    const totalRows = _getRawPasteAllRows().length;
    if (totalRows <= RAW_PASTE_PAGE_SIZE) {
      container.innerHTML = "";
      return;
    }
    const totalPages = _getRawPasteTotalPages();
    const page = state.rawPastePage;
    const startRow = page * RAW_PASTE_PAGE_SIZE + 1;
    const endRow = Math.min((page + 1) * RAW_PASTE_PAGE_SIZE, totalRows);
    let html = `<span class="raw-paste-page-info">${formatNumber(startRow)}~${formatNumber(endRow)} / ${formatNumber(totalRows)}건</span>`;
    html += `<button class="pagination-btn" data-raw-page="0" ${page === 0 ? "disabled" : ""}>«</button>`;
    html += `<button class="pagination-btn" data-raw-page="${page - 1}" ${page === 0 ? "disabled" : ""}>‹</button>`;
    const maxButtons = 5;
    let start = Math.max(0, page - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons);
    if (end - start < maxButtons) start = Math.max(0, end - maxButtons);
    for (let i = start; i < end; i++) {
      html += `<button class="pagination-btn${i === page ? " active" : ""}" data-raw-page="${i}">${i + 1}</button>`;
    }
    html += `<button class="pagination-btn" data-raw-page="${page + 1}" ${page >= totalPages - 1 ? "disabled" : ""}>›</button>`;
    html += `<button class="pagination-btn" data-raw-page="${totalPages - 1}" ${page >= totalPages - 1 ? "disabled" : ""}>»</button>`;
    container.innerHTML = html;
    container.querySelectorAll("[data-raw-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        state.rawPastePage = Number(btn.dataset.rawPage);
        syncRawPasteInputForYear();
      });
    });
  }

  function ensureRawPasteEmptyRows() {
    const allRows = _getRawPasteAllRows();
    const totalPages = _getRawPasteTotalPages();
    const isLastPage = state.rawPastePage >= totalPages - 1;
    if (!isLastPage && allRows.length > 0) return;
    const body = document.getElementById("rawPasteGridBody");
    if (!body) return;
    const currentRows = body.querySelectorAll("tr").length;
    const targetRows = Math.max(18, currentRows);
    for (let index = currentRows; index < targetRows; index += 1) {
      body.insertAdjacentHTML("beforeend", createRawPasteGridRow());
    }
  }

  function syncRawPasteInputForYear() {
    const body = document.getElementById("rawPasteGridBody");
    if (!body) return;
    const allRows = _getRawPasteAllRows();
    const totalPages = _getRawPasteTotalPages();
    if (state.rawPastePage >= totalPages) state.rawPastePage = Math.max(0, totalPages - 1);
    const start = state.rawPastePage * RAW_PASTE_PAGE_SIZE;
    const pageRows = allRows.slice(start, start + RAW_PASTE_PAGE_SIZE);
    body.innerHTML = pageRows.map((row) => createRawPasteGridRow(row)).join("");
    ensureRawPasteEmptyRows();
    _renderRawPastePagination();
    updateRawPasteStatus();
  }

  function readRawPasteGrid() {
    const body = document.getElementById("rawPasteGridBody");
    if (!body) return [];
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
      const allRows = _getRawPasteAllRows();
      const rawText = allRows
        .filter((row) => row.date || row.supplier || row.detailedGrade)
        .map((row) => [row.date, row.supplier, row.detailedGrade, row.unitPrice || "", row.amount || ""].join("\t"))
        .join("\n");

      if (allRows.length > 20000) {
        window.showToast?.(`${formatNumber(allRows.length)}건 처리 중...`, "info");
        parseRawTransactionTextAsync(rawText, (progress) => {
          const pct = Math.round(progress * 100);
          if (pct % 20 === 0) window.showToast?.(`처리 중... ${pct}%`, "info");
        }).then((parsed) => {
          state.rawTransactionsByYear[getSelectedYear()] = parsed;
          _invalidateTxCache();
          state._rawAppliedButNotSaved = true;
          syncRawPasteInputForYear();
          updateRawPasteStatus();
          renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
          window.showToast?.(`적용 완료 (${formatNumber(parsed.length)}건). 저장 버튼을 눌러 DB에 반영하세요.`, "info");
        }).catch((error) => {
          window.showToast?.(error.message || "원본 실적 데이터를 읽지 못했습니다.", "error");
        });
      } else {
        const parsed = parseRawTransactionText(rawText);
        state.rawTransactionsByYear[getSelectedYear()] = parsed;
        _invalidateTxCache();
        state._rawAppliedButNotSaved = true;
        syncRawPasteInputForYear();
        updateRawPasteStatus();
        renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
        window.showToast?.("적용 완료. 저장 버튼을 눌러 DB에 반영하세요.", "info");
      }
    } catch (error) {
      window.showToast?.(error.message || "원본 실적 데이터를 읽지 못했습니다.", "error");
    }
  }

  async function saveRawToDB() {
    if (!state._rawAppliedButNotSaved) {
      window.showToast?.("먼저 '원본 데이터 반영' 버튼을 눌러주세요.", "error");
      return;
    }
    try {
      window.showToast?.("데이터를 저장 중입니다...", "info");
      await saveRawTransactions();
      state._rawAppliedButNotSaved = false;
      window.showToast?.("저장 되었습니다.", "success");
    } catch (error) {
      console.error("Raw transaction DB save error:", error);
      window.showToast?.("데이터 저장 중 오류가 발생했습니다: " + (error.message || "Unknown error"), "error");
    }
  }

  async function clearRawTransactionOverride() {
    const year = getSelectedYear();
    delete state.rawTransactionsByYear[year];
    _invalidateTxCache();

    // Supabase에서 해당 연도 행 직접 DELETE
    if (window.appStorage && window.appStorage.supabaseClient) {
      try {
        await window.appStorage.supabaseClient
          .from("transactions")
          .delete()
          .eq("year", Number(year));
      } catch (err) {
        console.error("clearRawTransactionOverride: Supabase delete failed", err);
      }
    }

    // 로컬 저장소 동기화
    if (Object.keys(state.rawTransactionsByYear).length) {
      if (window.appStorage) {
        await window.appStorage.set(RAW_TRANSACTION_STORAGE_KEY, state.rawTransactionsByYear);
      } else {
        try {
          localStorage.setItem(RAW_TRANSACTION_STORAGE_KEY, JSON.stringify(state.rawTransactionsByYear));
        } catch (e) {
          console.warn("localStorage 저장 실패:", e.message);
        }
      }
    } else {
      if (window.appStorage) {
        await window.appStorage.remove(RAW_TRANSACTION_STORAGE_KEY);
      } else {
        localStorage.removeItem(RAW_TRANSACTION_STORAGE_KEY);
      }
    }
  }

  function resetRawPasteInput() {
    window.showToast?.("데이터를 초기화 중입니다...", "info");
    state._rawAppliedButNotSaved = false;
    (async () => {
      try {
        await clearRawTransactionOverride();
        window.showToast?.("✓ 선택 연도의 원본 실적 데이터를 초기화했습니다.", "success");
      } catch (error) {
        window.showToast?.(`데이터 초기화 중 오류: ${error.message || "Unknown error"}`, "error");
        console.error("Clear error:", error);
      }
      state.rawPastePage = 0;
      syncRawPasteInputForYear();
      renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
    })();
  }

  function setupMasterData() {
    loadGradeMappings();
    loadRawTransactions();
    renderMappingGroups();
    syncRawPasteInputForYear();

    const addMappingButton = document.getElementById("addMappingBtn");
    const applyRawButton = document.getElementById("applyRawPasteBtn");
    const saveRawButton = document.getElementById("saveRawToDBBtn");
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

    const resetMappingButton = document.getElementById("resetMappingBtn");
    resetMappingButton?.addEventListener("click", () => {
      if (!confirm("등급 매핑을 기본값으로 복원하시겠습니까?")) return;
      state.gradeMappings = cloneMappings(DEFAULT_GRADE_MAPPINGS);
      saveGradeMappings();
      renderMappingGroups();
      renderActiveTab(document.querySelector(".tab-content.active")?.id.replace("tab-", "") || "plan");
      window.showToast?.("등급 매핑을 기본값으로 복원했습니다.", "success");
    });

    applyRawButton?.addEventListener("click", applyRawPasteInput);
    saveRawButton?.addEventListener("click", saveRawToDB);
    resetRawButton?.addEventListener("click", resetRawPasteInput);

    const grid = document.getElementById("rawPasteGrid");
    grid?.addEventListener("paste", (event) => {
      const rawText = event.clipboardData?.getData("text/plain")?.trim();
      if (!rawText) {
        return;
      }
      event.preventDefault();
      const lines = rawText.split(/\r?\n/);
      const totalLines = lines.length;
      const CHUNK = 20000;

      if (totalLines > CHUNK) {
        window.showToast?.(`${formatNumber(totalLines)}건 처리 중...`, "info");
        const parsed = [];
        let offset = 0;
        function processChunk() {
          const end = Math.min(offset + CHUNK, totalLines);
          for (let i = offset; i < end; i++) {
            const cells = lines[i].split("\t");
            if (cells.length < 2) continue;
            parsed.push({
              date: normalizeClipboardCell(cells[0]) || "",
              supplier: normalizeClipboardCell(cells[1]) || "",
              detailedGrade: normalizeClipboardCell(cells[2]) || "",
              unitPrice: parseClipboardNumber(cells[3] || "") || 0,
              amount: parseClipboardNumber(cells[4] || "") || 0
            });
          }
          offset = end;
          if (offset < totalLines) {
            setTimeout(processChunk, 0);
          } else {
            state.rawTransactionsByYear[getSelectedYear()] = parsed;
            _invalidateTxCache();
            state.rawPastePage = 0;
            syncRawPasteInputForYear();
            window.showToast?.(`엑셀 값 ${formatNumber(parsed.length)}건을 붙여넣었습니다. '원본 데이터 반영' 버튼을 눌러 저장하세요.`, "success");
          }
        }
        processChunk();
      } else {
        const parsed = [];
        for (let i = 0; i < totalLines; i++) {
          const cells = lines[i].split("\t");
          if (cells.length < 2) continue;
          parsed.push({
            date: normalizeClipboardCell(cells[0]) || "",
            supplier: normalizeClipboardCell(cells[1]) || "",
            detailedGrade: normalizeClipboardCell(cells[2]) || "",
            unitPrice: parseClipboardNumber(cells[3] || "") || 0,
            amount: parseClipboardNumber(cells[4] || "") || 0
          });
        }
        state.rawTransactionsByYear[getSelectedYear()] = parsed;
        _invalidateTxCache();
        state.rawPastePage = 0;
        syncRawPasteInputForYear();
        window.showToast?.(`엑셀 값 ${formatNumber(parsed.length)}건을 붙여넣었습니다. '원본 데이터 반영' 버튼을 눌러 저장하세요.`, "success");
      }
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
      const stored = window.appStorage ? window.appStorage.getSync("usersData") : undefined;
      const parsed = stored !== undefined ? stored : (() => {
        const raw = localStorage.getItem("usersData");
        return raw ? JSON.parse(raw) : null;
      })();
      if (!parsed) return null;
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
    const availableSections = ["plan", "suppliers", "gradeImport"].filter(
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
    document.getElementById("footerNote").textContent = "Copywright(c) 동국시스템즈";
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

    selector.addEventListener("change", async (event) => {
      state.selectedYear = event.target.value;
      _invalidateTxCache();
      state.rawPastePage = 0;

      // Supabase: 연도별 거래 데이터 지연 로드
      if (window.appStorage && window.appStorage.prefetchTransactionsForYear) {
        await window.appStorage.prefetchTransactionsForYear(event.target.value);
      }

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

    const totalPlan = planRows.reduce((s, r) => s + (r.plan || 0), 0);
    const totalActual = planRows.reduce((s, r) => s + (r.actual || 0), 0);
    const lastRow = planRows[planRows.length - 1];
    const totalCumPlan = lastRow.cumulativePlan || 0;
    const totalCumActual = lastRow.cumulativeActual || 0;
    const totalRate = lastRow.achievementRate;

    document.getElementById("planTable").innerHTML = planRows
      .map(
        (row) => `
          <tr>
            <td>${row.month}</td>
            <td class="text-right">${row.plan ? formatNumber(row.plan) : ""}</td>
            <td class="text-right">${row.actual ? formatNumber(row.actual) : ""}</td>
            <td class="text-right">${row.cumulativePlan ? formatNumber(row.cumulativePlan) : ""}</td>
            <td class="text-right">${row.cumulativeActual ? formatNumber(row.cumulativeActual) : ""}</td>
            <td class="text-right">${row.achievementRate ? formatPercent(row.achievementRate, 2) : ""}</td>
          </tr>
        `
      )
      .join("") +
      `<tr style="font-weight:bold;background:var(--bg-light,#f5f5f5);">
        <td>합계</td>
        <td class="text-right">${totalPlan ? formatNumber(totalPlan) : ""}</td>
        <td class="text-right">${totalActual ? formatNumber(totalActual) : ""}</td>
        <td class="text-right">${totalCumPlan ? formatNumber(totalCumPlan) : ""}</td>
        <td class="text-right">${totalCumActual ? formatNumber(totalCumActual) : ""}</td>
        <td class="text-right">${totalRate ? formatPercent(totalRate, 2) : ""}</td>
      </tr>`;
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
          legend: { position: "bottom", labels: { padding: 16, usePointStyle: true, pointStyle: "rectRounded" } },
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
            pointBackgroundColor: getSurfaceColor(),
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

    const isLowTurning = (name) => /국고\s*하|선반설/.test(name);
    const calcLowTurningRatio = (gradeMix) => {
      if (!gradeMix?.length) return 0;
      return gradeMix
        .filter((item) => isLowTurning(item.name))
        .reduce((sum, item) => sum + item.share, 0);
    };
    const incheonLowRatio = roundNumber(calcLowTurningRatio(allocation.incheon.gradeMix), 2);
    const prevYear = String(Number(getSelectedYear()) - 1);
    const prevAllocation = data.years?.[prevYear]?.allocation || null;
    const prevIncheonLowRatio = prevAllocation
      ? roundNumber(calcLowTurningRatio(prevAllocation.incheon?.gradeMix), 2)
      : null;
    const lowRatioDelta = prevIncheonLowRatio != null ? roundNumber(incheonLowRatio - prevIncheonLowRatio, 2) : null;
    const lowRatioSub = lowRatioDelta != null
      ? `전년도 대비 ${lowRatioDelta >= 0 ? "+" : ""}${formatPercent(lowRatioDelta, 2)}p`
      : "전년도 데이터 없음";

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
        "국고하+선반설 비율",
        `${formatPercent(incheonLowRatio, 2)}<small></small>`,
        lowRatioSub,
        "warning"
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
        ""
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
              borderColor: getSurfaceColor(),
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
      getGradePalette(allocation.incheon.gradeMix)
    );
    makeAllocationChart(
      "pohangAllocationChart",
      "pohangAllocationChart",
      allocation.pohang.gradeMix,
      getGradePalette(allocation.pohang.gradeMix)
    );
  }

  function renderGradeImport() {
    const gradeData = getGradeImportData();
    const purchasesData = getPurchasesData();
    const incheonAllocation = getIncheonAllocationData();
    const importShipmentRows = getImportShipmentRows(getSelectedYear());
    const purchaseDetailHint = document.getElementById("purchaseDetailHint");
    if (purchaseDetailHint) {
      purchaseDetailHint.textContent = `${getSelectedYearLabel()} 월별 입고량/입고금액 raw data 합계입니다.`;
    }

    if (!purchasesData?.monthly?.length) {
      document.getElementById("purchaseHighlights").innerHTML = `<div class="empty-state">${getSelectedYearLabel()} 구매실적 데이터가 없습니다.</div>`;
      document.getElementById("purchaseTable").innerHTML = makeUnavailableRow(5, `${getSelectedYearLabel()} 구매실적 데이터가 없습니다.`);
    } else {
      const monthly = purchasesData.monthly;
      const peakMonth = [...monthly].sort((left, right) => right.qty - left.qty)[0];
      const lowMonth = [...monthly].sort((left, right) => left.qty - right.qty)[0];
      const highestPrice = [...monthly].sort((left, right) => right.avgUnitPrice - left.avgUnitPrice)[0];
      const lowestPrice = [...monthly].sort((left, right) => left.avgUnitPrice - right.avgUnitPrice)[0];

      document.getElementById("purchaseHighlights").innerHTML = [
        miniStat("최대 구매량 월", `${peakMonth.month} raw data 합계`, formatCompact(peakMonth.qty)),
        miniStat("최소 구매량 월", `${lowMonth.month} raw data 합계`, formatCompact(lowMonth.qty)),
        miniStat("최고 평균 단가", `${highestPrice.month} 월 평균 단가`, formatNumber(highestPrice.avgUnitPrice, 1)),
        miniStat("최저 평균 단가", `${lowestPrice.month} 월 평균 단가`, formatNumber(lowestPrice.avgUnitPrice, 1))
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
    }

    if (!incheonAllocation?.gradeMix?.length) {
      document.getElementById("incheonAllocationRatePill").innerHTML = `<strong>${getSelectedYearLabel()}</strong> 데이터 없음`;
      document.getElementById("incheonAllocationRateLabel").textContent = "-";
      const incheonAllocationProgress = document.getElementById("incheonAllocationProgress");
      incheonAllocationProgress.style.width = "0%";
      incheonAllocationProgress.textContent = "";
      setEmptyChartMessage("gradeRatioChart", `${getSelectedYearLabel()} 인천공장 배분 데이터가 없습니다.`);
    } else {
      clearEmptyChartMessage("gradeRatioChart");
      document.getElementById("incheonAllocationRatePill").innerHTML = `<strong>달성률</strong> ${formatPercent(
        incheonAllocation.achievementRate,
        1
      )}`;
      document.getElementById("incheonAllocationRateLabel").textContent = formatPercent(
        incheonAllocation.achievementRate,
        1
      );
      const incheonAllocationProgress = document.getElementById("incheonAllocationProgress");
      incheonAllocationProgress.style.width = `${Math.min(incheonAllocation.achievementRate, 100)}%`;
      incheonAllocationProgress.textContent = formatPercent(incheonAllocation.achievementRate, 1);

      makeBarChart("gradeRatioChart", "gradeRatioChart", {
        type: "doughnut",
        data: {
          labels: incheonAllocation.gradeMix.map((item) => item.name),
          datasets: [
            {
              data: incheonAllocation.gradeMix.map((item) => item.share),
              backgroundColor: getGradePalette(incheonAllocation.gradeMix),
              borderColor: getSurfaceColor(),
              borderWidth: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "54%",
          plugins: {
            legend: { position: "right" },
            tooltip: {
              callbacks: {
                label: (context) =>
                  `${context.label}: ${formatNumber(incheonAllocation.gradeMix[context.dataIndex].qty)}톤 (${formatPercent(
                    context.raw,
                    1
                  )})`
              }
            },
            valueLabelPlugin: {
              enabled: false
            }
          }
        }
      });
    }

    if (!gradeData?.comparisonTable?.length) {
      document.getElementById("gradeImportKpis").innerHTML = kpiCard(
        "연도 상태",
        `${getSelectedYearLabel()}<small></small>`,
        "등급/수입 비교 데이터가 없습니다.",
        ""
      );
      document.getElementById("importShipmentTable").innerHTML = importShipmentRows
        .map(
          (row) => `
            <tr>
              <td>${row.contractNo}</td>
              <td>${row.country}</td>
              <td>${row.supplier}</td>
              <td>${row.grade}</td>
              <td class="text-right">${formatNumber(row.qty)}</td>
              <td class="text-right">$${formatNumber(row.cfr)}</td>
              <td class="text-right">${formatNumber(row.fx)}</td>
              <td>${row.shipDate}</td>
              <td>${row.eta}</td>
              <td class="text-center"><span class="${getImportShipmentStatusBadge(row.status)}">${row.status}</span></td>
            </tr>
          `
        )
        .join("");
      applyTableSort(document.querySelector('table[data-export="gradeImportImportTable"]'));
      if (!purchasesData?.monthly?.length) {
        setEmptyChartMessage("gradeMixChart", `${getSelectedYearLabel()} 구매 추이 데이터가 없습니다.`);
      } else {
        clearEmptyChartMessage("gradeMixChart");
        makeBarChart("gradeMixChart", "gradeMixChart", {
          type: "bar",
          data: {
            labels: purchasesData.monthly.map((row) => row.month),
            datasets: [
              {
                type: "bar",
                label: "구매량(톤)",
                data: purchasesData.monthly.map((row) => row.qty),
                backgroundColor: "rgba(94, 103, 176, 0.9)",
                borderRadius: 8,
                yAxisID: "y"
              },
              {
                type: "line",
                label: "금액(억원)",
                data: purchasesData.monthly.map((row) => Number((row.amount / 100000000).toFixed(1))),
                borderColor: colors.accent,
                backgroundColor: colors.accent,
                pointRadius: 5,
                pointHoverRadius: 5,
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
                  callback: (value) => formatNumber(value)
                }
              },
              y1: {
                position: "right",
                grid: { drawOnChartArea: false },
                ticks: {
                  callback: (value) => value
                }
              }
            }
          }
        });
      }
      return;
    }

    if (!purchasesData?.monthly?.length) {
      setEmptyChartMessage("gradeMixChart", `${getSelectedYearLabel()} 구매 추이 데이터가 없습니다.`);
    } else {
      clearEmptyChartMessage("gradeMixChart");
    }

    const primaryCategory = [...gradeData.mix].sort((left, right) => right.qty - left.qty)[0];
    const deltaClass = gradeData.deltaShare >= 0 ? "up" : "down";
    const totalPurchaseQty = gradeData.mix.reduce((sum, row) => sum + row.qty, 0);

    document.getElementById("gradeImportKpis").innerHTML = [
      kpiCard(
        "월별 구매량 총합",
        `${formatNumber(totalPurchaseQty)}<small>톤</small>`,
        `${gradeData.currentYear} raw data 기준`,
        ""
      ),
      kpiCard(
        "누계 입고금액",
        `${formatCompact(purchasesData?.totalAmount || 0)}<small>원</small>`,
        `${gradeData.currentYear} raw data 기준`,
        "accent"
      ),
      kpiCard(
        "구매량/입고금액 비율",
        `${purchasesData?.totalAmount ? formatNumber(totalPurchaseQty / (purchasesData.totalAmount / 1000000), 2) : "—"}<small>톤/백만원</small>`,
        `월별 구매량 총합 / 누계입고금액`,
        "success"
      ),
      (() => {
        const delta = roundNumber(gradeData.lowTurningRatio - gradeData.compareLowTurningRatio, 2);
        const hasPrev = Number.isFinite(gradeData.compareLowTurningRatio) && gradeData.compareLowTurningRatio > 0;
        const sub = hasPrev
          ? `전년도 대비 ${delta >= 0 ? "+" : ""}${formatPercent(delta, 2)}p`
          : "전년도 데이터 없음";
        return kpiCard(
          "국고하+선반설 비율",
          `${formatPercent(gradeData.lowTurningRatio, 2)}<small></small>`,
          sub,
          "warning"
        );
      })()
    ].join("");

    document.getElementById("importShipmentTable").innerHTML = importShipmentRows
      .map(
        (row) => `
          <tr>
            <td>${row.contractNo}</td>
            <td>${row.country}</td>
            <td>${row.supplier}</td>
            <td>${row.grade}</td>
            <td class="text-right">${formatNumber(row.qty)}</td>
            <td class="text-right">$${formatNumber(row.cfr)}</td>
            <td class="text-right">${formatNumber(row.fx)}</td>
            <td>${row.shipDate}</td>
            <td>${row.eta}</td>
            <td class="text-center"><span class="${getImportShipmentStatusBadge(row.status)}">${row.status}</span></td>
          </tr>
        `
      )
      .join("");
    applyTableSort(document.querySelector('table[data-export="gradeImportImportTable"]'));

    if (purchasesData?.monthly?.length) {
      makeBarChart("gradeMixChart", "gradeMixChart", {
        type: "bar",
        data: {
          labels: purchasesData.monthly.map((row) => row.month),
          datasets: [
            {
              type: "bar",
              label: "구매량(톤)",
              data: purchasesData.monthly.map((row) => row.qty),
              backgroundColor: "rgba(94, 103, 176, 0.9)",
              borderRadius: 8,
              yAxisID: "y"
            },
            {
              type: "line",
              label: "금액(억원)",
              data: purchasesData.monthly.map((row) => Number((row.amount / 100000000).toFixed(1))),
              borderColor: colors.accent,
              backgroundColor: colors.accent,
              pointRadius: 5,
              pointHoverRadius: 5,
              tension: 0.25,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { padding: 16, usePointStyle: true, pointStyle: "rectRounded" } }
          },
          scales: {
            y: {
              position: "left",
              ticks: {
                callback: (value) => formatNumber(value)
              }
            },
            y1: {
              position: "right",
              grid: { drawOnChartArea: false },
              ticks: {
                callback: (value) => value
              }
            }
          }
        }
      });
    }

  }

  function renderActiveTab(tabName) {
    if (tabName === "plan") {
      renderPlan();
      return;
    }
    if (tabName === "supplier") {
      renderSupplierManagement();
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

  /* ── DOCX 디자인 상수 ── */
  const DOCX_COLORS = {
    navy: "1A237E", navyLight: "283593", accent: "FF8F00",
    success: "2E7D32", warning: "F57F17", danger: "C62828",
    textDark: "212121", textMed: "555555", textLight: "888888",
    bgLight: "F8F9FA", bgStripe: "F0F2F8", border: "E0E0E0"
  };

  function docxSpacer() {
    return new docx.Paragraph({ spacing: { after: 160 } });
  }

  function docxSubHeading(text) {
    return new docx.Paragraph({
      children: [
        new docx.TextRun({ text: "\u25A0 ", bold: true, size: 28, color: DOCX_COLORS.navy }),
        new docx.TextRun({ text, bold: true, size: 28, color: DOCX_COLORS.navyLight })
      ],
      spacing: { before: 300, after: 120 }
    });
  }

  function docxSectionTitle(text) {
    return new docx.Paragraph({
      children: [new docx.TextRun({ text, bold: true, size: 32, color: DOCX_COLORS.navy })],
      spacing: { before: 120, after: 240 },
      border: {
        bottom: { style: docx.BorderStyle.SINGLE, size: 12, color: DOCX_COLORS.accent, space: 6 }
      }
    });
  }

  function docxNoData(name) {
    return new docx.Paragraph({
      children: [new docx.TextRun({ text: `${name} 데이터가 없습니다.`, italics: true, size: 20, color: DOCX_COLORS.textLight })],
      spacing: { after: 120 }
    });
  }

  function docxCaption(text) {
    return new docx.Paragraph({
      children: [new docx.TextRun({ text, italics: true, size: 16, color: DOCX_COLORS.textLight })],
      spacing: { after: 80 }
    });
  }

  function docxKpiTable(kpis) {
    const cellWidth = Math.floor(100 / kpis.length);
    return new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      borders: {
        top: { style: docx.BorderStyle.NONE },
        bottom: { style: docx.BorderStyle.NONE },
        left: { style: docx.BorderStyle.NONE },
        right: { style: docx.BorderStyle.NONE },
        insideHorizontal: { style: docx.BorderStyle.NONE },
        insideVertical: { style: docx.BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border }
      },
      rows: [
        new docx.TableRow({
          children: kpis.map((kpi) =>
            new docx.TableCell({
              width: { size: cellWidth, type: docx.WidthType.PERCENTAGE },
              shading: { fill: DOCX_COLORS.bgLight },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: kpi.label, size: 18, color: DOCX_COLORS.textMed })],
                  spacing: { after: 40 }
                }),
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: kpi.value, bold: true, size: 26, color: DOCX_COLORS.navy })]
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
          shading: { fill: DOCX_COLORS.navy },
          margins: { top: 50, bottom: 50, left: 60, right: 60 },
          children: [
            new docx.Paragraph({
              children: [new docx.TextRun({ text: h, bold: true, size: 18, color: "FFFFFF" })],
              alignment: docx.AlignmentType.CENTER
            })
          ]
        })
      )
    });
    const dataRows = rows.map((cells, rowIdx) =>
      new docx.TableRow({
        children: cells.map((cell, colIdx) =>
          new docx.TableCell({
            shading: rowIdx % 2 === 1 ? { fill: DOCX_COLORS.bgStripe } : undefined,
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            children: [
              new docx.Paragraph({
                children: [new docx.TextRun({ text: String(cell), size: 18, color: DOCX_COLORS.textDark })],
                alignment: colIdx === 0 ? docx.AlignmentType.LEFT : docx.AlignmentType.RIGHT
              })
            ]
          })
        )
      })
    );
    return new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      borders: {
        top: { style: docx.BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border },
        bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border },
        left: { style: docx.BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border },
        right: { style: docx.BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border },
        insideHorizontal: { style: docx.BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border },
        insideVertical: { style: docx.BorderStyle.SINGLE, size: 1, color: DOCX_COLORS.border }
      },
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
    const lastR = rows[rows.length - 1];
    const docxTableRows = rows.map((r) => [r.month, r.plan ? formatNumber(r.plan) : "", r.actual ? formatNumber(r.actual) : "",
      r.cumulativePlan ? formatNumber(r.cumulativePlan) : "", r.cumulativeActual ? formatNumber(r.cumulativeActual) : "", r.achievementRate ? formatPercent(r.achievementRate, 2) : ""]);
    docxTableRows.push(["합계", annualTarget ? formatNumber(annualTarget) : "", cumActual ? formatNumber(cumActual) : "",
      lastR.cumulativePlan ? formatNumber(lastR.cumulativePlan) : "", lastR.cumulativeActual ? formatNumber(lastR.cumulativeActual) : "", lastR.achievementRate ? formatPercent(lastR.achievementRate, 2) : ""]);
    children.push(docxDataTable(
      ["월", "계획", "실적", "누계 계획", "누계 실적", "달성률"],
      docxTableRows
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
      children.push(docxNoData("등급별현황/수입관리"));
      return children;
    }

    const primaryCat = [...gData.mix].sort((a, b) => b.qty - a.qty)[0];
    const pData = getPurchasesData();
    const totalQty = gData.mix.reduce((s, r) => s + r.qty, 0);
    children.push(docxKpiTable([
      { label: "구매량/입고금액 비율", value: `${pData?.totalAmount ? formatNumber(totalQty / (pData.totalAmount / 1000000), 2) : "—"} 톤/백만원` },
      { label: "국고하+선반설 비율", value: formatPercent(gData.lowTurningRatio, 2) + (gData.compareLowTurningRatio > 0 ? " (전년 " + formatPercent(gData.compareLowTurningRatio, 2) + ")" : "") }
    ]));
    children.push(docxSpacer());

    children.push(docxSubHeading("등급 비중 비교"));
    children.push(docxChartImage(images.gradeMixChart, "등급 비중 차트", 560, 280));

    children.push(docxSubHeading("집중 등급 비율 추이"));
    children.push(docxChartImage(images.gradeRatioChart, "인천공장 배분 현황 차트", 560, 280));

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
      const dataTabs = ["plan", "purchases", "gradeImport"];

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
          new docx.Paragraph({ spacing: { before: 3200 } }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "동국제강 원료기획팀", size: 48, bold: true, color: DOCX_COLORS.navy })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 80 }
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: "원료 조달 실적 모니터링 보고서", size: 36, bold: true, color: DOCX_COLORS.navy })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 300 }
          }),
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 300 },
            border: {
              bottom: { style: docx.BorderStyle.SINGLE, size: 18, color: DOCX_COLORS.accent, space: 1 }
            },
            children: []
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: `${year}년 보고서`, size: 32, color: DOCX_COLORS.textDark })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: `보고서 생성일: ${today}`, size: 24, color: DOCX_COLORS.textMed })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 120 }
          }),
          new docx.Paragraph({
            children: [new docx.TextRun({ text: `발행: ${getUserDisplayText()}`, size: 24, color: DOCX_COLORS.textDark })],
            alignment: docx.AlignmentType.CENTER
          })
        ]
      };

      const sectionDefs = [
        { title: "1. 부재료실적 모니터링", builder: buildDocxPlanSection },
        { title: "2. 구매실적", builder: buildDocxPurchasesSection },
        { title: "3. 등급별현황/수입관리", builder: buildDocxGradeImportSection }
      ];

      const sections = [coverSection];
      for (const def of sectionDefs) {
        const sectionChildren = [
          docxSectionTitle(def.title),
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

    document.querySelector(".logo")?.addEventListener("click", (event) => {
      event.preventDefault();
      setActiveTab("plan");
      renderActiveTab("plan");
    });

    document.getElementById("exportBtn").addEventListener("click", () => exportDocx());
    document.getElementById("logoutBtn").addEventListener("click", () => {
      // Supabase 로그아웃
      if (window.appStorage && window.appStorage.supabaseClient) {
        window.appStorage.supabaseClient.auth.signOut().then(() => {
          sessionStorage.removeItem("loggedInUser");
          location.href = "login.html";
        }).catch(() => {
          // 오프라인 등으로 Supabase 로그아웃 실패해도 계속 진행
          sessionStorage.removeItem("loggedInUser");
          location.href = "login.html";
        });
      } else {
        sessionStorage.removeItem("loggedInUser");
        location.href = "login.html";
      }
    });
  }

  /* ── 챗봇 (floating popup) ── */

  function normalizeVerifiedChatText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseVerifiedChatQuery(text) {
    const normalized = normalizeVerifiedChatText(text);

    // ── 월 파싱 (범위/복수/단일) ──
    const months = [];
    var rangeMatch = normalized.match(/(\d{1,2})\s*[~\-]\s*(\d{1,2})\s*월/);
    if (rangeMatch) {
      for (var m = Number(rangeMatch[1]); m <= Math.min(Number(rangeMatch[2]), 12); m++) {
        if (m >= 1 && !months.includes(m - 1)) months.push(m - 1);
      }
    }
    if (!months.length) {
      var fromToMatch = normalized.match(/(\d{1,2})\s*월\s*(?:부터|에서)\s*(\d{1,2})\s*월/);
      if (fromToMatch) {
        for (var m2 = Number(fromToMatch[1]); m2 <= Math.min(Number(fromToMatch[2]), 12); m2++) {
          if (m2 >= 1 && !months.includes(m2 - 1)) months.push(m2 - 1);
        }
      }
    }
    if (!months.length) {
      var monthMatches = normalized.matchAll(/(\d{1,2})\s*월/g);
      for (var mm of monthMatches) {
        var month = Number(mm[1]);
        if (month >= 1 && month <= 12 && !months.includes(month - 1)) months.push(month - 1);
      }
    }

    // ── 범위 파싱 (분기 개별 지원) ──
    var range = null;
    if (/1\s*분기/.test(normalized)) range = "1분기";
    else if (/2\s*분기/.test(normalized)) range = "2분기";
    else if (/3\s*분기/.test(normalized)) range = "3분기";
    else if (/4\s*분기/.test(normalized)) range = "4분기";
    else if (/상반기/.test(normalized)) range = "상반기";
    else if (/하반기/.test(normalized)) range = "하반기";
    else if (/전체|연간|연도|올해|합계|총계/.test(normalized)) range = "전체";

    // ── 의도 플래그 ──
    var flags = {
      plan: /(계획|목표|수급)/.test(normalized),
      actual: /(실적|달성)/.test(normalized),
      cumulative: /(누계|누적|달성률|달성율)/.test(normalized),
      supplier: /(거래처|납품|공급사|공급처|업체)/.test(normalized),
      purchase: /(구매|매입|입고금액|입고량|단가|금액)/.test(normalized),
      grade: /(등급|비중|비율|국고상|국고중|국고하|선반설|국고 상|국고 중|국고 하)/.test(normalized),
      importing: /(수입|선적|도착|운송|계약번호|cfr|imp-)/.test(normalized),
      allocation: /(배분|공장)/.test(normalized),
      compare: /(비교|최대|최고|최소|최저|전년|전년대비|증감)/.test(normalized),
      overview: /(현황|요약|정리|종합|개요|대시보드)/.test(normalized),
      trend: /(추이|추세|변화|트렌드)/.test(normalized)
    };

    // ── 거래처명 검색 ──
    var supplierName = null;
    var suppliersTable = getSectionData("suppliers")?.table || [];
    for (var si = 0; si < suppliersTable.length; si++) {
      if (normalized.includes(suppliersTable[si].supplier.toLowerCase())) {
        supplierName = suppliersTable[si].supplier;
        flags.supplier = true;
        break;
      }
    }
    if (!supplierName) {
      for (var sj = 0; sj < state.supplierAdminItems.length; sj++) {
        if (normalized.includes(state.supplierAdminItems[sj].name.toLowerCase())) {
          supplierName = state.supplierAdminItems[sj].name;
          flags.supplier = true;
          break;
        }
      }
    }

    // ── 공장 특정 ──
    var factory = null;
    if (/인천/.test(normalized)) { factory = "인천"; flags.allocation = true; }
    if (/포항/.test(normalized)) { factory = "포항"; flags.allocation = true; }

    return { normalized, months, range, flags, supplierName, factory };
  }

  function chatRangeMonths(query) {
    if (query.months.length) return query.months;
    switch (query.range) {
      case "1분기": return [0, 1, 2];
      case "2분기": return [3, 4, 5];
      case "상반기": return [0, 1, 2, 3, 4, 5];
      case "3분기": return [6, 7, 8];
      case "4분기": return [9, 10, 11];
      case "하반기": return [6, 7, 8, 9, 10, 11];
      case "전체": return null;
      default: return null;
    }
  }

  function chatRangeLabel(query) {
    if (query.months.length === 1) return (query.months[0] + 1) + "월";
    if (query.months.length > 1) return (query.months[0] + 1) + "~" + (query.months[query.months.length - 1] + 1) + "월";
    if (query.range) return query.range;
    return "연간";
  }

  function getVerifiedChatIntentOrder(query) {
    var scores = { plan: 0, purchase: 0, grade: 0, import: 0, supplier: 0, allocation: 0, overview: 0 };

    if (query.flags.plan || query.flags.actual || query.flags.cumulative) scores.plan += 4;
    if (query.flags.purchase) scores.purchase += 5;
    if (query.flags.grade) scores.grade += 5;
    if (query.flags.importing) scores.import += 5;
    if (query.flags.supplier) scores.supplier += 5;
    if (query.flags.allocation) scores.allocation += 5;
    if (query.flags.overview) scores.overview += 2;
    if (query.months.length || query.range) { scores.plan += 2; scores.purchase += 1; scores.allocation += 1; }
    if (query.supplierName) scores.supplier += 3;
    if (query.flags.compare) { scores.plan += 1; scores.purchase += 1; scores.grade += 1; }
    if (query.flags.trend) { scores.purchase += 2; scores.plan += 1; }
    if (query.factory) scores.allocation += 2;

    // "현황" 키워드가 다른 구체적 키워드와 동시에 나오면 overview 점수 낮춤
    if (query.flags.overview) {
      var specificFlags = [query.flags.plan, query.flags.actual, query.flags.purchase, query.flags.grade,
        query.flags.importing, query.flags.supplier, query.flags.allocation];
      if (specificFlags.some(Boolean)) scores.overview = 0;
    }

    // 아무 플래그도 없고 월/범위도 없으면 overview
    if (!Object.values(query.flags).some(Boolean) && !query.months.length && !query.range) {
      scores.overview = 5;
    }
    // 키워드 없이 월만 있으면 plan 우선
    if (query.months.length && !Object.values(query.flags).some(Boolean)) {
      scores.plan = 5;
    }

    return Object.entries(scores)
      .sort(function (left, right) { return right[1] - left[1]; })
      .map(function (item) { return item[0]; });
  }

  function buildVerifiedOverviewAnswer(query, yearLabel) {
    var overview = getSectionData("overview") || getYearOverview();
    var planData = getActivePlanData();
    var purchData = getPurchasesData();
    var lines = [yearLabel + " 종합 현황"];

    if (overview) {
      lines.push("연간 목표: " + (overview.annualTargetDisplay || formatNumber(overview.annualTarget)) + "톤");
      lines.push("누계 실적: " + (overview.cumulativeActualDisplay || formatNumber(overview.cumulativeActual)) + "톤");
      lines.push("달성률: " + (overview.attainmentRateDisplay || formatPercent(overview.attainmentRate, 1)));
    } else if (planData?.monthly?.length) {
      var monthly = planData.monthly;
      var totalPlan = monthly.reduce(function (s, r) { return s + r.plan; }, 0);
      var last = monthly[monthly.length - 1];
      lines.push("연간 계획: " + formatNumber(totalPlan) + "톤");
      lines.push("누계 실적: " + formatNumber(last.cumulativeActual) + "톤");
      lines.push("달성률: " + formatPercent(last.achievementRate, 1));
    }

    if (purchData?.totalQtyDisplay) {
      lines.push("");
      lines.push("[구매실적]");
      lines.push("입고량: " + purchData.totalQtyDisplay);
      lines.push("입고금액: " + purchData.totalAmountDisplay);
      lines.push("평균 단가: " + purchData.avgUnitPriceDisplay);
    }

    var allocation = getSectionData("allocation");
    if (allocation?.incheon && allocation?.pohang) {
      lines.push("");
      lines.push("[공장 배분]");
      lines.push("인천: " + formatNumber(allocation.incheon.actualTotal) + "톤 (달성률 " + formatPercent(allocation.incheon.achievementRate, 1) + ")");
      lines.push("포항: " + formatNumber(allocation.pohang.actualTotal) + "톤 (달성률 " + formatPercent(allocation.pohang.achievementRate, 1) + ")");
    }

    return lines.join("\n");
  }

  function buildVerifiedPlanAnswer(query, yearLabel) {
    var planData = getActivePlanData();
    if (!planData?.monthly?.length) {
      return yearLabel + " 계획/실적 데이터가 없습니다.";
    }
    var monthly = planData.monthly;

    // 단일 월
    if (query.months.length === 1) {
      var idx = query.months[0];
      var row = monthly[idx];
      if (!row) return (idx + 1) + "월 데이터가 없습니다.";
      var gap = row.actual - row.plan;
      var monthRate = row.plan ? roundNumber((row.actual / row.plan) * 100, 1) : 0;
      return row.month + " 계획/실적\n" +
        "계획: " + formatNumber(row.plan) + "톤\n" +
        "실적: " + formatNumber(row.actual) + "톤\n" +
        "차이: " + (gap >= 0 ? "+" : "") + formatNumber(gap) + "톤\n" +
        "월별 달성률: " + formatPercent(monthRate, 1) + "\n" +
        "누계 달성률: " + formatPercent(row.achievementRate, 1);
    }

    // 복수 월 / 범위
    var rm = chatRangeMonths(query);
    if (rm && rm.length > 1) {
      var rows = rm.map(function (mi) { return monthly[mi]; }).filter(Boolean);
      if (!rows.length) return chatRangeLabel(query) + " 데이터가 없습니다.";
      var sumPlan = rows.reduce(function (s, r) { return s + r.plan; }, 0);
      var sumActual = rows.reduce(function (s, r) { return s + r.actual; }, 0);
      var rangeGap = sumActual - sumPlan;
      var label = chatRangeLabel(query);
      var detail = yearLabel + " " + label + " 계획/실적\n" +
        "계획 합계: " + formatNumber(sumPlan) + "톤\n" +
        "실적 합계: " + formatNumber(sumActual) + "톤\n" +
        "차이: " + (rangeGap >= 0 ? "+" : "") + formatNumber(rangeGap) + "톤\n" +
        "달성률: " + formatPercent(percent(sumActual, sumPlan), 1);
      if (rows.length <= 6) {
        detail += "\n\n[월별 상세]";
        rows.forEach(function (r) {
          var mr = r.plan ? roundNumber((r.actual / r.plan) * 100, 1) : 0;
          detail += "\n" + r.month + ": 계획 " + formatNumber(r.plan) + " / 실적 " + formatNumber(r.actual) + " (" + formatPercent(mr, 1) + ")";
        });
      }
      return detail;
    }

    // 비교 (최대/최소)
    if (query.flags.compare) {
      var best = monthly.slice().sort(function (a, b) { return b.actual - a.actual; })[0];
      var worst = monthly.slice().sort(function (a, b) { return a.actual - b.actual; })[0];
      var bestRate = best.plan ? roundNumber((best.actual / best.plan) * 100, 1) : 0;
      var worstRate = worst.plan ? roundNumber((worst.actual / worst.plan) * 100, 1) : 0;
      return yearLabel + " 실적 비교\n" +
        "최대: " + best.month + " " + formatNumber(best.actual) + "톤 (달성률 " + formatPercent(bestRate, 1) + ")\n" +
        "최소: " + worst.month + " " + formatNumber(worst.actual) + "톤 (달성률 " + formatPercent(worstRate, 1) + ")";
    }

    // 누계 달성률
    if (query.flags.cumulative) {
      var lastRow = monthly[monthly.length - 1];
      return yearLabel + " 누계 현황\n" +
        "누계 계획: " + formatNumber(lastRow.cumulativePlan) + "톤\n" +
        "누계 실적: " + formatNumber(lastRow.cumulativeActual) + "톤\n" +
        "누계 달성률: " + formatPercent(lastRow.achievementRate, 1);
    }

    // 기본: 연간 전체
    var tPlan = monthly.reduce(function (s, r) { return s + r.plan; }, 0);
    var tActual = monthly.reduce(function (s, r) { return s + r.actual; }, 0);
    var lastM = monthly[monthly.length - 1];
    return yearLabel + " 계획/실적 전체\n" +
      "연간 계획: " + formatNumber(tPlan) + "톤\n" +
      "연간 실적: " + formatNumber(tActual) + "톤\n" +
      "달성률: " + formatPercent(lastM.achievementRate, 1);
  }

  function buildVerifiedPurchaseAnswer(query, yearLabel) {
    var purchases = getPurchasesData();
    if (!purchases?.monthly?.length) {
      return yearLabel + " 구매실적 데이터가 없습니다.";
    }

    // 단일 월
    if (query.months.length === 1) {
      var row = purchases.monthly[query.months[0]];
      if (!row) return (query.months[0] + 1) + "월 구매 데이터가 없습니다.";
      return row.month + " 구매실적\n" +
        "입고량: " + formatNumber(row.qty) + "톤\n" +
        "입고금액: " + formatCompact(row.amount) + "\n" +
        "평균 단가: " + formatNumber(row.avgUnitPrice, 1) + "\n" +
        "거래처 수: " + row.supplierCount + "곳";
    }

    // 복수 월 / 범위 (상반기, 분기 등)
    var rm = chatRangeMonths(query);
    if (rm && rm.length > 0 && (query.range || query.months.length > 1)) {
      var rows = rm.map(function (mi) { return purchases.monthly[mi]; }).filter(Boolean);
      if (!rows.length) return chatRangeLabel(query) + " 구매 데이터가 없습니다.";
      var sumQty = rows.reduce(function (s, r) { return s + r.qty; }, 0);
      var sumAmt = rows.reduce(function (s, r) { return s + r.amount; }, 0);
      var avgPrice = sumQty ? roundNumber(sumAmt / sumQty, 1) : 0;
      var label = chatRangeLabel(query);
      var detail = yearLabel + " " + label + " 구매실적\n" +
        "입고량: " + formatCompact(sumQty) + "\n" +
        "입고금액: " + formatCompact(sumAmt) + "\n" +
        "평균 단가: " + formatNumber(avgPrice, 1);
      if (rows.length <= 6) {
        detail += "\n\n[월별 상세]";
        rows.forEach(function (r) {
          detail += "\n" + r.month + ": " + formatCompact(r.qty) + " / " + formatCompact(r.amount) + " (단가 " + formatNumber(r.avgUnitPrice, 1) + ")";
        });
      }
      return detail;
    }

    // 비교
    if (query.flags.compare) {
      var peak = purchases.monthly.slice().sort(function (a, b) { return b.qty - a.qty; })[0];
      var low = purchases.monthly.slice().sort(function (a, b) { return a.qty - b.qty; })[0];
      return yearLabel + " 구매 비교\n" +
        "최대 입고: " + peak.month + " (" + formatCompact(peak.qty) + ", 단가 " + formatNumber(peak.avgUnitPrice, 1) + ")\n" +
        "최소 입고: " + low.month + " (" + formatCompact(low.qty) + ", 단가 " + formatNumber(low.avgUnitPrice, 1) + ")";
    }

    // 추이
    if (query.flags.trend) {
      var trendDetail = yearLabel + " 월별 구매 추이";
      purchases.monthly.forEach(function (r) {
        trendDetail += "\n" + r.month + ": " + formatCompact(r.qty) + " (단가 " + formatNumber(r.avgUnitPrice, 1) + ")";
      });
      return trendDetail;
    }

    // 기본: 누계
    return yearLabel + " 구매실적 누계\n" +
      "입고량: " + purchases.totalQtyDisplay + "\n" +
      "입고금액: " + purchases.totalAmountDisplay + "\n" +
      "평균 매입 단가: " + purchases.avgUnitPriceDisplay;
  }

  function buildVerifiedGradeAnswer(query, yearLabel) {
    var gradeData = getGradeImportData();
    if (!gradeData?.comparisonTable?.length) {
      var incheonAllocation = getIncheonAllocationData();
      if (incheonAllocation?.gradeMix?.length) {
        return yearLabel + " 인천공장 등급 구성\n" +
          incheonAllocation.gradeMix.map(function (row) {
            return row.name + ": " + formatNumber(row.qty) + "톤 (" + formatPercent(row.share, 1) + ")";
          }).join("\n");
      }
      return yearLabel + " 등급 데이터가 없습니다.";
    }

    var result = yearLabel + " 등급별 비중";
    gradeData.comparisonTable.forEach(function (row) {
      var line = "\n" + row.category + ": " + formatPercent(row.currentShare, 2) +
        " (" + formatNumber(row.currentQty) + "톤)";
      if (row.compareShare != null && row.compareShare > 0) {
        var diff = roundNumber(row.currentShare - row.compareShare, 2);
        line += " [전년 " + formatPercent(row.compareShare, 2) + ", " +
          (diff >= 0 ? "+" : "") + formatNumber(diff, 2) + "%p]";
      }
      result += line;
    });

    if (gradeData.lowTurningRatio != null) {
      result += "\n\n국고하+선반설 비율: " + formatPercent(gradeData.lowTurningRatio, 2);
      if (gradeData.compareLowTurningRatio != null) {
        result += " (전년 " + formatPercent(gradeData.compareLowTurningRatio, 2);
        if (gradeData.deltaShare != null) {
          result += ", " + (gradeData.deltaShare >= 0 ? "+" : "") + formatNumber(gradeData.deltaShare, 2) + "%p";
        }
        result += ")";
      }
    }
    return result;
  }

  function buildVerifiedImportAnswer(query, yearLabel) {
    var shipments = getImportShipmentRows(getSelectedYear());
    if (!shipments.length) {
      return yearLabel + " 수입 현황 데이터가 없습니다.";
    }

    // 월 필터
    var filtered = shipments;
    if (query.months.length) {
      filtered = shipments.filter(function (r) {
        var shipMonth = new Date(r.shipDate).getMonth();
        return query.months.includes(shipMonth);
      });
      if (!filtered.length) return chatRangeLabel(query) + " 수입 데이터가 없습니다.";
    }

    var totalQty = filtered.reduce(function (sum, r) { return sum + r.qty; }, 0);
    var avgCfr = roundNumber(filtered.reduce(function (sum, r) { return sum + r.cfr; }, 0) / filtered.length, 1);
    var statusCounts = {};
    filtered.forEach(function (r) { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
    var statusText = Object.entries(statusCounts).map(function (e) { return e[0] + " " + e[1] + "건"; }).join(", ");

    var headerLabel = query.months.length ? chatRangeLabel(query) : yearLabel;
    var result = headerLabel + " 수입 현황\n" +
      "건수: " + filtered.length + "건\n" +
      "수입량: " + formatNumber(totalQty) + "톤\n" +
      "평균 CFR: $" + formatNumber(avgCfr, 1) + "\n" +
      "상태별: " + statusText;

    // 상세 목록 (10건 이하)
    if (filtered.length <= 10) {
      result += "\n\n[상세 내역]";
      filtered.forEach(function (r) {
        result += "\n" + r.contractNo + " | " + r.country + " " + r.supplier +
          " | " + r.grade + " " + formatNumber(r.qty) + "톤 | CFR $" + r.cfr + " | " + r.status;
      });
    }
    return result;
  }

  function buildVerifiedSupplierAnswer(query, yearLabel) {
    // 특정 거래처명 검색
    if (query.supplierName) {
      var suppliersTable = getSectionData("suppliers")?.table || [];
      var found = suppliersTable.find(function (s) { return s.supplier === query.supplierName; });
      if (found) {
        var result = query.supplierName + " 거래처 현황\n" +
          "연간 입고량: " + formatCompact(found.totalQty) + "\n" +
          "연간 입고금액: " + formatCompact(found.totalAmount) + "\n" +
          "평균 단가: " + formatNumber(found.avgUnitPrice, 1) + "\n" +
          "점유율: " + formatPercent(found.share, 1) + "\n" +
          "납품 성과율: " + formatPercent(found.performanceRate, 1) + "\n" +
          "신뢰등급: " + found.trustGrade + "\n" +
          "주력 등급: " + (found.dominantMacro || "-");
        if (found.monthlySeries?.length) {
          result += "\n\n[월별 입고량]";
          found.monthlySeries.forEach(function (qty, i) {
            result += "\n" + (i + 1) + "월: " + formatCompact(qty);
          });
        }
        return result;
      }
      var adminFound = state.supplierAdminItems.find(function (s) { return s.name === query.supplierName; });
      if (adminFound) {
        return query.supplierName + " 거래처 정보\n" +
          "지역: " + adminFound.region + "\n" +
          "월 처리능력: " + formatNumber(adminFound.monthlyCapacity) + "톤\n" +
          "연간 납품량: " + formatNumber(adminFound.yearlySupply) + "톤\n" +
          "신뢰등급: " + adminFound.trustGrade + "\n" +
          "납품 성과율: " + formatPercent(adminFound.performanceRate, 1);
      }
      return "'" + query.supplierName + "' 거래처 정보를 찾을 수 없습니다.";
    }

    // 전체 거래처 현황 - 대시보드 거래처 테이블 우선
    var allSuppliers = getSectionData("suppliers")?.table || [];
    if (allSuppliers.length) {
      var totalQty = allSuppliers.reduce(function (s, r) { return s + r.totalQty; }, 0);
      var res = yearLabel + " 거래처별 실적\n" +
        "거래처 수: " + allSuppliers.length + "개사\n" +
        "총 입고량: " + formatCompact(totalQty);
      allSuppliers.forEach(function (s) {
        res += "\n\n" + s.supplier + ": " + formatCompact(s.totalQty) +
          " (점유율 " + formatPercent(s.share, 1) + ", " + s.trustGrade + "등급, 단가 " + formatNumber(s.avgUnitPrice, 1) + ")";
      });
      return res;
    }

    // fallback: 거래처 관리 목록
    var suppliers = state.supplierAdminItems || [];
    if (!suppliers.length) return "등록된 거래처 데이터가 없습니다.";
    var totalSupply = suppliers.reduce(function (sum, item) { return sum + (Number(item.yearlySupply) || 0); }, 0);
    var avgPerf = getSupplierAdminAveragePerformance();
    var top = suppliers.slice().sort(function (a, b) { return b.yearlySupply - a.yearlySupply; })[0];
    return yearLabel + " 거래처 현황\n" +
      "등록 거래처: " + suppliers.length + "개사\n" +
      "연간 납품량 합계: " + formatNumber(totalSupply) + "톤\n" +
      "평균 성과율: " + formatPercent(avgPerf, 1) + "\n" +
      "최대 납품: " + top.name + " (" + formatNumber(top.yearlySupply) + "톤)";
  }

  function buildVerifiedAllocationAnswer(query, yearLabel) {
    var allocation = getSectionData("allocation");
    if (!allocation?.monthly?.length) {
      return yearLabel + " 공장 배분 데이터가 없습니다.";
    }

    // 단일 월
    if (query.months.length === 1) {
      var row = allocation.monthly[query.months[0]];
      if (!row) return (query.months[0] + 1) + "월 공장 배분 데이터가 없습니다.";
      if (query.factory === "인천") {
        return row.month + " 인천 공장 배분\n" +
          "계획: " + formatNumber(row.incheonPlan) + "톤\n" +
          "실적: " + formatNumber(row.incheonActual) + "톤\n" +
          "달성률: " + formatPercent(row.incheonRate, 1);
      }
      if (query.factory === "포항") {
        return row.month + " 포항 공장 배분\n" +
          "계획: " + formatNumber(row.pohangPlan) + "톤\n" +
          "실적: " + formatNumber(row.pohangActual) + "톤\n" +
          "달성률: " + formatPercent(row.pohangRate, 1);
      }
      return row.month + " 공장 배분\n" +
        "인천: 계획 " + formatNumber(row.incheonPlan) + "톤 / 실적 " + formatNumber(row.incheonActual) + "톤 (달성률 " + formatPercent(row.incheonRate, 1) + ")\n" +
        "포항: 계획 " + formatNumber(row.pohangPlan) + "톤 / 실적 " + formatNumber(row.pohangActual) + "톤 (달성률 " + formatPercent(row.pohangRate, 1) + ")";
    }

    // 복수 월 / 범위
    var rm = chatRangeMonths(query);
    if (rm && rm.length > 1) {
      var rows = rm.map(function (mi) { return allocation.monthly[mi]; }).filter(Boolean);
      if (!rows.length) return chatRangeLabel(query) + " 공장 배분 데이터가 없습니다.";
      var sIP = rows.reduce(function (s, r) { return s + r.incheonPlan; }, 0);
      var sIA = rows.reduce(function (s, r) { return s + r.incheonActual; }, 0);
      var sPP = rows.reduce(function (s, r) { return s + r.pohangPlan; }, 0);
      var sPA = rows.reduce(function (s, r) { return s + r.pohangActual; }, 0);
      var lbl = yearLabel + " " + chatRangeLabel(query);
      if (query.factory === "인천") {
        return lbl + " 인천 공장 배분\n" +
          "계획: " + formatNumber(sIP) + "톤 / 실적: " + formatNumber(sIA) + "톤\n" +
          "달성률: " + formatPercent(percent(sIA, sIP), 1);
      }
      if (query.factory === "포항") {
        return lbl + " 포항 공장 배분\n" +
          "계획: " + formatNumber(sPP) + "톤 / 실적: " + formatNumber(sPA) + "톤\n" +
          "달성률: " + formatPercent(percent(sPA, sPP), 1);
      }
      return lbl + " 공장 배분\n" +
        "인천: 계획 " + formatNumber(sIP) + "톤 / 실적 " + formatNumber(sIA) + "톤 (달성률 " + formatPercent(percent(sIA, sIP), 1) + ")\n" +
        "포항: 계획 " + formatNumber(sPP) + "톤 / 실적 " + formatNumber(sPA) + "톤 (달성률 " + formatPercent(percent(sPA, sPP), 1) + ")";
    }

    // 전체 - 특정 공장
    if (query.factory === "인천") {
      var iResult = yearLabel + " 인천 공장 배분\n" +
        "계획: " + formatNumber(allocation.incheon.planTotal) + "톤\n" +
        "실적: " + formatNumber(allocation.incheon.actualTotal) + "톤\n" +
        "달성률: " + formatPercent(allocation.incheon.achievementRate, 1);
      var incheonData = getIncheonAllocationData();
      if (incheonData?.gradeMix?.length) {
        iResult += "\n\n[등급 구성]";
        incheonData.gradeMix.forEach(function (g) {
          iResult += "\n" + g.name + ": " + formatNumber(g.qty) + "톤 (" + formatPercent(g.share, 1) + ")";
        });
      }
      return iResult;
    }
    if (query.factory === "포항") {
      var pResult = yearLabel + " 포항 공장 배분\n" +
        "계획: " + formatNumber(allocation.pohang.planTotal) + "톤\n" +
        "실적: " + formatNumber(allocation.pohang.actualTotal) + "톤\n" +
        "달성률: " + formatPercent(allocation.pohang.achievementRate, 1);
      if (allocation.pohang.gradeMix?.length) {
        pResult += "\n\n[등급 구성]";
        allocation.pohang.gradeMix.forEach(function (g) {
          pResult += "\n" + g.name + ": " + formatNumber(g.qty) + "톤 (" + formatPercent(g.share, 1) + ")";
        });
      }
      return pResult;
    }

    // 전체 공장
    return yearLabel + " 공장 배분 현황\n" +
      "인천: 계획 " + formatNumber(allocation.incheon.planTotal) + "톤 / 실적 " + formatNumber(allocation.incheon.actualTotal) + "톤 (달성률 " + formatPercent(allocation.incheon.achievementRate, 1) + ")\n" +
      "포항: 계획 " + formatNumber(allocation.pohang.planTotal) + "톤 / 실적 " + formatNumber(allocation.pohang.actualTotal) + "톤 (달성률 " + formatPercent(allocation.pohang.achievementRate, 1) + ")";
  }

  function verifyGeneratedChatAnswer(answer) {
    return typeof answer === "string" && answer.trim().length > 0 && !/undefined|null|NaN/.test(answer);
  }

  function generateVerifiedChatResponse(text) {
    var query = parseVerifiedChatQuery(text);
    var yearLabel = getSelectedYear() + "년";
    var intentOrder = getVerifiedChatIntentOrder(query);

    for (var index = 0; index < intentOrder.length; index += 1) {
      var candidate = "";
      switch (intentOrder[index]) {
        case "plan": candidate = buildVerifiedPlanAnswer(query, yearLabel); break;
        case "purchase": candidate = buildVerifiedPurchaseAnswer(query, yearLabel); break;
        case "grade": candidate = buildVerifiedGradeAnswer(query, yearLabel); break;
        case "import": candidate = buildVerifiedImportAnswer(query, yearLabel); break;
        case "supplier": candidate = buildVerifiedSupplierAnswer(query, yearLabel); break;
        case "allocation": candidate = buildVerifiedAllocationAnswer(query, yearLabel); break;
        case "overview": candidate = buildVerifiedOverviewAnswer(query, yearLabel); break;
      }
      if (verifyGeneratedChatAnswer(candidate)) {
        return candidate;
      }
    }

    return "질문을 정확히 이해하지 못했습니다.\n아래와 같이 질문해 보세요:\n" +
      "- \"7월 계획과 실적은?\"\n" +
      "- \"상반기 구매 현황\"\n" +
      "- \"1분기 달성률\"\n" +
      "- \"등급별 비중\"\n" +
      "- \"일보앤틱 거래처 현황\"\n" +
      "- \"인천 공장 배분\"\n" +
      "- \"수입 현황\"\n" +
      "- \"전체 현황 요약\"";
  }

  function addChatMessage(container, text, role) {
    const div = document.createElement("div");
    div.className = "chatbot-msg " + role;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function renderChatSuggestions(messages, handleChatSend) {
    const existing = messages.querySelector(".chatbot-suggestions");
    if (existing) { existing.remove(); }
    const suggestions = document.createElement("div");
    suggestions.className = "chatbot-suggestions";
    const chips = ["7월 계획과 실적은?", "1분기 달성률", "상반기 구매 현황", "등급별 비중", "거래처별 실적", "전체 현황 요약"];
    chips.forEach(function (chipText) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chatbot-chip";
      btn.textContent = chipText;
      btn.addEventListener("click", function () { handleChatSend(chipText); });
      suggestions.appendChild(btn);
    });
    messages.appendChild(suggestions);
    messages.scrollTop = messages.scrollHeight;
  }

  function setupChatbot() {
    const popup = document.getElementById("chatbotPopup");
    const fab = document.getElementById("chatbotFab");
    const closeBtn = document.getElementById("chatbotCloseBtn");
    const resetBtn = document.getElementById("chatbotResetBtn");
    const messages = document.getElementById("chatbotMessages");
    const input = document.getElementById("chatbotInput");
    const sendBtn = document.getElementById("chatbotSendBtn");
    if (!popup || !fab || !messages || !input || !sendBtn) { return; }

    function togglePopup() {
      const isOpen = popup.classList.contains("open");
      popup.classList.toggle("open");
      fab.classList.toggle("active", !isOpen);
      if (!isOpen) { input.focus(); }
    }

    function resetChat() {
      messages.innerHTML = "";
      addChatMessage(messages, "안녕하세요! " + getSelectedYear() + "년 대시보드 데이터에 대해 질문해 주세요.", "bot");
      renderChatSuggestions(messages, handleChatSend);
    }

    function handleChatSend(text) {
      const question = (text || input.value).trim();
      if (!question) { return; }
      input.value = "";
      const chipContainer = messages.querySelector(".chatbot-suggestions");
      if (chipContainer) { chipContainer.remove(); }
      addChatMessage(messages, question, "user");
      const answer = generateVerifiedChatResponse(question);
      addChatMessage(messages, answer, "bot");
    }

    fab.addEventListener("click", togglePopup);
    if (closeBtn) { closeBtn.addEventListener("click", togglePopup); }
    if (resetBtn) { resetBtn.addEventListener("click", resetChat); }
    sendBtn.addEventListener("click", function () { handleChatSend(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handleChatSend(); }
    });

    resetChat();
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
    setupChatbot();
    attachEvents();

    const url = new URL(location.href);
    const requestedTab =
      url.searchParams.get("tab") || location.hash.replace("#", "");
    const initialTab = tabLabels[requestedTab] ? requestedTab : "plan";
    setActiveTab(initialTab);
    renderActiveTab(initialTab);

    document.addEventListener("themeChanged", function() {
      var tab = document.querySelector(".tab-content.active");
      if (tab) {
        renderActiveTab(tab.id.replace("tab-", ""));
      }
    });
  }

  // 마이그레이션 함수
  window.startDataMigration = async function() {
    const banner = document.querySelector("div[style*='ffc107']");
    if (banner) banner.remove();

    const migrationStatus = document.createElement("div");
    migrationStatus.style.cssText =
      "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:1px solid #ccc;border-radius:8px;padding:24px;z-index:10001;min-width:300px;box-shadow:0 4px 12px rgba(0,0,0,0.15);";
    migrationStatus.innerHTML = "<strong>데이터 업로드 중...</strong><p>잠시만 기다려주세요.</p>";
    document.body.appendChild(migrationStatus);

    try {
      const supabase = window.appStorage.supabaseClient;
      let uploaded = 0;
      let total = 6; // noticesData, schedulesData, supplierAdminItems, gradeMacroMappings, planClipboardDataByYear, transactions

      const updateStatus = (msg) => {
        migrationStatus.innerHTML = `<strong>데이터 업로드 중...</strong><p>${msg} (${uploaded}/${total})</p>`;
      };

      // 1. gradeMacroMappings
      const gradeMappings = state.gradeMappings || {};
      if (Object.keys(gradeMappings).length > 0) {
        updateStatus("등급 매핑");
        await supabase
          .from("grade_mappings")
          .upsert({ id: 1, mappings: gradeMappings }, { onConflict: "id" });
      }
      uploaded++;

      // 2. supplierAdminItems
      const suppliers = (state.supplierAdminItems && state.supplierAdminItems.data) || [];
      if (suppliers.length > 0) {
        updateStatus("공급업체 정보");
        await supabase
          .from("supplier_admins")
          .delete()
          .neq("code", "");
        await supabase.from("supplier_admins").insert(
          suppliers.map((s) => ({
            code: s.code,
            name: s.name,
            region: s.region,
            owner: s.owner,
            phone: s.phone,
            monthly_capacity: s.monthlyCapacity || 0,
            yearly_supply: s.yearlySupply || 0,
            trust_grade: s.trustGrade || "B",
            performance_rate: s.performanceRate || 0
          }))
        );
      }
      uploaded++;

      // 3. planClipboardDataByYear
      const planData = state.planClipboardDataByYear || {};
      if (Object.keys(planData).length > 0) {
        updateStatus("수급계획");
        for (const [year, data] of Object.entries(planData)) {
          await supabase.from("plan_data").upsert({
            year,
            pasted_at: data.pastedAt,
            monthly: data.monthly
          }, { onConflict: "year" });
        }
      }
      uploaded++;

      // 4. noticesData
      const notices = (state.notices && state.notices.data) || [];
      if (notices.length > 0) {
        updateStatus("공지사항");
        await supabase.from("notices").delete().neq("id", "");
        await supabase.from("notices").insert(
          notices.map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            author: n.author,
            password: n.password,
            pinned: n.pinned || false,
            created_at: n.createdAt
          }))
        );
      }
      uploaded++;

      // 5. schedulesData
      const schedules = (state.schedules && state.schedules.data) || [];
      if (schedules.length > 0) {
        updateStatus("일정");
        await supabase.from("schedules").delete().neq("id", "");
        await supabase.from("schedules").insert(
          schedules.map((s) => ({
            id: s.id,
            member: s.member,
            type: s.type,
            start_date: s.startDate,
            end_date: s.endDate,
            memo: s.memo
          }))
        );
      }
      uploaded++;

      // 6. rawTransactionDataByYear
      const transactions = state.rawTransactionsByYear || {};
      if (Object.keys(transactions).length > 0) {
        updateStatus("거래 데이터");
        for (const [year, txList] of Object.entries(transactions)) {
          if (Array.isArray(txList) && txList.length > 0) {
            await supabase.from("transactions").delete().eq("year", Number(year));
            const BATCH_SIZE = 5000;
            for (let i = 0; i < txList.length; i += BATCH_SIZE) {
              const batch = txList.slice(i, i + BATCH_SIZE).map((tx) => ({
                year: Number(year),
                date: tx.date,
                month: tx.month,
                supplier: tx.supplier,
                detailed_grade: tx.detailedGrade,
                macro: tx.macro || "기타",
                unit_price: tx.unitPrice || 0,
                amount: tx.amount || 0,
                qty: tx.qty || 0
              }));
              await supabase.from("transactions").insert(batch, {
                count: "estimated",
                head: false
              });
            }
          }
        }
      }
      uploaded++;

      // 완료
      localStorage.setItem("__supabase_migrated", "1");
      migrationStatus.innerHTML =
        "<strong>✓ 데이터 업로드 완료!</strong><p>페이지가 새로고침됩니다.</p>";
      setTimeout(() => {
        location.reload();
      }, 1500);
    } catch (err) {
      console.error("Migration error:", err);
      migrationStatus.innerHTML =
        "<strong>✗ 업로드 중 오류 발생</strong><p>" + err.message + "</p>" +
        '<button onclick="this.parentElement.remove();" style="margin-top:12px;padding:6px 12px;background:#fff;border:1px solid #333;border-radius:4px;cursor:pointer;">닫기</button>';
    }
  };

  // 앱 초기화 실행
  init();
}

(function () {
  const data = window.dashboardData;
  if (!data) {
    document.body.innerHTML = "<p style='padding:24px'>대시보드 데이터를 불러오지 못했습니다.</p>";
    return;
  }

  const chartInstances = {};
  const state = {
    supplierQuery: "",
    supplierGrade: "all",
    tableSort: {},
    planOverride: null
  };
  const DEFAULT_USER_DISPLAY = "동국제강 원료기획팀 | 이돈석 팀장님";
  const LEGACY_USER_DISPLAY = "동국제강 원료기획팀 | 이동석 팀장님";
  const PLAN_PASTE_STORAGE_KEY = "planClipboardData";
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

  const tabLabels = {
    plan: "수급계획",
    suppliers: "거래처관리",
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
        state.planOverride = null;
        return;
      }
      const parsed = JSON.parse(raw);
      state.planOverride = normalizePlanOverrideData(parsed);
      if (!state.planOverride) {
        localStorage.removeItem(PLAN_PASTE_STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(PLAN_PASTE_STORAGE_KEY);
      state.planOverride = null;
    }
  }

  function savePlanOverride(dataset) {
    state.planOverride = dataset;
    localStorage.setItem(PLAN_PASTE_STORAGE_KEY, JSON.stringify(dataset));
  }

  function clearPlanOverride() {
    state.planOverride = null;
    localStorage.removeItem(PLAN_PASTE_STORAGE_KEY);
  }

  function getActivePlanData() {
    return state.planOverride || data.plan;
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

    if (!state.planOverride) {
      status.textContent = "현재는 기본 수급계획 데이터를 사용 중입니다.";
      return;
    }

    const pastedAt = new Date(state.planOverride.pastedAt);
    status.textContent =
      `최근 붙여넣기 적용: ${pastedAt.toLocaleString("ko-KR")} | 인천/포항 계획·실적 4개 행을 월별 합산해 반영했습니다.`;
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
    clearPlanPasteGrid();
    if (state.planOverride) {
      fillPlanPasteGrid(state.planOverride);
    }
    updatePlanPasteStatus();

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

    if (!state.planOverride) {
      document.querySelectorAll(".plan-paste-cell").forEach((input) => {
        input.classList.remove("has-value");
      });
    }
  }

  function getFilteredSuppliers() {
    const query = state.supplierQuery.trim().toLowerCase();
    return data.suppliers.table.filter((item) => {
      const matchQuery =
        !query ||
        item.supplier.toLowerCase().includes(query) ||
        item.dominantMacro.toLowerCase().includes(query) ||
        item.trustGrade.toLowerCase().includes(query);
      const matchGrade = state.supplierGrade === "all" || item.dominantMacro === state.supplierGrade;
      return matchQuery && matchGrade;
    });
  }

  function renderSupplierTable() {
    const rows = getFilteredSuppliers();
    const table = document.querySelector('table[data-export="suppliers"]');
    const tbody = document.getElementById("supplierTable");
    document.getElementById("supplierResultMeta").textContent =
      `전체 ${data.suppliers.table.length}개 중 ${rows.length}개 거래처`;

    if (!rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">조건에 맞는 거래처가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(
        (item) => `
          <tr>
            <td>${item.supplier}</td>
            <td class="text-right">${formatNumber(item.totalQty)}</td>
            <td class="text-right">${formatNumber(item.totalAmount)}</td>
            <td class="text-right">${formatNumber(item.avgUnitPrice, 1)}</td>
            <td class="text-right">${formatPercent(item.share, 2)}</td>
            <td>${item.dominantMacro}</td>
            <td><span class="${badgeClass(item.trustGrade)}">${item.trustGrade}</span></td>
            <td class="text-right">${formatPercent(item.performanceRate, 1)}</td>
          </tr>
        `
      )
      .join("");

    applyTableSort(table);
  }

  function setupSupplierFilters() {
    const search = document.getElementById("supplierSearch");
    const select = document.getElementById("supplierGradeFilter");
    const reset = document.getElementById("supplierFilterReset");

    const grades = [...new Set(data.suppliers.table.map((item) => item.dominantMacro))];
    select.innerHTML =
      '<option value="all">모든 주력 등급</option>' +
      grades.map((grade) => `<option value="${grade}">${grade}</option>`).join("");

    search.addEventListener("input", (event) => {
      state.supplierQuery = event.target.value;
      renderSupplierTable();
    });

    select.addEventListener("change", (event) => {
      state.supplierGrade = event.target.value;
      renderSupplierTable();
    });

    reset.addEventListener("click", () => {
      state.supplierQuery = "";
      state.supplierGrade = "all";
      search.value = "";
      select.value = "all";
      renderSupplierTable();
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
    document.getElementById("dataBanner").innerHTML = `
      <strong>분석 기준</strong><br>
      대상 조직: 동국제강 원료기획팀<br>
      원본 파일: 첨부 엑셀 및 요청 슬라이드 기준<br>
      생성 시각: ${generatedAt.toLocaleString("ko-KR")}<br>
      ${data.meta.displayNote}
    `;
    document.getElementById("footerNote").textContent =
      "참고 사이트의 헤더/탭/카드/차트 스타일을 유지하고, 첨부 파일에 없는 거래처 메타 정보는 raw data 기반 파생 지표로 대체했습니다.";
  }

  function renderPlan() {
    const planData = getActivePlanData();
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
        state.planOverride ? "엑셀 복붙 기준 연간 계획 합계" : "요청 슬라이드의 2024년 연간목표",
        ""
      ),
      kpiCard(
        "누계 실적",
        `${formatCompact(cumulativeActual)}<small>톤</small>`,
        state.planOverride ? "붙여넣은 실적 누계" : "1번 화면 실적 누계",
        "accent"
      ),
      kpiCard(
        "계획 대비 달성률",
        `${formatPercent(attainmentRate, 1)}<small></small>`,
        "월 누계 계획 대비 누계 실적",
        "success"
      ),
      kpiCard(
        "거래처 평균 성과율",
        `${data.overview.supplierPerformanceAvgDisplay}<small></small>`,
        "3번 화면 납품 성과율 평균",
        "warning"
      )
    ].join("");

    document.getElementById("planLatestRate").innerHTML = `<strong>12월 누계</strong> ${formatPercent(
      planRows[planRows.length - 1].achievementRate,
      1
    )}`;

    document.getElementById("planHighlights").innerHTML = [
      miniStat(
        "최고 실적 월",
        `${bestMonth.month} 실적이 가장 높습니다.`,
        `${formatCompact(bestMonth.actual)}톤`
      ),
      miniStat(
        "최저 달성률 월",
        `${weakestMonth.month} 누계 달성률이 가장 낮았습니다.`,
        formatPercent(weakestMonth.achievementRate, 1)
      ),
      miniStat(
        "계획 미달 월 수",
        "월 계획 대비 월 실적이 낮았던 구간입니다.",
        `${underTargetCount}개월`
      ),
      miniStat(
        "최종 누계 상태",
        "연간 종료 시점 누계 기준",
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
            order: 2,
            valueLabelSkip: true
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
  }

  function renderSuppliers() {
    const suppliers = data.suppliers.table;
    const totalSuppliers = suppliers.length;
    const topSupplier = suppliers[0];
    const totalShare = topSupplier.share;
    const bestTrustSupplier = [...suppliers].sort(
      (left, right) => right.performanceRate - left.performanceRate
    )[0];
    const avgPerformance = data.suppliers.averagePerformance;

    document.getElementById("supplierKpis").innerHTML = [
      kpiCard("활성 거래처", `${totalSuppliers}<small>곳</small>`, "2024 raw data 기준", ""),
      kpiCard(
        "평균 납품 성과율",
        `${formatPercent(avgPerformance, 1)}<small></small>`,
        "슬라이드 KPI 연계값",
        "accent"
      ),
      kpiCard(
        "최대 점유 거래처",
        `${topSupplier.supplier}<small></small>`,
        `점유율 ${formatPercent(totalShare, 1)}`,
        "success"
      ),
      kpiCard(
        "최고 신뢰 등급",
        `${bestTrustSupplier.trustGrade}<small></small>`,
        `${bestTrustSupplier.supplier} / 성과율 ${formatPercent(
          bestTrustSupplier.performanceRate,
          1
        )}`,
        "warning"
      )
    ].join("");

    renderSupplierTable();

    makeBarChart("supplierShareChart", "supplierShareChart", {
      type: "doughnut",
      data: {
        labels: data.suppliers.shareChart.map((item) => item.label),
        datasets: [
          {
            data: data.suppliers.shareChart.map((item) => item.value),
            backgroundColor: [colors.blue, colors.accent, colors.success, colors.violet],
            borderColor: "#ffffff",
            borderWidth: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.raw;
                const total = context.dataset.data.reduce((sum, current) => sum + current, 0);
                return `${context.label}: ${formatNumber(value)} (${formatPercent(
                  (value / total) * 100,
                  1
                )})`;
              }
            }
          },
          valueLabelPlugin: {
            enabled: false
          }
        }
      }
    });

    makeBarChart("supplierTrendChart", "supplierTrendChart", {
      type: "line",
      data: {
        labels: data.suppliers.trendChart.labels,
        datasets: data.suppliers.trendChart.series.map((series, index) => {
          const palette = [colors.blue, colors.accent, colors.success];
          return {
            label: series.name,
            data: series.data,
            borderColor: palette[index],
            backgroundColor: palette[index] + "22",
            tension: 0.28,
            fill: index === 0
          };
        })
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
              callback: (value) => formatCompact(value)
            }
          }
        }
      }
    });
  }

  function renderPurchases() {
    const monthly = data.purchases.monthly;
    const peakMonth = [...monthly].sort((left, right) => right.qty - left.qty)[0];
    const lowMonth = [...monthly].sort((left, right) => left.qty - right.qty)[0];
    const highestPrice = [...monthly].sort((left, right) => right.avgUnitPrice - left.avgUnitPrice)[0];
    const lowestPrice = [...monthly].sort((left, right) => left.avgUnitPrice - right.avgUnitPrice)[0];
    const averageSupplierCount =
      monthly.reduce((sum, row) => sum + row.supplierCount, 0) / monthly.length;

    document.getElementById("purchaseKpis").innerHTML = [
      kpiCard("누계 구매량", `${data.purchases.totalQtyDisplay}<small></small>`, "4번 화면 구매량의 합", ""),
      kpiCard(
        "누계 입고금액",
        `${data.purchases.totalAmountDisplay}<small></small>`,
        "4번 화면 금액의 누계",
        "accent"
      ),
      kpiCard(
        "평균 매입 단가",
        `${data.purchases.avgUnitPriceDisplay}<small></small>`,
        "누계 구매량 / 누계 입고금액",
        "success"
      ),
      kpiCard(
        "월 평균 거래처 수",
        `${formatNumber(averageSupplierCount, 1)}<small>곳</small>`,
        "2024 월별 raw data 기준",
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
    const allocation = data.allocation;
    document.getElementById("allocationKpis").innerHTML = [
      kpiCard(
        "인천 계획/실적",
        `${formatCompact(allocation.incheon.planTotal)}<small> / ${formatCompact(
          allocation.incheon.actualTotal
        )}</small>`,
        "sheet3 기준 인천공장 연간 합계",
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
        "sheet3 기준 포항공장 연간 합계",
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
    const gradeData = data.gradeImport;
    const primaryCategory = [...gradeData.mix2024].sort((left, right) => right.qty - left.qty)[0];
    const deltaClass = gradeData.deltaShare >= 0 ? "up" : "down";

    document.getElementById("gradeImportKpis").innerHTML = [
      kpiCard(
        "국고하 + 선반설 비율",
        `${formatPercent(gradeData.lowTurningRatio2024, 2)}<small></small>`,
        "2024 raw data 기준",
        ""
      ),
      kpiCard(
        "전년도 동일 비율",
        `${formatPercent(gradeData.lowTurningRatio2023, 2)}<small></small>`,
        "2023 raw data 기준",
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
        `2024 비중 ${formatPercent(primaryCategory.share, 2)}`,
        "warning"
      )
    ].join("");

    document.getElementById("gradeImportTable").innerHTML = gradeData.comparisonTable
      .map(
        (row) => `
          <tr>
            <td>${row.category}</td>
            <td class="text-right">${formatNumber(row.qty2024)}</td>
            <td class="text-right">${formatPercent(row.share2024, 2)}</td>
            <td class="text-right">${formatNumber(row.qty2023)}</td>
            <td class="text-right">${formatPercent(row.share2023, 2)}</td>
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
            label: "2024 비중",
            data: gradeData.comparisonTable.map((row) => row.share2024),
            backgroundColor: "rgba(26, 35, 126, 0.72)",
            borderRadius: 8
          },
          {
            label: "2023 비중",
            data: gradeData.comparisonTable.map((row) => row.share2023),
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
        labels: gradeData.monthlyFocusedRatio2024.map((row) => row.month),
        datasets: [
          {
            label: "2024 비율",
            data: gradeData.monthlyFocusedRatio2024.map((row) => row.ratio),
            borderColor: colors.primary,
            backgroundColor: "rgba(26, 35, 126, 0.15)",
            pointRadius: 4,
            tension: 0.25
          },
          {
            label: "2023 비율",
            data: gradeData.monthlyFocusedRatio2023.map((row) => row.ratio),
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
    if (tabName === "suppliers") {
      renderSuppliers();
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
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) {
      exportBtn.disabled = !document.querySelector(`#tab-${tabName} table[data-export]`);
    }
    history.replaceState(null, "", `#${tabName}`);
    requestAnimationFrame(() => {
      requestAnimationFrame(refreshCharts);
    });
  }

  function exportActiveTable() {
    const activeTab = document.querySelector(".tab-content.active");
    if (!activeTab) {
      return;
    }
    const table = activeTab.querySelector("table[data-export]");
    if (!table) {
      return;
    }

    const rows = [...table.querySelectorAll("tr")].map((row) =>
      [...row.children]
        .map((cell) => `"${cell.textContent.trim().replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = "\ufeff" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const activeKey = activeTab.id.replace("tab-", "");
    link.href = URL.createObjectURL(blob);
    link.download = `${tabLabels[activeKey]}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function attachEvents() {
    document.querySelectorAll(".tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveTab(button.dataset.tab);
        renderActiveTab(button.dataset.tab);
      });
    });

    document.getElementById("exportBtn").addEventListener("click", exportActiveTable);
    document.getElementById("logoutBtn").addEventListener("click", () => {
      sessionStorage.removeItem("loggedInUser");
      location.href = "login.html";
    });
  }

  function init() {
    window.refreshLoggedInUserDisplay = setDateAndUser;
    setupPlanPaste();
    setDateAndUser();
    setBanner();
    setupSortableTables();
    setupSupplierFilters();
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

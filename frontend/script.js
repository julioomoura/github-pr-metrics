// frontend/script.js

// --- DOM Elements ---
const bodyElement = document.body;
const themeToggleButton = document.getElementById("theme-toggle-btn");
const filtersForm = document.getElementById("filters-form");
const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const authorInput = document.getElementById("author");
const approverInput = document.getElementById("approver");
const targetBranchInput = document.getElementById("target-branch");
const statusInput = document.getElementById("status");
const excludeAuthorInput = document.getElementById("exclude-author");
const excludeBranchInput = document.getElementById("exclude-branch");
const clearFiltersButton = document.getElementById("clear-filters");
const forceRefreshButton = document.getElementById("force-refresh");
const toggleDetailsButton = document.getElementById("toggle-details-btn");
const loadingIndicator = document.getElementById("loading-indicator");
const errorMessageDiv = document.getElementById("error-message");
const summaryCountSpan = document.getElementById("summary-count");
const summaryOpenSpan = document.getElementById("summary-open");
const summaryMergedSpan = document.getElementById("summary-merged");
const summaryClosedSpan = document.getElementById("summary-closed");
const avgTimeToFirstReview = document.getElementById(
  "avg-time-to-first-review"
);
const avgTimeInDraft = document.getElementById("avg-time-in-draft");
const avgPrCycleTime = document.getElementById("avg-pr-cycle-time");
const avgReviewTime = document.getElementById("avg-review-time");
const avgMergeTime = document.getElementById("avg-merge-time");
const avgPrSize = document.getElementById("avg-pr-size");
const avgReviewDepth = document.getElementById("avg-review-depth");
const authorDatalist = document.getElementById("author-list");
const approverDatalist = document.getElementById("approver-list");
const branchDatalist = document.getElementById("branch-list");
const detailsSectionContainer = document.getElementById(
  "details-section-container"
);

let detailsTable = null;
let detailsTableHead = null;
let detailsTableBody = null;
let detailsLoadingIndicator = null;
let detailsErrorMessageDiv = null;
let columnTogglesContainer = null;
let detailsFilterInput = null;

// --- Constants ---
const LOCAL_STORAGE_KEY_THEME = "dashboardThemePreference";
const LOCAL_STORAGE_KEY_COLUMNS = "prDetailsColumnVisibility";
const TOGGLEABLE_COLUMNS = [
  {
    index: 2,
    label: "Autor",
    defaultVisible: true,
    sortable: true,
    type: "string",
  },
  {
    index: 3,
    label: "Status",
    defaultVisible: true,
    sortable: true,
    type: "string",
  },
  {
    index: 4,
    label: "Criado em",
    defaultVisible: true,
    sortable: true,
    type: "date",
  },
  {
    index: 5,
    label: "Branch Destino",
    defaultVisible: true,
    sortable: true,
    type: "string",
  },
  {
    index: 6,
    label: "Aprovador(es)",
    defaultVisible: true,
    sortable: true,
    type: "string",
  },
  {
    index: 7,
    label: "Tempo em Draft (h)",
    defaultVisible: true,
    sortable: true,
    type: "number",
  },
  {
    index: 8,
    label: "Tempo 1ª Revisão (h)",
    defaultVisible: true,
    sortable: true,
    type: "number",
  },
  {
    index: 9,
    label: "Tempo Revisão (h)",
    defaultVisible: true,
    sortable: true,
    type: "number",
  },
  {
    index: 10,
    label: "Tempo Merge (h)",
    defaultVisible: true,
    sortable: true,
    type: "number",
  },
  {
    index: 11,
    label: "Tempo Ciclo (h)",
    defaultVisible: true,
    sortable: true,
    type: "number",
  },
  {
    index: 12,
    label: "Tam. (Linhas)",
    defaultVisible: true,
    sortable: true,
    type: "number",
  },
  {
    index: 13,
    label: "Comentários",
    defaultVisible: true,
    sortable: true,
    type: "number",
  },
  {
    index: 14,
    label: "Mergeado em",
    defaultVisible: true,
    sortable: true,
    type: "date",
  },
];
const SORTABLE_COLUMNS_INFO = {
  0: { type: "number" },
  1: { type: "string" },
  ...Object.fromEntries(
    TOGGLEABLE_COLUMNS.filter((c) => c.sortable).map((c) => [
      c.index,
      { type: c.type },
    ])
  ),
};
const DEFAULT_HISTOGRAM_BINS = 10;

// --- Chart Instances ---
const chartInstances = {};

// --- State ---
let isDetailsVisible = false;
let currentDashboardData = null;
let currentSortColumnIndex = 4;
let currentSortDirection = "desc";
let currentTheme = "light";

// --- Utility Functions ---
function destroyChart(chartId) {
  if (chartInstances[chartId]) {
    chartInstances[chartId].destroy();
    delete chartInstances[chartId];
  }
}
function calculateAverage(arr, precision = 1) {
  if (!arr || arr.length === 0) return "--";
  const num = arr.filter((v) => typeof v === "number" && !isNaN(v));
  if (num.length === 0) return "--";
  const sum = num.reduce((a, v) => a + v, 0);
  return (sum / num.length).toFixed(precision);
}
function formatDate(dateInput) {
  if (!dateInput) return "--";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "--";
    if (
      typeof dateFns !== "undefined" &&
      dateFns.format &&
      dateFns.locale?.ptBR
    ) {
      return dateFns.format(d, "P p", { locale: dateFns.locale.ptBR });
    } else if (typeof dateFns !== "undefined" && dateFns.format) {
      console.warn("date-fns pt-BR locale not found, using default format.");
      return dateFns.format(d, "yyyy-MM-dd HH:mm");
    } else {
      console.warn("date-fns not found, using browser default locale string.");
      return d.toLocaleString("pt-BR");
    }
  } catch (e) {
    console.error("Error formatting date:", e);
    try {
      return new Date(dateInput).toLocaleDateString();
    } catch {
      return "--";
    }
  }
}
function formatHours(hours, precision = 1) {
  if (typeof hours !== "number" || isNaN(hours) || hours === null) {
    return "--";
  }
  return hours.toFixed(precision);
}
function showError(message) {
  errorMessageDiv.textContent = message;
  errorMessageDiv.style.display = "block";
  console.error("Dash Error:", message);
}
function hideError() {
  errorMessageDiv.style.display = "none";
  errorMessageDiv.textContent = "";
}
function showLoading() {
  loadingIndicator.style.display = "block";
  hideError();
}
function hideLoading() {
  loadingIndicator.style.display = "none";
}
function showDetailsError(message) {
  if (detailsErrorMessageDiv) {
    detailsErrorMessageDiv.textContent = message;
    detailsErrorMessageDiv.style.display = "block";
  }
  console.error("Details Error:", message);
}
function hideDetailsError() {
  if (detailsErrorMessageDiv) {
    detailsErrorMessageDiv.style.display = "none";
    detailsErrorMessageDiv.textContent = "";
  }
}
function showDetailsLoading() {
  if (detailsLoadingIndicator) {
    detailsLoadingIndicator.style.display = "block";
  }
  hideDetailsError();
  if (detailsTableBody) detailsTableBody.innerHTML = "";
}
function hideDetailsLoading() {
  if (detailsLoadingIndicator) {
    detailsLoadingIndicator.style.display = "none";
  }
}

// --- Theme Toggle Functions ---
function applyTheme(theme) {
  bodyElement.classList.toggle("dark-mode", theme === "dark");
  themeToggleButton.textContent = theme === "dark" ? "☀️" : "🌙";
  currentTheme = theme;
  updateChartDefaults(theme);
}
function loadThemePreference() {
  const pref = localStorage.getItem(LOCAL_STORAGE_KEY_THEME);
  applyTheme(pref || "light");
}
function saveThemePreference(theme) {
  localStorage.setItem(LOCAL_STORAGE_KEY_THEME, theme);
}
function toggleTheme() {
  const newTheme = currentTheme === "light" ? "dark" : "light";
  applyTheme(newTheme);
  saveThemePreference(newTheme);
  if (currentDashboardData) {
    updateDashboardAndCharts(currentDashboardData);
  }
}
function updateChartDefaults(theme) {
  const isDark = theme === "dark";
  const gridColor = isDark ? "rgba(240, 246, 252, 0.1)" : "rgba(0, 0, 0, 0.1)";
  const tickColor = isDark ? "#8b949e" : "#586069";
  const labelColor = isDark ? "#c9d1d9" : "#24292e";
  const tooltipBg = isDark
    ? "rgba(200, 200, 200, 0.9)"
    : "rgba(10, 10, 10, 0.8)";
  const tooltipColor = isDark ? "#1e1e1e" : "#ffffff";
  Chart.defaults.color = labelColor;
  Chart.defaults.borderColor = gridColor;
  Chart.defaults.scale.grid.color = gridColor;
  Chart.defaults.scale.ticks.color = tickColor;
  Chart.defaults.plugins.tooltip.backgroundColor = tooltipBg;
  Chart.defaults.plugins.tooltip.titleColor = tooltipColor;
  Chart.defaults.plugins.tooltip.bodyColor = tooltipColor;
}

// --- Chart Rendering ---

/** Renders Bar Chart */
function renderBarChart(
  chartId,
  labels,
  data,
  label,
  xAxisLabel = "",
  yAxisLabel = ""
) {
  destroyChart(chartId);
  const ctx = document.getElementById(chartId)?.getContext("2d");
  if (!ctx) return;
  const isDark = bodyElement.classList.contains("dark-mode");
  const accentColor = getComputedStyle(bodyElement)
    .getPropertyValue("--accent-color")
    .trim();
  const accentColorBg = isDark
    ? "rgba(88, 166, 255, 0.6)"
    : "rgba(0, 122, 204, 0.6)";

  chartInstances[chartId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: label,
          data: data,
          backgroundColor: accentColorBg,
          borderColor: accentColor,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: data.length > 1 && data.length < 20 } },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: !!yAxisLabel, text: yAxisLabel },
        },
        x: {
          title: { display: !!xAxisLabel, text: xAxisLabel },
          ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 },
        },
      },
    },
  });
}

/** Renders Histogram Chart */
function renderHistogramChart(
  chartId,
  dataPoints,
  label,
  numBins = DEFAULT_HISTOGRAM_BINS,
  xAxisLabel = "Valor",
  yAxisLabel = "Frequência"
) {
  destroyChart(chartId);
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const textColor = getComputedStyle(bodyElement)
    .getPropertyValue("--text-secondary")
    .trim();
  if (!dataPoints || dataPoints.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = textColor;
    ctx.fillText("N/A", canvas.width / 2, canvas.height / 2);
    return;
  }
  const validData = dataPoints.filter(
    (d) => typeof d === "number" && !isNaN(d)
  );
  if (validData.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = textColor;
    ctx.fillText("N/A", canvas.width / 2, canvas.height / 2);
    return;
  }
  const minVal = Math.min(...validData);
  let maxVal = Math.max(...validData);
  if (minVal === maxVal) {
    maxVal = minVal + numBins;
    if (minVal === 0 && maxVal === 0) maxVal = numBins;
  }
  const range = maxVal - minVal;
  const effectiveNumBins =
    range > 0 && range < numBins ? Math.max(1, Math.ceil(range)) : numBins;
  const binWidth = range === 0 ? 1 : Math.max(0.1, range / effectiveNumBins);
  const bins = new Array(effectiveNumBins).fill(0);
  const labels = new Array(effectiveNumBins);
  for (let i = 0; i < effectiveNumBins; i++) {
    const binStart = minVal + i * binWidth;
    const binEnd = binStart + binWidth;
    const precision = binWidth < 1 ? 1 : 0;
    labels[i] = `${binStart.toFixed(precision)}-${binEnd.toFixed(precision)}`;
  }
  validData.forEach((value) => {
    let binIndex = binWidth === 0 ? 0 : Math.floor((value - minVal) / binWidth);
    binIndex = Math.max(0, Math.min(binIndex, effectiveNumBins - 1));
    if (value === maxVal && binIndex < effectiveNumBins - 1) {
      binIndex = effectiveNumBins - 1;
    }
    if (binIndex >= 0 && binIndex < effectiveNumBins) {
      bins[binIndex]++;
    }
  });
  renderBarChart(chartId, labels, bins, label, xAxisLabel, yAxisLabel); // Uses themed bar chart render
}

/** Renders a Multi-Line Chart */
function renderMultiLineChart(
  chartId,
  datasets,
  xAxisLabel = "Data",
  yAxisLabel = "Contagem",
  timeUnit = "day"
) {
  destroyChart(chartId);
  const canvas = document.getElementById(chartId);
  if (!canvas) {
    console.error(`Canvas element with ID ${chartId} not found.`);
    return;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const chartDatasets = datasets.map((ds) => {
    ds.data.sort((a, b) => a.x - b.x);
    return {
      label: ds.label,
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: ds.color.replace(")", ", 0.1)").replace("rgb", "rgba"),
      tension: 0.1,
      pointRadius: 2,
      pointHoverRadius: 4,
      fill: true,
    };
  });

  if (chartDatasets.every((ds) => ds.data.length === 0)) {
    ctx.textAlign = "center";
    ctx.fillStyle = getComputedStyle(bodyElement)
      .getPropertyValue("--text-secondary")
      .trim();
    ctx.fillText("Nenhum dado disponível", canvas.width / 2, canvas.height / 2);
    return;
  }

  // Define adapter options only if locale is available
  const adapterOptions =
    typeof dateFns !== "undefined" && dateFns.locale?.ptBR
      ? { date: { locale: dateFns.locale.ptBR } }
      : {};

  chartInstances[chartId] = new Chart(ctx, {
    type: "line",
    data: { datasets: chartDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: timeUnit,
            tooltipFormat: "P",
            displayFormats: { [timeUnit]: "P" },
          },
          title: { display: !!xAxisLabel, text: xAxisLabel },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 10,
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          title: { display: !!yAxisLabel, text: yAxisLabel },
        },
      },
      adapters: adapterOptions,
    },
  });
}

// --- Column Toggle Functions ---
function loadColumnVisibility() {
  try {
    const s = localStorage.getItem(LOCAL_STORAGE_KEY_COLUMNS);
    if (s) {
      const p = JSON.parse(s);
      if (typeof p === "object" && p !== null) {
        const v = {};
        let u = false;
        TOGGLEABLE_COLUMNS.forEach((c) => {
          const sv = p[c.index];
          if (typeof sv === "boolean") {
            v[c.index] = sv;
          } else {
            v[c.index] = c.defaultVisible;
            u = true;
          }
        });
        for (const k in p) {
          if (!TOGGLEABLE_COLUMNS.some((c) => c.index === parseInt(k, 10))) {
            u = true;
          }
        }
        if (u) {
          saveColumnVisibility(v);
        }
        return v;
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY_COLUMNS);
      }
    }
  } catch (e) {
    localStorage.removeItem(LOCAL_STORAGE_KEY_COLUMNS);
  }
  const d = {};
  TOGGLEABLE_COLUMNS.forEach((c) => {
    d[c.index] = c.defaultVisible;
  });
  return d;
}
function saveColumnVisibility(visibility) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_COLUMNS, JSON.stringify(visibility));
  } catch (e) {
    console.error("Err save visibility:", e);
  }
}
function setColumnVisibility(columnIndex, isVisible) {
  if (!detailsTable) return;
  const cells = detailsTable.querySelectorAll(
    `th[data-column-index="${columnIndex}"], td[data-column-index="${columnIndex}"]`
  );
  cells.forEach((cell) => {
    cell.classList.toggle("column-hidden", !isVisible);
  });
  if (columnTogglesContainer) {
    const button = columnTogglesContainer.querySelector(
      `button[data-column-index="${columnIndex}"]`
    );
    if (button) {
      button.classList.toggle("active", isVisible);
    }
  }
}
function createColumnToggles(initialVisibility) {
  if (!columnTogglesContainer) return;
  columnTogglesContainer.innerHTML = "";
  TOGGLEABLE_COLUMNS.forEach((col) => {
    const isVisible = initialVisibility[col.index] ?? col.defaultVisible;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle-button";
    button.dataset.columnIndex = col.index;
    button.textContent = col.label;
    button.classList.toggle("active", isVisible);
    button.addEventListener("click", (event) => {
      const btn = event.target;
      const index = parseInt(btn.dataset.columnIndex, 10);
      const currentVisibility = loadColumnVisibility();
      const newVisibility = !(currentVisibility[index] ?? col.defaultVisible);
      setColumnVisibility(index, newVisibility);
      currentVisibility[index] = newVisibility;
      saveColumnVisibility(currentVisibility);
    });
    columnTogglesContainer.appendChild(button);
  });
}

// --- Details Table Sorting and Filtering ---
function sortPrList(columnIndex, direction) {
  if (!currentDashboardData?.prList || !SORTABLE_COLUMNS_INFO[columnIndex]) {
    return;
  }
  const { type } = SORTABLE_COLUMNS_INFO[columnIndex];
  const sortMultiplier = direction === "asc" ? 1 : -1;
  currentDashboardData.prList.sort((a, b) => {
    let valA, valB;
    switch (columnIndex) {
      case 0:
        valA = a.number;
        valB = b.number;
        break;
      case 1:
        valA = a.title?.toLowerCase();
        valB = b.title?.toLowerCase();
        break;
      case 2:
        valA = a.author?.login?.toLowerCase();
        valB = b.author?.login?.toLowerCase();
        break;
      case 3:
        valA = a.state?.toLowerCase();
        valB = b.state?.toLowerCase();
        break;
      case 4:
        valA = a.createdAt;
        valB = b.createdAt;
        break;
      case 5:
        valA = a.baseRefName?.toLowerCase();
        valB = b.baseRefName?.toLowerCase();
        break;
      case 6:
        const approversA = [
          ...new Set(
            (a.reviews?.nodes || [])
              .filter((r) => r.state === "APPROVED" && r.author?.login)
              .map((r) => r.author.login)
          ),
        ];
        const approversB = [
          ...new Set(
            (b.reviews?.nodes || [])
              .filter((r) => r.state === "APPROVED" && r.author?.login)
              .map((r) => r.author.login)
          ),
        ];
        valA = approversA[0]?.toLowerCase();
        valB = approversB[0]?.toLowerCase();
        break;
      case 7:
        valA = a.calculatedMetrics?.timeInDraft;
        valB = b.calculatedMetrics?.timeInDraft;
        break;
      case 8:
        valA = a.calculatedMetrics?.timeToFirstReview;
        valB = b.calculatedMetrics?.timeToFirstReview;
        break;
      case 9:
        valA = a.calculatedMetrics?.reviewTime;
        valB = b.calculatedMetrics?.reviewTime;
        break;
      case 10:
        valA = a.calculatedMetrics?.mergeTime;
        valB = b.calculatedMetrics?.mergeTime;
        break;
      case 11:
        valA = a.calculatedMetrics?.cycleTime;
        valB = b.calculatedMetrics?.cycleTime;
        break;
      case 12:
        valA = a.calculatedMetrics?.linesChanged;
        valB = b.calculatedMetrics?.linesChanged;
        break;
      case 13:
        valA = a.calculatedMetrics?.commentCount;
        valB = b.calculatedMetrics?.commentCount;
        break;
      case 14:
        valA = a.mergedAt;
        valB = b.mergedAt;
        break;
      default:
        return 0;
    }
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1 * sortMultiplier;
    if (valB == null) return -1 * sortMultiplier;
    if (type === "number") {
      return (valA - valB) * sortMultiplier;
    } else if (type === "date") {
      const dateA = new Date(valA);
      const dateB = new Date(valB);
      if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
      if (isNaN(dateA.getTime())) return 1 * sortMultiplier;
      if (isNaN(dateB.getTime())) return -1 * sortMultiplier;
      return (dateA - dateB) * sortMultiplier;
    } else {
      return String(valA).localeCompare(String(valB)) * sortMultiplier;
    }
  });
  currentSortColumnIndex = columnIndex;
  currentSortDirection = direction;
  applyTextFilterAndRepopulate();
  updateSortIcons();
}
function updateSortIcons() {
  if (!detailsTableHead) return;
  detailsTableHead.querySelectorAll("th[data-column-index]").forEach((th) => {
    const iconSpan = th.querySelector(".sort-icon");
    if (!iconSpan) return;
    const colIndex = parseInt(th.dataset.columnIndex, 10);
    th.classList.remove("sorted", "asc", "desc");
    iconSpan.textContent = "↕";
    if (colIndex === currentSortColumnIndex) {
      th.classList.add("sorted", currentSortDirection);
      iconSpan.textContent = currentSortDirection === "asc" ? "▲" : "▼";
    }
  });
}
function handleSortClick(event) {
  const header = event.target.closest("th[data-column-index]");
  if (!header) return;
  const columnIndex = parseInt(header.dataset.columnIndex, 10);
  if (isNaN(columnIndex) || !SORTABLE_COLUMNS_INFO[columnIndex]) return;
  let newDirection = "asc";
  if (
    columnIndex === currentSortColumnIndex &&
    currentSortDirection === "asc"
  ) {
    newDirection = "desc";
  }
  sortPrList(columnIndex, newDirection);
}
function applyTextFilter(filterText) {
  if (!detailsTableBody) return;
  const text = filterText.toLowerCase().trim();
  Array.from(detailsTableBody.rows).forEach((row) => {
    if (row.cells.length <= 1 && row.cells[0]?.colSpan > 1) {
      row.classList.remove("hidden-row");
      return;
    }
    const prNumber = row.cells[0]?.textContent.toLowerCase() || "";
    const title = row.cells[1]?.textContent.toLowerCase() || "";
    const author = row.cells[2]?.textContent.toLowerCase() || "";
    const approvers = row.cells[6]?.textContent.toLowerCase() || "";
    const rowVisible =
      prNumber.includes(text) ||
      title.includes(text) ||
      author.includes(text) ||
      approvers.includes(text);
    row.classList.toggle("hidden-row", !rowVisible);
  });
}
function applyTextFilterAndRepopulate() {
  if (!currentDashboardData?.prList) return;
  populateTable(currentDashboardData.prList);
  if (detailsFilterInput) {
    applyTextFilter(detailsFilterInput.value);
  }
}

// --- Details Table Population ---
function populateTable(prList) {
  if (!detailsTableBody || !detailsTableHead) return;
  detailsTableBody.innerHTML = "";
  const numCols =
    detailsTableHead.rows[0]?.cells.length || TOGGLEABLE_COLUMNS.length + 2;
  if (!prList || prList.length === 0) {
    detailsTableBody.innerHTML = `<tr><td colspan="${numCols}">Nenhum PR encontrado.</td></tr>`;
    return;
  }
  prList.forEach((pr) => {
    const row = detailsTableBody.insertRow();
    const mets = pr.calculatedMetrics || {};
    const addCell = (cont, idx, isHtml = false) => {
      const cell = row.insertCell();
      if (isHtml) {
        cell.innerHTML = cont;
      } else {
        cell.textContent = cont;
      }
      cell.dataset.columnIndex = idx;
      return cell;
    };
    let approvers = "--";
    if (pr.reviews?.nodes) {
      const unique = [
        ...new Set(
          pr.reviews.nodes
            .filter((r) => r.state === "APPROVED" && r.author?.login)
            .map((r) => r.author.login)
        ),
      ];
      if (unique.length > 0) {
        approvers = unique.join(", ");
      }
    }
    addCell(
      `<a href="${pr.url || "#"}" target="_blank">${pr.number}</a>`,
      0,
      true
    );
    addCell(pr.title || "N/A", 1);
    addCell(pr.author?.login || "N/A", 2);
    addCell(pr.state || "N/A", 3);
    addCell(formatDate(pr.createdAt), 4);
    addCell(pr.baseRefName || "N/A", 5);
    addCell(approvers, 6);
    addCell(formatHours(mets.timeInDraft), 7);
    addCell(formatHours(mets.timeToFirstReview), 8);
    addCell(formatHours(mets.reviewTime), 9);
    addCell(formatHours(mets.mergeTime), 10);
    addCell(formatHours(mets.cycleTime), 11);
    addCell(mets.linesChanged ?? "--", 12);
    addCell(mets.commentCount ?? "--", 13);
    addCell(formatDate(pr.mergedAt), 14);
  });
  const curVis = loadColumnVisibility();
  TOGGLEABLE_COLUMNS.forEach((col) => {
    setColumnVisibility(col.index, curVis[col.index] ?? col.defaultVisible);
  });
  setColumnVisibility(0, true);
  setColumnVisibility(1, true);
  updateSortIcons();
}
function ensureDetailsStructure() {
  if (detailsSectionContainer.querySelector("#pr-details-table")) {
    detailsTable = document.getElementById("pr-details-table");
    detailsTableHead = detailsTable?.querySelector("thead");
    detailsTableBody = document.getElementById("pr-details-tbody");
    detailsLoadingIndicator = document.getElementById(
      "loading-indicator-details"
    );
    detailsErrorMessageDiv = document.getElementById("error-message-details");
    columnTogglesContainer = detailsSectionContainer.querySelector(
      ".column-toggles .toggle-grid"
    );
    detailsFilterInput = document.getElementById("details-filter-input");
    if (detailsTableHead && !detailsTableHead.dataset.listenerAdded) {
      detailsTableHead.addEventListener("click", handleSortClick);
      detailsTableHead.dataset.listenerAdded = "true";
    }
    if (detailsFilterInput && !detailsFilterInput.dataset.listenerAdded) {
      detailsFilterInput.addEventListener("input", () =>
        applyTextFilter(detailsFilterInput.value)
      );
      detailsFilterInput.dataset.listenerAdded = "true";
    }
    return;
  }
  detailsSectionContainer.innerHTML = `<div class="details-container card"><h2>Detalhes por Pull Request</h2><div class="column-toggles card"><h3>Exibir Colunas:</h3><div class="toggle-grid"></div></div><div class="details-filter"><label for="details-filter-input">Filtrar Tabela:</label><input type="text" id="details-filter-input" placeholder="Filtrar por nº, título, autor, aprovador..."></div><div id="loading-indicator-details" class="loading" style="display: none;">...</div><div id="error-message-details" class="error" style="display: none;"></div><div class="table-wrapper"><table id="pr-details-table"><thead><tr><th data-column-index="0"># PR<span class="sort-icon">↕</span></th><th data-column-index="1">Título<span class="sort-icon">↕</span></th><th data-column-index="2">Autor<span class="sort-icon">↕</span></th><th data-column-index="3">Status<span class="sort-icon">↕</span></th><th data-column-index="4">Criado em<span class="sort-icon">↕</span></th><th data-column-index="5">Branch Destino<span class="sort-icon">↕</span></th><th data-column-index="6">Aprovador(es)<span class="sort-icon">↕</span></th><th data-column-index="7">Tempo em Draft (h)<span class="sort-icon">↕</span></th><th data-column-index="8">Tempo 1ª Revisão (h)<span class="sort-icon">↕</span></th><th data-column-index="9">Tempo Revisão (h)<span class="sort-icon">↕</span></th><th data-column-index="10">Tempo Merge (h)<span class="sort-icon">↕</span></th><th data-column-index="11">Tempo Ciclo (h)<span class="sort-icon">↕</span></th><th data-column-index="12">Tam. (Linhas)<span class="sort-icon">↕</span></th><th data-column-index="13">Comentários<span class="sort-icon">↕</span></th><th data-column-index="14">Mergeado em<span class="sort-icon">↕</span></th></tr></thead><tbody id="pr-details-tbody"></tbody></table></div></div>`;
  detailsTable = document.getElementById("pr-details-table");
  detailsTableHead = detailsTable?.querySelector("thead");
  detailsTableBody = document.getElementById("pr-details-tbody");
  detailsLoadingIndicator = document.getElementById(
    "loading-indicator-details"
  );
  detailsErrorMessageDiv = document.getElementById("error-message-details");
  columnTogglesContainer = detailsSectionContainer.querySelector(
    ".column-toggles .toggle-grid"
  );
  detailsFilterInput = document.getElementById("details-filter-input");
  if (detailsTableHead) {
    detailsTableHead.addEventListener("click", handleSortClick);
    detailsTableHead.dataset.listenerAdded = "true";
  }
  if (detailsFilterInput) {
    detailsFilterInput.addEventListener("input", () =>
      applyTextFilter(detailsFilterInput.value)
    );
    detailsFilterInput.dataset.listenerAdded = "true";
  }
  const initVis = loadColumnVisibility();
  createColumnToggles(initVis);
}

// --- Main Data Fetching and Dashboard Update ---
function updateDashboardAndCharts(responseData) {
  console.log("Updating dashboard and charts:", responseData);
  if (
    !responseData ||
    typeof responseData !== "object" ||
    !responseData.metrics ||
    !responseData.prList
  ) {
    showError("Falha ao processar dados (estrutura inválida).");
    if (detailsTableBody)
      detailsTableBody.innerHTML = `<tr><td colspan="15">Erro: Dados inválidos.</td></tr>`;
    Object.keys(chartInstances).forEach(destroyChart);
    return;
  }
  if (responseData.error) {
    showError(`Erro: ${responseData.error}`);
    return;
  }
  currentDashboardData = responseData;
  const metricsData = responseData.metrics;
  const prList = responseData.prList;
  const summary = metricsData.summary || {
    count: 0,
    open: 0,
    merged: 0,
    closed: 0,
  };
  summaryCountSpan.textContent = `(${summary.count} PRs)`;
  summaryOpenSpan.textContent = summary.open;
  summaryMergedSpan.textContent = summary.merged;
  summaryClosedSpan.textContent = summary.closed;

  // --- Prepare Data & Render Charts ---
  const timeToFirstReviewHours =
    metricsData.timeToFirstReview?.map((item) => item.hours) || [];
  const timeInDraftHours =
    metricsData.timeInDraft?.map((item) => item.hours) || [];
  const prCycleTimeHours =
    metricsData.prCycleTime?.map((item) => item.hours) || [];
  const reviewTimeHours =
    metricsData.reviewTime?.map((item) => item.hours) || [];
  const mergeTimeHours = metricsData.mergeTime?.map((item) => item.hours) || [];
  const prSizeLines =
    metricsData.prSize?.map((item) => item.linesChanged) || [];
  const reviewDepthComments =
    metricsData.reviewDepth?.map((item) => item.commentCount) || [];

  renderHistogramChart(
    "time-to-first-review-chart",
    timeToFirstReviewHours,
    "Cont. PRs",
    DEFAULT_HISTOGRAM_BINS,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "time-in-draft-chart",
    timeInDraftHours,
    "Cont. PRs",
    DEFAULT_HISTOGRAM_BINS,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "pr-cycle-time-chart",
    prCycleTimeHours,
    "Cont. PRs",
    DEFAULT_HISTOGRAM_BINS,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "review-time-chart",
    reviewTimeHours,
    "Cont. PRs",
    DEFAULT_HISTOGRAM_BINS,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "merge-time-chart",
    mergeTimeHours,
    "Cont. PRs",
    DEFAULT_HISTOGRAM_BINS,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "pr-size-chart",
    prSizeLines,
    "Cont. PRs",
    DEFAULT_HISTOGRAM_BINS,
    "Linhas Alt.",
    "Freq."
  );
  renderHistogramChart(
    "review-depth-chart",
    reviewDepthComments,
    "Cont. PRs",
    DEFAULT_HISTOGRAM_BINS,
    "Nº Coment.",
    "Freq."
  );

  const reviewerContributions = metricsData.reviewerContribution || {};
  const topN = 15;
  const reviewerLabels = Object.keys(reviewerContributions).slice(0, topN);
  const reviewerData = Object.values(reviewerContributions).slice(0, topN);
  renderBarChart(
    "reviewer-contribution-chart",
    reviewerLabels,
    reviewerData,
    "PRs Aprovados",
    "Aprovador",
    "Nº Aprov."
  );

  // --- Process PR Volume Data ---
  const dailyCounts = {};
  prList.forEach((pr) => {
    if (pr.createdAt) {
      const dateStr = pr.createdAt.substring(0, 10);
      if (!dailyCounts[dateStr])
        dailyCounts[dateStr] = { created: 0, merged: 0, closedNotMerged: 0 };
      dailyCounts[dateStr].created++;
    }
    if (pr.mergedAt) {
      const dateStr = pr.mergedAt.substring(0, 10);
      if (!dailyCounts[dateStr])
        dailyCounts[dateStr] = { created: 0, merged: 0, closedNotMerged: 0 };
      dailyCounts[dateStr].merged++;
    }
    if (pr.closedAt && !pr.mergedAt) {
      const dateStr = pr.closedAt.substring(0, 10);
      if (!dailyCounts[dateStr])
        dailyCounts[dateStr] = { created: 0, merged: 0, closedNotMerged: 0 };
      dailyCounts[dateStr].closedNotMerged++;
    }
  });
  const sortedDates = Object.keys(dailyCounts).sort();
  const createdData = [];
  const mergedData = [];
  const closedData = [];
  sortedDates.forEach((dateStr) => {
    const counts = dailyCounts[dateStr];
    const dateObj = new Date(dateStr + "T00:00:00");
    if (counts.created > 0) createdData.push({ x: dateObj, y: counts.created });
    if (counts.merged > 0) mergedData.push({ x: dateObj, y: counts.merged });
    if (counts.closedNotMerged > 0)
      closedData.push({ x: dateObj, y: counts.closedNotMerged });
  });
  const createdColor = "rgb(40, 167, 69)";
  const mergedColor = "rgb(108, 69, 210)";
  const closedColor = "rgb(215, 58, 73)";
  renderMultiLineChart(
    "pr-volume-chart",
    [
      { label: "Criados", data: createdData, color: createdColor },
      { label: "Mergeados", data: mergedData, color: mergedColor },
      {
        label: "Fechados (Não Mergeados)",
        data: closedData,
        color: closedColor,
      },
    ],
    "Data",
    "Número de PRs",
    "day"
  );

  // --- Process Review Efficiency Data ---
  const efficiencyMetrics = {
    timeToFirstReview: {},
    timeInDraft: {},
    mergeTime: {},
  }; // { 'YYYY-MM-DD': { sum: X, count: Y } }
  const prMetricsMap = new Map(); // Reuse map for efficiency
  metricsData.timeInDraft?.forEach((m) =>
    prMetricsMap.set(m.prNumber, {
      ...(prMetricsMap.get(m.prNumber) || {}),
      timeInDraft: m.hours,
    })
  );
  metricsData.timeToFirstReview?.forEach((m) =>
    prMetricsMap.set(m.prNumber, {
      ...(prMetricsMap.get(m.prNumber) || {}),
      timeToFirstReview: m.hours,
    })
  );
  metricsData.mergeTime?.forEach((m) =>
    prMetricsMap.set(m.prNumber, {
      ...(prMetricsMap.get(m.prNumber) || {}),
      mergeTime: m.hours,
    })
  );

  prList.forEach((pr) => {
    if (!pr.createdAt) return;
    const dateStr = pr.createdAt.substring(0, 10); // Group by creation date
    const metrics = prMetricsMap.get(pr.number) || {};

    const updateDailyAverage = (metricKey, value) => {
      if (value !== undefined && value !== null) {
        if (!efficiencyMetrics[metricKey][dateStr]) {
          efficiencyMetrics[metricKey][dateStr] = { sum: 0, count: 0 };
        }
        efficiencyMetrics[metricKey][dateStr].sum += value;
        efficiencyMetrics[metricKey][dateStr].count++;
      }
    };

    updateDailyAverage("timeToFirstReview", metrics.timeToFirstReview);
    updateDailyAverage("timeInDraft", metrics.timeInDraft);
    updateDailyAverage("mergeTime", metrics.mergeTime);
  });

  // Prepare data for efficiency chart
  const efficiencyDatasets = [];
  const colors = {
    // Define colors for efficiency lines
    timeToFirstReview: "rgb(255, 159, 64)", // Orange
    timeInDraft: "rgb(75, 192, 192)", // Teal
    mergeTime: "rgb(153, 102, 255)", // Purple (different from volume merge)
  };
  const labels = {
    timeToFirstReview: "Tempo Médio 1ª Revisão (h)",
    timeInDraft: "Tempo Médio em Draft (h)",
    mergeTime: "Tempo Médio Merge Pós-Aprovação (h)",
  };

  for (const metricKey in efficiencyMetrics) {
    const dailyData = [];
    const sortedDatesEfficiency = Object.keys(
      efficiencyMetrics[metricKey]
    ).sort();
    sortedDatesEfficiency.forEach((dateStr) => {
      const dailyStat = efficiencyMetrics[metricKey][dateStr];
      if (dailyStat.count > 0) {
        dailyData.push({
          x: new Date(dateStr + "T00:00:00"),
          y: dailyStat.sum / dailyStat.count,
        });
      }
    });
    efficiencyDatasets.push({
      label: labels[metricKey],
      data: dailyData,
      color: colors[metricKey],
    });
  }

  renderMultiLineChart(
    "review-efficiency-chart",
    efficiencyDatasets,
    "Data Criação PR",
    "Tempo Médio (Horas)",
    "day"
  );

  // --- Update Average Values ---
  avgTimeToFirstReview.textContent =
    calculateAverage(timeToFirstReviewHours) + " h";
  avgTimeInDraft.textContent = calculateAverage(timeInDraftHours) + " h";
  avgPrCycleTime.textContent = calculateAverage(prCycleTimeHours) + " h";
  avgReviewTime.textContent = calculateAverage(reviewTimeHours) + " h";
  avgMergeTime.textContent = calculateAverage(mergeTimeHours) + " h";
  avgPrSize.textContent = calculateAverage(prSizeLines, 0) + " linhas";
  avgReviewDepth.textContent =
    calculateAverage(reviewDepthComments) + " comentários";

  // --- Populate Details Table IF VISIBLE ---
  if (isDetailsVisible) {
    currentDashboardData.prList.forEach((pr) => {
      pr.calculatedMetrics = prMetricsMap.get(pr.number) || {};
    }); // Ensure metrics attached
    ensureDetailsStructure();
    sortPrList(currentSortColumnIndex, currentSortDirection); // Sort and repopulate
  }

  // Display calculation errors if any
  if (metricsData.errors && metricsData.errors.length > 0) {
    const errorMsg = `Avisos no cálculo: ${metricsData.errors.length} PR(s). Ver console.`;
    showError(errorMsg);
    if (isDetailsVisible) {
      showDetailsError(errorMsg);
    }
  }
}

async function fetchDashboardData(forceRefresh = false) {
  showLoading();
  const params = getCurrentFilters();
  if (forceRefresh) params.append("forceRefresh", "true");
  params.append("includePrList", "true");
  const apiUrl = `/api/metrics?${params.toString()}`;
  console.log("Fetching dashboard data from:", apiUrl);
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      let eMsg = `Err ${response.status}`;
      try {
        const ed = await response.json();
        eMsg = `Err ${response.status}: ${ed.error || response.statusText}`;
      } catch (e) {}
      throw new Error(eMsg);
    }
    const data = await response.json();
    updateDashboardAndCharts(data);
  } catch (error) {
    const eMsg = `Falha ao buscar dados: ${error.message}`;
    showError(eMsg);
    if (isDetailsVisible) showDetailsError(eMsg);
    console.error("Fetch error:", error);
    if (isDetailsVisible && detailsTableBody)
      detailsTableBody.innerHTML = `<tr><td colspan="15">Erro ao carregar.</td></tr>`;
  } finally {
    hideLoading();
  }
}
async function fetchFilterOptions() {
  try {
    const r = await fetch("/api/filters");
    if (!r.ok) throw new Error(r.statusText);
    const d = await r.json();
    populateDatalist(authorDatalist, d.authors || []);
    populateDatalist(approverDatalist, d.approvers || []);
    populateDatalist(branchDatalist, d.branches || []);
  } catch (e) {
    console.error("Err fetch filters:", e);
  }
}
function populateDatalist(el, opts) {
  if (!el) return;
  el.innerHTML = "";
  opts.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o;
    el.appendChild(opt);
  });
}
function setDefaultDateRange() {
  if (typeof dateFns !== "undefined" && dateFns.format && dateFns.subDays) {
    try {
      const t = new Date();
      const e = dateFns.format(t, "yyyy-MM-dd");
      const s = dateFns.format(dateFns.subDays(t, 30), "yyyy-MM-dd");
      startDateInput.value = s;
      endDateInput.value = e;
    } catch (e) {
      setDefaultDateRangeFallback();
    }
  } else {
    setDefaultDateRangeFallback();
  }
}
function setDefaultDateRangeFallback() {
  try {
    const t = new Date();
    const p = new Date();
    p.setDate(t.getDate() - 30);
    const fmt = (d) => d.toISOString().split("T")[0];
    endDateInput.value = fmt(t);
    startDateInput.value = fmt(p);
  } catch (e) {
    endDateInput.value = "";
    startDateInput.value = "";
  }
}
function setDefaultFilters() {
  excludeAuthorInput.value = "dependabot";
  statusInput.value = "MERGED";
  targetBranchInput.value = "main";
}
function getCurrentFilters() {
  const p = new URLSearchParams();
  if (startDateInput.value) p.append("startDate", startDateInput.value);
  if (endDateInput.value) p.append("endDate", endDateInput.value);
  if (authorInput.value) p.append("author", authorInput.value);
  if (approverInput.value) p.append("approver", approverInput.value);
  if (targetBranchInput.value)
    p.append("targetBranch", targetBranchInput.value);
  if (statusInput.value) p.append("status", statusInput.value);
  if (excludeAuthorInput.value)
    p.append("excludeAuthor", excludeAuthorInput.value);
  if (excludeBranchInput.value)
    p.append("excludeBranchPattern", excludeBranchInput.value);
  return p;
}

// --- Event Listeners ---
filtersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchDashboardData(false);
});
clearFiltersButton.addEventListener("click", () => {
  filtersForm.reset();
  setDefaultDateRange();
  setDefaultFilters();
  fetchDashboardData(false);
});
forceRefreshButton.addEventListener("click", () => {
  currentDashboardData = null;
  fetchDashboardData(true);
});

toggleDetailsButton.addEventListener("click", () => {
  isDetailsVisible = !isDetailsVisible;
  if (isDetailsVisible) {
    toggleDetailsButton.textContent = "Ocultar Detalhes por PR";
    detailsSectionContainer.style.display = "block";
    ensureDetailsStructure();
    if (currentDashboardData) {
      console.log("Populating details from cached data.");
      currentDashboardData.prList.forEach((pr) => {
        if (!pr.calculatedMetrics) {
          const prMetricsMap = new Map();
          /* ... rebuild map ... */ pr.calculatedMetrics =
            prMetricsMap.get(pr.number) || {};
        }
      });
      sortPrList(currentSortColumnIndex, currentSortDirection);
    } else {
      console.log("No cached data, fetching details...");
      fetchDashboardData(false);
    }
  } else {
    toggleDetailsButton.textContent = "Mostrar Detalhes por PR";
    detailsSectionContainer.style.display = "none";
  }
});

themeToggleButton.addEventListener("click", toggleTheme);

// --- Initial Load ---
document.addEventListener("DOMContentLoaded", () => {
  if (typeof Chart === "undefined" || !Chart.adapters?.date) {
    console.error("Chart.js or Date Adapter not loaded correctly!");
  } else if (
    typeof dateFns === "undefined" ||
    typeof dateFns.locale?.ptBR === "undefined"
  ) {
    console.warn("date-fns or pt-BR locale not loaded.");
  } else {
    // Set locale for date-fns adapter IF locale object exists
    if (dateFns.locale.ptBR) {
      Chart.defaults.plugins.locale = "pt-BR";
      Chart.defaults.locale = "pt-BR";
      console.log("Chart.js date adapter locale set to pt-BR.");
    } else {
      console.warn(
        "pt-BR locale object not found in dateFns.locale. Using default locale."
      );
    }
  }
  loadThemePreference();
  setDefaultDateRange();
  setDefaultFilters();
  fetchFilterOptions();
  fetchDashboardData(false);
});

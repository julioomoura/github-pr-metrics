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
let columnTogglesContainer = null; // Will be selected inside ensureDetailsStructure

// --- Constants ---
const LOCAL_STORAGE_KEY_THEME = "dashboardThemePreference";
const LOCAL_STORAGE_KEY_COLUMNS = "prDetailsColumnVisibility";
const TOGGLEABLE_COLUMNS = [
  { index: 2, label: "Autor", defaultVisible: true },
  { index: 3, label: "Status", defaultVisible: true },
  { index: 4, label: "Criado em", defaultVisible: true },
  { index: 5, label: "Branch Destino", defaultVisible: true },
  { index: 6, label: "Aprovador(es)", defaultVisible: true },
  { index: 7, label: "Tempo em Draft (h)", defaultVisible: true },
  { index: 8, label: "Tempo 1ª Revisão (h)", defaultVisible: true },
  { index: 9, label: "Tempo Revisão (h)", defaultVisible: true },
  { index: 10, label: "Tempo Merge (h)", defaultVisible: true },
  { index: 11, label: "Tempo Ciclo (h)", defaultVisible: true },
  { index: 12, label: "Tam. (Linhas)", defaultVisible: true },
  { index: 13, label: "Comentários", defaultVisible: true },
  { index: 14, label: "Mergeado em", defaultVisible: true },
];

// --- Chart Instances ---
const chartInstances = {};

// --- State ---
let isDetailsVisible = false;
let currentDashboardData = null;
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
    if (typeof dateFns !== "undefined" && dateFns.locale?.ptBR) {
      return dateFns.format(d, "P p", { locale: dateFns.locale.ptBR });
    } else {
      return d.toLocaleString("pt-BR");
    }
  } catch (e) {
    console.error("Err fmt date:", e);
    return "--";
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
function renderHistogramChart(
  chartId,
  dataPoints,
  label,
  numBins = 10,
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
  renderBarChart(chartId, labels, bins, label, xAxisLabel, yAxisLabel);
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

/** Sets column visibility AND updates corresponding button state */
function setColumnVisibility(columnIndex, isVisible) {
  if (!detailsTable) return;
  const cells = detailsTable.querySelectorAll(
    `th[data-column-index="${columnIndex}"], td[data-column-index="${columnIndex}"]`
  );
  cells.forEach((cell) => {
    cell.classList.toggle("column-hidden", !isVisible);
  });

  // Update button state if the toggle container exists
  if (columnTogglesContainer) {
    const button = columnTogglesContainer.querySelector(
      `button[data-column-index="${columnIndex}"]`
    );
    if (button) {
      button.classList.toggle("active", isVisible);
    }
  }
}

/** Creates column toggle BUTTONS */
function createColumnToggles(initialVisibility) {
  if (!columnTogglesContainer) return;
  columnTogglesContainer.innerHTML = ""; // Clear existing toggles

  TOGGLEABLE_COLUMNS.forEach((col) => {
    const isVisible = initialVisibility[col.index] ?? col.defaultVisible;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "toggle-button"; // Base class
    button.dataset.columnIndex = col.index;
    button.textContent = col.label;
    button.classList.toggle("active", isVisible); // Set initial active state

    // Add event listener to handle clicks
    button.addEventListener("click", (event) => {
      const btn = event.target;
      const index = parseInt(btn.dataset.columnIndex, 10);
      const currentVisibility = loadColumnVisibility();
      const newVisibility = !(currentVisibility[index] ?? col.defaultVisible); // Toggle state

      setColumnVisibility(index, newVisibility); // Apply visibility to table and button
      currentVisibility[index] = newVisibility; // Update state object
      saveColumnVisibility(currentVisibility); // Save updated state
    });

    columnTogglesContainer.appendChild(button);

    // Initial application of visibility to the table column (redundant if called after populateTable)
    // setColumnVisibility(col.index, isVisible);
  });
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
    return;
  }
  detailsSectionContainer.innerHTML = `<div class="details-container card"><h2>Detalhes por Pull Request</h2><div class="column-toggles card"><h3>Exibir Colunas:</h3><div class="toggle-grid"></div></div><div id="loading-indicator-details" class="loading" style="display: none;">...</div><div id="error-message-details" class="error" style="display: none;"></div><div class="table-wrapper"><table id="pr-details-table"><thead><tr><th data-column-index="0"># PR</th><th data-column-index="1">Título</th><th data-column-index="2">Autor</th><th data-column-index="3">Status</th><th data-column-index="4">Criado em</th><th data-column-index="5">Branch Destino</th><th data-column-index="6">Aprovador(es)</th><th data-column-index="7">Tempo em Draft (h)</th><th data-column-index="8">Tempo 1ª Revisão (h)</th><th data-column-index="9">Tempo Revisão (h)</th><th data-column-index="10">Tempo Merge (h)</th><th data-column-index="11">Tempo Ciclo (h)</th><th data-column-index="12">Tam. (Linhas)</th><th data-column-index="13">Comentários</th><th data-column-index="14">Mergeado em</th></tr></thead><tbody id="pr-details-tbody"></tbody></table></div></div>`;
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
    10,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "time-in-draft-chart",
    timeInDraftHours,
    "Cont. PRs",
    10,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "pr-cycle-time-chart",
    prCycleTimeHours,
    "Cont. PRs",
    10,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "review-time-chart",
    reviewTimeHours,
    "Cont. PRs",
    10,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "merge-time-chart",
    mergeTimeHours,
    "Cont. PRs",
    10,
    "Tempo (h)",
    "Freq."
  );
  renderHistogramChart(
    "pr-size-chart",
    prSizeLines,
    "Cont. PRs",
    10,
    "Linhas Alt.",
    "Freq."
  );
  renderHistogramChart(
    "review-depth-chart",
    reviewDepthComments,
    "Cont. PRs",
    10,
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
  avgTimeToFirstReview.textContent =
    calculateAverage(timeToFirstReviewHours) + " h";
  avgTimeInDraft.textContent = calculateAverage(timeInDraftHours) + " h";
  avgPrCycleTime.textContent = calculateAverage(prCycleTimeHours) + " h";
  avgReviewTime.textContent = calculateAverage(reviewTimeHours) + " h";
  avgMergeTime.textContent = calculateAverage(mergeTimeHours) + " h";
  avgPrSize.textContent = calculateAverage(prSizeLines, 0) + " linhas";
  avgReviewDepth.textContent =
    calculateAverage(reviewDepthComments) + " comentários";
  if (isDetailsVisible) {
    const prMetricsMap = new Map();
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
    metricsData.reviewTime?.forEach((m) =>
      prMetricsMap.set(m.prNumber, {
        ...(prMetricsMap.get(m.prNumber) || {}),
        reviewTime: m.hours,
      })
    );
    metricsData.mergeTime?.forEach((m) =>
      prMetricsMap.set(m.prNumber, {
        ...(prMetricsMap.get(m.prNumber) || {}),
        mergeTime: m.hours,
      })
    );
    metricsData.prCycleTime?.forEach((m) =>
      prMetricsMap.set(m.prNumber, {
        ...(prMetricsMap.get(m.prNumber) || {}),
        cycleTime: m.hours,
      })
    );
    metricsData.prSize?.forEach((m) =>
      prMetricsMap.set(m.prNumber, {
        ...(prMetricsMap.get(m.prNumber) || {}),
        linesChanged: m.linesChanged,
      })
    );
    metricsData.reviewDepth?.forEach((m) =>
      prMetricsMap.set(m.prNumber, {
        ...(prMetricsMap.get(m.prNumber) || {}),
        commentCount: m.commentCount,
      })
    );
    const prListWithMetrics = prList.map((pr) => ({
      ...pr,
      calculatedMetrics: prMetricsMap.get(pr.number) || {},
    }));
    ensureDetailsStructure();
    populateTable(prListWithMetrics);
  }
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
      const prMetricsMap = new Map();
      currentDashboardData.metrics.timeInDraft?.forEach((m) =>
        prMetricsMap.set(m.prNumber, {
          ...(prMetricsMap.get(m.prNumber) || {}),
          timeInDraft: m.hours,
        })
      );
      currentDashboardData.metrics.timeToFirstReview?.forEach((m) =>
        prMetricsMap.set(m.prNumber, {
          ...(prMetricsMap.get(m.prNumber) || {}),
          timeToFirstReview: m.hours,
        })
      );
      currentDashboardData.metrics.reviewTime?.forEach((m) =>
        prMetricsMap.set(m.prNumber, {
          ...(prMetricsMap.get(m.prNumber) || {}),
          reviewTime: m.hours,
        })
      );
      currentDashboardData.metrics.mergeTime?.forEach((m) =>
        prMetricsMap.set(m.prNumber, {
          ...(prMetricsMap.get(m.prNumber) || {}),
          mergeTime: m.hours,
        })
      );
      currentDashboardData.metrics.prCycleTime?.forEach((m) =>
        prMetricsMap.set(m.prNumber, {
          ...(prMetricsMap.get(m.prNumber) || {}),
          cycleTime: m.hours,
        })
      );
      currentDashboardData.metrics.prSize?.forEach((m) =>
        prMetricsMap.set(m.prNumber, {
          ...(prMetricsMap.get(m.prNumber) || {}),
          linesChanged: m.linesChanged,
        })
      );
      currentDashboardData.metrics.reviewDepth?.forEach((m) =>
        prMetricsMap.set(m.prNumber, {
          ...(prMetricsMap.get(m.prNumber) || {}),
          commentCount: m.commentCount,
        })
      );
      const prListWithMetrics = currentDashboardData.prList.map((pr) => ({
        ...pr,
        calculatedMetrics: prMetricsMap.get(pr.number) || {},
      }));
      populateTable(prListWithMetrics);
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
  if (
    typeof dateFns === "undefined" ||
    typeof dateFns.locale?.ptBR === "undefined"
  ) {
    console.warn("date-fns or pt-BR locale not loaded.");
  }
  loadThemePreference();
  setDefaultDateRange();
  setDefaultFilters();
  fetchFilterOptions();
  fetchDashboardData(false);
});

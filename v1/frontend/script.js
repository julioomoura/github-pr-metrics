// frontend/script.js
document.addEventListener("DOMContentLoaded", () => {
  // Referências aos Elementos DOM
  const startDateInput = document.getElementById("startDate");
  const endDateInput = document.getElementById("endDate");
  const authorFilterInput = document.getElementById("authorFilter");
  const excludeAuthorFilterInput = document.getElementById(
    "excludeAuthorFilter"
  );
  const approverFilterInput = document.getElementById("approverFilter");
  const branchFilterInput = document.getElementById("branchFilter");
  const statusFilterSelect = document.getElementById("statusFilter");
  const fetchButton = document.getElementById("fetchButton");
  const clearFiltersButton = document.getElementById("clearFiltersButton");
  const loadingDiv = document.getElementById("loading");
  const errorDiv = document.getElementById("error");
  const resultsTableBody = document.getElementById("prTableBody");
  const aggregateMetricsDiv = document.getElementById("aggregateMetrics");
  const totalPrsDisplayedSpan = document.getElementById("totalPrsDisplayed");
  const totalPrsInDateRangeSpan = document.getElementById(
    "totalPrsInDateRange"
  );
  const totalPrsFetchedSpan = document.getElementById("totalPrsFetched");

  // Configurações
  const apiUrl = "/api/prs";
  let allFetchedPrs = [];

  // Inicialização de Datas
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const formatDateForInput = (date) => date.toISOString().split("T")[0];
  startDateInput.value = formatDateForInput(thirtyDaysAgo);
  endDateInput.value = formatDateForInput(today);

  // --- Funções Auxiliares ---
  function formatDate(isoString) {
    if (!isoString) return "N/A";
    try {
      // Tenta formatar a data para o locale pt-BR
      return new Date(isoString).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch (e) {
      // Se falhar, retorna a string original ou um aviso
      console.warn(`Formato de data inválido: ${isoString}`, e);
      return isoString || "Data Inválida";
    }
  }

  function formatDuration(value, unit) {
    if (value === null || value === undefined) return "N/A";
    // Usa vírgula como separador decimal para pt-BR
    const roundedValue = value.toFixed(1).replace(".", ",");
    return `${roundedValue} ${unit}`;
  }

  function formatApprovers(approvers) {
    if (!approvers || approvers.length === 0) return "Nenhum";
    return [...new Set(approvers)].join(", ");
  }

  function formatMetricsForDisplay(metrics) {
    // Garante que metrics não seja null ou undefined
    metrics = metrics || {};
    return `
Time to First Review: ${formatDuration(
      metrics.timeToFirstReviewHours,
      "h"
    )} / ${formatDuration(metrics.timeToFirstReviewDays, "d")}
Time in Draft: ${formatDuration(
      metrics.timeInDraftHours,
      "h"
    )} / ${formatDuration(metrics.timeInDraftDays, "d")}
Review Time: ${formatDuration(metrics.reviewTimeHours, "h")} / ${formatDuration(
      metrics.reviewTimeDays,
      "d"
    )}
Merge Time: ${formatDuration(metrics.mergeTimeHours, "h")} / ${formatDuration(
      metrics.mergeTimeDays,
      "d"
    )}
Cycle Time: ${formatDuration(metrics.cycleTimeHours, "h")} / ${formatDuration(
      metrics.cycleTimeDays,
      "d"
    )}
PR Size (Lines): ${metrics.prSizeLines ?? "N/A"}
PR Size (Files): ${metrics.prSizeFiles ?? "N/A"}
Comment Count: ${metrics.commentCount ?? "N/A"}
        `.trim();
  }

  // --- Busca de Dados ---
  async function fetchData() {
    loadingDiv.style.display = "block";
    errorDiv.style.display = "none";
    resultsTableBody.innerHTML = "";
    aggregateMetricsDiv.innerHTML = "";
    totalPrsDisplayedSpan.textContent = "0";
    totalPrsInDateRangeSpan.textContent = "Processando..."; // Indica que o backend está filtrando
    totalPrsFetchedSpan.textContent = "Processando...";
    allFetchedPrs = [];

    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const params = new URLSearchParams();
    // Garante que apenas datas válidas sejam enviadas
    if (startDate && startDateInput.validity.valid)
      params.append("startDate", startDate);
    if (endDate && endDateInput.validity.valid)
      params.append("endDate", endDate);
    const url = `${apiUrl}?${params.toString()}`;

    try {
      console.log(`Frontend: Enviando requisição para: ${url}`); // Log para depuração
      const response = await fetch(url);
      if (!response.ok) {
        let errorMsg = `Erro ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = `Erro ${response.status}: ${
            errorData.error || errorData.message || response.statusText
          }`;
          if (errorData.details)
            console.error("Backend error details:", errorData.details);
        } catch (e) {
          console.error("Could not parse error response body:", e);
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      // Log detalhado da resposta para depuração do filtro de data
      console.log(
        `Frontend: Dados recebidos do backend. Total buscado (antes da data): ${data.totalFetched}, Total após filtro de data (backend): ${data.totalAfterDateFilter}`
      );
      console.log(
        "Frontend: Amostra dos dados recebidos:",
        data.pullRequests?.slice(0, 2)
      ); // Mostra os 2 primeiros PRs recebidos

      allFetchedPrs = data.pullRequests || [];
      // Atualiza contadores com os valores corretos retornados pelo backend
      totalPrsInDateRangeSpan.textContent = data.totalAfterDateFilter ?? "Erro";
      totalPrsFetchedSpan.textContent = data.totalFetched ?? "Erro";

      // Aplica filtros do lado do cliente (Autor, Status, etc.) aos dados JÁ FILTRADOS POR DATA pelo backend
      applyFiltersAndDisplay();
    } catch (error) {
      console.error("Fetch error:", error);
      errorDiv.textContent = `Falha ao buscar dados: ${error.message}`;
      errorDiv.style.display = "block";
      totalPrsInDateRangeSpan.textContent = "Falha";
      totalPrsFetchedSpan.textContent = "Falha";
    } finally {
      loadingDiv.style.display = "none";
    }
  }

  // --- Filtragem e Exibição (Lado do Cliente) ---
  function applyFiltersAndDisplay() {
    const authorFilter = authorFilterInput.value.trim().toLowerCase();
    const excludeAuthorFilter = excludeAuthorFilterInput.value
      .trim()
      .toLowerCase();
    const approverFilter = approverFilterInput.value.trim().toLowerCase();
    const branchFilter = branchFilterInput.value.trim().toLowerCase();
    const statusFilter = statusFilterSelect.value;

    // Filtra os dados que vieram do backend (já filtrados por data)
    const filteredPrs = allFetchedPrs.filter((pr) => {
      const authorLogin = pr.author?.login?.toLowerCase() || "";
      const approvers =
        pr.metrics?.approvers?.map((a) => a.toLowerCase()) || [];
      const targetBranch = pr.baseRefName?.toLowerCase() || "";
      let prEffectiveStatus = pr.state;
      if (pr.isDraft) {
        prEffectiveStatus = "DRAFT";
      }

      // Aplica filtros do cliente
      if (authorFilter && !authorLogin.includes(authorFilter)) return false;
      if (excludeAuthorFilter && authorLogin === excludeAuthorFilter)
        return false;
      if (
        approverFilter &&
        !approvers.some((approver) => approver.includes(approverFilter))
      )
        return false;
      if (branchFilter && !targetBranch.includes(branchFilter)) return false;
      if (statusFilter && statusFilter !== "ALL") {
        if (prEffectiveStatus !== statusFilter) return false;
      }
      return true;
    });

    console.log(
      `Frontend: Exibindo ${filteredPrs.length} PRs após filtros do cliente.`
    );
    displayResults(filteredPrs);
    displayAggregateMetrics(filteredPrs);
    totalPrsDisplayedSpan.textContent = filteredPrs.length;
  }

  function displayResults(prs) {
    resultsTableBody.innerHTML = "";
    if (prs.length === 0) {
      resultsTableBody.innerHTML =
        '<tr><td colspan="12">Nenhum Pull Request encontrado com os filtros aplicados.</td></tr>';
      return;
    }
    prs.forEach((pr) => {
      const row = resultsTableBody.insertRow();
      let timeOpenDays = "N/A";
      try {
        const created = new Date(pr.createdAt);
        if (pr.state === "OPEN" && !pr.isDraft) {
          const now = new Date();
          timeOpenDays = ((now - created) / (1000 * 60 * 60 * 24))
            .toFixed(1)
            .replace(".", ","); // Usa vírgula
        } else if (pr.mergedAt || pr.closedAt) {
          const closed = new Date(pr.mergedAt || pr.closedAt);
          timeOpenDays = ((closed - created) / (1000 * 60 * 60 * 24))
            .toFixed(1)
            .replace(".", ","); // Usa vírgula
        }
      } catch (e) {
        console.warn(
          `Could not calculate timeOpenDays for PR #${pr.number}`,
          e
        );
      }

      let stateClass = "";
      let displayState = pr.state;
      if (pr.isDraft) {
        stateClass = "state-draft";
        displayState = "DRAFT";
      } else if (pr.state === "OPEN") {
        stateClass = "state-open";
      } else if (pr.state === "MERGED") {
        stateClass = "state-merged";
      } else if (pr.state === "CLOSED") {
        stateClass = "state-closed";
      }

      const number = pr.number ?? "N/A";
      const url = pr.url ?? "#";
      const title = pr.title ?? "N/A";
      const authorLogin = pr.author?.login ?? "N/A";
      const baseRefName = pr.baseRefName ?? "N/A";
      const createdAt = formatDate(pr.createdAt);
      const updatedAt = formatDate(pr.updatedAt);
      const mergedAt = formatDate(pr.mergedAt);
      const prSizeLines = pr.metrics?.prSizeLines ?? "N/A";
      const approversList = formatApprovers(pr.metrics?.approvers);
      // Passa metrics para formatMetricsForDisplay, tratando caso seja null/undefined
      const metricsDetails = formatMetricsForDisplay(pr.metrics);

      row.innerHTML = `
                <td><a href="${url}" target="_blank" rel="noopener noreferrer">${number}</a></td>
                <td>${title}</td>
                <td>${authorLogin}</td>
                <td class="${stateClass}">${displayState}</td>
                <td>${baseRefName}</td>
                <td>${createdAt}</td>
                <td>${updatedAt}</td>
                <td>${mergedAt}</td>
                <td>${timeOpenDays}</td>
                <td>${prSizeLines}</td>
                <td>${approversList}</td>
                <td><pre>${metricsDetails}</pre></td>
            `;
    });
  }

  function displayAggregateMetrics(prs) {
    aggregateMetricsDiv.innerHTML = ""; // Limpa anterior

    if (prs.length === 0) {
      aggregateMetricsDiv.innerHTML =
        "<p>Nenhum PR para calcular métricas agregadas.</p>";
      return;
    }

    // Lógica de cálculo das métricas agregadas (sem alterações)
    const aggregates = {
      avgTimeToFirstReviewHours: 0,
      countTFR: 0,
      totalTFR: 0,
      avgTimeInDraftHours: 0,
      countDraft: 0,
      totalDraft: 0,
      avgCycleTimeDays: 0,
      countCycle: 0,
      totalCycle: 0,
      avgReviewTimeHours: 0,
      countReview: 0,
      totalReview: 0,
      avgMergeTimeHours: 0,
      countMerge: 0,
      totalMerge: 0,
      avgPrSizeLines: 0,
      countSize: 0,
      totalSize: 0,
      avgCommentCount: 0,
      countComment: 0,
      totalComment: 0,
      reviewerContributions: {},
    };

    prs.forEach((pr) => {
      const metrics = pr.metrics;
      if (!metrics) return;
      if (metrics.timeToFirstReviewHours !== null) {
        aggregates.totalTFR += metrics.timeToFirstReviewHours;
        aggregates.countTFR++;
      }
      const wasReadyEvent = pr.timelineItems?.nodes?.some(
        (item) => item.__typename === "ReadyForReviewEvent"
      );
      if (
        metrics.timeInDraftHours !== null &&
        (pr.isDraft || metrics.timeInDraftHours > 0 || wasReadyEvent)
      ) {
        aggregates.totalDraft += metrics.timeInDraftHours;
        aggregates.countDraft++;
      }
      if (metrics.cycleTimeDays !== null) {
        aggregates.totalCycle += metrics.cycleTimeDays;
        aggregates.countCycle++;
      }
      if (metrics.reviewTimeHours !== null) {
        aggregates.totalReview += metrics.reviewTimeHours;
        aggregates.countReview++;
      }
      if (metrics.mergeTimeHours !== null) {
        aggregates.totalMerge += metrics.mergeTimeHours;
        aggregates.countMerge++;
      }
      if (metrics.prSizeLines !== null) {
        aggregates.totalSize += metrics.prSizeLines;
        aggregates.countSize++;
      }
      if (metrics.commentCount !== null) {
        aggregates.totalComment += metrics.commentCount;
        aggregates.countComment++;
      }
      const uniqueApprovers = new Set(metrics.approvers || []);
      uniqueApprovers.forEach((approver) => {
        aggregates.reviewerContributions[approver] =
          (aggregates.reviewerContributions[approver] || 0) + 1;
      });
    });

    aggregates.avgTimeToFirstReviewHours =
      aggregates.countTFR > 0 ? aggregates.totalTFR / aggregates.countTFR : 0;
    aggregates.avgTimeInDraftHours =
      aggregates.countDraft > 0
        ? aggregates.totalDraft / aggregates.countDraft
        : 0;
    aggregates.avgCycleTimeDays =
      aggregates.countCycle > 0
        ? aggregates.totalCycle / aggregates.countCycle
        : 0;
    aggregates.avgReviewTimeHours =
      aggregates.countReview > 0
        ? aggregates.totalReview / aggregates.countReview
        : 0;
    aggregates.avgMergeTimeHours =
      aggregates.countMerge > 0
        ? aggregates.totalMerge / aggregates.countMerge
        : 0;
    aggregates.avgPrSizeLines =
      aggregates.countSize > 0
        ? aggregates.totalSize / aggregates.countSize
        : 0;
    aggregates.avgCommentCount =
      aggregates.countComment > 0
        ? aggregates.totalComment / aggregates.countComment
        : 0;

    const contributions = Object.entries(aggregates.reviewerContributions)
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([name, count]) => `${name}: ${count}`)
      .join("; ");

    // *** Conteúdo HTML Restaurado ***
    aggregateMetricsDiv.innerHTML = `
            <p>Tempo Médio para Primeira Revisão: ${formatDuration(
              aggregates.avgTimeToFirstReviewHours,
              "horas"
            )} (de ${aggregates.countTFR} PRs)</p>
            <p>Tempo Médio em Draft: ${formatDuration(
              aggregates.avgTimeInDraftHours,
              "horas"
            )} (de ${aggregates.countDraft} PRs)</p>
            <p>Tempo Médio de Ciclo (Lead Time): ${formatDuration(
              aggregates.avgCycleTimeDays,
              "dias"
            )} (de ${aggregates.countCycle} PRs)</p>
            <p>Tempo Médio de Revisão: ${formatDuration(
              aggregates.avgReviewTimeHours,
              "horas"
            )} (de ${aggregates.countReview} PRs)</p>
            <p>Tempo Médio para Merge (pós-aprovação): ${formatDuration(
              aggregates.avgMergeTimeHours,
              "horas"
            )} (de ${aggregates.countMerge} PRs)</p>
            <p>Tamanho Médio do PR: ${formatDuration(
              aggregates.avgPrSizeLines,
              "linhas"
            )} (de ${aggregates.countSize} PRs)</p>
            <p>Média de Comentários por PR: ${aggregates.avgCommentCount
              .toFixed(1)
              .replace(".", ",")} (de ${aggregates.countComment} PRs)</p>
            <p><strong>Contribuições de Revisores (Contagem de Aprovações):</strong> ${
              contributions || "Nenhuma"
            }</p>
        `;
  }

  function clearFilters() {
    startDateInput.value = formatDateForInput(thirtyDaysAgo);
    endDateInput.value = formatDateForInput(today);
    authorFilterInput.value = "";
    excludeAuthorFilterInput.value = "";
    approverFilterInput.value = "";
    branchFilterInput.value = "";
    statusFilterSelect.value = "ALL";
    applyFiltersAndDisplay();
  }

  // --- Event Listeners ---
  fetchButton.addEventListener("click", fetchData); // Busca novos dados do backend

  // Re-aplica filtros do cliente quando qualquer filtro muda (não busca novos dados)
  [
    authorFilterInput,
    excludeAuthorFilterInput,
    approverFilterInput,
    branchFilterInput,
    statusFilterSelect,
  ].forEach((element) => {
    const eventType = element.tagName === "SELECT" ? "change" : "input";
    element.addEventListener(eventType, applyFiltersAndDisplay);
  });

  clearFiltersButton.addEventListener("click", clearFilters);

  // --- Inicialização ---
  fetchData(); // Busca inicial ao carregar
});

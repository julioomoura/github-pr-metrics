// backend/server.js
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config"; // Ensure env vars are loaded

import { fetchRepos } from "./githubClient.js";
import { calculateMetrics } from "./metricsCalculator.js";

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");
const CACHE_REFRESH_INTERVAL = 5 * 60 * 1000;
const MAX_REPOS = 10;

// Default repo from environment variables
const DEFAULT_REPO = {
  owner: process.env.GITHUB_REPO_OWNER,
  name: process.env.GITHUB_REPO_NAME,
};
const DEFAULT_REPOS =
  DEFAULT_REPO.owner && DEFAULT_REPO.name ? [DEFAULT_REPO] : [];

// --- State ---
let allPrDataCache = null;
let lastFetchTime = 0;

// --- Helper Functions ---
function getContentType(filePath) {
  /* ... (getContentType function as before) ... */
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html";
    case ".css":
      return "text/css";
    case ".js":
      return "application/javascript";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

async function serveStaticFile(requestedPath, res) {
  /* ... (serveStaticFile function as before) ... */
  const safePathSuffix = path
    .normalize(requestedPath)
    .replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.join(FRONTEND_DIR, safePathSuffix);
  if (!fullPath.startsWith(FRONTEND_DIR)) {
    console.warn(`[Server] Forbidden access attempt: ${requestedPath}`);
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  try {
    const stats = await fs.stat(fullPath);
    if (stats.isDirectory()) {
      console.warn(`[Server] Directory access denied: ${requestedPath}`);
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden: Directory listing not allowed.");
      return;
    }
    const data = await fs.readFile(fullPath);
    const contentType = getContentType(fullPath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
    console.log(`[Server] Served static file: ${requestedPath}`);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`[Server] Static file not found: ${fullPath}`);
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } else {
      console.error(`[Server] Error reading file ${fullPath}:`, err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  }
}

function buildRepoCacheKey(repos) {
  return repos
    .map((r) => `${r.owner}/${r.name}`)
    .sort()
    .join(",");
}

function parseReposParam(reposParam) {
  if (!reposParam) return [...DEFAULT_REPOS];
  try {
    const parsed = JSON.parse(reposParam);
    if (!Array.isArray(parsed)) return [...DEFAULT_REPOS];
    const validRepos = parsed
      .filter((r) => r && typeof r.owner === "string" && typeof r.name === "string")
      .map((r) => ({ owner: r.owner.trim(), name: r.name.trim() }))
      .filter((r) => r.owner && r.name);
    return validRepos.length > 0 ? validRepos.slice(0, MAX_REPOS) : [...DEFAULT_REPOS];
  } catch (e) {
    console.warn("[Server] Failed to parse repos param:", reposParam, e);
    return [...DEFAULT_REPOS];
  }
}

async function getPrData(repos = DEFAULT_REPOS, forceRefresh = false) {
  const now = Date.now();
  const repoKey = buildRepoCacheKey(repos);

  if (
    !forceRefresh &&
    allPrDataCache &&
    allPrDataCache.repoKey === repoKey &&
    now - lastFetchTime < CACHE_REFRESH_INTERVAL
  ) {
    console.log("[Server] Using locally cached PR data.");
    return allPrDataCache;
  }

  try {
    console.log("[Server] Fetching PR data from GitHub client...");
    const fetchedData = await fetchRepos(repos, forceRefresh, [
      "OPEN",
      "MERGED",
      "CLOSED",
    ]);

    const allPrs = (fetchedData.results || []).flatMap((r) => r.prs);
    const errors = fetchedData.errors || [];

    if (allPrs.length > 0 || errors.length === 0) {
      allPrDataCache = {
        repoKey,
        prList: allPrs,
        perRepo: fetchedData.results || [],
        errors,
      };
      lastFetchTime = Date.now();
      console.log(
        `[Server] Successfully fetched ${allPrs.length} PRs across ${fetchedData.results.length} repo(s). Errors: ${errors.length}`
      );
      return allPrDataCache;
    } else {
      console.error(
        "[Server] All repository fetches failed:",
        errors
      );
      if (allPrDataCache && allPrDataCache.repoKey === repoKey) {
        console.warn(
          "[Server] Returning stale PR data due to fetch error."
        );
        return allPrDataCache;
      }
      return { repoKey, prList: [], perRepo: [], errors };
    }
  } catch (error) {
    console.error("[Server] Error fetching PR data:", error);
    if (allPrDataCache && allPrDataCache.repoKey === buildRepoCacheKey(repos)) {
      console.warn("[Server] Returning stale PR data due to fetch error.");
      return allPrDataCache;
    } else {
      return { repoKey: buildRepoCacheKey(repos), prList: [], perRepo: [], errors: [{ owner: "-", name: "-", message: error.message }] };
    }
  }
}

function filterPrData(prList, queryParams) {
  /* ... (filterPrData function as before) ... */
  if (!Array.isArray(prList)) {
    console.warn("[Server] filterPrData received invalid prList:", prList);
    return [];
  }
  let filteredList = [...prList];
  const author = queryParams.get("author")?.toLowerCase();
  const approver = queryParams.get("approver")?.toLowerCase();
  const targetBranch = queryParams.get("targetBranch");
  const status = queryParams.get("status")?.toUpperCase();
  const excludeAuthor = queryParams.get("excludeAuthor")?.toLowerCase();
  const excludeBranchPattern = queryParams.get("excludeBranchPattern");
  const startDateStr = queryParams.get("startDate");
  const endDateStr = queryParams.get("endDate");
  const startDate = startDateStr ? new Date(startDateStr) : null;
  const endDate = endDateStr
    ? new Date(new Date(endDateStr).setDate(new Date(endDateStr).getDate() + 1))
    : null;
  if (startDate && isNaN(startDate.getTime()))
    console.warn("Invalid start date:", startDateStr);
  if (endDate && isNaN(endDate.getTime()))
    console.warn("Invalid end date:", endDateStr);
  filteredList = filteredList.filter((pr) => {
    if (!pr || !pr.createdAt) return false;
    const prCreatedAt = new Date(pr.createdAt);
    if (isNaN(prCreatedAt.getTime())) return false;
    if (startDate && !isNaN(startDate.getTime()) && prCreatedAt < startDate)
      return false;
    if (endDate && !isNaN(endDate.getTime()) && prCreatedAt >= endDate)
      return false;
    if (author && pr.author?.login?.toLowerCase() !== author) return false;
    if (status && pr.state !== status) return false;
    if (targetBranch && pr.baseRefName !== targetBranch) return false;
    if (approver) {
      const hasApproved = pr.reviews?.nodes?.some(
        (r) =>
          r.state === "APPROVED" && r.author?.login?.toLowerCase() === approver
      );
      if (!hasApproved) return false;
    }
    if (excludeAuthor && pr.author?.login?.toLowerCase() === excludeAuthor)
      return false;
    if (excludeBranchPattern && pr.baseRefName) {
      if (excludeBranchPattern.endsWith("/**")) {
        const prefix = excludeBranchPattern.slice(0, -3);
        if (pr.baseRefName.startsWith(prefix)) return false;
      } else if (pr.baseRefName === excludeBranchPattern) {
        return false;
      }
    }
    return true;
  });
  console.log(
    `[Server] Filtering: ${prList?.length || 0} PRs -> ${
      filteredList.length
    } PRs`
  );
  return filteredList;
}

// --- Request Handler ---
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  console.log(`[Server] Received request: ${method} ${pathname}`);

  try {
    // API Route for Metrics
    if (pathname === "/api/metrics" && method === "GET") {
      const forceRefresh = url.searchParams.get("forceRefresh") === "true";
      const includePrList = url.searchParams.get("includePrList") === "true"; // Check if details are requested

      const repos = parseReposParam(url.searchParams.get("repos"));
      if (!repos || repos.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Nenhum repositório informado." }));
        return;
      }

      const allPrData = await getPrData(repos, forceRefresh);

      if (!allPrData || (allPrData.prList.length === 0 && allPrData.errors.length > 0)) {
        console.error(
          "[Server] API /api/metrics: Failed to retrieve PR data from source.",
          allPrData?.errors
        );
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              "Falha crítica ao buscar dados do GitHub. Verifique os logs do servidor.",
            errors: allPrData?.errors || [],
          })
        );
        return;
      }

      const filteredData = filterPrData(allPrData.prList, url.searchParams);
      const metrics = calculateMetrics(filteredData);

      // Per-repo metrics
      const perRepoMetrics = {};
      (allPrData.perRepo || []).forEach(({ owner, name, prs }) => {
        const repoFullName = `${owner}/${name}`;
        const repoFiltered = filterPrData(prs, url.searchParams);
        perRepoMetrics[repoFullName] = calculateMetrics(repoFiltered);
      });

      const responsePayload = {
        metrics: metrics,
        perRepo: perRepoMetrics,
        errors: allPrData.errors || [],
        ...(includePrList && { prList: filteredData }),
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(responsePayload));
    }
    // API Route for unique filter values
    else if (pathname === "/api/filters" && method === "GET") {
      const repos = parseReposParam(url.searchParams.get("repos"));
      if (!repos || repos.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Nenhum repositório informado." }));
        return;
      }

      const prData = await getPrData(repos, false);
      if (!prData || (prData.prList.length === 0 && prData.errors.length > 0)) {
        console.error(
          "[Server] API /api/filters: Failed to retrieve PR data from source.",
          prData?.errors
        );
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Falha crítica ao buscar dados do GitHub para filtros.",
            errors: prData?.errors || [],
          })
        );
        return;
      }
      const prList = prData.prList || [];
      if (!Array.isArray(prList)) {
        console.error(
          "[Server] API /api/filters: Received invalid PR data structure:",
          prData
        );
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Estrutura de dados inválida recebida para filtros.",
          })
        );
        return;
      }
      const authors = [
        ...new Set(prList.map((pr) => pr.author?.login).filter(Boolean)),
      ].sort();
      const branches = [
        ...new Set(prList.map((pr) => pr.baseRefName).filter(Boolean)),
      ].sort();
      const approvers = [
        ...new Set(
          prList
            .flatMap(
              (pr) =>
                pr.reviews?.nodes
                  ?.filter((r) => r.state === "APPROVED")
                  .map((r) => r.author?.login) || []
            )
            .filter(Boolean)
        ),
      ].sort();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ authors, branches, approvers, errors: prData.errors || [] }));
    }
    // API Route for default configuration
    else if (pathname === "/api/config" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          defaultRepo: DEFAULT_REPO,
          maxRepos: MAX_REPOS,
        })
      );
    }
    // Serve Frontend Files
    else if (method === "GET") {
      let requestedFile;
      switch (pathname) {
        case "/":
        case "":
          requestedFile = "index.html";
          break;
        // REMOVED '/pr_details' case
        default:
          if (pathname.includes("..")) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Bad Request: Invalid path.");
            return;
          }
          requestedFile = pathname.substring(1);
          break;
      }
      await serveStaticFile(requestedFile, res);
    }
    // Handle other methods/paths
    else {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error("[Server] Unhandled error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    if (!res.writableEnded) {
      res.end(
        JSON.stringify({
          error: "Ocorreu um erro interno no servidor.",
          details: error.message,
        })
      );
    }
  }
});

// --- Start Server ---
server.listen(PORT, () => {
  /* ... (server start log messages as before) ... */
  console.log(`[Server] Backend server running at http://localhost:${PORT}`);
  console.log(`[Server] Serving frontend from: ${FRONTEND_DIR}`);
  fs.access(FRONTEND_DIR)
    .then(() => console.log(`[Server] Frontend directory found.`))
    .catch(() =>
      console.error(
        `[Server] ERROR: Frontend directory NOT FOUND at ${FRONTEND_DIR}.`
      )
    );
  getPrData(DEFAULT_REPOS).catch((err) =>
    console.error("[Server] Initial data fetch failed:", err)
  );
});

// --- Graceful Shutdown ---
process.on("SIGINT", () => {
  /* ... (SIGINT handler as before) ... */
  console.log("[Server] Received SIGINT. Shutting down gracefully...");
  server.close(() => {
    console.log("[Server] Server closed.");
    process.exit(0);
  });
});

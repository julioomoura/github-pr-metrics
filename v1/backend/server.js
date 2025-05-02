// backend/server.js
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const { calculateMetrics, aggregateMetrics } = require("./metrics");

const app = express();
const port = process.env.PORT || 3000;

// --- Configuration ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GHE_HOSTNAME = process.env.GHE_HOSTNAME;
const GITHUB_GRAPHQL_URL = `https://${GHE_HOSTNAME}/api/graphql`;

if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GHE_HOSTNAME) {
  console.error("Error: Missing required environment variables.");
  process.exit(1);
}

// --- Middleware ---
app.use(cors()); // Allow requests from frontend (adjust origin in production)
app.use(express.json()); // Parse JSON bodies

// Serve static files from the frontend directory
const frontendPath = path.join(__dirname, "..", "frontend");
console.log(`Serving static files from: ${frontendPath}`);
app.use(express.static(frontendPath));

// --- GraphQL Query ---
// Fetches 100 PRs per page, ordered by last update time. Includes fields for filtering and metrics.
// Adjust 'first: 100' based on performance and API limits. Fetch more pages if needed.
// Added timelineItems and commits for more accurate metric calculation.
const GET_PRS_QUERY = `
  query GetPullRequests($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 100, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          number
          title
          url
          state # OPEN, CLOSED, MERGED
          isDraft
          createdAt
          updatedAt
          closedAt
          mergedAt
          author {
            login
          }
          baseRefName # Target branch
          headRefName # Source branch
          additions
          deletions
          # Reviews - fetch first 100, paginate if needed for very active PRs
          reviews(first: 100) {
            nodes {
              author {
                login
              }
              state # COMMENTED, APPROVED, CHANGES_REQUESTED, DISMISSED
              createdAt
              submittedAt
              comments { # For comment count metric
                  totalCount
              }
            }
             # pageInfo { endCursor, hasNextPage } // Add if review pagination is needed
          }
          # Review Requests - useful for seeing who was asked vs who reviewed
          # reviewRequests(first: 20) {
          #   nodes {
          #     requestedReviewer {
          #       ... on User { login }
          #       ... on Team { name }
          #     }
          #   }
          # }

          # Timeline Items - crucial for draft/ready events, first review timing etc. Fetch last 50 events.
          timelineItems(last: 50, itemTypes: [READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT, PULL_REQUEST_REVIEW, MERGED_EVENT, CLOSED_EVENT]) {
               nodes {
                  __typename
                   ... on ReadyForReviewEvent { createdAt }
                   ... on ConvertToDraftEvent { createdAt }
                   ... on PullRequestReview { createdAt, submittedAt, author { login } }
                   ... on MergedEvent { createdAt, actor { login } }
                   ... on ClosedEvent { createdAt, actor { login } }
              }
              # pageInfo { startCursor, hasPreviousPage } // Add if timeline pagination is needed
          }

          # Commits - fetch first 5 commits to find the earliest one for cycle time
          commits(first: 5) {
              nodes {
                  commit {
                      authoredDate
                      committedDate
                  }
              }
              # pageInfo { endCursor, hasNextPage } // Add if commit pagination needed
          }
        }
      }
    }
  }
`;

// --- API Endpoint ---
app.get("/api/prs", async (req, res) => {
  console.log("Received request for /api/prs");
  let allPrs = [];
  let hasNextPage = true;
  let cursor = null;
  const maxPages = 10; // Limit requests to avoid hitting rate limits excessively (10 * 100 = 1000 PRs)
  let pagesFetched = 0;

  try {
    // Fetch PRs page by page
    while (hasNextPage && pagesFetched < maxPages) {
      console.log(`Workspaceing page ${pagesFetched + 1}... Cursor: ${cursor}`);
      const response = await axios.post(
        GITHUB_GRAPHQL_URL,
        {
          query: GET_PRS_QUERY,
          variables: {
            owner: GITHUB_REPO_OWNER,
            name: GITHUB_REPO_NAME,
            cursor: cursor,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.errors) {
        console.error(
          "GraphQL Errors:",
          JSON.stringify(response.data.errors, null, 2)
        );
        // Try to continue if partial data is available, otherwise throw
        if (
          !response.data.data?.repository?.pullRequests &&
          allPrs.length === 0
        ) {
          throw new Error(`GraphQL error: ${response.data.errors[0].message}`);
        }
      }

      const prData = response.data.data?.repository?.pullRequests;
      if (!prData) {
        console.warn(
          "No pull request data found in response page:",
          pagesFetched + 1
        );
        hasNextPage = false; // Stop if repository or pullRequests is null
      } else {
        allPrs = allPrs.concat(prData.nodes || []); // Add nodes from this page
        hasNextPage = prData.pageInfo.hasNextPage;
        cursor = prData.pageInfo.endCursor;
      }

      pagesFetched++;
      if (!hasNextPage) {
        console.log("No more pages to fetch.");
      }
      if (pagesFetched >= maxPages) {
        console.warn(
          `Reached maximum page limit (${maxPages}). Data might be incomplete.`
        );
      }
    }

    console.log(`Total PRs fetched before date filtering: ${allPrs.length}`);

    // --- Date Filtering ---
    const { startDate, endDate } = req.query;
    let filteredPrs = allPrs;

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      // Set end date to end of day for inclusive filtering
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      console.log(
        `Filtering between ${start?.toISOString()} and ${end?.toISOString()}`
      );

      filteredPrs = allPrs.filter((pr) => {
        const prDate = new Date(pr.updatedAt || pr.createdAt); // Filter by update date as default
        const isAfterStart = start ? prDate >= start : true;
        const isBeforeEnd = end ? prDate <= end : true;
        return isAfterStart && isBeforeEnd;
      });
      console.log(`Total PRs after date filtering: ${filteredPrs.length}`);
    } else {
      console.log("No date range specified, returning all fetched PRs.");
    }

    // --- Calculate Metrics for filtered PRs ---
    console.log("Calculating metrics...");
    const prsWithMetrics = filteredPrs.map((pr) => ({
      ...pr,
      metrics: calculateMetrics(pr), // Calculate metrics for each PR
    }));

    // --- Aggregate Metrics (Optional: could be done on frontend too) ---
    // const aggregated = aggregateMetrics(prsWithMetrics); // Calculate overall averages, etc.

    console.log("Sending response.");
    res.json({
      pullRequests: prsWithMetrics,
      // aggregatedMetrics: aggregated, // Uncomment to send aggregates
      totalFetched: allPrs.length,
      totalAfterDateFilter: filteredPrs.length,
    });
  } catch (error) {
    console.error("Error fetching or processing PR data:", error.message);
    if (error.response) {
      console.error(
        "Axios response error:",
        error.response.status,
        error.response.data
      );
      res.status(error.response.status).json({
        error: "Failed to fetch data from GitHub API.",
        details: error.response.data,
      });
    } else if (error.request) {
      console.error("Axios request error:", error.request);
      res.status(500).json({ error: "No response received from GitHub API." });
    } else {
      res.status(500).json({
        error: "Internal server error processing request.",
        details: error.message,
      });
    }
  }
});

// --- Catch-all for serving index.html (for SPA-like behavior) ---
// Make sure this comes after API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
  console.log(
    `GitHub Repo: <span class="math-inline">\{GITHUB\_REPO\_OWNER\}/</span>{GITHUB_REPO_NAME}`
  );
  console.log(`GitHub Enterprise URL: ${GITHUB_GRAPHQL_URL}`);
  console.log(`Frontend served from: ${frontendPath}`);
});

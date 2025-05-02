// backend/githubClient.js
import "dotenv/config"; // Load environment variables
import cache from "./cache.js";

// Environment Variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;
const GHE_HOSTNAME = process.env.GHE_HOSTNAME; // e.g., github.yourcompany.com
const GITHUB_API_URL = `https://${GHE_HOSTNAME}/api/graphql`;

// Constants
const PR_PAGE_SIZE = 50; // Number of PRs to fetch per request
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes for GitHub data cache

// Basic validation
if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GHE_HOSTNAME) {
  console.error(
    "Error: Missing required environment variables (GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GHE_HOSTNAME)."
  );
  console.error("Please check your .env file.");
  process.exit(1); // Exit if essential config is missing
}

/**
 * GraphQL query to fetch pull requests and relevant details.
 * Fetches details needed for metric calculations.
 * Adjusted requestedReviewer to avoid needing 'read:org' scope.
 * Added review comments count for accurate total comment count.
 */
const PULL_REQUEST_QUERY = `
  query GetPullRequests($owner: String!, $name: String!, $first: Int!, $after: String, $states: [PullRequestState!]) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: $first, after: $after, states: $states, orderBy: {field: CREATED_AT, direction: DESC}) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          id
          number
          title
          state # OPEN, CLOSED, MERGED
          url
          createdAt
          closedAt
          mergedAt
          isDraft
          author {
            login
          }
          baseRefName # Target branch
          headRefName # Source branch
          # Reviews - fetching first 50, might need pagination if many reviews
          # Fetching review comment count within each review
          reviews(first: 50) {
             nodes {
               author { login }
               createdAt
               state # APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
               comments { # Comments made within this specific review
                 totalCount
               }
             }
          }
          # Review Requests - who was asked to review
          # REMOVED '... on Team { name }' to avoid requiring 'read:org' scope
          reviewRequests(first: 10) {
            nodes {
              requestedReviewer {
                 ... on User { login }
                 # ... on Team { name } # Removed this line
              }
            }
          }
          # General Comments on the PR thread itself
          comments(first: 1) { # Only need totalCount here
            totalCount
          }
          # Commits associated with the PR - fetching last commit for potential cycle time start
          commits(last: 1) {
             nodes {
               commit {
                 committedDate
                 authoredDate # Might be different from committedDate
               }
             }
          }
          # Timeline items - useful for draft/ready events, first review etc. Fetching last 50 events.
          timelineItems(last: 50, itemTypes: [READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT, PULL_REQUEST_REVIEW]) {
            nodes {
              __typename
              ... on ReadyForReviewEvent {
                createdAt
              }
              ... on ConvertToDraftEvent {
                createdAt
              }
              ... on PullRequestReview {
                 author { login }
                 createdAt
                 state
              }
            }
          }
          additions
          deletions
          changedFiles
        }
      }
    }
  }
`;

/**
 * Fetches data from the GitHub GraphQL API.
 * @param {string} query - The GraphQL query string.
 * @param {object} variables - Variables for the GraphQL query.
 * @returns {Promise<object>} The JSON response from the API.
 * @throws {Error} If the fetch operation fails.
 */
async function fetchGraphQL(query, variables) {
  console.log(
    `[GraphQL] Fetching data for owner=${variables.owner}, name=${variables.name}...`
  );
  try {
    const response = await fetch(GITHUB_API_URL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[GraphQL] API Error: ${response.status} ${response.statusText}`,
        errorText
      );
      // Try to parse JSON error if possible
      let detail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson && errorJson.message) {
          detail = errorJson.message;
        }
      } catch (e) {
        /* ignore json parse error */
      }
      throw new Error(
        `GitHub API request failed: ${response.status} ${response.statusText}. Detail: ${detail}`
      );
    }

    const data = await response.json();
    if (data.errors) {
      console.error(
        "[GraphQL] API Errors:",
        JSON.stringify(data.errors, null, 2)
      );
      // Combine multiple errors if they exist
      const errorMessages = data.errors.map((err) => err.message).join("; ");
      throw new Error(`GitHub API returned errors: ${errorMessages}`);
    }
    console.log("[GraphQL] Fetch successful.");
    return data;
  } catch (error) {
    console.error("[GraphQL] Fetch error:", error);
    throw error; // Re-throw the error to be handled upstream
  }
}

/**
 * Fetches all pull requests for the configured repository, handling pagination.
 * Uses caching to avoid redundant API calls.
 * @param {boolean} forceRefresh - If true, bypasses the cache.
 * @param {string[]} [states=['OPEN', 'MERGED', 'CLOSED']] - Filter PRs by state.
 * @returns {Promise<Array<object> | null>} A list of all pull request nodes, or null on critical failure.
 */
async function getAllPullRequests(
  forceRefresh = false,
  states = ["OPEN", "MERGED", "CLOSED"]
) {
  const cacheKey = `prs_${GITHUB_REPO_OWNER}_${GITHUB_REPO_NAME}_${states.join(
    "_"
  )}_v2`; // Changed cache key due to query change

  if (!forceRefresh) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log("[GitHubClient] Returning cached PR data.");
      return cachedData;
    }
  } else {
    console.log("[GitHubClient] Force refresh requested, bypassing cache.");
  }

  console.log(
    `[GitHubClient] Fetching all PRs for ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME} with states: ${states.join(
      ", "
    )}...`
  );
  let allPRs = [];
  let hasNextPage = true;
  let afterCursor = null;
  let pageCount = 0;

  while (hasNextPage) {
    pageCount++;
    console.log(
      `[GitHubClient] Fetching page ${pageCount}... (after: ${
        afterCursor || "start"
      })`
    );
    const variables = {
      owner: GITHUB_REPO_OWNER,
      name: GITHUB_REPO_NAME,
      first: PR_PAGE_SIZE,
      after: afterCursor,
      states: states,
    };

    try {
      const data = await fetchGraphQL(PULL_REQUEST_QUERY, variables);

      if (!data?.data?.repository?.pullRequests) {
        console.warn(
          "[GitHubClient] Received unexpected data structure from API:",
          data
        );
        hasNextPage = false; // Stop pagination if structure is wrong
        break;
      }

      const prData = data.data.repository.pullRequests;
      const fetchedPRs = prData.nodes || [];
      allPRs = allPRs.concat(fetchedPRs);

      hasNextPage = prData.pageInfo.hasNextPage;
      afterCursor = prData.pageInfo.endCursor;

      console.log(
        `[GitHubClient] Fetched ${fetchedPRs.length} PRs on page ${pageCount}. Total fetched: ${allPRs.length}. Has next page: ${hasNextPage}`
      );

      // Optional: Add a small delay between pages to avoid hitting rate limits aggressively
      // await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[GitHubClient] Error fetching page ${pageCount}:`, error);
      // Decide how to handle partial failures: stop, retry, or continue?
      // For simplicity, we'll stop here.
      hasNextPage = false;
      // Return null if a page fails and we don't have complete data
      // Or throw error to indicate partial failure
      console.error(
        `[GitHubClient] Failed to fetch all PRs. Returning ${allPRs.length} fetched so far due to error.`
      );
      // Return partial data only if some were fetched, otherwise null/error
      if (allPRs.length > 0) {
        // Optionally cache partial results with a shorter TTL?
        // cache.set(cacheKey, allPRs, CACHE_TTL / 4); // Shorter cache for partial data
        return allPRs; // Return what we have
      } else {
        return null; // Indicate complete failure
      }
    }
  }

  console.log(
    `[GitHubClient] Finished fetching. Total PRs retrieved: ${allPRs.length}`
  );

  // Store the successfully fetched data in cache only if complete
  if (allPRs.length > 0 && !afterCursor) {
    // Ensure we finished pagination if hasNextPage became false without error
    cache.set(cacheKey, allPRs, CACHE_TTL);
  } else if (allPRs.length > 0 && afterCursor) {
    console.warn(
      "[GitHubClient] Caching potentially incomplete PR list due to pagination stopping early."
    );
    cache.set(cacheKey, allPRs, CACHE_TTL / 2); // Cache partial results with shorter TTL
  }

  return allPRs;
}

export { getAllPullRequests };

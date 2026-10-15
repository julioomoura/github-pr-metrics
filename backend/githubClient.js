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
const PR_PAGE_SIZE = 100; // Number of PRs to fetch per request (GitHub GraphQL max)
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes for GitHub data cache
const MAX_CONCURRENT_REPO_FETCHES = 3; // Limit parallel repo fetches to protect rate limits

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
 * Added 'name' field for authors.
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
            ... on User {
              name # <-- Adicionado campo name
            }
          }
          baseRefName # Target branch
          headRefName # Source branch
          # Reviews - fetching first 50
          reviews(first: 50) {
             nodes {
               author {
                 login
                 ... on User {
                   name # <-- Adicionado campo name
                 }
               }
               createdAt
               state # APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED
               comments { # Comments made within this specific review
                 totalCount
               }
             }
          }
          # Review Requests - who was asked to review
          reviewRequests(first: 10) {
            nodes {
              requestedReviewer {
                 ... on User { login name } # <-- Adicionado campo name
              }
            }
          }
          # General Comments on the PR thread itself
          comments(first: 1) { # Only need totalCount here
            totalCount
          }
          # Commits associated with the PR
          commits(last: 1) {
             nodes {
               commit {
                 committedDate
                 authoredDate
               }
             }
          }
          # Timeline items
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
                  author {
                     login
                     ... on User {
                       name # <-- Adicionado campo name
                     }
                  }
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
      let detail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson && errorJson.message) {
          detail = errorJson.message;
        }
      } catch (e) {
        /* ignore */
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
      const errorMessages = data.errors.map((err) => err.message).join("; ");
      throw new Error(`GitHub API returned errors: ${errorMessages}`);
    }
    console.log("[GraphQL] Fetch successful.");
    return data;
  } catch (error) {
    console.error("[GraphQL] Fetch error:", error);
    throw error;
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
  owner,
  name,
  forceRefresh = false,
  states = ["OPEN", "MERGED", "CLOSED"]
) {
  const cacheKey = `prs_${owner}_${name}_${states.join("_")}_v4`; // Changed cache key due to query change

  if (!forceRefresh) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`[GitHubClient] Returning cached PR data for ${owner}/${name}.`);
      return cachedData;
    }
  } else {
    console.log(`[GitHubClient] Force refresh requested for ${owner}/${name}, bypassing cache.`);
  }

  console.log(
    `[GitHubClient] Fetching all PRs for ${owner}/${name} with states: ${states.join(
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
      owner,
      name,
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
        hasNextPage = false;
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
    } catch (error) {
      console.error(`[GitHubClient] Error fetching page ${pageCount}:`, error);
      hasNextPage = false;
      console.error(
        `[GitHubClient] Failed to fetch all PRs. Returning ${allPRs.length} fetched so far due to error.`
      );
      if (allPRs.length > 0) {
        cache.set(cacheKey, allPRs, CACHE_TTL / 2); // Cache partial results with shorter TTL
        return allPRs;
      } else {
        return null; // Indicate complete failure
      }
    }
  }

  console.log(
    `[GitHubClient] Finished fetching. Total PRs retrieved: ${allPRs.length}`
  );

  // Store the successfully fetched data in cache only if complete
  if (allPRs.length > 0 && !hasNextPage) {
    // Check if pagination finished naturally
    cache.set(cacheKey, allPRs, CACHE_TTL);
  } else if (allPRs.length > 0) {
    console.warn(
      "[GitHubClient] Caching potentially incomplete PR list due to pagination stopping early."
    );
    cache.set(cacheKey, allPRs, CACHE_TTL / 2);
  }

  return allPRs;
}

/**
 * Fetches pull requests for multiple repositories in parallel with a concurrency limit.
 * Each PR is tagged with its repository information.
 * @param {Array<{owner: string, name: string}>} repos - List of repositories to fetch.
 * @param {boolean} forceRefresh - If true, bypasses the cache.
 * @param {string[]} states - Filter PRs by state.
 * @returns {Promise<{results: Array<{owner: string, name: string, prs: Array<object>}>, errors: Array<{owner: string, name: string, message: string}>}>}
 */
async function fetchRepos(
  repos,
  forceRefresh = false,
  states = ["OPEN", "MERGED", "CLOSED"]
) {
  if (!Array.isArray(repos) || repos.length === 0) {
    return { results: [], errors: [] };
  }

  const results = [];
  const errors = [];

  // Process repos in batches to limit concurrency
  for (let i = 0; i < repos.length; i += MAX_CONCURRENT_REPO_FETCHES) {
    const batch = repos.slice(i, i + MAX_CONCURRENT_REPO_FETCHES);
    const batchPromises = batch.map(async ({ owner, name }) => {
      try {
        const prs = await getAllPullRequests(owner, name, forceRefresh, states);
        if (prs === null) {
          throw new Error(`Failed to fetch PRs for ${owner}/${name}`);
        }
        // Tag each PR with repository info
        const taggedPrs = prs.map((pr) => ({
          ...pr,
          repository: {
            owner,
            name,
            fullName: `${owner}/${name}`,
          },
        }));
        return { owner, name, prs: taggedPrs };
      } catch (error) {
        console.error(`[GitHubClient] Error fetching ${owner}/${name}:`, error);
        return {
          error: true,
          owner,
          name,
          message: error.message || `Unknown error fetching ${owner}/${name}`,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((result) => {
      if (result.error) {
        errors.push({
          owner: result.owner,
          name: result.name,
          message: result.message,
        });
      } else {
        results.push({
          owner: result.owner,
          name: result.name,
          prs: result.prs,
        });
      }
    });
  }

  console.log(
    `[GitHubClient] Finished fetching ${repos.length} repo(s). Success: ${results.length}, Errors: ${errors.length}`
  );

  return { results, errors };
}

export { getAllPullRequests, fetchRepos };

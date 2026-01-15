# GitHub PR Metrics Dashboard

**Purpose:** Visualize key Pull Request (PR) metrics from a specific repository on GitHub Enterprise for performance and development flow analysis.

## Overview

This web dashboard allows you to fetch, filter, and analyze PR data, presenting aggregated metrics in charts and individual details in an interactive table. It connects to the GitHub Enterprise GraphQL API and features a simple Node.js backend and a frontend built with pure HTML/CSS/JavaScript.

## Main Features

- **Data Fetching:** Connects to GitHub Enterprise via the GraphQL API.
- **Caching:** Uses in-memory cache on the backend to optimize repeated API calls.
- **Filtering:** Allows filtering PRs by author, approver, target branch, status, and date range. Also supports excluding PRs by author or branch pattern.
- **Calculated Metrics:**
  - Time to First Review
  - Time in Draft
  - Reviewer Contribution / Approval Count
  - PR Cycle Time / Lead Time
  - Review Time
  - Merge Time / Time to Merge
  - PR Size (lines changed)
  - Total Number of Comments per PR (Review Depth)
- **Visualization:**
  - Aggregated charts (histograms/bar charts) for metrics.
  - Detailed table per PR (shown/hidden dynamically).
  - Column visibility control in the details table (saved locally).
  - Light/dark theme toggle (saved locally).
- **Default Filters:** Initially loads with predefined filters (Status: Merged, Exclude Author: dependabot, Target Branch: main, Period: last 30 days).

## Technologies Used

- **Backend:** Node.js (v22+), `dotenv`
- **Frontend:** HTML5, CSS3, JavaScript (ES Modules), Chart.js, date-fns
- **API:** GitHub Enterprise GraphQL API

## Running the Project

1.  **Prerequisites:**

    - Node.js (v22 or higher)
    - npm
    - GitHub Enterprise Personal Access Token (PAT) with `repo` scope.

2.  **Setup:**

    - Navigate to the `backend` folder: `cd backend`
    - Install dependencies: `npm install`
    - Create a `.env` file in the `backend` folder (you can copy from `.env.example` if available) and fill in the variables:
      - `GITHUB_TOKEN`: Your GitHub PAT.
      - `GITHUB_REPO_OWNER`: Repository owner (user/organization).
      - `GITHUB_REPO_NAME`: Repository name.
      - `GHE_HOSTNAME`: Your GHE instance hostname (e.g., `github.yourcompany.com`).
      - `PORT` (Optional): Server port (default: 3000).
    - **Important:** Add `.env` to your `.gitignore` file.

3.  **Start:**
    - Still in the `backend` folder, run: `node server.js`
    - Access `http://localhost:3000` (or the configured port) in your browser.

## Understanding the Metrics

- **Time to First Review:** Time from when the PR is ready for review until the first review action (approval, change request, review comment).
- **Time in Draft:** Time a PR spent in "Draft" state before being marked as "Ready for Review".
- **Reviewer Contribution:** Count of how many PRs each person approved.
- **PR Cycle Time (Lead Time):** Total time from PR creation to merge into the main branch.
- **Review Time:** Time from the first review to final approval or merge.
- **Merge Time:** Time from final approval to when the PR is actually merged.
- **PR Size:** Sum of lines added and deleted.
- **Total Number of Comments:** Sum of general PR comments and comments made in specific reviews.

## Limitations and Notes

- **Cache:** Backend cache is in-memory and resets with the server.
- **API Pagination:** Fetching reviews and comments within the main GraphQL query is limited (e.g., `first: 50`). PRs with a very large number of reviews may have incomplete comment counts or approver identification.
- **Performance:** For repositories with tens of thousands of PRs, initial fetching and processing may take longer.

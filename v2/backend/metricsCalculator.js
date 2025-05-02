// backend/metricsCalculator.js

/**
 * Calculates the time difference in hours between two date strings.
 * Returns null if either date is invalid or missing.
 * @param {string | Date | null} dateStartStr
 * @param {string | Date | null} dateEndStr
 * @returns {number | null} Difference in hours or null.
 */
function getTimeDifferenceInHours(dateStartStr, dateEndStr) {
  if (!dateStartStr || !dateEndStr) return null;
  try {
    const start = new Date(dateStartStr);
    const end = new Date(dateEndStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null; // Invalid date
    // Allow end date before start date for some metrics (e.g. if review happened before ready)
    // if (end < start) return null;

    const diffMilliseconds = end.getTime() - start.getTime();
    return diffMilliseconds / (1000 * 60 * 60); // Convert ms to hours
  } catch (e) {
    console.error("Error calculating time difference:", e);
    return null;
  }
}

/**
 * Finds the timestamp of the first review submitted for a PR.
 * Excludes comments that are not actual reviews (e.g., general comments).
 * @param {object} pr - The Pull Request node from GitHub API.
 * @returns {string | null} ISO timestamp of the first review or null.
 */
function findFirstReviewTime(pr) {
  // Check direct reviews first
  const actualReviews = (pr.reviews?.nodes || [])
    .filter((review) =>
      ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (actualReviews.length > 0) {
    return actualReviews[0].createdAt;
  }

  // Fallback: Check timeline items for the first review event
  // This might be less reliable if timeline items are limited
  const reviewTimelineItems = (pr.timelineItems?.nodes || [])
    .filter(
      (item) =>
        item.__typename === "PullRequestReview" &&
        ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(item.state)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (reviewTimelineItems.length > 0) {
    return reviewTimelineItems[0].createdAt;
  }

  return null; // No review found
}

/**
 * Finds the timestamp when the PR was last marked as "Ready for Review".
 * If never marked as ready (e.g., created directly as non-draft), returns PR creation time.
 * @param {object} pr - The Pull Request node from GitHub API.
 * @returns {string | null} ISO timestamp, or null if still draft and never marked ready.
 */
function findReadyForReviewTime(pr) {
  const readyEvents = (pr.timelineItems?.nodes || [])
    .filter((item) => item.__typename === "ReadyForReviewEvent")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // Sort chronological

  const draftEvents = (pr.timelineItems?.nodes || [])
    .filter((item) => item.__typename === "ConvertToDraftEvent")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const lastReadyEvent =
    readyEvents.length > 0 ? readyEvents[readyEvents.length - 1] : null;
  const lastDraftEvent =
    draftEvents.length > 0 ? draftEvents[draftEvents.length - 1] : null;

  if (lastReadyEvent) {
    // If the last event was 'Ready' or if the last 'Ready' event is after the last 'Draft' event
    if (
      !lastDraftEvent ||
      new Date(lastReadyEvent.createdAt) > new Date(lastDraftEvent.createdAt)
    ) {
      return lastReadyEvent.createdAt;
    }
  }

  // If it was never marked ready explicitly, but is *not* currently draft, it was ready from creation
  if (!lastReadyEvent && !pr.isDraft) {
    return pr.createdAt;
  }

  // If it's currently draft and was never marked ready, or last event was draft, return null
  return null;
}

/**
 * Finds the timestamp of the final approval.
 * @param {object} pr - The Pull Request node from GitHub API.
 * @returns {string | null} ISO timestamp of the last approval or null.
 */
function findLastApprovalTime(pr) {
  const approvals = (pr.reviews?.nodes || [])
    .filter((review) => review.state === "APPROVED")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort descending

  return approvals.length > 0 ? approvals[0].createdAt : null;
}

/**
 * Calculates various PR metrics from a list of PR data.
 * @param {Array<object>} prList - Array of PR nodes from GitHub API.
 * @returns {object} Object containing calculated metrics.
 */
function calculateMetrics(prList) {
  if (!prList || prList.length === 0) {
    return {
      summary: { count: 0 },
      timeToFirstReview: [],
      timeInDraft: [],
      reviewerContribution: {},
      prCycleTime: [],
      reviewTime: [],
      mergeTime: [],
      prSize: [],
      reviewDepth: [],
      errors: [], // To track PRs where metrics couldn't be calculated
    };
  }

  const metrics = {
    timeToFirstReview: [], // { prNumber, hours, createdAt, firstReviewAt }
    timeInDraft: [], // { prNumber, hours, createdAt, readyAt }
    reviewerContribution: {}, // { reviewerLogin: count }
    prCycleTime: [], // { prNumber, hours, createdAt, mergedAt }
    reviewTime: [], // { prNumber, hours, firstReviewAt, lastApprovalAt / mergedAt }
    mergeTime: [], // { prNumber, hours, lastApprovalAt, mergedAt }
    prSize: [], // { prNumber, linesChanged, filesChanged }
    reviewDepth: [], // { prNumber, commentCount }
    errors: [], // { prNumber, message }
    summary: {
      count: prList.length,
      open: prList.filter((pr) => pr.state === "OPEN").length,
      merged: prList.filter((pr) => pr.state === "MERGED").length,
      closed: prList.filter((pr) => pr.state === "CLOSED" && !pr.mergedAt)
        .length, // Closed but not merged
    },
  };

  prList.forEach((pr) => {
    try {
      const prNumber = pr.number;
      const createdAt = pr.createdAt;
      const mergedAt = pr.mergedAt;
      const closedAt = pr.closedAt; // Could be mergedAt or just closed time

      // --- Time in Draft ---
      // Time from creation until it was last marked 'Ready for Review'
      const readyAt = findReadyForReviewTime(pr);
      if (readyAt && new Date(readyAt) > new Date(createdAt)) {
        // Only calculate if it was actually marked ready after creation
        const draftHours = getTimeDifferenceInHours(createdAt, readyAt);
        if (draftHours !== null && draftHours > 0) {
          // Ensure positive duration
          metrics.timeInDraft.push({
            prNumber,
            hours: draftHours,
            createdAt,
            readyAt,
          });
        }
      }

      // --- Time to First Review ---
      // Calculated from when it was last marked ready for review
      if (readyAt) {
        const firstReviewAt = findFirstReviewTime(pr);
        if (firstReviewAt && new Date(firstReviewAt) >= new Date(readyAt)) {
          // Ensure review happened at or after ready time
          const reviewWaitHours = getTimeDifferenceInHours(
            readyAt,
            firstReviewAt
          );
          if (reviewWaitHours !== null) {
            metrics.timeToFirstReview.push({
              prNumber,
              hours: reviewWaitHours,
              readyAt,
              firstReviewAt,
            });
          }
        }
      }

      // --- Reviewer Contribution ---
      (pr.reviews?.nodes || []).forEach((review) => {
        if (review.state === "APPROVED" && review.author?.login) {
          const login = review.author.login;
          metrics.reviewerContribution[login] =
            (metrics.reviewerContribution[login] || 0) + 1;
        }
      });

      // --- PR Cycle Time (Lead Time) ---
      // From creation to merge. Simpler version.
      // More accurate: first commit to merge (requires more complex fetching)
      if (mergedAt) {
        const cycleHours = getTimeDifferenceInHours(createdAt, mergedAt);
        if (cycleHours !== null) {
          metrics.prCycleTime.push({
            prNumber,
            hours: cycleHours,
            createdAt,
            mergedAt,
          });
        }
      }

      // --- Review Time ---
      // From first review to final approval or merge (if approval missing)
      const firstReviewAtForReviewTime = findFirstReviewTime(pr);
      const lastApprovalAt = findLastApprovalTime(pr);
      // Use merge time as end only if it happened *after* the first review
      const reviewEndAt =
        lastApprovalAt ||
        (mergedAt &&
        firstReviewAtForReviewTime &&
        new Date(mergedAt) >= new Date(firstReviewAtForReviewTime)
          ? mergedAt
          : null);

      if (firstReviewAtForReviewTime && reviewEndAt) {
        const reviewHours = getTimeDifferenceInHours(
          firstReviewAtForReviewTime,
          reviewEndAt
        );
        if (reviewHours !== null && reviewHours >= 0) {
          // Ensure non-negative duration
          metrics.reviewTime.push({
            prNumber,
            hours: reviewHours,
            firstReviewAt: firstReviewAtForReviewTime,
            reviewEndAt,
          });
        }
      }

      // --- Merge Time ---
      // From last approval to merge
      if (lastApprovalAt && mergedAt) {
        const mergeWaitHours = getTimeDifferenceInHours(
          lastApprovalAt,
          mergedAt
        );
        if (mergeWaitHours !== null && mergeWaitHours >= 0) {
          // Ensure merge is at or after approval
          metrics.mergeTime.push({
            prNumber,
            hours: mergeWaitHours,
            lastApprovalAt,
            mergedAt,
          });
        }
      }

      // --- PR Size ---
      const linesChanged = (pr.additions || 0) + (pr.deletions || 0);
      metrics.prSize.push({
        prNumber,
        linesChanged,
        filesChanged: pr.changedFiles || 0,
      });

      // --- Review Depth (Total Comments) ---
      // Sum of general PR comments + comments within each review
      const generalCommentCount = pr.comments?.totalCount || 0;
      const reviewCommentCount = (pr.reviews?.nodes || []).reduce(
        (sum, review) => {
          return sum + (review.comments?.totalCount || 0);
        },
        0
      );
      const totalCommentCount = generalCommentCount + reviewCommentCount;
      metrics.reviewDepth.push({ prNumber, commentCount: totalCommentCount });
    } catch (error) {
      console.error(`Error processing PR #${pr?.number || "unknown"}:`, error);
      metrics.errors.push({
        prNumber: pr?.number || "unknown",
        message: error.message,
      });
    }
  });

  // Sort reviewer contribution
  metrics.reviewerContribution = Object.entries(metrics.reviewerContribution)
    .sort(([, countA], [, countB]) => countB - countA) // Sort descending by count
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});

  console.log("[MetricsCalculator] Metrics calculated successfully.");
  return metrics;
}

export { calculateMetrics };

// backend/metricsCalculator.js

/** Calculates the time difference in hours */
function getTimeDifferenceInHours(dateStartStr, dateEndStr) {
  if (!dateStartStr || !dateEndStr) return null;
  try {
    const start = new Date(dateStartStr);
    const end = new Date(dateEndStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffMilliseconds = end.getTime() - start.getTime();
    return diffMilliseconds / (1000 * 60 * 60);
  } catch (e) {
    console.error("Error calculating time difference:", e);
    return null;
  }
}

/** Finds the timestamp of the first actual review */
function findFirstReviewTime(pr) {
  const actualReviews = (pr.reviews?.nodes || [])
    .filter((review) =>
      ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (actualReviews.length > 0) return actualReviews[0].createdAt;

  const reviewTimelineItems = (pr.timelineItems?.nodes || [])
    .filter(
      (item) =>
        item.__typename === "PullRequestReview" &&
        ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(item.state)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (reviewTimelineItems.length > 0) return reviewTimelineItems[0].createdAt;

  return null;
}

/** Finds the timestamp when the PR was last marked ready */
function findReadyForReviewTime(pr) {
  const readyEvents = (pr.timelineItems?.nodes || [])
    .filter((item) => item.__typename === "ReadyForReviewEvent")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const draftEvents = (pr.timelineItems?.nodes || [])
    .filter((item) => item.__typename === "ConvertToDraftEvent")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const lastReadyEvent =
    readyEvents.length > 0 ? readyEvents[readyEvents.length - 1] : null;
  const lastDraftEvent =
    draftEvents.length > 0 ? draftEvents[draftEvents.length - 1] : null;
  if (lastReadyEvent) {
    if (
      !lastDraftEvent ||
      new Date(lastReadyEvent.createdAt) > new Date(lastDraftEvent.createdAt)
    ) {
      return lastReadyEvent.createdAt;
    }
  }
  if (!lastReadyEvent && !pr.isDraft) {
    return pr.createdAt;
  }
  return null;
}

/** Finds the timestamp of the final approval */
function findLastApprovalTime(pr) {
  const approvals = (pr.reviews?.nodes || [])
    .filter((review) => review.state === "APPROVED")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
      errors: [],
    };
  }

  const metrics = {
    timeToFirstReview: [],
    timeInDraft: [],
    reviewerContribution: {}, // Key will be reviewer name (fallback login)
    prCycleTime: [],
    reviewTime: [],
    mergeTime: [],
    prSize: [],
    reviewDepth: [],
    errors: [],
    summary: {
      count: prList.length,
      open: prList.filter((pr) => pr.state === "OPEN").length,
      merged: prList.filter((pr) => pr.state === "MERGED").length,
      closed: prList.filter((pr) => pr.state === "CLOSED" && !pr.mergedAt)
        .length,
    },
  };

  prList.forEach((pr) => {
    try {
      const prNumber = pr.number;
      const createdAt = pr.createdAt;
      const mergedAt = pr.mergedAt;
      const closedAt = pr.closedAt;

      // --- Time in Draft ---
      const readyAt = findReadyForReviewTime(pr);
      if (readyAt && new Date(readyAt) > new Date(createdAt)) {
        const draftHours = getTimeDifferenceInHours(createdAt, readyAt);
        if (draftHours !== null && draftHours > 0) {
          metrics.timeInDraft.push({
            prNumber,
            hours: draftHours,
            createdAt,
            readyAt,
          });
        }
      }

      // --- Time to First Review ---
      if (readyAt) {
        const firstReviewAt = findFirstReviewTime(pr);
        if (firstReviewAt && new Date(firstReviewAt) >= new Date(readyAt)) {
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

      // --- Reviewer Contribution (Using Name) ---
      (pr.reviews?.nodes || []).forEach((review) => {
        if (review.state === "APPROVED" && review.author) {
          // Use name if available, otherwise fall back to login
          const reviewerIdentifier = review.author.name || review.author.login;
          if (reviewerIdentifier) {
            // Ensure we have an identifier
            metrics.reviewerContribution[reviewerIdentifier] =
              (metrics.reviewerContribution[reviewerIdentifier] || 0) + 1;
          }
        }
      });

      // --- PR Cycle Time ---
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
      const firstReviewAtForReviewTime = findFirstReviewTime(pr);
      const lastApprovalAt = findLastApprovalTime(pr);
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
          metrics.reviewTime.push({
            prNumber,
            hours: reviewHours,
            firstReviewAt: firstReviewAtForReviewTime,
            reviewEndAt,
          });
        }
      }

      // --- Merge Time ---
      if (lastApprovalAt && mergedAt) {
        const mergeWaitHours = getTimeDifferenceInHours(
          lastApprovalAt,
          mergedAt
        );
        if (mergeWaitHours !== null && mergeWaitHours >= 0) {
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
      const generalCommentCount = pr.comments?.totalCount || 0;
      const reviewCommentCount = (pr.reviews?.nodes || []).reduce(
        (sum, review) => sum + (review.comments?.totalCount || 0),
        0
      );
      metrics.reviewDepth.push({
        prNumber,
        commentCount: generalCommentCount + reviewCommentCount,
      });
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
    .sort(([, countA], [, countB]) => countB - countA)
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});

  console.log("[MetricsCalculator] Metrics calculated successfully.");
  return metrics;
}

export { calculateMetrics };

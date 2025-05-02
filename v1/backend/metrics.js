// backend/metrics.js
const MILLISECONDS_PER_HOUR = 1000 * 60 * 60;
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * 24;

function calculateDuration(start, end, unit = "hours") {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate - startDate;
  if (diffMs < 0) return null; // End date is before start date

  switch (unit) {
    case "days":
      return diffMs / MILLISECONDS_PER_DAY;
    case "hours":
    default:
      return diffMs / MILLISECONDS_PER_HOUR;
  }
}

function findFirstReview(pr) {
  if (!pr.reviews?.nodes?.length) return null;

  let firstReview = null;
  for (const review of pr.reviews.nodes) {
    // Ignore reviews from the PR author themselves for 'time to first review'
    if (review.author?.login && review.author.login !== pr.author?.login) {
      // Use submittedAt if available, otherwise createdAt
      const reviewTs = review.submittedAt || review.createdAt;
      if (
        reviewTs &&
        (!firstReview || new Date(reviewTs) < new Date(firstReview.timestamp))
      ) {
        firstReview = { ...review, timestamp: reviewTs };
      }
    }
  }
  return firstReview;
}

function findFirstCommitDate(pr) {
  if (!pr.commits?.nodes?.length) return pr.createdAt; // Fallback to PR creation time

  let earliestDate = pr.createdAt; // Start with PR creation as a baseline
  pr.commits.nodes.forEach((node) => {
    const commitDate = node.commit?.authoredDate || node.commit?.committedDate;
    if (commitDate && new Date(commitDate) < new Date(earliestDate)) {
      earliestDate = commitDate;
    }
  });
  return earliestDate;
}

function findLastApproval(pr) {
  if (!pr.reviews?.nodes?.length) return null;
  let lastApproval = null;
  for (const review of pr.reviews.nodes) {
    if (review.state === "APPROVED") {
      const approvalTs = review.submittedAt || review.createdAt;
      if (
        approvalTs &&
        (!lastApproval ||
          new Date(approvalTs) > new Date(lastApproval.timestamp))
      ) {
        lastApproval = { ...review, timestamp: approvalTs };
      }
    }
  }
  return lastApproval;
}

function findReadyForReviewEvent(pr) {
  // Look for the *first* ReadyForReviewEvent in the timeline
  const readyEvent = pr.timelineItems?.nodes?.find(
    (item) => item.__typename === "ReadyForReviewEvent"
  );
  return readyEvent ? readyEvent.createdAt : null;
}

function calculateMetrics(pr) {
  const metrics = {};
  const now = new Date().toISOString(); // For ongoing calculations

  // --- Metric Calculations ---

  // Time in Draft: createdAt -> readyForReviewEvent.createdAt (if exists)
  const readyForReviewTs = findReadyForReviewEvent(pr);
  if (pr.isDraft && !readyForReviewTs) {
    // Still in draft, calculate duration until now
    metrics.timeInDraftHours = calculateDuration(pr.createdAt, now);
    metrics.timeInDraftDays = calculateDuration(pr.createdAt, now, "days");
  } else if (readyForReviewTs) {
    // Was draft, now ready (or was ready and maybe merged/closed)
    metrics.timeInDraftHours = calculateDuration(
      pr.createdAt,
      readyForReviewTs
    );
    metrics.timeInDraftDays = calculateDuration(
      pr.createdAt,
      readyForReviewTs,
      "days"
    );
  } else {
    // Never was draft (or started as ready)
    metrics.timeInDraftHours = 0;
    metrics.timeInDraftDays = 0;
  }

  // Time to First Review: readyForReviewTs (or createdAt if never draft) -> first review timestamp
  const effectiveOpenTs = readyForReviewTs || pr.createdAt; // When did it become "reviewable"?
  const firstReview = findFirstReview(pr);
  if (firstReview) {
    metrics.timeToFirstReviewHours = calculateDuration(
      effectiveOpenTs,
      firstReview.timestamp
    );
    metrics.timeToFirstReviewDays = calculateDuration(
      effectiveOpenTs,
      firstReview.timestamp,
      "days"
    );
  } else if (pr.state === "OPEN" && !pr.isDraft) {
    // Open, not draft, but no reviews yet
    metrics.timeToFirstReviewHours = calculateDuration(effectiveOpenTs, now);
    metrics.timeToFirstReviewDays = calculateDuration(
      effectiveOpenTs,
      now,
      "days"
    );
  } else {
    metrics.timeToFirstReviewHours = null;
    metrics.timeToFirstReviewDays = null;
  }

  // PR Cycle Time / Lead Time: first commit -> mergedAt
  const firstCommitTs = findFirstCommitDate(pr);
  if (pr.mergedAt) {
    metrics.cycleTimeHours = calculateDuration(firstCommitTs, pr.mergedAt);
    metrics.cycleTimeDays = calculateDuration(
      firstCommitTs,
      pr.mergedAt,
      "days"
    );
  } else {
    metrics.cycleTimeHours = null; // Not merged yet
    metrics.cycleTimeDays = null;
  }

  // Review Time: first review timestamp -> mergedAt (or last approval if more accurate definition needed)
  if (firstReview && pr.mergedAt) {
    metrics.reviewTimeHours = calculateDuration(
      firstReview.timestamp,
      pr.mergedAt
    );
    metrics.reviewTimeDays = calculateDuration(
      firstReview.timestamp,
      pr.mergedAt,
      "days"
    );
  } else {
    metrics.reviewTimeHours = null;
    metrics.reviewTimeDays = null;
  }

  // Merge Time: last approval timestamp -> mergedAt
  const lastApproval = findLastApproval(pr);
  if (lastApproval && pr.mergedAt) {
    metrics.mergeTimeHours = calculateDuration(
      lastApproval.timestamp,
      pr.mergedAt
    );
    metrics.mergeTimeDays = calculateDuration(
      lastApproval.timestamp,
      pr.mergedAt,
      "days"
    );
  } else {
    metrics.mergeTimeHours = null;
    metrics.mergeTimeDays = null;
  }

  // PR Size
  metrics.prSizeLines = (pr.additions || 0) + (pr.deletions || 0);
  metrics.prSizeFiles = pr.files?.totalCount || 0; // Requires fetching files connection

  // Reviewer Contribution / Approval Count (will be aggregated later)
  metrics.approvers =
    pr.reviews?.nodes
      ?.filter((r) => r.state === "APPROVED" && r.author?.login)
      .map((r) => r.author.login) || [];
  // Ensure unique approvers per PR if needed by using new Set(approvers)

  // Number of Comments per PR (Review Depth)
  metrics.commentCount =
    pr.reviews?.nodes?.reduce(
      (sum, review) => sum + (review.comments?.totalCount || 0),
      0
    ) || 0;
  // Add timeline comments if needed (more complex query)

  return metrics;
}

// Helper to aggregate metrics across multiple PRs (e.g., averages)
function aggregateMetrics(prsWithMetrics) {
  const aggregates = {
    totalPRs: prsWithMetrics.length,
    averageTimeToFirstReviewHours: 0,
    averageTimeInDraftHours: 0,
    averageCycleTimeDays: 0,
    averageReviewTimeHours: 0,
    averageMergeTimeHours: 0,
    averagePrSizeLines: 0,
    averageCommentCount: 0,
    reviewerContributions: {}, // { reviewerLogin: count }
    countMetrics: {
      // Count how many PRs contributed to each average
      timeToFirstReview: 0,
      timeInDraft: 0,
      cycleTime: 0,
      reviewTime: 0,
      mergeTime: 0,
      prSize: 0,
      commentCount: 0,
    },
  };

  if (aggregates.totalPRs === 0) return aggregates; // Avoid division by zero

  let totalTimeToFirstReview = 0;
  let totalTimeInDraft = 0;
  let totalCycleTime = 0;
  let totalReviewTime = 0;
  let totalMergeTime = 0;
  let totalPrSize = 0;
  let totalCommentCount = 0;

  prsWithMetrics.forEach((pr) => {
    if (pr.metrics.timeToFirstReviewHours !== null) {
      totalTimeToFirstReview += pr.metrics.timeToFirstReviewHours;
      aggregates.countMetrics.timeToFirstReview++;
    }
    if (pr.metrics.timeInDraftHours !== null) {
      totalTimeInDraft += pr.metrics.timeInDraftHours;
      // Count only if it was ever draft or calculation is valid
      if (pr.isDraft || findReadyForReviewEvent(pr)) {
        aggregates.countMetrics.timeInDraft++;
      } else if (pr.metrics.timeInDraftHours === 0 && !pr.isDraft) {
        // Don't count PRs that were never draft towards the *average* draft time
      } else {
        aggregates.countMetrics.timeInDraft++; // Include 0 time for valid cases
      }
    }
    if (pr.metrics.cycleTimeDays !== null) {
      totalCycleTime += pr.metrics.cycleTimeDays;
      aggregates.countMetrics.cycleTime++;
    }
    if (pr.metrics.reviewTimeHours !== null) {
      totalReviewTime += pr.metrics.reviewTimeHours;
      aggregates.countMetrics.reviewTime++;
    }
    if (pr.metrics.mergeTimeHours !== null) {
      totalMergeTime += pr.metrics.mergeTimeHours;
      aggregates.countMetrics.mergeTime++;
    }
    if (pr.metrics.prSizeLines !== null) {
      totalPrSize += pr.metrics.prSizeLines;
      aggregates.countMetrics.prSize++;
    }
    if (pr.metrics.commentCount !== null) {
      totalCommentCount += pr.metrics.commentCount;
      aggregates.countMetrics.commentCount++;
    }

    // Aggregate reviewer contributions (approvals)
    const uniqueApprovers = new Set(pr.metrics.approvers); // Count each approver once per PR
    uniqueApprovers.forEach((approver) => {
      aggregates.reviewerContributions[approver] =
        (aggregates.reviewerContributions[approver] || 0) + 1;
    });
  });

  // Calculate averages, handling potential division by zero
  aggregates.averageTimeToFirstReviewHours =
    aggregates.countMetrics.timeToFirstReview > 0
      ? totalTimeToFirstReview / aggregates.countMetrics.timeToFirstReview
      : 0;
  aggregates.averageTimeInDraftHours =
    aggregates.countMetrics.timeInDraft > 0
      ? totalTimeInDraft / aggregates.countMetrics.timeInDraft
      : 0;
  aggregates.averageCycleTimeDays =
    aggregates.countMetrics.cycleTime > 0
      ? totalCycleTime / aggregates.countMetrics.cycleTime
      : 0;
  aggregates.averageReviewTimeHours =
    aggregates.countMetrics.reviewTime > 0
      ? totalReviewTime / aggregates.countMetrics.reviewTime
      : 0;
  aggregates.averageMergeTimeHours =
    aggregates.countMetrics.mergeTime > 0
      ? totalMergeTime / aggregates.countMetrics.mergeTime
      : 0;
  aggregates.averagePrSizeLines =
    aggregates.countMetrics.prSize > 0
      ? totalPrSize / aggregates.countMetrics.prSize
      : 0;
  aggregates.averageCommentCount =
    aggregates.countMetrics.commentCount > 0
      ? totalCommentCount / aggregates.countMetrics.commentCount
      : 0;

  return aggregates;
}

module.exports = {
  calculateMetrics,
  aggregateMetrics,
};

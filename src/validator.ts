import type { PullRequest, PullRequestReviewEvent } from '@octokit/webhooks-types';
import type { ApprovalRule, Review, ValidationResult } from './types';

export const validateApprovals = ({
  rule,
  reviews,
  payload,
}: {
  rule: ApprovalRule;
  reviews: Review[];
  payload: PullRequest | PullRequestReviewEvent;
}): ValidationResult | null => {
  // get the latest review status for each user
  const latestReviewByUser = new Map<string, { submittedAt: Date; state: string }>();
  for (const review of reviews) {
    // NOTE: ignore COMMENTED state since it's possible to comment after approval
    if (review.state === 'COMMENTED') {
      continue;
    }

    const submittedAt = new Date(review.submitted_at ?? '');
    const reviewer = review.user?.login ?? '';

    if (
      !latestReviewByUser.has(reviewer) ||
      new Date(latestReviewByUser.get(reviewer)?.submittedAt ?? '') < submittedAt
    ) {
      latestReviewByUser.set(reviewer, { submittedAt, state: review.state });
    }
  }

  const approvalCount = Array.from(latestReviewByUser.values()).filter(
    (review) => review.state === 'APPROVED'
  ).length;
  const approved = approvalCount >= rule.requires.count;

  let isTarget = true;

  const fromBranch = 'head' in payload ? payload.head.ref : payload.pull_request?.head?.ref;
  const author = 'user' in payload ? payload.user?.login : payload.pull_request?.user?.login;

  // from_branch のパターンチェック
  if (rule.if.from_branch != null) {
    const pattern = new RegExp(rule.if.from_branch.pattern);
    isTarget = isTarget && pattern.test(fromBranch);
  }

  // has_author_in のユーザーチェック
  if (rule.if.has_author_in != null) {
    isTarget = isTarget && rule.if.has_author_in.users.includes(author);
  }

  // NOTE: matches nothing when if is set but none of the conditions are met
  if (rule.if != null && !isTarget) {
    return null;
  }

  return {
    approved,
    approvalCount,
    requiredCount: rule.requires.count,
  };
};

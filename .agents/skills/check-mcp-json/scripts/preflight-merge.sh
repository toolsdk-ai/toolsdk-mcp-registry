#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 <pr-number> [base-ref]" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
pr_number=$1
base_ref=${2:-origin/main}
[[ $pr_number =~ ^[0-9]+$ ]] || usage

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
review_script="$script_dir/review-pr.sh"
repo_root=$(git -C "$script_dir" rev-parse --show-toplevel)

state=$(gh pr view "$pr_number" --json state --jq .state)
is_draft=$(gh pr view "$pr_number" --json isDraft --jq .isDraft)
mergeable=$(gh pr view "$pr_number" --json mergeable --jq .mergeable)
merge_state=$(gh pr view "$pr_number" --json mergeStateStatus --jq .mergeStateStatus)
check_count=$(gh pr view "$pr_number" --json statusCheckRollup --jq '.statusCheckRollup | length')

[[ $state == "OPEN" ]] || { echo "PR #$pr_number is not open." >&2; exit 1; }
[[ $is_draft == "false" ]] || { echo "PR #$pr_number is still a draft." >&2; exit 1; }
[[ $mergeable == "MERGEABLE" ]] || {
  echo "PR #$pr_number is not currently mergeable: $mergeable." >&2
  exit 1
}
[[ $merge_state == "CLEAN" ]] || {
  echo "PR #$pr_number merge state is $merge_state, not CLEAN." >&2
  exit 1
}
(( check_count > 0 )) || { echo "PR #$pr_number has no reported checks." >&2; exit 1; }

gh pr checks "$pr_number"

repo_slug=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=${repo_slug%%/*}
name=${repo_slug#*/}
unresolved=$(gh api graphql \
  -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved isOutdated}}}}}' \
  -F owner="$owner" \
  -F name="$name" \
  -F number="$pr_number" \
  --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false and .isOutdated == false)] | length')
[[ $unresolved == "0" ]] || {
  echo "PR #$pr_number has $unresolved unresolved review thread(s)." >&2
  exit 1
}

"$review_script" "$pr_number" "$base_ref"

echo
echo "Preflight passed for PR #$pr_number."
echo "No merge was performed. Use:"
echo "gh pr merge $pr_number --squash"

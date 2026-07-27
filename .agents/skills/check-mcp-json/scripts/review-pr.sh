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

for command in git gh node; do
  command -v "$command" >/dev/null || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(git -C "$script_dir" rev-parse --show-toplevel)
trusted_sha=$(git -C "$repo_root" rev-parse HEAD)
base_sha=$(git -C "$repo_root" rev-parse "$base_ref")

if [[ $trusted_sha != "$base_sha" ]]; then
  echo "Trusted checkout HEAD ($trusted_sha) does not match $base_ref ($base_sha)." >&2
  echo "Refresh main before reviewing the pull request." >&2
  exit 1
fi

if [[ -n $(git -C "$repo_root" status --porcelain) ]]; then
  echo "Trusted checkout must be clean before reviewing a pull request." >&2
  exit 1
fi

head_sha=$(gh pr view "$pr_number" --json headRefOid --jq .headRefOid)
review_ref="refs/codex/review/$pr_number"
temp_root=$(mktemp -d "${TMPDIR:-/tmp}/toolsdk-pr-${pr_number}.XXXXXX")
review_dir="$temp_root/pr"

cleanup() {
  if [[ -d $review_dir ]]; then
    git -C "$repo_root" worktree remove "$review_dir" >/dev/null 2>&1 || true
  fi
  rmdir "$temp_root" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git -C "$repo_root" fetch origin "pull/$pr_number/head:$review_ref" --force
fetched_sha=$(git -C "$repo_root" rev-parse "$review_ref")
if [[ $fetched_sha != "$head_sha" ]]; then
  echo "PR head changed while preparing review: expected $head_sha, fetched $fetched_sha." >&2
  echo "Rerun the review to bind validation to the latest head commit." >&2
  exit 1
fi

echo "PR metadata:"
gh pr view "$pr_number" --json number,title,state,isDraft,headRefOid,headRefName,headRepositoryOwner,maintainerCanModify,mergeable,mergeStateStatus,statusCheckRollup,url

echo
echo "Changed files:"
gh pr diff "$pr_number" --name-only

git -C "$repo_root" worktree add --detach "$review_dir" "$review_ref" >/dev/null

echo
echo "Trusted registry validation for PR #$pr_number at $head_sha:"
node "$repo_root/scripts/validate-registry.mjs" \
  --root "$review_dir" \
  --base "$base_ref"

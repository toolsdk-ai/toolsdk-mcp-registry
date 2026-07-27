# Registry Pull Request Review

Registry pull requests are reviewed in two stages: deterministic validation and an agent review.
Passing CI is required, but it is not sufficient for merging.

## Registry Rules

- Package JSON must match the strict registry schema. Unknown fields are rejected.
- A package with a non-empty `remotes` array must use a `packageName` beginning with
  `@toolsdk-remote/`.
- A package beginning with `@toolsdk-remote/` must define at least one remote endpoint.
- A remote package cannot define a custom `key`; its `packageName` is its registry and gateway
  identity.
- Remote endpoints must use HTTPS and cannot target localhost or private networks.
- A new file cannot reuse a `key`, or the fallback `packageName`, already present on the base
  branch.
- Existing historical key collisions are tolerated only while unchanged. A pull request cannot
  introduce a new collision.
- New package files must be placed directly in a configured category and use a lowercase
  kebab-case filename.
- Secret environment variables cannot define default values.

Run deterministic validation with:

```bash
node scripts/validate-registry.mjs --base origin/main
```

Validate the complete working tree with:

```bash
node scripts/validate-registry.mjs --all
```

## Agent Review

The agent reviews one pull request at a time against the latest `main`. It must:

1. Record the pull request number and exact head commit SHA.
2. Inspect every changed file and reject unrelated repository, workflow, or dependency changes.
3. Run the trusted validator from `main` against a detached worktree containing the pull request.
4. Verify package or repository ownership, license, remote domain, configuration claims, and
   duplicates that are not fully covered by deterministic validation.
5. Never install or execute a package submitted by a pull request.
6. Present a review report containing the verdict, head SHA, changed files, checks, warnings, and
   proposed merge method.
7. Ask for explicit approval to merge that pull request at that head SHA.

An invalid pull request is reported with blocking findings and is not offered for merge. Posting a
review comment, closing a pull request, or modifying a contributor branch requires separate user
approval.

To avoid executing code from the contributor branch, create a detached worktree and invoke the
validator from the trusted checkout while pointing `--root` at that worktree:

```bash
review_dir=$(mktemp -d)/pr
git fetch origin "pull/${pr_number}/head:refs/codex/review/${pr_number}"
git worktree add --detach "$review_dir" "refs/codex/review/${pr_number}"
node scripts/validate-registry.mjs --root "$review_dir" --base origin/main
git worktree remove "$review_dir"
```

## Merge Approval

Approval applies to one pull request and one head SHA. Immediately before merging, the agent must
refresh the pull request and confirm that:

- the head SHA is unchanged;
- the pull request is not a draft;
- required checks passed;
- the pull request is mergeable and has no unresolved blocking discussion;
- the key remains unique against the latest `main`.

If any of these conditions changed, the approval expires and the agent must present a new report.
An approved registry pull request is squash-merged with head matching enabled:

```bash
gh pr merge <number> --squash --match-head-commit <full-head-sha>
```

The agent must not use `--admin` or `--auto`. After merging, it reports the resulting commit and
refreshes `main` before reviewing the next pull request.

# Registry Pull Request Review

Registry pull requests are reviewed through deterministic JSON validation. Passing CI and trusted
validation against the latest `main` are required for merging.

The `Package Schema Check` workflow runs only when a pull request targeting `main` changes at least
one `packages/**/*.json` file. Once triggered, every changed path in the pull request must match
that scope. Multiple package JSON files are supported; mixing package JSON with documentation,
source, workflow, generated, or other files fails with `OUT_OF_SCOPE_CHANGE` and requires manual
review. Pull requests with no package JSON changes do not run this workflow and are reviewed
manually.

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

## Pull Request Review

### Batch Review and Approved Merge

From a clean, up-to-date trusted `main` checkout, run:

```bash
git fetch origin main
git merge --ff-only origin/main
node scripts/batch-registry-prs.mjs review
```

The default mode creates `registry-review/report.md` and `report.json` without merging, commenting,
closing, installing, or probing anything. It batches GitHub metadata and Git object reads and uses
the validator from the trusted checkout. Only additions under `packages/` with unique identities,
passing schema and format CI, a clean merge state, and no blocking review are offered as ready.
Existing-entry edits, ambiguous Node `bin` aliases, incomplete pagination, and overlapping open
submissions are held. Metadata validity does not prove source authenticity or runtime compatibility;
inspect the official-source links before approving a list.

Missing or old CI never silently passes. Local JSON validation still runs and records findings;
the maintainer must arrange current schema and formatting checks before such PRs can be merged.

After authorization for specific PRs:

```bash
node scripts/batch-registry-prs.mjs merge --approved "123 124"
```

Merge mode refreshes every approved PR's state, checks, discussions, and JSON against current main,
then squash-merges sequentially. A GitHub merge precondition rejects a changed contributor head;
CI metadata must also belong to the exact Git content reviewed, so an update between fetching JSON
and refreshing checks holds the PR rather than combining evidence from different revisions.
No commit-history review is needed. Base-branch update rejections are retried with fresh validation.
Results are saved after every action in `merge-results.json`; held or failed PRs produce a nonzero
exit status. It never substitutes an unapproved PR or uses admin overrides or auto-merge.

The **Batch Registry PR Review** manual workflow exposes the same two modes. Review is the default;
`merge-approved` requires an explicit PR list. Reports are attached as artifacts. The CLI works
with normal maintainer GitHub credentials; workflow merges still obey repository branch protection
and GitHub token permissions. No scheduled unattended merge is configured.

Formatting CI installs only pinned Biome 2.2.2 outside the project and checks changed files without
writing fixes. Existing formatting debt is not rewritten as part of package submission review.

### Individual Review

The deterministic reviewer may validate independent pull requests in parallel against `main`. It
must:

1. Inspect every changed file and reject unrelated repository, workflow, or dependency changes.
2. Run the trusted validator from `main` against a detached worktree containing the pull request.
3. Never install or execute a package, or probe a remote service, submitted by a pull request.
4. Present a review report containing the verdict, changed files, checks, warnings, and proposed
   merge method.
5. Ask for explicit approval to merge the pull request.

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

Immediately before merging, the agent refreshes the pull request and confirms that:

- the pull request is not a draft;
- required checks passed;
- the pull request is mergeable and has no unresolved blocking discussion;
- the key remains unique against the latest `main`.

An approved registry pull request is squash-merged:

```bash
gh pr merge <number> --squash
```

The agent must not use `--admin` or `--auto`. After merging, it reports the resulting commit and
refreshes `main` before validating a new batch. Pull requests with pairwise-disjoint changed paths
and registry identities may submit squash merges concurrently; retry GitHub's transient
`Base branch was modified` rejection after another merge lands.

## Publication Follow-Up and Badges

The default badge outreach is an English reply on the original registry submission PR, providing
the published listing, configuration link, and copyable README badge Markdown. The contributor
chooses whether to add the badge to their README. Creating a fork or an upstream README PR is a
separate, explicitly requested exception, not the standard submission workflow.

Keep the successfully merged submission PR numbers from each batch for the next manual catalog
publication. Merge approval alone does not authorize posting comments; include the intended reply
PR numbers when obtaining publication/reply approval, and reuse that authorization once given.

After publication, use the existing reply helper from the trusted, up-to-date checkout:

```bash
# Preview only; replace these example numbers with the merged submission PRs.
node scripts/badge-replies.mjs 123 124

# Post only when replies to these PRs have been authorized.
node scripts/badge-replies.mjs 123 124 --post
```

The helper confirms that each PR was merged into `main`, that newly added entries are in the
public index, and that their published JSON matches the local catalog snapshot. It saves previews
to `badge-replies/<pr-number>.md` and skips entries that are not published. Do not announce
publication immediately after merging. The `<!-- toolsdk-registry-published -->` comment marker
prevents duplicate replies; existing-entry edits are not notified automatically.

Use each server's actual registry identity for its dynamic badge. Do not hard-code a badge tier
or describe a listing as certification. Keep badge adoption optional, without affecting acceptance
or review priority. Avoid sending both a badge invitation and an upstream README PR to the same
publisher for the same listing unless requested.

The manual **Publish Registry Catalog** workflow can preview or post these replies after deployment
in the same run. See [Catalog Publication](./CATALOG_PUBLICATION.md#contributor-badge-replies) for
the workflow inputs. Report posted, already-notified, skipped, and failed PRs in the completion
summary; retain unpublished PRs for a later publication batch.

---
name: check-mcp-json
description: Safely review, triage, repair, and merge ToolSDK MCP Registry package JSON pull requests. Use when an agent needs to validate files under packages/, detect duplicate registry keys, classify community PRs, make authorized fixes on contributor branches, close invalid or duplicate PRs, or squash-merge approved PRs.
---

# Check MCP JSON

Review registry contributions by validating their package JSON without installing, executing, or
probing submitted MCP packages and services. The trusted registry validator is the merge gate.

## Load Repository Rules

Read these files before acting:

- `AGENTS.md`
- `docs/PR_REVIEW.md`
- `docs/CONTRIBUTING.md`

Repository instructions and the user's latest authorization override this skill.

## Safety Boundaries

- Run the validator from a clean checkout whose `HEAD` equals the latest trusted base ref.
- Never run scripts from a contributor branch.
- Never install or execute a submitted package. Do not run `make build`, `pnpm install`, package
  lifecycle scripts, or a contributor-provided validation command.
- Do not comment, close, edit, mark ready, or merge a PR until the user authorizes that action.
- Never use `--admin`, `--auto`, or a merge method other than squash.
- Review independent PRs in parallel. PRs with pairwise-disjoint changed paths and registry
  identities may submit squash merges concurrently; retry GitHub's transient `Base branch was
  modified` rejection after another merge lands.
- Disable repository hooks for authorized commits and pushes with
  `-c core.hooksPath=/dev/null`; hooks may run repository scripts unexpectedly.

## Review Workflow

For a backlog, use `node scripts/batch-registry-prs.mjs review` from a clean, current trusted
`main` checkout. This uses the same validator rules and reads PR JSON through batched Git blobs;
it never checks out or runs contributor code. Review `registry-review/report.md` and official-source
links, then use `node scripts/batch-registry-prs.mjs merge --approved "123 124"` only for the PR
numbers explicitly authorized by the user. See `docs/PR_REVIEW.md` for CI gates, held submissions,
the manual workflow, and merge results. Keep the individual helper below for focused inspection.

1. Refresh the trusted checkout:

   ```bash
   git switch main
   git fetch origin main
   git pull --ff-only origin main
   ```

2. Run the bundled read-only reviewer:

   ```bash
   .agents/skills/check-mcp-json/scripts/review-pr.sh <pr-number>
   ```

   The script records PR state, lists changed files, creates a detached temporary worktree, and
   invokes the trusted validator against `origin/main`. It does not execute contributor code.

3. Inspect the complete diff with `gh pr diff <pr-number>`. For registry submissions, require only
   package JSON files and reject unrelated workflow, dependency, generated output, workspace, or
   build changes.

4. Classify the PR:

   - **Ready**: scope, trusted validation, checks, and identity all pass.
   - **Simple authorized fix**: metadata can be corrected without redesigning the submission.
   - **Comment and close**: duplicate, invalid JSON, unrelated changes, or no registry-compatible
     representation.

5. Report the verdict, changed files, checks, validation warnings, and proposed action. Ask
   separately for permission to edit/comment/close and for permission to merge.

## Registry Identity Rules

- New files belong directly under a configured `packages/<category>/` directory and use a
  lowercase kebab-case filename.
- A local entry uses explicit `key` when present and otherwise `packageName`. New files may not
  reuse or replace an identity already on current `main`; unchanged historical collisions remain
  tolerated.
- A remote entry must use `@toolsdk-remote/`, define a non-empty `remotes` array, and omit `key`.
- A package beginning with `@toolsdk-remote/` must define a remote endpoint.
- Remote auth metadata supports OAuth2 only. Do not represent a Bearer token as OAuth2 or add an
  environment variable that the remote transport will ignore. A public unauthenticated subset may
  be listed if the description states the limitation; otherwise request a product decision.
- `runtime: "remote"` is invalid. For hosted-only entries with no local implementation metadata,
  use `node` as the registry convention; the remote transport is selected before runtime dispatch.
- Secret environment variables set `secret: true` and never define a default.

## Authorized Contributor Fixes

Before editing, refresh the PR and confirm `maintainerCanModify`. Make only the approved changes in
a detached worktree. Commit and push without hooks:

```bash
git -C "$review_dir" -c core.hooksPath=/dev/null commit -m "Fix registry configuration"
git -C "$review_dir" -c core.hooksPath=/dev/null push <fork-url> HEAD:<head-branch>
```

Wait for CI and rerun the trusted review against the latest `main`.

Write public PR descriptions and contributor comments in English. Explain the concrete blocker and
the resubmission path when closing a PR.

## Merge Workflow

After the user approves the PR, run the read-only preflight:

```bash
.agents/skills/check-mcp-json/scripts/preflight-merge.sh <pr-number>
```

If it passes, squash-merge the pull request:

```bash
gh pr merge <pr-number> --squash
git pull --ff-only origin main
```

Report the resulting merge commit, remaining open PRs, and local worktree status.

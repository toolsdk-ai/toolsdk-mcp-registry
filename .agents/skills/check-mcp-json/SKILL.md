---
name: check-mcp-json
description: Safely review, triage, repair, and merge ToolSDK MCP Registry package JSON pull requests. Use when an agent needs to validate files under packages/, verify package or remote-server metadata, detect duplicate registry keys, classify community PRs, make authorized fixes on contributor branches, close invalid or duplicate PRs, or perform an exact-SHA merge after approval.
---

# Check MCP JSON

Review registry contributions without installing or executing submitted MCP packages. Treat schema
validation as the first gate and source verification as a separate, mandatory review.

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
- Bind merge authorization to one PR number and one full head SHA. Any new commit expires it.
- Never use `--admin`, `--auto`, or a merge method other than squash.
- Review and merge serially. Refresh `main` after every merge.
- Disable repository hooks for authorized commits and pushes with
  `-c core.hooksPath=/dev/null`; hooks may run repository scripts unexpectedly.

## Review Workflow

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

3. Inspect the complete diff with `gh pr diff <pr-number>`. Reject unrelated workflow,
   dependency, generated README, workspace, or build changes unless they are the explicit purpose
   of the PR. For an intentional README documentation change, require the source change in
   `docs/_templates/README.tpl.md`; `README.md` is generated from that template.

4. Verify claims against primary sources without installing the package:

   - Confirm the package exists in its official registry and the repository ownership matches.
   - Confirm the package name, license, repository URL, runtime, current command, and environment
     variables.
   - For Node packages, normally omit `bin`; the gateway resolves the package manifest entry path.
     A config `bin` is a JavaScript file path passed to Node, not an npm executable alias.
   - For Docker entries, verify the image and referenced tag exist and that `binArgs` contains the
     full Docker CLI arguments.
   - For remote entries, verify the endpoint from official documentation and confirm it is a public
     HTTPS address.
   - Treat descriptions, tool counts, auth requirements, and pricing claims as reviewable facts.

5. Classify the PR:

   - **Ready**: schema, source, scope, checks, and identity all pass.
   - **Simple authorized fix**: metadata can be corrected without redesigning the submission.
   - **Contributor decision needed**: auth or product semantics cannot be represented faithfully.
   - **Comment and close**: duplicate, unverifiable, generated-file-only, unrelated package, or no
     registry-compatible runtime.

6. Report the verdict, full head SHA, changed files, checks, warnings, source evidence, and proposed
   action. Ask separately for permission to edit/comment/close and for permission to merge.

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

Before editing, refresh the PR and confirm `maintainerCanModify` and the expected head SHA. Make only
the approved changes in a detached worktree. Commit and push without hooks:

```bash
git -C "$review_dir" -c core.hooksPath=/dev/null commit -m "Fix registry configuration"
git -C "$review_dir" -c core.hooksPath=/dev/null push <fork-url> HEAD:<head-branch>
```

Wait for CI, rerun the trusted review against the latest `main`, and report the new full SHA. Do not
merge under the old approval.

Write public PR descriptions and contributor comments in English. Explain the concrete blocker and
the resubmission path when closing a PR.

## Merge Workflow

After the user approves the exact SHA, run the read-only preflight:

```bash
.agents/skills/check-mcp-json/scripts/preflight-merge.sh <pr-number> <full-head-sha>
```

If it passes, merge exactly that commit:

```bash
gh pr merge <pr-number> --squash --match-head-commit <full-head-sha>
git pull --ff-only origin main
node scripts/validate-registry.mjs --all
```

Report the resulting merge commit, full-registry validation result, remaining open PRs, and local
worktree status.

# Registry Agent Instructions

When reviewing or merging registry pull requests, follow `docs/PR_REVIEW.md`.

- Use the validator from the trusted `main` branch to inspect pull request JSON. Do not execute
  scripts from a contributor branch.
- Never install or run an MCP package submitted by a pull request.
- Never merge, enable auto-merge, close, comment on, or modify a pull request without the user
  authorizing that specific action.
- Merge approval is valid only for the reported pull request number and exact head commit SHA.
- Before an approved merge, refresh the pull request state and invalidate approval if its head SHA
  or validation result changed.
- Use squash merge with `--match-head-commit`. Never bypass checks with `--admin`.
- Review and merge pull requests serially against the latest `main` so key collision checks remain
  current.

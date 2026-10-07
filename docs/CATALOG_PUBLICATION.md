# Catalog Publication

Run `make catalog` with Node.js 22 to regenerate the entire directory in one batch. This reads
package JSON, preserves existing validation and tool records, and produces indexes, the README,
the full catalog, and a searchable static site under `catalog-site/`. It does not install packages,
query npm, start MCP servers, change dependency lists, or perform runtime validation. The existing
hosting blacklist and published winners of historical identity collisions remain in effect.
An identity collision without a surviving published winner stops generation rather than hiding an
entry. If a key moves to a different package path, runtime validation and tool records are not
inherited from the old path.

Use **Publish Registry Catalog** on `main` to commit generated directory files and deploy the
generated Pages artifact. One run covers every eligible entry, including a backlog of merged PRs.
The npm and Gateway release processes remain separate. Publishing a directory entry does not
guarantee that a local package is installed in the Gateway or that authentication is supported.

## Contributor Badge Replies

The catalog workflow accepts an optional space-separated list of merged PR numbers. After Pages
deployment, it checks that each added entry is present in the published index and that published
JSON matches the deployed catalog snapshot, even if main changes while the workflow is running.
It saves an English reply with directory/configuration links and optional README badge Markdown.
Preview mode is the default. Select `post_badge_replies` only when authorizing comments on those specific PRs; a marker
prevents repeated replies on subsequent runs. Existing-entry edits are not notified automatically.

For local previews after publication:

```bash
node scripts/badge-replies.mjs 123 124
```

Add `--post` to send explicitly authorized replies. The badges reuse `badges.toolsdk.ai` and use
registry identities rather than display names. Registered means indexed; Verified reflects the
existing validation record, not official certification. Badge data is cached for five minutes.

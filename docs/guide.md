# ToolSDK MCP Registry Guides

Find MCP servers, connect your applications, and contribute to the registry.

| Your goal | Guide |
| --- | --- |
| Discover a server | [Search the published catalog](https://toolsdk-ai.github.io/toolsdk-mcp-registry/) or [browse all servers](./ALL-MCP-SERVERS.md). |
| Deploy the Gateway | [Gateway setup](./GATEWAY.md#deploy-the-gateway). |
| Call tools from an application | [HTTP API walkthrough](./GATEWAY.md#integrate-through-the-http-api). |
| Connect a standard MCP client | [Client configuration and protocol walkthrough](./GATEWAY.md#connect-a-standard-mcp-client). |
| Use ToolSDK in an AI application | [ToolSDK tutorial](https://toolsdk.ai/docs/tutorials/getting-started). |
| Submit a local or remote MCP server | [Contribution Guide](./CONTRIBUTING.md), including JSON examples and validation. |
| Develop the Registry or Gateway | [Developer Guide](./DEVELOPMENT.md). |
| Review registry submissions | [Registry PR Review](./PR_REVIEW.md). |
| Generate and publish the catalog | [Catalog Publication](./CATALOG_PUBLICATION.md). |

## Registry Configuration

- [`packages/`](../packages/) contains server JSON configurations organized by category.
- [`config/categories.mjs`](../config/categories.mjs) defines the categories.
- [`config/hosting-blacklist.mjs`](../config/hosting-blacklist.mjs) defines catalog exclusions.
- [`indexes/packages-list.json`](../indexes/packages-list.json) maps registry identities to configuration paths and metadata.

Use the [Contribution Guide](./CONTRIBUTING.md) for configuration fields, local and remote examples,
identity rules, and the dependency-free submission validator.

## Documentation and Catalog Updates

For README changes, edit [`docs/_templates/README.tpl.md`](./_templates/README.tpl.md), then
regenerate the catalog with Node.js 22 or later:

```bash
make catalog
# Equivalent command, including on Windows:
node scripts/generate-catalog.mjs
```

This generates the indexes, README, complete server list, and static catalog in one batch using
package JSON. It does not install or execute MCP servers.

Maintainers publish manually through **Publish Registry Catalog** on GitHub Actions. See
[Catalog Publication](./CATALOG_PUBLICATION.md) for the complete workflow and contributor badge replies.

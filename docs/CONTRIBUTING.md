# Contributing to the ToolSDK MCP Registry

Thank you for contributing an MCP server, documentation improvement, or code change.

This guide is the source of truth for registry submissions. The root README and generated indexes
are outputs of the registry build and must not be edited to add a server. For an intentional README
documentation change, edit `docs/_templates/README.tpl.md` and regenerate the README.

## Submit an MCP Server

1. Fork the repository and create a focused branch.
2. Add one JSON file under `packages/<category>/`.
3. Validate the change against the latest `main`.
4. Open a pull request that links the official package or server documentation.

Prefer one MCP server per pull request. A PR may contain multiple closely related servers from the
same publisher, but it must not include unrelated workspace, workflow, dependency, lockfile, README,
or generated-index changes.

### File Location and Name

- Choose a category defined in [`config/categories.mjs`](../config/categories.mjs). Use
  [`packages/uncategorized`](../packages/uncategorized) when no category is a clear fit.
- Place the file directly in that category directory; nested package directories are not supported.
- Use a lowercase kebab-case filename, for example `packages/databases/example-mcp.json`.
- Do not manually edit the root README or files under `indexes/`; they are generated. README
  documentation changes belong in `docs/_templates/README.tpl.md`.

### Source Requirements

A registry entry must identify something users can actually connect to or run:

- A local entry needs a public package or Docker image whose name and command can be verified.
- A remote entry needs an official, public HTTPS Streamable HTTP endpoint.
- The repository, package registry, license, environment variables, authentication, and description
  must agree with the publisher's current documentation.
- Do not submit an unpublished package, private repository, placeholder package name, unrelated npm
  package, or a full application without a stable standalone MCP command or endpoint.

Reviewers verify metadata from primary sources. They do not install or execute contributed MCP
packages during review.

## Local Package Example

```json
{
  "type": "mcp-server",
  "name": "Example MCP Server",
  "packageName": "example-mcp-server",
  "description": "Provides example operations for MCP clients.",
  "url": "https://github.com/example/example-mcp-server",
  "readme": "https://github.com/example/example-mcp-server#readme",
  "runtime": "node",
  "license": "MIT",
  "env": {
    "EXAMPLE_API_KEY": {
      "description": "API key for the Example service.",
      "required": true,
      "secret": true
    }
  }
}
```

For Node packages, normally omit `bin`. The gateway resolves the first `bin` entry, or `main`, from
the installed package manifest. A configured `bin` is treated as a JavaScript entry-file path passed
to Node; it is not an npm executable alias.

For Docker entries, use the published image as `packageName`, set `runtime` to `docker`, and put the
complete Docker CLI argument list in `binArgs`:

```json
{
  "type": "mcp-server",
  "name": "Example Docker MCP",
  "packageName": "ghcr.io/example/example-mcp",
  "description": "Runs the Example MCP server from its published container image.",
  "url": "https://github.com/example/example-mcp",
  "runtime": "docker",
  "license": "MIT",
  "binArgs": ["run", "--rm", "-i", "ghcr.io/example/example-mcp:latest"],
  "env": {}
}
```

The image and referenced tag must exist.

## Remote MCP Servers

Remote servers use a registry placeholder beginning with `@toolsdk-remote/` and a non-empty
`remotes` array:

```json
{
  "type": "mcp-server",
  "name": "Example Remote MCP",
  "packageName": "@toolsdk-remote/example-mcp",
  "description": "Connects to the hosted Example MCP endpoint.",
  "url": "https://github.com/example/example-mcp",
  "runtime": "node",
  "license": "MIT",
  "env": {},
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://example.com/mcp"
    }
  ]
}
```

Remote rules:

- `packageName` must start with `@toolsdk-remote/`.
- A package beginning with `@toolsdk-remote/` must define at least one remote endpoint.
- Do not define `key`; the remote `packageName` is its registry and gateway identity.
- Endpoints must use HTTPS and cannot target localhost or a private network.
- `runtime: "remote"` is not valid. Use the implementation runtime when known. For a hosted-only
  server without local runtime metadata, use `node`; the remote transport is selected first.

### OAuth 2.1

The registry can describe OAuth2 authentication:

```json
{
  "type": "mcp-server",
  "name": "Example OAuth MCP",
  "packageName": "@toolsdk-remote/example-oauth-mcp",
  "description": "Connects to the hosted Example MCP endpoint using OAuth.",
  "runtime": "node",
  "env": {},
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://example.com/mcp",
      "auth": {
        "type": "oauth2",
        "scopes": ["read", "write"]
      }
    }
  ]
}
```

OAuth2 is currently the only supported remote `auth.type`. Bearer/API-key header metadata and
credentials embedded dynamically in remote URLs are not supported. Do not model Bearer auth as
OAuth2 or add an environment variable expecting the remote transport to inject it. A server with a
useful unauthenticated subset may be listed without `auth` when the description clearly states the
limitation. `auth.scopes` is optional; when present, it must be an array of strings.

## Configuration Fields

Package JSON is strict. Unknown fields are rejected.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | Yes | Must be `"mcp-server"`. |
| `runtime` | string | Yes | One of `node`, `python`, `java`, `go`, or `docker`. |
| `packageName` | string | Yes | Published package/image identity, or an `@toolsdk-remote/` placeholder. |
| `packageVersion` | string | No | Package version; latest is used when omitted. |
| `bin` | string | No | Node entry-file path. Normally omit and use the package manifest. |
| `binArgs` | string[] | No | Arguments passed to the runtime command. |
| `remotes` | array | No | Hosted Streamable HTTP endpoints. |
| `key` | string | No | Custom local registry identity. Forbidden for remote entries. |
| `name` | string | No | Display name. |
| `description` | string | No | Accurate, current summary of the server's capabilities. |
| `readme` | string | No | Official README or documentation URL. |
| `url` | string | No | Official package or source repository URL. |
| `license` | string | No | License reported by the official source. |
| `logo` | string | No | Custom logo URL. |
| `author` | string | No | Publisher or ToolSDK developer identifier. |
| `env` | object | No | Environment-variable metadata; use `{}` when none are needed. |

Each environment variable requires:

- `description`: what the value is used for.
- `required`: whether the server can start or provide its advertised capability without it.
- `secret` (optional): set to `true` for tokens, passwords, private keys, and similar credentials.
- `default` (optional): a non-secret default value. Secret variables cannot define defaults.

## Registry Identity and Duplicates

The effective identity is `key` when a non-empty custom key is present; otherwise it is
`packageName`.

- New entries must not reuse an identity already present on the latest `main`.
- A new file cannot replace an existing identity, even when the old file would be deleted in the
  same PR.
- Historical duplicate identities are tolerated only while unchanged; a PR cannot introduce a new
  collision.
- Use a custom `key` only when a local package needs a stable identity distinct from its package
  name. Never use it to take over an existing entry.

## Validate Before Opening a PR

The registry validator uses Node.js built-ins and does not require installing repository
dependencies.

```bash
git fetch origin main
node scripts/validate-registry.mjs --base origin/main
```

This validates the package JSON changed by your branch and checks identities against the current
base. To validate every registry entry in the working tree:

```bash
node scripts/validate-registry.mjs --all
```

Do not use `make build` as a submission validator. It installs and executes registry packages and
also regenerates repository outputs.

## Pull Request Checklist

- [ ] The PR contains only the intended package JSON file or closely related package files.
- [ ] The filename is lowercase kebab-case and the category exists.
- [ ] Package/image names, tags, commands, endpoints, auth, environment variables, and license were
      checked against official sources.
- [ ] The effective registry identity is new.
- [ ] Remote entries follow the `@toolsdk-remote/` and `remotes` rules.
- [ ] Secrets are marked and have no defaults.
- [ ] `node scripts/validate-registry.mjs --base origin/main` passes.
- [ ] The PR description links the official package, repository, or endpoint documentation.

CI passing is required but is not the final review. Maintainers also inspect the diff and verify the
source metadata. When the fork allows maintainer edits, an authorized maintainer may push a small
metadata correction to the contributor branch; any new commit is reviewed again before merge.

## Code and Documentation Contributions

Keep code changes separate from registry-entry submissions when possible. Describe the behavior,
tests, and migration impact in the PR. See the [Development Guide](./DEVELOPMENT.md) and
[Registry PR Review](./PR_REVIEW.md) for repository-specific engineering and review rules.

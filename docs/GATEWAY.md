# ToolSDK MCP Gateway Guide

Deploy the Gateway once, then connect through the HTTP API or a standard MCP client.

| Connection | Use it for | Endpoint |
| --- | --- | --- |
| HTTP API | Application integrations, tool discovery, and explicit tool execution | `/api/v1/packages/*` |
| MCP Streamable HTTP | MCP clients that discover and call a server's tools | `/mcp/<registry-key>` |

Both paths use identities from the [registry index](https://toolsdk-ai.github.io/toolsdk-mcp-registry/indexes/packages-list.json).
Use the index key, including any scope such as `@modelcontextprotocol/` or `@toolsdk-remote/`.
Each MCP endpoint represents one registered server.

## Deploy the Gateway

```bash
git clone https://github.com/toolsdk-ai/toolsdk-mcp-registry.git
cd toolsdk-mcp-registry
docker compose up -d
```

Docker Compose builds the application and starts the Gateway on port **3003**, together with
Meilisearch on port **7700**. The default image installs the repository's Node and Python
dependencies. Use a local package available in your deployment or a configured remote entry.

- [Registry interface](http://localhost:3003)
- [Swagger UI](http://localhost:3003/swagger)
- [OpenAPI JSON](http://localhost:3003/api/v1/doc)

The examples below use `@modelcontextprotocol/server-everything` and its `echo` tool without
service credentials. API requests use local execution by default.

For isolated API execution with Sandock, create a `.env` file before starting Compose:

```dotenv
SANDOCK_API_KEY=your-sandock-api-key
```

Then include `"sandboxProvider": "SANDOCK"` in tool execution requests, or
`sandboxProvider=SANDOCK` when listing tools. Compose passes `SANDOCK_API_KEY` into the container.
See the [Developer Guide](./DEVELOPMENT.md#environment-variables) for other providers and configuration.
The MCP endpoint uses its upstream transport directly; the API's `sandboxProvider` setting applies
to HTTP API operations.

## Integrate Through the HTTP API

### 1. Inspect the Registry and Server

```bash
curl --fail-with-body http://localhost:3003/api/v1/indexes/packages-list

curl --fail-with-body --get http://localhost:3003/api/v1/packages/detail \
  --data-urlencode 'packageName=@modelcontextprotocol/server-everything'
```

The index response contains registry entries under `data`. Use the selected entry's key as
`packageName` in subsequent requests. The detail response contains its configuration and tool information.

### 2. Discover Tools

```bash
curl --fail-with-body --get http://localhost:3003/api/v1/packages/tools \
  --data-urlencode 'packageName=@modelcontextprotocol/server-everything'
```

Read each tool's `name` and `inputSchema` in `data`. Use the tool's name as `toolKey` and provide
arguments matching its schema. Listing tools can connect to or start the selected upstream server.

### 3. Execute a Tool

```bash
curl --fail-with-body http://localhost:3003/api/v1/packages/run \
  -H 'Content-Type: application/json' \
  -d '{
    "packageName": "@modelcontextprotocol/server-everything",
    "toolKey": "echo",
    "inputData": { "message": "Hello from ToolSDK!" },
    "envs": {}
  }'
```

Inspect the response's `success` and `data` fields; API failures may be represented in the JSON
body even when the HTTP status is 200. For servers with service credentials, supply those values
through `envs` in execution requests, using the names in the server's registry configuration.
Keep credentials in your application's secret storage.

For remote OAuth integrations, follow the existing [OAuth walkthrough](./DEVELOPMENT.md#10--oauth-integration).
The API accepts an `accessToken` for supported OAuth servers; `envs` describes process environment
variables and is not a generic remote Authorization header.

### 4. Search the Registry (Optional)

With search enabled, initialize and populate Meilisearch, then query the registry:

```bash
curl --fail-with-body -X POST http://localhost:3003/api/v1/search/manage/init
curl --fail-with-body -X POST http://localhost:3003/api/v1/search/manage/index
curl --fail-with-body --get http://localhost:3003/api/v1/search/ \
  --data-urlencode 'q=github' \
  --data-urlencode 'limit=5'
```

## Connect a Standard MCP Client

Choose a client with Streamable HTTP support and configure the selected server's Gateway URL.
For VS Code, add this to `.vscode/mcp.json`:

```json
{
  "servers": {
    "toolsdk-everything": {
      "type": "http",
      "url": "http://localhost:3003/mcp/@modelcontextprotocol/server-everything"
    }
  }
}
```

Start the server connection in the client, enable its tools, and ask it to call `echo` with a message.
The client handles initialization, protocol negotiation, and session headers. See the
[VS Code MCP configuration guide](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
for client-specific setup. Other clients may use different JSON configuration keys; the endpoint
and Streamable HTTP transport remain the same.

Use a URL reachable from the client. For a client running in another container or on another
machine, replace `localhost:3003` with the address of your Gateway deployment.

### Server Environment Variables

For local servers that need service credentials, configure custom HTTP headers in a client that
supports them. Prefix each environment variable with `x-mcp-env-`, for example:

```text
x-mcp-env-GITHUB_PERSONAL_ACCESS_TOKEN: <your-token>
```

Send these headers on the initialization request so credentials are available when the Gateway
discovers tools. The Gateway converts the suffix to uppercase and retains supplied values in the
session; later requests can update them. These headers populate the upstream process environment.
Use HTTPS for remote Gateway connections and your client's secret-input mechanism for tokens.

### Inspect the MCP Protocol with curl

This walkthrough uses Bash, curl, and Node.js to read the initialization JSON. It uses the same
example server and follows the MCP
[lifecycle](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle) and
[Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports).

**1. Initialize and capture the session.**

```bash
gateway_url='http://localhost:3003/mcp/@modelcontextprotocol/server-everything'
session_headers=$(mktemp)
init_response=$(mktemp)

curl --fail-with-body -D "$session_headers" -o "$init_response" "$gateway_url" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "toolsdk-curl", "version": "1.0.0" }
    }
  }'

cat "$init_response"
protocol_version=$(node -e 'const fs = require("node:fs"); const message = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (!message.result?.protocolVersion) process.exit(1); console.log(message.result.protocolVersion);' "$init_response")
session_id=$(awk 'tolower($1) == "mcp-session-id:" { gsub("\r", "", $2); print $2 }' "$session_headers")
rm -f "$session_headers" "$init_response"
test -n "$session_id" && test -n "$protocol_version" || { echo 'Initialization failed; inspect the response above'; exit 1; }
```

Inspect the initialization result before continuing. The walkthrough requests `2025-03-26` and
uses the returned `protocolVersion` in subsequent request headers.

**2. Send the initialized notification.**

```bash
curl --fail-with-body "$gateway_url" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $session_id" \
  -H "MCP-Protocol-Version: $protocol_version" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
```

An accepted notification returns HTTP 202 with no response body.

**3. List tools, then call `echo`.**

```bash
curl --fail-with-body "$gateway_url" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $session_id" \
  -H "MCP-Protocol-Version: $protocol_version" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl --fail-with-body "$gateway_url" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: $session_id" \
  -H "MCP-Protocol-Version: $protocol_version" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"echo","arguments":{"message":"Hello from ToolSDK!"}}}'
```

Reuse the session ID only with the same server endpoint. Gateway sessions are held in memory and
are cleaned up after a 30-minute lifetime; a restart also clears them. If a request returns a
session-not-found response, initialize a new session.

**4. Close the session when finished.**

```bash
curl --fail-with-body -X DELETE "$gateway_url" \
  -H "mcp-session-id: $session_id" \
  -H "MCP-Protocol-Version: $protocol_version"
```

## Next Steps

- [Contribution Guide](./CONTRIBUTING.md) - register a local package or hosted MCP endpoint.
- [Developer Guide](./DEVELOPMENT.md) - package management, local development, and provider configuration.
- [Catalog Publication](./CATALOG_PUBLICATION.md) - generate and publish registry data independently of runtime builds.

<div align="center">

<img src="assets/logo.png" width="120" alt="ToolSDK MCP Registry" />

# ToolSDK MCP Registry

**The Enterprise MCP Registry & Gateway.** A unified infrastructure to discover, secure, and execute Model Context Protocol (MCP) tools. Exposes local processes (STDIO) and remote servers (StreamableHTTP) via a unified HTTP API with built-in Sandbox and OAuth 2.1 support.

<a href="https://www.npmjs.com/package/@toolsdk.ai/registry">
  <img src="https://img.shields.io/npm/v/@toolsdk.ai/registry.svg?style=flat-square" alt="npm version" />
</a>
<a href="https://github.com/toolsdk-ai/toolsdk-mcp-registry/actions/workflows/test.yaml">
  <img src="https://github.com/toolsdk-ai/toolsdk-mcp-registry/actions/workflows/test.yaml/badge.svg" alt="Build Status" />
</a>
<img src="https://img.shields.io/badge/MCP_Servers-<%= COUNT %>-blue?style=flat-square" alt="MCP Servers Count" />
<img src="https://img.shields.io/badge/LICENSE-MIT-ff69b4?style=flat-square" alt="License" />
<br />
<a href="https://www.producthunt.com/products/toolsdk-ai">
  <img src="https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=997428&theme=light&period=daily" alt="Product Hunt" height="40" />
</a>

<a href="#mcp-servers">🔍 <b>Browse <%= COUNT %>+ Tools</b></a>
&nbsp;&nbsp;•&nbsp;&nbsp;
<a href="#quick-start">🐳 <b>Self-hosted</b></a>
&nbsp;&nbsp;•&nbsp;&nbsp;
<a href="#install-via-package-manager">📦 <b>Use as SDK</b></a>
&nbsp;&nbsp;•&nbsp;&nbsp;
<a href="#submit-new-mcp-servers">➕ <b>Add Server</b></a>
&nbsp;&nbsp;•&nbsp;&nbsp;
<a href="https://www.youtube.com/watch?v=J_oaDtCoVVo" target="_blank">🎥 <b>Video Tutorial</b></a>

<a href="https://toolsdk.ai" target="_blank">
  <img src="assets/hero.png" alt="ToolSDK.ai - MCP Servers Hosting" />
</a>

---

</div>

## Start Here

- 🔍 I want to **find an MCP Server** → [Browse Directory](#mcp-servers)
- 🔌 I want to **integrate MCP tools** into my AI app → [Integration Guide](https://toolsdk.ai/docs/tutorials/getting-started#-quick-start)
- 🚀 I want to **deploy an MCP Gateway** → [Deployment Guide](#deploy-enterprise-gateway-recommended)
- ➕ I want to **submit my MCP Server** → [Contribution Guide](#contribute-your-mcp-server)

> [!IMPORTANT]
> **Pro Tip**: If a server is marked as `validated: true`, you can use it instantly with **Vercel AI SDK**:
>
> ```ts
> const tool = await toolSDK.package('<packageName>', { ...env }).getAISDKTool('<toolKey>');
> ```
> **Want validation?** Ask AI: *"Analyze the `make build` target in the Makefile and the scripts it invokes, and determine how an MCP server gets marked as `validated: true`."*

## Getting Started

<a id="docker-self-hosting"></a>

### Deploy Enterprise Gateway (Recommended)

Deploy your own **private MCP Gateway & Registry** in minutes. This provides the full feature set: Federated Search, Remote Execution, Sandbox, and OAuth.

#### ⚡ Quick Deploy (One-Liner)

Start the registry immediately with default settings:

```bash
docker compose up -d
```

*Did this save you time? Give us a [**Star on GitHub**](https://github.com/toolsdk-ai/toolsdk-mcp-registry) — it helps others discover this registry!*

**Configuration:**
- Set `MCP_SANDBOX_PROVIDER=LOCAL` in `.env` file if you want to disable the sandbox (not recommended for production).
- *See [Configuration Guide](./docs/DEVELOPMENT.md) for full details.*

> [!TIP]
> **Tip for Private Deployment**: This registry contains <%= COUNT %>+ public MCP servers. If you only need a specific subset for your private environment, you can prune the `packages/` directory.
> 📖 See [Package Management Guide](./docs/DEVELOPMENT.md#5--package-management-for-private-deployment) for details.

That's it! Your self-hosted MCP registry is now running with:
- 🌐 **HTTP API** with OpenAPI documentation
- 🛡️ **Secure Sandbox execution** for AI agent tools
- 🔍 **Full-text search** (Meilisearch)

#### 🎉 Access Your Private MCP Registry

- 🌐 **Local Web Interface**: http://localhost:3003
- 📚 **Swagger API Docs**: http://localhost:3003/swagger  
- 🔍 **Search & Execute** <%= COUNT %>+ MCP Servers remotely
- 🤖 **Integrate** with your AI agents, chatbots, and LLM applications

#### 🌐 Remote Tool Execution Example

Execute any MCP tool via HTTP API - perfect for AI automation, chatbot integrations, and serverless deployments:

```bash
curl -X POST http://localhost:3003/api/v1/packages/run \
  -H "Content-Type: application/json" \
  -d '{
    "packageName": "@modelcontextprotocol/server-everything",
    "toolKey": "echo",
    "inputData": {
      "message": "Hello from ToolSDK MCP Registry!"
    },
    "envs": {}
  }'
```

#### 🔌 MCP Gateway (Streamable HTTP Proxy)

The registry also acts as an **MCP Gateway** — any registered package can be accessed as a standard [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) endpoint, even if the original server is STDIO-only.

**Endpoint:** `POST /mcp/<packageName>`

Pass environment variables via `x-mcp-env-*` headers:

```bash
curl -X POST http://localhost:3003/mcp/@modelcontextprotocol/server-github \
  -H "Content-Type: application/json" \
  -H "x-mcp-env-GITHUB_PERSONAL_ACCESS_TOKEN: ghp_your_token" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

The server returns a `mcp-session-id` header — include it in subsequent requests to reuse the session (sessions expire after 30 min).

This is useful for:
- **Protocol Bridging** — Expose local STDIO servers as remote HTTP endpoints
- **Centralized Access** — Give AI agents a single HTTP gateway to all MCP tools
- **Client Compatibility** — Connect from any MCP client that supports Streamable HTTP

<details>
<summary><strong>Alternative: Use as Registry SDK (Data Only)</strong></summary>

<a id="use-as-sdk"></a>

### Alternative: Use as Registry SDK (Data Only)

If you only need to access the **list of MCP servers** programmatically (without execution or gateway features), you can use the NPM package.

```bash
npm install @toolsdk.ai/registry
```

#### Usage

Perfect for building your own directory or analysis tools:

```ts
import mcpServerLists from '@toolsdk.ai/registry/indexes/packages-list.json';
```

#### Access via Public API (No Installation Required)

Fetch the complete MCP server registry programmatically:

```bash
curl https://toolsdk-ai.github.io/toolsdk-mcp-registry/indexes/packages-list.json
```

```ts
// JavaScript/TypeScript - Fetch API
const mcpServers = await (
  await fetch('https://toolsdk-ai.github.io/toolsdk-mcp-registry/indexes/packages-list.json')
).json();

// Use for AI agent tool discovery, LLM integrations, etc.
console.log(mcpServers);
```

```python
# Python - For AI/ML projects
import requests

mcp_servers = requests.get(
    'https://toolsdk-ai.github.io/toolsdk-mcp-registry/indexes/packages-list.json'
).json()

# Perfect for LangChain, CrewAI, AutoGen integrations
```

</details>

## Why ToolSDK MCP Registry?

**ToolSDK MCP Registry** is an enterprise-grade gateway for Model Context Protocol (MCP) servers. It solves the challenge of securely discovering and executing AI tools in production environments.

### Key Features

- **Federated Registry** - Unified search across local private servers and the official `@modelcontextprotocol/registry`.
- **Unified Interface** - Access local STDIO tools and remote StreamableHTTP servers via a single, standardized HTTP API.
- **Secure Sandbox** - Execute untrusted tools in isolated environments (supports E2B, Daytona, Sandock).
- **OAuth 2.1 Proxy** - Built-in OAuth 2.1 implementation to handle complex authentication flows for your agents. [Integration Guide](./docs/DEVELOPMENT.md#10--oauth-integration)
- **Private & Self-Hosted** - Full control over your data and infrastructure with Docker deployment.
- **Developer-Friendly** - OpenAPI/Swagger documentation and structured JSON configs.

### Use Cases

- **Enterprise AI Gateway** - Centralize tool access for all your internal LLM applications.
- **Secure Tool Execution** - Run community MCP servers without risking your local environment.
- **Protocol Adaptation** - Connect remote agents (via HTTP API) to local CLI tools (via STDIO).
- **Unified Discovery** - One API to search and manage thousands of tools.

### Architecture

```mermaid
graph TD
    subgraph ClientSide ["Client Side"]
        LLM["🤖 AI Agent / LLM"]
        User["👤 User / Developer"]
    end

    subgraph DockerEnv ["🐳 Self-Hosted Infrastructure"]
        
        subgraph RegistryCore ["Registry Core"]
            API["🌐 Registry API"]
            Search["🔍 Meilisearch"]
            DB["📚 Registry Data"]
            OAuth["🔐 OAuth Proxy"]
        end

        subgraph RuntimeEnv ["Runtime Environment"]
            Local["💻 Local Exec"]
            Sandbox["🛡️ Secure Sandbox"]
            MCPServer["⚙️ MCP Server"]
        end
    end

    User -->|Search Tools| API
    LLM -->|Execute Tool| API
    LLM -->|Auth Flow| OAuth
    API <-->|Query Index| Search
    API -->|Read Metadata| DB
    API -->|Run Tool| Local
    API -->|Run Tool| Sandbox
    Local -->|Execute| MCPServer
    Sandbox -->|Execute| MCPServer
```

---

## What You Get

This open-source project provides:

- **Structured Registry** - <%= COUNT %>+ MCP servers with metadata
- **Unified Gateway** - HTTP API to query and execute tools remotely
- **Auto-Generated Docs** - Always up-to-date README and API documentation

### ✅ Validated Packages = One-Line Integration (ToolSDK)

Some packages in this registry are marked as `validated: true`.

> [!NOTE]
> **What does `validated: true` mean for you?**
> - You can load the MCP package directly via our ToolSDK NPM client and get ready-to-use tool adapters (e.g. **Vercel AI SDK tools**) without writing your own tool schema mapping.
> - The registry index includes the discovered `tools` metadata for validated packages, so you can pick a `toolKey` and call it immediately.
>
> **Where is this flag stored?**
> - See `indexes/packages-list.json` entries (e.g. `{"validated": true, "tools": { ... } }`).

#### Example: Use a validated package with Vercel AI SDK

Template: `const tool = await toolSDK.package('<packageName>', { ...env }).getAISDKTool('<toolKey>');`

```ts
// import { generateText } from 'ai';
// import { openai } from '@ai-sdk/openai'
import { ToolSDKApiClient } from 'toolsdk/api';

const toolSDK = new ToolSDKApiClient({ apiKey: process.env.TOOLSDK_AI_API_KEY });
const searchMCP = await toolSDK.package('@toolsdk.ai/tavily-mcp', { TAVILY_API_KEY: process.env.TAVILY_API_KEY });
const searchTool = await searchMCP.getAISDKTool('tavily-search');

// const completion = await generateText({
//   model: openai('gpt-4.1'),
//   messages: [{
//       role: 'user',
//       content: 'Help me search for the latest AI news',
//   }],
//   tools: { searchTool, emailTool },
// });
```

**Available as:**

- **Docker Image** - Full-featured Gateway & Registry
- **NPM Package** - TypeScript/JavaScript SDK for data access
- **Raw Data** - JSON endpoints for direct integration

---

<a id="getting-started"></a>

<a id="submit-new-mcp-servers"></a>

## Contribute Your MCP Server

Want to add your MCP server to the registry? Check out our [Contributing Guide](./docs/CONTRIBUTING.md) for the full submission process, JSON schema reference, and examples (including remote servers and OAuth 2.1).

[![Watch the video](https://img.youtube.com/vi/J_oaDtCoVVo/hqdefault.jpg)](https://www.youtube.com/watch?v=J_oaDtCoVVo)

---

<a id="mcp-servers"></a>

## MCP Servers Directory

**<%= COUNT %>+ AI Agent Tools, LLM Integrations & Automation Servers**

> [!NOTE]
> ⭐ **Featured below**: Hand-picked, production-ready MCP servers verified by our team.
>
> 📚 **Looking for all <%= COUNT %>+ servers?** Check out [**All MCP Servers**](./docs/ALL-MCP-SERVERS.md) for the complete list.

> [!TIP]
> If a package is marked as `validated: true` in the index, you can usually wire it up in minutes via ToolSDK (e.g. `getAISDKTool(toolKey)`).

Browse by category: Developer Tools, AI Agents, Databases, Cloud Platforms, APIs, and more!

<%= CONTENT %>

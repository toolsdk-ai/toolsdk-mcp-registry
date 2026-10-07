# ToolSDK MCP Registry Developer Guide

This document provides developers with detailed information on how to set up, run, and develop the ToolSDK MCP Registry project.

For application and MCP client connections, start with the [Gateway Guide](./GATEWAY.md).
For server submissions, use the [Contribution Guide](./CONTRIBUTING.md). To update only the
directory, indexes, or README, follow [Catalog Publication](./CATALOG_PUBLICATION.md); runtime
development and catalog generation have separate commands.

- [ToolSDK MCP Registry Developer Guide](#toolsdk-mcp-registry-developer-guide)
  - [1. 🧰 Prerequisites](#1--prerequisites)
  - [2. 🧰 Tech Stack](#2--tech-stack)
  - [3. 🎯 Project Purpose](#3--project-purpose)
    - [Key Features:](#key-features)
  - [4. 🚀 Quick Start with Docker](#4--quick-start-with-docker)
    - [4.1 Quick Start (5 Minutes)](#41-quick-start-5-minutes)
    - [4.2 API Usage Examples](#42-api-usage-examples)
    - [4.3 Troubleshooting](#43-troubleshooting)
  - [5. 📦 Package Management for Private Deployment](#5--package-management-for-private-deployment)
    - [5.1 Understanding Package Structure](#51-understanding-package-structure)
    - [5.2 How to Remove Unwanted Packages](#52-how-to-remove-unwanted-packages)
    - [5.3 Rebuild Indexes](#53-rebuild-indexes)
    - [5.4 Benefits of Package Pruning](#54-benefits-of-package-pruning)
    - [5.5 Recommended Minimal Setup](#55-recommended-minimal-setup)
  - [6. 💻 Local Development Setup](#6--local-development-setup)
    - [6.1 Install Dependencies](#61-install-dependencies)
    - [6.2 Build Project](#62-build-project)
    - [6.3 Start Development Server (Without Search Function)](#63-start-development-server-without-search-function)
    - [6.4 Start Development Server (With Search Function)](#64-start-development-server-with-search-function)
  - [7. 🛠 Common Issues and Troubleshooting](#7--common-issues-and-troubleshooting)
    - [7.1 MCP Client Test Errors During Build Process](#71-mcp-client-test-errors-during-build-process)
  - [8. 🗃️ Project Structure](#8-️-project-structure)
    - [Architecture Highlights:](#architecture-highlights)
  - [9. ⚙️ Environment Variables](#9-️-environment-variables)
    - [Quick Configuration (Only 1 Variable Required)](#quick-configuration-only-1-variable-required)
    - [Optional Configuration](#optional-configuration)
    - [Advanced Configuration](#advanced-configuration)
      - [Sandbox Provider Options](#sandbox-provider-options)
    - [Configuration Files](#configuration-files)
  - [10. 🔐 OAuth Integration](#10--oauth-integration)
    - [10.1 Overview](#101-overview)
    - [10.2 Step 1: Initiate Authorization (Prepare)](#102-step-1-initiate-authorization-prepare)
    - [10.3 Step 2: Receive Credentials (Callback)](#103-step-2-receive-credentials-callback)
    - [10.4 Step 3: Execute Tools (Run)](#104-step-3-execute-tools-run)
    - [10.5 Step 4: Refresh Token](#105-step-4-refresh-token)

## 1. 🧰 Prerequisites

Before you begin, ensure your development environment meets the following requirements:

- **Docker** (recommended) - For quick start deployment
- **Node.js** >= 22.x - Required for catalog generation and local development
- **pnpm** >= 8.x (package manager) - Required for local development only
- **Bun** >= 1.x - Required for running build scripts

## 2. 🧰 Tech Stack

- **Runtime Environment**: Node.js (ESM modules)
- **Package Manager**: pnpm
- **Language**: TypeScript
- **Web Framework**: Hono.js + OpenAPI (Zod)
- **Architecture**: Domain-Driven Design (DDD) + Service Object Pattern
- **Search Service**: MeiliSearch (optional)
- **Sandbox Providers**: LOCAL / Sandock / Daytona / E2B
- **Build Tool**: TypeScript Compiler (tsc)
- **Code Formatting**: Biome
- **Testing**: Vitest

## 3. 🎯 Project Purpose

This project has two main purposes:

1. **MCP Registry** - Collects and indexes various MCP servers, providing search functionality
2. **MCP Gateway** - Exposes registered tools through an HTTP API and per-server Streamable HTTP endpoints

### Key Features:

- 📦 **Package Management** - Thousands of MCP servers with metadata and validation; see the [complete catalog](./ALL-MCP-SERVERS.md)
- 🔍 **Search Service** - Full-text search powered by MeiliSearch (optional)
- 🛡️ **Sandbox Execution** - Secure MCP tool execution in isolated environments:
  - **LOCAL** - Direct local execution (default)
  - **Sandock** - Lightweight Docker sandbox for AI agents
  - **Daytona** - Cloud development environments
  - **E2B** - Code interpreter sandbox
- 🌐 **RESTful API** - Complete API with OpenAPI/Swagger documentation
- ⚡ **Performance** - Async execution with connection pooling

Additionally, we have deployed a website [ToolSDK.ai](https://toolsdk.ai) that can search for and run MCP Servers. We also provide a tool called `toolsdk` to help integrate these MCP Servers.

## 4. 🚀 Quick Start with Docker

Docker Compose deploys the MCP Registry, Gateway, and Meilisearch. HTTP API calls use local
execution by default; select a configured sandbox provider for isolated API execution.

### 4.1 Quick Start (5 Minutes)

**Step 1: Clone the Repository**

```bash
git clone https://github.com/toolsdk-ai/toolsdk-mcp-registry.git
cd toolsdk-mcp-registry
```

**Step 2: Configure Sandock (Optional)**

For isolated API execution, visit [Sandock website](https://sandock.ai) to obtain an API key.

**Step 3: Configure Environment Variables**

Create a `.env` file with your Sandock key if you will use that provider:

```env
SANDOCK_API_KEY=your-sandock-api-key-here  # Replace with your actual API Key
```

Select `"sandboxProvider": "SANDOCK"` in API execution requests. The default Compose configuration
passes the key into the container. The [Gateway Guide](./GATEWAY.md) includes both API and MCP examples.

**Step 4: Start Services**

```bash
docker compose up -d
# Or use the shortcut:
make up
```

> **Deployment tip:** Docker builds the application with its configured Node and Python dependencies.
> For a focused private deployment, choose the packages you need using
> [Section 5: Package Management for Private Deployment](#5--package-management-for-private-deployment).
>
> **Common Docker commands:**
> - `make up` or `docker compose up -d` - Start all services
> - `make down` or `docker compose down` - Stop all services
> - `make restart` or `docker compose restart` - Restart all services

This will start two services:
- `toolsdk-mcp-registry` - MCP Registry and Gateway application (port 3003)
- `meilisearch` - Search engine service (port 7700)

**Step 5: Initialize Search Index (Optional)**

Wait for services to start (about 30-60 seconds), then initialize the search index:

```bash
# Initialize search service
curl -X POST http://localhost:3003/api/v1/search/manage/init

# Index MCP data
curl -X POST http://localhost:3003/api/v1/search/manage/index
```

**Step 6: Access Services**

- 🌐 Homepage: http://localhost:3003
- 📚 API Documentation: http://localhost:3003/swagger
- 🔍 Search Engine Management: http://localhost:7700

### 4.2 API Usage Examples

**List all MCP Servers:**

```bash
curl http://localhost:3003/api/v1/indexes/packages-list
```

**Search MCP Servers:**

```bash
curl "http://localhost:3003/api/v1/search/?q=github&limit=5"
```

**Execute MCP Tool (using SANDOCK remote execution):**

```bash
curl -X POST http://localhost:3003/api/v1/packages/run \
  -H "Content-Type: application/json" \
  -d '{
    "packageName": "@modelcontextprotocol/server-everything",
    "toolKey": "echo",
    "inputData": {
      "message": "Hello from ToolSDK!"
    },
    "envs": {},
    "sandboxProvider": "SANDOCK"
  }'
```

### 4.3 Troubleshooting

**Issue 1: Port Already in Use**

```bash
# Check port usage
lsof -i :3003
lsof -i :7700

# Modify port in .env file
MCP_SERVER_PORT=3004
```

**Issue 2: SANDOCK_API_KEY Not Configured**

Error message:
```
Error: SANDOCK_API_KEY is required when using SANDOCK provider
```

Solution:
- Check if `.env` file exists
- Confirm `SANDOCK_API_KEY` is correctly filled in
- Restart services: `docker compose restart`

**Issue 3: Search Function Unavailable**

```bash
# Check if MeiliSearch is running
docker compose ps meilisearch

# Reinitialize indexes
curl -X POST http://localhost:3003/api/v1/search/manage/init
curl -X POST http://localhost:3003/api/v1/search/manage/index
```

**Issue 4: Long Build Time**

First build may take 10-15 minutes, which is normal. The Dockerfile needs to:
- Install Python 3.13 and pyenv
- Install Node.js dependencies (large number of packages)
- Install Python dependencies
- Build TypeScript code

Subsequent builds will be much faster using Docker cache.

## 5. 📦 Package Management for Private Deployment

Choose a focused set of MCP servers for your private deployment. Catalog generation updates the
directory and metadata; managing runtime dependencies is a separate deployment step.

### 5.1 Understanding Package Structure

All MCP packages are stored in the `packages/` directory, organized by category:

```
packages/
├── developer-tools/      # Development related tools
├── databases/            # Database integrations
├── cloud-platforms/      # Cloud service integrations
├── version-control/      # Git, GitHub, etc.
├── communication/        # Slack, Discord, etc.
└── ...                   # 30+ other categories
```

Each package is defined by a JSON configuration file.

### 5.2 How to Remove Unwanted Packages

**Option 1: Remove Specific Packages**

To remove individual packages within a category, simply delete their JSON configuration files:

1. Navigate to the category folder (e.g., `packages/version-control/`)
2. Delete the `.json` files for packages you don't need
3. Run `make catalog` to update the directory (see Section 5.3).

Example: Keep only GitHub-related packages in version-control by removing other `.json` files like `gitlab.json`, `bitbucket.json`, etc.

**Option 2: Remove Entire Categories**

To remove entire categories (e.g., gaming, sports), edit the `config/categories.mjs` file:

1. Open `config/categories.mjs`
2. Remove the category objects you don't need. For example, to remove gaming and sports:

```javascript
// Remove these entries from the array:
{
  key: "gaming",
  name: "Gaming",
  description: "Connect with gaming data, engines, and related services.",
},
{
  key: "sports",
  name: "Sports",
  description: "Access sports data, results, and stats with ease.",
}
```

3. Run `make catalog` to omit those categories from the generated directory. This does not delete
   package files or modify dependency manifests.

**Option 3: Keep Only What You Need (Minimal Setup)**

For a minimal deployment with only essential categories:

1. Open `config/categories.mjs`
2. Remove all category entries except the ones you need (e.g., `developer-tools`, `databases`, `cloud-platforms`, `version-control`, `communication`, `file-systems`)
3. Run `make catalog` to generate your selected catalog.

This approach is recommended as it ensures consistency between your configuration and the actual packages.

### 5.3 Rebuild Indexes

After selecting your packages or categories, regenerate the complete directory in one batch with
Node.js 22 or later:

```bash
make catalog
```

Without `make`, including on Windows, run the equivalent command:

```bash
node scripts/generate-catalog.mjs
```

This reads and validates package JSON, preserves existing validation and tool metadata, and
generates `indexes/`, `README.md`, `docs/ALL-MCP-SERVERS.md`, and `catalog-site/`. It does not
install or execute MCP servers, modify dependencies, or rerun runtime validation.

For public publication, maintainers manually run **Publish Registry Catalog** on `main`; see
[Catalog Publication](./CATALOG_PUBLICATION.md). For a private runtime deployment, also align
`package.json` and the Python dependency configuration with your selected servers before building
the image. Regenerating a catalog alone does not prune installed dependencies.

### 5.4 Benefits of Package Pruning

By keeping only the packages you need, you'll get:

- ✅ **Faster Build Time** - From 10-15 minutes to 2-3 minutes
- ✅ **Smaller Dependencies** - From thousands to dozens of packages
- ✅ **Smaller Docker Image** - Reduced image size by 50-80%
- ✅ **Faster Deployment** - Less data to transfer and install
- ✅ **Easier Maintenance** - Focus only on packages you actually use

### 5.5 Recommended Minimal Setup

For a typical private deployment, we recommend keeping only the most commonly used categories. 

Edit `config/categories.mjs` and keep only these essential categories:

- `developer-tools` - Development workflow tools
- `databases` - Database integrations
- `cloud-platforms` - Cloud service integrations
- `version-control` - Git, GitHub, etc.
- `communication` - Slack, Discord, etc.
- `file-systems` - File management tools

To do this, edit `config/categories.mjs` and run `make catalog`. Review the generated catalog to
confirm your selection, then align runtime dependencies as described in Section 5.3.

## 6. 💻 Local Development Setup

This section is for developers who want to contribute to the project or need faster development iteration.

**When to use local development:**
- Contributing code to the project
- Debugging and testing changes with fast reload
- Developing new features

**Quick command reference:**
- `make catalog` - Generate directory data and documentation without installing or running MCP servers
- `make build` - Install dependencies, run MCP validation, regenerate outputs, and build the application
- `make search` - Start MeiliSearch container (for search functionality)
- `make dev` - Start the development server with hot reload

### 6.1 Install Dependencies

```bash
pnpm install
```

### 6.2 Build Project

```bash
make build
```

This will perform the following operations:
- Validate all MCP server configurations
- Install all necessary dependencies
- Run MCP servers to discover tools and record runtime validation
- Build TypeScript code

For directory or README changes only, use `make catalog` instead. The full runtime build still uses
the legacy indexing scripts; use the catalog generator as the final step when preparing published
catalog outputs.

### 6.3 Start Development Server (Without Search Function)

This is the simplest way to start, suitable for scenarios where only API functionality is needed:

1. Ensure `ENABLE_SEARCH=false` is set in the `.env` file:

```env
ENABLE_SEARCH=false
MCP_SERVER_PORT=3003
```

2. Start the development server:

```bash
make dev
```

3. Access the following endpoints:
   - API Documentation: http://localhost:3003/swagger

### 6.4 Start Development Server (With Search Function)

If you need full search functionality:

1. Set up the `.env` file:

```env
ENABLE_SEARCH=true
MCP_SERVER_PORT=3003
MEILI_HTTP_ADDR=http://localhost:7700
```

2. Start the MeiliSearch service (only the search container):

```bash
make search
```

This command starts only the MeiliSearch container for local development. The main application will be run separately with `make dev`.

3. Build the project and start the development server:

```bash
make build
make dev
```

4. Initialize search indexes:

Call the following endpoints via API:
- `POST /api/v1/search/manage/init` - Initialize search service
- `POST /api/v1/search/manage/index` - Index data

5. Access:
   - Search Page: http://localhost:3003
   - API Documentation: http://localhost:3003/swagger

## 7. 🛠 Common Issues and Troubleshooting

### 7.1 MCP Client Test Errors During Build Process

When executing the `make build` command, you may see error messages similar to the following:

```
Error reading MCP Client for package: claude-prompts... ENOENT: no such file or directory
```

**This is normal!** The reason for these errors is:

- This project includes thousands of MCP packages
- The build process attempts to test all packages through the [test-mcp-clients.ts](../scripts/test-mcp-clients.ts) script
- Due to the large number, the testing process may take several hours
- Not all packages need to be installed and tested, as most packages are not essential for running the registry

**These errors can be ignored as long as the build process continues to execute.** After the build is complete, you can still use the API and search functionality (if search is enabled) normally.

## 8. 🗃️ Project Structure

This project follows **Domain-Driven Design (DDD)** architecture with **Service Object** pattern:

```
.
├── config/           # Configuration files
├── indexes/          # Generated index files
├── packages/         # MCP server configuration files (categorized by domain)
├── scripts/          # Build and maintenance scripts
├── docker/           # Docker related files
│   ├── sandock-mcp.Dockerfile  # Sandock custom image
│   ├── build-and-push.sh       # Image build script
│   └── QUICKSTART.md           # Docker quick start guide
├── docs/             # Documentation
│   └── SANDOCK_BEST_PRACTICES.md  # Sandock usage guide
└── src/              # Source code (Domain-Driven Design)
    ├── api/          # API entry point
    │   └── index.ts  # Server initialization and route registration
    ├── domains/      # Business domains (core logic)
    │   ├── config/   # Configuration management
    │   ├── executor/    # Tool execution (local-executor, sandbox-executor)
    │   ├── mcp-gateway/ # MCP Gateway — proxies packages as Streamable HTTP endpoints
    │   ├── package/     # Package management (SO, handler, routes)
    │   ├── sandbox/     # Sandbox management (pooling, providers)
    │   └── search/   # Search service integration
    └── shared/       # Shared infrastructure
        ├── config/   # Environment configuration (environment.ts)
        ├── schemas/  # Common Zod schemas
        ├── types/    # Shared TypeScript types
        └── utils/    # Utility functions
```

### Architecture Highlights:

- **Service Object (SO) Pattern**: Business logic encapsulated in reusable Service Objects
- **Handler Layer**: Thin HTTP request/response handlers
- **Repository Pattern**: Data access abstraction
- **Factory Pattern**: Dynamic object creation (Executor, Sandbox providers)
- **Dependency Injection**: Loose coupling through constructor injection

<a id="environment-variables"></a>

## 9. ⚙️ Environment Variables

### Quick Configuration (Only 1 Variable Required)

For Sandock API execution in Docker, configure **`SANDOCK_API_KEY`** and select the provider in
your API request:

```env
# 🔑 Required: Get it from https://sandock.ai
SANDOCK_API_KEY=your-sandock-api-key-here
```

The default provider is `LOCAL`. Select `SANDOCK` with the API's `sandboxProvider` field for
isolated execution. For local development, `MCP_SANDBOX_PROVIDER` sets the default provider.

### Optional Configuration

If you need to customize, you can configure the following variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_SEARCH` | Enable search functionality | `true` |
| `MCP_SERVER_PORT` | Service port | `3003` |

### Advanced Configuration

<details>
<summary>Click to expand complete environment variable list (usually no need to modify)</summary>

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_SANDBOX_PROVIDER` | Default API sandbox provider | `LOCAL` |
| `SANDOCK_API_URL` | Sandock service URL | `https://sandock.ai` |
| `MEILI_HTTP_ADDR` | MeiliSearch address | `http://meilisearch:7700` |
| `MEILI_MASTER_KEY` | MeiliSearch master key | - |
| `DAYTONA_API_KEY` | Daytona API Key (required when switching Provider) | - |
| `DAYTONA_API_URL` | Daytona service URL | - |
| `E2B_API_KEY` | E2B API Key (required when switching Provider) | - |

#### Sandbox Provider Options

- **SANDOCK** ⭐ - Recommended for isolated API execution, lightweight Docker sandbox designed for AI Agents
- **LOCAL** - Direct local execution, no isolation (for development and testing)
- **DAYTONA** - Cloud development environment (team collaboration)
- **E2B** - Code interpreter sandbox (specific scenarios)

</details>

### Configuration Files

- `.env` - Main configuration file; create it with the variables you need
- `.env.local` - Local override configuration (not committed to Git)

All environment variables are managed centrally through `src/shared/config/environment.ts`.
For Docker Compose, `.env` supplies Compose substitutions; additional container variables must be
listed in the service's `environment` configuration. The default Compose file passes the Sandock
key and search settings.

## 10. 🔐 OAuth Integration

This section explains how to integrate OAuth authentication for MCP servers that require user authorization (e.g., GitHub, Slack, etc.).

### 10.1 Overview

The Registry encapsulates OAuth protocol complexity (Discovery/DCR/PKCE). Third-party platforms only need to implement the following standard flow to replace the demo implementation:

**Flow Summary:**
1. **Prepare** - Initiate authorization and get auth URL
2. **Callback** - Receive tokens after user authorization
3. **Run** - Execute tools with access token
4. **Refresh** - Refresh expired tokens

### 10.2 Step 1: Initiate Authorization (Prepare)

**Endpoint:** `POST {REGISTRY_URL}/api/v1/oauth/prepare`

**Request:**
```json
{
  "packageName": "github-mcp",
  "callbackBaseUrl": "https://api.your-platform.com/internal/mcp-oauth/complete"
}
```

**Response:**
```json
{
  "authUrl": "https://github.com/login/oauth/authorize?...",
  "sessionId": "session-uuid-here"
}
```

**Implementation:**
- Retrieve `authUrl` and `sessionId` from the response
- Frontend redirects user via `window.open(authUrl)` to initiate third-party login

### 10.3 Step 2: Receive Credentials (Callback)

**Mechanism:** After user authorization, Registry will automatically **POST** data to the `callbackBaseUrl` provided in Step 1.

**Received Data:**
```json
{
  "sessionId": "session-uuid-here",
  "tokens": {
    "access_token": "gho_xxxx",
    "refresh_token": "ghr_xxxx",
    "expires_in": 28800
  },
  "clientInfo": {
    "client_id": "Iv1.xxxx"
  }
}
```

**Implementation:**
- Your backend must implement this callback endpoint
- Receive and persist the tokens, associating them with the current user
- **Important:** Registry does NOT store tokens - your platform is responsible for token storage

### 10.4 Step 3: Execute Tools (Run)

**Endpoint:** `POST {REGISTRY_URL}/api/v1/packages/run`

**Request:**
```json
{
  "packageName": "github-mcp",
  "toolKey": "list_repositories",
  "inputData": {
    "owner": "toolsdk-ai"
  },
  "accessToken": "gho_xxxx"
}
```

**Implementation:**
- Add `accessToken` field to the existing request body
- Registry automatically injects the token into MCP Server request headers

### 10.5 Step 4: Refresh Token

**Endpoint:** `POST {REGISTRY_URL}/api/v1/oauth/refresh`

**Request:**
```json
{
  "packageName": "github-mcp",
  "refreshToken": "ghr_xxxx",
  "clientId": "Iv1.xxxx"
}
```

**Response:**
```json
{
  "access_token": "gho_new_xxxx",
  "refresh_token": "ghr_new_xxxx",
  "expires_in": 28800
}
```

**Implementation:**
- When tokens expire, use stored `refreshToken` and `clientId` to obtain new tokens
- Update stored tokens with the new values

---

**Happy coding! 🚀**

For questions or issues, please [open an issue](https://github.com/toolsdk-ai/toolsdk-mcp-registry/issues) or join our community discussions.

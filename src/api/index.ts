import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { configRoutes } from "../domains/config/config-route";
import { createMcpGatewayHandler } from "../domains/mcp-gateway/mcp-gateway";
import { oauthDemoRoutes, oauthRoutes } from "../domains/oauth/oauth-route";
import { repository } from "../domains/package/package-handler";
import { packageRoutes } from "../domains/package/package-route";
import { initRegistryFactory } from "../domains/registry/registry-factory";
import { searchRoutes } from "../domains/search/search-route";
import { SearchSO } from "../domains/search/search-so";
import { getServerPort, isSearchEnabled } from "../shared/config/environment";
import { getDirname } from "../shared/utils";

// Initialize Registry Factory with the local repository
initRegistryFactory(repository);

const initializeSearchService = async () => {
  try {
    await SearchSO.getInstance();
    console.log("🔍 Search service initialized");
  } catch (error) {
    console.warn("⚠️  Search service initialization failed:", (error as Error).message);
    console.log("💡 Install and start MeiliSearch to enable enhanced search features");
  }
};

// Load search.html content
const __dirname = getDirname(import.meta.url);
const searchHtmlPath = join(__dirname, "../domains/search/search.html");
const searchHtmlContent = readFileSync(searchHtmlPath, "utf-8");

const app = new OpenAPIHono();

// Domain routes
app.route("/api/v1", packageRoutes);
app.route("/api/v1/config", configRoutes);
app.route("/api/v1/oauth", oauthRoutes);

// Demo routes (serves demo-oauth.html and handles callbacks)
app.route("/demo", oauthDemoRoutes);

if (isSearchEnabled()) {
  initializeSearchService().catch(console.error);
  app.route("/api/v1/search", searchRoutes);
}

app.get("/", (c: Context) => {
  return c.html(searchHtmlContent);
});

app.get("/api/meta", async (c: Context) => {
  try {
    const packageJson = await import("../../package.json", {
      assert: { type: "json" },
    });
    return c.json({ version: packageJson.default.version });
  } catch (error) {
    console.error("Failed to load package.json:", error);
    return c.json({ version: "unknown" });
  }
});

// OpenAPI documentation
app.doc("/api/v1/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "MCP Registry API",
  },
});

// Swagger UI
app.get("/swagger", swaggerUI({ url: "/api/v1/doc" }));

app.notFound((c: Context) => {
  return c.json({ success: false, code: 404, message: "[Registry API] Route not found" }, 404);
});

app.onError((err: Error, c: Context) => {
  console.error("Server Error:", err);
  return c.json(
    {
      success: false,
      code: 500,
      message: `[Registry API] Internal server error, errMsg: ${err.message}`,
    },
    500,
  );
});

const port = getServerPort();

// MCP Gateway handler — intercepts /mcp/:packageName before Hono
const mcpGatewayHandler = createMcpGatewayHandler(repository);
const MCP_PATH_PREFIX = "/mcp/";

// Create a raw Node.js HTTP server so we can route /mcp/* to the
// Streamable HTTP transport (which needs raw IncomingMessage/ServerResponse)
// and everything else to Hono.
const honoListener = getRequestListener(app.fetch);

const server = createServer(async (req, res) => {
  const url = req.url ?? "";

  if (url.startsWith(MCP_PATH_PREFIX)) {
    // Extract package name: /mcp/@scope/name or /mcp/name
    // Handle scoped packages: /mcp/@scope/name → @scope/name
    const pathAfterPrefix = url.slice(MCP_PATH_PREFIX.length);
    // Remove query string if any
    const packageName = decodeURIComponent(pathAfterPrefix.split("?")[0]);

    if (!packageName) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing package name in URL" }));
      return;
    }

    try {
      await mcpGatewayHandler(req, res, packageName);
    } catch (error) {
      console.error("[MCP Gateway] Unhandled error:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    return;
  }

  // All other routes → Hono
  honoListener(req, res);
});

server.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
  console.log(`🔌 MCP Gateway available at http://localhost:${port}/mcp/<packageName>`);
});

export default app;

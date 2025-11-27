/**
 * OAuth Routes
 *
 * API endpoints for MCP OAuth flow:
 * - POST /api/v1/oauth/prepare - Start OAuth flow
 * - GET  /api/v1/oauth/callback - OAuth callback handler
 * - POST /api/v1/oauth/refresh - Refresh access token
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { createRouteResponses } from "../../shared/utils/response-util";
import { oauthHandler } from "./oauth-handler";
import {
  OAuthPrepareRequestSchema,
  OAuthPrepareResponseSchema,
  OAuthRefreshRequestSchema,
  OAuthRefreshResponseSchema,
} from "./oauth-schema";

export const oauthRoutes = new OpenAPIHono();

// ============ POST /prepare ============

const prepareRoute = createRoute({
  method: "post",
  path: "/prepare",
  tags: ["OAuth"],
  summary: "Prepare OAuth flow",
  description: `
Start the OAuth authorization flow for an MCP package.

This endpoint:
1. Discovers the MCP server's OAuth configuration
2. Registers a client with the authorization server (if DCR supported)
3. Generates PKCE parameters (required by MCP spec)
4. Returns an authorization URL for the user to complete authorization

After the user authorizes, the Registry will:
1. Exchange the authorization code for tokens
2. POST the tokens and client info to your callbackBaseUrl
3. Return an HTML page that closes the popup window
  `,
  request: {
    body: {
      content: {
        "application/json": {
          schema: OAuthPrepareRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: createRouteResponses(OAuthPrepareResponseSchema, {
    includeErrorResponses: true,
  }),
});

oauthRoutes.openapi(prepareRoute, async (c) => {
  const body = c.req.valid("json");
  const result = await oauthHandler.prepareOAuth(body);
  return c.json(result, result.success ? 200 : (result.code as 200 | 400 | 500));
});

// ============ GET /callback ============
// Using standard Hono route for HTML response (not OpenAPI)

oauthRoutes.get("/callback", async (c: Context) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");
  const error_description = c.req.query("error_description");

  const result = await oauthHandler.handleCallback({
    code,
    state,
    error,
    error_description,
  });
  return c.html(result.html);
});

// ============ POST /refresh ============

const refreshRoute = createRoute({
  method: "post",
  path: "/refresh",
  tags: ["OAuth"],
  summary: "Refresh access token",
  description: `
Refresh an OAuth access token using a refresh token.

This endpoint discovers the authorization server and exchanges
the refresh token for a new access token.
  `,
  request: {
    body: {
      content: {
        "application/json": {
          schema: OAuthRefreshRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: createRouteResponses(OAuthRefreshResponseSchema, {
    includeErrorResponses: true,
  }),
});

oauthRoutes.openapi(refreshRoute, async (c) => {
  const body = c.req.valid("json");
  const result = await oauthHandler.handleRefresh(body);
  return c.json(result, result.success ? 200 : (result.code as 200 | 400 | 500));
});

// ============ Demo Page Route ============

export const oauthDemoRoutes = new OpenAPIHono();

oauthDemoRoutes.get("/oauth", async (c: Context) => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { getDirname } = await import("../../shared/utils/file-util");

  const __dirname = getDirname(import.meta.url);
  const htmlPath = join(__dirname, "demo-oauth.html");

  try {
    const htmlContent = readFileSync(htmlPath, "utf-8");
    return c.html(htmlContent);
  } catch (_error) {
    return c.text("Demo page not found", 404);
  }
});

// Demo callback endpoint (acts as a mock client)
oauthDemoRoutes.post("/oauth/callback", async (c: Context) => {
  const body = await c.req.json();
  console.log("[OAuthDemo] Received callback data:", JSON.stringify(body, null, 2));

  // Store in a simple in-memory map for demo purposes
  const sessionId = body.sessionId;
  if (sessionId) {
    demoCallbackStore.set(sessionId, body);
    // Auto-cleanup after 5 minutes
    setTimeout(() => demoCallbackStore.delete(sessionId), 5 * 60 * 1000);
  }

  return c.json({ success: true, message: "Callback received" });
});

// Endpoint to retrieve callback data (for polling in demo)
oauthDemoRoutes.get("/oauth/callback/:sessionId", async (c: Context) => {
  const sessionId = c.req.param("sessionId");
  const data = demoCallbackStore.get(sessionId);

  if (data) {
    return c.json({ success: true, data });
  }
  return c.json({ success: false, message: "No data found" }, 404);
});

// Simple in-memory store for demo
const demoCallbackStore = new Map<string, unknown>();

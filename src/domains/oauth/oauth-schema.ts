/**
 * OAuth Schema Definitions
 *
 * Zod schemas for OAuth API request/response validation
 */

import { z } from "@hono/zod-openapi";
import { BaseResponseSchema } from "../../shared/schemas/common-schema";

// ============ Request Schemas ============

export const OAuthPrepareRequestSchema = z
  .object({
    packageName: z.string().min(1).openapi({
      example: "github-mcp",
      description:
        "MCP package name (used as identifier, can be any string if mcpServerUrl is provided)",
    }),
    callbackBaseUrl: z.string().url().openapi({
      example: "https://toolsdk.ai/api/internal/mcp-oauth/complete",
      description: "URL where Registry will POST the OAuth result (tokens + clientInfo)",
    }),
    mcpServerUrl: z.string().url().optional().openapi({
      example: "http://localhost:3001/mcp",
      description:
        "Optional: MCP Server URL. If provided, this URL will be used instead of looking up from package config.",
    }),
  })
  .openapi("OAuthPrepareRequest");

export const OAuthRefreshRequestSchema = z
  .object({
    mcpServerUrl: z.string().url().openapi({
      example: "http://localhost:3001/mcp",
      description: "MCP Server URL",
    }),
    refreshToken: z.string().min(1).openapi({
      description: "Refresh token from previous authorization",
    }),
    clientId: z.string().min(1).openapi({
      description: "OAuth client ID",
    }),
    clientSecret: z.string().optional().openapi({
      description: "OAuth client secret (if applicable)",
    }),
  })
  .openapi("OAuthRefreshRequest");

// ============ Response Schemas ============

export const OAuthPrepareDataSchema = z
  .object({
    authUrl: z.string().url().openapi({
      description: "Authorization URL to open in browser/popup",
    }),
    sessionId: z.string().openapi({
      description: "Session ID for tracking this OAuth flow",
    }),
    mcpServerUrl: z.string().url().openapi({
      description: "MCP Server URL",
    }),
  })
  .openapi("OAuthPrepareData");

export const OAuthPrepareResponseSchema = BaseResponseSchema.extend({
  data: OAuthPrepareDataSchema.optional(),
}).openapi("OAuthPrepareResponse");

export const TokenResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
  })
  .openapi("TokenResponse");

export const OAuthRefreshResponseSchema = BaseResponseSchema.extend({
  data: TokenResponseSchema.optional(),
}).openapi("OAuthRefreshResponse");

// ============ Callback Data Schema ============

export const ClientInfoSchema = z
  .object({
    client_id: z.string(),
    client_secret: z.string().optional(),
    client_secret_expires_at: z.number().optional(),
    client_id_issued_at: z.number().optional(),
  })
  .openapi("ClientInfo");

export const OAuthCallbackDataSchema = z
  .object({
    sessionId: z.string(),
    tokens: TokenResponseSchema,
    clientInfo: ClientInfoSchema,
    mcpServerUrl: z.string().url(),
    packageName: z.string(),
  })
  .openapi("OAuthCallbackData");

// ============ Query Schemas ============

export const OAuthCallbackQuerySchema = z.object({
  code: z
    .string()
    .optional()
    .openapi({
      param: { name: "code", in: "query" },
      description: "Authorization code from OAuth server",
    }),
  state: z
    .string()
    .optional()
    .openapi({
      param: { name: "state", in: "query" },
      description: "State parameter for CSRF protection",
    }),
  error: z
    .string()
    .optional()
    .openapi({
      param: { name: "error", in: "query" },
      description: "OAuth error code",
    }),
  error_description: z
    .string()
    .optional()
    .openapi({
      param: { name: "error_description", in: "query" },
      description: "OAuth error description",
    }),
});

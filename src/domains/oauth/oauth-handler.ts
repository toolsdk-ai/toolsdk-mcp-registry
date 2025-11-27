/**
 * OAuth Handler
 *
 * Business logic for OAuth flow:
 * 1. Prepare: Discovery + Registration + Build Auth URL
 * 2. Callback: Exchange code for tokens + Notify caller
 * 3. Refresh: Refresh access token
 */

import { getServerPort } from "../../shared/config/environment";
import { createErrorResponse, createResponse } from "../../shared/utils/response-util";
import { repository } from "../package/package-handler";
import { oauthSessionStore } from "./oauth-session";
import type {
  ClientInfo,
  OAuthCallbackData,
  OAuthPrepareRequest,
  OAuthPrepareResponse,
  OAuthRefreshRequest,
  OAuthSession,
  TokenResponse,
} from "./oauth-types";
import {
  buildAuthorizationUrl,
  discoverAuthServerMetadata,
  discoverProtectedResourceMetadata,
  exchangeCodeForTokens,
  generatePKCE,
  generateSessionId,
  generateState,
  getCanonicalResourceUri,
  refreshAccessToken,
  registerClient,
  verifyPKCESupport,
} from "./oauth-utils";

/**
 * Get the Registry's OAuth callback URL
 */
function getRegistryCallbackUrl(): string {
  const port = getServerPort();
  const host = process.env.REGISTRY_HOST || `localhost:${port}`;
  const protocol = process.env.REGISTRY_PROTOCOL || "http";
  return `${protocol}://${host}/api/v1/oauth/callback`;
}

/**
 * Get MCP Server URL from package configuration
 * Returns the first streamable-http remote URL if available
 */
function getMcpServerUrl(packageName: string): string | null {
  try {
    const config = repository.getPackageConfig(packageName);
    if (config.remotes && config.remotes.length > 0) {
      const httpRemote = config.remotes.find((r) => r.type === "streamable-http");
      if (httpRemote) {
        return httpRemote.url;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Prepare OAuth flow
 *
 * 1. Get MCP Server URL from package config
 * 2. Discover Protected Resource Metadata
 * 3. Discover Authorization Server Metadata
 * 4. Verify PKCE support
 * 5. Register client (Dynamic Client Registration)
 * 6. Generate PKCE + state + session
 * 7. Build authorization URL
 */
export async function prepareOAuth(request: OAuthPrepareRequest) {
  const { packageName, callbackBaseUrl, mcpServerUrl: directMcpServerUrl } = request;

  // 1. Get MCP Server URL - prefer directly provided URL over package config
  const mcpServerUrl = directMcpServerUrl || getMcpServerUrl(packageName);
  if (!mcpServerUrl) {
    return createErrorResponse(
      `Package '${packageName}' does not support OAuth (no streamable-http remote configured). ` +
        "You can provide mcpServerUrl directly in the request.",
      400,
    );
  }

  try {
    // 2. Discover Protected Resource Metadata
    console.log(`[OAuth] Discovering protected resource metadata for ${mcpServerUrl}`);
    const resourceMetadata = await discoverProtectedResourceMetadata(mcpServerUrl);

    if (
      !resourceMetadata.authorization_servers ||
      resourceMetadata.authorization_servers.length === 0
    ) {
      return createErrorResponse("No authorization servers found in resource metadata", 400);
    }

    const authServerUrl = resourceMetadata.authorization_servers[0];

    // 3. Discover Authorization Server Metadata
    console.log(`[OAuth] Discovering auth server metadata from ${authServerUrl}`);
    const oauthMetadata = await discoverAuthServerMetadata(authServerUrl);

    // 4. Verify PKCE support (MCP spec requirement)
    const pkceStatus = verifyPKCESupport(oauthMetadata);
    if (!pkceStatus.supported) {
      return createErrorResponse(
        "Authorization server explicitly does not support PKCE with S256 method (required by MCP spec)",
        400,
      );
    }
    if (!pkceStatus.advertised) {
      console.log(
        `[OAuth] Warning: Authorization server does not advertise code_challenge_methods_supported, ` +
          `proceeding with PKCE anyway (many servers support it without advertising)`,
      );
    }

    // 5. Register client
    let clientInfo: ClientInfo;
    const redirectUri = getRegistryCallbackUrl();

    if (oauthMetadata.registration_endpoint) {
      console.log(`[OAuth] Registering client at ${oauthMetadata.registration_endpoint}`);
      clientInfo = await registerClient(oauthMetadata.registration_endpoint, {
        redirect_uris: [redirectUri],
        client_name: "MCP Registry",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      });
    } else {
      // If no DCR, we need pre-configured client credentials
      // For now, use a default client_id (this should be configurable)
      console.log("[OAuth] No registration endpoint, using default client");
      clientInfo = {
        client_id: process.env.MCP_OAUTH_CLIENT_ID || "mcp-registry",
        client_secret: process.env.MCP_OAUTH_CLIENT_SECRET,
      };
    }

    // 6. Generate PKCE + state + session
    const pkce = generatePKCE();
    const state = generateState();
    const sessionId = generateSessionId();

    const session: OAuthSession = {
      sessionId,
      state,
      codeVerifier: pkce.codeVerifier,
      codeChallenge: pkce.codeChallenge,
      clientInfo,
      callbackBaseUrl,
      mcpServerUrl,
      packageName,
      oauthMetadata,
      createdAt: Date.now(),
    };

    oauthSessionStore.set(session);

    // 7. Build authorization URL
    const scope =
      resourceMetadata.scopes_supported?.join(" ") || oauthMetadata.scopes_supported?.join(" ");
    const resource = getCanonicalResourceUri(mcpServerUrl);

    const authUrl = buildAuthorizationUrl({
      authorizationEndpoint: oauthMetadata.authorization_endpoint,
      clientId: clientInfo.client_id,
      redirectUri,
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
      scope,
      resource,
    });

    const response: OAuthPrepareResponse = {
      authUrl,
      sessionId,
      mcpServerUrl,
    };

    console.log(`[OAuth] Prepared OAuth flow for ${packageName}, sessionId: ${sessionId}`);
    return createResponse(response);
  } catch (error) {
    console.error("[OAuth] Prepare error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error during OAuth preparation";
    return createErrorResponse(message, 500);
  }
}

/**
 * Handle OAuth callback
 *
 * 1. Find session by state
 * 2. Exchange code for tokens
 * 3. POST tokens + clientInfo to callbackBaseUrl
 * 4. Delete session
 * 5. Return HTML to close popup
 */
export async function handleCallback(params: {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}) {
  const { code, state, error, error_description } = params;

  // Handle OAuth error
  if (error) {
    console.error(`[OAuth] Callback error: ${error} - ${error_description}`);
    return {
      success: false,
      error,
      error_description,
      html: generateCallbackHtml(false, error_description || error),
    };
  }

  if (!code || !state) {
    return {
      success: false,
      error: "invalid_request",
      error_description: "Missing code or state parameter",
      html: generateCallbackHtml(false, "Missing code or state parameter"),
    };
  }

  // 1. Find session by state
  const session = oauthSessionStore.getByState(state);
  if (!session) {
    return {
      success: false,
      error: "invalid_state",
      error_description: "Invalid or expired state parameter",
      html: generateCallbackHtml(false, "Invalid or expired authorization session"),
    };
  }

  try {
    // 2. Exchange code for tokens
    const redirectUri = getRegistryCallbackUrl();
    const resource = getCanonicalResourceUri(session.mcpServerUrl);

    console.log(`[OAuth] Exchanging code for tokens, sessionId: ${session.sessionId}`);
    const tokens: TokenResponse = await exchangeCodeForTokens({
      tokenEndpoint: session.oauthMetadata.token_endpoint,
      code,
      redirectUri,
      clientId: session.clientInfo.client_id,
      clientSecret: session.clientInfo.client_secret,
      codeVerifier: session.codeVerifier,
      resource,
    });

    // 3. POST to callbackBaseUrl
    const callbackData: OAuthCallbackData = {
      sessionId: session.sessionId,
      tokens,
      clientInfo: session.clientInfo,
      mcpServerUrl: session.mcpServerUrl,
      packageName: session.packageName,
    };

    console.log(`[OAuth] Posting callback data to ${session.callbackBaseUrl}`);
    try {
      const callbackResponse = await fetch(session.callbackBaseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callbackData),
      });

      if (!callbackResponse.ok) {
        console.warn(`[OAuth] Callback POST returned ${callbackResponse.status}`);
      }
    } catch (callbackError) {
      // Log but don't fail - the caller might handle this differently
      console.warn("[OAuth] Failed to POST to callbackBaseUrl:", callbackError);
    }

    // 4. Delete session
    oauthSessionStore.delete(session.sessionId);

    // 5. Return success HTML
    console.log(`[OAuth] OAuth flow completed successfully for ${session.packageName}`);
    return {
      success: true,
      sessionId: session.sessionId,
      html: generateCallbackHtml(true, undefined, session.sessionId),
    };
  } catch (error) {
    console.error("[OAuth] Callback processing error:", error);
    const message = error instanceof Error ? error.message : "Token exchange failed";

    // Delete session on error
    oauthSessionStore.delete(session.sessionId);

    return {
      success: false,
      error: "token_exchange_failed",
      error_description: message,
      html: generateCallbackHtml(false, message),
    };
  }
}

/**
 * Refresh access token
 */
export async function handleRefresh(request: OAuthRefreshRequest) {
  const { mcpServerUrl, refreshToken, clientId, clientSecret } = request;

  try {
    // Discover auth server to get token endpoint
    const resourceMetadata = await discoverProtectedResourceMetadata(mcpServerUrl);
    if (
      !resourceMetadata.authorization_servers ||
      resourceMetadata.authorization_servers.length === 0
    ) {
      return createErrorResponse("No authorization servers found", 400);
    }

    const authServerUrl = resourceMetadata.authorization_servers[0];
    const oauthMetadata = await discoverAuthServerMetadata(authServerUrl);

    const resource = getCanonicalResourceUri(mcpServerUrl);

    const tokens = await refreshAccessToken({
      tokenEndpoint: oauthMetadata.token_endpoint,
      refreshToken,
      clientId,
      clientSecret,
      resource,
    });

    return createResponse(tokens);
  } catch (error) {
    console.error("[OAuth] Refresh error:", error);
    const message = error instanceof Error ? error.message : "Token refresh failed";
    return createErrorResponse(message, 500);
  }
}

/**
 * Generate HTML response for OAuth callback
 * Uses postMessage to notify parent window
 */
function generateCallbackHtml(success: boolean, errorMessage?: string, sessionId?: string): string {
  const data = success
    ? JSON.stringify({ success: true, sessionId })
    : JSON.stringify({ success: false, error: errorMessage });

  return `<!DOCTYPE html>
<html>
<head>
  <title>OAuth Callback</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 15px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .success { color: #10B981; }
    .error { color: #EF4444; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { margin: 0 0 10px 0; font-size: 24px; }
    p { color: #666; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    ${
      success
        ? `
      <div class="icon">✅</div>
      <h1 class="success">Authorization Successful</h1>
      <p>You can close this window.</p>
    `
        : `
      <div class="icon">❌</div>
      <h1 class="error">Authorization Failed</h1>
      <p>${errorMessage || "An error occurred"}</p>
    `
    }
  </div>
  <script>
    (function() {
      const data = ${data};
      
      // Try postMessage to parent/opener
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-callback', ...data }, '*');
        setTimeout(() => window.close(), 1500);
      } else if (window.parent !== window) {
        window.parent.postMessage({ type: 'oauth-callback', ...data }, '*');
      }
      
      // Auto-close after delay
      setTimeout(() => {
        try { window.close(); } catch(e) {}
      }, 3000);
    })();
  </script>
</body>
</html>`;
}

export const oauthHandler = {
  prepareOAuth,
  handleCallback,
  handleRefresh,
};

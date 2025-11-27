/**
 * OAuth Utility Functions
 *
 * Implements:
 * - PKCE (RFC 7636) with S256 method
 * - Protected Resource Metadata Discovery (RFC 9728)
 * - Authorization Server Metadata Discovery (RFC 8414)
 * - Dynamic Client Registration (RFC 7591)
 * - Token Exchange
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  ClientInfo,
  ClientRegistrationRequest,
  OAuthMetadata,
  PKCEParams,
  ProtectedResourceMetadata,
  TokenResponse,
} from "./oauth-types";

/**
 * Generate PKCE parameters with S256 method
 * Per MCP spec: MUST use S256 when technically capable
 */
export function generatePKCE(): PKCEParams {
  // Generate a random 32-byte code verifier (base64url encoded = 43 chars)
  const codeVerifier = randomBytes(32).toString("base64url");

  // Create S256 code challenge: BASE64URL(SHA256(code_verifier))
  const hash = createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = hash.toString("base64url");

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

/**
 * Generate a cryptographically secure state parameter
 */
export function generateState(): string {
  return randomUUID();
}

/**
 * Generate a session ID
 */
export function generateSessionId(): string {
  return randomUUID();
}

/**
 * Parse WWW-Authenticate header to extract resource_metadata URL
 * Example: Bearer realm="mcp", resource_metadata="http://.../.well-known/oauth-protected-resource"
 */
export function parseWWWAuthenticate(header: string): {
  realm?: string;
  resourceMetadataUrl?: string;
  scope?: string;
} {
  const result: { realm?: string; resourceMetadataUrl?: string; scope?: string } = {};

  // Extract realm
  const realmMatch = header.match(/realm="([^"]+)"/);
  if (realmMatch) {
    result.realm = realmMatch[1];
  }

  // Extract resource_metadata
  const metadataMatch = header.match(/resource_metadata="([^"]+)"/);
  if (metadataMatch) {
    result.resourceMetadataUrl = metadataMatch[1];
  }

  // Extract scope
  const scopeMatch = header.match(/scope="([^"]+)"/);
  if (scopeMatch) {
    result.scope = scopeMatch[1];
  }

  return result;
}

/**
 * Discover Protected Resource Metadata from an MCP server
 * Per RFC 9728 and MCP spec
 */
export async function discoverProtectedResourceMetadata(
  mcpServerUrl: string,
): Promise<ProtectedResourceMetadata> {
  const serverUrl = new URL(mcpServerUrl);

  // First, try to get 401 with WWW-Authenticate header
  const probeResponse = await fetch(mcpServerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (probeResponse.status === 401) {
    const authHeader = probeResponse.headers.get("www-authenticate");
    if (authHeader) {
      const parsed = parseWWWAuthenticate(authHeader);
      if (parsed.resourceMetadataUrl) {
        const metadataResponse = await fetch(parsed.resourceMetadataUrl);
        if (metadataResponse.ok) {
          return (await metadataResponse.json()) as ProtectedResourceMetadata;
        }
      }
    }
  }

  // Fallback: try well-known URIs
  // Try path-specific first, then root
  const wellKnownPaths = [
    `${serverUrl.origin}/.well-known/oauth-protected-resource${serverUrl.pathname}`,
    `${serverUrl.origin}/.well-known/oauth-protected-resource`,
  ];

  for (const path of wellKnownPaths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        return (await response.json()) as ProtectedResourceMetadata;
      }
    } catch {
      // Continue to next path
    }
  }

  throw new Error(`Could not discover protected resource metadata for ${mcpServerUrl}`);
}

/**
 * Discover Authorization Server Metadata
 * Per RFC 8414 and OpenID Connect Discovery 1.0
 */
export async function discoverAuthServerMetadata(authServerUrl: string): Promise<OAuthMetadata> {
  const serverUrl = new URL(authServerUrl);
  const hasPath = serverUrl.pathname && serverUrl.pathname !== "/";

  // Build discovery URLs based on MCP spec priority order
  const discoveryUrls: string[] = [];

  if (hasPath) {
    // For URLs with path components (e.g., https://auth.example.com/tenant1)
    const pathWithoutLeadingSlash = serverUrl.pathname.replace(/^\//, "");
    // 1. OAuth 2.0 Authorization Server Metadata with path insertion
    discoveryUrls.push(
      `${serverUrl.origin}/.well-known/oauth-authorization-server/${pathWithoutLeadingSlash}`,
    );
    // 2. OpenID Connect Discovery 1.0 with path insertion
    discoveryUrls.push(
      `${serverUrl.origin}/.well-known/openid-configuration/${pathWithoutLeadingSlash}`,
    );
    // 3. OpenID Connect Discovery 1.0 path appending
    discoveryUrls.push(`${authServerUrl}/.well-known/openid-configuration`);
  } else {
    // For URLs without path components
    // 1. OAuth 2.0 Authorization Server Metadata
    discoveryUrls.push(`${serverUrl.origin}/.well-known/oauth-authorization-server`);
    // 2. OpenID Connect Discovery 1.0
    discoveryUrls.push(`${serverUrl.origin}/.well-known/openid-configuration`);
  }

  for (const url of discoveryUrls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const metadata = (await response.json()) as OAuthMetadata;
        return metadata;
      }
    } catch {
      // Continue to next URL
    }
  }

  throw new Error(`Could not discover authorization server metadata for ${authServerUrl}`);
}

/**
 * Verify that the authorization server supports PKCE with S256
 * Per MCP spec: MUST refuse to proceed if PKCE not supported
 *
 * Note: Many servers don't advertise code_challenge_methods_supported but still support PKCE.
 * We return { supported: boolean, advertised: boolean } to allow callers to decide.
 */
export function verifyPKCESupport(metadata: OAuthMetadata): {
  supported: boolean;
  advertised: boolean;
} {
  const methods = metadata.code_challenge_methods_supported;
  if (!methods || methods.length === 0) {
    // Not advertised, but might still be supported
    return { supported: true, advertised: false };
  }
  return { supported: methods.includes("S256"), advertised: true };
}

/**
 * Register client using Dynamic Client Registration
 * Per RFC 7591
 */
export async function registerClient(
  registrationEndpoint: string,
  request: ClientRegistrationRequest,
): Promise<ClientInfo> {
  const response = await fetch(registrationEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Client registration failed: ${response.status} ${error}`);
  }

  return (await response.json()) as ClientInfo;
}

/**
 * Build authorization URL with all required parameters
 */
export function buildAuthorizationUrl(params: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
  resource?: string;
}): string {
  const url = new URL(params.authorizationEndpoint);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", params.codeChallengeMethod);

  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }

  // Resource parameter per RFC 8707
  if (params.resource) {
    url.searchParams.set("resource", params.resource);
  }

  return url.toString();
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(params: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier: string;
  resource?: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", params.code);
  body.set("redirect_uri", params.redirectUri);
  body.set("client_id", params.clientId);
  body.set("code_verifier", params.codeVerifier);

  if (params.clientSecret) {
    body.set("client_secret", params.clientSecret);
  }

  if (params.resource) {
    body.set("resource", params.resource);
  }

  const response = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${error}`);
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(params: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  resource?: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", params.refreshToken);
  body.set("client_id", params.clientId);

  if (params.clientSecret) {
    body.set("client_secret", params.clientSecret);
  }

  if (params.resource) {
    body.set("resource", params.resource);
  }

  const response = await fetch(params.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${error}`);
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Get canonical resource URI for an MCP server
 * Per RFC 8707 - Resource Indicators
 */
export function getCanonicalResourceUri(mcpServerUrl: string): string {
  const url = new URL(mcpServerUrl);
  // Remove trailing slash unless semantically significant
  let resource = `${url.protocol}//${url.host}${url.pathname}`;
  if (resource.endsWith("/") && resource !== `${url.protocol}//${url.host}/`) {
    resource = resource.slice(0, -1);
  }
  return resource;
}

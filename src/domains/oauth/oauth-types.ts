/**
 * OAuth Types for MCP Registry
 *
 * Based on MCP OAuth Specification:
 * - OAuth 2.1 with PKCE
 * - Dynamic Client Registration (RFC 7591)
 * - Protected Resource Metadata (RFC 9728)
 */

/**
 * OAuth Authorization Server Metadata
 * Follows RFC 8414 - OAuth 2.0 Authorization Server Metadata
 */
export interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[]; // PKCE support indicator
}

/**
 * Protected Resource Metadata
 * Follows RFC 9728 - OAuth 2.0 Protected Resource Metadata
 */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported?: string[];
}

/**
 * Client Information from Dynamic Client Registration
 * Follows RFC 7591 - OAuth 2.0 Dynamic Client Registration
 */
export interface ClientInfo {
  client_id: string;
  client_secret?: string;
  client_secret_expires_at?: number;
  client_id_issued_at?: number;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
}

/**
 * Client Registration Request
 */
export interface ClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
}

/**
 * OAuth Token Response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * PKCE Parameters
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}

/**
 * OAuth Session stored in memory
 * Contains all necessary data for completing the OAuth flow
 */
export interface OAuthSession {
  sessionId: string;
  state: string;
  // PKCE
  codeVerifier: string;
  codeChallenge: string;
  // Client info from registration
  clientInfo: ClientInfo;
  // Callback URL where Registry will POST the result
  callbackBaseUrl: string;
  // MCP Server info
  mcpServerUrl: string;
  packageName: string;
  // OAuth metadata
  oauthMetadata: OAuthMetadata;
  // Timestamp for expiration
  createdAt: number;
}

/**
 * Request to prepare OAuth flow
 */
export interface OAuthPrepareRequest {
  packageName: string;
  callbackBaseUrl: string;
  /** Optional: directly specify MCP Server URL instead of using package config */
  mcpServerUrl?: string;
}

/**
 * Response from prepare OAuth endpoint
 */
export interface OAuthPrepareResponse {
  authUrl: string;
  sessionId: string;
  mcpServerUrl: string;
}

/**
 * Callback data sent to callbackBaseUrl after successful authorization
 */
export interface OAuthCallbackData {
  sessionId: string;
  tokens: TokenResponse;
  clientInfo: ClientInfo;
  mcpServerUrl: string;
  packageName: string;
}

/**
 * Request to refresh token
 */
export interface OAuthRefreshRequest {
  mcpServerUrl: string;
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
}

/**
 * OAuth Error response
 */
export interface OAuthError {
  error: string;
  error_description?: string;
}

/**
 * MCP Package with OAuth support info
 */
export interface MCPPackageOAuthInfo {
  packageName: string;
  mcpServerUrl: string;
  supportsOAuth: boolean;
  oauthMetadata?: OAuthMetadata;
}

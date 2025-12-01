import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuthMetadata, OAuthSession, ProtectedResourceMetadata } from "../oauth-types";

// Mock dependencies before importing the module under test
vi.mock("../../package/package-handler", () => ({
  repository: {
    getPackageConfig: vi.fn(),
  },
}));

vi.mock("../oauth-session", () => ({
  oauthSessionStore: {
    set: vi.fn(),
    get: vi.fn(),
    getByState: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../oauth-utils", () => ({
  discoverProtectedResourceMetadata: vi.fn(),
  discoverAuthServerMetadata: vi.fn(),
  verifyPKCESupport: vi.fn(),
  registerClient: vi.fn(),
  generatePKCE: vi.fn(),
  generateState: vi.fn(),
  generateSessionId: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  getCanonicalResourceUri: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("../../shared/config/environment", () => ({
  getServerPort: vi.fn(() => 3000),
}));

// Import after mocking
import { repository } from "../../package/package-handler";
import { handleCallback, handleRefresh, prepareOAuth } from "../oauth-handler";
import { oauthSessionStore } from "../oauth-session";
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
} from "../oauth-utils";

// Helper functions to create mock data
function createMockResourceMetadata(
  overrides: Partial<ProtectedResourceMetadata> = {},
): ProtectedResourceMetadata {
  return {
    resource: "https://mcp.example.com/server",
    authorization_servers: ["https://auth.example.com"],
    scopes_supported: ["read", "write"],
    ...overrides,
  };
}

function createMockOAuthMetadata(overrides: Partial<OAuthMetadata> = {}): OAuthMetadata {
  return {
    issuer: "https://auth.example.com",
    authorization_endpoint: "https://auth.example.com/authorize",
    token_endpoint: "https://auth.example.com/token",
    registration_endpoint: "https://auth.example.com/register",
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["read", "write"],
    ...overrides,
  };
}

function createMockSession(overrides: Partial<OAuthSession> = {}): OAuthSession {
  return {
    sessionId: "test-session-id",
    state: "test-state",
    codeVerifier: "test-code-verifier",
    codeChallenge: "test-code-challenge",
    clientInfo: {
      client_id: "test-client-id",
      client_secret: "test-client-secret",
    },
    callbackBaseUrl: "http://localhost:3003/callback",
    mcpServerUrl: "https://mcp.example.com/server",
    packageName: "test-package",
    oauthMetadata: createMockOAuthMetadata(),
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("oauth-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    vi.mocked(generatePKCE).mockReturnValue({
      codeVerifier: "mock-code-verifier",
      codeChallenge: "mock-code-challenge",
      codeChallengeMethod: "S256",
    });
    vi.mocked(generateState).mockReturnValue("mock-state");
    vi.mocked(generateSessionId).mockReturnValue("mock-session-id");
    vi.mocked(getCanonicalResourceUri).mockReturnValue("https://mcp.example.com/server");
    vi.mocked(buildAuthorizationUrl).mockReturnValue("https://auth.example.com/authorize?...");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("prepareOAuth", () => {
    describe("successful OAuth flow preparation", () => {
      it("should successfully prepare OAuth flow with direct mcpServerUrl", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(verifyPKCESupport).mockReturnValue({ supported: true, advertised: true });
        vi.mocked(registerClient).mockResolvedValue({
          client_id: "registered-client-id",
          client_secret: "registered-secret",
        });

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(true);
        expect(result.code).toBe(200);
        expect((result as { data?: unknown }).data).toHaveProperty("authUrl");
        expect((result as { data?: unknown }).data).toHaveProperty("sessionId");
        expect((result as { data?: unknown }).data).toHaveProperty("mcpServerUrl");
        expect(oauthSessionStore.set).toHaveBeenCalled();
      });

      it("should successfully prepare OAuth flow using package config", async () => {
        // Arrange
        vi.mocked(repository.getPackageConfig).mockReturnValue({
          name: "test-package",
          remotes: [{ type: "streamable-http", url: "https://mcp.example.com/server" }],
        } as ReturnType<typeof repository.getPackageConfig>);

        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(verifyPKCESupport).mockReturnValue({ supported: true, advertised: true });
        vi.mocked(registerClient).mockResolvedValue({
          client_id: "registered-client-id",
        });

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
        });

        // Assert
        expect(result.success).toBe(true);
        expect(result.code).toBe(200);
      });

      it("should use default client when no registration endpoint", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata({ registration_endpoint: undefined });

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(verifyPKCESupport).mockReturnValue({ supported: true, advertised: true });

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(true);
        expect(registerClient).not.toHaveBeenCalled();
      });

      it("should log warning but proceed when PKCE is not advertised", async () => {
        // Arrange
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(verifyPKCESupport).mockReturnValue({ supported: true, advertised: false });
        vi.mocked(registerClient).mockResolvedValue({ client_id: "test-client" });

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("does not advertise code_challenge_methods_supported"),
        );

        consoleSpy.mockRestore();
      });
    });

    describe("error handling during discovery/registration", () => {
      it("should return error when package does not support OAuth", async () => {
        // Arrange
        vi.mocked(repository.getPackageConfig).mockReturnValue({
          packageName: "test-package",
          type: "mcp-server",
          runtime: "node",
          remotes: [],
        } as unknown as ReturnType<typeof repository.getPackageConfig>);

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(400);
        expect(result.message).toContain("does not support OAuth");
      });

      it("should return error when no authorization servers found", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata({ authorization_servers: [] });
        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(400);
        expect(result.message).toContain("No authorization servers found");
      });

      it("should return error when PKCE is explicitly not supported", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(verifyPKCESupport).mockReturnValue({ supported: false, advertised: true });

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(400);
        expect(result.message).toContain("does not support PKCE");
      });

      it("should return error when resource metadata discovery fails", async () => {
        // Arrange
        vi.mocked(discoverProtectedResourceMetadata).mockRejectedValue(
          new Error("Discovery failed"),
        );

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(500);
        expect(result.message).toBe("Discovery failed");
      });

      it("should return error when auth server metadata discovery fails", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockRejectedValue(
          new Error("Auth server discovery failed"),
        );

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(500);
        expect(result.message).toBe("Auth server discovery failed");
      });

      it("should return error when client registration fails", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(verifyPKCESupport).mockReturnValue({ supported: true, advertised: true });
        vi.mocked(registerClient).mockRejectedValue(new Error("Registration failed"));

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(500);
        expect(result.message).toBe("Registration failed");
      });

      it("should handle non-Error exceptions gracefully", async () => {
        // Arrange
        vi.mocked(discoverProtectedResourceMetadata).mockRejectedValue("Unknown error");

        // Act
        const result = await prepareOAuth({
          packageName: "test-package",
          callbackBaseUrl: "http://localhost:3003/callback",
          mcpServerUrl: "https://mcp.example.com/server",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(500);
        expect(result.message).toBe("Unknown error during OAuth preparation");
      });
    });
  });

  describe("handleCallback", () => {
    describe("callback handling with valid/invalid state", () => {
      it("should return error when OAuth error is present in params", async () => {
        // Act
        const result = await handleCallback({
          error: "access_denied",
          error_description: "User denied access",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe("access_denied");
        expect(result.error_description).toBe("User denied access");
        expect(result.html).toContain("Authorization Failed");
      });

      it("should return error when code is missing", async () => {
        // Act
        const result = await handleCallback({
          state: "test-state",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe("invalid_request");
        expect(result.error_description).toBe("Missing code or state parameter");
      });

      it("should return error when state is missing", async () => {
        // Act
        const result = await handleCallback({
          code: "test-code",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe("invalid_request");
        expect(result.error_description).toBe("Missing code or state parameter");
      });

      it("should return error when session is not found by state", async () => {
        // Arrange
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(undefined);

        // Act
        const result = await handleCallback({
          code: "test-code",
          state: "invalid-state",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe("invalid_state");
        expect(result.error_description).toBe("Invalid or expired state parameter");
        expect(result.html).toContain("Invalid or expired authorization session");
      });
    });

    describe("token exchange success and failure scenarios", () => {
      it("should successfully exchange code for tokens", async () => {
        // Arrange
        const mockSession = createMockSession();
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(mockSession);
        vi.mocked(exchangeCodeForTokens).mockResolvedValue({
          access_token: "test-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "test-refresh-token",
        });

        // Mock fetch for callback POST
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        global.fetch = mockFetch;

        // Act
        const result = await handleCallback({
          code: "test-code",
          state: "test-state",
        });

        // Assert
        expect(result.success).toBe(true);
        expect(result.sessionId).toBe(mockSession.sessionId);
        expect(result.html).toContain("Authorization Successful");
        expect(oauthSessionStore.delete).toHaveBeenCalledWith(mockSession.sessionId);
      });

      it("should POST callback data to callbackBaseUrl", async () => {
        // Arrange
        const mockSession = createMockSession();
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(mockSession);
        vi.mocked(exchangeCodeForTokens).mockResolvedValue({
          access_token: "test-access-token",
          token_type: "Bearer",
        });

        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        global.fetch = mockFetch;

        // Act
        await handleCallback({
          code: "test-code",
          state: "test-state",
        });

        // Assert
        expect(mockFetch).toHaveBeenCalledWith(
          mockSession.callbackBaseUrl,
          expect.objectContaining({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: expect.stringContaining("test-access-token"),
          }),
        );
      });

      it("should succeed even if callback POST fails", async () => {
        // Arrange
        const mockSession = createMockSession();
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(mockSession);
        vi.mocked(exchangeCodeForTokens).mockResolvedValue({
          access_token: "test-access-token",
          token_type: "Bearer",
        });

        // Mock fetch to fail
        const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
        global.fetch = mockFetch;

        // Act
        const result = await handleCallback({
          code: "test-code",
          state: "test-state",
        });

        // Assert - should still succeed
        expect(result.success).toBe(true);
      });

      it("should log warning when callback POST returns non-ok status", async () => {
        // Arrange
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const mockSession = createMockSession();
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(mockSession);
        vi.mocked(exchangeCodeForTokens).mockResolvedValue({
          access_token: "test-access-token",
          token_type: "Bearer",
        });

        const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
        global.fetch = mockFetch;

        // Act
        const result = await handleCallback({
          code: "test-code",
          state: "test-state",
        });

        // Assert
        expect(result.success).toBe(true);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Callback POST returned"));

        consoleSpy.mockRestore();
      });

      it("should return error when token exchange fails", async () => {
        // Arrange
        const mockSession = createMockSession();
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(mockSession);
        vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error("Invalid grant"));

        // Act
        const result = await handleCallback({
          code: "test-code",
          state: "test-state",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.error).toBe("token_exchange_failed");
        expect(result.error_description).toBe("Invalid grant");
        expect(oauthSessionStore.delete).toHaveBeenCalledWith(mockSession.sessionId);
      });

      it("should handle non-Error exceptions during token exchange", async () => {
        // Arrange
        const mockSession = createMockSession();
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(mockSession);
        vi.mocked(exchangeCodeForTokens).mockRejectedValue("Unknown error");

        // Act
        const result = await handleCallback({
          code: "test-code",
          state: "test-state",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.error_description).toBe("Token exchange failed");
      });
    });

    describe("HTML response generation", () => {
      it("should generate success HTML with postMessage script", async () => {
        // Arrange
        const mockSession = createMockSession();
        vi.mocked(oauthSessionStore.getByState).mockReturnValue(mockSession);
        vi.mocked(exchangeCodeForTokens).mockResolvedValue({
          access_token: "test-access-token",
          token_type: "Bearer",
        });

        global.fetch = vi.fn().mockResolvedValue({ ok: true });

        // Act
        const result = await handleCallback({
          code: "test-code",
          state: "test-state",
        });

        // Assert
        expect(result.html).toContain("oauth-callback");
        expect(result.html).toContain("postMessage");
        expect(result.html).toContain("window.opener");
      });

      it("should generate error HTML with error message", async () => {
        // Act
        const result = await handleCallback({
          error: "access_denied",
          error_description: "User denied access",
        });

        // Assert
        expect(result.html).toContain("User denied access");
        expect(result.html).toContain("Authorization Failed");
      });

      it("should use error code when error_description is not provided", async () => {
        // Act
        const result = await handleCallback({
          error: "server_error",
        });

        // Assert
        expect(result.html).toContain("server_error");
      });
    });
  });

  describe("handleRefresh", () => {
    describe("refresh token functionality", () => {
      it("should successfully refresh access token", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(refreshAccessToken).mockResolvedValue({
          access_token: "new-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "new-refresh-token",
        });

        // Act
        const result = await handleRefresh({
          mcpServerUrl: "https://mcp.example.com/server",
          refreshToken: "old-refresh-token",
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
        });

        // Assert
        expect(result.success).toBe(true);
        expect(result.code).toBe(200);
        expect((result as { data?: unknown }).data).toEqual({
          access_token: "new-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "new-refresh-token",
        });
      });

      it("should return error when no authorization servers found", async () => {
        // Arrange
        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue({
          resource: "https://mcp.example.com/server",
          authorization_servers: [],
        });

        // Act
        const result = await handleRefresh({
          mcpServerUrl: "https://mcp.example.com/server",
          refreshToken: "old-refresh-token",
          clientId: "test-client-id",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(400);
        expect(result.message).toContain("No authorization servers found");
      });

      it("should return error when resource metadata discovery fails", async () => {
        // Arrange
        vi.mocked(discoverProtectedResourceMetadata).mockRejectedValue(
          new Error("Discovery failed"),
        );

        // Act
        const result = await handleRefresh({
          mcpServerUrl: "https://mcp.example.com/server",
          refreshToken: "old-refresh-token",
          clientId: "test-client-id",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(500);
        expect(result.message).toBe("Discovery failed");
      });

      it("should return error when refresh token request fails", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(refreshAccessToken).mockRejectedValue(new Error("Invalid refresh token"));

        // Act
        const result = await handleRefresh({
          mcpServerUrl: "https://mcp.example.com/server",
          refreshToken: "invalid-refresh-token",
          clientId: "test-client-id",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.code).toBe(500);
        expect(result.message).toBe("Invalid refresh token");
      });

      it("should handle non-Error exceptions during refresh", async () => {
        // Arrange
        vi.mocked(discoverProtectedResourceMetadata).mockRejectedValue("Unknown error");

        // Act
        const result = await handleRefresh({
          mcpServerUrl: "https://mcp.example.com/server",
          refreshToken: "old-refresh-token",
          clientId: "test-client-id",
        });

        // Assert
        expect(result.success).toBe(false);
        expect(result.message).toBe("Token refresh failed");
      });

      it("should work without client secret", async () => {
        // Arrange
        const resourceMetadata = createMockResourceMetadata();
        const oauthMetadata = createMockOAuthMetadata();

        vi.mocked(discoverProtectedResourceMetadata).mockResolvedValue(resourceMetadata);
        vi.mocked(discoverAuthServerMetadata).mockResolvedValue(oauthMetadata);
        vi.mocked(refreshAccessToken).mockResolvedValue({
          access_token: "new-access-token",
          token_type: "Bearer",
        });

        // Act
        const result = await handleRefresh({
          mcpServerUrl: "https://mcp.example.com/server",
          refreshToken: "old-refresh-token",
          clientId: "test-client-id",
          // No clientSecret
        });

        // Assert
        expect(result.success).toBe(true);
        expect(refreshAccessToken).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: "test-client-id",
            clientSecret: undefined,
          }),
        );
      });
    });
  });
});

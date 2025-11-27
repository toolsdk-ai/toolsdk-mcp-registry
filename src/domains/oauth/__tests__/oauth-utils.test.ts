import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuthMetadata } from "../oauth-types";
import {
  buildAuthorizationUrl,
  generatePKCE,
  generateSessionId,
  generateState,
  getCanonicalResourceUri,
  parseWWWAuthenticate,
  verifyPKCESupport,
} from "../oauth-utils";

describe("oauth-utils", () => {
  describe("generatePKCE", () => {
    it("should generate valid PKCE parameters", () => {
      // Act
      const pkce = generatePKCE();

      // Assert
      expect(pkce).toHaveProperty("codeVerifier");
      expect(pkce).toHaveProperty("codeChallenge");
      expect(pkce).toHaveProperty("codeChallengeMethod");
      expect(pkce.codeChallengeMethod).toBe("S256");
    });

    it("should generate code verifier with correct length (43 chars base64url)", () => {
      // Act
      const pkce = generatePKCE();

      // Assert - 32 bytes base64url encoded = 43 characters
      expect(pkce.codeVerifier.length).toBe(43);
    });

    it("should generate code challenge with correct length", () => {
      // Act
      const pkce = generatePKCE();

      // Assert - SHA256 hash (32 bytes) base64url encoded = 43 characters
      expect(pkce.codeChallenge.length).toBe(43);
    });

    it("should generate different values each time", () => {
      // Act
      const pkce1 = generatePKCE();
      const pkce2 = generatePKCE();

      // Assert
      expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
      expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
    });

    it("should generate base64url encoded values (no +, /, =)", () => {
      // Act
      const pkce = generatePKCE();

      // Assert - base64url should not contain +, /, or =
      expect(pkce.codeVerifier).not.toMatch(/[+/=]/);
      expect(pkce.codeChallenge).not.toMatch(/[+/=]/);
    });
  });

  describe("generateState", () => {
    it("should generate a valid UUID", () => {
      // Act
      const state = generateState();

      // Assert - UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(state).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("should generate different values each time", () => {
      // Act
      const state1 = generateState();
      const state2 = generateState();

      // Assert
      expect(state1).not.toBe(state2);
    });
  });

  describe("generateSessionId", () => {
    it("should generate a valid UUID", () => {
      // Act
      const sessionId = generateSessionId();

      // Assert
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("should generate different values each time", () => {
      // Act
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      // Assert
      expect(id1).not.toBe(id2);
    });
  });

  describe("parseWWWAuthenticate", () => {
    it("should parse complete WWW-Authenticate header", () => {
      // Arrange
      const header =
        'Bearer realm="mcp", resource_metadata="http://localhost:3001/.well-known/oauth-protected-resource", scope="read write"';

      // Act
      const result = parseWWWAuthenticate(header);

      // Assert
      expect(result).toEqual({
        realm: "mcp",
        resourceMetadataUrl: "http://localhost:3001/.well-known/oauth-protected-resource",
        scope: "read write",
      });
    });

    it("should parse header with only realm", () => {
      // Arrange
      const header = 'Bearer realm="example"';

      // Act
      const result = parseWWWAuthenticate(header);

      // Assert
      expect(result).toEqual({
        realm: "example",
      });
    });

    it("should parse header with only resource_metadata", () => {
      // Arrange
      const header =
        'Bearer resource_metadata="http://example.com/.well-known/oauth-protected-resource"';

      // Act
      const result = parseWWWAuthenticate(header);

      // Assert
      expect(result).toEqual({
        resourceMetadataUrl: "http://example.com/.well-known/oauth-protected-resource",
      });
    });

    it("should return empty object for empty header", () => {
      // Arrange
      const header = "Bearer";

      // Act
      const result = parseWWWAuthenticate(header);

      // Assert
      expect(result).toEqual({});
    });
  });

  describe("verifyPKCESupport", () => {
    it("should return supported=true when S256 is in supported methods", () => {
      // Arrange
      const metadata: OAuthMetadata = {
        issuer: "http://localhost:3001",
        authorization_endpoint: "http://localhost:3001/authorize",
        token_endpoint: "http://localhost:3001/token",
        code_challenge_methods_supported: ["S256", "plain"],
      };

      // Act
      const result = verifyPKCESupport(metadata);

      // Assert
      expect(result).toEqual({ supported: true, advertised: true });
    });

    it("should return supported=false when S256 is not in supported methods", () => {
      // Arrange
      const metadata: OAuthMetadata = {
        issuer: "http://localhost:3001",
        authorization_endpoint: "http://localhost:3001/authorize",
        token_endpoint: "http://localhost:3001/token",
        code_challenge_methods_supported: ["plain"],
      };

      // Act
      const result = verifyPKCESupport(metadata);

      // Assert
      expect(result).toEqual({ supported: false, advertised: true });
    });

    it("should return supported=true, advertised=false when code_challenge_methods_supported is missing", () => {
      // Arrange
      const metadata: OAuthMetadata = {
        issuer: "http://localhost:3001",
        authorization_endpoint: "http://localhost:3001/authorize",
        token_endpoint: "http://localhost:3001/token",
      };

      // Act
      const result = verifyPKCESupport(metadata);

      // Assert
      expect(result).toEqual({ supported: true, advertised: false });
    });

    it("should return supported=true, advertised=false when code_challenge_methods_supported is empty", () => {
      // Arrange
      const metadata: OAuthMetadata = {
        issuer: "http://localhost:3001",
        authorization_endpoint: "http://localhost:3001/authorize",
        token_endpoint: "http://localhost:3001/token",
        code_challenge_methods_supported: [],
      };

      // Act
      const result = verifyPKCESupport(metadata);

      // Assert
      expect(result).toEqual({ supported: true, advertised: false });
    });
  });

  describe("buildAuthorizationUrl", () => {
    it("should build URL with all required parameters", () => {
      // Arrange
      const params = {
        authorizationEndpoint: "http://localhost:3001/authorize",
        clientId: "test-client",
        redirectUri: "http://localhost:3003/callback",
        state: "random-state",
        codeChallenge: "test-challenge",
        codeChallengeMethod: "S256",
      };

      // Act
      const result = buildAuthorizationUrl(params);

      // Assert
      const url = new URL(result);
      expect(url.origin).toBe("http://localhost:3001");
      expect(url.pathname).toBe("/authorize");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe("test-client");
      expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3003/callback");
      expect(url.searchParams.get("state")).toBe("random-state");
      expect(url.searchParams.get("code_challenge")).toBe("test-challenge");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    });

    it("should include scope when provided", () => {
      // Arrange
      const params = {
        authorizationEndpoint: "http://localhost:3001/authorize",
        clientId: "test-client",
        redirectUri: "http://localhost:3003/callback",
        state: "random-state",
        codeChallenge: "test-challenge",
        codeChallengeMethod: "S256",
        scope: "read write",
      };

      // Act
      const result = buildAuthorizationUrl(params);

      // Assert
      const url = new URL(result);
      expect(url.searchParams.get("scope")).toBe("read write");
    });

    it("should include resource when provided", () => {
      // Arrange
      const params = {
        authorizationEndpoint: "http://localhost:3001/authorize",
        clientId: "test-client",
        redirectUri: "http://localhost:3003/callback",
        state: "random-state",
        codeChallenge: "test-challenge",
        codeChallengeMethod: "S256",
        resource: "http://localhost:3001/mcp",
      };

      // Act
      const result = buildAuthorizationUrl(params);

      // Assert
      const url = new URL(result);
      expect(url.searchParams.get("resource")).toBe("http://localhost:3001/mcp");
    });

    it("should not include scope when not provided", () => {
      // Arrange
      const params = {
        authorizationEndpoint: "http://localhost:3001/authorize",
        clientId: "test-client",
        redirectUri: "http://localhost:3003/callback",
        state: "random-state",
        codeChallenge: "test-challenge",
        codeChallengeMethod: "S256",
      };

      // Act
      const result = buildAuthorizationUrl(params);

      // Assert
      const url = new URL(result);
      expect(url.searchParams.has("scope")).toBe(false);
    });
  });

  describe("getCanonicalResourceUri", () => {
    it("should return URL without trailing slash", () => {
      // Arrange
      const mcpServerUrl = "http://localhost:3001/mcp/";

      // Act
      const result = getCanonicalResourceUri(mcpServerUrl);

      // Assert
      expect(result).toBe("http://localhost:3001/mcp");
    });

    it("should keep URL without trailing slash unchanged", () => {
      // Arrange
      const mcpServerUrl = "http://localhost:3001/mcp";

      // Act
      const result = getCanonicalResourceUri(mcpServerUrl);

      // Assert
      expect(result).toBe("http://localhost:3001/mcp");
    });

    it("should handle root URL correctly", () => {
      // Arrange
      const mcpServerUrl = "http://localhost:3001/";

      // Act
      const result = getCanonicalResourceUri(mcpServerUrl);

      // Assert
      expect(result).toBe("http://localhost:3001/");
    });

    it("should strip query parameters", () => {
      // Arrange
      const mcpServerUrl = "http://localhost:3001/mcp?param=value";

      // Act
      const result = getCanonicalResourceUri(mcpServerUrl);

      // Assert
      expect(result).toBe("http://localhost:3001/mcp");
    });

    it("should strip fragment", () => {
      // Arrange
      const mcpServerUrl = "http://localhost:3001/mcp#section";

      // Act
      const result = getCanonicalResourceUri(mcpServerUrl);

      // Assert
      expect(result).toBe("http://localhost:3001/mcp");
    });
  });
});

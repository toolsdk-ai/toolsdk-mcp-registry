import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthSessionStore } from "../oauth-session";
import type { OAuthSession } from "../oauth-types";

// Create a new instance for testing (not the singleton)
function createTestStore(): OAuthSessionStore {
  const store = new OAuthSessionStore();
  // Stop the cleanup timer to avoid interference with tests
  store.stopCleanup();
  return store;
}

function createMockSession(overrides: Partial<OAuthSession> = {}): OAuthSession {
  return {
    sessionId: "test-session-id",
    state: "test-state",
    codeVerifier: "test-code-verifier",
    codeChallenge: "test-code-challenge",
    clientInfo: {
      client_id: "test-client-id",
    },
    callbackBaseUrl: "http://localhost:3003/callback",
    mcpServerUrl: "http://localhost:3001/mcp",
    packageName: "github-mcp",
    oauthMetadata: {
      issuer: "http://localhost:3001",
      authorization_endpoint: "http://localhost:3001/authorize",
      token_endpoint: "http://localhost:3001/token",
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("OAuthSessionStore", () => {
  let store: OAuthSessionStore;

  beforeEach(() => {
    store = createTestStore();
  });

  afterEach(() => {
    store.stopCleanup();
    store.clear();
  });

  describe("set", () => {
    it("should store a session", () => {
      // Arrange
      const session = createMockSession();

      // Act
      store.set(session);

      // Assert
      expect(store.has(session.sessionId)).toBe(true);
      expect(store.size()).toBe(1);
    });

    it("should allow retrieval by sessionId after set", () => {
      // Arrange
      const session = createMockSession();

      // Act
      store.set(session);
      const retrieved = store.get(session.sessionId);

      // Assert
      expect(retrieved).toEqual(session);
    });

    it("should allow retrieval by state after set", () => {
      // Arrange
      const session = createMockSession();

      // Act
      store.set(session);
      const retrieved = store.getByState(session.state);

      // Assert
      expect(retrieved).toEqual(session);
    });

    it("should overwrite session with same sessionId", () => {
      // Arrange
      const session1 = createMockSession({ packageName: "package1" });
      const session2 = createMockSession({ packageName: "package2" });

      // Act
      store.set(session1);
      store.set(session2);

      // Assert
      const retrieved = store.get(session1.sessionId);
      expect(retrieved?.packageName).toBe("package2");
      expect(store.size()).toBe(1);
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent session", () => {
      // Act
      const result = store.get("non-existent-id");

      // Assert
      expect(result).toBeUndefined();
    });

    it("should return session when exists", () => {
      // Arrange
      const session = createMockSession();
      store.set(session);

      // Act
      const result = store.get(session.sessionId);

      // Assert
      expect(result).toEqual(session);
    });

    it("should return undefined for expired session", () => {
      // Arrange - create session that expired 11 minutes ago
      const expiredSession = createMockSession({
        sessionId: "expired-session",
        createdAt: Date.now() - 11 * 60 * 1000,
      });
      store.set(expiredSession);

      // Act
      const result = store.get("expired-session");

      // Assert
      expect(result).toBeUndefined();
      expect(store.has("expired-session")).toBe(false);
    });

    it("should return session that is still valid (9 minutes old)", () => {
      // Arrange
      const validSession = createMockSession({
        sessionId: "valid-session",
        createdAt: Date.now() - 9 * 60 * 1000,
      });
      store.set(validSession);

      // Act
      const result = store.get("valid-session");

      // Assert
      expect(result).toBeDefined();
      expect(result?.sessionId).toBe("valid-session");
    });
  });

  describe("getByState", () => {
    it("should return undefined for non-existent state", () => {
      // Act
      const result = store.getByState("non-existent-state");

      // Assert
      expect(result).toBeUndefined();
    });

    it("should return session when state exists", () => {
      // Arrange
      const session = createMockSession({ state: "unique-state" });
      store.set(session);

      // Act
      const result = store.getByState("unique-state");

      // Assert
      expect(result).toEqual(session);
    });

    it("should return undefined for expired session by state", () => {
      // Arrange
      const expiredSession = createMockSession({
        state: "expired-state",
        createdAt: Date.now() - 11 * 60 * 1000,
      });
      store.set(expiredSession);

      // Act
      const result = store.getByState("expired-state");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("delete", () => {
    it("should return false for non-existent session", () => {
      // Act
      const result = store.delete("non-existent-id");

      // Assert
      expect(result).toBe(false);
    });

    it("should delete existing session and return true", () => {
      // Arrange
      const session = createMockSession();
      store.set(session);

      // Act
      const result = store.delete(session.sessionId);

      // Assert
      expect(result).toBe(true);
      expect(store.has(session.sessionId)).toBe(false);
      expect(store.size()).toBe(0);
    });

    it("should also remove state mapping when session is deleted", () => {
      // Arrange
      const session = createMockSession({ state: "state-to-delete" });
      store.set(session);

      // Act
      store.delete(session.sessionId);
      const byState = store.getByState("state-to-delete");

      // Assert
      expect(byState).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return false for non-existent session", () => {
      // Act
      const result = store.has("non-existent-id");

      // Assert
      expect(result).toBe(false);
    });

    it("should return true for existing session", () => {
      // Arrange
      const session = createMockSession();
      store.set(session);

      // Act
      const result = store.has(session.sessionId);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("size", () => {
    it("should return 0 for empty store", () => {
      // Act
      const result = store.size();

      // Assert
      expect(result).toBe(0);
    });

    it("should return correct count after adding sessions", () => {
      // Arrange
      store.set(createMockSession({ sessionId: "session-1", state: "state-1" }));
      store.set(createMockSession({ sessionId: "session-2", state: "state-2" }));
      store.set(createMockSession({ sessionId: "session-3", state: "state-3" }));

      // Act
      const result = store.size();

      // Assert
      expect(result).toBe(3);
    });

    it("should return correct count after deleting sessions", () => {
      // Arrange
      store.set(createMockSession({ sessionId: "session-1", state: "state-1" }));
      store.set(createMockSession({ sessionId: "session-2", state: "state-2" }));
      store.delete("session-1");

      // Act
      const result = store.size();

      // Assert
      expect(result).toBe(1);
    });
  });

  describe("clear", () => {
    it("should remove all sessions", () => {
      // Arrange
      store.set(createMockSession({ sessionId: "session-1", state: "state-1" }));
      store.set(createMockSession({ sessionId: "session-2", state: "state-2" }));

      // Act
      store.clear();

      // Assert
      expect(store.size()).toBe(0);
      expect(store.has("session-1")).toBe(false);
      expect(store.has("session-2")).toBe(false);
    });

    it("should also clear state mappings", () => {
      // Arrange
      store.set(createMockSession({ sessionId: "session-1", state: "state-1" }));

      // Act
      store.clear();
      const byState = store.getByState("state-1");

      // Assert
      expect(byState).toBeUndefined();
    });
  });

  describe("multiple sessions", () => {
    it("should handle multiple sessions with different states", () => {
      // Arrange
      const session1 = createMockSession({
        sessionId: "session-1",
        state: "state-1",
        packageName: "package-1",
      });
      const session2 = createMockSession({
        sessionId: "session-2",
        state: "state-2",
        packageName: "package-2",
      });

      // Act
      store.set(session1);
      store.set(session2);

      // Assert
      expect(store.get("session-1")?.packageName).toBe("package-1");
      expect(store.get("session-2")?.packageName).toBe("package-2");
      expect(store.getByState("state-1")?.packageName).toBe("package-1");
      expect(store.getByState("state-2")?.packageName).toBe("package-2");
    });

    it("should not affect other sessions when deleting one", () => {
      // Arrange
      store.set(createMockSession({ sessionId: "session-1", state: "state-1" }));
      store.set(createMockSession({ sessionId: "session-2", state: "state-2" }));

      // Act
      store.delete("session-1");

      // Assert
      expect(store.has("session-1")).toBe(false);
      expect(store.has("session-2")).toBe(true);
      expect(store.getByState("state-2")).toBeDefined();
    });
  });
});

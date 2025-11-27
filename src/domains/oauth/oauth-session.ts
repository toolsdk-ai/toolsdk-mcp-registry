/**
 * OAuth Session Storage
 *
 * In-memory session storage for OAuth flow.
 * Sessions expire after 10 minutes and are deleted after successful completion.
 */

import type { OAuthSession } from "./oauth-types";

// Session expiration time: 10 minutes
const SESSION_TTL_MS = 10 * 60 * 1000;

// Cleanup interval: 1 minute
const CLEANUP_INTERVAL_MS = 60 * 1000;

export class OAuthSessionStore {
  private sessions: Map<string, OAuthSession> = new Map();
  private stateToSessionId: Map<string, string> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanup();
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanup(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);

    // Unref to allow process to exit
    this.cleanupTimer.unref();
  }

  /**
   * Stop cleanup timer (for testing)
   */
  public stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Remove expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.delete(sessionId);
        console.log(`[OAuth] Session ${sessionId} expired and cleaned up`);
      }
    }
  }

  /**
   * Create a new session
   */
  public set(session: OAuthSession): void {
    this.sessions.set(session.sessionId, session);
    this.stateToSessionId.set(session.state, session.sessionId);
    console.log(`[OAuth] Session ${session.sessionId} created for package ${session.packageName}`);
  }

  /**
   * Get session by sessionId
   */
  public get(sessionId: string): OAuthSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    // Check if expired
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.delete(sessionId);
      return undefined;
    }

    return session;
  }

  /**
   * Get session by state parameter
   */
  public getByState(state: string): OAuthSession | undefined {
    const sessionId = this.stateToSessionId.get(state);
    if (!sessionId) return undefined;
    return this.get(sessionId);
  }

  /**
   * Delete session
   */
  public delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.stateToSessionId.delete(session.state);
      this.sessions.delete(sessionId);
      console.log(`[OAuth] Session ${sessionId} deleted`);
      return true;
    }
    return false;
  }

  /**
   * Check if session exists
   */
  public has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get number of active sessions
   */
  public size(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions (for testing)
   */
  public clear(): void {
    this.sessions.clear();
    this.stateToSessionId.clear();
  }
}

// Singleton instance
export const oauthSessionStore = new OAuthSessionStore();

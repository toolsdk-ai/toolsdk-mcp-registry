import { describe, expect, it, vi } from "vitest";

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

import { handleCallback } from "../oauth-handler";

describe("XSS escape in OAuth callback HTML", () => {
  describe("escapeHtml (error message in <p> tag)", () => {
    it("should escape HTML tags in error_description", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: '<script>alert("xss")</script>',
      });

      // The <p> tag should contain escaped HTML, not raw script tags
      expect(result.html).not.toContain('<script>alert("xss")</script>');
      expect(result.html).toContain("&lt;script&gt;");
    });

    it("should escape ampersands in error_description", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "foo & bar",
      });

      // Within the <p> tag, & should be escaped
      expect(result.html).toContain("foo &amp; bar");
    });

    it("should escape double quotes in error_description", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: 'break "out" of attribute',
      });

      expect(result.html).toContain("break &quot;out&quot; of attribute");
    });

    it("should escape single quotes in error_description", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "it's malicious",
      });

      expect(result.html).toContain("it&#x27;s malicious");
    });

    it("should escape closing angle brackets in error_description", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "test > injection",
      });

      expect(result.html).toContain("test &gt; injection");
    });
  });

  describe("escapeJsonForScriptBlock (data in <script> tag)", () => {
    it("should prevent </script> breakout in error message", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: '</script><script>alert("xss")</script>',
      });

      // The raw </script> should NOT appear in the HTML output
      // (it would break out of the script block)
      expect(result.html).not.toMatch(/<\/script><script>alert/);
    });

    it("should escape forward slashes in script block JSON data", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "test/path",
      });

      // In the script block, "/" should be escaped as "\\/"
      // Extract the script block
      const scriptMatch = result.html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).toBeTruthy();
      const scriptContent = scriptMatch?.[1];

      // The JSON data in the script should have escaped slashes
      expect(scriptContent).toContain("\\/");
    });

    it("should escape < in script block JSON data", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "test<injection",
      });

      const scriptMatch = result.html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).toBeTruthy();
      const scriptContent = scriptMatch?.[1];

      // < should be escaped as \\u003c in the script block data
      expect(scriptContent).toContain("\\u003c");
    });

    it("should produce valid JSON after escaping", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "normal error message",
      });

      // Extract the data assignment from the script
      const dataMatch = result.html.match(/const data = ({.*?});/s);
      expect(dataMatch).toBeTruthy();

      // The escaped JSON should be parseable as JavaScript
      // (\\/ is valid in JS, \\u003c is valid unicode escape)
      const rawData = dataMatch?.[1];
      expect(rawData).toBeTruthy();
    });
  });

  describe("normal (non-malicious) usage still works", () => {
    it("should display normal error messages correctly in HTML", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "User denied access",
      });

      expect(result.html).toContain("User denied access");
      expect(result.html).toContain("Authorization Failed");
    });

    it("should fall back to error code when no description provided", async () => {
      const result = await handleCallback({
        error: "server_error",
      });

      expect(result.html).toContain("server_error");
    });

    it("should return proper error structure", async () => {
      const result = await handleCallback({
        error: "access_denied",
        error_description: "User denied access",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("access_denied");
      expect(result.error_description).toBe("User denied access");
    });

    it("should handle empty error_description gracefully", async () => {
      const result = await handleCallback({
        error: "unknown_error",
        error_description: "",
      });

      // Should use the error code as fallback since empty string is falsy
      expect(result.html).toContain("unknown_error");
    });
  });
});

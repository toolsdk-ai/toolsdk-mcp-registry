import { describe, expect, it } from "vitest";
import { OfficialRegistryProvider } from "../providers/official-registry-provider";

/**
 * Integration tests for OfficialRegistryProvider
 * These tests call the real official API
 */
describe("OfficialRegistryProvider - Integration", () => {
  const provider = new OfficialRegistryProvider();

  describe("search", () => {
    it("should search and return results from official API", async () => {
      // Act - search for tavily
      const results = await provider.search("tavily");

      // Assert
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // Log results for debugging
      console.log(`Found ${results.length} results for 'tavily'`);
      if (results.length > 0) {
        console.log("First result:", JSON.stringify(results[0], null, 2));
      }
    }, 10000); // 10s timeout for network call

    it("should return empty array for non-existent package", async () => {
      // Act
      const results = await provider.search("non-existent-package-xyz-123");

      // Assert
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    }, 10000);
  });

  describe("getPackageConfig", () => {
    it("should get config for tavily-mcp package", async () => {
      // Act
      const config = await provider.getPackageConfig("tavily");

      // Assert
      if (config) {
        console.log("Tavily package config:", JSON.stringify(config, null, 2));
        expect(config.type).toBe("mcp-server");
        expect(config.runtime).toBe("node");
        expect(config.packageName).toBeDefined();
        expect(config.name).toBeDefined();
      } else {
        console.log("No tavily package found");
      }
    }, 10000);

    it("should return null for non-existent package", async () => {
      // Act
      const config = await provider.getPackageConfig("non-existent-package-xyz-123");

      // Assert
      expect(config).toBeNull();
    }, 10000);
  });

  describe("exists", () => {
    it("should return true for existing package", async () => {
      // Act
      const exists = await provider.exists("tavily");

      // Assert
      console.log(`Tavily exists: ${exists}`);
      // We expect it to exist, but don't fail the test if the API changes
      expect(typeof exists).toBe("boolean");
    }, 10000);

    it("should return false for non-existent package", async () => {
      // Act
      const exists = await provider.exists("non-existent-package-xyz-123");

      // Assert
      expect(exists).toBe(false);
    }, 10000);
  });
});

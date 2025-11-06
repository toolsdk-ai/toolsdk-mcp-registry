import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MCPServerPackageConfig } from "../../package/package-types";
import { FederatedRegistryProvider } from "../providers/federated-registry-provider";
import type { LocalRegistryProvider } from "../providers/local-registry-provider";
import type { OfficialRegistryProvider } from "../providers/official-registry-provider";

describe("FederatedRegistryProvider", () => {
  let mockLocalProvider: LocalRegistryProvider;
  let mockOfficialProvider: OfficialRegistryProvider;
  let provider: FederatedRegistryProvider;

  beforeEach(() => {
    // Mock LocalRegistryProvider
    mockLocalProvider = {
      getPackageConfig: vi.fn(),
      exists: vi.fn(),
    } as unknown as LocalRegistryProvider;

    // Mock OfficialRegistryProvider
    mockOfficialProvider = {
      getPackageConfig: vi.fn(),
      exists: vi.fn(),
      search: vi.fn(),
    } as unknown as OfficialRegistryProvider;

    provider = new FederatedRegistryProvider(mockLocalProvider, mockOfficialProvider);
  });

  describe("getPackageConfig", () => {
    it("should return local config when package exists locally", async () => {
      // Arrange
      const packageName = "@modelcontextprotocol/server-filesystem";
      const mockConfig: MCPServerPackageConfig = {
        type: "mcp-server",
        runtime: "node",
        packageName,
        name: "Filesystem Server",
        description: "A server for filesystem operations",
      };

      vi.spyOn(mockLocalProvider, "getPackageConfig").mockResolvedValue(mockConfig);

      // Act
      const result = await provider.getPackageConfig(packageName);

      // Assert
      expect(result).toEqual(mockConfig);
      expect(mockLocalProvider.getPackageConfig).toHaveBeenCalledWith(packageName);
      expect(mockOfficialProvider.getPackageConfig).not.toHaveBeenCalled();
    });

    it("should query official provider when local returns null", async () => {
      // Arrange
      const packageName = "@toolsdk.ai/tavily-mcp";
      const officialConfig: MCPServerPackageConfig = {
        type: "mcp-server",
        runtime: "node",
        packageName,
        name: "Tavily MCP Server",
        description: "MCP server for Tavily search",
      };

      vi.spyOn(mockLocalProvider, "getPackageConfig").mockResolvedValue(null);
      vi.spyOn(mockOfficialProvider, "getPackageConfig").mockResolvedValue(officialConfig);

      // Act
      const result = await provider.getPackageConfig(packageName);

      // Assert
      expect(result).toEqual(officialConfig);
      expect(mockLocalProvider.getPackageConfig).toHaveBeenCalledWith(packageName);
      expect(mockOfficialProvider.getPackageConfig).toHaveBeenCalledWith(packageName);
    });

    it("should return null when both providers return null", async () => {
      // Arrange
      const packageName = "non-existent-package";

      vi.spyOn(mockLocalProvider, "getPackageConfig").mockResolvedValue(null);
      vi.spyOn(mockOfficialProvider, "getPackageConfig").mockResolvedValue(null);

      // Act
      const result = await provider.getPackageConfig(packageName);

      // Assert
      expect(result).toBeNull();
    });

    it("should return null when official provider throws error", async () => {
      // Arrange
      const packageName = "@toolsdk.ai/tavily-mcp";

      vi.spyOn(mockLocalProvider, "getPackageConfig").mockResolvedValue(null);
      vi.spyOn(mockOfficialProvider, "getPackageConfig").mockRejectedValue(
        new Error("Network error"),
      );

      // Act
      const result = await provider.getPackageConfig(packageName);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("exists", () => {
    it("should return true when package exists locally", async () => {
      // Arrange
      const packageName = "@modelcontextprotocol/server-filesystem";
      vi.spyOn(mockLocalProvider, "exists").mockResolvedValue(true);

      // Act
      const result = await provider.exists(packageName);

      // Assert
      expect(result).toBe(true);
      expect(mockLocalProvider.exists).toHaveBeenCalledWith(packageName);
      expect(mockOfficialProvider.exists).not.toHaveBeenCalled();
    });

    it("should check official provider when local returns false", async () => {
      // Arrange
      const packageName = "@toolsdk.ai/tavily-mcp";
      vi.spyOn(mockLocalProvider, "exists").mockResolvedValue(false);
      vi.spyOn(mockOfficialProvider, "exists").mockResolvedValue(true);

      // Act
      const result = await provider.exists(packageName);

      // Assert
      expect(result).toBe(true);
      expect(mockLocalProvider.exists).toHaveBeenCalledWith(packageName);
      expect(mockOfficialProvider.exists).toHaveBeenCalledWith(packageName);
    });

    it("should return false when both providers return false", async () => {
      // Arrange
      const packageName = "non-existent-package";
      vi.spyOn(mockLocalProvider, "exists").mockResolvedValue(false);
      vi.spyOn(mockOfficialProvider, "exists").mockResolvedValue(false);

      // Act
      const result = await provider.exists(packageName);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when official provider throws error", async () => {
      // Arrange
      const packageName = "@toolsdk.ai/tavily-mcp";
      vi.spyOn(mockLocalProvider, "exists").mockResolvedValue(false);
      vi.spyOn(mockOfficialProvider, "exists").mockRejectedValue(new Error("Network error"));

      // Act
      const result = await provider.exists(packageName);

      // Assert
      expect(result).toBe(false);
    });
  });
});

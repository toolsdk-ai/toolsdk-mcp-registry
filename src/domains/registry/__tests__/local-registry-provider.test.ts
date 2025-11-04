import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PackageRepository } from "../../package/package-repository";
import type { MCPServerPackageConfig } from "../../package/package-types";
import { LocalRegistryProvider } from "../providers/local-registry-provider";

describe("LocalRegistryProvider", () => {
  let mockRepository: PackageRepository;
  let provider: LocalRegistryProvider;

  beforeEach(() => {
    // Mock PackageRepository
    mockRepository = {
      getPackageConfig: vi.fn(),
      getAllPackages: vi.fn(),
      exists: vi.fn(),
    } as unknown as PackageRepository;

    provider = new LocalRegistryProvider(mockRepository);
  });

  describe("getPackageConfig", () => {
    it("should return package config when package exists", async () => {
      // Arrange
      const packageName = "@modelcontextprotocol/server-filesystem";
      const mockConfig: MCPServerPackageConfig = {
        type: "mcp-server",
        runtime: "node",
        packageName,
        name: "Filesystem Server",
        description: "A server for filesystem operations",
      };

      vi.spyOn(mockRepository, "exists").mockReturnValue(true);
      vi.spyOn(mockRepository, "getPackageConfig").mockReturnValue(mockConfig);

      // Act
      const result = await provider.getPackageConfig(packageName);

      // Assert
      expect(result).toEqual(mockConfig);
      expect(mockRepository.exists).toHaveBeenCalledWith(packageName);
      expect(mockRepository.getPackageConfig).toHaveBeenCalledWith(packageName);
    });

    it("should return null when package does not exist", async () => {
      // Arrange
      const packageName = "non-existent-package";
      vi.spyOn(mockRepository, "exists").mockReturnValue(false);

      // Act
      const result = await provider.getPackageConfig(packageName);

      // Assert
      expect(result).toBeNull();
      expect(mockRepository.exists).toHaveBeenCalledWith(packageName);
      expect(mockRepository.getPackageConfig).not.toHaveBeenCalled();
    });

    it("should return null when getPackageConfig throws error", async () => {
      // Arrange
      const packageName = "@modelcontextprotocol/server-filesystem";
      vi.spyOn(mockRepository, "exists").mockReturnValue(true);
      vi.spyOn(mockRepository, "getPackageConfig").mockImplementation(() => {
        throw new Error("File read error");
      });

      // Act
      const result = await provider.getPackageConfig(packageName);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("exists", () => {
    it("should return true when package exists", async () => {
      // Arrange
      const packageName = "@modelcontextprotocol/server-filesystem";
      vi.spyOn(mockRepository, "exists").mockReturnValue(true);

      // Act
      const result = await provider.exists(packageName);

      // Assert
      expect(result).toBe(true);
      expect(mockRepository.exists).toHaveBeenCalledWith(packageName);
    });

    it("should return false when package does not exist", async () => {
      // Arrange
      const packageName = "non-existent-package";
      vi.spyOn(mockRepository, "exists").mockReturnValue(false);

      // Act
      const result = await provider.exists(packageName);

      // Assert
      expect(result).toBe(false);
    });
  });
});

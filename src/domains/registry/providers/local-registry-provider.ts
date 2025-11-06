import type { PackageRepository } from "../../package/package-repository";
import type { MCPServerPackageConfig } from "../../package/package-types";
import type { IRegistryProvider } from "../registry-types";

/**
 * Local Registry Provider adapter
 * Wraps PackageRepository as an async interface
 */
export class LocalRegistryProvider implements IRegistryProvider {
  constructor(private readonly packageRepository: PackageRepository) {}

  /**
   * Get package configuration
   * @param packageName - Package name
   * @returns Package configuration, null if not found
   */
  async getPackageConfig(packageName: string): Promise<MCPServerPackageConfig | null> {
    if (!this.packageRepository.exists(packageName)) {
      return null;
    }

    try {
      const config = this.packageRepository.getPackageConfig(packageName);
      return config;
    } catch (error) {
      console.error(`[LocalRegistry] Failed to get package config for '${packageName}':`, error);
      return null;
    }
  }

  /**
   * Check if package exists
   * @param packageName - Package name
   * @returns Whether the package exists
   */
  async exists(packageName: string): Promise<boolean> {
    return this.packageRepository.exists(packageName);
  }
}

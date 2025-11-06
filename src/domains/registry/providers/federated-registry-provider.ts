import type { MCPServerPackageConfig } from "../../package/package-types";
import type { IRegistryProvider } from "../registry-types";
import type { LocalRegistryProvider } from "./local-registry-provider";
import type { OfficialRegistryProvider } from "./official-registry-provider";

/**
 * Federated Registry Provider
 * Implements local-first federated query strategy
 */
export class FederatedRegistryProvider implements IRegistryProvider {
  constructor(
    private readonly localProvider: LocalRegistryProvider,
    private readonly officialProvider: OfficialRegistryProvider,
  ) {}

  /**
   * Get package configuration (local first)
   * @param packageName - Package name
   * @returns Package configuration, null if not found
   */
  async getPackageConfig(packageName: string): Promise<MCPServerPackageConfig | null> {
    // 1. Query local first
    const localConfig = await this.localProvider.getPackageConfig(packageName);
    if (localConfig) {
      return localConfig;
    }

    // 2. If not found locally, query official
    try {
      const officialConfig = await this.officialProvider.getPackageConfig(packageName);
      return officialConfig;
    } catch (error) {
      console.warn(`[FederatedRegistry] Failed to fetch from official: ${error}`);
      return null; // Official API failed, return null
    }
  }

  /**
   * Check if package exists
   * @param packageName - Package name
   * @returns Whether the package exists
   */
  async exists(packageName: string): Promise<boolean> {
    // 1. Check local first
    if (await this.localProvider.exists(packageName)) {
      return true;
    }

    // 2. Then check official
    try {
      return await this.officialProvider.exists(packageName);
    } catch {
      return false;
    }
  }
}

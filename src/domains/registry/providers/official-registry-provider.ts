import type { MCPServerPackageConfig } from "../../package/package-types";
import {
  type OfficialSearchResponse,
  OfficialSearchResponseSchema,
  type OfficialServerItem,
} from "../registry-schema";
import type { IRegistryProvider } from "../registry-types";
import { transformAndFilterServers } from "../registry-utils";

/**
 * Official Registry Provider
 * Responsible for calling official API and transforming data
 */
export class OfficialRegistryProvider implements IRegistryProvider {
  private readonly baseUrl = "https://registry.modelcontextprotocol.io/v0.1";
  private readonly timeout = 5000; // 5 second timeout

  /**
   * Get package configuration
   * @param packageName - Package name (official Registry ID)
   * @returns Package configuration, null if not found
   */
  async getPackageConfig(packageName: string): Promise<MCPServerPackageConfig | null> {
    try {
      // 1. Call search API
      const searchResults = await this.search(packageName);

      // 2. Return first result (if exists)
      if (searchResults.length > 0) {
        return searchResults[0];
      }

      return null;
    } catch (error) {
      console.warn(`[OfficialRegistry] Failed to get package config for '${packageName}':`, error);
      return null;
    }
  }

  /**
   * Check if package exists
   * @param packageName - Package name
   * @returns Whether the package exists
   */
  async exists(packageName: string): Promise<boolean> {
    const config = await this.getPackageConfig(packageName);
    return config !== null;
  }

  /**
   * Search packages
   * @param query - Search keyword
   * @returns List of package configurations
   */
  async search(query: string): Promise<MCPServerPackageConfig[]> {
    try {
      const response = await this.fetchFromOfficial(`/servers?search=${encodeURIComponent(query)}`);
      const servers = response.servers.map((item: OfficialServerItem) => item.server);
      return transformAndFilterServers(servers);
    } catch (error) {
      console.error(`[OfficialRegistry] Search error for '${query}':`, error);
      return [];
    }
  }

  /**
   * Fetch data from official API
   * @param endpoint - API endpoint
   * @returns Response data
   */
  private async fetchFromOfficial(endpoint: string): Promise<OfficialSearchResponse> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return OfficialSearchResponseSchema.parse(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

import type { MCPServerPackageConfig } from "../../package/package-types";
import {
  type OfficialSearchResponse,
  OfficialSearchResponseSchema,
  type OfficialServerItem,
} from "../registry-schema";
import type { IRegistryProvider } from "../registry-types";
import { transformAndFilterServers } from "../registry-utils";

/**
 * 官方 Registry Provider
 * 负责调用官方 API 并转换数据
 */
export class OfficialRegistryProvider implements IRegistryProvider {
  private readonly baseUrl = "https://registry.modelcontextprotocol.io/v0.1";
  private readonly timeout = 5000; // 5秒超时

  /**
   * 获取包配置
   * @param packageName - 包名(官方 Registry ID)
   * @returns 包配置,如果不存在返回 null
   */
  async getPackageConfig(packageName: string): Promise<MCPServerPackageConfig | null> {
    try {
      // 1. 调用搜索 API
      const searchResults = await this.search(packageName);

      // 2. 返回第一个结果(如果存在)
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
   * 检查包是否存在
   * @param packageName - 包名
   * @returns 是否存在
   */
  async exists(packageName: string): Promise<boolean> {
    const config = await this.getPackageConfig(packageName);
    return config !== null;
  }

  /**
   * 搜索包
   * @param query - 搜索关键词
   * @returns 包配置列表
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
   * 从官方 API 获取数据
   * @param endpoint - API 端点
   * @returns 响应数据
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

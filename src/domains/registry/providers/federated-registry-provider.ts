import type { MCPServerPackageConfig } from "../../package/package-types";
import type { IRegistryProvider } from "../registry-types";
import type { LocalRegistryProvider } from "./local-registry-provider";
import type { OfficialRegistryProvider } from "./official-registry-provider";

/**
 * 联邦 Registry Provider
 * 实现本地优先的联邦查询策略
 */
export class FederatedRegistryProvider implements IRegistryProvider {
  constructor(
    private readonly localProvider: LocalRegistryProvider,
    private readonly officialProvider: OfficialRegistryProvider,
  ) {}

  /**
   * 获取包配置(本地优先)
   * @param packageName - 包名
   * @returns 包配置,如果不存在返回 null
   */
  async getPackageConfig(packageName: string): Promise<MCPServerPackageConfig | null> {
    // 1. 优先查询本地
    const localConfig = await this.localProvider.getPackageConfig(packageName);
    if (localConfig) {
      return localConfig;
    }

    // 2. 本地不存在,查询官方
    try {
      const officialConfig = await this.officialProvider.getPackageConfig(packageName);
      return officialConfig;
    } catch (error) {
      console.warn(`[FederatedRegistry] Failed to fetch from official: ${error}`);
      return null; // 官方 API 失败,返回 null
    }
  }

  /**
   * 检查包是否存在
   * @param packageName - 包名
   * @returns 是否存在
   */
  async exists(packageName: string): Promise<boolean> {
    // 1. 先查本地
    if (await this.localProvider.exists(packageName)) {
      return true;
    }

    // 2. 再查官方
    try {
      return await this.officialProvider.exists(packageName);
    } catch {
      return false;
    }
  }
}

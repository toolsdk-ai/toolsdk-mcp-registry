import type { PackageRepository } from "../../package/package-repository";
import type { MCPServerPackageConfig } from "../../package/package-types";
import type { IRegistryProvider } from "../registry-types";

/**
 * 本地 Registry Provider 适配器
 * 将 PackageRepository 包装为异步接口
 */
export class LocalRegistryProvider implements IRegistryProvider {
  constructor(private readonly packageRepository: PackageRepository) {}

  /**
   * 获取包配置
   * @param packageName - 包名
   * @returns 包配置,如果不存在返回 null
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
   * 检查包是否存在
   * @param packageName - 包名
   * @returns 是否存在
   */
  async exists(packageName: string): Promise<boolean> {
    return this.packageRepository.exists(packageName);
  }
}

import type { PackageRepository } from "../package/package-repository";
import { FederatedRegistryProvider } from "./providers/federated-registry-provider";
import { LocalRegistryProvider } from "./providers/local-registry-provider";
import { OfficialRegistryProvider } from "./providers/official-registry-provider";
import type { IRegistryProvider } from "./registry-types";

/**
 * Registry Provider 类型
 */
export type RegistryProviderType = "LOCAL" | "OFFICIAL" | "FEDERATED";

/**
 * Registry Provider 实例容器
 */
let localProvider: LocalRegistryProvider | null = null;
let officialProvider: OfficialRegistryProvider | null = null;
let federatedProvider: FederatedRegistryProvider | null = null;
let initialized = false;

/**
 * 初始化 Registry Factory
 * @param packageRepository - 本地包仓库
 */
export function initRegistryFactory(packageRepository: PackageRepository): void {
  if (initialized) {
    return;
  }

  localProvider = new LocalRegistryProvider(packageRepository);
  officialProvider = new OfficialRegistryProvider();
  federatedProvider = new FederatedRegistryProvider(localProvider, officialProvider);
  initialized = true;
}

/**
 * 获取 Registry Provider
 * @param type - Provider 类型,默认为 FEDERATED
 * @returns Registry Provider 实例
 */
export function getRegistryProvider(type: RegistryProviderType = "FEDERATED"): IRegistryProvider {
  if (!initialized || !localProvider || !officialProvider || !federatedProvider) {
    throw new Error("RegistryFactory not initialized. Call initRegistryFactory() first.");
  }

  switch (type) {
    case "LOCAL":
      return localProvider;
    case "OFFICIAL":
      return officialProvider;
    case "FEDERATED":
      return federatedProvider;
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * 重置工厂(主要用于测试)
 */
export function resetRegistryFactory(): void {
  localProvider = null;
  officialProvider = null;
  federatedProvider = null;
  initialized = false;
}

import type { PackageRepository } from "../package/package-repository";
import { FederatedRegistryProvider } from "./providers/federated-registry-provider";
import { LocalRegistryProvider } from "./providers/local-registry-provider";
import { OfficialRegistryProvider } from "./providers/official-registry-provider";
import type { IRegistryProvider } from "./registry-types";

/**
 * Registry Provider type
 */
export type RegistryProviderType = "LOCAL" | "OFFICIAL" | "FEDERATED";

/**
 * Registry Provider instance container
 */
let localProvider: LocalRegistryProvider | null = null;
let officialProvider: OfficialRegistryProvider | null = null;
let federatedProvider: FederatedRegistryProvider | null = null;
let initialized = false;

/**
 * Initialize Registry Factory
 * @param packageRepository - Local package repository
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
 * Get Registry Provider
 * @param type - Provider type, defaults to FEDERATED
 * @returns Registry Provider instance
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
 * Reset factory (mainly used for testing)
 */
export function resetRegistryFactory(): void {
  localProvider = null;
  officialProvider = null;
  federatedProvider = null;
  initialized = false;
}

/**
 * Registry data source type
 */
export type RegistrySource = "LOCAL" | "OFFICIAL";

/**
 * Registry Provider abstract interface
 * Define unified Registry query interface
 */
export interface IRegistryProvider {
  /**
   * Get package configuration
   * @param packageName - Package name
   * @returns Package configuration, null if not found
   */
  getPackageConfig(packageName: string): Promise<unknown | null>;

  /**
   * Check if package exists
   * @param packageName - Package name
   * @returns Whether the package exists
   */
  exists(packageName: string): Promise<boolean>;
}

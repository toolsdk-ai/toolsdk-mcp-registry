import type { MCPServerPackageConfig } from "../package/package-types";
import type { OfficialServer } from "./registry-schema";

/**
 * Transform a single server configuration
 * @param server - Official server configuration
 * @returns Local format configuration, null if not meeting conditions
 */
export function transformServer(server: OfficialServer): MCPServerPackageConfig | null {
  try {
    // 1. Filter npm + stdio packages
    const npmStdioPackages = server.packages.filter(
      (pkg) => pkg.registryType === "npm" && pkg.transport.type === "stdio",
    );

    if (npmStdioPackages.length === 0) {
      return null; // Does not meet conditions, skip
    }

    // 2. Take the first matching package
    const pkg = npmStdioPackages[0];

    // 3. Convert to local format
    const config: MCPServerPackageConfig = {
      type: "mcp-server",
      runtime: "node", // npm packages default to node
      packageName: pkg.identifier, // Use npm package name as packageName
      packageVersion: pkg.version,
      name: server.title || server.name,
      description: server.description,
      url: server.repository?.url,
      // Transform environment variables
      env: pkg.environmentVariables?.reduce(
        (acc, env) => {
          acc[env.name] = {
            description: env.description || "",
            required: env.isRequired || false,
          };
          return acc;
        },
        {} as Record<string, { description: string; required: boolean }>,
      ),
    };

    return config;
  } catch (error) {
    console.error(`[RegistryDataTransformer] Transform error for ${server.name}:`, error);
    return null;
  }
}

/**
 * Batch transform and filter server configurations
 * @param servers - Array of official server configurations
 * @returns Array of local format configurations
 */
export function transformAndFilterServers(servers: OfficialServer[]): MCPServerPackageConfig[] {
  return servers
    .map((server) => transformServer(server))
    .filter((config): config is MCPServerPackageConfig => config !== null);
}

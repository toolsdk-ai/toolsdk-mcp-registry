import type { MCPServerPackageConfig } from "../package/package-types";
import type { OfficialServer } from "./registry-schema";

/**
 * 转换单个服务器配置
 * @param server - 官方服务器配置
 * @returns 本地格式配置,如果不符合条件返回 null
 */
export function transformServer(server: OfficialServer): MCPServerPackageConfig | null {
  try {
    // 1. 过滤出 npm + stdio 包
    const npmStdioPackages = server.packages.filter(
      (pkg) => pkg.registryType === "npm" && pkg.transport.type === "stdio",
    );

    if (npmStdioPackages.length === 0) {
      return null; // 不符合条件，跳过
    }

    // 2. 取第一个符合条件的包
    const pkg = npmStdioPackages[0];

    // 3. 转换为本地格式
    const config: MCPServerPackageConfig = {
      type: "mcp-server",
      runtime: "node", // npm 包默认为 node
      packageName: pkg.identifier, // 使用 npm 包名作为 packageName
      packageVersion: pkg.version,
      name: server.title || server.name,
      description: server.description,
      url: server.repository?.url,
      // 转换环境变量
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
 * 批量转换并过滤服务器配置
 * @param servers - 官方服务器配置数组
 * @returns 本地格式配置数组
 */
export function transformAndFilterServers(servers: OfficialServer[]): MCPServerPackageConfig[] {
  return servers
    .map((server) => transformServer(server))
    .filter((config): config is MCPServerPackageConfig => config !== null);
}

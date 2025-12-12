import type { MCPServerPackageConfig } from "../../../src/shared/scripts-helpers";
import type { RegistryKeyValueInput, RegistryServer } from "../types";

function collectEnvironmentVariables(
  server: RegistryServer,
): Record<string, { description: string; required: boolean }> {
  const env: Record<string, { description: string; required: boolean }> = {};

  const addEnv = (envList?: RegistryKeyValueInput[]) => {
    if (!envList) return;
    for (const envVar of envList) {
      if (!envVar || !envVar.name) continue;
      env[envVar.name] = {
        description: envVar.description || "",
        required: !!envVar.isRequired,
      };
    }
  };

  if (server.packages) {
    for (const pkg of server.packages) {
      addEnv(pkg.environmentVariables);
    }
  }
  return env;
}

export async function processStdioServer(
  server: RegistryServer,
): Promise<MCPServerPackageConfig | null> {
  // Check if packages exist
  if (!server.packages || server.packages.length === 0) {
    // console.log(`[Stdio] Skipping ${server.name}: No packages`);
    return null;
  }

  // We only take the first package for now
  const pkg = server.packages[0];

  // Check transport type. If it's not stdio, we skip it here.
  if (pkg.transport && pkg.transport.type !== "stdio") {
    console.log(`[Stdio] Skipping ${server.name}: Transport is ${pkg.transport.type}`);
    return null;
  }

  let runtime: MCPServerPackageConfig["runtime"];
  let packageName: string;

  if (pkg.registryType === "npm") {
    runtime = "node";
    packageName = pkg.identifier;
    // Clean up package name
    if (packageName.includes("@") && !packageName.startsWith("@")) {
      packageName = packageName.split("@")[0];
    } else if (packageName.startsWith("@") && packageName.slice(1).includes("@")) {
      const parts = packageName.split("@");
      packageName = `@${parts[1]}`;
    }
  } else if (pkg.registryType === "pypi") {
    runtime = "python";
    packageName = pkg.identifier;
    if (packageName.includes(":")) {
      packageName = packageName.split(":")[0];
    }
    if (packageName.includes("==")) {
      packageName = packageName.split("==")[0];
    }
  } else {
    console.log(`[Stdio] Skipping ${server.name}: Unsupported registry type ${pkg.registryType}`);
    return null;
  }

  const env = collectEnvironmentVariables(server);

  // Map packageArguments to binArgs
  // Note: RegistryArgument structure is complex (positional/named).
  // For simplicity, we might just extract values if they are positional fixed values?
  // Or if they are named arguments like --port 8080.
  // Since MCPServerPackageConfig.binArgs is string[], we need to flatten them.

  let binArgs: string[] | undefined;
  if (pkg.packageArguments && pkg.packageArguments.length > 0) {
    binArgs = [];
    for (const arg of pkg.packageArguments) {
      if (arg.type === "named" && arg.name) {
        binArgs.push(arg.name);
        if (arg.value) {
          binArgs.push(arg.value);
        }
      } else if (arg.type === "positional" && arg.value) {
        binArgs.push(arg.value);
      }
    }
  }

  return {
    type: "mcp-server",
    packageName: packageName,
    description: server.description || "",
    url: server.repository?.url || "",
    runtime: runtime,
    license: "unknown",
    env: Object.keys(env).length > 0 ? env : undefined,
    binArgs: binArgs && binArgs.length > 0 ? binArgs : undefined,
  };
}

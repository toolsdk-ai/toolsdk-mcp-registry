import type { MCPServerPackageConfig } from "../../../src/shared/scripts-helpers";
import type { OAuthMetadata, RegistryKeyValueInput, RegistryServer } from "../types";

/**
 * Parse WWW-Authenticate header to extract resource metadata URL
 */
function parseWWWAuthenticate(header: string | null): OAuthMetadata {
  const result: OAuthMetadata = {};
  if (!header) return result;

  const realmMatch = header.match(/realm="([^"]+)"/);
  if (realmMatch) result.realm = realmMatch[1];

  const metadataMatch = header.match(/resource_metadata="([^"]+)"/);
  if (metadataMatch) result.resourceMetadataUrl = metadataMatch[1];

  const scopeMatch = header.match(/scope="([^"]+)"/);
  if (scopeMatch) result.scope = scopeMatch[1];

  return result;
}

/**
 * Discover protected resource metadata from MCP server
 */
async function discoverProtectedResourceMetadata(
  mcpServerUrl: string,
): Promise<OAuthMetadata | null> {
  try {
    const serverUrl = new URL(mcpServerUrl);
    const timeout = 10000; // 10s timeout

    // 1. Try POST with empty body to get 401 and WWW-Authenticate header
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const probeResponse = await fetch(mcpServerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      clearTimeout(id);

      if (probeResponse.status === 401) {
        const authHeader = probeResponse.headers.get("www-authenticate");
        if (authHeader) {
          const parsed = parseWWWAuthenticate(authHeader);
          if (parsed.resourceMetadataUrl) {
            const metaController = new AbortController();
            const metaId = setTimeout(() => metaController.abort(), timeout);
            try {
              const metadataResponse = await fetch(parsed.resourceMetadataUrl, {
                signal: metaController.signal,
              });
              clearTimeout(metaId);
              if (metadataResponse.ok) {
                return await metadataResponse.json();
              }
            } catch (_e) {
              clearTimeout(metaId);
              // ignore
            }
          }
        }
      }
    } catch (_e) {
      clearTimeout(id);
      // ignore probe failure
    }

    // 2. Fallback: Try well-known URIs
    const wellKnownPaths = [
      `${serverUrl.origin}/.well-known/oauth-protected-resource${serverUrl.pathname}`,
      `${serverUrl.origin}/.well-known/oauth-protected-resource`,
    ];

    for (const p of wellKnownPaths) {
      try {
        const wkController = new AbortController();
        const wkId = setTimeout(() => wkController.abort(), timeout);
        const response = await fetch(p, { signal: wkController.signal });
        clearTimeout(wkId);
        if (response.ok) {
          return await response.json();
        }
      } catch {
        // Ignore errors and try next path
      }
    }

    return null;
  } catch (error) {
    console.log(
      `  OAuth Discovery failed for ${mcpServerUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function determinePackageInfo(server: RegistryServer): { runtime: string; packageName: string } {
  let runtime = "node";
  let packageName: string | null = null;

  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];
    // Note: RegistryPackage interface uses 'registryType' as string, but we check for specific values
    if (pkg.registryType === "pypi") {
      runtime = "python";
      if (pkg.identifier) {
        packageName = pkg.identifier.split(":")[0];
      }
    } else if (pkg.registryType === "npm") {
      runtime = "node";
      if (pkg.identifier) {
        packageName =
          pkg.identifier.split("@").slice(0, -1).join("@") || pkg.identifier.split("@")[1];
      }
    }
  }

  if (!packageName && server.name) {
    const namePart = server.name
      .toLowerCase()
      .replace(/[/.\s]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    packageName = `@toolsdk-remote/${namePart}`;
  }

  return {
    runtime,
    packageName: packageName || "unknown",
  };
}

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

export async function processRemoteServer(
  server: RegistryServer,
): Promise<MCPServerPackageConfig | null> {
  // Check if remotes exist
  if (!server.remotes || server.remotes.length === 0) {
    return null;
  }

  // Filter for streamable-http and valid URLs
  const validRemotes = server.remotes.filter((remote) => {
    if (remote.type !== "streamable-http" || !remote.url || remote.url.startsWith("http://")) {
      return false;
    }
    const url = remote.url.toLowerCase();
    return url.endsWith("/mcp") || url.endsWith("/mcp/");
  });

  if (validRemotes.length === 0) {
    return null;
  }

  const { runtime, packageName } = determinePackageInfo(server);
  const env = collectEnvironmentVariables(server);
  const remotes: NonNullable<MCPServerPackageConfig["remotes"]> = [];

  for (const remote of validRemotes) {
    const remoteConfig: NonNullable<MCPServerPackageConfig["remotes"]>[0] = {
      type: "streamable-http",
      url: remote.url,
    };

    console.log(`  Checking OAuth for ${remote.url}...`);
    const metadata = await discoverProtectedResourceMetadata(remote.url);
    if (metadata) {
      console.log(`  ✓ OAuth configuration found`);
      remoteConfig.auth = { type: "oauth2" };
      if (metadata.scopes && metadata.scopes.length > 0) {
        remoteConfig.auth.scopes = metadata.scopes;
      }
    }

    remotes.push(remoteConfig);
  }

  return {
    type: "mcp-server",
    packageName: packageName,
    description: server.description || "",
    url: server.repository?.url || "",
    runtime: runtime as MCPServerPackageConfig["runtime"],
    license: "unknown",
    env: Object.keys(env).length > 0 ? env : undefined,
    remotes: remotes,
  };
}

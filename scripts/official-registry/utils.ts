import type { RegistryKeyValueInput, RegistryServer } from "./types";

export function collectEnvironmentVariables(
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

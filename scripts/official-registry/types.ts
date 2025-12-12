import type { MCPServerPackageConfig } from "../../src/shared/scripts-helpers";

export interface RegistryResponse {
  servers: RegistryServerItem[];
  metadata?: {
    nextCursor?: string;
  };
}

export interface RegistryServerItem {
  server: RegistryServer;
  _meta?: any;
}

export interface RegistryServer {
  name: string;
  description: string;
  version: string;
  repository?: RegistryRepository;
  remotes?: RegistryRemote[];
  packages?: RegistryPackage[];
  license?: string;
}

export interface RegistryRepository {
  url: string;
  source: string;
}

export interface RegistryRemote {
  type: "streamable-http" | "sse";
  url: string;
  headers?: RegistryKeyValueInput[];
}

export interface RegistryPackage {
  registryType: string;
  identifier: string;
  environmentVariables?: RegistryKeyValueInput[];
  packageArguments?: RegistryArgument[];
  transport?: {
    type: "stdio" | "streamable-http" | "sse";
  };
}

export interface RegistryArgument {
  type: "positional" | "named";
  name?: string;
  value?: string;
  valueHint?: string;
}

export interface RegistryKeyValueInput {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  value?: string;
}

export interface OAuthMetadata {
  realm?: string;
  resourceMetadataUrl?: string;
  scope?: string;
  scopes?: string[];
}

export interface ProcessorResult {
  path: string;
  config: MCPServerPackageConfig;
}

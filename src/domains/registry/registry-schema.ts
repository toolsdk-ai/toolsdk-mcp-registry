import { z } from "zod";

/**
 * Official Registry API data structure schema
 * Based on https://registry.modelcontextprotocol.io/v0.1
 */

export const OfficialRepositorySchema = z.object({
  url: z.string().optional(),
});

export const OfficialTransportSchema = z.object({
  type: z.enum(["stdio", "sse"]),
});

export const OfficialEnvironmentVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  isRequired: z.boolean().optional(),
  isSecret: z.boolean().optional(),
});

export const OfficialPackageSchema = z.object({
  registryType: z.enum(["npm", "docker", "pypi"]),
  identifier: z.string(),
  version: z.string().optional(),
  transport: OfficialTransportSchema,
  environmentVariables: z.array(OfficialEnvironmentVariableSchema).optional(),
});

export const OfficialServerSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  repository: OfficialRepositorySchema.optional(),
  version: z.string().optional(),
  packages: z.array(OfficialPackageSchema),
});

export const OfficialServerItemSchema = z.object({
  server: OfficialServerSchema,
});

export const OfficialSearchResponseSchema = z.object({
  servers: z.array(OfficialServerItemSchema),
  nextCursor: z.string().optional(),
});

// Type exports
export type OfficialRepository = z.infer<typeof OfficialRepositorySchema>;
export type OfficialTransport = z.infer<typeof OfficialTransportSchema>;
export type OfficialEnvironmentVariable = z.infer<typeof OfficialEnvironmentVariableSchema>;
export type OfficialPackage = z.infer<typeof OfficialPackageSchema>;
export type OfficialServer = z.infer<typeof OfficialServerSchema>;
export type OfficialServerItem = z.infer<typeof OfficialServerItemSchema>;
export type OfficialSearchResponse = z.infer<typeof OfficialSearchResponseSchema>;

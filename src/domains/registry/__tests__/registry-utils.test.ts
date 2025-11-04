import { describe, expect, it } from "vitest";
import type { OfficialServer } from "../registry-schema";
import { transformAndFilterServers, transformServer } from "../registry-utils";

describe("registry-utils", () => {
  describe("transformServer", () => {
    it("should transform npm+stdio package correctly", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.Seey215/tavily-mcp",
        title: "Tavily MCP Server",
        description: "MCP server for advanced web search using Tavily API.",
        repository: {
          url: "https://github.com/Seey215/tavily-mcp",
        },
        version: "0.2.9",
        packages: [
          {
            registryType: "npm",
            identifier: "@toolsdk.ai/tavily-mcp",
            version: "0.2.9",
            transport: {
              type: "stdio",
            },
            environmentVariables: [
              {
                name: "TAVILY_API_KEY",
                description: "Your TAVILY_API_KEY",
                isRequired: true,
                isSecret: true,
              },
            ],
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        type: "mcp-server",
        runtime: "node",
        packageName: "@toolsdk.ai/tavily-mcp",
        packageVersion: "0.2.9",
        name: "Tavily MCP Server",
        description: "MCP server for advanced web search using Tavily API.",
        url: "https://github.com/Seey215/tavily-mcp",
        env: {
          TAVILY_API_KEY: {
            description: "Your TAVILY_API_KEY",
            required: true,
          },
        },
      });
    });

    it("should use title as name if available", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.test/package",
        title: "Test Package Title",
        packages: [
          {
            registryType: "npm",
            identifier: "@test/package",
            transport: {
              type: "stdio",
            },
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result?.name).toBe("Test Package Title");
    });

    it("should use name if title is not available", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.test/package",
        packages: [
          {
            registryType: "npm",
            identifier: "@test/package",
            transport: {
              type: "stdio",
            },
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result?.name).toBe("io.github.test/package");
    });

    it("should return null for non-npm packages", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.test/docker-package",
        packages: [
          {
            registryType: "docker",
            identifier: "test/package",
            transport: {
              type: "stdio",
            },
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result).toBeNull();
    });

    it("should return null for non-stdio transport", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.test/sse-package",
        packages: [
          {
            registryType: "npm",
            identifier: "@test/package",
            transport: {
              type: "sse",
            },
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result).toBeNull();
    });

    it("should select first npm+stdio package when multiple packages exist", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.test/multi-package",
        packages: [
          {
            registryType: "docker",
            identifier: "test/docker",
            transport: {
              type: "stdio",
            },
          },
          {
            registryType: "npm",
            identifier: "@test/first-npm",
            transport: {
              type: "stdio",
            },
          },
          {
            registryType: "npm",
            identifier: "@test/second-npm",
            transport: {
              type: "stdio",
            },
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.packageName).toBe("@test/first-npm");
    });

    it("should handle empty environment variables", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.test/no-env",
        packages: [
          {
            registryType: "npm",
            identifier: "@test/package",
            transport: {
              type: "stdio",
            },
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.env).toBeUndefined();
    });

    it("should handle optional environment variable fields", () => {
      // Arrange
      const officialServer: OfficialServer = {
        name: "io.github.test/package",
        packages: [
          {
            registryType: "npm",
            identifier: "@test/package",
            transport: {
              type: "stdio",
            },
            environmentVariables: [
              {
                name: "API_KEY",
                // description and isRequired are optional
              },
            ],
          },
        ],
      };

      // Act
      const result = transformServer(officialServer);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.env).toEqual({
        API_KEY: {
          description: "",
          required: false,
        },
      });
    });
  });

  describe("transformAndFilterServers", () => {
    it("should transform and filter multiple servers", () => {
      // Arrange
      const servers: OfficialServer[] = [
        {
          name: "io.github.test/npm-stdio",
          packages: [
            {
              registryType: "npm",
              identifier: "@test/npm-stdio",
              transport: { type: "stdio" },
            },
          ],
        },
        {
          name: "io.github.test/docker",
          packages: [
            {
              registryType: "docker",
              identifier: "test/docker",
              transport: { type: "stdio" },
            },
          ],
        },
        {
          name: "io.github.test/npm-sse",
          packages: [
            {
              registryType: "npm",
              identifier: "@test/npm-sse",
              transport: { type: "sse" },
            },
          ],
        },
        {
          name: "io.github.test/another-npm-stdio",
          packages: [
            {
              registryType: "npm",
              identifier: "@test/another-npm-stdio",
              transport: { type: "stdio" },
            },
          ],
        },
      ];

      // Act
      const result = transformAndFilterServers(servers);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].packageName).toBe("@test/npm-stdio");
      expect(result[1].packageName).toBe("@test/another-npm-stdio");
    });

    it("should return empty array when no servers match criteria", () => {
      // Arrange
      const servers: OfficialServer[] = [
        {
          name: "io.github.test/docker",
          packages: [
            {
              registryType: "docker",
              identifier: "test/docker",
              transport: { type: "stdio" },
            },
          ],
        },
        {
          name: "io.github.test/npm-sse",
          packages: [
            {
              registryType: "npm",
              identifier: "@test/npm-sse",
              transport: { type: "sse" },
            },
          ],
        },
      ];

      // Act
      const result = transformAndFilterServers(servers);

      // Assert
      expect(result).toHaveLength(0);
    });

    it("should handle empty array", () => {
      // Arrange
      const servers: OfficialServer[] = [];

      // Act
      const result = transformAndFilterServers(servers);

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});

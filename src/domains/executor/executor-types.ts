import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { MCPSandboxProvider } from "../sandbox/sandbox-types";

export interface ToolExecuteRequest {
  packageName: string;
  toolKey: string;
  inputData: Record<string, unknown>;
  envs?: Record<string, string>;
  sandboxProvider?: MCPSandboxProvider;
  /** OAuth access token for MCP servers that require OAuth authentication */
  accessToken?: string;
}

/**
 * Tool Executor Interface
 * Unified abstraction for local and sandbox execution
 */
export interface ToolExecutor {
  executeTool(request: ToolExecuteRequest): Promise<unknown>;
  listTools(packageName: string, accessToken?: string): Promise<Tool[]>;
}

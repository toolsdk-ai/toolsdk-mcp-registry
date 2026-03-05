/**
 * Validate a single MCP Server package JSON file.
 *
 * Usage:
 *   bun scripts/validate-package.ts <path-to-json>
 *
 * Examples:
 *   bun scripts/validate-package.ts packages/aggregators/1mcp-agent.json
 *   bun scripts/validate-package.ts packages/finance-fintech/defi-mcp.json
 */

import fs from "node:fs";
import {
  getMcpClient,
  MCPServerPackageConfigSchema,
  withTimeout,
} from "../src/shared/scripts-helpers";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: bun scripts/validate-package.ts <path-to-json>");
  console.error("Example: bun scripts/validate-package.ts packages/aggregators/1mcp-agent.json");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

async function main() {
  console.log(`\n🔍 Validating: ${filePath}\n`);

  // Step 1: Parse and schema-validate the JSON
  let config: ReturnType<typeof MCPServerPackageConfigSchema.parse>;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    config = MCPServerPackageConfigSchema.parse(raw);
    console.log("✅ Schema validation passed");
  } catch (e) {
    console.error("❌ Schema validation failed:");
    console.error((e as Error).message);
    process.exit(1);
  }

  console.log(`   runtime     : ${config.runtime}`);
  console.log(`   packageName : ${config.packageName}`);
  if (config.packageVersion) console.log(`   version     : ${config.packageVersion}`);
  if (config.remotes?.length) {
    console.log(`   remotes     : ${config.remotes.map((r) => r.url).join(", ")}`);
  }

  // Step 2: Try to connect and list tools
  const hasRemotes = config.remotes && config.remotes.length > 0;
  const canConnect = config.runtime === "node" || config.runtime === "docker" || hasRemotes;

  if (!canConnect) {
    console.log(`\n⚠️  Runtime "${config.runtime}" is not auto-connectable (python/java/go).`);
    console.log("   Schema is valid. Connection test skipped.");
    process.exit(0);
  }

  // For node runtime, check node_modules first
  if (config.runtime === "node" && !hasRemotes) {
    const pkgJsonPath = `node_modules/${config.packageName}/package.json`;
    if (!fs.existsSync(pkgJsonPath)) {
      console.log(`\n⚠️  Package not installed: ${config.packageName}`);
      console.log(`   Run: pnpm add ${config.packageName}`);
      console.log("   Schema is valid. Connection test skipped.");
      process.exit(0);
    }
  }

  const mockEnv: Record<string, string> = {};
  for (const key of Object.keys(config.env || {})) {
    mockEnv[key] = "MOCK";
  }

  console.log("\n🔌 Connecting to MCP server...");
  try {
    const mcpClient = await withTimeout(8000, getMcpClient(config, mockEnv));
    const toolsResult = await mcpClient.client.listTools();
    await mcpClient.closeConnection();

    if (toolsResult.tools.length === 0) {
      console.error("\n❌ Connection succeeded but no tools returned — validated: false");
      process.exit(1);
    }

    console.log(`\n✅ validated: true — ${toolsResult.tools.length} tool(s) found:`);
    for (const tool of toolsResult.tools) {
      console.log(
        `   • ${tool.name}${tool.description ? ` — ${tool.description.slice(0, 80)}` : ""}`,
      );
    }
    process.exit(0);
  } catch (e) {
    console.error("\n❌ Connection failed — validated: false");
    console.error("  ", (e as Error).message);
    process.exit(1);
  }
}

await main();

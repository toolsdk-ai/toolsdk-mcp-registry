/**
 * Validate a single MCP Server package JSON file.
 *
 * Usage:
 *   bun scripts/validate-package.ts <path-to-json>
 *   make validate <path-to-json>
 *
 * Examples:
 *   bun scripts/validate-package.ts packages/aggregators/1mcp-agent.json
 *   make validate packages/finance-fintech/defi-mcp.json
 *
 * What it checks:
 *   1. File exists and is valid JSON
 *   2. JSON structure matches the Zod schema (MCPServerPackageConfigSchema)
 *   3. (Optional) Connects to the MCP server and lists tools
 *
 * Flags:
 *   --schema-only   Skip the connection test, only validate JSON schema
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  getMcpClient,
  MCPServerPackageConfigSchema,
  withTimeout,
} from "../src/shared/scripts-helpers";

// ── CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const schemaOnly = args.includes("--schema-only");
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error("Usage: bun scripts/validate-package.ts <path-to-json> [--schema-only]");
  console.error("");
  console.error("Examples:");
  console.error("  bun scripts/validate-package.ts packages/aggregators/1mcp-agent.json");
  console.error("  make validate packages/finance-fintech/defi-mcp.json");
  console.error("");
  console.error("Flags:");
  console.error("  --schema-only   Only validate JSON schema, skip connection test");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────
function fail(message: string, detail?: string): never {
  console.error(`\n❌ ${message}`);
  if (detail) console.error(`   ${detail}`);
  process.exit(1);
}

function info(label: string, value: string) {
  console.log(`   ${label.padEnd(14)}: ${value}`);
}

/**
 * Format Zod errors into human-readable lines.
 */
function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    switch (issue.code) {
      case "invalid_type":
        return `  • "${path}": expected ${issue.expected}, got ${issue.received}`;
      case "invalid_enum_value":
        return `  • "${path}": must be one of [${(issue.options as string[]).join(", ")}], got "${issue.received}"`;
      case "unrecognized_keys":
        return `  • "${path}": unrecognized key(s): ${issue.keys.join(", ")}`;
      case "invalid_string":
        if (issue.validation === "url") {
          return `  • "${path}": must be a valid URL`;
        }
        return `  • "${path}": invalid string (${issue.validation})`;
      default:
        return `  • "${path}": ${issue.message}`;
    }
  });
}

// ── Step 0: File existence ────────────────────────────────────────────
console.log(`\n🔍 Validating: ${filePath}\n`);

if (!fs.existsSync(filePath)) {
  fail("File not found", filePath);
}

const ext = path.extname(filePath).toLowerCase();
if (ext !== ".json") {
  fail(`Expected a .json file, got "${ext}"`, filePath);
}

// ── Step 1: JSON parse ────────────────────────────────────────────────
let raw: unknown;
try {
  const content = fs.readFileSync(filePath, "utf-8");

  // Check for empty file
  if (content.trim().length === 0) {
    fail("File is empty");
  }

  raw = JSON.parse(content);
} catch (e) {
  if (e instanceof SyntaxError) {
    fail("Invalid JSON syntax", e.message);
  }
  fail("Failed to read file", (e as Error).message);
}

// Basic structural check before Zod
if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
  fail("JSON root must be an object, got " + (Array.isArray(raw) ? "array" : typeof raw));
}

console.log("✅ Valid JSON");

// ── Step 2: Zod schema validation ─────────────────────────────────────
type MCPConfig = z.infer<typeof MCPServerPackageConfigSchema>;
let config: MCPConfig;

try {
  config = MCPServerPackageConfigSchema.parse(raw);
  console.log("✅ Schema validation passed");
} catch (e) {
  if (e instanceof z.ZodError) {
    console.error("\n❌ Schema validation failed:\n");
    const lines = formatZodErrors(e);
    for (const line of lines) {
      console.error(line);
    }
    console.error(
      "\n💡 See the full schema: src/shared/schemas/common-schema.ts (MCPServerPackageConfigSchema)",
    );
    process.exit(1);
  }
  fail("Schema validation failed", (e as Error).message);
}

// ── Step 3: Print summary ─────────────────────────────────────────────
console.log("");
info("type", config.type);
info("runtime", config.runtime);
info("packageName", config.packageName);
if (config.packageVersion) info("version", config.packageVersion);
if (config.name) info("name", config.name);
if (config.key) info("key", config.key);
if (config.license) info("license", config.license);
if (config.bin) info("bin", config.bin);
if (config.binArgs?.length) info("binArgs", config.binArgs.join(" "));
if (config.url) info("url", config.url);
if (config.author) info("author", config.author);

const envKeys = Object.keys(config.env || {});
if (envKeys.length > 0) {
  const required = envKeys.filter((k) => config.env?.[k]?.required);
  info("env", `${envKeys.length} var(s), ${required.length} required`);
  for (const key of envKeys) {
    const envDef = config.env?.[key];
    console.log(
      `     ${envDef?.required ? "🔑" : "  "} ${key} — ${envDef?.description || "(no description)"}`,
    );
  }
}

if (config.remotes?.length) {
  info("remotes", `${config.remotes.length} endpoint(s)`);
  for (const remote of config.remotes) {
    console.log(`      → ${remote.url}${remote.auth ? ` (auth: ${remote.auth.type})` : ""}`);
  }
}

// ── Step 4: Connection test (optional) ────────────────────────────────
if (schemaOnly) {
  console.log("\n✅ Schema-only validation complete (connection test skipped)");
  process.exit(0);
}

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

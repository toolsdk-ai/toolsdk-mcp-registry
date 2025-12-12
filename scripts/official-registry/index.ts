import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MCPServerPackageConfig } from "../../src/shared/scripts-helpers";
import { fetchOfficialServers } from "./fetcher";
import { processRemoteServer } from "./processors/remote";
import { processStdioServer } from "./processors/stdio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, "output");

// Configuration
const MAX_SERVERS_TO_FETCH = process.env.MAX_SERVERS ? parseInt(process.env.MAX_SERVERS, 10) : 10;

async function ensureOutputDir() {
  try {
    await fs.access(OUTPUT_DIR);
  } catch {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  }
}

async function saveServerToFile(config: MCPServerPackageConfig): Promise<string> {
  const runtime = config.runtime || "unknown";
  const runtimeDir = path.join(OUTPUT_DIR, runtime);

  // Ensure runtime dir exists
  try {
    await fs.access(runtimeDir);
  } catch {
    await fs.mkdir(runtimeDir, { recursive: true });
  }

  const sanitizedName = config.packageName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");

  let fileName = `${sanitizedName}.json`;
  let outPath = path.join(runtimeDir, fileName);
  let idx = 1;

  // Check for collision
  while (true) {
    try {
      await fs.access(outPath);
      // File exists, try next index
      fileName = `${sanitizedName}-${idx}.json`;
      outPath = path.join(runtimeDir, fileName);
      idx++;
    } catch {
      // File does not exist, use this path
      break;
    }
  }

  await fs.writeFile(outPath, JSON.stringify(config, null, 2), "utf-8");
  return outPath;
}

async function main() {
  await ensureOutputDir();

  console.log(`Fetching servers from official registry (limit: ${MAX_SERVERS_TO_FETCH})...`);
  const servers = await fetchOfficialServers(MAX_SERVERS_TO_FETCH);
  console.log(`Fetched ${servers.length} servers.`);

  const processedFiles: { path: string; config: MCPServerPackageConfig }[] = [];
  const seenPackageNames = new Set<string>();
  const seenUrls = new Set<string>();

  let remoteCount = 0;
  let stdioCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;

  for (const server of servers) {
    let config: MCPServerPackageConfig | null = null;
    let isRemote = false;

    // Try processing as remote first
    const remoteConfig = await processRemoteServer(server);
    if (remoteConfig) {
      config = remoteConfig;
      isRemote = true;
    } else {
      // Try processing as stdio
      const stdioConfig = await processStdioServer(server);
      if (stdioConfig) {
        config = stdioConfig;
      }
    }

    if (!config) {
      skippedCount++;
      continue;
    }

    // Validate URL: Must be present and be a GitHub URL
    if (!config.url || !config.url.startsWith("https://github.com/")) {
      // console.log(`Skipping ${config.packageName}: Not a GitHub URL (${config.url})`);
      skippedCount++;
      continue;
    }

    // Deduplication
    if (seenPackageNames.has(config.packageName)) {
      duplicateCount++;
      continue;
    }

    // For remote servers, also check URL
    if (isRemote && config.url && seenUrls.has(config.url)) {
      duplicateCount++;
      continue;
    }

    // Add to processed list and update sets
    seenPackageNames.add(config.packageName);
    if (config.url) {
      seenUrls.add(config.url);
    }

    if (isRemote) {
      remoteCount++;
    } else {
      stdioCount++;
    }

    // Save to individual file
    const savedPath = await saveServerToFile(config);
    processedFiles.push({
      path: savedPath,
      config,
    });
  }

  console.log(`Processed ${processedFiles.length} unique servers.`);
  console.log(`  - Remote (SSE): ${remoteCount}`);
  console.log(`  - Stdio (Local): ${stdioCount}`);
  console.log(`  - Skipped: ${skippedCount}`);
  console.log(`  - Duplicates: ${duplicateCount}`);

  // Group by runtime for indexes
  const filesByRuntime: Record<string, typeof processedFiles> = {};

  for (const item of processedFiles) {
    const runtime = item.config.runtime || "unknown";
    if (!filesByRuntime[runtime]) {
      filesByRuntime[runtime] = [];
    }
    filesByRuntime[runtime].push(item);
  }

  // Write index files per runtime
  for (const [runtime, items] of Object.entries(filesByRuntime)) {
    const runtimeDir = path.join(OUTPUT_DIR, runtime);
    const indexFile = path.join(runtimeDir, "index.json");

    const indexData = items.map((item) => ({
      path: path.relative(runtimeDir, item.path), // Relative to the index file
      packageName: item.config.packageName,
      type: item.config.type,
    }));

    await fs.writeFile(indexFile, JSON.stringify(indexData, null, 2), "utf-8");
    console.log(`Wrote index to ${indexFile}`);
  }

  console.log(`Output directory: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

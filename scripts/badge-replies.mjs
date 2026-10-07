#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { getPackageKey, isRegistryJsonPath } from "./lib/registry-validator.mjs";

export const marker = "<!-- toolsdk-registry-published -->";
const siteUrl = "https://toolsdk-ai.github.io/toolsdk-mcp-registry";
const repository = "toolsdk-ai/toolsdk-mcp-registry";

export function renderBadgeReply(entries) {
  const blocks = entries.map(({ key, file }) => {
    // Literal scoped keys match the existing badge worker's wildcard route.
    const badge = `https://badges.toolsdk.ai/badge/${encodeURI(key)}`;
    const listing = `${siteUrl}/#${encodeURIComponent(key)}`;
    const configuration = `${siteUrl}/packages/${file.split("/").map(encodeURIComponent).join("/")}`;
    return `### ${key.replace(/[\r\n`]/g, "")}

- [Registry listing](${listing})
- [Published configuration](${configuration})

Optional README badge:

\`\`\`markdown
[![ToolSDK MCP Registry](${badge})](${listing})
\`\`\``;
  });
  return `${marker}
Thanks for contributing! Your MCP server configuration is now published in the ToolSDK MCP Registry.

${blocks.join("\n\n")}

Registered means listed in the directory. Verified reflects the registry's existing runtime validation record; it is not an official endorsement or a guarantee of Gateway compatibility. Badge data is cached for five minutes.
`;
}

export async function runBadgeReplies({
  numbers,
  post = false,
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  publishedUrl = siteUrl,
  gh = githubApi,
}) {
  if (!numbers.length || numbers.some((value) => !/^[1-9]\d*$/.test(value)))
    throw new Error("Usage: node scripts/badge-replies.mjs <merged-pr>... [--post]");
  const index = JSON.parse(fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8"));
  const request = (url) => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const publishedResponse = await request(`${publishedUrl}/indexes/packages-list.json`);
  if (!publishedResponse.ok)
    throw new Error(`Published index returned ${publishedResponse.status}`);
  const published = await publishedResponse.json();
  fs.mkdirSync(path.join(root, "badge-replies"), { recursive: true });
  for (const number of new Set(numbers)) {
    const pr = gh(`repos/${repository}/pulls/${number}`);
    if (!pr.merged_at || pr.base.ref !== "main")
      throw new Error(`PR #${number} is not merged into main`);
    const pages = gh(`repos/${repository}/pulls/${number}/files?per_page=100`, [
      "--paginate",
      "--slurp",
    ]);
    const files = pages
      .flat()
      .filter((file) => file.status === "added" && isRegistryJsonPath(file.filename));
    const entries = [];
    for (const file of files) {
      const local = path.join(root, file.filename);
      if (!fs.existsSync(local)) continue;
      const config = JSON.parse(fs.readFileSync(local, "utf8"));
      const key = getPackageKey(config);
      const relative = file.filename.slice("packages/".length);
      if (index[key]?.path !== relative || published[key]?.path !== relative) continue;
      const publishedConfig = await request(
        `${publishedUrl}/packages/${relative.split("/").map(encodeURIComponent).join("/")}`,
      );
      if (!publishedConfig.ok || !isDeepStrictEqual(config, await publishedConfig.json())) {
        console.log(`#${number}: ${key} does not match the published configuration; skipped`);
        continue;
      }
      entries.push({ key, file: relative });
    }
    if (!entries.length) {
      console.log(`#${number}: no newly published entries; skipped`);
      continue;
    }
    const body = renderBadgeReply(entries);
    const output = path.join(root, "badge-replies", `${number}.md`);
    fs.writeFileSync(output, body);
    if (post) {
      const comments = gh(`repos/${repository}/issues/${number}/comments?per_page=100`, [
        "--paginate",
        "--slurp",
      ]).flat();
      if (comments.some((comment) => comment.body.includes(marker))) {
        console.log(`#${number}: already notified`);
        continue;
      }
      gh(`repos/${repository}/issues/${number}/comments`, [
        "--method",
        "POST",
        "-F",
        `body=@${output}`,
      ]);
      console.log(`#${number}: badge reply posted`);
    } else console.log(`#${number}: preview saved to ${output}`);
  }
}

function githubApi(endpoint, extra = []) {
  return JSON.parse(
    execFileSync("gh", ["api", endpoint, ...extra], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60000,
    }),
  );
}

function main() {
  const args = process.argv.slice(2);
  return runBadgeReplies({
    numbers: args.filter((arg) => arg !== "--post"),
    post: args.includes("--post"),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

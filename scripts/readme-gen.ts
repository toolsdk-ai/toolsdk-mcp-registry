// This script is used to generate README.md and docs/FULL-CATALOG.md
// 1. First, read the category configuration file (config/categories.mjs) to read the categories
// 2. Iterate through the categories, then recursively read the specified directory (all JSON files under packages/{categoryName}), and validate with zod MCPServerConfigSchema.parse
// 3. Generate two outputs:
//    - README.md: Only validated MCP servers (collapsed by category)
//    - docs/FULL-CATALOG.md: Complete list of all MCP servers
// 4. Read templates and write to output files
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import _ from "lodash";
import categoriesList from "../indexes/categories-list.json";
import allPackagesList from "../indexes/packages-list.json";
import type { PackagesList } from "../src/shared/scripts-helpers";
import { getDirname, MCPServerPackageConfigSchema } from "../src/shared/scripts-helpers";

const __dirname = getDirname(import.meta.url);

let TOC = "";
let README_VALIDATED = ""; // Only validated servers for README.md
let FULL_CATALOG = ""; // All servers for FULL-CATALOG.md

const COUNT = Object.keys(allPackagesList).length;
const VALIDATED_COUNT = Object.values(allPackagesList as PackagesList).filter(
  (pkg) => pkg.validated,
).length;

for (const [_key, categoryList] of Object.entries(categoriesList)) {
  const packagesList = categoryList.packagesList;

  if (!packagesList || packagesList.length === 0) continue;

  TOC += `  - [${categoryList.config.name}](#${categoryList.config.key})\n`;

  // Sort packages: validated first, then by name (stable sort)
  const sortedPackagesList = [...packagesList].sort((a, b) => {
    const pkgA = (allPackagesList as PackagesList)[a];
    const pkgB = (allPackagesList as PackagesList)[b];

    // First sort by validation status (validated first)
    // Treat undefined as false for consistent comparison
    const validatedA = pkgA.validated === true;
    const validatedB = pkgB.validated === true;

    if (validatedA !== validatedB) {
      return validatedA ? -1 : 1;
    }

    // Then sort by package key (name) - direct comparison for stable ordering
    return a.localeCompare(b, "en", { sensitivity: "base" });
  });

  // Count validated packages in this category
  const validatedInCategory = sortedPackagesList.filter(
    (key) => (allPackagesList as PackagesList)[key].validated === true,
  ).length;
  const totalInCategory = sortedPackagesList.length;

  // Build content for both outputs
  let categoryValidatedContent = "";
  let categoryFullContent = "";

  for (const packageKey of sortedPackagesList) {
    const packageInfo = (allPackagesList as PackagesList)[packageKey];

    const filePath = join(__dirname, `../packages/`, packageInfo.path);
    const fileContent = readFileSync(filePath, "utf-8");
    const parsedContent = MCPServerPackageConfigSchema.parse(JSON.parse(fileContent));
    const validated = packageInfo.validated ? "✅" : "❌";
    const toolsCount = packageInfo.tools === undefined ? 0 : Object.keys(packageInfo.tools).length;
    const toolsCountLabel = toolsCount > 0 ? ` (${toolsCount} tools)` : "";
    const line = `- [${validated} ${parsedContent.key || parsedContent.packageName}](${parsedContent.url || "#"}): ${parsedContent.description} ${toolsCountLabel} (${parsedContent.runtime}) \n`;

    // Add to full catalog
    categoryFullContent += line;

    // Add to validated list only if validated
    if (packageInfo.validated) {
      categoryValidatedContent += line;
    }
  }

  // Full catalog: all servers expanded for better searchability (Ctrl+F)
  FULL_CATALOG += `\n\n<a id="${categoryList.config.key}"></a>\n`;
  FULL_CATALOG += `### ${categoryList.config.name} <small>(${totalInCategory} servers)</small>\n\n`;
  FULL_CATALOG += `> ${categoryList.config.description}\n\n`;
  FULL_CATALOG += categoryFullContent;
  FULL_CATALOG += `\n---\n`;

  // README: only show categories with validated servers, collapsed (no count shown)
  if (validatedInCategory > 0) {
    README_VALIDATED += `\n\n<a id="${categoryList.config.key}"></a>\n`;
    README_VALIDATED += `<details>\n<summary><strong>${categoryList.config.name}</strong></summary>\n\n`;
    README_VALIDATED += `${categoryList.config.description}\n\n`;
    README_VALIDATED += categoryValidatedContent;
    README_VALIDATED += `\n</details>\n`;
  }
}

// Generate README.md (validated only, collapsed)
const templatePath = join(__dirname, "../docs/_templates/README.tpl.md");
const templateContent = readFileSync(templatePath, "utf-8");
const compiled = _.template(templateContent);
const finalREADME = compiled({ CONTENT: README_VALIDATED, TOC, COUNT, VALIDATED_COUNT });
writeFileSync(join(__dirname, "../README.md"), finalREADME, "utf-8");
console.log("README.md has been generated successfully.");

// Generate docs/ALL-MCP-SERVERS.md (all servers)
const allServersTemplatePath = join(__dirname, "../docs/_templates/ALL-MCP-SERVERS.tpl.md");
const allServersTemplateContent = readFileSync(allServersTemplatePath, "utf-8");
const compiledAllServers = _.template(allServersTemplateContent);
const finalAllServers = compiledAllServers({
  CONTENT: FULL_CATALOG,
  TOC,
  COUNT,
  VALIDATED_COUNT,
});
writeFileSync(join(__dirname, "../docs/ALL-MCP-SERVERS.md"), finalAllServers, "utf-8");
console.log("docs/ALL-MCP-SERVERS.md has been generated successfully.");

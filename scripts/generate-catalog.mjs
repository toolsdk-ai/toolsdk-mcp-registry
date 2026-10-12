#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import categories from "../config/categories.mjs";
import blacklist from "../config/hosting-blacklist.mjs";
import { getPackageKey, validatePackageConfig } from "./lib/registry-validator.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function generateCatalog(root = defaultRoot, site = path.join(root, "catalog-site")) {
  const previous = JSON.parse(
    fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8"),
  );
  const previousGroupsFile = path.join(root, "indexes/categories-list.json");
  const previousGroups = fs.existsSync(previousGroupsFile)
    ? JSON.parse(fs.readFileSync(previousGroupsFile, "utf8"))
    : {};
  const packages = Object.create(null);
  const configs = new Map();
  const candidates = new Map();
  const groups = Object.fromEntries(
    categories.map((config) => [config.key, { config, packagesList: [] }]),
  );
  const excluded = new Set(blacklist);
  const visit = (directory, category) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file, category);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        const config = JSON.parse(fs.readFileSync(file, "utf8"));
        const errors = validatePackageConfig(config, file).filter((item) => item.level === "error");
        if (errors.length) throw new Error(JSON.stringify(errors));
        const key = getPackageKey(config);
        if (excluded.has(key) || excluded.has(config.packageName)) continue;
        const relative = path.relative(path.join(root, "packages"), file).split(path.sep).join("/");
        const entries = candidates.get(key) ?? [];
        entries.push({ config, path: relative, category });
        candidates.set(key, entries);
      }
    }
  };
  for (const category of categories) visit(path.join(root, "packages", category.key), category.key);
  for (const [key, entries] of candidates) {
    // Historical collisions keep their published winner; new ambiguity requires a maintainer.
    const selected =
      entries.find((entry) => entry.path === previous[key]?.path) ??
      (entries.length === 1 ? entries[0] : undefined);
    if (!selected)
      throw new Error(
        `Ambiguous registry identity "${key}": ${entries.map((entry) => entry.path).join(", ")}`,
      );
    const metadata = selected.path === previous[key]?.path ? previous[key] : {};
    packages[key] = { ...metadata, path: selected.path, category: selected.category };
    configs.set(key, selected.config);
  }
  const keys = [
    ...Object.keys(previous).filter((key) => Object.hasOwn(packages, key)),
    ...Object.keys(packages)
      .filter((key) => !Object.hasOwn(previous, key))
      .sort(),
  ];
  const sorted = Object.fromEntries(keys.map((key) => [key, packages[key]]));
  for (const [key, info] of Object.entries(sorted)) groups[info.category].packagesList.push(key);
  for (const [category, group] of Object.entries(groups)) {
    const oldKeys = [...new Set(previousGroups[category]?.packagesList ?? [])].filter(
      (key) => sorted[key]?.category === category,
    );
    const retained = new Set(oldKeys);
    group.packagesList = [...oldKeys, ...group.packagesList.filter((key) => !retained.has(key))];
  }
  fs.mkdirSync(path.join(root, "indexes"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "indexes/packages-list.json"),
    `${JSON.stringify(sorted, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(root, "indexes/categories-list.json"),
    `${JSON.stringify(groups, null, 2)}\n`,
  );
  renderDocs(root, sorted, groups, configs);
  fs.mkdirSync(site, { recursive: true });
  fs.cpSync(path.join(root, "indexes"), path.join(site, "indexes"), { recursive: true });
  fs.rmSync(path.join(site, "packages"), { recursive: true, force: true });
  for (const info of Object.values(sorted)) {
    const target = path.join(site, "packages", info.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, "packages", info.path), target);
  }
  fs.cpSync(path.join(root, "assets/logo.png"), path.join(site, "logo.png"));
  fs.writeFileSync(path.join(site, ".nojekyll"), "");
  fs.writeFileSync(path.join(site, "index.html"), renderSite(sorted, configs));
  return sorted;
}

function renderDocs(root, packages, groups, configs) {
  let toc = "";
  let validatedContent = "";
  let fullContent = "";
  for (const { config, packagesList } of Object.values(groups)) {
    if (!packagesList.length) continue;
    toc += `  - [${config.name}](#${config.key})\n`;
    const keys = [...packagesList].sort(
      (a, b) =>
        Number(packages[b].validated === true) - Number(packages[a].validated === true) ||
        a.localeCompare(b, "en", { sensitivity: "base" }),
    );
    const line = (key) => {
      const entry = configs.get(key);
      const tools = Object.keys(packages[key].tools ?? {}).length;
      return `- [${packages[key].validated ? "\u2705" : "\u274c"} ${key}](${entry.url || "#"}): ${entry.description} ${tools ? ` (${tools} tools)` : ""} (${entry.runtime})\n`;
    };
    fullContent += `\n\n<a id="${config.key}"></a>\n### ${config.name} <small>(${keys.length} servers)</small>\n\n> ${config.description}\n\n${keys.map(line).join("")}\n---\n`;
    const validated = keys.filter((key) => packages[key].validated === true);
    if (validated.length)
      validatedContent += `\n\n<a id="${config.key}"></a>\n<details>\n<summary><strong>${config.name}</strong></summary>\n\n${config.description}\n\n${validated.map(line).join("")}\n</details>\n`;
  }
  const values = {
    COUNT: Object.keys(packages).length,
    VALIDATED_COUNT: Object.values(packages).filter((entry) => entry.validated === true).length,
    TOC: toc,
  };
  values["COUNT - VALIDATED_COUNT"] = values.COUNT - values.VALIDATED_COUNT;
  for (const [template, output, content] of [
    ["README", "README.md", validatedContent],
    ["ALL-MCP-SERVERS", "docs/ALL-MCP-SERVERS.md", fullContent],
  ]) {
    const source = fs.readFileSync(path.join(root, `docs/_templates/${template}.tpl.md`), "utf8");
    const replacements = { ...values, CONTENT: content };
    const rendered = source.replace(/<%=\s*(.*?)\s*%>/g, (_, expression) => {
      if (!Object.hasOwn(replacements, expression))
        throw new Error(`Unsupported template expression: ${expression}`);
      return String(replacements[expression]);
    });
    fs.writeFileSync(path.join(root, output), `${rendered.trimEnd()}\n`);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

function renderSite(packages, configs) {
  const rows = Object.entries(packages)
    .map(([key, info]) => {
      const config = configs.get(key);
      const file = info.path.split("/").map(encodeURIComponent).join("/");
      return `<li id="${escapeHtml(key)}"><a href="packages/${file}">${escapeHtml(key)}</a><span>${escapeHtml(info.category)} &middot; ${escapeHtml(config.runtime)} &middot; ${info.validated === true ? "Verified" : "Registered"}</span><p>${escapeHtml(config.description)}</p></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ToolSDK MCP Registry</title>
<style>*{box-sizing:border-box}body{margin:0;font:15px system-ui,sans-serif;color:#252525;background:#fff}header,main{max-width:1040px;margin:auto;padding:24px}header{display:flex;align-items:center;gap:14px;border-bottom:1px solid #ddd}header img{width:44px;height:44px}h1{font-size:24px;margin:0}header a{margin-left:auto}a{color:#0769b3;overflow-wrap:anywhere}label{display:block;margin-bottom:8px}input{width:100%;padding:12px;border:1px solid #999;border-radius:4px;font:inherit}ul{list-style:none;padding:0}li{padding:16px 0;border-bottom:1px solid #ddd;scroll-margin-top:12px}li>a{font-weight:600}span{display:block;color:#666;font-size:13px;margin-top:6px}p{margin:8px 0 0;overflow-wrap:anywhere}[hidden]{display:none}@media(max-width:600px){header,main{padding:16px}header{flex-wrap:wrap}header a{margin-left:58px}h1{font-size:20px}}</style></head>
<body><header><img src="logo.png" alt=""><h1>ToolSDK MCP Registry</h1><a href="https://github.com/toolsdk-ai/toolsdk-mcp-registry">GitHub</a></header><main><label for="search">Search MCP servers</label><input id="search" type="search"><p id="count">${Object.keys(packages).length} servers</p><ul>${rows}</ul></main>
<script>const search=document.querySelector('#search');const rows=[...document.querySelectorAll('li')].map(element=>({element,text:element.textContent.toLowerCase()}));search.addEventListener('input',()=>{const query=search.value.toLowerCase();let count=0;for(const row of rows){row.element.hidden=!row.text.includes(query);if(!row.element.hidden)count++;}document.querySelector('#count').textContent=count+' servers';});</script></body></html>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw new Error("Usage: node scripts/generate-catalog.mjs");
  const packages = generateCatalog();
  console.log(
    `Generated ${Object.keys(packages).length} registry entries without installing or running MCP servers.`,
  );
}

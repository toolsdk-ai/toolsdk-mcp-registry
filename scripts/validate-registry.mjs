#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import categories from "../config/categories.mjs";
import {
  validateKeyChanges,
  validateNewPackagePath,
  validatePackageConfig,
} from "./lib/registry-validator.mjs";

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let rootDir = defaultRootDir;

function parseArgs(argv) {
  const options = { all: false, base: undefined, format: "text", root: defaultRootDir };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") options.all = true;
    else if (arg === "--base") options.base = argv[++index];
    else if (arg === "--format") options.format = argv[++index];
    else if (arg === "--root") options.root = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.all && !options.base) {
    throw new Error("Use --all or provide --base <git-ref>");
  }
  if (!new Set(["text", "github", "json"]).has(options.format)) {
    throw new Error("--format must be one of: text, github, json");
  }
  return options;
}

function git(args, encoding = "utf8", input) {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding,
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function listWorkingTreePackageFiles() {
  const files = [];
  const packagesDir = path.join(rootDir, "packages");
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.relative(rootDir, absolutePath).split(path.sep).join("/"));
      }
    }
  };
  visit(packagesDir);
  return files.sort();
}

function parseConfig(content, file, issues) {
  try {
    return JSON.parse(content);
  } catch (error) {
    issues.push({
      level: "error",
      code: "INVALID_JSON",
      message: error instanceof Error ? error.message : String(error),
      file,
    });
    return undefined;
  }
}

function loadWorkingTreeEntries(issues) {
  const entries = new Map();
  for (const file of listWorkingTreePackageFiles()) {
    const config = parseConfig(fs.readFileSync(path.join(rootDir, file), "utf8"), file, issues);
    if (config !== undefined) entries.set(file, config);
  }
  return entries;
}

function loadRefEntries(ref, issues) {
  const output = git(["ls-tree", "-r", "--name-only", "-z", ref, "--", "packages"]);
  const files = output.split("\0").filter((file) => file.endsWith(".json"));
  const entries = new Map();
  if (files.length === 0) return entries;

  const requests = files.map((file) => `${ref}:${file}\n`).join("");
  const objects = git(["cat-file", "--batch"], null, requests);
  let offset = 0;

  for (const file of files) {
    const headerEnd = objects.indexOf(0x0a, offset);
    const header = objects.subarray(offset, headerEnd).toString("utf8");
    const match = header.match(/^[0-9a-f]+ blob (\d+)$/);
    if (!match) {
      issues.push({
        level: "error",
        code: "BASE_FILE_READ_FAILED",
        message: `Could not read ${file} from ${ref}: ${header}`,
        file,
      });
      offset = headerEnd + 1;
      continue;
    }

    const size = Number(match[1]);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    const config = parseConfig(
      objects.subarray(contentStart, contentEnd).toString("utf8"),
      file,
      issues,
    );
    if (config !== undefined) entries.set(file, config);
    offset = contentEnd + 1;
  }

  return entries;
}

function resolveComparison(base) {
  const isActionsPullRequestMerge =
    process.env.GITHUB_ACTIONS === "true" &&
    /^refs\/pull\/\d+\/merge$/.test(process.env.GITHUB_REF ?? "");
  if (isActionsPullRequestMerge) {
    return { base: "HEAD^1", head: "HEAD^2" };
  }
  return { base, head: "HEAD" };
}

function parseChanges(base, head) {
  const mergeBase = git(["merge-base", base, head]).trim();
  const output = git([
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    mergeBase,
    head,
    "--",
    "packages",
  ]);
  const tokens = output.split("\0");
  const changes = [];
  for (let index = 0; index < tokens.length && tokens[index]; ) {
    const statusToken = tokens[index++];
    const status = statusToken[0];
    if (status === "R" || status === "C") {
      changes.push({ status: "R", oldPath: tokens[index++], path: tokens[index++] });
    } else {
      changes.push({ status, path: tokens[index++] });
    }
  }
  return { changes, mergeBase };
}

function applyChanges(baseEntries, headEntries, changes) {
  const entries = new Map(baseEntries);
  for (const change of changes) {
    if (change.status === "D") {
      entries.delete(change.path);
      continue;
    }

    if (change.status === "R") entries.delete(change.oldPath);
    const config = headEntries.get(change.path);
    if (config !== undefined) entries.set(change.path, config);
  }
  return entries;
}

function escapeWorkflowCommand(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function printIssues(issues, format) {
  if (format === "json") {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  for (const item of issues) {
    if (format === "github") {
      const command = item.level === "error" ? "error" : "warning";
      const properties = [`title=${escapeWorkflowCommand(item.code)}`];
      if (item.file) properties.unshift(`file=${escapeWorkflowCommand(item.file)}`, "line=1");
      console.log(`::${command} ${properties.join(",")}::${escapeWorkflowCommand(item.message)}`);
    } else {
      console.log(`${item.level.toUpperCase()} [${item.code}] ${item.file ?? ""}: ${item.message}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  rootDir = path.resolve(options.root);
  const issues = [];
  const headEntries = loadWorkingTreeEntries(issues);
  const changedJsonPaths = new Set();

  if (options.all) {
    for (const [file, config] of headEntries) {
      issues.push(...validatePackageConfig(config, file));
    }
  } else {
    const comparison = resolveComparison(options.base);
    const { changes } = parseChanges(comparison.base, comparison.head);
    for (const change of changes) {
      if (change.path.endsWith(".json") && change.status !== "D") changedJsonPaths.add(change.path);
    }

    for (const file of changedJsonPaths) {
      const config = headEntries.get(file);
      if (config === undefined) {
        issues.push({
          level: "error",
          code: "PACKAGE_FILE_NOT_FOUND",
          message: "Changed package JSON file was not found in the working tree",
          file,
        });
      } else {
        issues.push(...validatePackageConfig(config, file));
      }
    }

    const baseEntries = loadRefEntries(comparison.base, issues);
    const proposedEntries = applyChanges(baseEntries, headEntries, changes);
    const jsonChanges = changes.filter(
      (change) => change.path.endsWith(".json") || change.oldPath?.endsWith(".json"),
    );
    issues.push(...validateKeyChanges(baseEntries, proposedEntries, jsonChanges));

    const categoryKeys = new Set(categories.map((category) => category.key));
    for (const change of jsonChanges) {
      if (change.status === "A") {
        issues.push(...validateNewPackagePath(change.path, categoryKeys));
      }
    }
  }

  printIssues(issues, options.format);
  const errors = issues.filter((item) => item.level === "error").length;
  const warnings = issues.length - errors;
  if (options.format !== "json") {
    console.log(
      `Registry validation checked ${options.all ? headEntries.size : changedJsonPaths.size} file(s): ${errors} error(s), ${warnings} warning(s).`,
    );
  }
  if (errors > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

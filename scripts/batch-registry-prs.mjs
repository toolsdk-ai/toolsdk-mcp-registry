#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import categories from "../config/categories.mjs";
import {
  checkBlockers,
  checkReviewedHead,
  flagOverlaps,
  renderReport,
  reviewAddition,
} from "./lib/batch-review.mjs";
import { isRegistryJsonPath } from "./lib/registry-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = "toolsdk-ai/toolsdk-mcp-registry";
const fields = `number title url state isDraft baseRefName headRefOid mergeable mergeStateStatus reviewDecision
files(first:100){totalCount nodes{path}}
reviewThreads(first:100){nodes{isResolved isOutdated} pageInfo{hasNextPage}}
commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100){totalCount nodes{... on CheckRun{name status conclusion} ... on StatusContext{context state}}}}}}}`;
const categoryKeys = new Set(categories.map((category) => category.key));
const trustedFiles = [
  "config/categories.mjs",
  "scripts/lib/registry-validator.mjs",
  "scripts/lib/batch-review.mjs",
  "scripts/batch-registry-prs.mjs",
].map((file) => [file, fs.readFileSync(path.join(root, file))]);

function git(args, extra = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...extra,
  });
}

function gh(args) {
  return JSON.parse(
    execFileSync("gh", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60000,
    }),
  );
}

function metadata(numbers) {
  const result = [];
  if (numbers.length) {
    for (let offset = 0; offset < numbers.length; offset += 25) {
      const query = `query { repository(owner:"toolsdk-ai",name:"toolsdk-mcp-registry"){${numbers
        .slice(offset, offset + 25)
        .map((number) => `p${number}:pullRequest(number:${number}){${fields}}`)
        .join(" ")}}}`;
      const page = gh(["api", "graphql", "-f", `query=${query}`]);
      if (page.errors) throw new Error(JSON.stringify(page.errors));
      const prs = Object.values(page.data.repository);
      if (prs.some((pr) => !pr)) throw new Error("A requested PR was not found");
      result.push(...prs);
    }
  } else {
    let cursor = null;
    do {
      const query = `query($cursor:String){repository(owner:"toolsdk-ai",name:"toolsdk-mcp-registry"){pullRequests(first:25,after:$cursor,states:OPEN,orderBy:{field:CREATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{${fields}}}}}`;
      const args = ["api", "graphql", "-f", `query=${query}`];
      if (cursor) args.push("-f", `cursor=${cursor}`);
      const response = gh(args);
      if (response.errors) throw new Error(JSON.stringify(response.errors));
      const page = response.data.repository.pullRequests;
      result.push(...page.nodes);
      cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor);
  }
  return result;
}

function assertTrustedCheckout() {
  if (
    trustedFiles.some(([file, content]) => !content.equals(fs.readFileSync(path.join(root, file))))
  )
    throw new Error("Trusted review tools changed on main; restart with the updated tools.");
  if (git(["status", "--porcelain"]).trim())
    throw new Error(
      "Use a clean trusted main checkout; keep output in the ignored registry-review/ directory or outside the repository.",
    );
  if (git(["rev-parse", "HEAD"]).trim() !== git(["rev-parse", "origin/main"]).trim())
    throw new Error("Refresh main with git merge --ff-only origin/main before reviewing.");
  const origin = git(["remote", "get-url", "origin"]).trim();
  if (!/github\.com[:/]toolsdk-ai\/toolsdk-mcp-registry(?:\.git)?$/.test(origin))
    throw new Error("origin must point to toolsdk-ai/toolsdk-mcp-registry");
}

function readBlobs(requests) {
  if (!requests.length) return [];
  const data = git(["cat-file", "--batch"], { encoding: null, input: `${requests.join("\n")}\n` });
  let offset = 0;
  return requests.map((request) => {
    const end = data.indexOf(10, offset);
    const header = data.subarray(offset, end).toString();
    const match = header.match(/^[0-9a-f]+ blob (\d+)$/);
    if (!match) throw new Error(`Could not read registry blob ${request}`);
    const size = Number(match[1]);
    const content = data.subarray(end + 1, end + 1 + size).toString();
    offset = end + size + 2;
    return content;
  });
}

function refreshAndReview(prs) {
  git([
    "fetch",
    "--no-tags",
    "origin",
    "main",
    ...prs.map((pr) => `+refs/pull/${pr.number}/head:refs/codex/batch-review/${pr.number}`),
  ]);
  assertTrustedCheckout();
  const files = git(["ls-tree", "-r", "--name-only", "origin/main", "--", "packages"])
    .trim()
    .split("\n")
    .filter((file) => file.endsWith(".json"));
  const values = readBlobs(files.map((file) => `origin/main:${file}`));
  const base = new Map(files.map((file, index) => [file, JSON.parse(values[index])]));
  return flagOverlaps(
    prs.map((pr) => {
      const ref = `refs/codex/batch-review/${pr.number}`;
      const tokens = git([
        "diff",
        "--name-status",
        "--no-renames",
        "-z",
        `${git(["merge-base", "origin/main", ref]).trim()}`,
        ref,
      ]).split("\0");
      const changes = [];
      for (let index = 0; index < tokens.length && tokens[index]; )
        changes.push({ status: tokens[index++][0], path: tokens[index++] });
      const additions = changes.filter(
        (change) => change.status === "A" && isRegistryJsonPath(change.path),
      );
      const contents = readBlobs(additions.map((change) => `${ref}:${change.path}`));
      const reviewed = reviewAddition(
        pr,
        base,
        changes,
        new Map(additions.map((change, index) => [change.path, contents[index]])),
        categoryKeys,
      );
      reviewed.reviewedHead = git(["rev-parse", ref]).trim();
      reviewed.blockers.push(...checkReviewedHead(pr, reviewed.reviewedHead));
      return reviewed;
    }),
  );
}

function parseArgs(args) {
  const [mode, ...rest] = args;
  if (!new Set(["review", "merge"]).has(mode)) throw new Error("Use review or merge; see --help");
  let numbers = [];
  let output = path.join(root, "registry-review");
  let approved = false;
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    const value = rest[++index];
    if (!value) throw new Error(`Missing value for ${option}`);
    if (option === "--output") output = path.resolve(value);
    else if (option === "--prs" || option === "--approved") {
      if (numbers.length) throw new Error("Specify the PR list only once");
      const values = value.trim().split(/[\s,]+/);
      if (values.some((item) => !/^[1-9]\d*$/.test(item)))
        throw new Error("PR numbers must be positive integers");
      numbers = [...new Set(values.map(Number))];
      approved = option === "--approved";
    } else throw new Error(`Unknown argument: ${option}`);
  }
  if (mode === "merge" && (!approved || !numbers.length))
    throw new Error("Merge mode requires --approved with the explicitly authorized PR numbers");
  if (mode === "review" && approved) throw new Error("Use --prs in review mode");
  return { mode, numbers, output };
}

function writeReport(output, report) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(output, "report.md"), renderReport(report));
  console.log(
    `${report.filter((pr) => !pr.blockers.length).length} ready / ${report.length} reviewed. Report: ${path.join(output, "report.md")}`,
  );
}

function main() {
  if (process.argv.includes("--help")) {
    console.log(
      'Usage:\n  node scripts/batch-registry-prs.mjs review [--prs "123 124"] [--output directory]\n  node scripts/batch-registry-prs.mjs merge --approved "123 124" [--output directory]\n\nRun from a clean, up-to-date main checkout. Review is read-only; merge only squash-merges the approved list after fresh validation.',
    );
    return;
  }
  const { mode, numbers, output } = parseArgs(process.argv.slice(2));
  assertTrustedCheckout();
  let prs = metadata(numbers);
  let report = refreshAndReview(prs);
  // Refresh metadata after fetching JSON so checks and discussions describe the current PR state.
  if (prs.length) {
    prs = metadata(prs.map((pr) => pr.number));
    report = report.map((item) => ({
      ...item,
      blockers: [
        ...new Set([
          ...item.blockers,
          ...checkBlockers(prs.find((pr) => pr.number === item.number)),
          ...checkReviewedHead(
            prs.find((pr) => pr.number === item.number),
            item.reviewedHead,
          ),
        ]),
      ],
    }));
  }
  writeReport(output, report);
  if (mode === "review") return;
  const results = report
    .filter((pr) => pr.blockers.length)
    .map((pr) => ({ number: pr.number, result: "SKIPPED", blockers: pr.blockers }));
  const save = () =>
    fs.writeFileSync(
      path.join(output, "merge-results.json"),
      `${JSON.stringify(results, null, 2)}\n`,
    );
  for (const candidate of report.filter((pr) => !pr.blockers.length)) {
    let result;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        git(["fetch", "--no-tags", "origin", "main"]);
        git(["-c", "core.hooksPath=/dev/null", "merge", "--ff-only", "origin/main"]);
        const current = metadata([candidate.number])[0];
        if (current.state === "MERGED") {
          result = { number: candidate.number, result: "ALREADY_MERGED" };
          break;
        }
        const reviewed = refreshAndReview([current])[0];
        const refreshed = metadata([candidate.number])[0];
        reviewed.blockers.push(...checkBlockers(refreshed));
        reviewed.blockers.push(...checkReviewedHead(refreshed, reviewed.reviewedHead));
        if (reviewed.blockers.length) {
          result = {
            number: candidate.number,
            result: "SKIPPED",
            blockers: [...new Set(reviewed.blockers)],
          };
          break;
        }
        const response = gh([
          "api",
          `repos/${repository}/pulls/${candidate.number}/merge`,
          "--method",
          "PUT",
          "-f",
          "merge_method=squash",
          "-f",
          `sha=${reviewed.reviewedHead}`,
        ]);
        if (!response.merged) throw new Error(response.message || "Merge rejected");
        result = { number: candidate.number, result: "MERGED", commit: response.sha };
        break;
      } catch (error) {
        const detail = `${error.stderr ?? ""}${error.message}`;
        if (attempt < 2 && /Base branch was modified/i.test(detail)) continue;
        result = { number: candidate.number, result: "FAILED", detail };
        break;
      }
    }
    results.push(result);
    save();
    console.log(`#${candidate.number}: ${result.result}`);
  }
  save();
  git(["fetch", "--no-tags", "origin", "main"]);
  git(["-c", "core.hooksPath=/dev/null", "merge", "--ff-only", "origin/main"]);
  if (results.some((result) => result.result === "FAILED" || result.result === "SKIPPED"))
    process.exitCode = 1;
}

main();

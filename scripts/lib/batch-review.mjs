import {
  getPackageKey,
  isRegistryJsonPath,
  validateKeyChanges,
  validateNewPackagePath,
  validatePackageConfig,
  validateRegistryPrScope,
} from "./registry-validator.mjs";

export function checkBlockers(pr) {
  const blockers = [];
  if (pr.state !== "OPEN" || pr.isDraft || pr.baseRefName !== "main")
    blockers.push("NOT_OPEN_MAIN_PR");
  if (pr.mergeable !== "MERGEABLE" || pr.mergeStateStatus !== "CLEAN")
    blockers.push("MERGE_NOT_READY");
  if (
    pr.reviewDecision === "CHANGES_REQUESTED" ||
    pr.reviewThreads.pageInfo.hasNextPage ||
    pr.reviewThreads.nodes.some((thread) => !thread.isResolved && !thread.isOutdated)
  )
    blockers.push("REVIEW_BLOCKED");
  if (pr.files.totalCount !== pr.files.nodes.length) blockers.push("INCOMPLETE_FILE_LIST");
  const checks = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  if (!checks?.nodes.length || checks.totalCount !== checks.nodes.length)
    blockers.push("MISSING_OR_INCOMPLETE_CI");
  else {
    if (
      checks.nodes.some((check) =>
        check.name
          ? check.status !== "COMPLETED" ||
            !["SUCCESS", "SKIPPED", "NEUTRAL"].includes(check.conclusion)
          : check.state !== "SUCCESS",
      )
    )
      blockers.push("CI_NOT_PASSED");
    if (
      !checks.nodes.some(
        (check) => check.name === "Package Schema Check" && check.conclusion === "SUCCESS",
      )
    )
      blockers.push("NO_SCHEMA_CHECK_SUCCESS");
    if (!checks.nodes.some((check) => check.name === "biome" && check.conclusion === "SUCCESS"))
      blockers.push("NO_FORMAT_CHECK_SUCCESS");
  }
  return blockers;
}

export function checkReviewedHead(pr, reviewedHead) {
  return pr.headRefOid !== reviewedHead || pr.commits.nodes[0]?.commit.oid !== reviewedHead
    ? ["PR_CHANGED_DURING_REVIEW"]
    : [];
}

export function reviewAddition(pr, base, changes, contents, categoryKeys) {
  const issues = validateRegistryPrScope(changes);
  const blockers = checkBlockers(pr);
  const proposed = new Map(base);
  const entries = [];
  if (changes.some((change) => change.status !== "A")) blockers.push("EXISTING_ENTRY_CHANGE");
  for (const change of changes.filter(
    (item) => item.status === "A" && isRegistryJsonPath(item.path),
  )) {
    try {
      const config = JSON.parse(contents.get(change.path));
      entries.push({ path: change.path, key: getPackageKey(config) });
      proposed.set(change.path, config);
      issues.push(
        ...validatePackageConfig(config, change.path),
        ...validateNewPackagePath(change.path, categoryKeys),
      );
      if (config.runtime === "node" && config.bin && !/\.(mjs|cjs|js)$/.test(config.bin))
        blockers.push("NODE_BIN_NEEDS_REVIEW");
    } catch (error) {
      issues.push({
        level: "error",
        code: "INVALID_JSON",
        file: change.path,
        message: error.message,
      });
    }
  }
  issues.push(...validateKeyChanges(base, proposed, changes));
  if (issues.some((issue) => issue.level === "error")) blockers.push("VALIDATION_FAILED");
  if (issues.some((issue) => issue.level === "warning")) blockers.push("VALIDATION_WARNING");
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    entries,
    changes,
    issues,
    blockers: [...new Set(blockers)],
  };
}

export function flagOverlaps(report) {
  const owners = new Map();
  for (const item of report.filter((pr) => !pr.blockers.length)) {
    for (const entry of item.entries) {
      for (const value of [`path:${entry.path}`, `key:${entry.key}`]) {
        const numbers = owners.get(value) ?? new Set();
        numbers.add(item.number);
        owners.set(value, numbers);
      }
    }
  }
  for (const item of report.filter((pr) => !pr.blockers.length)) {
    if (
      item.entries.some(
        (entry) =>
          owners.get(`path:${entry.path}`).size > 1 || owners.get(`key:${entry.key}`).size > 1,
      )
    )
      item.blockers.push("OVERLAPPING_SUBMISSIONS");
  }
  return report;
}

export function renderReport(report) {
  const ready = report.filter((item) => !item.blockers.length);
  const escapeCell = (value) => String(value).replace(/[\r\n|]/g, " ");
  return `# Registry PR Review\n\n${ready.length} ready / ${report.length} reviewed. No merge is performed by review mode.\n\n| PR | Verdict | Details |\n| --- | --- | --- |\n${report.map((item) => `| [#${item.number}](${item.url}) | ${item.blockers.length ? "Held" : "Ready"} | ${escapeCell(item.blockers.join(", ") || item.entries.map((entry) => entry.key).join(", "))} |`).join("\n")}\n\nReady PRs: ${ready.map((item) => item.number).join(" ") || "none"}\n\nSchema and format checks establish metadata validity, not package authenticity, service availability, or Gateway compatibility. Review official-source links before approving specific PRs.\n`;
}

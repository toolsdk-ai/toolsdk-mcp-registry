import assert from "node:assert/strict";
import test from "node:test";
import { checkBlockers, checkReviewedHead, flagOverlaps, reviewAddition } from "./batch-review.mjs";

function readyPr(number = 1) {
  return {
    number,
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    files: { totalCount: 1, nodes: [{ path: "packages/developer-tools/example.json" }] },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              contexts: {
                totalCount: 2,
                nodes: ["Package Schema Check", "biome"].map((name) => ({
                  name,
                  status: "COMPLETED",
                  conclusion: "SUCCESS",
                })),
              },
            },
          },
        },
      ],
    },
  };
}

const file = "packages/developer-tools/example.json";
const config = { type: "mcp-server", runtime: "node", packageName: "example" };
const review = (
  pr = readyPr(),
  base = new Map(),
  changes = [{ status: "A", path: file }],
  value = config,
) =>
  reviewAddition(
    pr,
    base,
    changes,
    new Map([[file, JSON.stringify(value)]]),
    new Set(["developer-tools"]),
  );

test("only new, schema-valid entries with complete passing CI are merge candidates", () => {
  assert.deepEqual(review().blockers, []);
  assert.ok(
    review(
      readyPr(),
      new Map([["packages/developer-tools/existing.json", config]]),
    ).blockers.includes("VALIDATION_FAILED"),
  );
  assert.ok(
    review(readyPr(), new Map(), [{ status: "M", path: file }]).blockers.includes(
      "EXISTING_ENTRY_CHANGE",
    ),
  );
  assert.ok(
    review(readyPr(), new Map(), [{ status: "A", path: "README.md" }]).blockers.includes(
      "VALIDATION_FAILED",
    ),
  );
  assert.ok(
    review(readyPr(), new Map(), undefined, { ...config, bin: "example" }).blockers.includes(
      "NODE_BIN_NEEDS_REVIEW",
    ),
  );
});

test("missing schema CI, failed checks, unresolved threads, and incomplete metadata are held", () => {
  const pr = readyPr();
  pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].name = "Old check";
  assert.ok(checkBlockers(pr).includes("NO_SCHEMA_CHECK_SUCCESS"));
  pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[1].conclusion = "FAILURE";
  assert.ok(checkBlockers(pr).includes("CI_NOT_PASSED"));
  pr.reviewThreads.pageInfo.hasNextPage = true;
  assert.ok(checkBlockers(pr).includes("REVIEW_BLOCKED"));
  pr.files.totalCount = 101;
  assert.ok(checkBlockers(pr).includes("INCOMPLETE_FILE_LIST"));
  pr.commits.nodes = [];
  assert.ok(checkBlockers(pr).includes("MISSING_OR_INCOMPLETE_CI"));
});

test("overlapping paths or identities hold both otherwise ready submissions", () => {
  const left = review(readyPr(1));
  const right = review(readyPr(2));
  right.entries[0].path = "packages/developer-tools/another.json";
  assert.ok(
    flagOverlaps([left, right]).every((pr) => pr.blockers.includes("OVERLAPPING_SUBMISSIONS")),
  );
  const independent = review(readyPr(3), new Map(), undefined, {
    ...config,
    packageName: "independent",
  });
  independent.entries[0].path = "packages/developer-tools/independent.json";
  assert.deepEqual(
    flagOverlaps([review(), independent]).map((pr) => pr.blockers),
    [[], []],
  );
});

test("checks must belong to the Git content actually reviewed", () => {
  const pr = readyPr();
  pr.headRefOid = "reviewed-head";
  pr.commits.nodes[0].commit.oid = "reviewed-head";
  assert.deepEqual(checkReviewedHead(pr, "reviewed-head"), []);
  pr.headRefOid = "new-head";
  assert.deepEqual(checkReviewedHead(pr, "reviewed-head"), ["PR_CHANGED_DURING_REVIEW"]);
  pr.headRefOid = "reviewed-head";
  pr.commits.nodes[0].commit.oid = "old-checks";
  assert.deepEqual(checkReviewedHead(pr, "reviewed-head"), ["PR_CHANGED_DURING_REVIEW"]);
});

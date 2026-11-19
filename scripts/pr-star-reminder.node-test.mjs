import assert from "node:assert/strict";
import test from "node:test";
import remind from "./pr-star-reminder.cjs";

function fixture({ pages = [[]], comments = [], pr = {}, files, failure } = {}) {
  const writes = [];
  const summaries = [];
  const warnings = [];
  const api = {
    pulls: {
      get: async () => ({
        data: {
          state: "open",
          draft: false,
          base: { ref: "main" },
          user: { login: "Alice" },
          ...pr,
        },
      }),
      listFiles: "files",
    },
    activity: { listStargazersForRepo: "stars" },
    issues: {
      listComments: "comments",
      createComment: async (value) => writes.push({ action: "create", ...value }),
      updateComment: async (value) => writes.push({ action: "update", ...value }),
    },
  };
  const paginate = async (method, args) => {
    assert.equal(args.per_page, 100);
    return method === "files"
      ? (files ?? [{ filename: "packages/search/server.json", status: "added" }])
      : comments;
  };
  let visitedPages = 0;
  paginate.iterator = async function* (method, args) {
    assert.equal(method, "stars");
    assert.equal(args.per_page, 100);
    if (failure) throw new Error("API unavailable");
    for (const data of pages) {
      visitedPages++;
      yield { data };
    }
  };
  const summary = {
    addHeading() {
      return this;
    },
    addRaw(text) {
      summaries.push(text);
      return this;
    },
    async write() {},
  };
  return {
    args: {
      github: { rest: api, paginate },
      context: {
        repo: { owner: "toolsdk-ai", repo: "toolsdk-mcp-registry" },
        payload: { pull_request: { number: 123 } },
      },
      core: { summary, warning: (text) => warnings.push(text) },
    },
    writes,
    summaries,
    warnings,
    pagesVisited: () => visitedPages,
  };
}

test("finds an existing Star on a later page, case insensitive, without posting", async () => {
  const f = fixture({ pages: [[{ login: "other" }], [{ login: "alice" }], [{ login: "unused" }]] });
  await remind(f.args);
  assert.equal(f.pagesVisited(), 2);
  assert.deepEqual(f.writes, []);
  assert.match(f.summaries[0], /Star confirmed/);
});

test("missing Star creates one reminder; reruns do not duplicate it", async () => {
  const f = fixture();
  await remind(f.args);
  assert.equal(f.writes.length, 1);
  assert.match(f.writes[0].body, /Please star/);
  const existing = { id: 9, user: { login: "github-actions[bot]" }, body: f.writes[0].body };
  const rerun = fixture({ comments: [existing] });
  await remind(rerun.args);
  assert.deepEqual(rerun.writes, []);
  const starred = fixture({ pages: [[{ login: "Alice" }]], comments: [existing] });
  await remind(starred.args);
  assert.equal(starred.writes[0].action, "update");
  assert.equal(starred.writes[0].comment_id, 9);
  assert.match(starred.writes[0].body, /your Star is confirmed/);
});

test("never edits a contributor comment containing the reminder marker", async () => {
  const f = fixture({
    comments: [{ id: 4, user: { login: "Alice" }, body: "<!-- toolsdk-star-reminder -->" }],
  });
  await remind(f.args);
  assert.equal(f.writes[0].action, "create");
});

test("API errors stay informational and never create a missing-Star reminder", async () => {
  const f = fixture({ failure: true });
  await remind(f.args);
  assert.deepEqual(f.writes, []);
  assert.equal(f.warnings.length, 1);
  assert.match(f.summaries[0], /Unable to confirm/);
});

test("skips drafts, closed PRs, other bases and non-submission changes", async () => {
  for (const options of [
    { pr: { draft: true } },
    { pr: { state: "closed" } },
    { pr: { base: { ref: "develop" } } },
    { files: [{ filename: "README.md", status: "modified" }] },
    { files: [{ filename: "packages/search/server.json", status: "removed" }] },
  ]) {
    const f = fixture(options);
    await remind(f.args);
    assert.equal(f.pagesVisited(), 0);
    assert.deepEqual(f.writes, []);
  }
});

test("manual recheck reads a numeric PR input and rejects malformed values", async () => {
  const f = fixture();
  f.args.context.payload = { inputs: { pr_number: "123" } };
  await remind(f.args);
  assert.equal(f.writes[0].issue_number, 123);
  const invalid = fixture();
  invalid.args.context.payload = { inputs: { pr_number: "123; echo nope" } };
  await remind(invalid.args);
  assert.deepEqual(invalid.writes, []);
  assert.equal(invalid.warnings.length, 1);
});

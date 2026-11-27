import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();

function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "toolsdk-batch-"));
  const root = path.join(temp, "registry");
  const remote = path.join(temp, "remote.git");
  const bin = path.join(temp, "bin");
  for (const dir of [root, bin]) fs.mkdirSync(dir);
  const git = (args) =>
    execFileSync(realGit, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  for (const file of [
    "scripts/batch-registry-prs.mjs",
    "scripts/lib/batch-review.mjs",
    "scripts/lib/registry-validator.mjs",
    "config/categories.mjs",
  ])
    write(file, fs.readFileSync(path.join(source, file)));
  write(".gitignore", "/registry-review/\n");
  const config = (name) =>
    JSON.stringify({ type: "mcp-server", runtime: "node", packageName: name });
  write("packages/developer-tools/existing.json", config("existing"));
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Registry Test"]);
  git(["config", "user.email", "registry-test@example.com"]);
  git(["add", "."]);
  git(["commit", "-m", "Trusted main"]);
  git(["clone", "--bare", root, remote]);
  git(["remote", "add", "origin", remote]);
  git(["fetch", "origin", "main"]);
  const metadata = {};
  for (const [number, name] of [
    [1, "new-server"],
    [2, "existing"],
    [3, "untrusted-script"],
  ]) {
    git(["switch", "-c", `contributor-${number}`, "main"]);
    const file = `packages/developer-tools/pr-${number}.json`;
    write(file, config(name));
    if (number === 3)
      write("scripts/contributor.mjs", 'throw new Error("Contributor script must never run");\n');
    git(["add", "."]);
    git(["commit", "-m", `PR ${number}`]);
    git(["push", remote, `HEAD:refs/pull/${number}/head`]);
    metadata[`p${number}`] = {
      number,
      title: `PR ${number}`,
      url: `https://github.com/example/registry/pull/${number}`,
      state: "OPEN",
      isDraft: false,
      baseRefName: "main",
      headRefOid: git(["rev-parse", "HEAD"]).trim(),
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      files: {
        totalCount: number === 3 ? 2 : 1,
        nodes: [{ path: file }, ...(number === 3 ? [{ path: "scripts/contributor.mjs" }] : [])],
      },
      reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
      commits: {
        nodes: [
          {
            commit: {
              oid: git(["rev-parse", "HEAD"]).trim(),
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
  git(["switch", "main"]);
  assert.equal(
    git(["rev-parse", "HEAD"]).trim(),
    git(["rev-parse", "origin/main"]).trim(),
    "Fixture must stay on trusted main",
  );
  fs.writeFileSync(path.join(temp, "metadata.json"), JSON.stringify(metadata));
  fs.writeFileSync(
    path.join(bin, "git"),
    `#!/usr/bin/env node
const {execFileSync}=require('node:child_process');const args=process.argv.slice(2);if(args.join(' ')==='remote get-url origin'){console.log('https://github.com/toolsdk-ai/toolsdk-mcp-registry.git');}else try{process.stdout.write(execFileSync(process.env.TEST_GIT,args,{stdio:['inherit','pipe','pipe']}));}catch(error){process.stderr.write(error.stderr||error.message);process.exit(error.status||1);}
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(bin, "gh"),
    `#!/usr/bin/env node
const fs=require('node:fs');const {execFileSync}=require('node:child_process');const path=require('node:path');const args=process.argv.slice(2);const temp=process.env.TEST_TEMP;const meta=JSON.parse(fs.readFileSync(path.join(temp,'metadata.json')));fs.appendFileSync(path.join(temp,'calls.jsonl'),JSON.stringify(args)+'\\n');
if(args[1]==='graphql'){const count=fs.readFileSync(path.join(temp,'calls.jsonl'),'utf8').trim().split('\\n').filter(line=>JSON.parse(line)[1]==='graphql').length;if(process.env.TEST_FAIL_REFRESH==='true'&&count>=3)meta.p1.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion='FAILURE';if(process.env.TEST_HEAD_REFRESH==='true'&&count>=4){meta.p1.headRefOid='updated-head';meta.p1.commits.nodes[0].commit.oid='updated-head';}const query=args.find(a=>a.startsWith('query=')).slice(6);const numbers=[...query.matchAll(/p(\\d+):pullRequest/g)].map(m=>m[1]);const repository=numbers.length?Object.fromEntries(numbers.map(n=>['p'+n,meta['p'+n]])):{pullRequests:{pageInfo:{hasNextPage:false},nodes:Object.values(meta)}};console.log(JSON.stringify({data:{repository}}));}
else{const number=args[1].match(/pulls\\/(\\d+)\\/merge$/)?.[1];if(!number||!args.includes('merge_method=squash'))throw new Error('Unexpected mutation');const ref='refs/pull/'+number+'/head';const sha=execFileSync(process.env.TEST_GIT,['--git-dir='+process.env.TEST_REMOTE,'rev-parse',ref],{encoding:'utf8'}).trim();if(!args.includes('sha='+sha))throw new Error('Missing current-head precondition');execFileSync(process.env.TEST_GIT,['--git-dir='+process.env.TEST_REMOTE,'update-ref','refs/heads/main',sha]);meta['p'+number].state='MERGED';fs.writeFileSync(path.join(temp,'metadata.json'),JSON.stringify(meta));console.log(JSON.stringify({merged:true,sha}));}
`,
    { mode: 0o755 },
  );
  const run = (args, extraEnv = {}) =>
    execFileSync(process.execPath, [path.join(root, "scripts/batch-registry-prs.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_GIT: realGit,
        TEST_REMOTE: remote,
        TEST_TEMP: temp,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  return { temp, root, run };
}

test("CLI review batches real Git blobs without executing contributor scripts or mutating PRs", () => {
  const { temp, root, run } = fixture();
  try {
    run(["review"]);
    const report = JSON.parse(fs.readFileSync(path.join(root, "registry-review/report.json")));
    assert.deepEqual(report.find((pr) => pr.number === 1).blockers, []);
    assert.ok(report.find((pr) => pr.number === 2).blockers.includes("VALIDATION_FAILED"));
    assert.ok(report.find((pr) => pr.number === 3).blockers.includes("VALIDATION_FAILED"));
    assert.ok(
      fs
        .readFileSync(path.join(temp, "calls.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .every((call) => JSON.parse(call)[1] === "graphql"),
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI merge requires explicit approval and only merges validated approved PRs", () => {
  const { temp, root, run } = fixture();
  try {
    assert.throws(() => run(["merge"]), /requires --approved/);
    run(["merge", "--approved", "1"]);
    const results = JSON.parse(
      fs.readFileSync(path.join(root, "registry-review/merge-results.json")),
    );
    assert.deepEqual(
      results.map((result) => [result.number, result.result]),
      [[1, "MERGED"]],
    );
    const meta = JSON.parse(fs.readFileSync(path.join(temp, "metadata.json")));
    assert.equal(meta.p2.state, "OPEN");
    assert.equal(meta.p3.state, "OPEN");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("a check that fails after the report prevents an approved merge", () => {
  const { temp, root, run } = fixture();
  try {
    assert.throws(() => run(["merge", "--approved", "1"], { TEST_FAIL_REFRESH: "true" }));
    const results = JSON.parse(
      fs.readFileSync(path.join(root, "registry-review/merge-results.json")),
    );
    assert.equal(results[0].result, "SKIPPED");
    assert.ok(results[0].blockers.includes("CI_NOT_PASSED"));
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "metadata.json"))).p1.state, "OPEN");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("a contributor update between fetching JSON and checking CI prevents merge", () => {
  const { temp, root, run } = fixture();
  try {
    assert.throws(() => run(["merge", "--approved", "1"], { TEST_HEAD_REFRESH: "true" }));
    const results = JSON.parse(
      fs.readFileSync(path.join(root, "registry-review/merge-results.json")),
    );
    assert.equal(results[0].result, "SKIPPED");
    assert.ok(results[0].blockers.includes("PR_CHANGED_DURING_REVIEW"));
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, "metadata.json"))).p1.state, "OPEN");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

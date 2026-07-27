import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const validator = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "validate-registry.mjs",
);

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function writeConfig(root, filename, packageName) {
  const file = path.join(root, "packages", "developer-tools", filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ type: "mcp-server", runtime: "node", packageName }, null, 2)}\n`,
  );
}

function runValidator(root, base, env = {}) {
  return execFileSync(process.execPath, [validator, "--root", root, "--base", base], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertKeyCollision(run) {
  let output = "";
  assert.throws(run, (error) => {
    output = `${error.stdout}${error.stderr}`;
    return error.status === 1;
  });
  assert.match(output, /DUPLICATE_PACKAGE_KEY/);
  assert.match(output, /EXISTING_KEY_REPLACEMENT/);
}

test("checks new keys against the latest base ref instead of the merge base", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "registry-validator-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.name", "Registry Validator Test"]);
    git(root, ["config", "user.email", "registry-validator@example.com"]);

    writeConfig(root, "initial.json", "initial-package");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "Initial registry"]);
    git(root, ["branch", "contributor"]);

    writeConfig(root, "added-on-main.json", "shared-package");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "Add package on main"]);

    git(root, ["switch", "--quiet", "contributor"]);
    writeConfig(root, "contribution.json", "shared-package");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "Add conflicting contribution"]);

    assertKeyCollision(() => runValidator(root, "main"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("uses the current base parent for GitHub pull request merge refs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "registry-validator-"));
  try {
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.name", "Registry Validator Test"]);
    git(root, ["config", "user.email", "registry-validator@example.com"]);

    writeConfig(root, "initial.json", "initial-package");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "Initial registry"]);
    const staleBase = git(root, ["rev-parse", "HEAD"]).trim();
    git(root, ["branch", "contributor"]);

    writeConfig(root, "added-on-main.json", "shared-package");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "Add package on main"]);

    git(root, ["switch", "--quiet", "contributor"]);
    writeConfig(root, "contribution.json", "shared-package");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "Add conflicting contribution"]);

    git(root, ["switch", "--quiet", "main"]);
    git(root, ["merge", "--no-ff", "contributor", "-m", "Synthetic pull request merge"]);

    assertKeyCollision(() =>
      runValidator(root, staleBase, {
        GITHUB_ACTIONS: "true",
        GITHUB_REF: "refs/pull/123/merge",
      }),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

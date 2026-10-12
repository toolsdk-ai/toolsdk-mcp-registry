import assert from "node:assert/strict";
import test from "node:test";
import {
  isRegistryJsonPath,
  validateKeyChanges,
  validateNewPackagePath,
  validatePackageConfig,
  validateRegistryPrScope,
} from "./registry-validator.mjs";

function localConfig(overrides = {}) {
  return {
    type: "mcp-server",
    runtime: "node",
    packageName: "example-mcp",
    ...overrides,
  };
}

function remoteConfig(overrides = {}) {
  return localConfig({
    packageName: "@toolsdk-remote/example-mcp",
    remotes: [{ type: "streamable-http", url: "https://example.com/mcp" }],
    ...overrides,
  });
}

test("accepts valid local and remote package configs", () => {
  assert.deepEqual(validatePackageConfig(localConfig(), "local.json"), []);
  assert.deepEqual(validatePackageConfig(remoteConfig(), "remote.json"), []);
});

test("accepts any number of package JSON changes", () => {
  const changes = Array.from({ length: 5 }, (_, index) => ({
    status: "A",
    path: `packages/developer-tools/example-${index}.json`,
  }));
  assert.deepEqual(validateRegistryPrScope(changes), []);
});

test("requires manual review when package JSON changes include unrelated files", () => {
  const issues = validateRegistryPrScope([
    { status: "A", path: "packages/developer-tools/example.json" },
    { status: "M", path: "README.md" },
  ]);
  assert.ok(
    issues.some((item) => item.code === "OUT_OF_SCOPE_CHANGE" && item.file === "README.md"),
  );
});

test("accepts package JSON deletion and rename but checks both rename paths", () => {
  assert.deepEqual(
    validateRegistryPrScope([
      { status: "D", path: "packages/developer-tools/old.json" },
      {
        status: "R",
        oldPath: "packages/developer-tools/first.json",
        path: "packages/developer-tools/second.json",
      },
    ]),
    [],
  );

  const issues = validateRegistryPrScope([
    {
      status: "R",
      oldPath: "packages/developer-tools/example.json",
      path: "docs/example.json",
    },
  ]);
  assert.ok(
    issues.some((item) => item.code === "OUT_OF_SCOPE_CHANGE" && item.file === "docs/example.json"),
  );
});

test("rejects non-registry changes and case-mismatched JSON extensions", () => {
  assert.equal(isRegistryJsonPath("packages/developer-tools/example.json"), true);
  assert.equal(isRegistryJsonPath("packages/developer-tools/example.JSON"), false);

  const issues = validateRegistryPrScope([{ status: "M", path: "docs/guide.md" }]);
  assert.ok(issues.some((item) => item.code === "OUT_OF_SCOPE_CHANGE"));
  assert.ok(issues.some((item) => item.code === "NO_PACKAGE_JSON_CHANGES"));
});

test("requires the ToolSDK prefix whenever remotes are present", () => {
  const issues = validatePackageConfig(remoteConfig({ packageName: "example-mcp" }), "remote.json");
  assert.ok(issues.some((item) => item.code === "REMOTE_PACKAGE_PREFIX"));
});

test("requires a remote endpoint for ToolSDK remote package names", () => {
  const issues = validatePackageConfig(
    localConfig({ packageName: "@toolsdk-remote/example-mcp" }),
    "remote.json",
  );
  assert.ok(issues.some((item) => item.code === "REMOTE_ENDPOINT_REQUIRED"));
});

test("rejects custom registry keys for remote packages", () => {
  const issues = validatePackageConfig(remoteConfig({ key: "legacy-package" }), "remote.json");
  assert.ok(issues.some((item) => item.code === "REMOTE_CUSTOM_KEY_FORBIDDEN"));
});

test("rejects unknown fields and private remote URLs", () => {
  const issues = validatePackageConfig(
    remoteConfig({
      unexpected: true,
      remotes: [{ type: "streamable-http", url: "http://localhost:3000/mcp" }],
    }),
    "remote.json",
  );
  assert.ok(issues.some((item) => item.code === "UNKNOWN_FIELD"));
  assert.ok(issues.some((item) => item.code === "REMOTE_HTTPS_REQUIRED"));
  assert.ok(issues.some((item) => item.code === "REMOTE_PRIVATE_HOST"));
});

test("supports environment metadata but rejects defaults for secrets", () => {
  const validIssues = validatePackageConfig(
    localConfig({
      env: {
        LOG_LEVEL: { description: "Log level", required: false, default: "info" },
        API_KEY: { description: "API key", required: true, secret: true },
      },
    }),
    "local.json",
  );
  assert.deepEqual(validIssues, []);

  const invalidIssues = validatePackageConfig(
    localConfig({
      env: {
        API_KEY: { description: "API key", required: true, secret: true, default: "token" },
      },
    }),
    "local.json",
  );
  assert.ok(invalidIssues.some((item) => item.code === "SECRET_DEFAULT_FORBIDDEN"));
});

test("rejects new key collisions but tolerates unchanged historical collisions", () => {
  const baseEntries = new Map([
    ["packages/a/first.json", localConfig({ packageName: "shared" })],
    ["packages/b/second.json", localConfig({ packageName: "shared" })],
  ]);
  const unchangedHead = new Map(baseEntries);
  assert.deepEqual(
    validateKeyChanges(baseEntries, unchangedHead, [
      { status: "M", path: "packages/a/first.json" },
    ]).filter((item) => item.level === "error"),
    [],
  );

  const addedHead = new Map(baseEntries);
  addedHead.set("packages/c/third.json", localConfig({ packageName: "shared" }));
  const issues = validateKeyChanges(baseEntries, addedHead, [
    { status: "A", path: "packages/c/third.json" },
  ]);
  assert.ok(issues.some((item) => item.code === "DUPLICATE_PACKAGE_KEY"));
  assert.ok(issues.some((item) => item.code === "EXISTING_KEY_REPLACEMENT"));
});

test("rejects moving an existing key into a newly added file", () => {
  const oldPath = "packages/a/first.json";
  const newPath = "packages/b/replacement.json";
  const config = localConfig({ packageName: "existing" });
  const baseEntries = new Map([[oldPath, config]]);
  const headEntries = new Map([[newPath, config]]);
  const issues = validateKeyChanges(baseEntries, headEntries, [
    { status: "D", path: oldPath },
    { status: "A", path: newPath },
  ]);
  assert.ok(issues.some((item) => item.code === "EXISTING_KEY_REPLACEMENT"));

  const renamedEntries = new Map([[newPath, config]]);
  const renameIssues = validateKeyChanges(baseEntries, renamedEntries, [
    { status: "R", oldPath, path: newPath },
  ]);
  assert.ok(renameIssues.some((item) => item.code === "EXISTING_KEY_REPLACEMENT"));
});

test("allows updates to retain their key and warns when it changes", () => {
  const file = "packages/a/first.json";
  const baseEntries = new Map([[file, localConfig({ packageName: "first" })]]);
  const retainedEntries = new Map([[file, localConfig({ packageName: "first", name: "First" })]]);
  assert.deepEqual(
    validateKeyChanges(baseEntries, retainedEntries, [{ status: "M", path: file }]),
    [],
  );

  const changedEntries = new Map([[file, localConfig({ packageName: "renamed" })]]);
  const issues = validateKeyChanges(baseEntries, changedEntries, [{ status: "M", path: file }]);
  assert.ok(issues.some((item) => item.code === "PACKAGE_KEY_CHANGED"));
});

test("requires new files to use a configured category and kebab-case filename", () => {
  const categories = new Set(["developer-tools"]);
  assert.deepEqual(
    validateNewPackagePath("packages/developer-tools/example-mcp.json", categories),
    [],
  );
  assert.equal(
    validateNewPackagePath("packages/unknown/Example_MCP.json", categories).filter(
      (item) => item.level === "error",
    ).length,
    2,
  );
});

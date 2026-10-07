import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { marker, renderBadgeReply, runBadgeReplies } from "./badge-replies.mjs";
import { generateCatalog } from "./generate-catalog.mjs";

test("indexes local and authenticated remote entries offline while retaining validation records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toolsdk-catalog-"));
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    for (const dir of ["indexes", "packages/developer-tools", "docs/_templates", "assets"])
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value));
    const config = {
      type: "mcp-server",
      runtime: "node",
      packageName: "example",
      description: "<script>alert(1)</script>",
    };
    write("packages/developer-tools/example.json", config);
    write("packages/developer-tools/remote.json", {
      ...config,
      packageName: "@toolsdk-remote/example",
      remotes: [
        { type: "streamable-http", url: "https://example.com/mcp", auth: { type: "oauth2" } },
      ],
    });
    write("packages/developer-tools/duplicate.json", config);
    write("packages/developer-tools/blacklisted.json", {
      ...config,
      packageName: "mcp-minecraft-remote",
    });
    write("indexes/packages-list.json", {
      example: {
        path: "developer-tools/example.json",
        category: "developer-tools",
        validated: true,
        tools: { search: {} },
      },
      removed: { path: "gone.json" },
    });
    fs.cpSync(path.join(source, "docs/_templates"), path.join(root, "docs/_templates"), {
      recursive: true,
    });
    fs.copyFileSync(path.join(source, "assets/logo.png"), path.join(root, "assets/logo.png"));
    write("package.json", { dependencies: { unchanged: "1.0.0" } });
    const index = generateCatalog(root);
    assert.deepEqual(Object.keys(index).sort(), ["@toolsdk-remote/example", "example"]);
    assert.equal(index.example.path, "developer-tools/example.json");
    assert.equal(index.example.validated, true);
    assert.deepEqual(index.example.tools, { search: {} });
    assert.equal(Object.hasOwn(index["@toolsdk-remote/example"], "validated"), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "package.json"))), {
      dependencies: { unchanged: "1.0.0" },
    });
    const site = fs.readFileSync(path.join(root, "catalog-site/index.html"), "utf8");
    assert.match(site, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(site, /@toolsdk-remote\/example/);
    const snapshot = fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8");
    generateCatalog(root);
    assert.equal(fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8"), snapshot);
    assert.match(
      fs.readFileSync(path.join(root, "docs/ALL-MCP-SERVERS.md"), "utf8"),
      /@toolsdk-remote\/example/,
    );
    fs.rmSync(path.join(root, "packages/developer-tools/duplicate.json"));
    fs.renameSync(
      path.join(root, "packages/developer-tools/example.json"),
      path.join(root, "packages/developer-tools/replacement.json"),
    );
    const replacement = generateCatalog(root);
    assert.equal(replacement.example.path, "developer-tools/replacement.json");
    assert.equal(Object.hasOwn(replacement.example, "validated"), false);
    assert.equal(Object.hasOwn(replacement.example, "tools"), false);
    write("packages/developer-tools/collision-a.json", { ...config, packageName: "new-collision" });
    write("packages/developer-tools/collision-b.json", { ...config, packageName: "new-collision" });
    const beforeFailure = fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8");
    assert.throws(() => generateCatalog(root), /Ambiguous registry identity "new-collision"/);
    assert.equal(
      fs.readFileSync(path.join(root, "indexes/packages-list.json"), "utf8"),
      beforeFailure,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("badge replies verify published JSON over HTTP and only post on explicit request", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toolsdk-badge-http-"));
  const key = "@toolsdk-remote/example";
  const relative = "developer-tools/example.json";
  const config = { type: "mcp-server", runtime: "node", packageName: key };
  const index = { [key]: { path: relative, category: "developer-tools" } };
  let publishedConfig = config;
  let publishedStatus = 200;
  const requests = [];
  const comments = [];
  const mutations = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(publishedStatus, { "Content-Type": "application/json" });
    response.end(JSON.stringify(request.url.includes("indexes/") ? index : publishedConfig));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    fs.mkdirSync(path.join(root, "indexes"));
    fs.mkdirSync(path.join(root, "packages/developer-tools"), { recursive: true });
    fs.writeFileSync(path.join(root, "indexes/packages-list.json"), JSON.stringify(index));
    fs.writeFileSync(path.join(root, "packages", relative), JSON.stringify(config));
    const gh = (endpoint, args = []) => {
      if (args.includes("POST")) {
        mutations.push(endpoint);
        comments.push({ body: marker });
        return {};
      }
      if (endpoint.includes("/comments")) return [comments];
      if (endpoint.includes("/files"))
        return [[{ status: "added", filename: `packages/${relative}` }]];
      return { merged_at: "2026-10-06T00:00:00Z", base: { ref: "main" } };
    };
    const options = {
      numbers: ["123"],
      root,
      gh,
      publishedUrl: `http://127.0.0.1:${server.address().port}`,
    };
    await runBadgeReplies(options);
    assert.equal(mutations.length, 0);
    assert.match(
      fs.readFileSync(path.join(root, "badge-replies/123.md"), "utf8"),
      /Thanks for contributing/,
    );
    assert.ok(requests.includes(`/packages/${relative}`));
    publishedConfig = { ...config, description: "Stale deployed content" };
    await runBadgeReplies({ ...options, post: true });
    assert.equal(mutations.length, 0);
    publishedConfig = config;
    await runBadgeReplies({ ...options, post: true });
    await runBadgeReplies({ ...options, post: true });
    assert.equal(mutations.length, 1);
    publishedStatus = 503;
    await assert.rejects(() => runBadgeReplies(options), /Published index returned 503/);
    assert.equal(mutations.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("badge replies use scoped registry keys and distinguish listing from runtime validation", () => {
  const body = renderBadgeReply([
    { key: "@toolsdk-remote/example", file: "developer-tools/example.json" },
  ]);
  assert.match(body, /badges\.toolsdk\.ai\/badge\/@toolsdk-remote\/example/);
  assert.match(body, /#%40toolsdk-remote%2Fexample/);
  assert.match(body, /packages\/developer-tools\/example\.json/);
  assert.match(body, /not an official endorsement/);
});

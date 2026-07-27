import path from "node:path";

export const REMOTE_PACKAGE_PREFIX = "@toolsdk-remote/";

const RUNTIMES = new Set(["node", "python", "java", "go", "docker"]);
const TOP_LEVEL_FIELDS = new Set([
  "type",
  "runtime",
  "packageName",
  "packageVersion",
  "bin",
  "binArgs",
  "remotes",
  "key",
  "name",
  "description",
  "readme",
  "url",
  "license",
  "logo",
  "author",
  "env",
]);
const OPTIONAL_STRING_FIELDS = [
  "packageVersion",
  "bin",
  "key",
  "name",
  "description",
  "readme",
  "url",
  "license",
  "logo",
  "author",
];

function issue(level, code, message, file, field) {
  return { level, code, message, file, field };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addUnknownFieldIssues(issues, value, allowedFields, file, fieldPrefix = "") {
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      const field = fieldPrefix ? `${fieldPrefix}.${key}` : key;
      issues.push(issue("error", "UNKNOWN_FIELD", `Unknown field "${field}"`, file, field));
    }
  }
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "::1") {
    return true;
  }

  const ipv4 = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const first = Number(ipv4[1]);
  const second = Number(ipv4[2]);
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function validateRemote(remote, index, file) {
  const issues = [];
  const field = `remotes.${index}`;
  if (!isObject(remote)) {
    return [issue("error", "INVALID_TYPE", `"${field}" must be an object`, file, field)];
  }

  addUnknownFieldIssues(issues, remote, new Set(["type", "url", "auth"]), file, field);
  if (remote.type !== "streamable-http") {
    issues.push(
      issue(
        "error",
        "INVALID_REMOTE_TYPE",
        `"${field}.type" must be "streamable-http"`,
        file,
        `${field}.type`,
      ),
    );
  }

  if (typeof remote.url !== "string" || remote.url.length === 0) {
    issues.push(
      issue(
        "error",
        "INVALID_TYPE",
        `"${field}.url" must be a non-empty string`,
        file,
        `${field}.url`,
      ),
    );
  } else {
    try {
      const url = new URL(remote.url);
      if (url.protocol !== "https:") {
        issues.push(
          issue(
            "error",
            "REMOTE_HTTPS_REQUIRED",
            "Remote MCP URLs must use HTTPS",
            file,
            `${field}.url`,
          ),
        );
      }
      if (isPrivateHostname(url.hostname)) {
        issues.push(
          issue(
            "error",
            "REMOTE_PRIVATE_HOST",
            "Remote MCP URLs cannot target localhost or a private network",
            file,
            `${field}.url`,
          ),
        );
      }
    } catch {
      issues.push(
        issue("error", "INVALID_URL", `"${field}.url" must be a valid URL`, file, `${field}.url`),
      );
    }
  }

  if (remote.auth !== undefined) {
    if (!isObject(remote.auth)) {
      issues.push(
        issue("error", "INVALID_TYPE", `"${field}.auth" must be an object`, file, `${field}.auth`),
      );
    } else {
      addUnknownFieldIssues(
        issues,
        remote.auth,
        new Set(["type", "scopes"]),
        file,
        `${field}.auth`,
      );
      if (remote.auth.type !== "oauth2") {
        issues.push(
          issue(
            "error",
            "INVALID_AUTH_TYPE",
            `"${field}.auth.type" must be "oauth2"`,
            file,
            `${field}.auth.type`,
          ),
        );
      }
      if (
        remote.auth.scopes !== undefined &&
        (!Array.isArray(remote.auth.scopes) ||
          remote.auth.scopes.some((scope) => typeof scope !== "string"))
      ) {
        issues.push(
          issue(
            "error",
            "INVALID_TYPE",
            `"${field}.auth.scopes" must be an array of strings`,
            file,
            `${field}.auth.scopes`,
          ),
        );
      }
    }
  }

  return issues;
}

export function validatePackageConfig(value, file = "(unknown)") {
  const issues = [];
  if (!isObject(value)) {
    return [issue("error", "INVALID_ROOT", "JSON root must be an object", file)];
  }

  addUnknownFieldIssues(issues, value, TOP_LEVEL_FIELDS, file);

  if (value.type !== "mcp-server") {
    issues.push(issue("error", "INVALID_TYPE", '"type" must be "mcp-server"', file, "type"));
  }
  if (!RUNTIMES.has(value.runtime)) {
    issues.push(
      issue(
        "error",
        "INVALID_RUNTIME",
        `"runtime" must be one of: ${[...RUNTIMES].join(", ")}`,
        file,
        "runtime",
      ),
    );
  }
  if (typeof value.packageName !== "string" || value.packageName.trim().length === 0) {
    issues.push(
      issue(
        "error",
        "INVALID_PACKAGE_NAME",
        '"packageName" must be a non-empty string',
        file,
        "packageName",
      ),
    );
  }

  for (const field of OPTIONAL_STRING_FIELDS) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      issues.push(issue("error", "INVALID_TYPE", `"${field}" must be a string`, file, field));
    }
  }

  if (
    value.binArgs !== undefined &&
    (!Array.isArray(value.binArgs) || value.binArgs.some((arg) => typeof arg !== "string"))
  ) {
    issues.push(
      issue("error", "INVALID_TYPE", '"binArgs" must be an array of strings', file, "binArgs"),
    );
  }

  if (value.env !== undefined) {
    if (!isObject(value.env)) {
      issues.push(issue("error", "INVALID_TYPE", '"env" must be an object', file, "env"));
    } else {
      for (const [name, definition] of Object.entries(value.env)) {
        const field = `env.${name}`;
        if (!isObject(definition)) {
          issues.push(issue("error", "INVALID_TYPE", `"${field}" must be an object`, file, field));
          continue;
        }
        addUnknownFieldIssues(
          issues,
          definition,
          new Set(["description", "required", "default", "secret"]),
          file,
          field,
        );
        if (typeof definition.description !== "string") {
          issues.push(
            issue(
              "error",
              "INVALID_TYPE",
              `"${field}.description" must be a string`,
              file,
              `${field}.description`,
            ),
          );
        }
        if (typeof definition.required !== "boolean") {
          issues.push(
            issue(
              "error",
              "INVALID_TYPE",
              `"${field}.required" must be a boolean`,
              file,
              `${field}.required`,
            ),
          );
        }
        if (definition.default !== undefined && typeof definition.default !== "string") {
          issues.push(
            issue(
              "error",
              "INVALID_TYPE",
              `"${field}.default" must be a string`,
              file,
              `${field}.default`,
            ),
          );
        }
        if (definition.secret !== undefined && typeof definition.secret !== "boolean") {
          issues.push(
            issue(
              "error",
              "INVALID_TYPE",
              `"${field}.secret" must be a boolean`,
              file,
              `${field}.secret`,
            ),
          );
        }
        if (definition.secret === true && definition.default !== undefined) {
          issues.push(
            issue(
              "error",
              "SECRET_DEFAULT_FORBIDDEN",
              `"${field}" cannot declare a default value when secret is true`,
              file,
              field,
            ),
          );
        }
      }
    }
  }

  const hasRemotes = Array.isArray(value.remotes) && value.remotes.length > 0;
  const hasRemotePrefix =
    typeof value.packageName === "string" && value.packageName.startsWith(REMOTE_PACKAGE_PREFIX);

  if (value.remotes !== undefined && !Array.isArray(value.remotes)) {
    issues.push(issue("error", "INVALID_TYPE", '"remotes" must be an array', file, "remotes"));
  } else if (Array.isArray(value.remotes)) {
    if (value.remotes.length === 0) {
      issues.push(
        issue(
          "error",
          "EMPTY_REMOTES",
          '"remotes" must contain at least one endpoint',
          file,
          "remotes",
        ),
      );
    }
    value.remotes.forEach((remote, index) => {
      issues.push(...validateRemote(remote, index, file));
    });
    const urls = value.remotes
      .map((remote) => remote?.url)
      .filter((url) => typeof url === "string");
    if (new Set(urls).size !== urls.length) {
      issues.push(
        issue(
          "error",
          "DUPLICATE_REMOTE_URL",
          "Remote URLs must be unique within a package",
          file,
          "remotes",
        ),
      );
    }
  }

  if (hasRemotes && !hasRemotePrefix) {
    issues.push(
      issue(
        "error",
        "REMOTE_PACKAGE_PREFIX",
        `Packages with remotes must use a packageName beginning with "${REMOTE_PACKAGE_PREFIX}"`,
        file,
        "packageName",
      ),
    );
  }
  if (hasRemotes && value.key !== undefined) {
    issues.push(
      issue(
        "error",
        "REMOTE_CUSTOM_KEY_FORBIDDEN",
        "Remote MCP packages must use packageName as their registry key",
        file,
        "key",
      ),
    );
  }
  if (hasRemotePrefix && !hasRemotes) {
    issues.push(
      issue(
        "error",
        "REMOTE_ENDPOINT_REQUIRED",
        `Packages beginning with "${REMOTE_PACKAGE_PREFIX}" must define remotes`,
        file,
        "remotes",
      ),
    );
  }

  return issues;
}

export function getPackageKey(config) {
  return typeof config?.key === "string" && config.key.length > 0
    ? config.key
    : config?.packageName;
}

function groupPathsByKey(entries) {
  const groups = new Map();
  for (const [file, config] of entries) {
    const key = getPackageKey(config);
    if (typeof key !== "string" || key.length === 0) continue;
    const paths = groups.get(key) ?? [];
    paths.push(file);
    groups.set(key, paths);
  }
  return groups;
}

function pairKey(key, left, right) {
  return `${key}\0${[left, right].sort().join("\0")}`;
}

function collisionPairs(groups) {
  const pairs = new Set();
  for (const [key, paths] of groups) {
    for (let left = 0; left < paths.length; left += 1) {
      for (let right = left + 1; right < paths.length; right += 1) {
        pairs.add(pairKey(key, paths[left], paths[right]));
      }
    }
  }
  return pairs;
}

export function validateKeyChanges(baseEntries, headEntries, changes) {
  const issues = [];
  const baseGroups = groupPathsByKey(baseEntries);
  const headGroups = groupPathsByKey(headEntries);
  const basePairs = collisionPairs(baseGroups);
  const changedPaths = new Set(
    changes.flatMap((change) => [change.path, change.oldPath]).filter(Boolean),
  );

  for (const [key, paths] of headGroups) {
    if (paths.length < 2) continue;
    for (let left = 0; left < paths.length; left += 1) {
      for (let right = left + 1; right < paths.length; right += 1) {
        const leftPath = paths[left];
        const rightPath = paths[right];
        if (
          !basePairs.has(pairKey(key, leftPath, rightPath)) &&
          (changedPaths.has(leftPath) || changedPaths.has(rightPath))
        ) {
          const file = changedPaths.has(leftPath) ? leftPath : rightPath;
          issues.push(
            issue(
              "error",
              "DUPLICATE_PACKAGE_KEY",
              `Package key "${key}" conflicts with ${file === leftPath ? rightPath : leftPath}`,
              file,
              "key",
            ),
          );
        }
      }
    }
  }

  for (const change of changes) {
    if (change.status !== "A") continue;
    const config = headEntries.get(change.path);
    const key = getPackageKey(config);
    const existingPaths = baseGroups.get(key) ?? [];
    if (existingPaths.length > 0) {
      issues.push(
        issue(
          "error",
          "EXISTING_KEY_REPLACEMENT",
          `New file cannot reuse existing package key "${key}" from ${existingPaths.join(", ")}`,
          change.path,
          "key",
        ),
      );
    }
  }

  for (const change of changes) {
    if (change.status !== "M") continue;
    const oldKey = getPackageKey(baseEntries.get(change.path));
    const newKey = getPackageKey(headEntries.get(change.path));
    if (oldKey && newKey && oldKey !== newKey) {
      issues.push(
        issue(
          "warning",
          "PACKAGE_KEY_CHANGED",
          `Package key changed from "${oldKey}" to "${newKey}" and requires manual review`,
          change.path,
          "key",
        ),
      );
    }
  }

  return issues;
}

export function validateNewPackagePath(file, categories) {
  const issues = [];
  const parts = file.split("/");
  if (parts.length !== 3 || parts[0] !== "packages" || !categories.has(parts[1])) {
    issues.push(
      issue(
        "error",
        "INVALID_PACKAGE_PATH",
        "New package files must be placed directly in a configured packages/<category> directory",
        file,
      ),
    );
  }

  const filename = path.basename(file);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(filename)) {
    issues.push(
      issue(
        "error",
        "INVALID_PACKAGE_FILENAME",
        "New package filenames must use lowercase kebab-case",
        file,
      ),
    );
  }
  return issues;
}

import type { RegistryResponse, RegistryServer } from "./types";

const REGISTRY_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";

export async function fetchOfficialRegistry(
  limit: number,
  cursor: string | null,
): Promise<RegistryResponse> {
  const url = new URL(REGISTRY_URL);
  url.searchParams.set("limit", limit.toString());
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  // console.log(`Fetching: ${url.toString()}`);

  // Add timeout (10 seconds) using AbortController
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: controller.signal });
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Network request timed out after 10 seconds");
    }
    throw new Error(`Network error: ${err.message || err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`Expected JSON response but got content-type: ${contentType}`);
  }

  let data: RegistryResponse;
  try {
    data = (await response.json()) as RegistryResponse;
  } catch (err) {
    throw new Error(`Failed to parse JSON response: ${err}`);
  }

  return data;
}

export async function fetchOfficialServers(maxServers = 1000): Promise<RegistryServer[]> {
  const allServers: RegistryServer[] = [];
  let cursor: string | null = null;
  const limit = 100;

  console.log(`Starting fetch loop (max: ${maxServers})...`);

  while (true) {
    try {
      const data = await fetchOfficialRegistry(limit, cursor);

      if (data.servers) {
        const extractedServers = data.servers
          .filter((item) => {
            // Filter out non-latest versions
            // The API returns _meta object where keys are UUIDs and values contain isLatest
            if (!item._meta) return true;
            return !Object.values(item._meta).some((meta: any) => meta?.isLatest === false);
          })
          .map((s) => s.server);
        allServers.push(...extractedServers);
        process.stdout.write(`.`); // Progress indicator
      }

      if (allServers.length >= maxServers) {
        console.log(`\nReached max servers limit (${maxServers}).`);
        break;
      }

      if (data.metadata?.nextCursor) {
        cursor = data.metadata.nextCursor;
      } else {
        break;
      }
    } catch (error) {
      console.error("Error fetching page:", error);
      break;
    }
  }

  console.log(`\nFetch complete. Total servers: ${allServers.length}`);
  return allServers.slice(0, maxServers);
}

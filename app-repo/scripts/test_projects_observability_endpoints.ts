import assert from "assert";
import http from "http";
import { withTestServer } from "./_test_server_harness";

interface HttpResult {
  status: number;
  body: any;
}

function requestJson(
  method: "GET" | "POST",
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body === undefined ? "" : JSON.stringify(body);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload).toString() } : {}),
          ...headers,
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode || 0,
              body: data ? JSON.parse(data) : {},
            });
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function run(): Promise<void> {
  await withTestServer({ devMode: true, testTimeoutMs: 25000 }, async ({ baseUrl }) => {
    const devHeaders = {
      "x-dev-auth": JSON.stringify({ userId: "dev-user", roles: ["OWNER"] }),
    };

    const created = await requestJson(
      "POST",
      `${baseUrl}/api/projects`,
      { name: `Observability Test ${Date.now()}` },
      devHeaders,
    );
    assert.equal(created.status, 200, "POST /api/projects should return 200");
    assert.equal(created.body?.ok, true, "POST /api/projects should return ok=true");
    const projectId = created.body?.data?.item?.id;
    assert.equal(typeof projectId, "string", "POST /api/projects should return project id");

    const whoAmIAnonymous = await requestJson("GET", `${baseUrl}/api/whoami`);
    assert.equal(whoAmIAnonymous.status, 200, "GET /api/whoami anonymous should return 200");
    assert.equal(whoAmIAnonymous.body?.ok, true, "GET /api/whoami anonymous should return ok=true");
    assert.equal(whoAmIAnonymous.body?.data?.item?.isAuthenticated, false, "Anonymous whoami should be unauthenticated");
    assert.equal(whoAmIAnonymous.body?.data?.item?.userId, null, "Anonymous whoami userId should be null");

    const whoAmIDev = await requestJson("GET", `${baseUrl}/api/whoami`, undefined, devHeaders);
    assert.equal(whoAmIDev.status, 200, "GET /api/whoami dev auth should return 200");
    assert.equal(whoAmIDev.body?.ok, true, "GET /api/whoami dev auth should return ok=true");
    assert.equal(whoAmIDev.body?.data?.item?.userId, "dev-user", "Dev whoami should resolve user id");
    assert.equal(whoAmIDev.body?.data?.item?.isAuthenticated, true, "Dev whoami should be authenticated");
    assert.equal(Array.isArray(whoAmIDev.body?.data?.item?.roles), true, "Dev whoami should include roles array");

    const effectiveDenied = await requestJson(
      "GET",
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/effective-permissions`,
    );
    assert.equal(effectiveDenied.status, 403, "effective-permissions without auth should return 403");
    assert.equal(Boolean(effectiveDenied.body?.data?.item?.permissions), false, "403 response should not include permissions payload");

    const effectiveAllowed = await requestJson(
      "GET",
      `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/effective-permissions`,
      undefined,
      devHeaders,
    );
    assert.equal(effectiveAllowed.status, 200, "effective-permissions with auth should return 200");
    assert.equal(effectiveAllowed.body?.ok, true, "effective-permissions with auth should return ok=true");
    assert.equal(effectiveAllowed.body?.data?.item?.projectId, projectId, "effective-permissions should match project id");
    assert.equal(Array.isArray(effectiveAllowed.body?.data?.item?.permissions), true, "effective-permissions should include permissions array");

    const permissions = effectiveAllowed.body?.data?.item?.permissions as string[];
    const sortedPermissions = [...permissions].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(permissions, sortedPermissions, "effective permissions should be stably sorted");
    assert.equal(permissions.length > 0, true, "effective permissions should not be empty for OWNER context");
    const roles = effectiveAllowed.body?.data?.item?.roles as string[];
    assert.equal(Array.isArray(roles), true, "effective-permissions should include roles array");
    assert.equal(roles.includes("OWNER"), true, "effective-permissions should include OWNER role");
  });
}

const hardTimeout = setTimeout(() => {
  console.error("test_projects_observability_endpoints timed out");
  process.exit(1);
}, 30000);

run()
  .then(() => {
    clearTimeout(hardTimeout);
    process.exit(0);
  })
  .catch((error) => {
    clearTimeout(hardTimeout);
    console.error("test_projects_observability_endpoints failed", error);
    process.exit(1);
  });

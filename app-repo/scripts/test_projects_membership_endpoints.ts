import assert from "assert";
import http from "http";
import { withTestServer } from "./_test_server_harness";

interface HttpResult {
  status: number;
  body: any;
}

function requestJson(
  method: "GET" | "POST" | "DELETE",
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
      { name: `Registry Test ${Date.now()}` },
      devHeaders,
    );
    assert.equal(created.status, 200, "POST /api/projects should return 200");
    assert.equal(created.body?.ok, true, "POST /api/projects should return ok=true");
    const projectId = created.body?.data?.item?.id;
    assert.equal(typeof projectId, "string", "POST /api/projects should return a project id");

    const listed = await requestJson("GET", `${baseUrl}/api/projects`, undefined, devHeaders);
    assert.equal(listed.status, 200, "GET /api/projects should return 200");
    assert.equal(listed.body?.ok, true, "GET /api/projects should return ok=true");
    const listedIds = Array.isArray(listed.body?.data?.items) ? listed.body.data.items.map((item: any) => item.id) : [];
    assert.equal(listedIds.includes(projectId), true, "GET /api/projects should include created project");

    const memberUser = `member-${Date.now()}@local`;
    const beforeMembers = await requestJson(
      "GET",
      `${baseUrl}/api/projects/${projectId}/members`,
      undefined,
      devHeaders,
    );
    assert.equal(beforeMembers.status, 200, "GET members before add should return 200");
    assert.equal(beforeMembers.body?.ok, true, "GET members before add should return ok=true");
    const beforeItems = Array.isArray(beforeMembers.body?.data?.items)
      ? beforeMembers.body.data.items
      : [];
    const beforeTarget = beforeItems.find((item: any) => item?.userId === memberUser);
    assert.equal(Boolean(beforeTarget), false, "Member should not exist before add");

    const added = await requestJson(
      "POST",
      `${baseUrl}/api/projects/${projectId}/members`,
      { memberUserIdOrEmail: memberUser, role: "VIEWER" },
      devHeaders,
    );
    assert.equal(added.status, 200, "POST /api/projects/:projectId/members should return 200");
    assert.equal(added.body?.ok, true, "POST /api/projects/:projectId/members should return ok=true");

    const members = await requestJson(
      "GET",
      `${baseUrl}/api/projects/${projectId}/members`,
      undefined,
      devHeaders,
    );
    assert.equal(members.status, 200, "GET /api/projects/:projectId/members should return 200");
    assert.equal(members.body?.ok, true, "GET /api/projects/:projectId/members should return ok=true");
    assert.equal(Array.isArray(members.body?.data?.items), true, "GET /api/projects/:projectId/members should return items array");
    const membersAfterAdd = Array.isArray(members.body?.data?.items)
      ? members.body.data.items
      : [];
    const addedMember = membersAfterAdd.find((item: any) => item?.userId === memberUser);
    assert.equal(Boolean(addedMember), true, "Members list should contain added member");
    assert.equal(addedMember?.role, "VIEWER", "Added member should have VIEWER role");
    assert.equal(membersAfterAdd.length, beforeItems.length + 1, "Members count should increase by one after add");

    const removed = await requestJson(
      "DELETE",
      `${baseUrl}/api/projects/${projectId}/members/${encodeURIComponent(memberUser)}`,
      undefined,
      devHeaders,
    );
    assert.equal(removed.status, 200, "DELETE /api/projects/:projectId/members/:memberUserIdOrEmail should return 200");
    assert.equal(removed.body?.ok, true, "DELETE /api/projects/:projectId/members/:memberUserIdOrEmail should return ok=true");

    const membersAfterDelete = await requestJson(
      "GET",
      `${baseUrl}/api/projects/${projectId}/members`,
      undefined,
      devHeaders,
    );
    assert.equal(membersAfterDelete.status, 200, "GET members after delete should return 200");
    assert.equal(Array.isArray(membersAfterDelete.body?.data?.items), true, "GET members after delete should return items array");
    const afterDeleteItems = Array.isArray(membersAfterDelete.body?.data?.items)
      ? membersAfterDelete.body.data.items
      : [];
    const removedMember = afterDeleteItems.find((item: any) => item?.userId === memberUser);
    assert.equal(Boolean(removedMember), false, "Members list should not contain removed member");
    assert.equal(afterDeleteItems.length, beforeItems.length, "Members count should return to pre-add value after delete");
  });
}

const hardTimeout = setTimeout(() => {
  console.error("test_projects_membership_endpoints timed out");
  process.exit(1);
}, 30000);

run()
  .then(() => {
    clearTimeout(hardTimeout);
    process.exit(0);
  })
  .catch((error) => {
    clearTimeout(hardTimeout);
    console.error("test_projects_membership_endpoints failed", error);
    process.exit(1);
  });

import assert from "assert";
import http from "http";
import { withTestServer } from "./_test_server_harness";

interface HttpResult {
  status: number;
  body: any;
}

function requestJson(
  method: "POST",
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body ?? {});

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
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
    req.write(payload);
    req.end();
  });
}

async function run(): Promise<void> {
  await withTestServer({ devMode: true, testTimeoutMs: 20000 }, async ({ baseUrl }) => {
    const projectId = `proj-create-api-${Date.now()}`;

    const unauthorizedHeaders = {
      "x-dev-auth": JSON.stringify({ userId: `${projectId}-viewer`, roles: ["VIEWER"] }),
    };

    const authorizedHeaders = {
      "x-dev-auth": JSON.stringify({ userId: `${projectId}-owner`, roles: ["OWNER"] }),
    };

    const unauthorizedFilesCreate = await requestJson(
      "POST",
      `${baseUrl}/api/projects/${projectId}/files`,
      {
        storageKey: `projects/${projectId}/files/a.bin`,
        filename: "a.bin",
      },
      unauthorizedHeaders,
    );
    assert.equal(unauthorizedFilesCreate.status, 403, "unauthorized POST /files should return 403");

    const authorizedFilesCreate = await requestJson(
      "POST",
      `${baseUrl}/api/projects/${projectId}/files`,
      {
        storageKey: `projects/${projectId}/files/a.bin`,
        filename: "a.bin",
        mimeType: "application/octet-stream",
        sizeBytes: 123,
        metadata: { source: "create-test" },
      },
      authorizedHeaders,
    );
    assert.equal(authorizedFilesCreate.status, 200, "authorized POST /files should return 200");
    assert.equal(authorizedFilesCreate.body?.ok, true, "authorized POST /files should return ok=true");
    assert.equal(typeof authorizedFilesCreate.body?.data?.item?.id, "string", "created file should include id");
    assert.equal(authorizedFilesCreate.body?.data?.item?.storageKey, `projects/${projectId}/files/a.bin`);

    const invalidCommentsCreate = await requestJson(
      "POST",
      `${baseUrl}/api/projects/${projectId}/comments`,
      {
        targetType: "file",
        body: "missing target id",
      },
      authorizedHeaders,
    );
    assert.equal(invalidCommentsCreate.status, 400, "POST /comments missing required fields should return 400");

    const authorizedCommentCreate = await requestJson(
      "POST",
      `${baseUrl}/api/projects/${projectId}/comments`,
      {
        targetType: "file",
        targetId: "file-1",
        body: "hello",
        attachments: ["att-1"],
        metadata: { severity: "info" },
      },
      authorizedHeaders,
    );
    assert.equal(authorizedCommentCreate.status, 200, "authorized POST /comments should return 200");
    assert.equal(authorizedCommentCreate.body?.ok, true, "authorized POST /comments should return ok=true");
    assert.equal(typeof authorizedCommentCreate.body?.data?.item?.id, "string", "created comment should include id");
    assert.equal(authorizedCommentCreate.body?.data?.item?.body, "hello");
  });
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("test_files_comments_create_endpoints failed", error);
    process.exit(1);
  });

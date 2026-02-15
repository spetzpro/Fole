import assert from "assert";
import http from "http";
import path from "path";
import { withTestServer } from "./_test_server_harness";
import { CoreRuntime } from "../src/core/CoreRuntime";
import { ProjectDb } from "../src/core/ProjectDb";

interface HttpResult {
  status: number;
  body: any;
}

function getJson(url: string, headers: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
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
          } catch (error) {
            reject(new Error(`Failed to parse JSON response: ${data}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("GET request timeout"));
    });
    req.end();
  });
}

async function seedProjectData(projectId: string): Promise<void> {
  const runtime = new CoreRuntime({ storageRoot: path.join(process.cwd(), "localstorage") });
  const projectDb = new ProjectDb(runtime);
  const conn = await projectDb.getConnection(projectId);

  await conn.executeCommand({
    type: "ddl",
    text: `CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL
    )`,
    parameters: [],
  });

  await conn.executeCommand({
    type: "ddl",
    text: `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    )`,
    parameters: [],
  });

  await conn.executeCommand({
    type: "ddl",
    text: `CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      attachments_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )`,
    parameters: [],
  });

  const authorizedUserId = `${projectId}-owner`;

  await conn.executeCommand({
    type: "delete",
    text: "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
    parameters: [projectId, authorizedUserId],
  });

  await conn.executeCommand({
    type: "insert",
    text: "INSERT INTO project_members (project_id, user_id, role_id) VALUES (?, ?, ?)",
    parameters: [projectId, authorizedUserId, "OWNER"],
  });

  await conn.executeCommand({
    type: "delete",
    text: "DELETE FROM files WHERE project_id = ?",
    parameters: [projectId],
  });

  await conn.executeCommand({
    type: "insert",
    text:
      "INSERT INTO files (id, project_id, storage_key, filename, mime_type, size_bytes, metadata_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    parameters: [
      `${projectId}-file-1`,
      projectId,
      `projects/${projectId}/files/file-1.bin`,
      "file-1.bin",
      "application/octet-stream",
      512,
      JSON.stringify({ source: "server-test" }),
      "2026-02-15T00:00:00.000Z",
      authorizedUserId,
    ],
  });

  await conn.executeCommand({
    type: "delete",
    text: "DELETE FROM comments WHERE project_id = ?",
    parameters: [projectId],
  });

  await conn.executeCommand({
    type: "insert",
    text:
      "INSERT INTO comments (id, project_id, target_type, target_id, author_user_id, body, attachments_json, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    parameters: [
      `${projectId}-comment-1`,
      projectId,
      "file",
      `${projectId}-file-1`,
      authorizedUserId,
      "seed comment",
      JSON.stringify([]),
      JSON.stringify({ pinned: false }),
      "2026-02-15T00:00:00.000Z",
    ],
  });
}

async function run(): Promise<void> {
  await withTestServer({ devMode: true, testTimeoutMs: 20000 }, async ({ baseUrl }) => {
    const projectId = `proj-read-api-${Date.now()}`;
    const authorizedUserId = `${projectId}-owner`;

    await seedProjectData(projectId);

    const authorizedHeader = {
      "x-dev-auth": JSON.stringify({ userId: authorizedUserId, roles: ["OWNER"] }),
    };

    const unauthorizedHeader = {
      "x-dev-auth": JSON.stringify({ userId: `${projectId}-outsider`, roles: [] }),
    };

    const filesOk = await getJson(`${baseUrl}/api/projects/${projectId}/files`, authorizedHeader);
    assert.equal(filesOk.status, 200, "authorized files list should return 200");
    assert.equal(filesOk.body?.ok, true, "authorized files list should return ok=true");
    assert.equal(Array.isArray(filesOk.body?.data?.items), true, "authorized files list should return items array");

    const filesForbidden = await getJson(`${baseUrl}/api/projects/${projectId}/files`, unauthorizedHeader);
    assert.equal(filesForbidden.status, 403, "unauthorized files list should return 403");

    const commentsMissingQuery = await getJson(
      `${baseUrl}/api/projects/${projectId}/comments?targetType=file`,
      authorizedHeader,
    );
    assert.equal(commentsMissingQuery.status, 400, "comments list missing targetId should return 400");
    assert.equal(commentsMissingQuery.body?.ok, false, "comments list missing params should return ok=false");
  });
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("test_files_comments_read_endpoints failed", error);
    process.exit(1);
  });

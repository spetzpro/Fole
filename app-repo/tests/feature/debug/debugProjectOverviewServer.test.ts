import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { URL } from "url";

// Import the real server module but mock its dependencies so we don't hit disk.
import * as ServerModule from "../../../src/server/debugProjectOverviewServer";
import type { ProjectListItem } from "../../../src/feature/debug/ProjectOverviewService";

// We'll spy on createServices to inject fakes.

function makeOk<T>(value: T) {
  return { ok: true as const, value };
}

function makeErr(error: any) {
  return { ok: false as const, error };
}

async function requestJson(baseUrl: string, path: string, options: http.RequestOptions & { method?: string } = {}) {
  const url = new URL(path, baseUrl);

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request(
      {
        method: options.method || "GET",
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            const body = text ? JSON.parse(text) : null;
            resolve({ status: res.statusCode || 0, body });
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

describe("debugProjectOverviewServer HTTP API", () => {
  let server: http.Server | null = null;
  let baseUrl: string;
  let createServicesSpy: any;

  beforeEach(async () => {
    createServicesSpy = vi.spyOn(ServerModule as any, "createServices");
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    vi.restoreAllMocks();
  });

  async function startServer(servicesImpl: any) {
    createServicesSpy.mockReturnValue(servicesImpl);

    const handler = (ServerModule as any).handleRequest;
    server = http.createServer((req, res) => {
      handler(req, res, servicesImpl).catch((err: any) => {
        // eslint-disable-next-line no-console
        console.error("Unhandled error in test debugProjectOverviewServer", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
      });
    });

    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server!.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }

  it("GET /api/debug/projects returns ok:true with value on success", async () => {
    const fakeProjects: ProjectListItem[] = [
      { id: "p1", name: "Project 1" },
      { id: "p2", name: "Project 2" },
    ];

    const listProjectsForCurrentUser = vi.fn().mockResolvedValue(makeOk(fakeProjects));
    const ensureDevSandboxProjectForCurrentUser = vi.fn();

    await startServer({ projectOverviewService: { listProjectsForCurrentUser, ensureDevSandboxProjectForCurrentUser } });

    const res = await requestJson(baseUrl, "/api/debug/projects");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, value: fakeProjects });
    expect(listProjectsForCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("GET /api/debug/projects soft-fails PROJECT_LIST_FAILED with warnings", async () => {
    const error = { code: "PROJECT_LIST_FAILED", message: "projects root missing" };
    const listProjectsForCurrentUser = vi.fn().mockResolvedValue(makeErr(error));

    await startServer({ projectOverviewService: { listProjectsForCurrentUser } });

    const res = await requestJson(baseUrl, "/api/debug/projects");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.value).toEqual([]);
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(res.body.warnings[0].code).toBe("PROJECT_LIST_FAILED");
  });

  it("POST /api/debug/projects/dev-sandbox creates a dev sandbox project on first call", async () => {
    const sandboxProject: ProjectListItem = { id: "sandbox-1", name: "Dev Sandbox Project" };
    const ensureDevSandboxProjectForCurrentUser = vi.fn().mockResolvedValue(sandboxProject);
    const listProjectsForCurrentUser = vi.fn();

    await startServer({ projectOverviewService: { listProjectsForCurrentUser, ensureDevSandboxProjectForCurrentUser } });

    const res = await requestJson(baseUrl, "/api/debug/projects/dev-sandbox", { method: "POST" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.value).toEqual(sandboxProject);
    expect(ensureDevSandboxProjectForCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("POST /api/debug/projects/dev-sandbox is idempotent when same project is reused", async () => {
    const sandboxProject: ProjectListItem = { id: "sandbox-1", name: "Dev Sandbox Project" };
    const ensureDevSandboxProjectForCurrentUser = vi.fn().mockResolvedValue(sandboxProject);
    const listProjectsForCurrentUser = vi.fn();

    await startServer({ projectOverviewService: { listProjectsForCurrentUser, ensureDevSandboxProjectForCurrentUser } });

    const res1 = await requestJson(baseUrl, "/api/debug/projects/dev-sandbox", { method: "POST" });
    const res2 = await requestJson(baseUrl, "/api/debug/projects/dev-sandbox", { method: "POST" });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.value).toEqual(sandboxProject);
    expect(res2.body.value).toEqual(sandboxProject);
    // Server delegates idempotence to the service; here we assert that
    // two calls go through the same mocked implementation, which can
    // be wired to reuse the same project.
    expect(ensureDevSandboxProjectForCurrentUser).toHaveBeenCalledTimes(2);
  });
});

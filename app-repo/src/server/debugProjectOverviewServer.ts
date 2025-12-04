// Dev/debug-only HTTP server for project overview.
// This server is NOT a production entrypoint.

import http from "http";
import { parse } from "url";
import { promises as fs } from "fs";
import * as path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import type { AppError, Result } from "../core/foundation/CoreTypes";
import { CoreRuntime } from "../core/CoreRuntime";
import { ProjectDb } from "../core/ProjectDb";
import { createProjectMembershipService } from "../core/ProjectMembershipService";
import { getPermissionService } from "../core/permissions/PermissionService";
import type { PermissionService } from "../core/permissions/PermissionService";
import { DefaultFeatureMapService } from "../feature/map/FeatureMapService";
import { createProjectOverviewService } from "../feature/debug/ProjectOverviewService";
import { getCurrentUserProvider, setCurrentUserProvider, type CurrentUserProvider } from "../core/auth/CurrentUserProvider";

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(json);
}

function mapAppErrorToStatus(error: AppError): number {
  if (error.code === "PERMISSION_DENIED") {
    const reasonCode = (error.details as any)?.reasonCode;
    if (reasonCode === "NOT_AUTHENTICATED") {
      return 401;
    }
    return 403;
  }

  if (error.code === "NOT_FOUND") {
    return 404;
  }

  return 500;
}

function parsePath(url: string | undefined): string[] {
  if (!url) return [];
  const parsed = parse(url);
  return (parsed.pathname ?? "").split("/").filter(Boolean);
}

// Dev/debug-only CurrentUser override. This server is NOT a production entrypoint.
// It forces a synthetic authenticated user so that debug APIs can be exercised
// without wiring a full auth flow.
const devCurrentUserProvider: CurrentUserProvider = {
  getCurrentUser() {
    return {
      id: "dev-debug-user",
      displayName: "Dev Debug User",
      email: "dev@example.com",
      roles: ["ADMIN", "OWNER"],
    } as any;
  },
  isAuthenticated() {
    return true;
  },
};

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  services: ReturnType<typeof createServices>,
): Promise<void> {
  const { method, url } = req;
  const segments = parsePath(url);

  // Serve the static debug UI shell for project overview.
  if (method === "GET" && segments.length === 2 && segments[0] === "debug" && segments[1] === "project-overview") {
    const htmlPath = path.join(__dirname, "debugProjectOverviewShell.html");
    try {
      const html = await fs.readFile(htmlPath, "utf8");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    } catch (err) {
      sendJson(res, 500, { ok: false, error: { code: "INTERNAL_ERROR", message: "Failed to load debug UI shell" } });
    }
    return;
  }

  if (method === "GET" && segments.length === 3 && segments[0] === "api" && segments[1] === "debug" && segments[2] === "projects") {
    const result = await services.projectOverviewService.listProjectsForCurrentUser();
    if (result.ok) {
      sendJson(res, 200, { ok: true, value: result.value });
    } else {
      const status = mapAppErrorToStatus(result.error);
      sendJson(res, status, { ok: false, error: result.error });
    }
    return;
  }

  if (
    method === "GET" &&
    segments.length === 5 &&
    segments[0] === "api" &&
    segments[1] === "debug" &&
    segments[2] === "projects" &&
    segments[4] === "overview"
  ) {
    const projectId = segments[3];
    const result = await services.projectOverviewService.getProjectOverviewForCurrentUser(projectId);
    if (result.ok) {
      sendJson(res, 200, { ok: true, value: result.value });
    } else {
      const status = mapAppErrorToStatus(result.error);
      sendJson(res, status, { ok: false, error: result.error });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: "Route not found" } });
}

function createServices() {
  // Dev-only override: ensure debug server always sees an authenticated user.
  // This does not affect production entrypoints.
  setCurrentUserProvider(devCurrentUserProvider);

  const storageRoot = process.cwd();
  const runtime = new CoreRuntime({ storageRoot });
  const projectRegistry = runtime.projectRegistry;
  const projectDb = new ProjectDb(runtime);
  const membershipService = createProjectMembershipService(projectDb);
  const permissionService: PermissionService = getPermissionService();

  const featureMapService = new DefaultFeatureMapService({
    projectDb,
    permissionService,
  });

  const projectOverviewService = createProjectOverviewService({
    projectRegistry,
    membershipService,
    featureMapService,
  });

  return {
    projectOverviewService,
  };
}

async function main() {
  const services = createServices();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, services).catch((err) => {
      // Best-effort error handler; this is dev/debug-only.
      // eslint-disable-next-line no-console
      console.error("Unhandled error in debugProjectOverviewServer", err);
      sendJson(res, 500, { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    });
  });

  const port = 4000;
  server.listen(port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`Debug Project Overview API listening on http://127.0.0.1:${port}`);
  });
}

// Run only when executed directly, not when imported.
if (require.main === module) {
  // eslint-disable-next-line no-floating-promises
  main();
}

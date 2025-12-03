// Dev/debug-only HTTP server for project overview.
// This server is NOT a production entrypoint.

import http from "http";
import { parse } from "url";
import type { IncomingMessage, ServerResponse } from "http";
import type { AppError, Result } from "../../core/foundation/CoreTypes";
import { createProjectRegistry } from "../../core/storage/modules/ProjectRegistry";
import { createProjectPathResolver } from "../../core/storage/modules/ProjectPathResolver";
import { createProjectMembershipService } from "../../core/ProjectMembershipService";
import { getPermissionService } from "../../core/permissions/PermissionService";
import type { PermissionService } from "../../core/permissions/PermissionService";
import { createProjectDb } from "../../core/ProjectDb";
import { DefaultFeatureMapService } from "../../feature/map/FeatureMapService";
import { createProjectOverviewService } from "../../feature/debug/ProjectOverviewService";

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

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  services: ReturnType<typeof createServices>,
): Promise<void> {
  const { method, url } = req;
  const segments = parsePath(url);

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
  const projectRoot = process.cwd();
  const pathResolver = createProjectPathResolver({ rootDir: projectRoot });
  const projectRegistry = createProjectRegistry(pathResolver);
  const projectDb = createProjectDb(pathResolver);
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

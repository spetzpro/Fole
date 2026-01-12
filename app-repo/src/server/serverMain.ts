import http from "http";
import * as path from "path";
import { parse } from "url";
import { Router } from "./Router";
import { ShellConfigRepository } from "./ShellConfigRepository";
import { ShellConfigValidator } from "./ShellConfigValidator";
import { ShellConfigDeployer } from "./ShellConfigDeployer";
import { ModeGate } from "./ModeGate";

import { evaluateBoolean, ExpressionContext } from "./ExpressionEvaluator";

// Default to port 3000, or use env var
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function main() {
  const router = new Router();
  const cwd = process.cwd();
  const configRepo = new ShellConfigRepository(cwd);
  const validator = new ShellConfigValidator(cwd);
  const deployer = new ShellConfigDeployer(configRepo, validator, cwd);
  
  await configRepo.ensureInitialized();


  // Health check endpoint
  router.get("/api/health", (_req, res) => {
    router.json(res, 200, { ok: true });
  });

  // Shell Config Endpoints
  router.get("/api/config/shell/status", async (_req, res) => {
    try {
      const active = await configRepo.getActivePointer();
      if (!active) {
        return router.json(res, 404, { error: "No active configuration found" });
      }
      router.json(res, 200, active);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error fetching active status", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.get("/api/config/shell/active", async (_req, res) => {
    try {
      const active = await configRepo.getActivePointer();
      if (!active) {
        return router.json(res, 404, { error: "No active configuration found" });
      }
      router.json(res, 200, active);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error fetching active config", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.get("/api/config/shell/bundle", async (req, res) => {
    const urlParts = parse(req.url || "", true);
    let versionId = urlParts.query.versionId as string;

    if (!versionId) {
      const active = await configRepo.getActivePointer();
      if (!active) {
        return router.json(res, 404, { error: "No active configuration found" });
      }
      versionId = active.activeVersionId;
    }

    try {
      const bundle = await configRepo.getBundle(versionId);

      // Validate on read
      const report = await validator.validateBundle(bundle.bundle);
      if (report.status !== "valid") {
        return router.json(res, 400, {
          error: "Bundle validation failed",
          report
        });
      }

      router.json(res, 200, bundle);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return router.json(res, 404, { error: err.message });
      }
      // eslint-disable-next-line no-console
      console.error("Error fetching bundle", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.get("/api/config/shell/versions/:versionId", async (_req, res, params) => {
    const versionId = params.versionId;
    if (!versionId) {
      return router.json(res, 400, { error: "Missing versionId" });
    }

    try {
      const bundle = await configRepo.getBundle(versionId);

      // Validate on read
      const report = await validator.validateBundle(bundle.bundle);
      if (report.status !== "valid") {
        return router.json(res, 400, {
          error: "Bundle validation failed",
          report
        });
      }

      router.json(res, 200, bundle);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return router.json(res, 404, { error: err.message });
      }
      // eslint-disable-next-line no-console
      console.error("Error fetching bundle", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.post("/api/config/shell/deploy", async (req, res, _params, ctx) => {
    try {
      const urlParts = parse(req.url || "", true);
      const forceQuery = urlParts.query.forceInvalid === "1";

      const body = await router.readJsonBody(req);
      if (!body.bundle) {
        return router.json(res, 400, { error: "Missing bundle in request body" });
      }
      
      const forceInvalid = body.forceInvalid === true || forceQuery;

      if (forceInvalid) {
         const canDev = ModeGate.canUseDeveloperMode(ctx);
         
         if (!canDev) {
             // Strict 403 if mode gate fails
             return router.json(res, 403, { 
               error: "Forbidden: Developer Mode required for force-invalid deployment.", 
               modeDetails: {
                  canUseDeveloperMode: false,
                  reason: "Requires both FOLE_DEV_ALLOW_MODE_OVERRIDES=1 and FOLE_DEV_FORCE_INVALID_CONFIG=1 on localhost"
               }
             });
         }
      }

      const result = await deployer.deploy(body.bundle, body.message, forceInvalid);
      router.json(res, 200, result);
    } catch (err: any) {
      if (err.status) {
        return router.json(res, err.status, { error: err.message, report: err.report });
      }
      // eslint-disable-next-line no-console
      console.error("Deploy error", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.post("/api/config/shell/rollback", async (req, res) => {
    try {
      const body = await router.readJsonBody(req);
      if (!body.versionId) {
        return router.json(res, 400, { error: "Missing versionId" });
      }

      const result = await deployer.rollback(body.versionId);
      router.json(res, 200, result);
    } catch (err: any) {
       if (err.status) {
        return router.json(res, err.status, { error: err.message });
      }
      // eslint-disable-next-line no-console
      console.error("Rollback error", err);
      router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.get("/api/routing/resolve/:entrySlug", async (req, res, params) => {
    let entrySlug = params.entrySlug || "";
    entrySlug = entrySlug.trim().toLowerCase();

    try {
        const active = await configRepo.getActivePointer();
        if (!active) {
            return router.json(res, 404, { error: "No active configuration" });
        }
        
        const bundleContainer = await configRepo.getBundle(active.activeVersionId);
        const bundle = bundleContainer.bundle;

        // Find routing block
        let routingBlock: any = null;
        for (const blockId of Object.keys(bundle.blocks)) {
            if (bundle.blocks[blockId].blockType === "shell.infra.routing") {
                routingBlock = bundle.blocks[blockId].data;
                break;
            }
        }

        if (!routingBlock) {
             return router.json(res, 500, { error: "Routing block missing in bundle" });
        }

        const route = routingBlock.routes[entrySlug];
        if (!route || route.enabled === false) {
            return router.json(res, 404, { entrySlug, allowed: false, status: 404, reason: "Route not found or disabled" });
        }

        // Access Policy Check
        // Construct Context
        const authHeader = req.headers["x-dev-auth"] as string | undefined;
        const permissions = new Set<string>();
        const roles = new Set<string>();

        if (authHeader) {
            try {
                // Support simple JSON: { "permissions": ["a"], "roles": ["b"] }
                const json = JSON.parse(authHeader);
                if (Array.isArray(json.permissions)) json.permissions.forEach((p: any) => permissions.add(String(p)));
                if (Array.isArray(json.roles)) json.roles.forEach((r: any) => roles.add(String(r)));
            } catch {
                // Ignore parse errors, treat as empty
            }
        }

        const ctx: ExpressionContext = {
            permissions,
            roles,
            ui: {},
            data: {}
        };

        const policy = route.accessPolicy || {};

        // 1. Anonymous Check
        if (policy.anonymous) {
             return router.json(res, 200, { entrySlug, allowed: true, status: 200, targetBlockId: route.targetBlockId });
        }

        // If not anonymous, assume "authenticated" check implicitly.
        // For dev purposes, if 'x-dev-auth' is completely missing, we treat as unauthenticated -> 401
        // But if provided (even empty permissions), we run roles/expr checks.
        if (!authHeader) {
             return router.json(res, 401, { entrySlug, allowed: false, status: 401, reason: "Login required" });
        }

        // 2. Roles Check
        if (Array.isArray(policy.roles) && policy.roles.length > 0) {
            let roleMatch = false;
            for (const r of policy.roles) {
                if (roles.has(r)) {
                    roleMatch = true;
                    break;
                }
            }
            if (!roleMatch) {
                return router.json(res, 403, { entrySlug, allowed: false, status: 403, reason: "Role required" });
            }
        }

        // 3. Expression Check
        if (policy.expr) {
            const result = evaluateBoolean(policy.expr, ctx);
            if (!result) {
                return router.json(res, 403, { entrySlug, allowed: false, status: 403, reason: "Expression denied" });
            }
        }

        // Allowed
        return router.json(res, 200, { entrySlug, allowed: true, status: 200, targetBlockId: route.targetBlockId });

    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Resolve error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });


  const server = http.createServer((req, res) => {
    router.handle(req, res).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Unhandle server error", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  });

  server.listen(PORT, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://127.0.0.1:${PORT}`);
  });
}

// Run only when executed directly
if (require.main === module) {
  main().catch(err => {
    console.error("Fatal error in main:", err);
    process.exit(1);
  });
}

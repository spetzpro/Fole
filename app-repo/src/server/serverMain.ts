import http from "http";
import * as path from "path";
import { parse } from "url";
import { Router } from "./Router";
import { ShellConfigRepository } from "./ShellConfigRepository";
import { ShellConfigValidator } from "./ShellConfigValidator";
import { ShellConfigDeployer } from "./ShellConfigDeployer";
import { ModeGate } from "./ModeGate";
import { BindingRuntime } from "./BindingRuntime";
import { TriggerEvent, TriggerContext, TriggeredBindingResult } from "./TriggeredBindingEngine";
import { dispatchActionEvent } from "./ActionDispatcher";

import { evaluateBoolean, ExpressionContext } from "./ExpressionEvaluator";

// Default to port 3000, or use env var
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function main() {
  const router = new Router();
  const cwd = process.cwd();
  const configRepo = new ShellConfigRepository(cwd);
  const validator = new ShellConfigValidator(cwd);
  const deployer = new ShellConfigDeployer(configRepo, validator, cwd);
  
  // Singleton runtime state & engine
  const runtimeState: Record<string, any> = {};
  let bindingRuntime: BindingRuntime | undefined;

  const reloadBindingRuntime = async () => {
    try {
      const active = await configRepo.getActivePointer();
      if (!active || !active.activeVersionId) {
         console.log("[BindingRuntime] No active version found; disabling runtime.");
         bindingRuntime = undefined;
         return;
      }

      const activeVersionId = active.activeVersionId;
      // Note: We deliberately let getBundle throw if I/O fails, falling to catch -> keep old runtime
      const entry = await configRepo.getBundle(activeVersionId);

      if (entry && entry.bundle) {
         // Atomic re-instantiation: new instance, tick, then swap
         const newRuntime = new BindingRuntime(entry.bundle, runtimeState);
         const primeResult = newRuntime.applyDerivedTick();
         
         bindingRuntime = newRuntime;
         
         console.log(`[BindingRuntime] Reloaded active=${activeVersionId} applied=${primeResult.applied} skipped=${primeResult.skipped}`);
         if (primeResult.logs.length > 0) {
             primeResult.logs.forEach(l => console.log(`  [BindingLog] ${l}`));
         }
      } else {
         // Explicitly empty/missing bundle content -> Disable
         console.log(`[BindingRuntime] Active version ${activeVersionId} found but bundle empty; disabling runtime.`);
         bindingRuntime = undefined;
      }
    } catch (err: any) {
       // Unexpected error (I/O, parsing, etc) -> Keep last-known-good runtime
       console.error(`A1: [BindingRuntime] Reload failed: ${err.message}. Runtime remains on previous bundle.`);
    }
  };
/**
   * Internal helper to dispatch user actions to the binding runtime.
   * Not yet exposed via HTTP.
   */
  const executeActionEvent = (
    sourceBlockId: string,
    actionName: string,
    payload: any,
    ctx: TriggerContext
  ): TriggeredBindingResult => {
    
    const result = dispatchActionEvent(
        bindingRuntime,
        sourceBlockId,
        actionName,
        payload,
        ctx
    );

    // Logging wrapper
    if (!bindingRuntime) {
         // Echo the drop log from the result if needed, or rely on caller to inspect result.logs
         // The original requirement says: "log the A1 drop once"
         // dispatchActionEvent returns the log in result.logs set.
         result.logs.forEach(l => console.error(l));
    } else {
         console.log(`[Action] Dispatched '${actionName}' from '${sourceBlockId}' applied=${result.applied} skipped=${result.skipped}`);
         if (result.logs.length > 0) {
             result.logs.forEach(l => console.log(`  [BindingLog] ${l}`));
         }
    }
    
    return result;
  };

  await configRepo.ensureInitialized();
  await reloadBindingRuntime();

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
         
      await reloadBindingRuntime();
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

      await reloadBindingRuntime();
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

  // Debug Action Dispatch Endpoint
  router.post("/api/debug/action/dispatch", async (req, res, _params, ctx) => {
    // 1. Strict Gating
    if (!ModeGate.canUseDeveloperMode(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Developer Mode required" });
    }

    try {
        const body = await router.readJsonBody(req);
        
        // 2. Validation
        if (!body.sourceBlockId || typeof body.sourceBlockId !== 'string') {
             return router.json(res, 400, { error: "Missing or invalid sourceBlockId" });
        }
        if (!body.actionName || typeof body.actionName !== 'string') {
             return router.json(res, 400, { error: "Missing or invalid actionName" });
        }

        // 3. Context Construction
        const triggerCtx: TriggerContext = {
             permissions: new Set(Array.isArray(body.permissions) ? body.permissions : []),
             roles: new Set(Array.isArray(body.roles) ? body.roles : [])
        };

        // 4. Dispatch using wrapper
        const result = executeActionEvent(
            body.sourceBlockId,
            body.actionName,
            body.payload,
            triggerCtx
        );

        router.json(res, 200, result);

    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Debug dispatch error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Debug Action Dispatch Endpoint
  router.post("/api/debug/action/dispatch", async (req, res, _params, ctx) => {
    // 1. Strict Gating
    if (!ModeGate.canUseDeveloperMode(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Developer Mode required" });
    }

    try {
        const body = await router.readJsonBody(req);
        
        // 2. Validation
        if (!body.sourceBlockId || typeof body.sourceBlockId !== 'string') {
             return router.json(res, 400, { error: "Missing or invalid sourceBlockId" });
        }
        if (!body.actionName || typeof body.actionName !== 'string') {
             return router.json(res, 400, { error: "Missing or invalid actionName" });
        }

        // 3. Context Construction
        const triggerCtx: TriggerContext = {
             permissions: new Set(Array.isArray(body.permissions) ? body.permissions : []),
             roles: new Set(Array.isArray(body.roles) ? body.roles : [])
        };

        // 4. Dispatch using wrapper
        const result = executeActionEvent(
            body.sourceBlockId,
            body.actionName,
            body.payload,
            triggerCtx
        );

        router.json(res, 200, result);

    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Debug dispatch error", err);
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
        let permissions = new Set<string>();
        let roles = new Set<string>();

        if (authHeader) {
            // SECURITY: Only accept auth mocks in Developer Mode
            // We construct a mock ServerContext here to check mode gate.
            // ModeGate expects { remoteAddress, req, requestId, etc. }
            // Since we are inside the request handler, we have req.
            const serverCtx = {
                req: req,
                remoteAddress: req.socket.remoteAddress || "unknown",
                requestId: Math.random().toString(36).substring(7)
            };
            
            const canMockAuth = ModeGate.canUseDeveloperMode(serverCtx as any);

            if (canMockAuth) {
                try {
                     // Support simple JSON: { "permissions": ["a"], "roles": ["b"] }
                    const json = JSON.parse(authHeader);
                    if (Array.isArray(json.permissions)) json.permissions.forEach((p: any) => permissions.add(String(p)));
                    if (Array.isArray(json.roles)) json.roles.forEach((r: any) => roles.add(String(r)));
                } catch {
                    // Ignore parse errors, treat as empty
                }
            }
            // If dev mode is NOT allowed, we simply ignore the header and permissions/roles remain empty.
            // This effectively treats the request as authenticated-but-no-permissions (if we continue),
            // OR we can nullify authHeader to force 401 below.
            else {
                // Determine behavior: do we block or just ignore?
                // If we ignore, logic below sees 'authHeader' is present string.
                // We should probably treat it as if the header wasn't there if we really want to enforce "Gate".
                // However, "ignoring X-Dev-Auth" typically means "don't trust its content". 
                // Checks below use 'if (!authHeader)' to trigger 401. 
                // If we leave authHeader string but with empty roles, it acts like a logged-in user with no rights.
                // It is safer to treat as unauthenticated if no real auth system is attached.
                // BUT, for this dev-tool, let's treat it as "Detected auth header but locked out -> Unauthenticated".
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
        
        // Re-check auth validity after mode gating
        const effectiveAuth = authHeader && ModeGate.canUseDeveloperMode({ 
            req: req, 
            remoteAddress: req.socket.remoteAddress || "unknown", 
            requestId: "" 
        });

        if (!effectiveAuth) {
             return router.json(res, 401, { entrySlug, allowed: false, status: 401, reason: "Login required (or Dev Auth disabled)" });
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

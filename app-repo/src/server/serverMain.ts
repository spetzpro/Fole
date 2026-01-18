import http from "http";
import * as path from "path";
import { parse } from "url";
import { Router } from "./Router";
import { ShellConfigRepository } from "./ShellConfigRepository";
import { ShellConfigValidator } from "./ShellConfigValidator";
import { ShellConfigDeployer } from "./ShellConfigDeployer";
import { ModeGate } from "./ModeGate";
import { BindingRuntime } from "./BindingRuntime";
import { createBindingRuntimeManager } from "./BindingRuntimeManager";
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
  
  // Singleton runtime manager
  const runtimeManager = createBindingRuntimeManager(configRepo);

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
    
    const bindingRuntime = runtimeManager.getRuntime();
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
  await runtimeManager.reload();

  // Health check endpoint
  router.get("/api/health", (_req, res) => {
    router.json(res, 200, { ok: true });
  });

  // Debug dispatch traces endpoint (Epic 4 Step 4.1)
  router.get("/api/debug/runtime/dispatch-traces", async (_req, res, _params, ctx) => {
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
        return router.json(res, 403, { error: "Debug mode disabled" });
    }

    const runtime = runtimeManager.getRuntime();
    const traces = runtime ? runtime.getDispatchTraces() : [];
    router.json(res, 200, { traces });
  });

  // Debug snapshot endpoint (Epic 4 Step 1)
  router.get("/api/debug/runtime/snapshot", async (_req, res, _params, ctx) => {
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
        return router.json(res, 403, { error: "Debug mode disabled" });
    }

    const runtime = runtimeManager.getRuntime();
    const meta = runtimeManager.getSnapshotMetadata();
    
    if (!runtime) {
         return router.json(res, 200, {
             runtimeStatus: "INACTIVE",
             activeVersionId: meta.activeVersionId,
             activatedAt: meta.activatedAt,
             source: "NONE",
             flags: {
                 executeIntegrationsEnabled: false,
                 debugMode: true
             },
             blocks: { total: 0, byType: {} },
             bindings: { total: 0, enabled: 0, disabled: 0 },
             integrations: { total: 0, byType: {} }
         });
    }

    const bundle = runtime.getBundle();
    const blocksVals = Object.values(bundle.blocks);
    
    // Counts
    const blocksByType: Record<string, number> = {};
    let bindingCount = 0;
    let integrationCount = 0;
    const integrationsByType: Record<string, number> = {};
    
    for (const b of blocksVals) {
        // Block stats
        blocksByType[b.blockType] = (blocksByType[b.blockType] || 0) + 1;
        
        // Binding stats
        if (b.blockType === "binding") {
            bindingCount++;
        }
        
        // Integration stats
        if ((b.blockType || "").startsWith("shell.infra.api") || (b.blockType || "").startsWith("shell.infra.db")) {
            integrationCount++;
            integrationsByType[b.blockType] = (integrationsByType[b.blockType] || 0) + 1;
        }
    }

    router.json(res, 200, {
        runtimeStatus: "ACTIVE",
        activeVersionId: meta.activeVersionId,
        activatedAt: meta.activatedAt,
        source: "ACTIVE",
        flags: {
            executeIntegrationsEnabled: runtime.getExecuteIntegrationsEnabled(),
            debugMode: true
        },
        blocks: {
            total: blocksVals.length,
            byType: blocksByType
        },
        bindings: {
            total: bindingCount,
            enabled: bindingCount, 
            disabled: 0
        },
        integrations: {
            total: integrationCount,
            byType: integrationsByType
        }
    });
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

      // Populate validation warnings (e.g. region conflicts) if defined
      if (report.errors && report.errors.length > 0) {
          bundle.validation.warnings = report.errors;
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

  router.get("/api/debug/config/shell/versions", async (_req, res, _params, ctx) => {
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Debug mode disabled" });
    }
    
    try {
        const active = await configRepo.getActivePointer();
        let activeMeta = null;
        if (active) {
             try {
                 const bundle = await configRepo.getBundle(active.activeVersionId);
                 activeMeta = bundle.meta;
             } catch {}
        }

        const versions = await configRepo.listVersions(25);
        
        router.json(res, 200, {
            activeVersionId: active ? active.activeVersionId : null,
            activeMeta,
            versions
        });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Error listing versions", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.get("/api/debug/config/shell/version/:versionId", async (_req, res, params, ctx) => {
     if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Debug mode disabled" });
    }

    const versionId = params.versionId;
    if (!versionId) return router.json(res, 400, { error: "Missing versionId" });

    try {
        const fullBundle = await configRepo.getBundle(versionId);
        
        // Calculate stats
        const blocks = Object.values(fullBundle.bundle.blocks);
        let bindingCount = 0;
        let integrationCount = 0;
        
        for (const b of blocks) {
            if (b.blockType === "binding") bindingCount++;
            if ((b.blockType || "").startsWith("shell.infra.api") || (b.blockType || "").startsWith("shell.infra.db")) {
                integrationCount++;
            }
        }

        router.json(res, 200, {
            versionId: fullBundle.versionId,
            meta: fullBundle.meta,
            manifest: fullBundle.bundle.manifest,
            stats: {
                blockCount: blocks.length,
                bindingCount,
                integrationCount
            }
        });
    } catch (err: any) {
        if (err.message.includes("not found")) {
             return router.json(res, 404, { error: "Version not found" });
        }
        // eslint-disable-next-line no-console
        console.error("Error details", err);
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
      await runtimeManager.reload();
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
      await runtimeManager.reload();
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
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
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

        router.json(res, 200, {
            ...result,
            emittedTrigger: {
                sourceBlockId: body.sourceBlockId,
                name: body.actionName,
                // These are the key fields used for matching triggers in dispatchTriggeredBindings
            }
        });

    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Debug dispatch error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Debug Derived Tick Endpoint
  router.post("/api/debug/bindings/derived-tick", async (req, res, _params, ctx) => {
    // 1. Strict Gating
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
    }

    try {
        const runtime = runtimeManager.getRuntime();
        if (!runtime) {
            return router.json(res, 200, { 
                applied: 0, 
                skipped: 1, 
                logs: ["A1: [DerivedTick] BindingRuntime not active."] 
            });
        }
        
        const result = runtime.applyDerivedTick();
        router.json(res, 200, result);
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Derived tick error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Debug Runtime Data Blocks Endpoint
  router.get("/api/debug/runtime/data-blocks", async (req, res, _params, ctx) => {
    // 1. Strict Gating
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
    }

    try {
        const urlParts = parse(req.url || "", true);
        const idsParam = urlParts.query.ids;

        if (typeof idsParam !== 'string') {
             return router.json(res, 400, { error: "Missing or invalid 'ids' query parameter" });
        }

        const ids = idsParam.split(',').map(s => s.trim()).filter(s => s.length > 0);
        
        const runtime = runtimeManager.getRuntime();
        const blocks: Record<string, any> = {};

        if (runtime) {
             for (const id of ids) {
                 blocks[id] = runtime.getBlockStateSnapshot(id);
             }
        } else {
             // Fallback if runtime not active, though debatable for "debug/runtime"
             const rawState = runtimeManager.getRuntimeState();
             for (const id of ids) {
                 blocks[id] = rawState[id] || null;
             }
        }

        router.json(res, 200, { blocks });

    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Debug data-blocks error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Helper for Debug Endpoints (EPIC 1 Step 1)
  const getEffectiveDebugPermissions = (req: any, ctx: any): Set<string> => {
    const authHeader = req.headers["x-dev-auth"] as string | undefined;
    const permissions = new Set<string>();

    if (authHeader) {
        try {
            const json = JSON.parse(authHeader);
            if (Array.isArray(json.permissions)) json.permissions.forEach((p: any) => permissions.add(String(p)));
        } catch { /* ignore */ }
    } else if (ModeGate.canUseDebugEndpoints(ctx)) {
        // Default Localhost Permissions
        const remote = req.socket.remoteAddress;
        // Normalize IPv6 mapped IPv4
        const cleanRemote = (remote || "").replace(/^::ffff:/, "");
        const isLocal = cleanRemote === "127.0.0.1" || cleanRemote === "::1";
        
        if (isLocal) {
            permissions.add("integration.view_invocations");
            permissions.add("integration.toggle_execute_mode");
            permissions.add("integration.execute");
        }
    }
    return permissions;
  };

  // Debug Runtime Bindings Endpoint
  router.get("/api/debug/runtime/bindings", async (req, res, _params, ctx) => {
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
    }

    try {
        const runtime = runtimeManager.getRuntime();
        const bindings = runtime ? runtime.getBindingsDebugInfo() : [];
        router.json(res, 200, { bindings });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Debug bindings error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Debug Internal State Store Endpoint
  router.get("/api/debug/runtime/state-store", async (req, res, _params, ctx) => {
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
    }

    try {
        const runtime = runtimeManager.getRuntime();
        // If runtime created, use its accessor (wraps same object but cleaner)
        // If not, fallback to manager's raw object
        const stateStore = runtime ? runtime.getInternalStateDebug() : runtimeManager.getRuntimeState();
        router.json(res, 200, { stateStore });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Debug state-store error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Debug Integration Invocations Endpoint
  router.get("/api/debug/runtime/integrations/invocations", async (req, res, _params, ctx) => {
    // 1. Strict Gating
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
    }
    // 2. Permission Check
    // In dev debug/runtime, we might not always have granular permissions attached to the request unless auth middleware runs.
    // However, for this deliverable, we assume the requester MUST have 'integration.view_invocations'.
    // If we assume request context doesn't yet have permissions populated via middleware for these endpoints:
    // We can simulate them or rely on a future auth middleware.
    // BUT the prompt says "Use request-provided permissions list (already exists in debug dispatch) and/or env defaults."
    // Since this is a GET request, there's no body with permissions. 
    // We will assume permissions might come from x-dev-auth header (like resolved endpoint) OR are open in dev.
    // The prompt explicitly demands ENFORCEMENT. "Require: integration.view_invocations. If missing: 403".
    
    // Use effective permissions (header or localhost default)
    const permissions = getEffectiveDebugPermissions(req, ctx);

    if (!permissions.has("integration.view_invocations")) {
        return router.json(res, 403, { ok: false, error: "Forbidden", reason: "missing integration.view_invocations" });
    }

    try {
        const runtime = runtimeManager.getRuntime();
        if (!runtime) {
            return router.json(res, 200, { invocations: [] });
        }
        const invocations = runtime.getIntegrationInvocations();
        router.json(res, 200, { invocations });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Debug invocations error", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Debug: Execute Mode Toggle
  router.get("/api/debug/runtime/integrations/execute-mode", async (req, res, _params, ctx) => {
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
    }
    
    // Permission Extraction (copy-paste consistency)
    const permissions = getEffectiveDebugPermissions(req, ctx);

    // Require: integration.toggle_execute_mode
    if (!permissions.has("integration.toggle_execute_mode")) {
        return router.json(res, 403, { ok: false, error: "Forbidden", reason: "missing integration.toggle_execute_mode" });
    }

    const runtime = runtimeManager.getRuntime();
    router.json(res, 200, { 
        enabled: runtime ? runtime.getExecuteIntegrationsEnabled() : false 
    });
  });

  router.post("/api/debug/runtime/integrations/execute-mode", async (req, res, _params, ctx) => {
    if (!ModeGate.canUseDebugEndpoints(ctx)) {
       return router.json(res, 403, { error: "Forbidden: Debug endpoints require Debug Mode" });
    }

    // Permission Extraction
    // Check header first (common pattern) 
    // OR body could contain permissions? Usually auth is metadata. Best to stick to header for authZ.
    const permissions = getEffectiveDebugPermissions(req, ctx);

    // Require: integration.toggle_execute_mode
    if (!permissions.has("integration.toggle_execute_mode")) {
        return router.json(res, 403, { ok: false, error: "Forbidden", reason: "missing integration.toggle_execute_mode" });
    }

    const runtime = runtimeManager.getRuntime();
    if (!runtime) {
         return router.json(res, 400, { error: "Runtime not active" });
    }
    try {
        const body = await router.readJsonBody(req);
        // Note: Body might also contain permissions if using the debug-dispatch pattern, 
        // but for a mode toggle endpoint, header is cleaner.
        
        runtime.setExecuteIntegrationsEnabled(!!body.enabled);
        router.json(res, 200, { 
            enabled: runtime.getExecuteIntegrationsEnabled() 
        });
    } catch(err: any) {
        router.json(res, 400, { error: err.message });
    }
  });

  // Routing Resolution Endpoint
  const resolveRoutingHandler = async (req: any, res: any, params: any) => {
    try {
        const { entrySlug } = params;
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
  };

  router.get("/api/runtime/routing/resolve/:entrySlug", resolveRoutingHandler);
  // Alias for legacy frontend path
  router.get("/api/routing/resolve/:entrySlug", resolveRoutingHandler);


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

import http from "http";
import Ajv from "ajv";
import * as path from "path";
import { promises as fs } from "fs";
import { parse } from "url";
import { Router } from "./Router";
import { ShellConfigRepository } from "./ShellConfigRepository";
import { ShellConfigValidator } from "./ShellConfigValidator";
import { ShellConfigDeployer } from "./ShellConfigDeployer";
import { ActivationEvent } from "./ShellConfigTypes";
import { ModeGate } from "./ModeGate";
import { BindingRuntime } from "./BindingRuntime";
import { createBindingRuntimeManager } from "./BindingRuntimeManager";
import { TriggerEvent, TriggerContext, TriggeredBindingResult } from "./TriggeredBindingEngine";
import { dispatchActionEvent } from "./ActionDispatcher";
import { IntegrationAdapterRegistry } from "./integrations/IntegrationAdapterRegistry";
import { canAccessDebug } from "./DebugGuard";
import { requirePermission } from "./DevPermissionGuard";

import { evaluateBoolean, ExpressionContext } from "./ExpressionEvaluator";

// Default to port 3000, or use env var
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const SERVER_START_TS = Date.now();
const SERVER_BUILD_ID = (() => {
    const gitSha = process.env.GIT_COMMIT || process.env.GIT_SHA || process.env.VCS_REF || "";
    const shortSha = gitSha ? gitSha.slice(0, 7) : "";
    const suffix = shortSha ? `_${shortSha}` : "";
    return `dev_${process.pid}_${SERVER_START_TS}${suffix}`;
})();

const deepMerge = (base: any, override: any): any => {
    if (Array.isArray(override)) return override;
    if (override && typeof override === "object" && !Array.isArray(override)) {
        const baseObj = (base && typeof base === "object" && !Array.isArray(base)) ? base : {};
        const result: any = { ...baseObj };
        Object.keys(override).forEach((key) => {
            const next = (override as any)[key];
            if (next === undefined) return;
            result[key] = deepMerge((baseObj as any)[key], next);
        });
        return result;
    }
    return override !== undefined ? override : base;
};

let uiNodeButtonSchemaCache: any | null = null;
let uiNodeButtonAjv: Ajv | null = null;
const getUiNodeButtonValidator = async (repoRoot: string) => {
    if (uiNodeButtonAjv && uiNodeButtonSchemaCache) {
        return { ajv: uiNodeButtonAjv, schema: uiNodeButtonSchemaCache };
    }
    const schemaPath = path.join(repoRoot, "app-repo", "src", "server", "schemas", "ui-node", "ui.node.button.schema.json");
    const content = await fs.readFile(schemaPath, "utf-8");
    const schema = JSON.parse(content);
    const ajv = new Ajv({ allErrors: true });
    ajv.addKeyword("x-ui-editorHint");
    uiNodeButtonSchemaCache = schema;
    uiNodeButtonAjv = ajv;
    return { ajv, schema };
};

async function main() {
  const router = new Router();
  const cwd = process.cwd();
  
  // Handlers for body parsing (simple)
  const parseJsonBody = (req: http.IncomingMessage): Promise<any> => {
       return new Promise((resolve) => {
           let body = '';
           req.on('data', chunk => body += chunk);
           req.on('end', () => {
               try {
                  resolve(body ? JSON.parse(body) : {});
               } catch (e) {
                  resolve({});
               }
           });
       });
  };

  const configRepo = new ShellConfigRepository(cwd);

  const validator = new ShellConfigValidator(cwd);
  const deployer = new ShellConfigDeployer(configRepo, validator, cwd);
  
  // Singleton runtime manager
  const runtimeManager = createBindingRuntimeManager(configRepo);

    const sendEnvelope = (res: http.ServerResponse, ctx: any, data: any, status = 200) => {
        router.json(res, status, {
                ok: true,
                data,
                error: null,
                requestId: ctx.requestId,
                timestamp: new Date().toISOString()
        });
    };

    const sendErrorEnvelope = (res: http.ServerResponse, ctx: any, status: number, code: string, message: string) => {
        router.json(res, status, {
            ok: false,
            data: null,
            error: {
                code,
                message
            },
            requestId: ctx.requestId,
            timestamp: new Date().toISOString()
        });
    };

    const recordActivationEvent = async (event: ActivationEvent) => {
        try {
            await configRepo.recordActivationEvent(event);
        } catch (err: any) {
            // eslint-disable-next-line no-console
            console.error("[ActivationEvent] Failed to persist activation event:", err?.message || err);
        }
    };

    const safeRecordActivationEvent = async (event: ActivationEvent) => {
        try {
            await configRepo.recordActivationEvent(event);
        } catch (err: any) {
            // eslint-disable-next-line no-console
            console.warn("[ActivationEvent] Record failed:", err?.message || err);
        }
    };

    const isLocalhostRequest = (ctx: any): boolean => {
        const remote = ctx.remoteAddress || "";
        return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    };

    const hasRuntimeAdminRole = (ctx: any): boolean => {
        const roles = ctx.auth?.roles || [];
        return roles.some((role: string) => {
            const normalized = role.toUpperCase();
            return normalized === "ADMIN" || normalized === "SYSADMIN";
        });
    };

    const canAccessRuntimeObservability = (ctx: any): boolean => {
        return isLocalhostRequest(ctx) || hasRuntimeAdminRole(ctx);
    };


      router.post("/api/actions/dispatch", async (req, res) => {
          const body = await parseJsonBody(req);
          if (!body.actionId || !body.nodeId) {
              return router.json(res, 400, { error: "Missing actionId or nodeId" });
          }
      
          // NG9: Audit/Log dispatch but NOOP execution as requested
          // eslint-disable-next-line no-console
          console.log(`[Action Dispatch] Node: ${body.nodeId}, Action: ${body.actionId}`);

          // Record invocation + trace (non-debug runtime buffer)
          runtimeManager.recordInvocation({
              ts: new Date().toISOString(),
              actionId: body.actionId,
              sourceBlockId: body.nodeId,
              status: "received"
          });
          runtimeManager.recordTrace({
              ts: new Date().toISOString(),
              actionId: body.actionId,
              status: "dispatched"
          });
      
          router.json(res, 200, { status: "ok", message: "Action dispatched (simulated)" });
      });

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
  // Ensure active pointer is valid/healed before runtime loads to prevent startup errors
  await configRepo.getActivePointer();
  await runtimeManager.reload();

  // Health check endpoint
  router.get("/api/health", (_req, res) => {
    router.json(res, 200, { ok: true });
  });

    router.get("/api/v1/meta/build", (_req, res, _params, ctx) => {
            return sendEnvelope(res, ctx, {
                    serverBuildId: SERVER_BUILD_ID,
                    uiAdvice: { reloadRecommended: false }
            });
    });

  // UI Node Schema Endpoint
  router.get("/api/schemas/ui-node/:nodeType", async (_req, res, params) => {
      const { nodeType } = params;

      // Security Validation: Alphanumeric, dots, dashes, underscores only
      if (!nodeType || typeof nodeType !== 'string' || !/^[a-z0-9._-]+$/.test(nodeType)) {
           return router.json(res, 400, { error: "Invalid nodeType parameter" });
      }

      const schemaPath = path.join(__dirname, "schemas", "ui-node", `${nodeType}.schema.json`);

      try {
          const content = await fs.readFile(schemaPath, 'utf-8');
          const json = JSON.parse(content);
          return router.json(res, 200, json);
      } catch (err: any) {
          if (err.code === 'ENOENT') {
              return router.json(res, 404, { code: "schema_not_found", error: "Schema not found" });
          }
          // eslint-disable-next-line no-console
          console.error(`Schema read error for ${nodeType}:`, err);
          return router.json(res, 500, { error: "Internal Server Error" });
      }
  });

  // Block Schema Endpoint (non-ui-node)
  router.get("/api/schemas/block/:blockType", async (_req, res, params, ctx) => {
      if (!canAccessRuntimeObservability(ctx)) {
          return sendErrorEnvelope(res, ctx, 403, "forbidden", "Access Denied");
      }

      const { blockType } = params;

      // Security Validation: Alphanumeric, dots, dashes, underscores only
      if (!blockType || typeof blockType !== "string" || !/^[a-z0-9._-]+$/.test(blockType)) {
          return sendErrorEnvelope(res, ctx, 400, "invalid_request", "Invalid blockType parameter");
      }

      if (blockType.startsWith("ui.node.")) {
          return sendErrorEnvelope(res, ctx, 400, "invalid_request", "Use /api/schemas/ui-node/:nodeType for ui.node.* schemas");
      }

      let schemaRoot: string | null = null;
      let schemaFile: string | null = null;

      if (blockType === "data.static") {
          schemaRoot = path.join(__dirname, "schemas", "data");
          schemaFile = "data.static.schema.json";
      } else {
          schemaRoot = path.join(__dirname, "schemas", "shell");
          schemaFile = validator.getSchemaForBlockType(blockType);
      }

      if (!schemaRoot || !schemaFile) {
          return sendErrorEnvelope(res, ctx, 404, "schema_not_found", "Schema not found");
      }

      try {
          const content = await fs.readFile(path.join(schemaRoot, schemaFile), "utf-8");
          const json = JSON.parse(content);
          return sendEnvelope(res, ctx, { schema: json });
      } catch (err: any) {
          if (err.code === "ENOENT") {
              return sendErrorEnvelope(res, ctx, 404, "schema_not_found", "Schema not found");
          }
          // eslint-disable-next-line no-console
          console.error(`Schema read error for ${blockType}:`, err);
          return sendErrorEnvelope(res, ctx, 500, "schema_read_failed", "Internal Server Error");
      }
  });

  // Preflight Endpoint (Governed)
  router.get("/api/config/shell/preflight/:versionId", async (req, res, params, ctx) => {
    // Production Auth Check
    const auth = requirePermission(ctx, 'sysadmin.config.preflight');
    if (!auth.success) {
        return router.json(res, auth.status || 403, auth.error || { error: "Access Denied" });
    }

    const { versionId } = params;
    if (!versionId) {
        return router.json(res, 400, { error: "Missing versionId" });
    }

    try {
        const bundle = await configRepo.getBundle(versionId);
        const report = await validator.validateBundle(bundle.bundle);

        const errors = report.errors.filter(e => e.severity === "A1" || e.severity === "A2");
        const warnings = report.errors.filter(e => e.severity === "B");

        const canActivate = report.status === "valid" && errors.length === 0;

        return router.json(res, 200, {
            ok: true,
            versionId,
            canActivate,
            errors,
            warnings,
            summary: report.severityCounts
        });
    } catch (err: any) {
        const status = err.message.includes("not found") ? 404 : 500;
        return router.json(res, status, { error: err.message });
    }
  });

  // Activate Version Endpoint (Governed)
  router.post("/api/config/shell/activate", async (req, res, _params, ctx) => {
      // Production Auth Check
      const auth = requirePermission(ctx, 'sysadmin.config.activate');
      if (!auth.success) {
          return router.json(res, auth.status || 403, auth.error || { error: "Access Denied" });
      }

      let versionId: string | undefined;
      let reason = "";
      const actor = isLocalhostRequest(ctx) ? "dev" : (ctx.auth?.userId || "unknown");
      let fromVersionId: string | null = null;

      try {
          const body = await router.readJsonBody(req);
          versionId = body?.versionId;
          reason = typeof body?.reason === "string" ? body.reason : "";

          if (!versionId || typeof versionId !== "string") {
              return router.json(res, 400, { error: "Missing or invalid versionId" });
          }

          try {
              const active = await configRepo.getActivePointer();
              fromVersionId = active?.activeVersionId ?? null;
          } catch {
              fromVersionId = null;
          }

          const result = await configRepo.activateVersion(versionId, reason);
          await runtimeManager.reload();

          await safeRecordActivationEvent({
              id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              ts: new Date().toISOString(),
              actor,
              reason,
              action: "activate_shell",
              targetVersion: versionId,
              outcome: "success",
              requestId: ctx.requestId,
              fromVersionId
          });
          
          return router.json(res, 200, {
              ok: true,
              activeVersionId: result.activeVersionId,
              activatedAt: result.activatedAt,
              reason
          });
      } catch (err: any) {
          const errorMessage = err?.message || "Activation failed";
          if (versionId) {
              await safeRecordActivationEvent({
                  id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  ts: new Date().toISOString(),
                  actor,
                  reason,
                  action: "activate_shell",
                  targetVersion: versionId,
                  outcome: "failure",
                  errorMessage,
                  requestId: ctx.requestId,
                  fromVersionId
              });
          }
          return router.json(res, 400, { error: err.message });
      }
  });

  // Standard Runtime Derived Binding State (Bridge between derived engine and UI)
  router.get("/api/runtime/bindings/derived-state", async (_req, res, _params, _ctx) => {
      // Standard endpoint - available to renderer without debug auth
      const metadata = runtimeManager.getSnapshotMetadata();
      const runtime = runtimeManager.getRuntime();
      
      const patchesByBlockId: Record<string, any> = {};
      
      if (runtime) {
          // Get the full internal state (filtered to safe props naturally by engine)
          const state = runtime.getInternalStateDebug(); 
          Object.assign(patchesByBlockId, state);
      }
      
      return router.json(res, 200, {
          versionId: metadata.activeVersionId,
          patchesByBlockId: patchesByBlockId
      });
  });

  // Clone & Patch Sysadmin (Sysadmin Tooling - Standard)
  router.post("/api/config/shell/clone-and-patch-sysadmin", async (req, res, _params, ctx) => {
    // Used by UI Sysadmin flow - needs to vary independent of debug mode
    try {
        const body: any = await router.readJsonBody(req);
        const { baseVersionId, reason, sysadminBlocks, manifestPatch } = body;

        // Validation
        if (!baseVersionId || typeof baseVersionId !== 'string') {
             return router.json(res, 400, { error: "Missing or invalid baseVersionId" });
        }
        if (typeof reason !== 'string') {
             return router.json(res, 400, { error: "Missing or invalid reason" });
        }
        if (!sysadminBlocks || typeof sysadminBlocks !== 'object') {
             return router.json(res, 400, { error: "Missing or invalid sysadminBlocks" });
        }
        if (Object.keys(sysadminBlocks).length === 0) {
             return router.json(res, 400, { error: "sysadminBlocks must not be empty" });
        }
        
        // Execute
        const result = await configRepo.cloneVersionWithPatchedSysadmin(baseVersionId, reason, sysadminBlocks, manifestPatch);
        
        return router.json(res, 200, { 
            ok: true, 
            newVersionId: result.newVersionId,
            baseVersionId,
            reason
        });

    } catch (err: any) {
        if (err.message && err.message.substring && err.message.includes("Base version")) {
            return router.json(res, 404, { error: err.message });
        }
         // eslint-disable-next-line no-console
        console.error("Clone patch error", err);
        return router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  // Versioned Data Block Patch (Sysadmin, v1)
    router.post("/api/v1/config/blocks/:blockId/patch", async (req, res, params, ctx) => {
      if (!canAccessRuntimeObservability(ctx)) {
          return sendErrorEnvelope(res, ctx, 403, "forbidden", "Access Denied");
      }

      const { blockId } = params;
      if (!blockId) {
          return sendErrorEnvelope(res, ctx, 400, "invalid_request", "Missing blockId");
      }

      const body = await router.readJsonBody(req);
      const patch = body?.patch;
      const message = typeof body?.message === "string" ? body.message : "Sysadmin data patch";

      if (!patch || typeof patch !== "object") {
          return sendErrorEnvelope(res, ctx, 400, "invalid_request", "Missing or invalid patch");
      }

      if (
          Object.prototype.hasOwnProperty.call(patch, "blockType") ||
          Object.prototype.hasOwnProperty.call(patch, "schemaVersion") ||
          Object.prototype.hasOwnProperty.call(patch, "filename")
      ) {
          return sendErrorEnvelope(res, ctx, 400, "invalid_patch", "Patch may not modify blockType/schemaVersion/filename");
      }

      const patchKeys = Object.keys(patch);
      if (patchKeys.some((k) => k !== "data")) {
          return sendErrorEnvelope(res, ctx, 400, "invalid_patch", "Only data patches are supported");
      }

      if (!patch.data || typeof patch.data !== "object") {
          return sendErrorEnvelope(res, ctx, 400, "invalid_patch", "Patch.data must be an object");
      }

      const active = await configRepo.getActivePointer();
      if (!active) {
          return sendErrorEnvelope(res, ctx, 404, "not_found", "No active configuration found");
      }

      let bundleContainer;
      try {
          bundleContainer = await configRepo.getBundle(active.activeVersionId);
      } catch (err: any) {
          return sendErrorEnvelope(res, ctx, 404, "not_found", err.message || "Active bundle not found");
      }

      const baseBundle = bundleContainer.bundle;
      const blocks = baseBundle?.blocks;
      if (!blocks || typeof blocks !== "object") {
          return sendErrorEnvelope(res, ctx, 500, "invalid_bundle", "Active bundle missing blocks");
      }

      const block = (blocks as Record<string, any>)[blockId];
      if (!block) {
          return sendErrorEnvelope(res, ctx, 404, "not_found", `Block ${blockId} not found`);
      }

      if (block.blockType !== "data.static" && block.blockType !== "binding" && block.blockType !== "shell.infra.theme_tokens" && !block.blockType.startsWith("ui.node.")) {
          return sendErrorEnvelope(res, ctx, 400, "invalid_block_type", "Only data.static, binding, shell.infra.theme_tokens, or ui.node.* blocks are editable");
      }

      const baseData = block.data && typeof block.data === "object" ? block.data : {};
      const nextData = { ...baseData, ...(patch.data as Record<string, unknown>) };

      const nextBlock = {
          ...block,
          data: nextData
      };

      const nextBlocks = {
          ...(blocks as Record<string, any>),
          [blockId]: nextBlock
      };

      const nextBundle = {
          ...baseBundle,
          blocks: nextBlocks
      };

    const errors: any[] = [];
    const effectiveErrors: any[] = [];
      if (nextBlock.blockType === "ui.node.button" && typeof nextBlock?.data?.inheritFrom === "string") {
          const inheritFrom = nextBlock.data.inheritFrom;
          const templateBlock = nextBundle.blocks?.[inheritFrom] || baseBundle.blocks?.[inheritFrom];
          if (!templateBlock) {
              effectiveErrors.push({
                  severity: "A1",
                  code: "template_missing",
                  message: `Block ${blockId} inheritFrom references missing template '${inheritFrom}'`,
                  path: `/blocks/${blockId}/data/inheritFrom`,
                  blockId
              });
          } else if (templateBlock.blockType !== "template") {
              effectiveErrors.push({
                  severity: "A1",
                  code: "template_type_mismatch",
                  message: `Block ${blockId} inheritFrom '${inheritFrom}' is not a template block`,
                  path: `/blocks/${blockId}/data/inheritFrom`,
                  blockId
              });
          } else if (templateBlock?.data?.inheritFrom) {
              effectiveErrors.push({
                  severity: "A1",
                  code: "template_inherit_forbidden",
                  message: `Template '${inheritFrom}' must not inherit from another template in v1`,
                  path: `/blocks/${inheritFrom}/data/inheritFrom`,
                  blockId: inheritFrom
              });
          } else if (templateBlock?.data?.targetBlockType !== "ui.node.button") {
              effectiveErrors.push({
                  severity: "A1",
                  code: "template_target_mismatch",
                  message: `Template '${inheritFrom}' does not target ui.node.button`,
                  path: `/blocks/${inheritFrom}/data/targetBlockType`,
                  blockId: inheritFrom
              });
          } else if (!templateBlock?.data?.defaults || typeof templateBlock.data.defaults !== "object" || Array.isArray(templateBlock.data.defaults)) {
              effectiveErrors.push({
                  severity: "A1",
                  code: "template_defaults_invalid",
                  message: `Template '${inheritFrom}' missing defaults object`,
                  path: `/blocks/${inheritFrom}/data/defaults`,
                  blockId: inheritFrom
              });
          } else {
              const activeBlockData = block.data && typeof block.data === "object" ? block.data : {};
              const draftOverrides = nextBlock.data && typeof nextBlock.data === "object" ? nextBlock.data : {};
              const templateDefaults = templateBlock.data.defaults || {};
              const effective = deepMerge(deepMerge(activeBlockData, templateDefaults), draftOverrides);
              const { ajv, schema } = await getUiNodeButtonValidator(cwd);
              const valid = ajv.validate(schema, effective);
              if (!valid) {
                  (ajv.errors || []).forEach((err: any) => {
                      effectiveErrors.push({
                          severity: "A1",
                          code: `effective_schema_${err.keyword}`,
                          message: `Block ${blockId} effective data invalid: ${err.message}`,
                          path: `/blocks/${blockId}/effective${err.instancePath}`,
                          blockId
                      });
                  });
              }
          }
      }

      const combinedErrors = [...errors, ...effectiveErrors];

      if (combinedErrors.length > 0) {
          const details = isLocalhostRequest(ctx)
              ? combinedErrors.map((e: any) => ({
                  severity: e.severity,
                  code: e.code,
                  message: e.message,
                  path: e.path,
                  blockId: e.blockId
              }))
              : undefined;
          return router.json(res, 400, {
              ok: false,
              data: null,
              error: {
                  code: "validation_failed",
                  message: "Bundle validation failed",
                  details
              },
              requestId: ctx.requestId,
              timestamp: new Date().toISOString()
          });
      }

      const { newVersionId } = await configRepo.saveHealedBundleAsVersion(
          nextBundle,
          active.activeVersionId,
          message
      );
      return sendEnvelope(res, ctx, { newVersionId, blockId });
  });

  // Activate Version (Sysadmin, v1)
    router.post("/api/v1/config/activate", async (req, res, _params, ctx) => {
      if (!canAccessRuntimeObservability(ctx)) {
          return sendErrorEnvelope(res, ctx, 403, "forbidden", "Access Denied");
      }

      const body = await router.readJsonBody(req);
      const versionId = body?.versionId;
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

      if (!versionId || typeof versionId !== "string") {
          return sendErrorEnvelope(res, ctx, 400, "invalid_request", "Missing or invalid versionId");
      }
      if (!reason) {
          await safeRecordActivationEvent({
              id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              ts: new Date().toISOString(),
              actor: isLocalhostRequest(ctx) ? "dev" : (ctx.auth?.userId || "admin"),
              reason: "",
              action: "activate_draft",
              targetVersion: null,
              outcome: "failure",
              errorMessage: "Reason is required",
              requestId: ctx.requestId,
              fromVersionId: null
          });
          return sendErrorEnvelope(res, ctx, 400, "invalid_request", "Reason is required");
      }

      const actorLabel = isLocalhostRequest(ctx) ? "dev" : (ctx.auth?.userId || "admin");
      const timestamp = new Date().toISOString();
      let fromVersionId: string | null = null;

      try {
          const active = await configRepo.getActivePointer();
          fromVersionId = active?.activeVersionId ?? null;

          await configRepo.activateVersion(versionId, reason, "normal");
          await runtimeManager.reload();

          await safeRecordActivationEvent({
              id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              ts: timestamp,
              actor: actorLabel,
              reason,
              action: "activate_draft",
              targetVersion: versionId,
              outcome: "success",
              requestId: ctx.requestId,
              fromVersionId
          });

          return sendEnvelope(res, ctx, {
              fromVersionId,
              toVersionId: versionId,
              actorLabel,
              reason,
              timestamp,
              outcome: "success"
          });
      } catch (err: any) {
          const errorSummary = err?.message || "Activation failed";
          await safeRecordActivationEvent({
              id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              ts: timestamp,
              actor: actorLabel,
              reason,
              action: "activate_draft",
              targetVersion: versionId,
              outcome: "failure",
              errorMessage: errorSummary,
              requestId: ctx.requestId,
              fromVersionId
          });
          return router.json(res, 400, {
              ok: false,
              data: {
                  fromVersionId: null,
                  toVersionId: versionId,
                  actorLabel,
                  reason,
                  timestamp,
                  outcome: "fail",
                  errorSummary
              },
              error: {
                  code: "activation_failed",
                  message: errorSummary
              },
              requestId: ctx.requestId,
              timestamp
          });
      }
  });

  // Runtime: Invocations (non-debug, versioned)
  router.get("/api/v1/runtime/invocations/recent", async (req, res, _params, ctx) => {
      if (!canAccessRuntimeObservability(ctx)) {
          return sendErrorEnvelope(res, ctx, 403, "forbidden", "Access Denied");
      }
      const urlParts = parse(req.url || "", true);
      const limitParam = urlParts.query.limit;
      const limit = typeof limitParam === "string" ? Math.max(1, Math.min(50, parseInt(limitParam, 10) || 20)) : 20;
      const items = runtimeManager.getInvocations(limit);
      return sendEnvelope(res, ctx, { items });
  });

  // Runtime: Traces (non-debug, versioned)
  router.get("/api/v1/runtime/traces/recent", async (req, res, _params, ctx) => {
      if (!canAccessRuntimeObservability(ctx)) {
          return sendErrorEnvelope(res, ctx, 403, "forbidden", "Access Denied");
      }
      const urlParts = parse(req.url || "", true);
      const limitParam = urlParts.query.limit;
      const limit = typeof limitParam === "string" ? Math.max(1, Math.min(50, parseInt(limitParam, 10) || 20)) : 20;
      const items = runtimeManager.getTraces(limit);
      return sendEnvelope(res, ctx, { items });
  });

  // Runtime: Snapshot (non-debug, versioned)
  router.get("/api/v1/runtime/snapshot", async (_req, res, _params, ctx) => {
      if (!canAccessRuntimeObservability(ctx)) {
          return sendErrorEnvelope(res, ctx, 403, "forbidden", "Access Denied");
      }
      const metadata = runtimeManager.getSnapshotMetadata();
      const runtime = runtimeManager.getRuntime();
      const state = runtime ? runtime.getInternalStateDebug() : {};
      const derivedPatchesCount = Object.keys(state || {}).length;
      const lastDerivedTickTs = runtime ? runtime.getLastDerivedTickTs() : null;

      return sendEnvelope(res, ctx, {
          ts: new Date().toISOString(),
          activeVersionId: metadata.activeVersionId,
          openWindows: [],
          derivedPatchesCount,
          lastDerivedTickTs
      });
  });

  // Admin: Activation Events (non-debug, versioned)
  router.get("/api/v1/admin/activations", async (req, res, _params, ctx) => {
      if (!canAccessRuntimeObservability(ctx)) {
          return sendErrorEnvelope(res, ctx, 403, "forbidden", "Access Denied");
      }

      const urlParts = parse(req.url || "", true);
      const limitParam = urlParts.query.limit;
      const limit = typeof limitParam === "string" ? Math.max(1, Math.min(100, parseInt(limitParam, 10) || 50)) : 50;
      const outcomeParam = typeof urlParts.query.outcome === "string" ? urlParts.query.outcome : undefined;
      const afterParam = typeof urlParts.query.after === "string" ? urlParts.query.after : undefined;
      const outcome = outcomeParam === "success" || outcomeParam === "failure" ? outcomeParam : undefined;

      try {
          const items = await configRepo.listActivationEvents({ limit, outcome, after: afterParam });
          return sendEnvelope(res, ctx, { items });
      } catch (err: any) {
          return sendErrorEnvelope(res, ctx, 500, "activation_events_failed", err?.message || "Failed to load activation events");
      }
  });

  // Debug activate version endpoint (Roadmap #4 Step 2)
  router.get("/api/debug/config/shell/preflight/:versionId", async (req, res, params, ctx) => {
    if (!canAccessDebug(ctx)) {
        return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
    }

    const { versionId } = params;
    if (!versionId) {
        return router.json(res, 400, { error: "Missing versionId" });
    }

    try {
        const bundle = await configRepo.getBundle(versionId);
        const report = await validator.validateBundle(bundle.bundle);

        const errors = report.errors.filter(e => e.severity === "A1" || e.severity === "A2");
        const warnings = report.errors.filter(e => e.severity === "B");

        const canActivate = report.status === "valid" && errors.length === 0;

        return router.json(res, 200, {
            ok: true,
            versionId,
            canActivate,
            errors,
            warnings,
            summary: report.severityCounts
        });
    } catch (err: any) {
        // Handle case where version doesn't exist or is corrupted
        const status = err.message.includes("not found") ? 404 : 500;
        return router.json(res, status, { error: err.message });
    }
  });

  // Debug activate version endpoint (Roadmap #4 Step 2)
  router.post("/api/debug/config/shell/activate", async (req, res, _params, ctx) => {
      if (!canAccessDebug(ctx)) {
          return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
      }

      let versionId: string | undefined;
      let reason = "";
      const actor = isLocalhostRequest(ctx) ? "dev" : (ctx.auth?.userId || "unknown");
      let fromVersionId: string | null = null;

      try {
          const body = await router.readJsonBody(req);
          versionId = body?.versionId;
          reason = typeof body?.reason === "string" ? body.reason : "";

          if (!versionId || typeof versionId !== "string") {
              return router.json(res, 400, { error: "Missing or invalid versionId" });
          }

          try {
              const active = await configRepo.getActivePointer();
              fromVersionId = active?.activeVersionId ?? null;
          } catch {
              fromVersionId = null;
          }

          const result = await configRepo.activateVersion(versionId, reason);
          await runtimeManager.reload();

          await safeRecordActivationEvent({
              id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              ts: new Date().toISOString(),
              actor,
              reason,
              action: "activate_shell_debug",
              targetVersion: versionId,
              outcome: "success",
              requestId: ctx.requestId,
              fromVersionId
          });
          
          return router.json(res, 200, {
              ok: true,
              activeVersionId: result.activeVersionId,
              activatedAt: result.activatedAt,
              reason
          });
      } catch (err: any) {
          const errorMessage = err?.message || "Activation failed";
          if (versionId) {
              await safeRecordActivationEvent({
                  id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  ts: new Date().toISOString(),
                  actor,
                  reason,
                  action: "activate_shell_debug",
                  targetVersion: versionId,
                  outcome: "failure",
                  errorMessage,
                  requestId: ctx.requestId,
                  fromVersionId
              });
          }
          // If version validation fails, it throws
          return router.json(res, 400, { error: err.message });
      }
  });

  // Roadmap 7.1 Sysadmin Patch Endpoint
  router.post("/api/debug/config/shell/clone-and-patch-sysadmin", async (req, res, _params, ctx) => {
      if (!canAccessDebug(ctx)) {
          return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
      }
      
      try {
          const body: any = await router.readJsonBody(req);
          const { baseVersionId, reason, sysadminBlocks, manifestPatch } = body;

          // Validation
          if (!baseVersionId || typeof baseVersionId !== 'string') {
               return router.json(res, 400, { error: "Missing or invalid baseVersionId" });
          }
          if (typeof reason !== 'string') {
               return router.json(res, 400, { error: "Missing or invalid reason" });
          }
          if (!sysadminBlocks || typeof sysadminBlocks !== 'object') {
               return router.json(res, 400, { error: "Missing or invalid sysadminBlocks" });
          }
          if (Object.keys(sysadminBlocks).length === 0) {
               return router.json(res, 400, { error: "sysadminBlocks must not be empty" });
          }
          
          // Execute
          const result = await configRepo.cloneVersionWithPatchedSysadmin(baseVersionId, reason, sysadminBlocks, manifestPatch);
          
          return router.json(res, 200, { 
              ok: true, 
              newVersionId: result.newVersionId,
              baseVersionId,
              reason
          });

      } catch (err: any) {
          if (err.message && err.message.substring && err.message.includes("Base version")) {
              return router.json(res, 404, { error: err.message });
          }
           // eslint-disable-next-line no-console
          console.error("Clone patch error", err);
          return router.json(res, 500, { error: "Internal Server Error" });
      }
  });

  // Debug dispatch traces endpoint (Epic 4 Step 4.1)
  router.get("/api/debug/runtime/dispatch-traces", async (_req, res, _params, ctx) => {
    if (!canAccessDebug(ctx)) {
        return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
    }

    const runtime = runtimeManager.getRuntime();
    const traces = runtime ? runtime.getDispatchTraces() : [];
    router.json(res, 200, { traces });
  });

  // Debug adapter capabilities endpoint (Roadmap #5.3.2 Step 1)
  router.get("/api/debug/runtime/integrations/adapter-capabilities", (_req, res, _params, ctx) => {
    if (!canAccessDebug(ctx)) {
        return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
    }

    const registry = IntegrationAdapterRegistry.getInstance();
    const adapters = registry.getCapabilities();
    router.json(res, 200, { adapters });
  });

  // Debug snapshot endpoint (Epic 4 Step 1)
  router.get("/api/debug/runtime/snapshot", async (_req, res, _params, ctx) => {
    if (!canAccessDebug(ctx)) {
        return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
    }

    const runtime = runtimeManager.getRuntime();
    const meta = runtimeManager.getSnapshotMetadata();
    
    if (!runtime) {
         return router.json(res, 200, {
             runtimeStatus: "INACTIVE",
             activeVersionId: meta.activeVersionId,
             activatedAt: meta.activatedAt,
             activationReason: meta.activationReason,
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
        activationReason: meta.activationReason,
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

    let bundle;
    try {
      bundle = await configRepo.getBundle(versionId);
    } catch (err: any) {
       const isNotFound = err.message.includes("not found") || err.code === "ENOENT";
       if (isNotFound) {
           // eslint-disable-next-line no-console
           console.warn(`[Bundle] Requested version ${versionId} not found. Attempting fallback...`);
           
           let fallbackVersionId: string | null = null;
           let fallbackReason = "Requested version not found";

           // Strategy 1: Try Active Pointer
           // Note: getActivePointer() already attempts self-healing if active is missing
           const active = await configRepo.getActivePointer();
           if (active && active.activeVersionId !== versionId) {
                fallbackVersionId = active.activeVersionId;
                fallbackReason = "Requested version not found; falling back to active version";
           }
           
           // Strategy 2: If Active failed or is same as bad version, try Latest Available in Archive
           if (!fallbackVersionId) {
                const latest = await configRepo.getLatestAvailableVersionId();
                if (latest && latest !== versionId) {
                    fallbackVersionId = latest;
                    fallbackReason = "Requested version not found and active invalid; falling back to latest available";
                }
           }

           if (fallbackVersionId) {
                try {
                     bundle = await configRepo.getBundle(fallbackVersionId);
                     // Inject fallback metadata for client awareness
                     (bundle as any).meta = {
                        ...(bundle.meta || {}),
                        fallbackFromVersionId: versionId,
                        fallbackReason
                     };
                     versionId = fallbackVersionId;
                     // eslint-disable-next-line no-console
                     console.warn(`[Bundle] Fallback successful -> ${versionId}`);
                } catch (inner: any) {
                     return router.json(res, 404, { error: `Version ${versionId} not found, and fallback to ${fallbackVersionId} failed: ${inner.message}` });
                }
           } else {
               return router.json(res, 404, { error: err.message });
           }
       } else {
           throw err;
       }
    }

    try {
      // Validate on read
      let report = await validator.validateBundle(bundle.bundle);
      
      // Auto-Healing Strategy
      if (report.status !== "valid") {
           // eslint-disable-next-line no-console
          console.warn(`[Bundle] Validation failed for ${versionId}. Attempting auto-healing...`);
          
          // 1. Heal In-Memory
          const healedBundleData = ShellConfigRepository.healBundleInMemory(bundle.bundle, report);
          
          // 2. Re-validate
          const healedReport = await validator.validateBundle(healedBundleData);
          if (healedReport.status === "valid") {
             // eslint-disable-next-line no-console
             console.log(`[Bundle] Healing successful. Serving healed bundle.`);
             
             // 3. Optional Persistence (Self-Stabilization)
             const activePointer = await configRepo.getActivePointer();
             if (activePointer && activePointer.activeVersionId === versionId) {
                 try {
                     // eslint-disable-next-line no-console
                     console.log(`[Bundle] Persisting healed bundle as new version to stabilize system...`);
                     const { newVersionId } = await configRepo.saveHealedBundleAsVersion(
                         healedBundleData, 
                         versionId, 
                         "Auto-healed from read-time validation failure"
                     );
                     await configRepo.activateVersion(newVersionId, "System Auto-Stabilization", "normal");
                     // eslint-disable-next-line no-console
                     console.log(`[Bundle] System stabilized at version ${newVersionId}`);
                     
                     bundle.versionId = newVersionId;
                 } catch (err: any) {
                     // eslint-disable-next-line no-console
                     console.error(`[Bundle] Failed to persist healed version: ${err.message}`);
                 }
             }

             // Update bundle object to return healed data
             bundle.bundle = healedBundleData;
             report = healedReport; // Update report for consumer
          } else {
             // eslint-disable-next-line no-console
             console.warn(`[Bundle] Healing failed. Still invalid.`);
          }
      }

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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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

  router.get("/api/debug/config/shell/version/:versionId", async (req, res, params, ctx) => {
     if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
    }

    const versionId = params.versionId;
    if (!versionId) return router.json(res, 400, { error: "Missing versionId" });

    // Parse query params
    const urlParts = parse(req.url || "", true);
    const includeBlocks = urlParts.query.includeBlocks === '1';

    try {
        const fullBundle = await configRepo.getBundle(versionId);
        
        // Calculate stats
        const blocksList = Object.values(fullBundle.bundle.blocks);
        let bindingCount = 0;
        let integrationCount = 0;
        
        for (const b of blocksList) {
            if (b.blockType === "binding") bindingCount++;
            if ((b.blockType || "").startsWith("shell.infra.api") || (b.blockType || "").startsWith("shell.infra.db")) {
                integrationCount++;
            }
        }

        const response: any = {
            versionId: fullBundle.versionId,
            meta: fullBundle.meta,
            manifest: fullBundle.bundle.manifest,
            stats: {
                blockCount: blocksList.length,
                bindingCount,
                integrationCount
            }
        };

        if (includeBlocks) {
            if (blocksList.length > 500) {
                 return router.json(res, 413, { 
                     error: "Too large to include blocks", 
                     details: `Block count ${blocksList.length} exceeds limit of 500.`
                 });
            }
            response.blocks = fullBundle.bundle.blocks;
        }

        router.json(res, 200, response);
    } catch (err: any) {
        if (err.message.includes("not found")) {
             return router.json(res, 404, { error: "Version not found" });
        }
        // eslint-disable-next-line no-console
        console.error("Error details", err);
        router.json(res, 500, { error: "Internal Server Error" });
    }
  });

  router.get("/api/config/shell/resolved-graph/active", async (req, res) => {
    try {
        const activePointer = await configRepo.getActivePointer();
        if (!activePointer || !activePointer.activeVersionId) {
             return router.json(res, 404, { code: "resolved_graph_not_found", error: "No active configuration set" });
        }
        
        let graph = await configRepo.getResolvedUiGraph(activePointer.activeVersionId);
        let computationInfo: any = null;
        
        if (!graph) {
             try {
                // Determine if version exists and is accessible
                // We assume activePointer.activeVersionId is valid because getActivePointer heals it.
                // However, the artifact (validation.json) might be missing.
                const bundle = await configRepo.getBundle(activePointer.activeVersionId);
                
                // The repository pipeline (getBundle) now handles in-memory healing
                // (e.g. legacy Viewport rule normalization).
                // We just validate the clean bundle.
                const report = await validator.validateBundle(bundle.bundle);
                
                if (report.resolvedUiGraph) {
                    graph = report.resolvedUiGraph;
                } else {
                     computationInfo = {
                        reasonCode: "validation_failed_no_graph",
                        // This likely means the bundle was valid but had no UI nodes to graph
                         _info: "Graph generation returned no result (empty UI definition)."
                    };
                }
             } catch (e: any) {
                 // eslint-disable-next-line no-console
                 console.warn(`[ResolvedGraph] On-the-fly computation failed: ${e.message}`);
                 computationInfo = {
                     reasonCode: "computation_exception",
                     message: e.message
                 };
             }
        }
        
        if (!graph) {
             // Return 200 with null graph instead of 400.
             // This indicates the bundle is valid, but simply has no UI to render (empty).
             // This prevents sysadmin/debug views from spamming errors for new/empty projects.
             return router.json(res, 200, { 
                 graph: null, 
                 reasonCode: "no_graph",
                 _info: "Valid bundle, but no UI graph generated (likely no UI nodes).",
                 details: computationInfo
             });
        }
        
        router.json(res, 200, graph);
    } catch (err: any) {
         // eslint-disable-next-line no-console
        console.error("Error fetching active resolved graph", err);
        router.json(res, 500, { error: err.message || "Internal Server Error" });
    }
  });

  router.get("/api/config/shell/resolved-graph/:versionId", async (_req, res, params) => {
    const versionId = params.versionId;
    if (!versionId) {
      return router.json(res, 400, { error: "Missing versionId" });
    }

    try {
        const graph = await configRepo.getResolvedUiGraph(versionId);
        if (!graph) {
             return router.json(res, 404, { error: "Graph not found (or version missing)" });
        }
        router.json(res, 200, graph);
    } catch (err: any) {
         // eslint-disable-next-line no-console
        console.error("Error fetching resolved graph", err);
        router.json(res, 500, { error: err.message || "Internal Server Error" });
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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

  // Debug: Full Runtime State (For V2 Bridge Overlay)
  router.get("/api/debug/runtime/state", async (_req, res, _params, ctx) => {
    if (!canAccessDebug(ctx)) {
        return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
    }
    const runtime = runtimeManager.getRuntime();
    if (!runtime) {
        return router.json(res, 200, {});
    }
    return router.json(res, 200, runtime.getInternalStateDebug());
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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
    if (!canAccessDebug(ctx)) {
       return router.json(res, 403, { error: "Access Denied: Debug mode disabled or insufficient permissions" });
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


  // Runtime Capabilities Endpoint
  router.get("/api/runtime/capabilities", async (req, res, _params, ctx) => {
     // NOTE: This reflects environment availability, NOT user authorization.
     // It helps the UI decide whether to show debug tools or not.
     // Actual access is guarded by DebugGuard on specific routes.
     
     // Decoupled capabilities:
     const debugEnabled = ModeGate.debugEndpointsEnabled(ctx);
     const overridesEnabled = ModeGate.canUseDevAuthBypass(ctx);
     
     router.json(res, 200, {
         debugEndpointsEnabled: debugEnabled,
         devModeOverridesEnabled: overridesEnabled
     });
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

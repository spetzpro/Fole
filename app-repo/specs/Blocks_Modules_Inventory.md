# Blocks & Modules Inventory

This file is the authoritative, spec-only snapshot of blocks and modules.
It is derived from a scan of spec files under `specs/blocks/**` and `specs/modules/**` and does not inspect code.

## How to use this inventory
- Start here before adding modules or changing specs.
- Treat it as the current list of spec-backed blocks/modules.
- Use the gaps section to track missing specs or unresolved mappings.

## Status legend (inventory-only)
- `Stable` - implemented and validated in current workflows.
- `Beta` - implemented or in active implementation, not yet fully validated.
- `Draft` - spec exists, implementation unknown or planned.
- `Planned` - concept only, no spec file yet.
- Mapping note: inventory.json uses legacy enums (Planned/Specced/In implementation/Implemented/Stable). This file maps Specced -> Draft and Implemented/In implementation -> Beta when describing spec-only status.

## Spec scan summary (spec-only)
- Block specs found: 12
	- `specs/blocks/*.md`
	- `specs/blocks/lib/*.md`
- Module specs found: 54 (excludes `specs/modules/README.md`)
	- `specs/modules/*/*.md`
	- `specs/modules/*.md` (legacy root-level specs)

---

## Blocks (by domain)

### Core blocks
| Block | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| core.foundation | Draft | Runtime primitives, logging, config, diagnostics hub. | TBD (see spec) | TBD (see spec) | specs/blocks/core.foundation.md |
| core.storage | Beta | Storage layout, atomic writes, project data access. | core.foundation | TBD (see spec) | specs/blocks/core.storage.md |
| core.auth | Stable | Auth flows, session identity, user context. | core.storage, core.permissions | TBD (see spec) | specs/blocks/core.auth.md |
| core.permissions | Stable | Roles, permissions, guards, and enforcement model. | core.auth | TBD (see spec) | specs/blocks/core.permissions.md |
| core.ui | Draft | App shell, navigation, workspace experience. | core.auth, core.permissions | TBD (see spec) | specs/blocks/core.ui.md |
| core.ux.shell | Draft | Shell configuration, deployment lifecycle, modes. | core.ui, core.permissions | TBD (see spec) | specs/blocks/core.ux.shell.md |
| core.sysadmin | Draft | Sysadmin surface and governance UX. | core.ux.shell | TBD (see spec) | specs/blocks/core.sysadmin.md |

### Feature blocks
| Block | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| feature.map | Beta | Map registry, calibration, and viewport services. | core.permissions, core.storage | TBD (see spec) | specs/blocks/feature.map.block.md |

### Library blocks
| Block | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| lib.image | Draft | Image normalization, metadata, thumbnails. | TBD (see spec) | TBD (see spec) | specs/blocks/lib/lib.image.md |
| lib.geo | Draft | Geo and calibration math primitives. | TBD (see spec) | TBD (see spec) | specs/blocks/lib/lib.geo.md |
| lib.jobs | Draft | Job runtime, queues, scheduling. | lib.diagnostics, lib.image | TBD (see spec) | specs/blocks/lib/lib.jobs.md |
| lib.diagnostics | Draft | Logging, metrics, tracing primitives. | core.foundation.DiagnosticsHub | TBD (see spec) | specs/blocks/lib/lib.diagnostics.md |

---

## Modules (by block)

### core.foundation
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| core.foundation.ConfigService | Draft | App configuration access. | TBD (see spec) | TBD (see spec) | specs/modules/core.foundation/core.foundation.ConfigService.md |
| core.foundation.Logger | Draft | Scoped, leveled logging. | TBD (see spec) | TBD (see spec) | specs/modules/core.foundation/core.foundation.Logger.md |
| core.foundation.DiagnosticsHub | Draft | Diagnostics/event aggregation. | TBD (see spec) | TBD (see spec) | specs/modules/core.foundation/core.foundation.DiagnosticsHub.md |
| core.foundation.FeatureFlags | Draft | Feature flag access helpers. | TBD (see spec) | TBD (see spec) | specs/modules/core.foundation/core.foundation.FeatureFlags.md |
| core.foundation.CoreTypes | Draft | Shared Result/AppError/base types. | TBD (see spec) | TBD (see spec) | specs/modules/core.foundation/core.foundation.CoreTypes.md |

### core.storage
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| core.storage.ProjectModel | Beta | Project entities and shapes. | TBD (see spec) | TBD (see spec) | specs/modules/core.storage/core.storage.ProjectModel.md |
| core.storage.ProjectPathResolver | Beta | ProjectId to filesystem paths. | TBD (see spec) | TBD (see spec) | specs/modules/core.storage/core.storage.ProjectPathResolver.md |
| core.storage.FileStorage | Beta | Binary file IO for project files. | TBD (see spec) | TBD (see spec) | specs/modules/core.storage/core.storage.FileStorage.md |
| core.storage.ProjectRegistry | Beta | Project list/create/delete. | TBD (see spec) | TBD (see spec) | specs/modules/core.storage/core.storage.ProjectRegistry.md |
| core.storage.DalContextFactory | Beta | Per-project DB context creation. | TBD (see spec) | TBD (see spec) | specs/modules/core.storage/core.storage.DalContextFactory.md |
| core.storage.MigrationRunner | Draft | DB migration execution per project. | TBD (see spec) | TBD (see spec) | specs/modules/core.storage/core.storage.MigrationRunner.md |

### core.auth
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| core.auth.AuthApiClient | Draft | HTTP client for auth backend. | TBD (see spec) | TBD (see spec) | specs/modules/core.auth/core.auth.AuthApiClient.md |
| core.auth.AuthSessionManager | Beta | Token/session lifecycle handling. | TBD (see spec) | TBD (see spec) | specs/modules/core.auth/core.auth.AuthSessionManager.md |
| core.auth.CurrentUserProvider | Beta | Current user identity + roles. | TBD (see spec) | TBD (see spec) | specs/modules/core.auth/core.auth.CurrentUserProvider.md |
| core.auth.AuthStateStore | Beta | Auth state store (authenticated/unauth). | TBD (see spec) | TBD (see spec) | specs/modules/core.auth/core.auth.AuthStateStore.md |

### core.permissions
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| core.permissions.PermissionModel | Beta | Roles, actions, PermissionContext. | TBD (see spec) | TBD (see spec) | specs/modules/core.permissions/core.permissions.PermissionModel.md |
| core.permissions.PolicyRegistry | Beta | Register/lookup policy handlers. | TBD (see spec) | TBD (see spec) | specs/modules/core.permissions/core.permissions.PolicyRegistry.md |
| core.permissions.PermissionService | Beta | Evaluate permissions via policies. | TBD (see spec) | TBD (see spec) | specs/modules/core.permissions/core.permissions.PermissionService.md |
| core.permissions.PermissionGuards | Beta | Convenience guards for callers. | TBD (see spec) | TBD (see spec) | specs/modules/core.permissions/core.permissions.PermissionGuards.md |

### core.ui
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| core.ui.AppShell | Draft | Top-level React shell. | TBD (see spec) | TBD (see spec) | specs/modules/core.ui/core.ui.AppShell.md |
| core.ui.NavigationRouter | Draft | In-memory router for core screens. | TBD (see spec) | TBD (see spec) | specs/modules/core.ui/core.ui.NavigationRouter.md |
| core.ui.UiStateStore | Stable | Global UI state store. | TBD (see spec) | TBD (see spec) | specs/modules/core.ui/core.ui.UiStateStore.md |
| core.ui.ProjectSelector | Draft | Project list + create/open UI. | TBD (see spec) | TBD (see spec) | specs/modules/core.ui/core.ui.ProjectSelector.md |
| core.ui.ErrorBoundary | Stable | React error boundary component. | TBD (see spec) | TBD (see spec) | specs/modules/core.ui/core.ui.ErrorBoundary.md |
| core.ui.ErrorSurface | Stable | Error rendering surface. | TBD (see spec) | TBD (see spec) | specs/modules/core.ui/core.ui.ErrorSurface.md |

### core.ux.shell
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| core.ux.shell.ShellConfigGovernance | Draft | Governance rules for shell config. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.ShellConfigGovernance.md |
| core.ux.shell.ShellConfigStorage | Draft | Atomic storage for config bundles. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.ShellConfigStorage.md |
| core.ux.shell.ShellConfigValidation | Draft | Schema validation and severity rules. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.ShellConfigValidation.md |
| core.ux.shell.ShellConfigDeployAndRollback | Draft | Deploy/rollback orchestration. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.ShellConfigDeployAndRollback.md |
| core.ux.shell.ModesAdvancedDeveloper | Draft | Advanced/developer mode gating. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.ModesAdvancedDeveloper.md |
| core.ux.shell.SafeMode | Draft | Safe mode behavior definitions. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.SafeMode.md |
| core.ux.shell.RoutingResolution | Draft | Routing resolution logic. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.RoutingResolution.md |
| core.ux.shell.ButtonActionModel | Draft | Button/action interaction model. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.ButtonActionModel.md |
| core.ux.shell.WindowSystem | Draft | Window management and registry. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.WindowSystem.md |
| core.ux.shell.WorkspacePersistence | Draft | User workspace persistence. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.WorkspacePersistence.md |
| core.ux.shell.OverlaySystem | Draft | Overlay/modals system. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.OverlaySystem.md |
| core.ux.shell.ExpressionSystem | Draft | Expression evaluation engine. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.ExpressionSystem.md |
| core.ux.shell.BindingSystem | Draft | Binding runtime and propagation. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.BindingSystem.md |
| core.ux.shell.TemplateSystem | Draft | Template composition and inheritance. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.TemplateSystem.md |
| core.ux.shell.SysadminUi | Draft | Sysadmin UI for shell config. | TBD (see spec) | TBD (see spec) | specs/modules/core.ux.shell/core.ux.shell.SysadminUi.md |

### core (legacy root-level specs)
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| Core_UI_Module | Draft | Legacy core UI module spec (root-level). | TBD (see spec) | Map to core.ui folder or deprecate. | specs/modules/Core_UI_Module.md |
| Core_Runtime_Module | Draft | Legacy runtime module spec (root-level). | TBD (see spec) | Map to core.runtime or deprecate. | specs/modules/Core_Runtime_Module.md |
| Core_ModuleStateRepository | Draft | Legacy module-state repository spec. | TBD (see spec) | Map to core.moduleStateRepository. | specs/modules/Core_ModuleStateRepository.md |
| Core_AccessControl_Module | Draft | Legacy access control spec. | TBD (see spec) | Map to core.accessControl/core.permissions. | specs/modules/Core_AccessControl_Module.md |

### feature.map
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| feature.map | Beta | Map registry and calibration summary. | TBD (see spec) | TBD (see spec) | specs/modules/feature.map.module.md |
| feature.map.ActiveMapService | Draft | Track active map selection. | TBD (see spec) | TBD (see spec) | specs/modules/feature.map/feature.map.ActiveMapService.md |
| feature.map.CalibrationService | Draft | Calibration orchestration. | TBD (see spec) | TBD (see spec) | specs/modules/feature.map/feature.map.CalibrationService.md |
| feature.map.FeatureMapService | Draft | Map registry and metadata access. | TBD (see spec) | TBD (see spec) | specs/modules/feature.map/feature.map.FeatureMapService.md |
| feature.map.ViewportImageryService | Draft | Viewport imagery selection. | TBD (see spec) | TBD (see spec) | specs/modules/feature.map/feature.map.ViewportImageryService.md |

### feature.* (root-level specs)
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| feature.sketch | Draft | Vector sketches for projects/maps. | TBD (see spec) | TBD (see spec) | specs/modules/feature.sketch.module.md |
| feature.files | Draft | Project file library and attachments. | TBD (see spec) | TBD (see spec) | specs/modules/feature.files.module.md |
| feature.comments | Draft | Comment threads for resources. | TBD (see spec) | TBD (see spec) | specs/modules/feature.comments.module.md |
| feature.measure | Draft | Measurement tools and persistence. | TBD (see spec) | TBD (see spec) | specs/modules/feature.measure.module.md |

### debug.projectOverview
| Module | Status | Purpose | Key dependencies | TODOs | Spec path |
| --- | --- | --- | --- | --- | --- |
| debug.projectOverview | Beta | Dev/debug project overview aggregation. | TBD (see spec) | TBD (see spec) | specs/modules/debug.projectOverview.module.md |

---

## Discrepancies resolved in this update
- Added block specs that existed but were not inventoried: core.sysadmin, lib.image, lib.geo, lib.jobs, lib.diagnostics.
- Added module specs that existed but were not inventoried: core.ui.ErrorSurface, all core.foundation/core.storage/core.auth/core.permissions modules, core.ux.shell modules, feature.map services, debug.projectOverview.

## Tooling cross-check table (inventory.json parity)
This table mirrors the current `specs/inventory/inventory.json` entries for CI cross-checking.

| Name | Kind | Layer | Status | Notes | Spec Path |
| --- | --- | --- | --- | --- | --- |
| core.foundation | Module | core | In implementation | Basic app/runtime primitives, env, logging hooks, etc. | specs/modules/core.foundation |
| core.storage | Block | core | Specced | Overall storage behavior across modules. | specs/blocks/core.storage.md |
| core.storage | Module | core | Stable | StoragePaths, atomic write services, manifests; implementation aligned with specs. | specs/modules/core.storage |
| core.auth | Block | core | Specced | Auth flows and UX. | specs/blocks/core.auth.md |
| core.auth | Module | core | Implemented | Auth engine, session management, identity. | specs/modules/core.auth |
| core.permissions | Block | core | Specced | Roles, overrides, UX & behavior. | specs/blocks/core.permissions.md |
| core.permissions | Module | core | Implemented | Permission model, policy registry, service, guards. | specs/modules/core.permissions |
| core.ui | Block | core | Specced | App shell, navigation, workspace experience. | specs/blocks/core.ui.md |
| core.ui | Module | core | Implemented | UI state, router, layout, error boundaries, project selector. | specs/modules/core.ui |
| core.runtime | Module | core | Planned | Module lifetime, hooks, job scheduling, diagnostics integration. |  |
| core.moduleStateRepository | Module | core | Planned | Versioned module-state storage with atomic writes & schemaVersion rules. |  |
| core.accessControl | Module | core | Planned | Authentication, sessions, PermissionContext, roles->permissions mapping. |  |
| feature.map | Block | feature | Specced | Block specced; FeatureMapTypes + read-only FeatureMapService implemented; active map, calibration, viewport, imagery services planned. | specs/blocks/feature.map.block.md |
| feature.map | Module | feature | Specced | Map registry read-only slice implemented; active map/calibration/imagery services not yet implemented. | specs/modules/feature.map/feature.map.module.md |
| feature.sketch | Block | feature | Planned | Sketching tools UI & interactions. |  |
| feature.sketch | Module | feature | Planned | Sketch data model & persistence. |  |
| feature.files | Block | feature | In implementation | File browser UX, upload, links; backend MVP implements file upload/delete using FILE_READ/FILE_WRITE via core.permissions and a membership-aware PermissionContext. |  |
| feature.files | Module | feature | In implementation | File metadata and storage integration; backend MVP implements file upload/delete using FILE_READ/FILE_WRITE via core.permissions. |  |
| feature.comments | Block | feature | In implementation | Comment UI and activity surfaces; MVP focuses on basic create/delete flows. |  |
| feature.comments | Module | feature | In implementation | Comment persistence and permissions; backend MVP implements create/delete using COMMENT_* actions via core.permissions with a membership-aware PermissionContext. |  |
| feature.measure | Block | feature | Planned | Measurement tools on maps/sketches. |  |
| feature.measure | Module | feature | Planned | Measurement math, snapping, tolerances. |  |
| core.exportImport | Module | core | In implementation | Project export/import services; project.db (including project_members) is preserved on import. Export/import permission errors follow the canonical PERMISSION_DENIED AppError shape. | specs/modules/core.exportImport |
| debug.projectOverview | Module | feature | In implementation | Dev/debug-only project overview aggregation module; read-only, permission-respecting views over project-level feature data (maps, files, comments). | specs/modules/debug.projectOverview.module.md |
| lib.image | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.image.md |
| lib.geo | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.geo.md |
| lib.jobs | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.jobs.md |
| lib.diagnostics | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.diagnostics.md |
| core.ux.shell | Block | core | Specced | Runtime configuration shell, deployment lifecycle, and mode management. | specs/blocks/core.ux.shell.md |
| core.ux.shell.ShellConfigGovernance | Module | core | Specced | Rules for what constitutes a valid configuration. | specs/modules/core.ux.shell/core.ux.shell.ShellConfigGovernance.md |
| core.ux.shell.ShellConfigStorage | Module | core | Specced | Atomic file system operations for config management. | specs/modules/core.ux.shell/core.ux.shell.ShellConfigStorage.md |
| core.ux.shell.ShellConfigValidation | Module | core | Specced | Schema validation and severity classification (A1/A2/B). | specs/modules/core.ux.shell/core.ux.shell.ShellConfigValidation.md |
| core.ux.shell.ShellConfigDeployAndRollback | Module | core | Specced | Orchestration of deploy/rollback actions. | specs/modules/core.ux.shell/core.ux.shell.ShellConfigDeployAndRollback.md |
| core.ux.shell.ModesAdvancedDeveloper | Module | core | Specced | Developer-specific features and overrides. | specs/modules/core.ux.shell/core.ux.shell.ModesAdvancedDeveloper.md |
| core.ux.shell.SafeMode | Module | core | Specced | Fail-safe behavioral definitions. | specs/modules/core.ux.shell/core.ux.shell.SafeMode.md |
| core.ux.shell.RoutingResolution | Module | core | Specced | URL mapping strategies and resolution logic. | specs/modules/core.ux.shell/core.ux.shell.RoutingResolution.md |
| core.ux.shell.ButtonActionModel | Module | core | Specced | Standardized interaction model for buttons and triggers. | specs/modules/core.ux.shell/core.ux.shell.ButtonActionModel.md |
| core.ux.shell.WindowSystem | Module | core | Specced | Window management, layout, and registry. | specs/modules/core.ux.shell/core.ux.shell.WindowSystem.md |
| core.ux.shell.WorkspacePersistence | Module | core | Specced | Persistence for user-specific workspace adjustments. | specs/modules/core.ux.shell/core.ux.shell.WorkspacePersistence.md |
| core.ux.shell.OverlaySystem | Module | core | Specced | Management of overlays, modals, and dialogs. | specs/modules/core.ux.shell/core.ux.shell.OverlaySystem.md |
| core.ux.shell.ExpressionSystem | Module | core | Specced | Logic evaluation engine for dynamic behaviors. | specs/modules/core.ux.shell/core.ux.shell.ExpressionSystem.md |
| core.ux.shell.BindingSystem | Module | core | Specced | Reactive data binding and event propagation. | specs/modules/core.ux.shell/core.ux.shell.BindingSystem.md |
| core.ux.shell.TemplateSystem | Module | core | Specced | Workspace composition and template management. | specs/modules/core.ux.shell/core.ux.shell.TemplateSystem.md |
| core.ux.shell.SysadminUi | Module | core | Specced | Administrative interface for shell configuration. | specs/modules/core.ux.shell/core.ux.shell.SysadminUi.md |
| core.ui.nodeGraph | Module | core | Specced | Runtime interpreter for the UI Node Graph (v2). | specs/core/_AI_UI_NODE_GRAPH_SPEC.md |
| core.ui.templates | Module | core | Planned | Value-level inheritance engine for UI templates. | specs/core/_AI_UI_NODE_GRAPH_SPEC.md |
| core.ui.themes | Module | core | Planned | Theme engine and Sysadmin Builder profile tokens. | specs/core/_AI_UI_NODE_GRAPH_SPEC.md |
| core.logic.conditions | Module | core | Planned | Declarative conditions engine with bounded regex support. | specs/core/_AI_UI_NODE_GRAPH_SPEC.md |
| core.data.namedQueries | Module | core | Planned | Secure, named query execution system for UI data binding. | specs/core/_AI_UI_NODE_GRAPH_SPEC.md |
| core.data.modelBuilder | Module | core | Planned | Sysadmin-authored data models and migration governance. | specs/core/_AI_DB_AND_DATA_MODELS_SPEC.md |
| core.ui.widgets | Module | core | Planned | Built-in widget registry (PDF Viewer, Image Editor, Surface Viewport). | specs/core/_AI_UI_NODE_GRAPH_SPEC.md |

## Inventory gaps and TODOs
- Missing block specs for feature.sketch, feature.files, feature.comments, feature.measure (module specs exist).
- No module specs under `specs/modules/lib.*` for the lib.* blocks (specs only exist at block level).
- Legacy root-level core specs in `specs/modules/Core_*.md` need mapping to block folders or deprecation decisions.
- Dependency and TODO metadata for many entries is not yet extracted; update per module spec when available.
- This inventory is spec-only; any implemented modules without specs require code inspection to confirm and add.

---

## Process notes
- Update this file whenever new block or module specs are added.
- If a spec is moved or renamed, update the Spec path here to avoid dead links.

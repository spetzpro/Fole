# Module Specification: core.runtime

## Module ID
core.runtime

## Purpose
Provides application bootstrap, composition of core and feature modules, and runtime lifecycle orchestration without owning business rules.

## State Shape
```ts
{
  // RuntimeContext is a composition of core services made available to modules.
  runtimeContext: {
    storage: CoreStorageServices;
    permissions: CorePermissionsServices;
    auth: CoreAuthServices;
    diagnostics: DiagnosticsHub;
    jobs: JobsRuntime;
    config: ConfigService;
  };
}
```

## Blocks
- RuntimeBootstrap: resolve configuration, construct RuntimeContext, and initialize core modules.
- RuntimeLifecycle: manage startup/shutdown hooks for modules and background workers.
- RuntimeMigrations: coordinate project and system migrations by delegating to core.storage MigrationRunner.
- RuntimeJobs: start/stop background job workers using lib.jobs infrastructure.

## Lifecycle
- On startup, read environment and config via core.foundation.ConfigService.
- Build a RuntimeContext, wiring in core.auth, core.permissions, core.storage, core.ui, lib.jobs, lib.diagnostics.
- Invoke registered startup hooks for modules (where applicable).
- Before serving traffic or UI, ensure migrations have been run using core.storage.MigrationRunner.
- On shutdown, invoke registered cleanup hooks and stop job workers gracefully.

## Dependencies
- core.foundation (ConfigService, DiagnosticsHub, CoreTypes)
- core.storage (ProjectRegistry, ProjectPathResolver, MigrationRunner)
- core.auth, core.permissions, core.ui
- lib.jobs, lib.diagnostics

## Error Model
- RuntimeBootstrapError: failure to construct RuntimeContext (e.g., invalid config, missing dependencies).
- RuntimeMigrationError: migrations failed before runtime became healthy.
- RuntimeJobsError: job worker orchestration failed to start or stop cleanly.

All errors surface through DiagnosticsHub and, if fatal, cause the host process to exit with a clear message and logs.

## Test Matrix
- Startup success: with valid config and healthy dependency modules, runtime reaches 'ready' state.
- Migration required: simulate pending migrations and assert they run before 'ready' state.
- Job wiring: verify that job workers are started when configured, and stopped on shutdown.
- Failure paths: invalid configuration, missing storage, or broken module initialization must fail fast with diagnostics, not partial startup.

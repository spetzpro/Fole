# Block: lib.diagnostics

## Block ID
lib.diagnostics

## 1. Purpose

The `lib.diagnostics` block defines **low-level diagnostics primitives** used by the rest of the system for logging, metrics, and tracing.

It is responsible for:

- Providing pluggable **sinks** for logs, metrics, and traces.
- Providing basic **tracing primitives** (trace/span identifiers) for correlation.
- Being configured by higher-level infrastructure (e.g. `core.foundation.DiagnosticsHub`) so that all diagnostic events flow into the right sinks.
- Remaining **infrastructure-focused** and not embedding business logic.

It is not responsible for:

- Exposing UI-visible errors or notifications.
- Defining business-specific diagnostic events (those are produced by callers).
- Directly owning user-facing monitoring dashboards (those are built on top of its sinks).

Currently, `lib.diagnostics` is **Specced only**: there is no implementation under `src/lib/**` in this repo.

## 2. Scope and Non-Scope

### In scope

- Abstractions for:
  - Logging sinks (console/file/external).
  - Metrics sinks (counters/gauges/histograms).
  - Tracing primitives (trace/span IDs).
  - Diagnostics configuration (how sinks are wired at startup).

### Out of scope

- Concrete integrations with vendors (these are specific sink implementations).
- Persistent storage of diagnostic data; sinks may choose how and where to store.
- UI- or feature-specific error semantics.

## 3. Block Decomposition

`lib.diagnostics` is conceptually decomposed into these modules:

| Module ID                                           | Responsibility                                        | Status  |
|-----------------------------------------------------|-------------------------------------------------------|---------|
| `lib.diagnostics.LoggingSinkService`                | Pluggable sinks for log events                        | Specced |
| `lib.diagnostics.MetricsSinkService`                | Pluggable sinks for metrics (counters/gauges/histograms) | Specced |
| `lib.diagnostics.TracingService`                    | Trace/span ID creation and propagation                | Specced |
| `lib.diagnostics.DiagnosticsConfigService`          | Interpret config and wire sinks + sampling            | Specced |

### Block lifecycle status: **Specced**

- Types and responsibilities are defined in specs only.
- There is **no implementation** or tests in this repo for these modules.

## 4. Responsibilities per Module (High-Level)

### 4.1 LoggingSinkService (Specced)

- Defines an interface for log sinks (e.g. `log(event: LogEvent)`).
- Allows registering different sinks (console, file, remote).
- Ensures failures in sinks are contained and never crash callers.

### 4.2 MetricsSinkService (Specced)

- Defines interfaces for metrics sinks (counters, gauges, histograms).
- Provides a way to record metrics in a backend-agnostic manner.
- Ensures metrics recording is best-effort and failures are non-fatal.

### 4.3 TracingService (Specced)

- Defines functions for:
  - Starting new traces/spans.
  - Propagating trace IDs across module/async boundaries.
- Used by higher-level modules (e.g. request handlers, job workers) for correlation.

### 4.4 DiagnosticsConfigService (Specced)

- Interprets diagnostics-related config (e.g., which sinks are enabled, sampling rates).
- Provides helpers to configure sinks at startup.
- Coordinates with `core.foundation.DiagnosticsHub` to plug lib.diagnostics sinks into the hub.

## 5. Dependencies

### Allowed dependencies

`lib.diagnostics` may depend on:

- `core.foundation.CoreTypes` for Result/AppError semantics.
- `core.foundation.DiagnosticsHub` (as a consumer of events or as a configuration point).

It MUST NOT depend on:

- Features (`feature.*`).
- High-level core blocks (auth, permissions, storage, UI) beyond configuration injection.

### Downstream dependents

- `core.foundation.DiagnosticsHub` uses lib.diagnostics to forward events to sinks.
- `lib.jobs`, `lib.image`, `lib.geo` may use tracing/metrics primitives.
- Any module needing deeper diagnostics beyond the basic hub.

## 6. Performance and Testing Considerations (Planned)

- Sinks must be designed so that diagnostics overhead remains small relative to business logic.
- Tests (when implemented) must:
  - Verify sink hot-swapping.
  - Validate failure isolation (sink failures do not crash callers).
  - Measure overhead in stress/load scenarios.

## 7. CI / Governance Integration

When `lib.diagnostics` is implemented in this repo:

- Block and module specs must be updated to describe real APIs and invariants.
- Corresponding tests must be added.
- Inventory entries must be updated from `Specced` to `Implemented` as appropriate.
- `npm run spec:check` must remain green.


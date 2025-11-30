# Block: lib.jobs

## Block ID
lib.jobs

## 1. Purpose

The `lib.jobs` block provides the **job and automation runtime** described in `_AI_AUTOMATION_ENGINE_SPEC.md`.

It is responsible for:

- Defining job queues and enqueue APIs.
- Running job workers with controlled concurrency and retry policies.
- Optional scheduling for recurring or delayed jobs.
- Exposing job status/metrics for monitoring.

It is **Specced only** in this repo; no implementation exists under `src/lib/**` yet.

## 2. Scope and Non-Scope

### In scope

- Infrastructure-level job queueing and dispatch.
- Retry and backoff policies for transient failures.
- Dead-letter handling for repeatedly failing jobs.
- Basic monitoring hooks for job throughput, failure rates, and latency.

### Out of scope

- Business-specific job handlers (those live in feature/core modules).
- Persisting job payloads in a specific schema (DB/storage specs cover that).

## 3. Block Decomposition

`lib.jobs` is conceptually decomposed into:

| Module ID                              | Responsibility                                        | Status  |
|----------------------------------------|-------------------------------------------------------|---------|
| `lib.jobs.JobQueueService`            | Enqueue jobs with payloads and metadata               | Specced |
| `lib.jobs.JobWorkerService`           | Dispatch jobs to handlers with concurrency + retries  | Specced |
| `lib.jobs.JobScheduler`               | Optional scheduling for recurring/delayed jobs        | Specced |
| `lib.jobs.JobMonitoringService`       | Status/metrics for job throughput and failures        | Specced |

### Block lifecycle status: **Specced**

- All modules are conceptual only.
- No job runtime implementation exists in this repo.

## 4. Responsibilities per Module (High-Level)

### 4.1 JobQueueService (Specced)

- Provides an API to enqueue jobs with:
  - Type.
  - Payload.
  - Optional scheduling metadata.

### 4.2 JobWorkerService (Specced)

- Polls queues.
- Dispatches jobs to handlers.
- Applies retry/backoff policies based on `_AI_AUTOMATION_ENGINE_SPEC.md`.

### 4.3 JobScheduler (Specced)

- Schedules recurring or delayed jobs.
- Integrates with JobQueueService for actual enqueue.

### 4.4 JobMonitoringService (Specced)

- Exposes status and metrics:
  - Completed/failed jobs.
  - Latency distributions.
  - Current backlog.

## 5. Dependencies

### Allowed dependencies

- `core.storage` (for queues implemented via DB/files).
- `lib.diagnostics` for logging/metrics.
- `core.runtime` for wiring workers at startup.

### Downstream dependents

- `lib.image` (image processing jobs).
- `feature.*` modules that define job handlers (imports/exports, long-running tasks).

## 6. Testing and CI (Planned)

When implemented:

- Tests MUST validate:
  - Enqueue/execute flows.
  - Retry semantics.
  - Dead-letter behavior.
  - Integration with feature-defined job handlers.

As implementation appears, specs and inventories must be updated to reflect actual maturity (Implemented vs Stable).

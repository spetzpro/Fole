# Dependencies Governance

This folder defines **allowed dependencies** between modules/blocks/libs at the architectural level.

It is intentionally simple and CI-enforceable.

## Files

- `allowed_dependencies.json` — declarative rules about which *layers* may depend on which other layers, plus optional per-module overrides.

## Concept

We use three main layers:

- `core`   — foundational modules (auth, storage, UI shell, etc.).
- `feature` — feature slices (map, sketch, files, comments, etc.).
- `lib`    — shared technical utilities (image pipeline, geo math, diagnostics, jobs, etc.).

Basic rules:

- Core can depend on **core + lib**.
- Feature can depend on **feature + core + lib**.
- Lib can depend on **lib only** (no core/feature upwards coupling).

These rules are expressed in `allowed_dependencies.json` and validated in CI by reading:

- `specs/inventory/inventory.json` — to know each module's `layer`.
- `specs/dependencies/allowed_dependencies.json` — to know which layers are allowed.

At this stage, enforcement is **structural**: it ensures the configuration is valid and consistent.
You can later extend the validator to crawl code imports and flag real edges that break these rules.

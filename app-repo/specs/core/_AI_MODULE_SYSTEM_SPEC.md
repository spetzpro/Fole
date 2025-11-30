# AI Guidance: Module & Block System

File: `specs/core/_AI_MODULE_SYSTEM_SPEC.md`  
Scope: How the AI should think about *blocks*, *modules*, and their relationships in this codebase.

---

## 1. Goals

The module system exists to:

- Keep the architecture **explicit and navigable** for both humans and AI.
- Make it easy to see **what exists**, **where it lives**, and **how it depends on other parts**.
- Avoid “spaghetti” dependencies by enforcing simple, stable layering rules.
- Give AI agents a deterministic way to answer:  
  > “What should I work on next, and where is the spec for it?”

This file describes the *conceptual model*. The concrete list of modules lives in:

- `specs/modules/README.md`

The authoritative lifecycle status for all blocks and modules (planned/specced/in implementation/implemented/stable) lives in:

- `specs/Blocks_Modules_Inventory.md`

---

## 2. Core Concepts

### 2.1 Blocks

A **Block** is a logical grouping of modules that belong together. Blocks are named with prefixes:

- `core.*` – foundational building blocks used across the app.
- `feature.*` – user-facing features (maps, sketches, files, comments, etc.).
- `lib.*` – shared low-level libraries (math, geometry, image tools, etc.).

Examples:

- `core.foundation`
- `core.storage`
- `core.auth`
- `core.permissions`
- `core.ui`
- (future) `feature.map`, `feature.sketch`, `feature.files`, `feature.comments`, …
- (future) `lib.geo`, `lib.image`, …

Each block has a **block spec** that describes its purpose, responsibilities, and dependencies:

- `specs/blocks/core.foundation.md`
- `specs/blocks/core.storage.md`
- `specs/blocks/core.auth.md`
- `specs/blocks/core.permissions.md`
- `specs/blocks/core.ui.md`
- (future) `specs/blocks/feature.map.block.md`, etc.

### 2.2 Modules

A **Module** is a concrete unit of functionality inside a block, usually corresponding to a small TS module or cluster of files in `src/`.

Naming convention:

- `<block>.<Name>`

Examples:

- `core.foundation.ConfigService`
- `core.foundation.Logger`
- `core.storage.ProjectRegistry`
- `core.auth.AuthSessionManager`
- `core.permissions.PermissionService`
- `core.ui.NavigationRouter`

Each module has its own **module spec**:

- `specs/modules/<block>/<moduleName>.md`

For example:

- `specs/modules/core.storage/core.storage.ProjectRegistry.md`
- `specs/modules/core.ui/core.ui.NavigationRouter.md`

These specs define:

- Purpose & responsibilities
- Public API (types/interfaces)
- Behavior notes & constraints
- Dependencies (what this module is allowed to touch)

### 2.3 Modules Overview (Inventory)

There is a single canonical index of all blocks and modules:

- `specs/modules/README.md`

This file is the **machine-friendly inventory** and should be consulted by AI agents before attempting to:

- add new modules
- change existing ones
- generate core/feature implementations

It answers:

- which blocks exist
- which modules exist in each block
- where the spec file for each module lives
- what the spec-level status is (`SPEC_READY`, etc.)

---

## 3. Layering & Dependency Rules

The system follows simple layering rules:

### 3.1 Layer Ordering

From lowest level to highest:

1. `lib.*` – shared, low-level utilities (geometry, image processing, etc.).  
2. `core.*` – foundation for the entire app (auth, permissions, storage, UI shell, etc.).  
3. `feature.*` – concrete product features (map workspace, sketching, file management, comments, etc.).  
4. `ux/` & high-level specs – user experience descriptions and product behavior.  
5. Application wiring & bootstrapping code.

### 3.2 Allowed Dependencies

- `lib.*` may only depend on:
  - other `lib.*` blocks (carefully)
  - external libraries
- `core.*` may depend on:
  - `lib.*`
  - other `core.*` blocks (respecting architectural intent)
- `feature.*` may depend on:
  - `core.*`
  - `lib.*`
- `ux/` and AI core specs (`specs/core/_AI_*.md`) may reference anything, but are not imported by code.

**Forbidden** examples:

- `core.*` depending on `feature.*`
- `lib.*` depending on `core.*` or `feature.*`
- Feature modules jumping across layers in a way that breaks the above rules.

When in doubt, favor:

- shared logic → `lib.*`
- cross-feature product logic → `core.*`
- workflow-specific UI / behavior → `feature.*`

---

## 4. Filesystem Layout for Specs

### 4.1 Block Specs

All block-level specs live under:

- `specs/blocks/`

Examples:

- `specs/blocks/core.foundation.md`
- `specs/blocks/core.storage.md`
- `specs/blocks/core.auth.md`
- `specs/blocks/core.permissions.md`
- `specs/blocks/core.ui.md`

Future blocks (e.g. `feature.map`, `lib.geo`) will get their own `specs/blocks/<block>.md` file.

### 4.2 Module Specs

All module-level specs live under:

- `specs/modules/<block>/<moduleName>.md`

Examples:

- `specs/modules/core.foundation/core.foundation.ConfigService.md`
- `specs/modules/core.foundation/core.foundation.Logger.md`
- `specs/modules/core.storage/core.storage.ProjectRegistry.md`
- `specs/modules/core.auth/core.auth.AuthSessionManager.md`
- `specs/modules/core.permissions/core.permissions.PermissionService.md`
- `specs/modules/core.ui/core.ui.AppShell.md`

### 4.3 Modules Inventory

The global index is:

- `specs/modules/README.md`

This file is maintained manually (with AI assistance) and should always reflect the current set of modules and their spec status.

---

## 5. Relationship to `_AI_*` Specs

The `_AI_*.md` docs under `specs/core/` are **high-level, AI-facing architecture documents**. They:

- describe domain areas (roles/permissions, UI system, storage, etc.)
- define design principles and constraints
- set expectations for behavior across blocks/modules

The module system sits **in between** these and the actual code:

- `_AI_*.md` → high-level design and behavior expectations
- `specs/blocks/*.md` → block-level design
- `specs/modules/**/*.md` → concrete contracts for implementation
- `src/**` → actual code

AI agents should:

1. Read relevant `_AI_*.md` docs for context.
2. Read the block spec for the block they are working in.
3. Read the module spec(s) they need to touch.
4. Only then modify or generate code.

---

## 6. How AI Agents Should Use the Module System

When doing **any non-trivial work**, AI agents should:

1. **Start from the inventory:**
   - Open `specs/modules/README.md`.
   - Identify the relevant block(s) and module(s).
2. **Read block spec:**
   - For the chosen block, read `specs/blocks/<block>.md`.
3. **Read module spec(s):**
   - For each module to touch, read `specs/modules/<block>/<moduleName>.md`.
4. **Check higher-level `_AI_*` specs if needed:**
   - e.g. for permissions, see `_AI_ROLES_AND_PERMISSIONS.md`
   - e.g. for UI shell, see `_AI_UI_SYSTEM_SPEC.md`
5. **Respect layering rules:**
   - Do not introduce dependencies that violate the allowed directions.
6. **Keep the inventory up to date:**
   - When adding a new module spec, register it in `specs/modules/README.md`.
   - Mark status as `SPEC_DRAFT`, `SPEC_READY`, etc.

This ensures the architecture remains stable, comprehensible, and maintainable as the system grows.

---

## 7. Future Work

- Introduce and spec `lib.*` blocks for shared concerns (geo, image processing, etc.).
- Introduce and spec `feature.*` blocks (map, sketch, files, comments, geo, imagePipeline).
- Extend `specs/modules/README.md` with:
  - simple dependency annotations per module
  - implementation status (e.g. `IMPL_WIP`, `IMPL_DONE`).

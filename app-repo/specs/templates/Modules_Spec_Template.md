# Module Specification Template

> This template is aligned with `Spec_Workflow_Guide.md`. Do not remove required sections; add module-specific details beneath them.

## Module ID
<unique-module-id>

## Inventory Mapping
- Inventory Name: <name-as-in-Blocks_Modules_Inventory>
- Kind: Module
- Layer: <core | feature | lib>
- Status: <Planned | Specced | In implementation | Implemented | Stable>

## Purpose
<short summary of what this module does and what contracts it owns>

## State Shape
```ts
{
  // describe module state (persistent + in-memory, if relevant)
}
```

## Blocks
- <block-id>: <purpose>

## Public API (Operations)

### operationName
- Inputs:
- Outputs:
- Permissions:
- Underlying blocks:

## Lifecycle
<init, upgrade, migration; note how schemaVersion or migrations are handled if relevant>

## Planned vs Implemented

- Planned:
  - <planned operations/behaviors not yet live>
- Implemented:
  - <operations/behaviors that are live in main and covered by tests>

## Dependencies
- Modules:
  - <module-id> — <reason>
- System Specs:
  - <_AI_*.md> — <relevant rules/invariants>
- External services:
  - <service> — <usage>

## Error Model
<module-level errors; how they propagate to callers / UI>

## Test Matrix
<scenarios, invariants, important edge cases; link to test files if helpful>

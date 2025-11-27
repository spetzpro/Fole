# Performance Budget

This folder defines a **performance budget skeleton** for the app.

It is intentionally simple so it can be:
- Read by humans and AI agents.
- Enforced structurally by CI.
- Tuned later once we have real measurements.

## Files

- `performance_budget.json` — declarative budget for global app behavior and key modules.

## Concept

- `globalBudgets` — cross-cutting UX targets (e.g. app shell interactive time).
- `moduleBudgets` — per-module budgets tied to entries in `specs/inventory/inventory.json`:
  - `name` — must match `items[*].name` in the inventory.
  - `layer` — `core | feature | lib`, must match the inventory layer.
  - `budgets` — object of named metrics, numeric values in milliseconds.
  - `notes` — free-form explanation.

At this stage, CI will only check:
- The JSON structure is valid.
- All `moduleBudgets[*].name` exist in the inventory.
- The `layer` matches the inventory definition.

You can later extend the validator to:
- Tie metrics to actual measurements from your observability stack.
- Fail PRs that push budgets beyond agreed thresholds.

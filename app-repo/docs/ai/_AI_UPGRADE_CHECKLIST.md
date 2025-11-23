# AI Upgrade Checklist
Version: SPEC_V1.0
Last-Updated: 2025-11-23

This checklist must be run whenever:
- Upgrading to a new AI model,
- Updating `_AI_MASTER_RULES.md`,
- Modifying spec templates,
- Or changing the behavior of module/block/library relationships.

## Required Verification

- [ ] AI can correctly summarize the spec precedence hierarchy (core specs → modules → libs → blocks).
- [ ] AI respects that modules own DB/storage layouts; blocks use module services only.
- [ ] AI understands the role of `specs/libs` and the rules for helper promotion.
- [ ] AI acknowledges STOP rules for:
  - helper promotion,
  - version conflicts,
  - unresolved spec contradictions.
- [ ] AI can correctly explain the difference between module specs, block specs, and library specs.
- [ ] AI understands that `SPEC_VERSION` labels govern interpretation.
- [ ] AI does not propose creating new schema or STORAGE_ROOT paths in block specs.
- [ ] AI correctly identifies local helpers as implementation details.
- [ ] AI can describe when promotion of helpers is allowed (human-approved only).

This file is intentionally short and serves as a human-run diagnostic to confirm correctness after toolchain changes.

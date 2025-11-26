# Specs Hub

This README is the navigation hub for all specification-related documents. It does **not** define rules by itself; it points to the authoritative sources.

## 1. Inventory & Status

- **Blocks & Modules Inventory (single source of truth for what exists, where, and its status):**  
  `specs/Blocks_Modules_Inventory.md`

- **Missing Spec Paths Checklist (tracks spec debt and missing links):**  
  `docs/specs/Missing_Spec_Paths_Checklist.md`

## 2. Workflow & Governance

- **Spec & Implementation Workflow Guide (authoritative process for adding/changing modules, specs, and core behavior):**  
  `docs/specs/Spec_Workflow_Guide.md`

- **Master Rules for AI behavior and system-wide constraints:**  
  `specs/core/_AI_MASTER_RULES.md`

## 3. Module & Block Specs

- **Module system overview & how to write module specs:**  
  `specs/modules/README.md`

- **Module specs (core, feature, lib):**  
  `specs/modules/` and `specs/lib/`

- **Block specs:**  
  `specs/blocks/`

## 4. System (_AI_*) Specs

System-wide behavior is defined in the `_AI_*` specs in `specs/core/`, for example:

- Roles and permissions: `_AI_ROLES_AND_PERMISSIONS.md`
- UI system: `_AI_UI_SYSTEM_SPEC.md`
- Storage architecture and DB models: `_AI_STORAGE_ARCHITECTURE.md`, `_AI_DB_AND_DATA_MODELS_SPEC.md`
- Geo and calibration: `_AI_GEO_AND_CALIBRATION_SPEC.md`
- File and image pipeline: `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`
- Concurrency, locking, testing, monitoring, etc.

## 5. Templates

When creating new specs, always start from these templates:

- **Module spec template:**  
  `specs/templates/Modules_Spec_Template.md`

- **Block spec template:**  
  `specs/templates/Blocks_Spec_Template.md`

## 6. AI Usage Note

VS Code AI agents and ChatGPT should:

1. Use `specs/Blocks_Modules_Inventory.md` to discover modules/blocks and their spec paths.
2. Use module/block specs + `_AI_*` docs as the authoritative definition of behavior.
3. Use `docs/specs/Spec_Workflow_Guide.md` to decide how to introduce or evolve modules and specs.

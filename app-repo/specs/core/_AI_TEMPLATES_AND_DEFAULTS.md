Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_TEMPLATES_AND_DEFAULTS.md
Templates, defaults, and how they are stored, overridden, and used

This document defines how templates and default values work across the FOLE platform:
- where they live (repo vs runtime),
- how they are applied and overridden (factory → server → project),
- how upgrades interact with existing data,
- and what AI agents are allowed to do with them.

It is binding for:
- all AI agents,
- backend services,
- admin UIs that surface templates and defaults.

--------------------------------------------------------------------

1. PURPOSE AND SCOPE

Provide a deterministic, layered model for:
- factory defaults (shipped with code),
- server defaults (per deployment),
- project overrides (per project).

Ensure:
- templates are version-controlled where appropriate,
- runtime changes never modify repository factory templates,
- upgrades are predictable and safe,
- AI agents have clear rules for reading, editing, and generating templates.

Applies to:
- Role and permission templates
- Project creation templates
- Map creation templates
- Sketch-feature templates
- UI presets and naming schemes
- Module defaults

--------------------------------------------------------------------

2. DEFINITIONS

Factory Defaults
- Stored in: app-repo/templates/
- Read-only at runtime.
- Version controlled.
- AI must not modify.

Server Defaults
- Stored in: STORAGE_ROOT/templates/
- Writable by sysadmin through UI/API or manual edits when explicitly requested.
- AI may modify only through DAL/Config APIs.
- Initialized from factory templates on first use.

Project Overrides
- Stored in: STORAGE_ROOT/modules/projects/<projectId>/config/templates/
- Indexed inside project.db
- Apply only to that project.

--------------------------------------------------------------------

3. DIRECTORY LAYOUT

Factory templates (repository):
app-repo/templates/
  core/
  projects/
  maps/
  roles/
  modules/

Server defaults (runtime):
STORAGE_ROOT/templates/
  core/
  projects/
  maps/
  roles/
  modules/

Project overrides:
STORAGE_ROOT/modules/projects/<projectId>/
  project.db
  config/templates/*.json

--------------------------------------------------------------------

4. TEMPLATE TYPES

Core templates:
- Naming schemes
- Translation behavior
- Role mappings
- Units

Project templates:
- Defaults for new projects

Map templates:
- Default CRS
- Default layers
- Map roles

Role templates:
- Encoded permissions consistent with _AI_ROLES_AND_PERMISSIONS.md

Module templates:
- Tool groups
- Symbol sets
- Property schemas

--------------------------------------------------------------------

5. INITIALIZATION PROCESS

On server-start or first use:
1. Compute checksum of factory template.
2. If no server template:
   - Copy factory → server directory.
   - Record metadata.
3. If server template exists:
   - Do not overwrite.
   - If checksum differs: mark server copy “out-of-date”.

Runtime resolution:
- Use server defaults first.
- Apply project overrides last.
- Never modify factory templates.

--------------------------------------------------------------------

6. RESOLUTION ORDER

When resolving templates:
1. Project override
2. Server default
3. Factory default
4. Hardcoded fallback (emergency only)

Missing value:
- Treated as unset with minimal safe behavior.

--------------------------------------------------------------------

7. SYSADMIN RULES

Sysadmins may:
- Edit server templates
- Define new defaults

Sysadmins must not:
- Modify factory templates at runtime
- Create templates contradicting authoritative specs

Server default changes:
- Affect new projects only.
- Existing projects remain unchanged unless migrated.

--------------------------------------------------------------------

8. EFFECT ON EXISTING PROJECTS

Existing projects are unchanged unless migrated explicitly.

Migrations must:
- Be versioned
- Be documented
- List changed fields
- Have rollback plan
- Require human confirmation

UI actions like “reapply defaults”:
- Must show diffs
- Require confirmation

--------------------------------------------------------------------

9. UPGRADE AND VERSIONING

Required metadata for factory templates:
templateName
templateVersion
schemaVersion

Server template metadata also includes:
sourceTemplateVersion
sourceChecksum
lastModifiedAt

Schema version rule:
- Must track changes in underlying data model.

On upgrade:
- Factory templates are updated in repo.
- Server templates are NOT overwritten.
- Mark out-of-date and offer:
  - diff
  - reset
  - merge

--------------------------------------------------------------------

10. AI RULES AND DESTRUCTIVE CHANGES

AI must:
- Load this spec before editing templates.
- Never modify factory templates.
- Use DAL/API for runtime template edits.
- Write overrides into project config/db.

AI must STOP if:
- Layer is unclear
- Server template missing or corrupt during project creation
- Operation overwrites server template
- Change contradicts other authoritative specs

Destructive template changes include:
- Reducing permissions
- Disabling modules
- Deleting default entities
- Breaking project creation

Destructive changes require:
1. destructive-change.json
2. Two human approvals
3. Rollback plan

--------------------------------------------------------------------

11. COMMON FLOWS

New factory template:
- Add under app-repo/templates/
- Include metadata
- Human review required

Modifying server defaults:
- Must show diff
- Must have confirmation for risky changes

Creating project overrides:
- Written to project DB or config
- Clearly marked as project-local

--------------------------------------------------------------------

12. STOP CONDITIONS AND FORBIDDEN ACTIONS

AI must STOP if:
- Template type unknown
- Path ambiguous
- Change conflicts with other specs

AI must NOT:
- Modify factory templates
- Remove required keys without migration
- Create new template directories without approval

--------------------------------------------------------------------

13. RELATION TO OTHER SPECS

Works with:
- _AI_MASTER_RULES.md
- _AI_STORAGE_ARCHITECTURE.md
- _AI_ROLES_AND_PERMISSIONS.md
- _AI_UI_SYSTEM_SPEC.md

Template-layer resolution rules override only template concerns.

--------------------------------------------------------------------

14. AUDITABILITY

All modifications to server templates must be auditable:
- who
- when
- diff
- reason

Backups must include:
- STORAGE_ROOT/templates/

--------------------------------------------------------------------

End of document.
_AI_TEMPLATES_AND_DEFAULTS.md  
Authoritative.

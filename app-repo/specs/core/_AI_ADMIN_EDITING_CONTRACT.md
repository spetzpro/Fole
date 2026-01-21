# Admin Editing Contract

**Version:** 1.0.0
**Source:** Derived from `core.ux.shell.md` and `_AI_TEMPLATES_AND_DEFAULTS.md`.

This document defines the strict contract for what Sysadmins (Normal Mode) and Advanced Users can edit in the Shell Configuration.

## 1. Mode Definitions

- **Normal Mode**: Standard administrative user.
- **Advanced Mode**: Power user.
- **Developer Mode**: System engineer with `FOLE_DEV` flags.

## 2. Editability Matrix

| Block Category | Normal Mode | Advanced Mode | Developer Mode |
| :--- | :--- | :--- | :--- |
| **Header / Footer** | **Content Safe-Edit Only**<br>(Text labels, Toggle visibility).<br>*Cannot move/delete.* | **Risk-Edit Allowed**<br>(Reorder items).<br>*Cannot delete block.* | **Full Access** |
| **Core Buttons** | **Read Only**. | **Read Only**.<br>(Visibility toggle allowed). | **Structural Edit**. |
| **Routing** | **Safe Edit Allowed**<br>(Rename labels, Reorder routes).<br>*Cannot delete routing block.* | **Risk-Edit Allowed**<br>(Add/modify routes/aliases). | **Full Access**. |
| **Theme Tokens** | **Value Edit Only**. | **Value Edit Only**. | **Schema Edit**. |
| **Viewport Rules** | **Read Only**. | **Read Only**. | **Full Access**. |

## 3. General Rules

1. **No Structural Deletions**: Sysadmins cannot delete core blocks (Header, Routing, Viewport) that define the app frame.
2. **Safe Editing Only**: Changes must not break the JSON schema or introduce invalid references.
3. **Validation**: All edits are subject to the Validation Pipeline (A1/A2/B severity).

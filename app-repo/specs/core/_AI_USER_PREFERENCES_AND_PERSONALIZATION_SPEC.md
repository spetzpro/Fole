# _AI_USER_PREFERENCES_AND_PERSONALIZATION_SPEC.md
Version: 1.0.0
Last-Updated: 2025-11-23
Status: Authoritative Specification (SSOT)

# AI User Preferences & Personalization Specification
Defines how FOLE stores, applies, synchronizes, and respects user preferences across devices, sessions, projects, and modules.

## 1. PURPOSE
- Provide deterministic rules for user-pref handling.
- Ensure preferences never override permissions.
- Ensure AI agents read preferences but never guess missing values.
- Ensure persistence, sync, and conflict resolution are stable.

## 2. PREFERENCE CATEGORIES
### 2.1 UI Preferences
- theme (light/dark/system)
- language
- accentColor
- layout presets
- pinned tools
- window positions (optional, privacy-safe)
- zoom defaults

### 2.2 Project-Scoped Preferences
- default map view
- default sketch tool
- preferred measurement units
- default layer visibility

### 2.3 Device-Local Preferences
- GPU acceleration toggle
- performance hints
- input-device mappings

### 2.4 AI Interaction Preferences
- verbosity level
- explanation depth
- tone options
- safe-mode restrictions (opt-in)

## 3. STORAGE MODEL
### 3.1 Server-Stored (Sync Across Devices)
Stored in:
STORAGE_ROOT/users/<userId>/prefs.json

Contains:
- ui
- ai
- project-overrides
- module-overrides

### 3.2 Device-Local (Not Synced)
- local cache
- hardware settings
- window geometry
- shortcut overrides (optional)

### 3.3 Real-Time Overrides
- Temporary session overrides never persisted without explicit user action.

## 4. MERGE ORDER
When resolving an effective preference:
1. Session override (temporary)
2. Project-scoped override
3. Server preference
4. Factory default
5. Hardcoded fallback (never used by AI automatically)

## 5. AI RULES
### 5.1 AI MUST
- Read preferences before UI generation.
- Use preferences when selecting tools or UI defaults.
- Ask user when preference is missing.
- Log discrepancies.

### 5.2 AI MUST NOT
- Write server-level preferences unless instructed.
- Assume absent preference equals “allow”.
- Infer user intent from behavior; explicit confirmation required.

## 6. PRIVACY & SECURITY
- prefs.json must be mode 0600.
- No private data from project used to infer preferences.
- Window geometry can be disabled for privacy.

## 7. EXPORT/IMPORT
- User prefs exported/imported separately from project data.
- Must include checksums.

## 8. CONFLICT RESOLUTION
If sync conflict:
- latest timestamp wins.
- If semantic conflict detected → AI must stop and ask.

## 9. AUDITABILITY
Every server-side preference change stored in:
STORAGE_ROOT/logs/prefs/<userId>.log

## 10. RELATION TO OTHER SPECS
- Must comply with UI spec for layout limits.
- Must not override permissions spec.
- Must follow storage atomicity spec.

End of document.

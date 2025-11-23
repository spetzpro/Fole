Document: _AI_UI_SYSTEM_SPEC.md  
Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# FOLE UI SYSTEM SPEC  
**How windows, viewers, tools, selection, undo, help and translation work.**

This document defines the **entire UI architecture** for FOLE.  
All AI agents and all frontend implementations **MUST** follow this spec.

---

## 1. SCOPE & PRINCIPLES

### 1.1 Scope

This spec governs:

- Global layout (header, footer, view area)
- Window system and window types
- Viewer windows and toolbars
- Selection model
- Undo/redo behavior in the UI
- Help Mode and Translation Mode
- File/image handling windows
- Allowed layout patterns
- Extension rules for new UI elements

### 1.2 Core Principles

1. **Windows Everywhere**  
   All UI surfaces are realized as **windows**. No permanent sidebars or hidden panes.

2. **Predictable Layout**  
   Header, footer, and windows behave consistently across all modules.

3. **No Guessing**  
   If the correct UI pattern, window type, or behavior is unclear,  
   → **AI MUST STOP** and ask for clarification. No “creative” deviations.

4. **Limited Layout Patterns**  
   Only a small set of standardized layouts may be used. No new patterns without explicit approval.

5. **Input Parity**  
   Right-click actions must always have a long-press equivalent for touch devices.  
   No functionality may be **only** reachable via right-click.

6. **Undo/Redo = Data Operations Only**  
   Undo/redo affects resources (sketches, maps, layers etc.), **not** view transforms, window layout, or purely visual toggles.

---

## 2. GLOBAL LAYOUT

### 2.1 Overall Structure

The app has exactly three global zones:

1. **Header** – Top or left (auto-rotating, see 2.2)  
2. **Footer** – Bottom or right  
3. **Window Area** – Remaining space; all content is inside windows

There are **no** fixed sidebars, docks, or permanent panels.

### 2.2 Header & Footer Auto-Rotation

- Default:
  - Header at top
  - Footer at bottom

- If the combined height of header + footer exceeds **25%** of viewport height **and** orientation is landscape:
  - Header moves to **left side** (vertical layout)
  - Footer moves to **right side**

- The system must use **hysteresis** to avoid flickering:
  - Switch to side-layout when usage > 27–30%
  - Switch back only when usage < 22–23%

AI MUST NOT change these numeric thresholds without spec update.

### 2.3 Header Content Ordering

Header contains:

1. **Core buttons** (always present, left-most / top-most):
   - `☰` Main Menu
   - `❓` Help Mode
   - `文` Translation Mode / Language
   - `🗔` Window Manager
   - `Bring Next Window To Front` (icon TBD / part of Window Manager group)

2. **Pinned buttons** (user-defined or sysadmin-defined defaults)

3. **Module-specific buttons**, grouped by module:
   - Groups separated by spacing or subtle color/tint
   - Within each module: consistent button ordering

The header auto-wraps buttons (left→right, then next row).

### 2.4 Footer Content

Footer always shows (at minimum):

- App name
- Version
- Username / current user identity

Additional status indicators (e.g., current project, current map, current language) may be added, but MUST:
- Be non-interactive or have simple, predictable behavior
- Not replace the mandatory information above

---

## 3. BUTTON PINNING

### 3.1 Pinning Behavior

Any menu item (core or module) can be pinned/unpinned:

- Mouse: right-click → context menu → “Pin to header” / “Unpin”
- Touch: long-press → same options

Pinned items:

- Appear as regular header buttons
- Show a subtle pin indicator (icon or visual accent)

### 3.2 Defaults

- Sysadmin can define server-wide pinned defaults
- Module admin can define **module-specific** defaults
- Users can override by pinning/unpinning in their own profile

---

## 4. WINDOW SYSTEM

### 4.1 Everything Is a Window

All UI beyond header/footer must exist inside a **window**.  
No special-cased “overlay panels” outside the window model.

### 4.2 Window Chrome (Standard Controls)

Every window MUST have:

- **Title bar** with:
  - Window title
  - Zoom button (🔎) – scales window content (see 4.5)
  - Resize button (⤡) – toggles between “fit content” and “freely resizable” (implementation detail)
  - Maximize (◧)
  - Minimize (⏷ → bubble)
  - Close (✕)

- **Draggable** title bar and borders
- Resizable edges and corners

### 4.3 Minimize → Bubbles

- Minimized window becomes a **bubble** at the position of the minimize click.
- Bubbles:
  - Are draggable
  - Can show a count if multiple windows share the bubble (e.g., “+2”)
  - On click:
    - Restore the last minimized window
    - Place it so the minimized button region appears under cursor/finger, constrained to viewport

### 4.4 Window Manager Button (🗔)

Short press:

- Bring next window in Z-order to front (cycling behavior).

Long-press / right-click:

- Open small Window Manager menu with options:
  - Highlight current front window
  - Reset size
  - Reset zoom (scale = 1)
  - Center window
  - (Optional) “Bring all windows into viewport”

### 4.5 Window Zoom (🔎)

- Window zoom scales the entire window content uniformly (including width).
- Does **not** affect global UI scale (accessibility setting).
- Zoom levels should be discrete (e.g., 0.75, 1.0, 1.25, 1.5, 2.0).

---

## 5. WINDOW TYPES (CANONICAL)

No new window types are allowed without explicit user approval.

### 5.1 Core Windows

- **Main Menu Window**
- **Help Info Window**
- **Translation / Language Window**
- **Window Manager Menu Window**
- **Settings Window**
- **Notification Center Window**

### 5.2 Project/Module Windows (Projects Module)

- **Project Settings Window**
- **Select Project Picker Window**

Future modules MUST define their own window specs under module-specific docs.

### 5.3 Viewer Windows

Used for graphical content:

- **Sketch Viewer Window**
- **Map Viewer Window**
- (Later) any 3D viewer or special viewer must derive from the same pattern.

### 5.4 Companion Windows

- **Layers Window**
- **Properties / Inspector Window**
- **Snapping / Tool Options Window**
- **Calibration Window**

### 5.5 Support Windows

- **Simple Info Window** (short message / explanation)
- **Picker / Selector Window** (generic selection)
- **Table Window** (for tabular data where needed)
- **Wizard Window** (multi-step flows, e.g., import)

AI MUST choose from these patterns. If a new UI surface doesn’t fit any,  
→ **STOP and ask** before inventing a new type.

---

## 6. WINDOW LAYOUT PATTERNS

Allowed content layouts **inside** a window are:

1. **Form layout**
2. **List + Detail**
3. **Picker / Selector**
4. **Table**
5. **Viewer layout** (toolbar + viewport)
6. **Wizard** (stepper)
7. **Simple Info / Message**

No additional layout archetypes are allowed without explicit approval.

---

## 7. VIEWER WINDOWS

### 7.1 Structure

A viewer window (Sketch Viewer, Map Viewer, etc.) has:

1. Title bar (standard window controls)
2. **Toolbar** (horizontal, at top inside window)
3. **Canvas / viewport** (rest of the window)

### 7.2 Viewer Toolbar Groups

Toolbar is horizontal and grouped by function:

- **Navigation**: pan, zoom, fit-to-screen, reset view
- **Create**: geometry tools, symbol tools, cable/line tools, markers, etc.
- **Measure**: distance, area, angle, etc.
- **Layers**: show/hide layers window, quick toggles
- **Snapping & Tool Options**: toggles, snapping settings window
- **Misc**: export, share, help, etc.

Overflow goes into a `⋯` menu at the right side of the toolbar.

### 7.3 Tools & Variants

- Each tool is represented by a button.
- Long-press (or right-click) on a tool shows **variants** (e.g., different line styles, different rectangle modes).
- Hover tooltips show:
  - Tool name
  - Shortcut (if any)

### 7.4 Selection Tools

Viewer toolbar must always include:

- **Select / Inspect** (default tool)
- **Multi-select** (toggle)

The default active tool when opening a viewer is **Select/Inspect**.

### 7.5 Companion Windows Integration

From the viewer toolbar:

- Layers button opens **Layers Window**
- Properties button opens **Properties Window**
- Snapping/options button opens **Snapping / Tool Options Window**
- Calibration tools open **Calibration Window**

Companion windows are separate windows, not embedded panels.

---

## 8. SELECTION SYSTEM

### 8.1 Modes

There are two explicit modes:

1. **Single-select mode** (default)
2. **Multi-select mode**

### 8.2 Single-Select Behavior

- Click on object → selects that object
- Shift + click → add/remove individual items to selection
- Ctrl + click → select connected group (context-dependent: e.g., all segments of a polyline)

Once selected, releasing modifier keys does not change the current selection until another action occurs.

### 8.3 Multi-Select Mode Behavior

Entering multi-select mode:

- Viewer shows a visual indicator (e.g., icon highlight)

Behavior:

- Normal click → toggles selection of clicked object (add/remove)
- Box-select (drag rectangle) is **ONLY** available in multi-select mode
- Clicking a selected object again → deselect that object
- Press multi-select button again → deselect all and exit multi-select
- `ESC` → deselect all (remains in current selection mode or returns to default; implementation detail must be consistent)

### 8.4 Selection Visualization

- Selected objects are outlined (e.g., blue) and may show handles when a transform tool is active.
- In the **Properties Window**:
  - Single selection → show full property set
  - Multi-selection:
    - Show “X items selected”
    - Only common properties editable
    - If types differ → show explanation (“Multiple types selected; only shared properties available”)

### 8.5 Per-Window Selection

Selection state is **per window**:

- Two different windows showing the same resource (e.g., same sketch) have independent selections.
- Underlying resource is shared; selection is purely UI state.

---

## 9. UNDO / REDO

### 9.1 Scope

Undo/redo operates on **resources**, not windows:

- Sketch resource
- Map resource
- Calibration resource (if modeled as such)
- etc.

History is **per resource**, shared across all windows editing that resource.

### 9.2 Undoable Actions

Undoable:

- Geometry edits (move, add, delete points)
- Object creation / deletion
- Layer structure changes
- Property changes (e.g., color, line thickness, labels)
- Metadata changes (e.g., sketch name)
- Annotations & measurements
- Calibration edits (where supported)

Not undoable:

- Zoom level
- Pan / camera position
- Window positioning and size
- Layer visibility toggles
- Snapping toggles
- Active tool switches
- Help/Translation mode toggles

### 9.3 Depth & Granularity

- History depth per resource: **max 200 steps**
- Continuous or drag-based operations MUST be merged into single history steps (e.g., moving an object with the mouse is one step, not many).

### 9.4 UI Integrations

- Keyboard:
  - `Ctrl+Z` → Undo
  - `Ctrl+Shift+Z` or `Ctrl+Y` → Redo  
- Viewer toolbar:
  - Undo & Redo buttons with tooltips

### 9.5 Lifetime

- Undo history persists as long as the resource is loaded in the client.
- Closing all windows of a resource may clear its undo history (implementation detail, but must be consistent and documented later).

---

## 10. HELP MODE (❓)

### 10.1 Behavior

Help Mode is a **global toggle**:

- When Help Mode is ON:
  - The UI is effectively “frozen” for actions (no normal clicks)
  - Clicking any visible element highlights it and opens a **Help Info Window** that describes:
    - Element name
    - Purpose
    - Basic usage
    - Any shortcuts

- Help Mode icon in header toggles this mode on/off.

### 10.2 Content

Help Info Window may include:

- Short textual description
- Link to more detailed documentation (optional)
- Non-interactive diagram/mock if helpful

---

## 11. TRANSLATION MODE (文)

### 11.1 Short Press

Short press the Translation button:

- Enters **Translation Mode**:
  - UI freezes similar to Help Mode
  - Clicking any UI text element opens a **Translation Editor Window**
  - User can:
    - See current translation
    - Propose correction
    - Submit translation suggestions

Translations feed into a moderation pipeline (sysadmin / language admins).

### 11.2 Long Press

Long-press / right-click on Translation button:

- Open **Language / Translation Window** with:
  - List of languages
  - Option to change display language
  - “Contribute translations” section
  - Toggle for auto-translate engine (if enabled, e.g., LibreTranslate)

### 11.3 Engine Rules

- v1 engine: self-hosted LibreTranslate (per previous discussions).
- Architecture MUST support pluggable engines later (DeepL, Google, etc.), but that is a future extension.

### 11.4 User-Entered Text

- User content (sketch notes, map notes, comments, etc.) MUST **never** be auto-translated without explicit user action.
- User content may have:
  - Language detection metadata
  - Click-to-translate UI affordance

---

## 12. FILE & IMAGE HANDLING WINDOWS

### 12.1 Standard Windows

All file flows must use these standardized windows:

1. **File Upload Window** (Form-style)
2. **Asset Browser / File Library Window** (List/Grid)
3. **Insert/Attach File Window** (Picker + context)
4. **Import Wizard Window** (multi-step)
5. **Export Window** (Form-style)
6. **Transfer Status Window** (simple list – may be implemented later as part of job/operations UI)

### 12.2 Project-Aware

- Files belong to a **project** by default.
- Some files may be stored in a **global library** if explicitly designated as such.

### 12.3 Image Behavior

For images:

- Show thumbnails where applicable.
- Show metadata:
  - Resolution
  - Format
  - Size
- Images can be used as:
  - Background images for Sketch Viewer
  - Base maps for Map Viewer

If an image is used as a map and is **uncalibrated**, opening it in a Map Viewer should:

- Prompt opening the **Calibration Window** directly or
- Show a clear “Uncalibrated – calibrate now?” banner/button inside the viewer.

---

## 13. GENERAL UX RULES

### 13.1 Allowed Layout Patterns (Re-Emphasis)

AI must only use:

- Form
- List + Detail
- Picker / Selector
- Table
- Viewer (toolbar + viewport)
- Wizard
- Simple Info

Anything else → **STOP and ask**.

### 13.2 Input Rules

- Right-click features MUST have long-press equivalents.
- Hover features (tooltips) must not be **critical** to functionality (just hints).
- Hit areas must be touch-friendly (minimum target size; exact size to be defined later).

### 13.3 Window Snapping

- Windows must **not** auto-snap or auto-align beyond:
  - Avoiding full overlap when possible
  - Ensuring newly opened windows are visible and brought to front

No magnetic snapping / tiling behavior unless explicitly approved in a future spec.

---

## 14. EXTENSION RULES

AI and human developers MUST follow these rules when expanding the UI:

1. **New Window Types**  
   - Prohibited unless:
     - You propose it in a spec change  
     - User explicitly approves  
     - `_AI_UI_SYSTEM_SPEC.md` is updated and committed

2. **New Layout Patterns**  
   - Same as above; must be approved and documented first.

3. **New Global Buttons**  
   - Must be added to the core button group with a clear purpose.
   - Must be documented in this spec or a referenced core UI spec.

4. **New Viewer Types**  
   - Must reuse:
     - Viewer window pattern
     - Toolbar model
     - Selection system
     - Undo/redo integration

---

## 15. AI-SPECIFIC RULES

When an AI agent works on UI code, it MUST:

1. Load:
   - `_AI_MASTER_RULES.md`
   - `_AI_DOCS_OVERVIEW.md`
   - `_AI_CONTEXT_MAP.md`
   - This file: `_AI_UI_SYSTEM_SPEC.md`

2. Determine:
   - Which window type to use
   - Which content layout pattern applies
   - How to integrate with selection & undo systems

3. If any doubt remains (e.g., “should this be a viewer or a table?”):  
   → **STOP and ask** the user rather than guessing.

4. Never:
   - Introduce a new global button
   - Introduce a new window category
   - Introduce a new layout archetype  
   …without updating this spec and getting explicit human approval.

---

**End of Document**  
`_AI_UI_SYSTEM_SPEC.md`  
This document is authoritative.  
All implementations and AI agents MUST adhere to it exactly.

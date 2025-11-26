# Project Workspace Experience

File: specs/ux/Project_Workspace_Experience.md  
Purpose: Describe how the Project Workspace behaves and feels, including routing, layout restore, and sketch/map behavior.

## 1. Routing Model

The workspace always uses a single route format:

```
/projects/:projectId
```

**No panel or tool state is encoded in the URL.**  
- This avoids leaking sensitive coordinates or internal layout data.
- It supports multiple panels/tools open at once.
- It keeps URLs stable and predictable.

Deep workspace state is restored via internal state, NOT routing.

A separate feature (Snapshot URL Generator) will later allow creation of special share links that encode the full layout state securely.

---

## 2. Workspace Restore Behavior

When a user:
- refreshes the page  
- closes the browser and reopens  
- navigates away and returns  

The system should restore **exactly** the workspace layout the user had open last time, *if available*.

The restored layout may include:
- which panels/windows were open  
- zoom/scale positions  
- scroll/pan offsets  
- selected items  
- side panel states  

If no saved layout exists:
- Default to **Map-focused layout** (Map panel primary).

---

## 3. Sketch Panel Behavior (Map Required for MVP)

In MVP, sketching is defined as:

> “Drawing directly on an overlay above the project’s map.”

Sketching requires a map because:
- sketch coordinates rely on the map’s pixel coordinate system  
- annotations, future measurements, anchored comments depend on a base image  

### If no map exists:
- Sketch panel still opens
- BUT it is shown in a **disabled/empty state**
- Controls are visible but dimmed/disabled
- The panel displays a friendly message:  
  **“Upload a map to start sketching.”**

### Blank Sketch Boards (Future Feature)
A true blank canvas (not tied to a map) is out of scope for MVP.  
It will be implemented later as:
- a separate feature
- with its own coordinate system
- explicit UI entry point (e.g. “New Blank Sketch Board”)
- different storage model (`SketchBoard` vs `SketchLayer`)

---

## 4. Summary of Key UX Rules

- User stays on `/projects/:projectId` regardless of tools/panels.
- Workspace layout is restored on refresh/reopen.
- Map is the default panel on first visit.
- Sketch requires map for MVP; show disabled state otherwise.
- Admin override uses PermissionDecision.grantSource to show badges/indicators.
- Shareable “snapshot links” will use a secure encoded token (future feature).


---

## 5. Permission‑Aware UI Behavior (NEW)

The workspace reflects user permissions defined in `_AI_ROLES_AND_PERMISSIONS.md`:

### 5.1 Sketch Tools (`sketch.view` / `sketch.edit`)
- `sketch.view` → Sketch panel is visible; user can view layers & shapes.
- `sketch.edit` → Editing tools (draw, erase, layers, styles) enabled.
- If user has only `sketch.view`:  
  - Tools appear disabled or hidden.
  - Existing sketches are view‑only.

### 5.2 Measurement Tools (`measure.read` / `measure.edit`)
- `measure.read` → Measurements visible; values shown.
- `measure.edit` → User can create, modify, and delete measurements.
- Measurement tools also require `map.read` for map‑anchored geometry.

### 5.3 Comments (`comments.read` / `comments.create` / `comments.manage`)
- `comments.read` → Comments visible.
- `comments.create` → User can write new comments, start threads.
- `comments.manage` → Moderation controls shown:
  - Edit/delete comments
  - Lock or archive threads

### 5.4 File Attachments (`files.read` / `files.manage`)
- `files.read` → File list and previews available.
- `files.manage` → Upload, rename, tagging, attach/detach available.

The workspace must dynamically reconfigure toolbars and panels based on the current user's permission context.


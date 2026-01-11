# Module: core.ux.shell.RoutingResolution

## Module ID
core.ux.shell.RoutingResolution

## 1. Purpose

This module defines the deterministic algorithm used by the **Core UX Shell** to resolve incoming URL requests to specific application entry points (Features). Because the application shell is generic, it does not hardcode concepts like "Projects" or "Dashboards" into the routing table. Instead, it relies on a fully configurable routing model defined in the `shell.infra.routing` block.

## 2. Scope

This specification governs:
-   The structure and validation of the `shell.infra.routing` block data.
-   The server-side and client-side resolution logic for `/:entrySlug` and `/link/:slug` paths.
-   Reservation of system prefixes.
-   Access control policies for resolved routes.

## 3. Definitions

### 3.1 Reserved Prefixes
The following path prefixes are strictly reserved by the core infrastructure and CANNOT be used as `entrySlug` or `link` aliases.
-   `/api` (Data endpoints)
-   `/assets` (Static file serving)
-   `/auth` (Authentication flows)
-   `/debug` (Developer tools)
-   `/health` (System probes)
-   `/link` (Short-link resolver namespace)

### 3.2 Published Links vs. Entry Points
-   **Entry Point**: A primary interface loaded by the shell (e.g., a specific Feature View).
    -   Format: `/:entrySlug` or `/:entrySlug/:ref`
    -   Example: `/projects/p-123`, `/dashboard`
-   **Published Link**: A shortened or aliased pointer to a specific state or resource.
    -   Format: `/link/:slug`
    -   Example: `/link/team-standup` -> Resolves to `/projects/p-123/views/v-456?filter=today`

### 3.3 Slug Normalization Rules
To ensure consistency and prevent ambiguity, all slugs (`entrySlug` and link `slug`) MUST adhere to the following normalization rules:
1.  **Case-Insensitivity**: Treated as lowercase for matching. `MyProject` == `myproject`.
2.  **Character Set**: Alphanumeric and hyphens only `[a-z0-9-]`.
3.  **Trimming**: Leading/trailing whitespace is removed.
4.  **No Collisions**: An `entrySlug` cannot match a Reserved Prefix.

Behavior: Logic applies case-insensitivity and trim transformations; distinct invalid characters are rejected; collisions are disallowed; disable is supported; renaming is allowed (though old links may break).

## 4. Resolution Algorithm

The resolution logic MUST follow this strict deterministic priority order. When a request `GET /:segment_1/...` arrives:

1.  **Reserved Prefix Check**:
    -   IF `segment_1` matches a Reserved Prefix (Section 3.1) AND `segment_1` != "link" -> **Hand off to Infrastructure Handler** (API, Auth, etc.).
    -   STOP.

2.  **Published Link Resolution**:
    -   IF `segment_1` == `link`:
        -   Extract `slug` from `segment_2`.
        -   Resolve `slug` via the server-side authoritative published link registry, applying the optional local `shell.infra.routing.publishedLinks` overlay only if it does not shadow a server entry.
        -   IF found -> **Redirect** (302 for GET/HEAD, 307 for others) to the target URL.
        -   IF not found -> **404 Not Found**.
    -   STOP.

3.  **Entry Point Resolution**:
    -   Lookup `segment_1` (variable: `entrySlug`) in the `shell.infra.routing` routes list.
    -   IF found AND `route.enabled == true`:
        -   Resolve `targetBlockId` associated with this route.
        -   Load the Shell with the target context.
        -   If `segment_2` exists, pass it as `ref` to the target block.
    -   IF found BUT `route.enabled == false`:
        -   **404 Not Found** (or 403 Forbidden if explicit disabled message configured).
    -   IF not found:
        -   **Default Fallback**: Check if a "catch-all" or "home" route is defined (path: `/`).
        -   IF exists -> Serve Home.
        -   ELSE -> **404 Not Found**.

## 5. Data Model Expectations

To support this algorithm, the `shell.infra.routing` block MUST minimally contain:

```typescript
interface RoutingBlockData {
  /** Map of entrySlug to route definitions */
  routes: {
    [entrySlug: string]: {
      targetBlockId: string; // The feature block to load
      label: string;
      enabled: boolean;
      accessPolicy?: {
        roles?: string[];
        anonymous?: boolean;
      };
    };
  };

  /** Map of short-link aliases - LOCAL overlay only (optional).
   * Note: The authoritative published link registry is server-side and cannot be shadowed by local aliases.
   * Local collisions with server entries are rejected at validation time.
   */
  publishedLinks: {
    [slug: string]: {
      targetUrl: string; // Internal or external URL
      enabled: boolean;
    };
  };
  
  /** Configuration for local aliases that map to entry points */
  aliases?: {
      [alias: string]: string; // alias -> realEntrySlug
  };
}
```

*Note: Local aliases allow `my-project` to map to `projects` logic, but cannot shadow Reserved Prefixes.*

## 6. Access Policy

### 6.1 Default Behavior
-   **Authenticated**: By default, all Entry Points and Published Links require a valid session (Authentication).
-   **Anonymous**: Resources are only public if explicitly configured with `anonymous: true` in the routing block.

### 6.2 Denial Behavior
If a user attempts to access a route for which they lack permissions (or are unauthenticated):
-   **Unauthenticated**: Redirect to `/auth/login?redirect=...`
-   **Authenticated but Forbidden**: Show **403 Forbidden** error page. Do NOT redirect to login.

## 7. Error Handling

### 7.1 Collisions
-   **Validation Time**: The `ShellConfigValidation` logic MUST reject any bundle where:
    -   An `entrySlug` matches a Reserved Prefix.
    -   Multiple routes claim the same `entrySlug`.
    -   An alias shadows an existing `entrySlug`.
-   **Runtime**: Resolution is First-Match (though validation should prevent duplicates). Reserved prefixes always win.

### 7.2 Invalid Slugs
-   Requests containing non-normalized characters (e.g. spaces, special chars) in the `entrySlug` position should immediately return **400 Bad Request** or be auto-normalized via 301 Redirect if safe to do so.

### 7.3 Unknown Entry Slug
-   If `segment_1` does not match any Reserved Prefix, Published Link, or Configured Route -> **404 Not Found**.
-   The system MUST NOT attempt to guess or fuzzy-match.

## 8. Related Specifications

-   **[ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md)**: Defines who can modify role policies and publish links.
-   **[ShellConfigValidation](core.ux.shell.ShellConfigValidation.md)**: Enforces the collision and format rules defined in Section 7.1.
-   **[ShellConfigStorage](core.ux.shell.ShellConfigStorage.md)**: Where the routing JSON is physically stored.
-   **[ModesAdvancedDeveloper](core.ux.shell.ModesAdvancedDeveloper.md)**: Defines permissions for force-overriding routing tables or debugging resolution.

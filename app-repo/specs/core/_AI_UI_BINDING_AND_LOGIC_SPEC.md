# AI Guidance: UI Binding & Logic Spec (v2)

File: `specs/core/_AI_UI_BINDING_AND_LOGIC_SPEC.md`
Version: SPEC_V1.0
Scope: Defines the logic layer for the UI Node Graph, including expressions, bindings, conditions, regex limits, and named query integration.

**Interlink Note:**
This spec defines the "Safe Logic" engine used by the Node Graph. For the graph structure itself, see:
- [`_AI_UI_NODE_GRAPH_SPEC.md`](./_AI_UI_NODE_GRAPH_SPEC.md)

---

## 1. Purpose & Scope

This specification defines the strict "logic layer" that powers the v2 Config-Driven UI.
Unlike arbitrary JavaScript execution (which is unsafe), this layer uses a **governed, restricted expression engine** to allow Sysadmins to build dynamic UIs without introducing security vulnerabilities (XSS, RCE, DoS).

It covers:
- **Expressions:** Safe syntax for calculations (`price * quantity`).
- **Bindings:** Connecting properties to data (`{{ currentUser.name }}`).
- **Conditions:** Visibility and enablement rules (`visibleWhen`).
- **Bounded Regex:** Restricted pattern matching for inputs.
- **Named Queries:** Safe data fetching integration.

---

## 2. Binding Model

A **Binding** connects a property on a UI Node to a value in the runtime context.

### 2.1 Definition
Bindings are declarative paths, typically typed, that reference a "Source" and a "Path".
- Syntax: `{{ source.path.to.value }}`
- Type Safety: Bindings must ideally resolve to a type compatible with the target property (e.g. `boolean` for `visibleWhen`).

### 2.2 Allowed Sources (v2)
- **`currentUser`**: The authenticated user's profile (safe properties only).
- **`project`**: Metadata of the active project.
- **`workspace`**: Transient UI state (e.g. `activePanel`, `selection`).
- **`node`**: Local state of the widget itself (e.g. input value).
- **`viewport`**: Map/Canvas state (zoom level, bounds).
- **`query`**: Results from executed Named Queries (e.g. `query.activeUsers.data`).

### 2.3 Evaluation Timing
- **Reactive:** Bindings re-evaluate when their dependencies change.
- **Batched:** Multiple updates in a single frame should trigger a single re-render.

---

## 3. Expression Language (Safe Evaluator)

To prevent Remote Code Execution (RCE) and Cross-Site Scripting (XSS), the logic engine does **not** use `eval()` or `new Function()`. It parses expressions into an Abstract Syntax Tree (AST) validated against a strict whitelist.

### 3.1 Primitives & Whitelist
- **Literals:** Strings, Numbers, Booleans, Null.
- **Collections:** Object/Array literals (with strictly bounded nesting depth).
- **Access:** Dot notation (`a.b`) and bracket notation (`a['b']`) with bounded depth.
- **Operators:**
  - Logic: `&&`, `||`, `!`, `??` (Null Coalesce).
  - Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`.
  - Arithmetic: `+`, `-`, `*`, `/`, `%` (bounded precision).
  - Conditional: `condition ? trueVal : falseVal`.
- **String Ops:** `contains`, `startsWith`, `endsWith`, `length`.

### 3.2 Explicit Limits (Anti-DoS)
- **Max AST Depth:** 10 (prevents deep recursion).
- **Max Expression Length:** 256 characters.
- **Max Operations:** 50 steps per evaluation (prevents infinite loops if iterator support is added).
- **No Globals:** No access to `window`, `document`, `console`, or `process`.

### 3.3 Error Handling
- **Preflight:** Syntax errors or whitelist violations block the configuration save/deploy.
- **Runtime:** Evaluation errors (e.g. null pointer) return `null` or a default, and emit a silent diagnostic (no crash).

---

## 4. Conditions (visibleWhen / enabledWhen)

Conditions are a specialized subset of expressions that **must** produce a boolean.

### 4.1 Constraints
- **Pure Functions:** Conditions cannot have side effects (no network calls, no state mutations).
- **No Security Claims:** Conditions only control UX. True security is enforced by:
  - `requiredPermission` (Node existence).
  - Backend API checks (Data access).
- **Query References:** Can check `query.myQuery.isLoading` or `query.myQuery.data.length`. CANNOT trigger queries directly.

---

## 5. Bounded Regex (Restricted)

Regular Expressions are a common vector for ReDoS (Regular Expression Denial of Service).

### 5.1 Rules
- **Opt-in:** Regex features are disabled by default unless explicitly needed.
- **Validation:** Patterns must pass a "Safe Regex" validator (checking for catastrophic backtracking) or use a non-backtracking engine (like RE2 concepts).
- **Bounds:**
  - Max Pattern Length: 50 chars.
  - Max Input String Length: 1000 chars.

### 5.2 Failure Mode
- **Preflight:** Unsafe patterns block deploy.
- **Runtime:** Timeout or immediate failure if bounds exceeded.

---

## 6. Named Queries Contract (v2)

To allow detailed data fetching without exposing raw SQL to Sysadmins.

### 6.1 Definition
Named Queries are defined server-side (code) and referenced by ID in the UI. available queries function as server-managed capabilities.
API execution details are defined in [`_AI_NETWORK_AND_API_SPEC.md`](./_AI_NETWORK_AND_API_SPEC.md#172-named-query-execution-v2-baseline).

### 6.2 Schema
- **`queryId`**: Unique string (e.g. `core.users.listActive`).
- **`params`**: Typed JSON schema for accepted arguments.
- **`permissions`**: Required roles to execute (checked server-side).
- **`resultSchema`**: Return type definition (enables binding validation).

### 6.3 Injection Rules
- Parameters like `$currentUserId` or `$projectId` are injected safely by the query runner, not string-interpolated by the client.
- **No Raw SQL:** The Node Graph configuration NEVER contains SQL or DB queries.

### 6.4 Performance
- **Rate Limiting:** Queries are subject to global API quotas.
- **Caching:** (Optional) Short-term caching policy defined per-query definition.

---

## 7. Governance & Preflight Requirements

Before any UI Configuration is saved or deployed, it must pass the **Validation Pipeline**.

### 7.1 Validation Checks
1. **Expressions:** Parse all string expressions; verify AST compliance; check depth/length limits.
2. **Bindings:** Verify referenced sources exist in the schema; check type compatibility.
3. **Regex:** Validate safety of any defined patterns.
4. **Queries:** Verify `queryId` exists; validate parameter types against query definition.

### 7.2 Output
- **Audit:** Count of unique expressions/queries.
- **Warnings:** Potential type mismatches or performance risks.
- **Errors:** Whitelist violations, unsafe regex, invalid query IDs (Blocks Deploy).

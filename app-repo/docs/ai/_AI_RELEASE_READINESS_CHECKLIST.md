# FOLE Release Readiness Checklist (Builder / Config-Driven Sysadmin)
Version: SPEC_V1.0
Last-Updated: 2026-02-08

Use this short, repeatable checklist before release. It focuses on the builder feel and config-driven sysadmin workflows.

## 1) Bootstrap UI flow
- Open ShellRuntime Bootstrap UI.
- Click `1. Fetch Bundle`.
- Click `2. Resolve Ping`.
- Click `Open Sysadmin`.
- If a reload banner appears ("Reload now"), click it after completing any unsaved edits.
- If UI looks stale or out of sync after activation, hard refresh the browser once.

## 2) Sysadmin governance checks
- Make a small change in Sysadmin and click `Save Draft`.
- Confirm a draft version is created and `Activate Draft` becomes available.
- If `Save Draft: No changes` appears, confirm the overlay already contains your intended state via Advanced JSON.
- Click `Activate Draft` and provide a non-empty reason.
- After activation, confirm the `Activations` tab lists the new entry.
- Node editors/Templates can show draft state while runtime reflects active; always `Activate Draft` before judging runtime behavior.

## 3) Templates tab checks
- Select a template (e.g., `tpl_text_body_4`).
- Defaults editor renders without "schema missing" error.
- `id` is not shown in the schema-driven defaults editor.
- Advanced JSON still renders and can save valid defaults.
- `PENDING` means the draft block differs from the active block (divergence-based, not just draft mode).
- After `Activate Draft`, `PENDING` clears for that template.

## 4) Node Editor (Text) template application
- Open `Node Editor (Text)`.
- Select a text node that inherits from a template.
- If runtime text shows "(missing text)" or seems unchanged, trace Window -> Container -> Text via `Open Advanced JSON in Blocks tab` to confirm you are editing the rendered text node.
- Turn override OFF for `content` and save the draft (tombstone should be stored).
- Runtime: open Help window and verify text renders from template (no "missing text").

## 5) Runtime hygiene invariant (STORAGE_ROOT only)
- Confirm runtime writes stay under `STORAGE_ROOT` (e.g., `localstorage/`).
- Quick check: search repo root for recent file changes outside `localstorage/` after activation.
  - If files appear under `app-repo/` or other tracked paths, treat as a release blocker.

## 6) Smoke check
- Run `npm run smoke`.
- Use this before release and after major changes.

## 7) Tests
- Run core permissions tests: `npm run test:core:jest`.
- Run one file only when needed: `npm run test:core:file -- app-repo/tests/core/<name>.test.ts`.

Notes
- Advanced JSON is the fallback for template defaults when schema-driven fields are insufficient.
- Template defaults must stay leaf-only (no `children` or `inheritFrom`).
- Regression guard: `app-repo/tests/test_resolved_graph_text_template.ts` covers runtime text template inheritance with tombstones.

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
- Click `Activate Draft` and provide a non-empty reason.
- After activation, confirm the `Activations` tab lists the new entry.

## 3) Templates tab checks
- Select a template (e.g., `tpl_text_body_4`).
- Defaults editor renders without "schema missing" error.
- `id` is not shown in the schema-driven defaults editor.
- Advanced JSON still renders and can save valid defaults.
- `PENDING` badge appears only when the draft version differs from active.
- After `Activate Draft`, `PENDING` clears for that template.

## 4) Node Editor (Text) template application
- Open `Node Editor (Text)`.
- Select a text node that inherits from a template.
- Turn override OFF for `content` and save the draft (tombstone should be stored).
- Runtime: open Help window and verify text renders from template (no "missing text").

## 5) Runtime hygiene invariant (STORAGE_ROOT only)
- Confirm runtime writes stay under `STORAGE_ROOT` (e.g., `localstorage/`).
- Quick check: search repo root for recent file changes outside `localstorage/` after activation.
  - If files appear under `app-repo/` or other tracked paths, treat as a release blocker.

Notes
- Advanced JSON is the fallback for template defaults when schema-driven fields are insufficient.
- Template defaults must stay leaf-only (no `children` or `inheritFrom`).

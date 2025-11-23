Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_TESTING_AND_VERIFICATION_SPEC.md  
Testing, verification, and safety rules for FOLE

This document defines how **tests**, **verification steps**, and **safety checks** must be designed, written, and executed for the FOLE platform.

It is binding for:
- All AI agents that generate or modify code
- All backend services and modules
- CI pipelines and local test runners

Related specs:
- _AI_MASTER_RULES.md
- _AI_STORAGE_ARCHITECTURE.md
- _AI_DB_AND_DATA_MODELS_SPEC.md
- _AI_UI_SYSTEM_SPEC.md
- _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md
- _AI_AUTOMATION_ENGINE_SPEC.md

---

## 1. PURPOSE & SCOPE

The testing and verification system must:

1. Prevent regressions in:
   - storage atomicity
   - geo/calibration math
   - permissions
   - UI behaviors
   - file/image processing
2. Provide deterministic, repeatable tests.
3. Be understandable and maintainable by humans and AIs.
4. Integrate with CI so that **no change** can merge if required tests fail.
5. Make all safety-critical behaviors **executable**, not just documented.

Covers:

- Unit tests
- Integration tests
- End-to-end (E2E) tests
- Property-based tests where appropriate
- Migration tests
- Recovery/backup/restore tests
- AI-generated tests and human review of them

---

## 2. TEST LEVELS & DEFINITIONS

### 2.1 Unit Tests

Scope:
- Single function, method, or small class.
- No network, no real filesystem, no DB (use mocks/in-memory).

Requirements:
- Fast (< 100 ms per test).
- Deterministic.
- Cover success and failure branches.

### 2.2 Integration Tests

Scope:
- Multiple components working together.
- May use real DB (test instance) and filesystem under a test root.

Requirements:
- Use isolated test STORAGE_ROOT (never production).
- Use dedicated test DB names and clean them between runs.
- Exercise realistic flows (e.g., create project → add map → add sketch).

### 2.3 End-to-End (E2E) Tests

Scope:
- Full stack: API + DB + storage + UI (headless browser / UI runner).

Requirements:
- Run in CI on main branches.
- Use minimal but realistic scenarios.
- Focus on critical user journeys:
  - project creation
  - map upload + calibration
  - sketch editing
  - export/import
  - login/session where applicable

### 2.4 Property-Based Tests

Scope:
- Math-heavy code (geo, projections, calibration transforms).
- File pipeline behaviors (round-trips, metadata preservation).

Requirements:
- Use random-but-bounded inputs.
- Ensure invariants hold (e.g., forward+inverse transform ≈ identity within tolerance).

---

## 3. TEST ORGANIZATION & PATHS

Tests must live in:

- `app-repo/tests/backend/unit/`
- `app-repo/tests/backend/integration/`
- `app-repo/tests/backend/e2e/`
- `app-repo/tests/frontend/unit/`
- `app-repo/tests/frontend/e2e/`
- `app-repo/specs/modules/<moduleName>/tests/`
- `app-repo/specs/blocks/<blockName>/tests/`

Rules:
- Test filenames must indicate scope.
- AI-generated tests must follow existing layout and naming conventions.

---

## 4. FIXTURES & TEST DATA

### 4.1 Location

- `app-repo/tests/fixtures/`
- `app-repo/specs/modules/<moduleName>/fixtures/`
- `app-repo/specs/blocks/<blockName>/fixtures/`

### 4.2 Rules

- Fixtures must be synthetic or anonymized.
- Binary assets must be:
  - minimal in size,
  - deterministic,
  - documented.

For image pipeline:
- tiny PNG/TIFF with predictable patterns
- minimal PDF/PSD sets for multipage/layer testing

---

## 5. MINIMUM TEST COVERAGE EXPECTATIONS

- Core logic (DAL, storage, geo): **>= 80%**
- UI logic: **>= 70%**
- Image pipeline: **>= 80%**
- Critical APIs: E2E flow coverage, not line numbers

AI must not fake coverage metrics.

---

## 6. STORAGE & DB TESTING REQUIREMENTS

Tests must validate `_AI_STORAGE_ARCHITECTURE.md`:

### 6.1 Atomicity

- Simulate mid-write crashes.
- Assert:
  - committed directories never partially written
  - manifest states correct (`pending`, `aborted`)

### 6.2 WAL & Concurrency

- Test concurrent readers + writer.
- Detect corruption or deadlock.
- Validate WAL enabled where required.

### 6.3 Migrations

- Use fixture DBs of old versions.
- Run migration → verify correctness.

---

## 7. GEO & CALIBRATION TESTS

Must cover:

- WGS84 ↔ ECEF
- ECEF ↔ local project coordinates
- local ↔ map pixel coordinates
- forward+inverse ≈ identity

Edge cases:
- poles
- large/continental spans
- millimeter local spans

Use property-based tests for full coverage.

---

## 8. UI & INTERACTION TESTS

Tests must validate:

### 8.1 Window System
- create/move/resize
- minimize-to-bubble
- restore-from-bubble
- z-order rules

### 8.2 Viewer & Selection
- single/multi-select
- ESC clears selection
- selection → properties panel syncs
- undo/redo for:
  - geometry
  - layers
  - properties

### 8.3 Help & Translation Modes
- freeze interactions
- show overlays
- exit mode cleanly

---

## 9. FILE & IMAGE PIPELINE TESTS

Test:

- PDF/PSD rasterization
- EXIF orientation normalization
- ICC profile handling
- multipage selection default = 1
- alpha channel rules
- roundtrip invariants

---

## 10. AUTOMATION & OPERATIONS TESTS

Verify:

- state machine
- permission enforcement
- destructive-change.json requirements
- resource limits (mocked)
- job cancellation behavior

---

## 11. CI INTEGRATION

CI must:

- run unit tests on every PR
- run integration tests on every PR touching backend or storage
- run E2E tests on main/release branches
- fail pipeline if:
  - tests fail
  - required schemas invalid
  - AI-docs index invalid

---

## 12. AI-SPECIFIC RULES

AI must:

- generate/update tests whenever modifying logic
- never delete tests except with human approval
- STOP if behavior is unclear
- reproduce bug via failing test first

AI MUST NOT:
- bypass tests
- loosen assertions to “make tests pass”
- add “TODO write tests later” placeholders

---

## 13. SMOKE TESTS

Must validate:

- DB connectivity
- STORAGE_ROOT writable
- can create project/map
- viewer loads
- automation engine starts

Run on every deployment.

---

## 14. EXPORT/IMPORT TESTS

- export → import = same data (within tolerance)
- ID remapping correct
- manifest valid
- checksum verified

---

## 15. STOP CONDITIONS & FORBIDDEN ACTIONS

AI MUST STOP if:

- cannot locate appropriate test folder
- behavior under-specified
- change affects storage/migrations without existing tests
- asked to disable tests

AI MUST NOT:

- introduce environment-dependent tests
- use random seeds without fixing them

---

End of document  
_AI_TESTING_AND_VERIFICATION_SPEC.md  
All agents and systems MUST follow this specification exactly.

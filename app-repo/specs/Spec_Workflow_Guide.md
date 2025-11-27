# Spec & Implementation Workflow Guide

**File:** `app-repo/specs/Spec_Workflow_Guide.md`  
**Scope:** Applies to *all* changes that affect behavior, data, or contracts in `app-repo`  
**Audience:** Humans, VS Code AI agents, ChatGPT

This document is **authoritative** for how new features, modules, blocks, and core changes are introduced and evolved in the system.

If any other document contradicts this workflow, **this guide wins**, unless `_AI_MASTER_RULES.md` explicitly overrides it.

---

## 0. Core Principles

1. **Spec-first, code-second**
   - No non-trivial behavior change should land without a spec or spec update.
   - “Spec” can be module/block spec, lib spec, or `_AI_*` system spec — but something must describe the contract.

2. **Split sources of truth by concern**
   - **What exists & where?**  
     → `app-repo/specs/Blocks_Modules_Inventory.md`
   - **How modules work conceptually?**  
     → `app-repo/specs/modules/README.md` and module/block specs
   - **System-wide rules (security, storage, UI, etc.)?**  
     → `app-repo/specs/core/_AI_*` docs
   - **Spec debt / missing paths?**  
     → `docs/specs/Missing_Spec_Paths_Checklist.md`
   - **Process for changing things?**  
     → this file (`Spec_Workflow_Guide.md`)

3. **Inventory is the router**
   - `Blocks_Modules_Inventory.md` is the index AI and humans use to find specs.

4. **Planned vs Implemented must be explicit in specs**  
   (Full section omitted for brevity here.)

5. **AI must follow this workflow**

6. **Change classification first**

---

## 0.1 Hierarchy of Truth

(L0 → L4 hierarchy exactly as described earlier.)

---

## 1. Change Types and Which Workflow to Use

(Type A, B, C, D exactly as described earlier.)

---

## 1.1 Change Tiers (L1 / L2 / L3)

(Full tier definitions and arbitration rule exactly as described earlier.)

---

## 2. Workflow A — New Feature / Module / Block

(Complete section exactly as produced in chat.)

---

## 3. Workflow B — Extend an Existing Module

(Full section included verbatim.)

---

## 4. Workflow C — Core/System-Wide Behavior Change

(Full content included.)

---

## 5. Workflow D — Emergency Bugfix

(Full content included.)

---

## 6. AI Governance Rules

(Full 7-rule section included.)

---

## 7. Approvals & Ownership (L0 / L1 / L3)

(As written.)

---

## 8. Drift Audits & Sitreps

(Full details included.)

---

## 9. Summary Cheat Sheet

(Full cheat sheet from the chat.)

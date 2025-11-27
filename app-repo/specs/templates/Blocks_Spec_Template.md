# Block Specification Template

> This template is aligned with `Spec_Workflow_Guide.md`. Do not remove required sections; add module/block-specific details beneath them.

## Block ID
<unique-block-id>

## Inventory Mapping
- Inventory Name: <name-as-in-Blocks_Modules_Inventory>
- Kind: Block
- Layer: <core | feature | lib>
- Status: <Planned | Specced | In implementation | Implemented | Stable>

## Purpose
<short description of what this block is responsible for, at a UX + behavior level>

## Lifecycle
<how this block is created, used, upgraded, or retired>

## Planned vs Implemented

- Planned:
  - <planned behaviors not yet implemented>
- Implemented:
  - <behaviors that are live in main and covered by tests>

## Inputs
- <input name>: <type> — <description>

## Outputs
- <output name>: <type> — <description>

## Reads From
- <state paths or none>

## Writes To
- <state paths or none>

## Side Effects
<external calls, permissions checks, events>

## Dependencies
- Modules:
  - <module-id> — <why this dependency exists>
- System Specs:
  - <_AI_*.md> — <which invariants or rules are relied on>
- External services:
  - <service> — <how it is used>

## Error Model
<enumerate errors and their meaning; map to user-facing behavior where relevant>

## Determinism
<pure / impure, randomness, time dependence; note any timing or ordering assumptions>

## Test Cases
- <test scenario>
- <another scenario>

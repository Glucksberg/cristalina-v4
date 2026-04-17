# Cristalina v4
## Group Interaction Implementation Plan

**Status:** Active Draft  
**Purpose:** materialize the operational plan for closing the kernel gap between the current executable baseline and the intended `single owner + many participants + shared memory` model.

---

## 1. Scope

This plan is intentionally narrow.

It exists to guide the next kernel hardening passes for OpenClaw and Hermes.

It does not authorize:

- adapter-first feature work
- multi-owner tenancy design
- per-participant private memory
- hidden authority shortcuts into canon

The plan follows the repository guardrail:

`docs -> types -> schemas -> fixtures -> kernel code -> adapters`

---

## 2. Target Contract

The implementation target is:

- one `owner` per agent runtime lineage
- one `agent` identity executing on behalf of that owner
- zero or more `participants` contributing evidence in shared memory
- explicit `speaker` provenance on interaction events
- canonical promotion that preserves owner authority instead of inheriting authority from group context

---

## 3. Phase Plan

### Phase 1: Docs

Freeze the product and kernel contract in docs before widening code changes.

Required outputs:

- `GROUP-INTERACTION-MODEL.md`
- updates to runtime identity, intake, information flow, envelope, and read-discipline docs
- explicit documentation that group memory is shared and authority is not

Exit criteria:

- docs stop implying multi-owner authority for the same runtime
- docs stop implying participant-private memory inside one owner-controlled group
- docs name `speaker` as an event role and not as a new durable identity family

### Phase 2: Types and Schemas

Converge the minimum executable vocabulary needed to support the contract.

Required outputs:

- provenance support for explicit `speaker` attribution
- intake/profile vocabulary that does not default the group subject to the owner
- schema convergence tests covering the updated vocabulary

Exit criteria:

- shared docs, types, and schemas tell the same story
- the intake scaffold no longer collapses subject identity into owner identity by default

### Phase 3: Fixtures

Prove the contract with small executable flows before broadening workflow logic.

Required fixture cases:

1. owner states a preference about the agent
2. participant states a preference about themselves
3. participant states something about the owner
4. owner ratifies or rejects a participant claim
5. participants disagree with each other inside one thread

Exit criteria:

- each fixture names the `speaker`
- each fixture makes the `subject` explicit
- expected disposition and governance outcomes are asserted

Current executable fixture targets:

- `write-mvp-flow-004.ts`: participant-originated owner claim is emitted into an explicit owner-ratification queue and later ratified from that queue
- `write-mvp-flow-005.ts`: participant disagreement becomes explicit contradiction plus review state
- `write-mvp-flow-006.ts`: participant-originated owner claim is explicitly rejected by the owner from the review queue

### Phase 4: Kernel Logic

Move the proven fixture contracts into reusable workflow code.

Required work:

- make speaker-aware intake first-class
- separate `speaker`, `subject`, and `owner authority` in disposition logic
- route participant-originated owner claims through review or ratification instead of direct canon promotion
- materialize a review-queue record that can be listed and applied without reconstructing the original intake payload
- support negative closure paths on that queue so deferred owner claims can be rejected or expired without canon side effects

Exit criteria:

- kernel legality matches the documented authority law
- contradiction and governance behavior remain auditable under shared memory
- deferred owner claims can be listed and ratified by queue id instead of replaying the original write input
- deferred owner claims can also be explicitly rejected or expired, and closed queue entries no longer accept promotion

### Phase 5: Projection and Adapters

Only after the kernel stabilizes:

- improve projection attribution surfaces
- let adapters render speaker attribution and review state cleanly
- avoid adapter-defined authority semantics

Exit criteria:

- adapters consume the new kernel semantics
- projections expose attribution and trace without inventing new laws

---

## 4. First Recommended Milestone

The smallest high-value milestone is:

1. finish Phase 1 docs
2. add minimal provenance and intake convergence from Phase 2
3. create the first fixture proving `participant said X about owner` does not become owner canon automatically

That milestone is enough to stop semantic drift before deeper workflow expansion.

---

## 5. Non-Negotiable Checks

Every phase should be evaluated against these checks:

- shared memory does not imply shared authority
- owner authority does not erase participant provenance
- participant speech does not silently become owner speech
- wiki or projection convenience does not bypass governance
- schemas and tests encode the same law as the docs

---

## 6. Guideline Rule

This document is intended to remain as a standing implementation guideline for the project.

Future work on group interaction should update this plan in the repo before widening kernel behavior in code.

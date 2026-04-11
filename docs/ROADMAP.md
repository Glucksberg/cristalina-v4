# Cristalina v4
## Roadmap

**Status:** Active Draft

---

## 1. Roadmap Principle

The roadmap is intentionally front-loaded toward the core.

This is not accidental.

Cristalina v4 will only be as good as its core contracts.

If the core is vague, the adapters will force the architecture into runtime-specific compromises too early.

So the first major phase is not "core mínimo".

It is:

**Phase 1: solid core**

That phase is deliberately deep and internally subdivided.

---

## 2. Phase Overview

### Phase 0. Architectural Foundation

Goal:

- freeze the conceptual architecture before implementation expands

Includes:

- synthesis thesis
- storage model
- core types
- legal transitions
- information flow
- MVP flow
- knowledge-wiki layer
- compatibility posture

Status:

- in progress, substantially established

#### Phase 0H. Contract Hardening

Goal:

- converge the architecture into executable contracts before broad implementation starts

Includes:

- hardening plan
- normalized object envelope
- runtime identity model
- disposition model
- model dependency map
- docs/schema/scaffold convergence
- projection fragment labeling rules

### Phase 1. Solid Core

Goal:

- build the actual memory law and object substrate of the system

This is the heaviest phase.

It should be split into:

#### Phase 1A. Object and Storage Foundation

Includes:

- manifest contract
- store reader/writer
- stable IDs
- storage layout implementation
- serialization and validation of core objects
- runtime-executable schema layer, not TypeScript-only scaffolding
- shared object envelope implementation
- runtime identity object serialization
- disposition record serialization

#### Phase 1B. World and Wiki Foundation

Includes:

- raw source intake
- observation capture
- disposition assignment baseline
- world-claim storage
- entity/relation primitives
- wiki page model
- wiki claim model
- wiki maintenance triggers
- wiki claim extraction
- wiki staleness and unsupported-claim diagnostics

#### Phase 1C. Governance Foundation

Includes:

- proposal engine
- disposition record execution path
- governance gates
- ratification records
- canonical apply path
- supersession path
- contradiction handling baseline

#### Phase 1D. Projection Foundation

Includes:

- adapter-agnostic projection manifest
- projection compiler contract
- bounded diagnostics model
- provenance-preserving projection references
- layer-labeled projection fragments
- identity-aware projection packaging

Phase 1 is complete only when the core can execute an end-to-end flow without any adapter-specific hacks.

### Phase 2. OpenClaw Integration

Goal:

- prove the core against the first runtime adapter

Includes:

- OpenClaw projection surfaces
- OpenClaw ingest path
- drift handling
- runtime diagnostics feedback
- fixture-driven round-trip tests

### Phase 3. Hermes Integration

Goal:

- prove runtime portability against a second agent runtime

Includes:

- Hermes projection surfaces
- Hermes ingest path
- Hermes-specific adapter contract
- runtime-specific constraints and differences
- round-trip tests matching the same core semantics

### Phase 4. Knowledge Wiki Maturity

Goal:

- deepen the editorial synthesis layer until it becomes a genuine advantage

Includes:

- index and log maintenance
- source summary lifecycle
- entity/topic/comparison page maintenance
- wiki linting
- stale-page detection
- proposal emission from wiki claims

### Phase 5. Evaluation and Comparative Pressure

Goal:

- prove that the system is better than simpler store-and-retrieval approaches in meaningful ways

Includes:

- longitudinal evals
- consistency evals
- contradiction behavior evals
- projection fidelity evals
- comparison against retrieval-only baselines

---

## 3. Immediate Next Focus

The immediate focus should remain inside Phase 1.

Specifically:

1. shared object envelope across docs, schemas, and scaffold types
2. runtime identity and storage convergence
3. runtime-executable schema depth comparable to the current Cristalina line
4. disposition record and intake fate baseline
5. store manifest and reader/writer
6. canonical object serializer
7. proposal engine baseline
8. canonical apply path
9. common projection manifest

Only after these are solid should OpenClaw and Hermes adapters become the main implementation surface.

---

## 4. What the Roadmap Intentionally Avoids

The roadmap explicitly avoids:

- adapter-first architecture
- embeddings-first architecture
- graph-first lock-in
- trying to solve humanoid robotics too early
- trying to solve all multi-agent problems in v1

This roadmap is designed to maximize architectural integrity first.

It is also designed to avoid a specific local failure mode:

- documentation racing ahead of executable substrate for too long

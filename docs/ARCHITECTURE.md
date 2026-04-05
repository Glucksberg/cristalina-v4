# Cristalina v4
## Architecture

**Status:** Draft  
**Scope:** Repository architecture for the v4 line

---

## 1. Repository Goal

Cristalina v4 is a new memory system architecture, not a direct continuation of one older codebase.

Its purpose is to combine three strengths into one coherent system:

- a strong runtime self layer
- a strong temporal world model
- a strong governed canonical memory core
- a persistent knowledge-wiki layer for accumulated synthesis and navigation

The repository will therefore be organized around three implementation domains:

- `packages/core`
- `packages/openclaw-adapter`
- `packages/hermes-adapter`

---

## 2. Core Thesis

The system should be built around this architecture:

`raw sources + runtime self + temporal world model + governed canonical memory + persistent knowledge wiki`

That means:

- raw evidence remains recoverable
- runtime context is fluid
- the world model is structured and temporal
- durable truth is governed and ratified
- synthesized knowledge remains readable, navigable, and compounding over time
- adapters project that memory into specific runtimes without letting runtimes become the source of truth

---

## 3. Package Responsibilities

### 3.1 `packages/core`

Owns:

- canonical object model
- memory laws
- proposal generation
- ratification and supersession
- temporal validity model
- projection compiler inputs
- stable IDs and provenance contracts

Does not own:

- runtime-specific markdown contracts
- agent-specific UI
- one particular storage backend for retrieval

### 3.2 `packages/openclaw-adapter`

Owns:

- OpenClaw projection contract
- OpenClaw ingest contract
- bootstrap surfaces for OpenClaw runtimes
- diagnostic feedback back into the runtime

Does not own:

- canonical truth
- governance logic
- global memory schema

### 3.3 `packages/hermes-adapter`

Owns:

- Hermes Agent projection contract
- Hermes Agent ingest contract
- runtime-specific projection surfaces for Hermes
- compatibility layer between Hermes runtime expectations and Cristalina core memory law

Does not own:

- canonical truth
- governance logic
- global memory schema

---

## 4. Layer Model

The implementation should preserve seven layers:

1. Raw Sources
2. Runtime Self
3. Temporal World Model
4. Canonical Memory
5. Governance
6. Knowledge Wiki
7. Derived Projection

These are logical layers, not necessarily package boundaries.

The package split is implementation-oriented.

The layer split is cognition-oriented.

---

## 5. Knowledge Wiki Layer

The architecture should include a persistent LLM-maintained knowledge wiki inspired by the "LLM Wiki" pattern.

This layer is not the canonical core.

It is a durable, accumulated, human-browsable synthesis layer that sits between raw sources and final runtime projections.

Its purpose is to make knowledge compound over time instead of forcing the system to rediscover structure from raw material on every query.

The wiki layer should own:

- entity pages
- concept pages
- topic summaries
- comparative pages
- source summaries
- synthesis pages
- an `index`
- a chronological `log`

The wiki layer should not own:

- ratified truth authority
- final temporal world-state authority
- direct runtime control state

In architectural terms:

- the **world model** is optimized for machine structure
- the **canonical core** is optimized for governed truth
- the **knowledge wiki** is optimized for persistent synthesis and human/agent navigation

This distinction matters because many systems confuse "good accumulated documentation" with "true governed memory".

They are related, but not identical.

## 6. Layer Authority Contrast

| Layer | Primary optimization | Main reader | Truth authority |
|---|---|---|---|
| Raw Sources | evidence fidelity | human and machine | highest evidence authority |
| Temporal World Model | structural and temporal coherence | machine | medium |
| Canonical Memory | governed durable truth | machine and operator | highest memory authority |
| Knowledge Wiki | synthesis, navigation, explanation | human and machine | derived only |
| Derived Projection | runtime usability | runtime | none |

The knowledge wiki may describe canonical memory and world-model state.

It must not silently replace them.

---

## 7. Compatibility Rule

Cristalina v4 must be runtime-portable.

That means:

- `OpenClaw` is a first-class reference runtime
- `Hermes Agent` is a first-class reference runtime
- the core must not become coupled to one adapter's projection format

Adapters may differ in:

- projection shape
- runtime feedback surfaces
- ingest affordances
- context budget strategy

Adapters must not differ in:

- object meaning
- provenance contract
- governance semantics
- canonical truth rules

---

## 8. Implementation Order

Recommended order:

1. define core object contracts
2. define governance contracts
3. define raw source ingestion contracts
4. define knowledge-wiki contracts
5. define read and write paths
6. define projection compiler contract
7. implement OpenClaw adapter
8. implement Hermes adapter

The adapters should be built after the core contracts are stable enough to prevent adapter-first drift.

# Cristalina v4
## Modularization Plan

**Status:** Draft  
**Purpose:** Define how Cristalina v4 should become a modular system that can selectively reuse validated logic from the ancestor projects without collapsing back into a product-level merge

---

## 1. Why This Document Exists

There are two common failure modes in projects like this.

### Failure mode 1

Write beautiful theory that never becomes code naturally.

### Failure mode 2

Start coding too early, let one implementation detail set the architecture, and later discover that the "theory" was never actually encoded in the boundaries of the system.

Cristalina v4 should avoid both.

The correct path is:

1. make the architecture readable
2. divide it into modules with sharp responsibilities
3. identify which modules can reuse existing logic
4. only then implement each module against those contracts

This is how we keep the story elegant and the codebase natural.

---

## 2. Core Modularization Thesis

Cristalina v4 should **not** be built as:

- one large memory engine
- one monolithic package called "core" that secretly does everything
- one retrieval subsystem trying to impersonate all cognition layers

It should be built as a set of modules that correspond to actual cognitive and protocol functions.

The key rule is:

**module boundaries should follow memory law, not convenience of implementation.**

That means the architecture should separate:

- evidence handling
- runtime self
- world structure
- governed memory
- editorial synthesis
- projection
- adapter-specific runtime surfaces
- audit and diagnostics

---

## 3. Reuse Bands

Not all ancestor code should be reused in the same way.

Cristalina v4 should classify ancestor logic into three reuse bands.

### 3.1 Direct reuse candidates

These are pieces whose logic is already close enough to the v4 architecture that they may be transplanted with limited reshaping.

Typical properties:

- small surface area
- strong tests or deterministic behavior
- little coupling to old runtime-specific assumptions
- semantic alignment with v4 contracts

### 3.2 Port-or-translate candidates

These are pieces whose logic is valuable, but whose implementation is too tied to another language, storage model, or product surface to copy directly.

Typical properties:

- good algorithmic or schema ideas
- wrong runtime assumptions
- wrong packaging
- still valuable as a port or rewrite

### 3.3 Concept-only candidates

These are pieces worth inheriting at the architecture level, but not as code.

Typical properties:

- deeply tied to another product
- too broad or too infrastructural
- more valuable as a constraint or pattern than as an implementation fragment

---

## 4. Legal Reuse Baseline

The three inspected ancestor repositories are under Apache-2.0, which means reuse is legally viable provided notices and attribution requirements are respected.

That does **not** mean everything should be copied.

It means the project is free to:

- transplant small modules where appropriate
- port logic into TypeScript or another local implementation language
- keep attribution records for reused fragments

A future implementation pass should preserve a small reuse ledger documenting:

- source repository
- original file path
- reuse band
- whether the result was copied, ported, or only inspired

---

## 5. Candidate Module Map

Cristalina v4 should be thought of as a federation of modules.

### 5.1 `kernel-types`

Purpose:

- stable IDs
- shared enums
- canonical envelopes
- cross-layer references

Owns:

- foundational object shapes
- IDs and references
- common states and axes

Should not own:

- storage
- runtime projections
- business policy

Reuse expectation:

- mostly new, but can inherit ID and object-envelope discipline from current Cristalina

### 5.2 `store-io`

Purpose:

- file layout
- readers and writers
- manifest handling
- serialization boundaries

Owns:

- directory contracts
- file naming conventions
- canonical load/write helpers

Should not own:

- promotion logic
- search logic
- adapter UX

Reuse expectation:

- strong direct reuse candidate from current Cristalina store helpers and path logic

### 5.3 `audit-and-recovery`

Purpose:

- audit logs
- snapshots
- rollback
- change manifests
- diagnostics ledgers

Owns:

- point-in-time snapshots
- restore procedures
- mutation traces

Should not own:

- promotion decisions
- world extraction

Reuse expectation:

- strong direct reuse candidate from current Cristalina audit modules

### 5.4 `runtime-self`

Purpose:

- active runtime state
- always-visible memory blocks
- thread continuity
- active task context

Owns:

- blocks
- threads
- session-local summaries
- attached or detached operational context

Should not own:

- canonical truth
- world authority

Reuse expectation:

- port-or-translate candidate from Letta patterns
- some new local code will be needed because runtime semantics must match v4, not Letta as a product

### 5.5 `source-intake`

Purpose:

- register raw sources
- create observations
- preserve provenance links

Owns:

- source registration
- source normalization
- observation emission

Should not own:

- promotion
- wiki pages
- canonical truth

Reuse expectation:

- mostly new, but some current Cristalina event logic may be reusable

### 5.6 `world-engine`

Purpose:

- entities
- relations
- episodes
- temporal world claims
- contradictions
- ontology

Owns:

- world graph state
- validity windows
- invalidation semantics
- episode anchoring

Should not own:

- ratified memory
- runtime block packaging
- adapter-specific projection shapes

Reuse expectation:

- port-or-translate candidate from Graphiti
- especially around:
  - episode modeling
  - entity/relation structures
  - temporal validity
  - hybrid search configuration

### 5.7 `governance-engine`

Purpose:

- proposals
- curation packets
- ratification plans
- policy evaluation
- contradiction and promotion gates

Owns:

- proposal generation
- proposal typing
- curation scoring
- question generation
- decision normalization
- apply plans

Should not own:

- graph search internals
- runtime projection rendering

Reuse expectation:

- strongest direct reuse area from the current Cristalina

### 5.8 `canon-engine`

Purpose:

- durable memory application
- supersession
- archival transitions
- ratified object persistence

Owns:

- canonical object mutations
- state transitions
- supersession chains
- durable memory authority

Should not own:

- runtime state
- wiki pages
- graph retrieval

Reuse expectation:

- strong direct reuse area from the current Cristalina operations layer

### 5.9 `wiki-engine`

Purpose:

- persistent synthesized pages
- index and log
- page maintenance
- wiki claims that may emit proposals

Owns:

- wiki pages
- page metadata
- revision lineage
- stale-page diagnostics

Should not own:

- canonical promotion by itself
- raw source truth

Reuse expectation:

- mostly new
- informed by Karpathy's LLM Wiki pattern
- may later borrow local maintenance helpers or generation scaffolds

### 5.10 `retrieval-orchestrator`

Purpose:

- assemble context from multiple layers
- control how runtime and adapters retrieve from canon, world, wiki, and raw

Owns:

- retrieval recipes
- hybrid search policy
- query routing across layers

Should not own:

- truth
- promotion

Reuse expectation:

- port-or-translate candidate from Graphiti search orchestration
- must be rewritten to respect v4's layer authority

### 5.11 `projection-engine`

Purpose:

- compile layer outputs into runtime-facing packages
- build projection manifests
- label upstream references

Owns:

- projection assembly
- per-profile packaging
- shared projection metadata

Should not own:

- runtime-specific UX
- canonical mutation

Reuse expectation:

- strong direct reuse candidate from the current Cristalina compiler shape

### 5.12 `adapter-sdk`

Purpose:

- shared adapter interfaces
- common ingest/result contracts
- shared diagnostics shape

Owns:

- adapter-facing abstractions
- base adapter types
- common projection manifest contract

Should not own:

- OpenClaw-specific files
- Hermes-specific files

Reuse expectation:

- mostly new

### 5.13 `openclaw-adapter`

Purpose:

- OpenClaw projections
- OpenClaw ingest
- OpenClaw diagnostics loop

Reuse expectation:

- strong direct reuse candidate from current Cristalina OpenClaw adapter

### 5.14 `hermes-adapter`

Purpose:

- Hermes runtime packaging
- Hermes ingest
- Hermes diagnostics loop

Reuse expectation:

- mostly new

---

## 6. Reuse Matrix

### 6.1 Reusable from current Cristalina

These are the most promising direct-reuse candidates.

| Candidate area | Current source | Reuse band | Why |
|---|---|---|---|
| ID generation | `packages/core/src/id/generator.ts` | direct | small, deterministic, layer-safe |
| store path logic | `packages/core/src/store/paths.ts` | direct | easy to adapt to v4 layout |
| store writer patterns | `packages/core/src/store/writer.ts` | direct | practical file-first persistence scaffolding |
| audit diff/logger | `packages/core/src/audit/*` | direct | aligned with file-first governance |
| rollback/snapshot | `packages/core/src/audit/rollback.ts` | direct | already aligned with audit-first memory |
| proposal creation | `packages/core/src/operations/propose.ts` | direct | close to v4 governance needs |
| canonical ops | `packages/core/src/operations/*` | direct | create/revise/supersede/archive logic is core to v4 |
| curation scoring and packet generation | `packages/core/src/promotion/curation.ts` | direct | valuable governance logic already shaped |
| ratification normalization and apply planning | `packages/core/src/promotion/ratification*.ts` | direct | core memory law logic |
| policy resolver/runtime policy | `packages/core/src/policy/*` | direct | good foundation for v4 governance module |
| projection compiler skeleton | `packages/core/src/compiler/*` | direct or adapted | compile pipeline shape is valuable |
| writeback extraction discipline | `packages/core/src/adapter/writeback.ts` | adapted | strong logic, but must be generalized beyond OpenClaw markdown |
| OpenClaw workspace baseline handling | `packages/openclaw/src/workspace.ts` | adapted | useful for v4 adapter safety |

### 6.2 Reusable from Letta

These are more often port-or-translate candidates.

| Candidate area | Current source | Reuse band | Why |
|---|---|---|---|
| memory block schema | `letta/schemas/block.py` | port/translate | strong model for pinned runtime memory |
| in-context memory rendering logic | `letta/schemas/memory.py` | port/translate | valuable for runtime-self packaging |
| agent file packaging | `letta/schemas/agent_file.py` | port/translate | strong inspiration for portable runtime package |
| agent state schemas | `letta/schemas/agent.py`, related schemas | concept / port | useful, but tied to Letta product surface |

What is especially worth preserving from Letta is not one exact file.

It is the combination of:

- pinned blocks
- editable runtime state
- portable packaged state
- stateful agent continuity

### 6.3 Reusable from Graphiti

These are mostly port-or-translate candidates.

| Candidate area | Current source | Reuse band | Why |
|---|---|---|---|
| node and episode models | `graphiti_core/nodes.py` | port/translate | good temporal entity and episode framing |
| edge models with validity windows | `graphiti_core/edges.py` | port/translate | strong fact invalidation model |
| hybrid search config | `graphiti_core/search/search_config.py` | port/translate | useful retrieval recipe abstraction |
| search recipes | `graphiti_core/search/search_config_recipes.py` | port/translate | valuable for retrieval orchestration layer |
| multi-scope search orchestration | `graphiti_core/search/search.py` | port/translate | useful pattern for layered retrieval execution |
| extraction prompt structure | `graphiti_core/prompts/extract_nodes.py`, `extract_edges.py` | concept / selective port | useful for source-intake and world extraction, but strongly LLM-pipeline-specific |

What is most valuable here is:

- episodes as roots
- edges with `valid_at` and `invalid_at`
- invalidation instead of overwrite
- retrieval as a recipe over multiple signals

---

## 7. What Should Be Built New

Some parts should be intentionally new even if ancestors provide nearby patterns.

These include:

- the exact v4 storage contract
- the exact world/canon/wiki authority boundaries
- the shared adapter SDK
- Hermes integration
- wiki governance rules
- the final projection manifest shared across runtimes
- the final retrieval orchestrator that respects v4 layer law

These are too central to the new architecture to be inherited accidentally.

---

## 8. Recommended Implementation Order by Module

The best sequence is not "write all core code first".

It is:

1. `kernel-types`
2. `store-io`
3. `audit-and-recovery`
4. `governance-engine`
5. `canon-engine`
6. `runtime-self`
7. `world-engine`
8. `wiki-engine`
9. `projection-engine`
10. `adapter-sdk`
11. `openclaw-adapter`
12. `hermes-adapter`
13. `retrieval-orchestrator`

This keeps the project lawful first, then useful, then portable.

---

## 9. Narrative Discipline Rule

The docs should always stay one half-step ahead of implementation, but not ten steps ahead.

That means:

- each major module must be described before implementation starts
- each implemented module should reduce theory debt, not increase it
- new code should visibly map back to one document and one module contract

The purpose of this rule is exactly what motivated this round:

the repository should read like a coherent story, not like an archaeological site.

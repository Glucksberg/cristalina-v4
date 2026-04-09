# Cristalina v4
## Hardening Plan

**Status:** Active Draft  
**Purpose:** Convert the contrast between the current Cristalina lineage and the v4 line into binding hardening work before implementation expands.

---

## 1. Why This Document Exists

Cristalina v4 already has a strong thesis.

What it still needs is hardening.

The current Cristalina repository demonstrates that:

- governed write discipline can be made executable
- proposal normalization and ratification can be made concrete
- projection and writeback law can be implemented without surrendering truth authority

The current v4 line demonstrates that:

- the larger memory problem needs more than governed canon
- runtime self, temporal world state, and editorial synthesis deserve their own layers
- portability across runtimes must be designed before adapters arrive

The hardening task is therefore not "make v4 more complicated".

It is:

- keep the stronger layered architecture of v4
- import only the strongest law-bearing lessons from the current Cristalina
- eliminate semantic ambiguity before implementation makes ambiguity expensive

---

## 2. Contrast Summary

### 2.1 What the current Cristalina is strongest at

- governance and promotion law
- canonical apply paths
- ratification planning
- auditability and rollback
- projection discipline
- writeback safety

In practical terms:

- the current line is law-strong and cosmology-light

### 2.2 What v4 is strongest at

- proper separation of memory layers
- world versus canon distinction
- runtime-portable ambition
- wiki-as-layer instead of wiki-as-accident
- ancestor-aware modularization

In practical terms:

- v4 is cosmology-strong and law-light

### 2.3 The resulting synthesis rule

The current Cristalina should not be treated as the substrate of v4.

It should be treated as the best available ancestor for:

- `governance-engine`
- `canon-engine`
- `audit-and-recovery`
- parts of `projection-engine`
- parts of `openclaw-adapter`

In short:

- the current Cristalina is the best ancestor for **law**
- v4 must remain the repository for **cosmology**

---

## 3. Hardening Goals

The hardening pass should make these things true before real implementation accelerates:

1. the repo has one stable object-envelope story
2. the repo has one stable runtime-identity story
3. the repo has one stable intake-disposition story
4. the wiki has explicit authority boundaries and maintenance obligations
5. projections carry enough metadata to avoid layer confusion in runtimes
6. the implementation order remains law-first rather than retrieval-first or adapter-first

---

## 4. Hardening Workstreams

### 4.1 Kernel Boundary Hardening

Goal:

- make explicit that v4 is not "current Cristalina plus extra layers"

Required outcome:

- the current Cristalina lineage is inherited as a kernel for governance/canon/audit/projection law
- v4 remains the owner of runtime-self, world-engine, wiki-engine, and runtime-portable contracts

### 4.2 Object Envelope Hardening

Goal:

- stop type, schema, and document drift before implementation expands

Required outcome:

- all durable and semi-durable objects share one normalized envelope
- the envelope preserves these axes independently:
  - `kind`
  - `layer`
  - `authoritative_home`
  - `epistemic_state`
  - `governance_state`
  - `temporal_state`
  - `visibility_state`
  - `provenance`

Additional requirement:

- the future validation layer must recover the runtime enforcement depth of the current Cristalina rather than stopping at TypeScript-only interfaces

Why:

- v4 currently has broader type coverage than the old line
- it does not yet have the same runtime contract depth

The target is:

- v4 breadth
- v3 validation discipline

### 4.3 Runtime Identity Hardening

Goal:

- prevent runtime continuity from collapsing into one vague "thread" abstraction

Required outcome:

- the system distinguishes:
  - durable owner or agent identity
  - runtime instance
  - runtime session
  - conversation thread

### 4.4 Intake Disposition Hardening

Goal:

- make every new input end in an explicit fate

Required outcome:

- every intake should terminate in one or more explicit dispositions such as:
  - `evidence_only`
  - `runtime_only`
  - `world_update`
  - `wiki_update`
  - `proposal_for_canon`
  - `queued_review`
  - `diagnostic_only`

Priority note:

- `DispositionRecord` is the first genuinely new bridge concept between the current Cristalina lineage and the larger v4 architecture
- it should be implemented earlier than most other new concepts because it clarifies the fate of information across runtime, world, wiki, and canon

### 4.5 Wiki Hardening

Goal:

- keep the wiki powerful without letting it become shadow canon

Required outcome:

- the wiki is treated as a compounding cache of understanding
- the wiki has explicit maintenance operations:
  - source summarization
  - page refresh
  - claim extraction
  - stale-page detection
  - link linting
  - contradiction surfacing

### 4.6 Projection Provenance Hardening

Goal:

- stop projections from becoming implicit truth sources

Required outcome:

- every projected fragment must expose:
  - `source_layer`
  - `authoritative_home`
  - stable upstream references
  - projection profile and adapter metadata

### 4.7 Sequencing Hardening

Goal:

- stop attractive late-phase ideas from rushing ahead of the kernel

Required outcome:

- retrieval orchestration remains late
- world-engine remains after base object and governance contracts
- adapter work remains after projection contracts stabilize

### 4.8 Execution Pressure Hardening

Goal:

- prevent the repository from becoming architecturally impressive but operationally hollow

Required outcome:

- each new document-level concept must reduce implementation ambiguity
- early code work must target substrate, not presentational richness

Risk being avoided:

- over-documentation without executable substrate
- beautiful editorial surfaces while world and canon remain weak

---

## 5. Recommended Deliverables

The hardening pass should produce at minimum:

1. a binding hardening plan
2. a binding object-envelope document
3. a binding runtime-identity document
4. a binding disposition and consolidation document
5. updated roadmap and decisions
6. updated core scaffold types
7. updated schemas for:
   - object envelope
   - runtime identity
   - disposition record
8. a runtime-validation plan for replacing scaffold interfaces with executable schema enforcement

---

## 6. Acceptance Criteria

Phase-0 hardening should be considered successful only if:

1. a new contributor can explain the difference between `world`, `canon`, and `wiki` without hesitation
2. a new contributor can explain the difference between `agent identity`, `runtime instance`, `session`, and `thread`
3. every MVP flow can name its disposition outcome before canon is mentioned
4. docs, schemas, and scaffold types no longer tell three slightly different stories
5. the current Cristalina is clearly positioned as a source of law-bearing modules rather than as the shape of the new system

---

## 7. Implementation Consequence

The practical build sequence implied by this hardening is:

1. converge docs, schemas, and scaffold types
2. implement store and manifest contracts
3. restore runtime validation depth at the schema layer
4. port the current Cristalina governance and canon kernel carefully
5. implement `DispositionRecord` as the first new bridge primitive
6. then add runtime-self, world, and wiki engines against those contracts
7. then compile projections
8. only then prove adapters

That is the cleanest path to a memory system that is both alive and lawful.

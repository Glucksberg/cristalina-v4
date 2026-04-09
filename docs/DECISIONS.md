# Cristalina v4
## Architectural Decisions

**Status:** Active Draft

---

## 1. Purpose

This document records binding architectural decisions for the v4 line.

It is not a full ADR system yet, but it plays the same role:

- preserve reasoning
- prevent architectural backsliding
- make later implementation easier to evaluate

---

## 2. Binding Decisions

### D-001. The project is a new architecture, not a direct merge

Decision:

- Cristalina v4 will not be built by mechanically combining Cristalina, Letta, and Zep/Graphiti codebases

Reason:

- the older systems optimize for different centers of gravity
- direct merging would preserve historical constraints rather than yield a coherent new memory architecture

### D-002. The core comes before adapters

Decision:

- OpenClaw and Hermes integrations are first-class, but they come after the core contracts stabilize

Reason:

- adapters should prove portability, not define memory law

### D-003. World and canon remain separate

Decision:

- the temporal world model is not identical to canonical memory

Reason:

- a system may operationally benefit from structured world state before something is ready to become governed durable truth

### D-004. The wiki is a first-class layer, but not sovereign

Decision:

- the knowledge wiki is a real architecture layer
- it is not a second canon

Reason:

- editorial synthesis is too valuable to ignore
- but it must not quietly bypass governance

### D-005. One claim, one authoritative home

Decision:

- the same claim may appear in multiple derived surfaces, but only one layer may be authoritative for it

Reason:

- this prevents silent divergence between runtime views, wiki pages, world state, and canon

### D-006. Runtime may not write canon directly

Decision:

- all durable memory promotion must pass through governance

Reason:

- direct runtime-to-canon writes would collapse the architecture into a convenience system instead of a governed memory system

### D-007. The first implementation remains file-first

Decision:

- the initial system will use a file-native layout

Reason:

- inspectability and semantic clarity matter more than storage cleverness at this stage

### D-008. Phase 1 is a solid core, not a toy core

Decision:

- the roadmap will explicitly treat the core as the main engineering effort

Reason:

- this project lives or dies on its memory law and transition logic

### D-009. The current Cristalina line is a kernel ancestor, not the v4 substrate

Decision:

- the current Cristalina should be reused primarily for governance, canon, audit, and projection-law modules
- it should not define the total shape of v4

Reason:

- the current line is strongest at memory law
- v4 is trying to solve a larger layered memory problem than governed canon alone

### D-010. A normalized object envelope comes before module expansion

Decision:

- docs, schemas, and scaffold types must converge on one shared object envelope before deeper implementation expands

Reason:

- semantic drift at the envelope level would infect every later module

### D-011. Durable identity and runtime occurrence remain separate

Decision:

- the architecture must distinguish:
  - durable actor identity
  - runtime instance
  - runtime session
  - conversation thread

Reason:

- cross-runtime continuity will become vague and adapter-fragile if these are flattened too early

### D-012. Every intake ends in an explicit disposition

Decision:

- new information must terminate in an explicit disposition outcome before or instead of canonical promotion

Reason:

- v4 needs to model the full fate of information, not only the subset that reaches canon

### D-013. Projection fragments must declare source layer and authority context

Decision:

- runtime-facing projections must preserve `source_layer`, `authoritative_home`, and stable upstream references for projected fragments

Reason:

- this reduces the risk of projections becoming hidden truth surfaces

### D-014. The wiki is a compounding cache of understanding, not parallel truth storage

Decision:

- the wiki should be treated as a persistent editorial layer with claim extraction, linting, and staleness detection
- it must not become a shadow canon

Reason:

- the wiki is one of v4's strongest advantages and one of its clearest risks

### D-015. Runtime schema enforcement must return before broad implementation

Decision:

- v4 may begin with TypeScript scaffold interfaces
- it must not remain TypeScript-only once phase-1 substrate work begins

Reason:

- the current Cristalina lineage already proved the value of executable runtime validation
- v4 needs that depth back at a larger architectural breadth

### D-016. DispositionRecord is an early bridge primitive, not a late refinement

Decision:

- `DispositionRecord` should be treated as one of the earliest genuinely new v4 primitives to implement

Reason:

- it clarifies how information can terminate in runtime, world, wiki, canon, or diagnostics
- it is the cleanest bridge between the current Cristalina governance lineage and the larger v4 cosmology

---

## 3. When To Update This Document

This document should be updated when a change:

- alters layer ownership
- alters storage authority
- changes promotion logic
- changes adapter contract boundaries
- or changes the project thesis materially

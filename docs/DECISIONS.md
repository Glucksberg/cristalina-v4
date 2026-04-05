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

---

## 3. When To Update This Document

This document should be updated when a change:

- alters layer ownership
- alters storage authority
- changes promotion logic
- changes adapter contract boundaries
- or changes the project thesis materially

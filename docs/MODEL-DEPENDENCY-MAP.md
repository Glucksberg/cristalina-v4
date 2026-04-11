# Cristalina v4
## Model Dependency Map

**Status:** Active Draft  
**Purpose:** Define where Cristalina v4 should rely on model intelligence and where it should instead rely on system structure.

---

## 1. Why This Document Exists

Cristalina v4 is deliberately trying to build a memory architecture, not just a clever prompt workflow.

That means one question has to stay explicit:

**which jobs should depend on model judgment, and which jobs should be removed from the model's discretion entirely?**

If this stays vague, two bad outcomes become likely:

- the system becomes too dependent on a highly capable model to behave coherently
- or the system over-constrains everything and loses the benefits of model interpretation and synthesis

This document defines the intended split.

---

## 2. Core Rule

The model should be strongest where the system needs:

- interpretation
- summarization
- synthesis
- ambiguity handling
- editorial judgment

The system should be strongest where the architecture needs:

- authority
- validation
- routing
- legality of transitions
- persistence
- auditability
- reversibility

In short:

- semantic judgment belongs primarily to the model
- truth boundaries and memory law belong primarily to the system

---

## 3. Subsystem Matrix

| Subsystem | Model responsibility | System responsibility | Failure if misplaced |
|---|---|---|---|
| `raw intake` | summarize, classify, extract useful signals | register, version, preserve provenance and fidelity | sources become memory without traceability |
| `observation capture` | turn raw input into useful observations | validate schema, attach runtime/session/thread refs, persist | observations become noisy or disappear |
| `runtime-self` | maintain operational focus, use pinned memory, adapt to context | define blocks, instance/session/thread boundaries, allowed writeback | runtime convenience becomes hidden truth authority |
| `world update` | infer entities, relations, episodes, and claims | enforce references, temporal structure, contradiction surfaces | world model becomes loose prose or contradictory structure |
| `wiki maintenance` | write pages, syntheses, comparisons, and editorial links | enforce non-sovereignty, preserve upstream refs, lint and stale-page checks | wiki becomes shadow canon |
| `proposal drafting` | draft candidate statements, reasons, and payload seeds | enforce legal operation shapes, target layers, evidence refs, schemas | proposals become eloquent but non-executable |
| `disposition` | help judge likely fate of ambiguous information | record explicit outcomes and legal routing | everything is forced into canon or silently dropped |
| `governance gates` | assist in ambiguous review or prioritization | apply structural, evidence, conflict, policy, and ratification gates | law becomes improvisation |
| `canon apply` | minimal role beyond interpreting approved human input when needed | execute governed operations with audit and lineage | canon becomes narrative mutation |
| `projection assembly` | compress and summarize context for usability | label source layer, authoritative home, and upstream refs | projections become hidden truth surfaces |
| `adapter ingest` | interpret freeform edits and turn them into usable signals | separate structured edits, evidence-only writes, diagnostics, and illegal writes | adapters redefine core semantics |
| `audit and rollback` | no meaningful discretionary role | preserve diffs, snapshots, restore paths, and mutation traces | memory loses reversibility and trust |
| `retrieval orchestration` | semantic ranking and relevance estimation | define recipes, boundaries, budgets, and layer-aware routing | retrieval collapses canon, world, wiki, and runtime into one bucket |

---

## 4. Intended Dependency Levels

### 4.1 High model dependence

These areas should depend strongly on model capability:

- `observation capture`
- `wiki maintenance`
- `proposal drafting`

Reason:

- these tasks are inherently interpretive
- forcing them into rigid deterministic logic too early would usually reduce quality

### 4.2 Medium model dependence

These areas should use model judgment inside stronger structural rails:

- `world update`
- `projection summarization`
- `retrieval ranking`

Reason:

- the model is useful here, but must not define legality, authority, or storage semantics

### 4.3 Low model dependence

These areas should rely primarily on system structure:

- `disposition recording`
- `governance enforcement`
- `canon apply`
- `audit and rollback`
- `storage layout`
- `adapter safety`

Reason:

- mistakes in these areas produce architectural corruption, not merely lower-quality text

---

## 5. Layer Interpretation

### 5.1 `raw`

The model may help interpret raw input.

The system must preserve:

- source fidelity
- traceability
- attachment integrity

### 5.2 `runtime`

The model may actively operate the runtime self.

The system must preserve:

- instance/session/thread distinctions
- pinned memory boundaries
- writeback legality

### 5.3 `world`

The model may help infer and update world structure.

The system must preserve:

- explicit references
- temporal validity
- contradiction handling
- structural coherence

### 5.4 `wiki`

The model should be especially strong here.

The system must preserve:

- editorial status
- upstream traceability
- non-sovereignty
- proposal emission when wiki claims attempt to behave like durable truth

### 5.5 `governance`

The model may assist.

The system must decide.

### 5.6 `canon`

The model should have the weakest discretionary role here.

The system must own:

- legality
- mutation type
- audit trail
- supersession lineage

### 5.7 `derived`

The model may help make projections useful.

The system must keep them clearly downstream and properly labeled.

---

## 6. How To Reduce Model Dependence Without Killing Utility

Cristalina v4 should reduce dependence on model brilliance by moving more responsibility into:

1. explicit `DispositionRecord`
2. executable schemas and runtime validation
3. legal transition checks
4. projection fragment labels
5. machine-safe writeback formats
6. deterministic governance gates
7. explicit identity and runtime-context objects

This keeps the model powerful where it should be powerful while removing it from jobs that should be constitutional.

---

## 7. Design Heuristic

Use this fast rule during implementation:

### If failure here creates false memory

push responsibility into the system

### If failure here creates weak synthesis or awkward wording

allow more responsibility in the model

This is the simplest practical test for deciding where dependency belongs.

---

## 8. Final Rule

Cristalina v4 should not require a genius model just to avoid architectural mistakes.

The ideal target is:

- a strong model produces better synthesis and better editorial judgment
- the system itself prevents the most expensive memory failures

That is the correct dependence profile for a governed memory architecture.

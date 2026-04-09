# Cristalina v4
## MVP Spec

**Status:** Draft

---

## 1. MVP Goal

The first executable version of Cristalina v4 should prove one thing:

**that a single governed memory core can serve more than one runtime without losing semantic integrity.**

The MVP therefore needs:

- one real core
- one real OpenClaw adapter
- one real Hermes adapter
- one real knowledge-wiki layer, even if minimal

---

## 2. MVP Must-Haves

### Core

- stable object envelope
- durable identity distinct from runtime occurrence
- raw source registration
- runtime observations
- explicit input disposition path
- proposal generation
- ratification path
- supersession path
- temporal validity fields
- contradiction handling
- projection compiler inputs
- knowledge-wiki update triggers

### OpenClaw Adapter

- bootstrap projection
- runtime drift ingest
- diagnostic feedback
- stable upstream references in projections
- ability to consume wiki-derived synthesis fragments without confusing them with canon

### Hermes Adapter

- Hermes-facing bootstrap projection
- Hermes-facing ingest contract
- diagnostic feedback contract
- projection surfaces shaped for Hermes runtime expectations
- ability to consume wiki-derived synthesis fragments without confusing them with canon

### Knowledge Wiki

- `index` contract
- `log` contract
- source-summary pages
- entity/concept/topic page update rules
- explicit rule for when wiki maintenance emits proposal candidates

---

## 3. MVP Non-Negotiable Invariants

1. runtime projections are never canonical truth
2. one claim has one authoritative home
3. world-model state is not automatically canonical
4. every promoted memory object preserves provenance
5. every adapter projection must preserve upstream references
6. every input must end in an explicit disposition
7. projection fragments must declare source layer and authority context
8. actor identity, runtime instance, session, and thread must remain distinct
9. failed promotion must produce bounded diagnostics
10. wiki pages are derived and never authoritative by themselves
11. wiki claims that imply durable truth must flow through proposal/governance

---

## 4. MVP Deliverables

- executable `core` package
- executable `openclaw-adapter` package
- executable `hermes-adapter` package
- executable or scriptable wiki-maintenance path
- sample store fixture
- sample raw source fixture
- sample wiki fixture
- projection fixtures for both runtimes
- ingest round-trip tests for both runtimes

---

## 5. Explicitly Deferred

- learned consolidation policies
- advanced graph ranking
- body memory / robotics concerns
- multi-agent canonical governance
- constitutional super-layer above ordinary governance

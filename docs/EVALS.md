# Cristalina v4
## Evaluation Plan

**Status:** Draft

---

## 1. Why Evals Exist This Early

This project is easy to romanticize.

That makes early evaluation design especially important.

The point of this document is to define what success should look like before implementation gets too attached to its own abstractions.

---

## 2. Core Evaluation Questions

### 2.1 Memory Integrity

Can the system preserve a coherent distinction between:

- observation
- world-model state
- wiki synthesis
- canonical truth

### 2.2 Temporal Integrity

Can the system represent change through time without flattening old and new truths into one blob?

### 2.3 Governance Integrity

Can the system prevent illegal promotion into canon?

### 2.4 Projection Integrity

Can the same core memory meaning be projected into different runtimes without semantic drift?

### 2.5 Longitudinal Value

Does the system actually accumulate useful knowledge over time, or just more artifacts?

---

## 3. Initial Eval Categories

- object validity
- legal transition validity
- provenance preservation
- contradiction behavior
- wiki authority discipline
- projection read discipline
- OpenClaw projection fidelity
- Hermes projection fidelity
- end-to-end MVP flow correctness

### Current executable baseline

The current core test harness now covers:

- identity-aware preference intake
- `Observation -> Episode -> WorldClaim`
- derived `Entity` and `Relation`
- contradiction object emission
- contradiction resolution proposal and applied effect
- disposition invariants
- OpenClaw round-trip recompilation
- projection separation of `world`, `wiki`, and `canon`
- temporal closure of losing world claims after applied resolution
- manifest-level audit of read policy, context refs, and structured suppression traces

---

## 4. Comparative Pressure

Cristalina v4 should eventually be tested against simpler baselines such as:

- store-and-retrieval memory systems
- graph-memory systems without strong governance
- wiki-style systems without canonical law

The question is not whether v4 is "more complex".

The question is whether that complexity buys:

- greater coherence
- greater inspectability
- greater temporal integrity
- greater runtime portability

---

## 5. Failure Criteria

The system should be considered underperforming if:

- wiki content quietly becomes canon
- runtime projections become hidden truth sources
- projection suppression becomes silent or unauditable
- world state and canon are frequently indistinguishable
- provenance breaks
- contradictions accumulate without usable handling
- adapters force semantic forks
